// ── FlowState AI — Global State Store ─────────────────────────────────
import { create } from "zustand";
import type { SystemAction } from "../types";
import {
  simulationTick,
  generatePredictions,
  generateReasoning,
  generateAction,
  generateEvent,
  generateInitialEvents,
  generateInitialActions,
} from "../data/simulation";
import { VENUES } from "../data/venues";
import type {
  BackendActivity,
  BackendPipeline,
  BackendSnapshot,
  BackendZoneState,
  FlowStateStore,
} from "./storeTypes";
import {
  BACKEND_WS_URL,
  buildBackendUrl,
  getBackendZoneId,
  mapBackendActivityType,
  mapBackendPredictionTrend,
  mapBackendRiskLevel,
  mapBackendTrend,
  normalizeConfidencePercent,
} from "./backendUtils";
import { createVenueEditorActions } from "./slices/venueEditorActions";

let backendSocket: WebSocket | null = null;
type BrowserIntervalHandle = number;
type BrowserTimeoutHandle = number;

let backendPollHandle: BrowserIntervalHandle | null = null;
let latestBackendSnapshot: BackendSnapshot | null = null;
let backendBridgeStopping = false;
let simulationAutoPauseHandle: BrowserTimeoutHandle | null = null;
let simulationCountdownHandle: BrowserIntervalHandle | null = null;
let simulationUiLocked = false;
type StoreSet = (
  partial:
    | Partial<FlowStateStore>
    | ((state: FlowStateStore) => Partial<FlowStateStore>),
  replace?: boolean,
) => void;
type StoreGet = () => FlowStateStore;

let storeSet: StoreSet | null = null;
let storeGet: StoreGet | null = null;

