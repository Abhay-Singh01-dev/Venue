import type {
  ActivityEvent,
  AIReasoning,
  Prediction,
  SystemAction,
  TelemetryData,
  Venue,
  Zone,
} from "../types";

export type BackendZoneState = {
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

export type BackendPrediction = {
  zone_id: string;
  zone_name: string;
  current_pct: number;
  predicted_pct: number;
  confidence: number;
  uncertainty_reason: string;
  risk_trajectory: string;
  minutes_to_critical?: number | null;
};

export type BackendDecision = {
  action_type: string;
  target_zone: string;
  instruction: string;
  priority: string;
  expected_impact: string;
};

export type BackendReasoningChain = {
  cause: string;
  trend: string;
  prediction: string;
  reasoning: string;
  action: string;
  status: string;
};

export type BackendPipeline = {
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

export type BackendActivity = {
  event_id: string;
  event_type: string;
  message: string;
  zone_id?: string | null;
  severity?: string | null;
  timestamp: string;
  color: string;
};

export type BackendSnapshot = {
  zones?: BackendZoneState[];
  pipeline?: BackendPipeline | null;
  activity?: BackendActivity[];
};

export interface FlowStateStore {
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

  // System Health & Transparency
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
