import type { ActivityEvent, RiskLevel, TrendDirection } from "../types";
import type { BackendPrediction } from "./storeTypes";

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

export const BACKEND_WS_URL = (
  import.meta.env.VITE_WS_URL || BACKEND_API_URL.replace(/^http/, "ws") + "/ws"
).replace(/\/$/, "");

export function buildBackendUrl(path: string): string {
  return new URL(path, `${BACKEND_API_URL}/`).toString();
}

export function getBackendZoneId(frontendZoneId: string): string | null {
  return BACKEND_ZONE_ID_TO_FRONTEND_ID[frontendZoneId] ?? null;
}

export function mapBackendRiskLevel(riskLevel: string): RiskLevel {
  if (riskLevel === "critical") return "critical";
  if (riskLevel === "high") return "high";
  if (riskLevel === "moderate") return "moderate";
  return "low";
}

export function mapBackendTrend(trend: string): TrendDirection {
  if (trend === "rising") return "rising";
  if (trend === "falling") return "falling";
  return "stable";
}

export function mapBackendPredictionTrend(
  prediction: BackendPrediction,
): "up" | "down" {
  return prediction.risk_trajectory === "improving" ? "down" : "up";
}

export function mapBackendActivityType(
  eventType: string,
  severity?: string | null,
): ActivityEvent["type"] {
  if (severity === "critical") return "critical";
  if (severity === "high") return "warning";
  if (eventType === "resolution") return "success";
  if (eventType === "system") return "info";
  return eventType === "action" ? "info" : "warning";
}

export function normalizeConfidencePercent(value: number): number {
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
