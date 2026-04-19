// ── FlowState AI — Global State Store ─────────────────────────────────
import { create } from "zustand";
import {
  Zone,
  Prediction,
  SystemAction,
  ActivityEvent,
  AIReasoning,
  TelemetryData,
  Venue,
  RiskLevel,
  TrendDirection,
} from "../types";
import {
  simulationTick,
  generatePredictions,
  generateReasoning,
  generateAction,
  generateEvent,
  generateTelemetry,
  generateInitialEvents,
  generateInitialActions,
} from "../data/simulation";
import { VENUES } from "../data/venues";

type BackendZoneState = {
  zone_id: string;
  name: string;
  type?: string;
  occupancy_pct: number;
  flow_rate: number;
  queue_depth: number;
  risk_level: string;
  trend: string;
  capacity: number;
  current_count: number;
  adjacent_zones?: string[];
  updated_at?: string;
};

type BackendPrediction = {
  zone_id: string;
  zone_name: string;
  current_pct: number;
  predicted_pct: number;
  confidence: number;
  uncertainty_reason: string;
  risk_trajectory: string;
  minutes_to_critical?: number | null;
};

type BackendDecision = {
  action_type: string;
  target_zone: string;
  instruction: string;
  priority: string;
  expected_impact: string;
};

type BackendReasoningChain = {
  cause: string;
  trend: string;
  prediction: string;
  reasoning: string;
  action: string;
  status: string;
};

type BackendPipeline = {
  run_id: string;
  run_at: string;
  source: string;
  hotspots: string[];
  cascade_zones: string[];
  predictions: BackendPrediction[];
  decisions: BackendDecision[];
  impacts: Array<Record<string, unknown>>;
  communication: {
    attendee_notification: string;
    staff_alert: string;
    signage_message: string;
    narration: string;
    reasoning_chain: BackendReasoningChain;
  };
  confidence_overall: number;
  pipeline_duration_ms: number;
};

type BackendActivity = {
  event_id: string;
  event_type: string;
  message: string;
  zone_id?: string | null;
  severity?: string | null;
  timestamp: string;
  color: string;
};

type BackendSnapshot = {
  zones?: BackendZoneState[];
  pipeline?: BackendPipeline | null;
  activity?: BackendActivity[];
};

// ── Store Interface ───────────────────────────────────────────────────

interface FlowStateStore {
  // Data
  zones: Zone[];
  selectedZoneId: string | null;
  telemetryData: Record<string, TelemetryData>;
  reasoning: AIReasoning;
  predictions: Prediction[];
  actions: SystemAction[];
  activityFeed: ActivityEvent[];

  // Venue
  currentVenueId: string;
  availableVenues: Venue[];
  setVenue: (venueId: string) => void;

  // UI State
  predictionMode: "current" | "predicted";
  aiCycleCountdown: number;
  isSimulating: boolean;
  simulationSecondsRemaining: number;

  // System Health & Transparency (PHASE 1-2)
  systemHealth: "healthy" | "degraded" | "offline";
  pipelineSource: "live" | "cached" | "offline";
  pipelineDurationMs: number;
  lastPipelineRun: string | null;
  lastDataUpdate: Date;
  pipelineFallbackReason: string | null;

  // Editor State
  editMode: boolean;
  tempVenue: Venue | null;
  editorSelectedZoneId: string | null;
  editorPathSource: string | null;
  isAddingPath: boolean;
  backendSyncStatus: "idle" | "connecting" | "live" | "error";

  // Simulation Actions
  selectZone: (id: string | null) => void;
  togglePredictionMode: () => void;
  tick: () => void;
  startSimulation: (scenarioType?: string) => void;
  stopSimulation: () => void;
  startBackendBridge: () => void;
  stopBackendBridge: () => void;

  // Editor Actions
  toggleEditMode: () => void;
  cancelEditing: () => void;
  selectEditorZone: (id: string | null) => void;
  toggleAddingPath: () => void;
  updateZonePosition: (id: string, position: { x: number; y: number }) => void;
  updateZoneData: (id: string, updates: Partial<Zone>) => void;
  addZone: () => void;
  deleteZone: (id: string) => void;
  addPath: (from: string, to: string) => void;
  removePath: (pathId: string) => void;
  saveCustomVenue: (name: string) => void;
  deleteCustomVenue: (id: string) => void;
}

