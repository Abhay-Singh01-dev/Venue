"""
FlowState AI FastAPI application entry point.
Configures logging, CORS, routes, WebSocket, and background scheduler.
"""

import logging
import logging.handlers
import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from starlette.websockets import WebSocketState

from app.core.settings import settings
from app.firebase_client import db
from app.websocket.manager import manager
from app.agents.pipeline import run_pipeline
from app.api.routes_zones import router as zones_router
from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_simulation import router as simulation_router
from app.api.routes_system import router as system_router
from app.simulation.simulator import VenueSimulator
import time


def _setup_google_cloud_logging() -> None:
    """Configures Cloud Logging on Cloud Run when SDK is available."""
    if not os.getenv("K_SERVICE"):
        return
    try:
        import google.cloud.logging as gcp_logging

        client = gcp_logging.Client()
        client.setup_logging()
        logging.getLogger(__name__).info("google_cloud_logging_enabled")
    except Exception as exc:
        logging.getLogger(__name__).warning("google_cloud_logging_unavailable: %s", exc)


def setup_logging() -> None:
    """
    Configures structured logging to both console and rotating file.
    File: logs/venueos.log, max 10MB, keeps 3 backups.
    """
    os.makedirs("logs", exist_ok=True)
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    file_handler = logging.handlers.RotatingFileHandler(
        "logs/venueos.log", maxBytes=10_000_000, backupCount=3
    )
    file_handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    _setup_google_cloud_logging()
    
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

_is_simulation_running = False

async def simulation_loop(simulator: VenueSimulator) -> None:
    """
    Background worker loop moving the simulator forward exactly every 5 seconds.
    Tightly bounds blocking Firestore interactions to independent threads.
    """
    global _is_simulation_running
    logger.info({"event": "simulation_loop_start", "component": "main", "interval_seconds": 5})
    
    try:
        from simulation_runner import check_pause_state, check_phase_override, write_heartbeat
    except ImportError:
        logger.warning({"event": "simulation_runner_import_failed", "component": "main", "fallback": "basic_loop"})
        check_pause_state = lambda database: False
        check_phase_override = lambda sim, database: None
        write_heartbeat = lambda database, cc, ps, pause: None

    cycle_count = 0
    while True:
        try:
            if _is_simulation_running:
                await asyncio.sleep(1)
                continue
                
            _is_simulation_running = True
            start_time = time.time()
            
            def run_sync_cycle():
                nonlocal cycle_count
                try:
                    is_paused = check_pause_state(db)
                    check_phase_override(simulator, db)
                    
                    if not is_paused:
                        simulator.run_cycle()
                        
                    cycle_count += 1
                    phase_status = simulator.phase_controller.get_status()
                    
                    if not is_paused and cycle_count % 5 == 0:
                        logger.info(
                            {
                                "event": "simulation_progress",
                                "component": "main",
                                "cycle_count": cycle_count,
                                "phase": phase_status.get("phase_display"),
                                "simulated_minutes": phase_status.get("simulated_minutes"),
                            }
                        )
                        
                    if cycle_count % 2 == 0:
                        write_heartbeat(db, cycle_count, phase_status, is_paused)
                        
                except Exception as e:
                    logger.error(
                        {
                            "event": "simulation_cycle_sync_failed",
                            "component": "main",
                            "error": str(e),
                        },
                        exc_info=True,
                    )

            # Prevent blocking FastAPI thread via asyncio.to_thread
            await asyncio.to_thread(run_sync_cycle)
            
            elapsed = time.time() - start_time
            sleep_time = max(0.0, 5.0 - elapsed)
            
        except Exception as e:
            logger.error({"event": "simulation_loop_failed", "component": "main", "error": str(e)}, exc_info=True)
            sleep_time = 5.0
        finally:
            _is_simulation_running = False
            await asyncio.sleep(sleep_time)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — runs on startup and shutdown."""
    setup_logging()
    logger.info({"event": "app_startup", "component": "main"})
    logger.info({"event": "initial_pipeline_start", "component": "main"})

    async def _run_initial_pipeline_async() -> None:
        try:
            await asyncio.to_thread(run_pipeline)
            logger.info({"event": "initial_pipeline_complete", "component": "main"})
        except Exception as e:
            logger.error({"event": "initial_pipeline_failed", "component": "main", "error": str(e)})

    # Do not block app startup on external AI/database latency.
    asyncio.create_task(_run_initial_pipeline_async())
        
    logger.info({"event": "simulator_init_start", "component": "main"})
    simulator = VenueSimulator()
    try:
        simulator.seed_initial_data()
    except Exception as e:
        logger.error({"event": "simulator_seed_failed", "component": "main", "error": str(e)})
        
    asyncio.create_task(simulation_loop(simulator))
    
    scheduler.add_job(
        run_pipeline,
        "interval",
        seconds=30,
        id="ai_pipeline",
        max_instances=1,  # never overlap
        coalesce=True,
    )
    scheduler.start()
    logger.info({"event": "pipeline_scheduler_started", "component": "main", "interval_seconds": 30})
    
    yield
    
    scheduler.shutdown(wait=False)
    logger.info({"event": "app_shutdown", "component": "main"})


app = FastAPI(
    title="FlowState AI Backend",
    description="Real-time crowd intelligence for sporting venues",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = settings.cors_origins or ["http://localhost:5173"]
allow_credentials = "*" not in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router)
app.include_router(zones_router)
app.include_router(pipeline_router)
app.include_router(simulation_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time dashboard updates.
    On connect: sends efficiently-structured full state snapshot.
    Keeps connection alive via heartbeat monitoring.
    """
    await manager.connect(websocket)
    try:
        zones = []
        pipeline = {}
        
        if db:
            zones_ref = db.collection("zones").stream()
            zones = [doc.to_dict() for doc in zones_ref if doc.to_dict()]
            pipeline_doc = db.collection("pipeline").document("latest").get()
            pipeline = pipeline_doc.to_dict() if pipeline_doc.exists else {}
            
        optimized_pipeline = {}
        if pipeline:
            optimized_pipeline = {
                "run_id": pipeline.get("run_id"),
                "hotspots": pipeline.get("hotspots", []),
                "cascade_zones": pipeline.get("cascade_zones", []),
                "decisions": pipeline.get("decisions", []),
                "communication": pipeline.get("communication", {}),
                "confidence_overall": pipeline.get("confidence_overall", 0),
            }
            
        snapshot_sent = await manager.send_snapshot(websocket, {
            "zones": zones,
            "pipeline": optimized_pipeline,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        })
        if not snapshot_sent:
            return
        
        while True:
            if websocket.client_state != WebSocketState.CONNECTED:
                break
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text('{"type":"pong"}')
            except asyncio.TimeoutError:
                # Expected timeout hit during idle receive, looping to stay alive 
                pass
            except WebSocketDisconnect:
                break
            except RuntimeError as e:
                if "not connected" in str(e).lower():
                    break
                raise
    finally:
        await manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
    )
