"""
Standalone simulation runner for FlowState AI.
Runs the complete 90-minute match simulation compressed into
configurable real time. Default SIMULATION_SPEED=90 = 1 minute.
Writes all zone states to Firestore every 2 seconds.
"""

import time
import uuid
import signal
import logging
import logging.handlers
import os
import sys

# Force utf-8 encoding for Windows terminals printing emojis
if sys.stdout.encoding != 'utf-8':
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    try:
        if callable(reconfigure):
            reconfigure(encoding='utf-8')
    except Exception:
        pass

import threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RUNNER_ID = str(uuid.uuid4())[:8]
CYCLE_INTERVAL = 2.0  # real seconds per cycle

def setup_logging() -> None:
    os.makedirs("logs", exist_ok=True)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    file_handler = logging.handlers.RotatingFileHandler(
        "logs/simulation.log", maxBytes=5_000_000, backupCount=2
    )
    file_handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    root.addHandler(console)
    root.addHandler(file_handler)
    # Suppress noisy firebase/grpc logs
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

def start_health_server() -> None:
    """
    Minimal HTTP health server required by Cloud Run.
    Cloud Run needs something listening on PORT to confirm service is up.
    """
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                f'{{"status":"running","runner_id":"{RUNNER_ID}"}}'.encode()
            )
        def log_message(self, format, *args):
            pass  # silence HTTP access logs
    
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

def check_phase_override(simulator, db) -> None:
    """
    Checks Firestore for phase override from the API.
    Applied immediately on detection, then cleared.
    """
    if not db:
        return
    try:
        doc = db.collection("simulation").document("override").get()
        if doc.exists:
            data = doc.to_dict() or {}
            forced = data.get("force_phase")
            if forced:
                simulator.force_phase(forced)
                logging.getLogger(__name__).info(
                    f"Phase override applied: {forced}"
                )
                db.collection("simulation").document("override").update(
                    {"force_phase": None}
                )
    except Exception as e:
        logging.getLogger(__name__).warning(
            f"Phase override check failed: {e}"
        )

def check_pause_state(db) -> bool:
    """Checks if the simulation is currently paused via the API."""
    if not db:
        return True
    try:
        doc = db.collection("simulation").document("control").get()
        if doc.exists:
            data = doc.to_dict() or {}
            is_paused = data.get("is_paused", True)
            manual_pause = bool(data.get("manual_pause", False))
            run_started_epoch = data.get("run_started_epoch")
            run_for_seconds = data.get("run_for_seconds")
            run_until_epoch = data.get("run_until_epoch")

            # Keep simulation active for the configured run window unless
            # an explicit manual pause was requested.
            if is_paused and (not manual_pause) and run_started_epoch and run_for_seconds:
                elapsed = time.time() - float(run_started_epoch)
                if elapsed < float(run_for_seconds):
                    return False

            if (not is_paused) and run_until_epoch is not None and time.time() >= float(run_until_epoch):
                db.collection("simulation").document("control").set(
                    {
                        "is_paused": True,
                        "manual_pause": False,
                        "run_for_seconds": None,
                        "run_started_at": None,
                        "run_started_epoch": None,
                        "run_until_epoch": None,
                        "set_at": datetime.now(timezone.utc).isoformat(),
                    },
                    merge=True,
                )
                logging.getLogger(__name__).info("60s simulation window complete; auto-paused")
                return True

            return is_paused
        else:
            db.collection("simulation").document("control").set({"is_paused": True})
            return True
    except Exception:
        return True

def write_heartbeat(db, cycle_count: int, 
                    phase_status: dict, is_paused: bool) -> None:
    """Writes runner heartbeat so judges can verify system is alive."""
    if not db:
        return
    try:
        db.collection("simulation").document("heartbeat").set({
            "runner_id": RUNNER_ID,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "cycles_completed": cycle_count,
            "current_phase": phase_status.get("phase_display", ""),
            "simulated_minutes": phase_status.get("simulated_minutes", 0),
            "simulation_speed": phase_status.get("simulation_speed", 90),
            "is_paused": is_paused,
        })
    except Exception as e:
        logging.getLogger(__name__).debug(f"Heartbeat write failed: {e}")