async function setBackendSimulationControl(
  action: "play" | "pause",
): Promise<void> {
  await fetch(buildBackendUrl(`/simulation/${action}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

async function resetBackendSimulation(): Promise<void> {
  await fetch(buildBackendUrl("/simulation/reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

function clearSimulationCountdown(): void {
  if (simulationCountdownHandle) {
    clearInterval(simulationCountdownHandle);
    simulationCountdownHandle = null;
  }
}

function applyBackendSnapshot(snapshot: BackendSnapshot): void {
  latestBackendSnapshot = snapshot;

  if (!storeSet || !storeGet) {
    return;
  }

  const state = storeGet() as FlowStateStore;
  if (state.currentVenueId !== "stadium" || state.editMode) {
    return;
  }

  const updates: Partial<FlowStateStore> = {
    backendSyncStatus: "live",
    aiCycleCountdown: 30,
    systemHealth: "healthy",
    lastDataUpdate: new Date(),
  };

  if (snapshot.zones && snapshot.zones.length > 0) {
    const backendZoneMap = new Map(
      snapshot.zones.map((zone) => [zone.zone_id, zone] as const),
    );
    updates.zones = state.zones.map((zone) => {
      const backendId = getBackendZoneId(zone.id);
      const backendZone = backendId ? backendZoneMap.get(backendId) : undefined;
      if (!backendZone) {
        return zone;
      }

      return {
        ...zone,
        capacity: Math.round(backendZone.occupancy_pct),
        activeVisitors: backendZone.current_count,
        maxCapacity: backendZone.capacity,
        flowRate: backendZone.flow_rate,
        trend: mapBackendTrend(backendZone.trend),
        riskLevel: mapBackendRiskLevel(backendZone.risk_level),
      };
    });
  }

  if (snapshot.pipeline) {
    const pipeline = snapshot.pipeline;
    updates.pipelineSource = (
      pipeline.source === "cached" ? "cached" : "live"
    ) as "live" | "cached";
    updates.pipelineDurationMs = pipeline.pipeline_duration_ms || 0;
    updates.lastPipelineRun = pipeline.run_at;
    updates.pipelineFallbackReason = null;

    // Set degraded if source is cached
    if (pipeline.source === "cached") {
      updates.systemHealth = "degraded";
    }

    updates.predictions = pipeline.predictions.map((prediction) => ({
      zoneId: getBackendZoneId(prediction.zone_id) ?? prediction.zone_id,
      zoneName: prediction.zone_name,
      currentPct: prediction.current_pct,
      predictedPct: prediction.predicted_pct,
      timeMinutes: 10,
      confidence: normalizeConfidencePercent(prediction.confidence),
      trend: mapBackendPredictionTrend(prediction),
    }));

    updates.actions = pipeline.decisions.map((decision, index) => ({
      id: `${decision.action_type}-${decision.target_zone}-${index}`,
      type: decision.action_type as SystemAction["type"],
      description: decision.instruction,
      timestamp: new Date(pipeline.run_at),
      status: "active",
    }));

    updates.reasoning = {
      cause: pipeline.communication.reasoning_chain.cause,
      trend: pipeline.communication.reasoning_chain.trend,
      prediction: pipeline.communication.reasoning_chain.prediction,
      reasoning: pipeline.communication.reasoning_chain.reasoning,
      action: pipeline.communication.reasoning_chain.action,
      status: pipeline.communication.reasoning_chain.status,
      confidence: normalizeConfidencePercent(pipeline.confidence_overall),
    };

    updates.activityFeed = [
      ...pipeline.impacts.map((impact, index) => ({
        id: `impact-${pipeline.run_id}-${index}`,
        message: String(impact.action_instruction ?? "Action impact recorded"),
        timestamp: new Date(pipeline.run_at),
        type: "success" as const,
      })),
      ...state.activityFeed,
    ].slice(0, 20);
  }

  if (snapshot.activity && snapshot.activity.length > 0) {
    const mappedEvents = snapshot.activity.map((event) => ({
      id: event.event_id,
      message: event.message,
      timestamp: new Date(event.timestamp),
      type: mapBackendActivityType(event.event_type, event.severity),
    }));

    updates.activityFeed = [
      ...mappedEvents,
      ...(updates.activityFeed ?? state.activityFeed),
    ].slice(0, 20);
  }

  storeSet(updates);
}

async function refreshBackendSnapshot(): Promise<void> {
  try {
    const [
      zonesResponse,
      pipelineResponse,
      activityResponse,
      heartbeatResponse,
    ] = await Promise.all([
      fetch(buildBackendUrl("/zones")),
      fetch(buildBackendUrl("/pipeline/latest")),
      fetch(buildBackendUrl("/activity-feed?limit=20")),
      fetch(buildBackendUrl("/simulation/heartbeat")),
    ]);

    const zonesPayload = zonesResponse.ok
      ? ((await zonesResponse.json()) as { zones?: BackendZoneState[] })
      : null;
    const pipelinePayload = pipelineResponse.ok
      ? await pipelineResponse.json()
      : null;
    const activityPayload = activityResponse.ok
      ? ((await activityResponse.json()) as { events?: BackendActivity[] })
      : null;

    const heartbeatPayload = heartbeatResponse.ok
      ? await heartbeatResponse.json()
      : null;

    if (
      heartbeatPayload &&
      typeof heartbeatPayload === "object" &&
      "is_paused" in heartbeatPayload
    ) {
      if (storeSet && !simulationUiLocked) {
        storeSet({ isSimulating: !heartbeatPayload.is_paused });
      }
    }

    applyBackendSnapshot({
      zones: zonesPayload?.zones,
      pipeline:
        pipelinePayload &&
        typeof pipelinePayload === "object" &&
        "run_id" in pipelinePayload
          ? (pipelinePayload as BackendPipeline)
          : null,
      activity: activityPayload?.events,
    });
  } catch {
    if (storeSet) {
      storeSet({ backendSyncStatus: "error", systemHealth: "offline" });
    }
  }
}

// ── Store ─────────────────────────────────────────────────────────────

const initialVenue = VENUES[0];
const initialZones = initialVenue.zones;

export const useStore = create<FlowStateStore>((set, get) => ({
  ...(() => {
    storeSet = set;
    storeGet = get;
    return {};
  })(),
  zones: initialZones,
  selectedZoneId: null,
  telemetryData: {},
  reasoning: generateReasoning(initialZones),
  predictions: generatePredictions(initialZones),
  actions: generateInitialActions(initialZones),
  activityFeed: generateInitialEvents(initialZones),
  predictionMode: "current",
  aiCycleCountdown: 30,
  isSimulating: false,
  simulationSecondsRemaining: 0,

  // System Health & Transparency (PHASE 1-2)
  systemHealth: "offline" as const,
  pipelineSource: "offline" as const,
  pipelineDurationMs: 0,
  lastPipelineRun: null,
  lastDataUpdate: new Date(),
  pipelineFallbackReason: null,

  currentVenueId: initialVenue.id,
  availableVenues: VENUES,
  editMode: false,
  tempVenue: null,
  editorSelectedZoneId: null,
  editorPathSource: null,
  isAddingPath: false,
  backendSyncStatus: "idle",

  ...createVenueEditorActions(set, get, {
    applyLatestBackendSnapshot: () => {
      if (latestBackendSnapshot) {
        applyBackendSnapshot(latestBackendSnapshot);
      }
    },
  }),

  // ── Toggle Prediction Mode ────────────────────────────────────────
  togglePredictionMode: () =>
    set((s) => ({
      predictionMode: s.predictionMode === "current" ? "predicted" : "current",
    })),

  // ── Simulation Tick (called every ~2s) ────────────────────────────
  tick: () =>
    set((state) => {
      if (
        state.currentVenueId === "stadium" &&
        state.backendSyncStatus === "live"
      ) {
        return state;
      }

      const newZones = simulationTick(state.zones);
      const countdown = state.aiCycleCountdown - 1;
      const shouldRefreshAI = countdown <= 0;

      // Occasionally add events (~30% chance per tick ≈ every 6–7s)
      const shouldAddEvent = Math.random() < 0.3;
      // Occasionally add actions (~12% chance per tick ≈ every 16–17s)
      const shouldAddAction = Math.random() < 0.12;

      // Update telemetry for the selected zone
      let telemetryData = state.telemetryData;
      if (state.selectedZoneId) {
        const zone = newZones.find((z) => z.id === state.selectedZoneId);
        const existing = state.telemetryData[state.selectedZoneId];
        if (zone && existing) {
          const now = new Date();
          const newPoint = {
            time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
            capacity: Math.round(zone.capacity),
            flowSpeed: zone.flowRate,
            anomaly:
              Math.round(
                (zone.capacity > 80
                  ? 0.5 + Math.random() * 0.3
                  : Math.random() * 0.25) * 100,
              ) / 100,
          };
          telemetryData = {
            ...state.telemetryData,
            [state.selectedZoneId]: {
              ...existing,
              points: [...existing.points.slice(-29), newPoint],
            },
          };
        }
      }

      return {
        zones: newZones,
        aiCycleCountdown: shouldRefreshAI ? 30 : countdown,
        reasoning: shouldRefreshAI
          ? generateReasoning(newZones)
          : state.reasoning,
        predictions: shouldRefreshAI
          ? generatePredictions(newZones)
          : state.predictions,
        activityFeed: shouldAddEvent
          ? [generateEvent(newZones), ...state.activityFeed].slice(0, 20)
          : state.activityFeed,
        actions: shouldAddAction
          ? [generateAction(newZones), ...state.actions].slice(0, 8)
          : state.actions,
        telemetryData,
      };
    }),

  // ── Start / Stop Simulation ───────────────────────────────────────
  startSimulation: (scenarioType?: string) => {
    if (get().isSimulating) return;

    if (get().currentVenueId === "stadium") {
      simulationUiLocked = true;
      clearSimulationCountdown();
      set({ isSimulating: true });
      set({ simulationSecondsRemaining: 60 });

      if (simulationAutoPauseHandle) {
        clearTimeout(simulationAutoPauseHandle);
        simulationAutoPauseHandle = null;
      }

      void (async () => {
        try {
          if (scenarioType && scenarioType !== "normal") {
            const phaseMap: Record<string, string> = {
              congestion: "first_half",
              halftime: "halftime",
              emergency: "final_whistle",
            };
            const backendPhase = phaseMap[scenarioType];
            if (backendPhase) {
              await fetch(buildBackendUrl("/simulation/phase"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phase: backendPhase }),
              });
            } else {
              await resetBackendSimulation();
            }
          } else {
            await resetBackendSimulation();
          }
          await setBackendSimulationControl("play");
          await refreshBackendSnapshot();

          if (typeof window !== "undefined") {
            simulationCountdownHandle = window.setInterval(() => {
              const secondsRemaining =
                useStore.getState().simulationSecondsRemaining;
              if (secondsRemaining <= 1) {
                clearSimulationCountdown();
                return;
              }
              set({ simulationSecondsRemaining: secondsRemaining - 1 });
            }, 1000);

            simulationAutoPauseHandle = window.setTimeout(() => {
              simulationAutoPauseHandle = null;
              simulationUiLocked = false;
              clearSimulationCountdown();
              set({ simulationSecondsRemaining: 0 });
              void (async () => {
                try {
                  await setBackendSimulationControl("pause");
                  await refreshBackendSnapshot();
                } finally {
                  set({ isSimulating: false });
                }
              })();
            }, 60000);
          } else {
            simulationUiLocked = false;
            clearSimulationCountdown();
            set({ simulationSecondsRemaining: 0 });
            set({ isSimulating: false });
          }
        } catch {
          simulationUiLocked = false;
          clearSimulationCountdown();
          set({ simulationSecondsRemaining: 0 });
          set({ isSimulating: false, backendSyncStatus: "error" });
        }
      })();
    } else {
      get().tick();
      set({ isSimulating: false });
    }
  },

  stopSimulation: () => {
    if (!get().isSimulating) return;

    if (simulationAutoPauseHandle) {
      clearTimeout(simulationAutoPauseHandle);
      simulationAutoPauseHandle = null;
    }
    clearSimulationCountdown();
    simulationUiLocked = false;

    if (get().currentVenueId === "stadium") {
      set({ isSimulating: false, simulationSecondsRemaining: 0 });

      void (async () => {
        try {
          await setBackendSimulationControl("pause");
        } catch {
          // Keep it synced with error state
          set({ backendSyncStatus: "error" });
        }
      })();
    }
  },

  startBackendBridge: () => {
    backendBridgeStopping = false;

    if (backendSocket || backendPollHandle) {
      return;
    }

    set({ backendSyncStatus: "connecting" });

    if (typeof window === "undefined") {
      return;
    }

    void refreshBackendSnapshot();

    try {
      backendSocket = new WebSocket(BACKEND_WS_URL);
      const socket = backendSocket;

      backendSocket.onopen = () => {
        if (backendBridgeStopping) {
          socket.close();
          return;
        }
        if (storeSet) {
          storeSet({ backendSyncStatus: "live" });
        }
      };
      backendSocket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            zones?: BackendZoneState[];
            pipeline?: BackendPipeline | null;
            activity?: BackendActivity[];
          };

          if (
            payload.type === "zones_update" ||
            payload.type === "pipeline_update" ||
            payload.type === "snapshot"
          ) {
            applyBackendSnapshot({
              zones: payload.zones,
              pipeline: payload.pipeline ?? null,
              activity: payload.activity,
            });
          }
        } catch {
          // Ignore malformed websocket payloads and keep the last good snapshot.
        }
      };
      backendSocket.onerror = () => {
        if (!backendBridgeStopping && storeSet) {
          storeSet({ backendSyncStatus: "error" });
        }
      };
      backendSocket.onclose = () => {
        backendSocket = null;
        if (!backendBridgeStopping && backendPollHandle === null && storeSet) {
          storeSet({ backendSyncStatus: "error" });
        }
      };
    } catch {
      set({ backendSyncStatus: "error" });
    }

    backendPollHandle = window.setInterval(() => {
      void refreshBackendSnapshot();
    }, 2000);
  },

  stopBackendBridge: () => {
    backendBridgeStopping = true;

    if (backendSocket) {
      const socket = backendSocket;
      // Remove handlers first so an intentional shutdown does not trigger
      // extra state updates during strict-mode mount/unmount cycles.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      // Closing a CONNECTING socket can emit a noisy browser warning.
      // Let it settle naturally once handlers are detached.
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      backendSocket = null;
    }

    if (backendPollHandle) {
      clearInterval(backendPollHandle);
      backendPollHandle = null;
    }

    clearSimulationCountdown();
    set({ backendSyncStatus: "idle", simulationSecondsRemaining: 0 });
  },
}));