let backendSocket: WebSocket | null = null;
let backendPollHandle: ReturnType<typeof setInterval> | null = null;
let latestBackendSnapshot: BackendSnapshot | null = null;
let backendBridgeStopping = false;
let simulationAutoPauseHandle: ReturnType<typeof setTimeout> | null = null;
let simulationCountdownHandle: ReturnType<typeof setInterval> | null = null;
let simulationUiLocked = false;
let storeSet: any = null;
let storeGet: any = null;
const EDIT_CANVAS_SHIFT_X = 150;
const EDIT_CANVAS_SHIFT_Y = 35;
const STADIUM_ZONE_ID_MAP: Record<string, string> = {
  "gate-a": "gate-a",
  "gate-b": "gate-b",
  "gate-c": "gate-c",
  "gate-d": "gate-d",
  "gate-e": "gate-e",
  "gate-f": "gate-f",
  "north-concourse": "north",
  "south-concourse": "south",
  "east-concourse": "east",
  "west-concourse": "west",
  "field-level": "field",
  "upper-deck": "upper-deck",
};

const BACKEND_ZONE_ID_TO_FRONTEND_ID = Object.entries(
  STADIUM_ZONE_ID_MAP,
).reduce(
  (mapping, [backendId, frontendId]) => {
    mapping[frontendId] = backendId;
    return mapping;
  },
  {} as Record<string, string>,
);

const BACKEND_API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8080"
).replace(/\/$/, "");
const BACKEND_WS_URL = (
  import.meta.env.VITE_WS_URL || BACKEND_API_URL.replace(/^http/, "ws") + "/ws"
).replace(/\/$/, "");

function getBackendZoneId(frontendZoneId: string): string | null {
  return BACKEND_ZONE_ID_TO_FRONTEND_ID[frontendZoneId] ?? null;
}

function mapBackendRiskLevel(riskLevel: string): RiskLevel {
  if (riskLevel === "critical") return "critical";
  if (riskLevel === "high") return "high";
  if (riskLevel === "moderate") return "moderate";
  return "low";
}

function mapBackendTrend(trend: string): TrendDirection {
  if (trend === "rising") return "rising";
  if (trend === "falling") return "falling";
  return "stable";
}

function mapBackendPredictionTrend(
  prediction: BackendPrediction,
): "up" | "down" {
  return prediction.risk_trajectory === "improving" ? "down" : "up";
}

function mapBackendActivityType(
  eventType: string,
  severity?: string | null,
): ActivityEvent["type"] {
  if (severity === "critical") return "critical";
  if (severity === "high") return "warning";
  if (eventType === "resolution") return "success";
  if (eventType === "system") return "info";
  return eventType === "action" ? "info" : "warning";
}