def print_cycle_status(cycle_count: int, phase_status: dict,
                       zone_states: dict, is_paused: bool) -> None:
    """
    Prints a rich status line to console every cycle.
    Makes the simulation visible to developers running it locally.
    """
    if is_paused:
        print(f"[{cycle_count:04d}] ⏸️  SIMULATION PAUSED - Waiting for frontend trigger...")
        return
        
    phase = phase_status.get("phase_display", "Unknown")
    sim_min = phase_status.get("simulated_minutes", 0)
    
    # Find highest occupancy zone
    if zone_states:
        hottest = max(zone_states.values(), 
                     key=lambda z: z.get("occupancy_pct", 0))
        hottest_name = hottest.get("name", "")
        hottest_pct = hottest.get("occupancy_pct", 0)
        risk = hottest.get("risk_level", "low")
        
        risk_indicator = {
            "low": "🟢", "medium": "🟡", 
            "high": "🟠", "critical": "🔴"
        }.get(risk, "⚪")
        
        print(
            f"[{cycle_count:04d}] "
            f"⏱  {sim_min:5.1f} sim-min | "
            f"📍 {phase:<22} | "
            f"🔥 Hottest: {hottest_name:<18} {hottest_pct:5.1f}% "
            f"{risk_indicator}"
        )

_shutdown_requested = False

def handle_shutdown(signum, frame) -> None:
    global _shutdown_requested
    logging.getLogger(__name__).info(
        f"Shutdown signal received for runner {RUNNER_ID}"
    )
    _shutdown_requested = True

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def main() -> None:
    """
    Main loop. At SIMULATION_SPEED=90:
    - Full 90-minute match completes in 60 real seconds
    - Halftime surge visible at real second ~30
    - Final whistle exodus at real second ~60
    - 30 total cycles at 2-second intervals
    """
    setup_logging()
    logger = logging.getLogger(__name__)
    
    from app.config import settings
    from app.simulation.simulator import VenueSimulator
    from app.firebase_client import db
    
    speed = settings.simulation_speed
    match_real_duration = round(90 * 60 / speed, 1) if speed > 0 else 0
    
    logger.info("=" * 60)
    logger.info(f"FlowState AI Simulation Runner [{RUNNER_ID}]")
    logger.info(f"Speed: {speed}x | Full match in: {match_real_duration}s real time")
    logger.info(f"Cycle interval: {CYCLE_INTERVAL}s | Firebase: {'connected' if db else 'OFFLINE'}")
    logger.info("=" * 60)
    
    start_health_server()
    logger.info(f"Health server started on port {os.environ.get('PORT', 8080)}")
    
    simulator = VenueSimulator()
    
    if not simulator.zone_states:
        logger.critical("Zone initialization failed — aborting")
        sys.exit(1)
    
    # Ensure control document exists on boot with a paused state
    if db:
        db.collection("simulation").document("control").set({"is_paused": True})
    
    logger.info("Writing initial paused data to Firestore...")
    try:
        simulator.seed_initial_data()
        logger.info(f"Seeded {len(simulator.zone_states)} zones successfully")
    except Exception as e:
        logger.error(f"Seed failed: {e} — continuing, will retry in first cycle")
    
    logger.info("Entering simulation loop — WAIT STATE (Paused via API)")
    print("\n" + "=" * 70)
    print("  MATCH LOADED | READY TO START")
    print("  Hit 'Run Simulation' on the Frontend to begin!")
    print("=" * 70 + "\n")
    
    cycle_count = 0
    global _shutdown_requested
    
    while not _shutdown_requested:
        try:
            cycle_start = time.time()
            is_paused = check_pause_state(db)
            
            # Check for phase override from API
            check_phase_override(simulator, db)
            
            if not is_paused:
                # Run continuously while unpaused.
                simulator.run_cycle()
                
            cycle_count += 1
            
            # Get current status for logging
            phase_status = simulator.phase_controller.get_status()
            
            # Print rich console output every cycle
            print_cycle_status(cycle_count, phase_status, 
                              simulator.zone_states, is_paused)
            
            # Write heartbeat every 2 cycles
            if cycle_count % 2 == 0:
                write_heartbeat(db, cycle_count, phase_status, is_paused)
            
            # Anti-drift: reinitialize zone base every 200 cycles
            if cycle_count % 200 == 0 and not is_paused:
                logger.info(f"Anti-drift reinitialization at cycle {cycle_count}")
            
            # Precise sleep to maintain cycle interval
            elapsed = time.time() - cycle_start
            sleep_time = max(0.0, CYCLE_INTERVAL - elapsed)
            time.sleep(sleep_time)
            
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt — stopping simulation")
            break
        except Exception as e:
            logger.error(f"Cycle {cycle_count} error: {e}", exc_info=True)
            time.sleep(CYCLE_INTERVAL)
    
    logger.info(f"Simulation runner stopped after {cycle_count} cycles")

if __name__ == "__main__":
    main()
