// ── FlowState AI Type Definitions ─────────────────────────────────────

export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type TrendDirection = "rising" | "falling" | "stable";
// Extended ZoneType — supports all venue layouts
export type ZoneType =
  | "gate"
  | "concourse"
  | "field"
  | "deck" // Stadium
  | "entrance"
  | "hall"
  | "food_court"
  | "exit" // Mall / Airport
  | "zone"; // Generic (arena portals etc.)

export interface Zone {
  id: string;
  name: string;
  shortName: string;
  capacity: number; // 0–100 percentage
  activeVisitors: number;
  maxCapacity: number;
  flowRate: number; // people per minute
  trend: TrendDirection;
  riskLevel: RiskLevel;
  position: { x: number; y: number }; // SVG label position
  type: ZoneType;
  importance?: number; // 0–1 — influences particle density and AI priority
  shapeWidth?: number; // Optional editable width for custom editor rendering
  shapeHeight?: number; // Optional editable height for custom editor rendering
}

// Venue path — defines crowd flow connections between zones
export interface VenuePath {
  id?: string; // optional; always set by editor for deletability
  from: string; // zone ID
  to: string; // zone ID
  capacity?: number;
}

// Venue definition — the core adaptable layout model
export interface Venue {
  id: string;
  name: string;
  layoutType: "stadium" | "grid" | "custom";
  zones: Zone[];
  paths: VenuePath[];
  isCustom?: boolean; // true for user-created venues
}

export interface Prediction {
  zoneId: string;
  zoneName: string;
  currentPct: number;
  predictedPct: number;
  timeMinutes: number;
  confidence: number; // 0–100
  trend: "up" | "down";
}

export interface SystemAction {
  id: string;
  type: "routing" | "staff" | "signage" | "critical" | "gate_ops";
  description: string;
  timestamp: Date;
  status: "active" | "completed";
}

export interface ActivityEvent {
  id: string;
  message: string;
  timestamp: Date;
  type: "info" | "warning" | "success" | "critical";
}

export interface AIReasoning {
  cause: string;
  trend: string;
  prediction: string;
  reasoning: string; // NEW: causality explanation
  action: string;
  status: string | null; // NEW: impact feedback, null when not available
  confidence: number;
}

export interface TelemetryPoint {
  time: string;
  capacity: number;
  flowSpeed: number;
  anomaly: number;
}

export interface TelemetryData {
  zoneId: string;
  zoneName: string;
  points: TelemetryPoint[];
}

// ── Color & Style Utilities ───────────────────────────────────────────

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "#10b981";
    case "moderate":
      return "#f59e0b";
    case "high":
      return "#f97316";
    case "critical":
      return "#ef4444";
  }
}

export function getRiskColorDimmed(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "rgba(16,185,129,0.35)";
    case "moderate":
      return "rgba(245,158,11,0.35)";
    case "high":
      return "rgba(249,115,22,0.35)";
    case "critical":
      return "rgba(239,68,68,0.35)";
  }
}

export function getRiskBgClass(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "bg-emerald-500";
    case "moderate":
      return "bg-amber-500";
    case "high":
      return "bg-orange-500";
    case "critical":
      return "bg-red-500";
  }
}

export function getRiskTextClass(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "text-emerald-400";
    case "moderate":
      return "text-amber-400";
    case "high":
      return "text-orange-400";
    case "critical":
      return "text-red-400";
  }
}