function normalizeConfidencePercent(value: number): number {
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function buildBackendUrl(path: string): string {
  return new URL(path, `${BACKEND_API_URL}/`).toString();
}

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
  } catch (error) {
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

  // ── Select / Deselect Zone ────────────────────────────────────────
  selectZone: (id) => {
    const state = get();

    // Toggle: clicking the same zone closes telemetry
    if (id === state.selectedZoneId) {
      set({ selectedZoneId: null });
      return;
    }

    // Generate telemetry data on first click
    if (id && !state.telemetryData[id]) {
      const zone = state.zones.find((z) => z.id === id);
      if (zone) {
        set({
          selectedZoneId: id,
          telemetryData: {
            ...state.telemetryData,
            [id]: generateTelemetry(zone),
          },
        });
        return;
      }
    }

    set({ selectedZoneId: id });
  },

  // ── Switch Venue ──────────────────────────────────────────────────
  setVenue: (venueId) => {
    // Search availableVenues (includes custom venues saved at runtime)
    const state = get();
    const venue = state.availableVenues.find((v) => v.id === venueId);
    if (!venue) return;
    set({
      currentVenueId: venueId,
      zones: venue.zones,
      selectedZoneId: null,
      telemetryData: {},
      predictionMode: "current",
      predictions: generatePredictions(venue.zones),
      reasoning: generateReasoning(venue.zones),
      aiCycleCountdown: 30,
      // Exit edit mode if switching venue
      editMode: false,
      tempVenue: null,
      editorSelectedZoneId: null,
      editorPathSource: null,
      isAddingPath: false,
    });
    if (venueId === "stadium" && latestBackendSnapshot) {
      applyBackendSnapshot(latestBackendSnapshot);
    }
  },

  // ── Toggle Edit Mode ─────────────────────────────────────────────
  toggleEditMode: () => {
    const state = get();
    if (state.editMode) {
      // Already editing — cancel
      set({
        editMode: false,
        tempVenue: null,
        editorSelectedZoneId: null,
        editorPathSource: null,
        isAddingPath: false,
      });
      return;
    }
    const activeVenue =
      state.availableVenues.find((v) => v.id === state.currentVenueId) ??
      state.availableVenues[0];
    const shouldCenterForEdit = !activeVenue.isCustom;
    // Deep-clone venue; ensure all paths have IDs for deletability
    const zones = activeVenue.zones.map((z) => ({
      ...z,
      position: shouldCenterForEdit
        ? {
            x: Math.max(80, Math.min(1120, z.position.x + EDIT_CANVAS_SHIFT_X)),
            y: Math.max(40, Math.min(580, z.position.y + EDIT_CANVAS_SHIFT_Y)),
          }
        : z.position,
    }));
    const paths = activeVenue.paths.map((p, i) => ({
      ...p,
      id: p.id ?? `path-${Date.now()}-${i}`,
    }));
    set({
      editMode: true,
      tempVenue: { ...activeVenue, zones, paths },
      editorSelectedZoneId: null,
      editorPathSource: null,
      isAddingPath: false,
    });
  },

  // ── Cancel Editing ──────────────────────────────────────────────────
  cancelEditing: () =>
    set({
      editMode: false,
      tempVenue: null,
      editorSelectedZoneId: null,
      editorPathSource: null,
      isAddingPath: false,
    }),

  // ── Select Editor Zone (handles path-creation flow) ─────────────────
  selectEditorZone: (id) => {
    const state = get();
    if (state.isAddingPath) {
      if (id === null) {
        // Background click — cancel path mode
        set({ isAddingPath: false, editorPathSource: null });
      } else if (!state.editorPathSource) {
        // First click: set source zone
        set({ editorPathSource: id });
      } else if (id !== state.editorPathSource) {
        // Second click: create path, exit path mode
        get().addPath(state.editorPathSource, id);
      }
      return;
    }
    set({ editorSelectedZoneId: id });
  },

  // ── Toggle Add-Path Mode ───────────────────────────────────────────
  toggleAddingPath: () => {
    const s = get();
    if (s.isAddingPath) {
      set({ isAddingPath: false, editorPathSource: null });
    } else {
      set({
        isAddingPath: true,
        editorPathSource: null,
        editorSelectedZoneId: null,
      });
    }
  },

  // ── Update Zone Position (on drag end) ─────────────────────────────
  updateZonePosition: (id, position) => {
    const s = get();
    if (!s.tempVenue) return;
    const zones = s.tempVenue.zones.map((z) =>
      z.id === id ? { ...z, position } : z,
    );
    set({ tempVenue: { ...s.tempVenue, zones } });
  },

  // ── Update Zone Data (from ZoneEditPanel) ───────────────────────────
  updateZoneData: (id, updates) => {
    const s = get();
    if (!s.tempVenue) return;
    const zones = s.tempVenue.zones.map((z) =>
      z.id === id ? { ...z, ...updates } : z,
    );
    set({ tempVenue: { ...s.tempVenue, zones } });
  },

  // ── Add Zone (max 12) ───────────────────────────────────────────────
  addZone: () => {
    const s = get();
    if (!s.tempVenue || s.tempVenue.zones.length >= 12) return;
    const idx = s.tempVenue.zones.length;
    // Spread new zones around canvas center to avoid immediate overlap
    const offsets = [
      [0, 0],
      [-160, -80],
      [160, -80],
      [-160, 80],
      [160, 80],
      [0, -120],
      [0, 120],
      [-240, 0],
      [240, 0],
      [-80, -120],
      [80, 120],
      [-240, -80],
    ];
    const [ox, oy] = offsets[idx % offsets.length];
    const newZone: Zone = {
      id: `zone-${Date.now()}`,
      name: `Zone ${idx + 1}`,
      shortName: `Z${idx + 1}`,
      capacity: 50,
      activeVisitors: 500,
      maxCapacity: 1000,
      flowRate: 80,
      trend: "stable",
      riskLevel: "moderate",
      type: "zone",
      importance: 0.5,
      position: {
        x: Math.max(80, Math.min(820, 450 + ox)),
        y: Math.max(40, Math.min(510, 275 + oy)),
      },
    };
    set({
      tempVenue: { ...s.tempVenue, zones: [...s.tempVenue.zones, newZone] },
    });
  },

  // ── Delete Zone + its connected paths ─────────────────────────────────
  deleteZone: (id) => {
    const s = get();
    if (!s.tempVenue) return;
    const zones = s.tempVenue.zones.filter((z) => z.id !== id);
    const paths = s.tempVenue.paths.filter((p) => p.from !== id && p.to !== id);
    set({
      tempVenue: { ...s.tempVenue, zones, paths },
      editorSelectedZoneId:
        s.editorSelectedZoneId === id ? null : s.editorSelectedZoneId,
    });
  },

  // ── Add Path (prevents duplicates) ────────────────────────────────────
  addPath: (from, to) => {
    const s = get();
    if (!s.tempVenue) return;
    // Prevent duplicate in either direction
    const exists = s.tempVenue.paths.some(
      (p) =>
        (p.from === from && p.to === to) || (p.from === to && p.to === from),
    );
    const newPath = { id: `path-${Date.now()}`, from, to };
    set({
      tempVenue: exists
        ? s.tempVenue
        : { ...s.tempVenue, paths: [...s.tempVenue.paths, newPath] },
      editorPathSource: null,
      isAddingPath: false,
    });
  },

  // ── Remove Path by ID ──────────────────────────────────────────────────
  removePath: (pathId) => {
    const s = get();
    if (!s.tempVenue) return;
    const paths = s.tempVenue.paths.filter((p) => p.id !== pathId);
    set({ tempVenue: { ...s.tempVenue, paths } });
  },

  // ── Save Custom Venue ──────────────────────────────────────────────────
  saveCustomVenue: (name) => {
    const s = get();
    if (!s.tempVenue || s.tempVenue.zones.length === 0) return;
    const customCount = s.availableVenues.filter((v) => v.isCustom).length;
    const venueName = name.trim() || `Custom Venue ${customCount + 1}`;
    const venueId = `custom-${Date.now()}`;
    const newVenue: Venue = {
      ...s.tempVenue,
      id: venueId,
      name: venueName,
      layoutType: "custom",
      isCustom: true,
    };
    set({
      availableVenues: [...s.availableVenues, newVenue],
      currentVenueId: venueId,
      zones: newVenue.zones,
      editMode: false,
      tempVenue: null,
      editorSelectedZoneId: null,
      editorPathSource: null,
      isAddingPath: false,
      selectedZoneId: null,
      telemetryData: {},
      predictionMode: "current",
      predictions: generatePredictions(newVenue.zones),
      reasoning: generateReasoning(newVenue.zones),
      aiCycleCountdown: 30,
    });
  },

  // ── Delete Custom Venue ───────────────────────────────────────────────
  deleteCustomVenue: (id) => {
    const s = get();
    const newVenues = s.availableVenues.filter((v) => v.id !== id);
    set({ availableVenues: newVenues });
    // If we deleted the current venue, fallback to the first default venue
    if (s.currentVenueId === id && newVenues.length > 0) {
      get().setVenue(newVenues[0].id);
    }
  },

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
