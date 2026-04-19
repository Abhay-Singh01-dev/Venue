// ── FlowState AI Simulation Engine ────────────────────────────────────
// Generates realistic mock data and simulates real-time zone changes

import {
  Zone,
  Prediction,
  SystemAction,
  ActivityEvent,
  AIReasoning,
  TelemetryData,
  TelemetryPoint,
  RiskLevel,
} from "../types";

// ── Initial Zone Data ─────────────────────────────────────────────────

export function createInitialZones(): Zone[] {
  return [
    // Gates (on stadium perimeter)
    {
      id: "gate-a",
      name: "Gate A",
      shortName: "GA",
      capacity: 72,
      activeVisitors: 5760,
      maxCapacity: 8000,
      flowRate: 85,
      trend: "stable",
      riskLevel: "moderate",
      position: { x: 188, y: 108 },
      type: "gate",
    },
    {
      id: "gate-b",
      name: "Gate B",
      shortName: "GB",
      capacity: 45,
      activeVisitors: 3600,
      maxCapacity: 8000,
      flowRate: 120,
      trend: "rising",
      riskLevel: "low",
      position: { x: 712, y: 108 },
      type: "gate",
    },
    {
      id: "gate-c",
      name: "Gate C",
      shortName: "GC",
      capacity: 88,
      activeVisitors: 7040,
      maxCapacity: 8000,
      flowRate: 55,
      trend: "rising",
      riskLevel: "critical",
      position: { x: 830, y: 275 },
      type: "gate",
    },
    {
      id: "gate-d",
      name: "Gate D",
      shortName: "GD",
      capacity: 62,
      activeVisitors: 4960,
      maxCapacity: 8000,
      flowRate: 95,
      trend: "falling",
      riskLevel: "moderate",
      position: { x: 712, y: 442 },
      type: "gate",
    },
    {
      id: "gate-e",
      name: "Gate E",
      shortName: "GE",
      capacity: 55,
      activeVisitors: 4400,
      maxCapacity: 8000,
      flowRate: 105,
      trend: "stable",
      riskLevel: "moderate",
      position: { x: 188, y: 442 },
      type: "gate",
    },
    {
      id: "gate-f",
      name: "Gate F",
      shortName: "GF",
      capacity: 38,
      activeVisitors: 3040,
      maxCapacity: 8000,
      flowRate: 130,
      trend: "falling",
      riskLevel: "low",
      position: { x: 70, y: 275 },
      type: "gate",
    },

    // Concourses (ring between middle bands)
    {
      id: "north",
      name: "North Concourse",
      shortName: "North",
      capacity: 78,
      activeVisitors: 7800,
      maxCapacity: 10000,
      flowRate: 70,
      trend: "rising",
      riskLevel: "high",
      position: { x: 450, y: 140 },
      type: "concourse",
    },
    {
      id: "south",
      name: "South Concourse",
      shortName: "South",
      capacity: 91,
      activeVisitors: 9100,
      maxCapacity: 10000,
      flowRate: 40,
      trend: "rising",
      riskLevel: "critical",
      position: { x: 450, y: 410 },
      type: "concourse",
    },
    {
      id: "east",
      name: "East Concourse",
      shortName: "East",
      capacity: 65,
      activeVisitors: 6500,
      maxCapacity: 10000,
      flowRate: 90,
      trend: "stable",
      riskLevel: "moderate",
      position: { x: 680, y: 275 },
      type: "concourse",
    },
    {
      id: "west",
      name: "West Concourse",
      shortName: "West",
      capacity: 52,
      activeVisitors: 5200,
      maxCapacity: 10000,
      flowRate: 100,
      trend: "falling",
      riskLevel: "moderate",
      position: { x: 220, y: 275 },
      type: "concourse",
    },

    // Upper Deck (outer ring) & Field (center)
    {
      id: "upper-deck",
      name: "Upper Deck",
      shortName: "Deck",
      capacity: 58,
      activeVisitors: 8700,
      maxCapacity: 15000,
      flowRate: 75,
      trend: "stable",
      riskLevel: "moderate",
      position: { x: 450, y: 68 },
      type: "deck",
    },
    {
      id: "field",
      name: "Field Level",
      shortName: "Field",
      capacity: 95,
      activeVisitors: 4750,
      maxCapacity: 5000,
      flowRate: 30,
      trend: "rising",
      riskLevel: "critical",
      position: { x: 450, y: 275 },
      type: "field",
    },
  ];
}

// ── Risk Level from Capacity ──────────────────────────────────────────

function computeRiskLevel(capacity: number): RiskLevel {
  if (capacity < 50) return "low";
  if (capacity < 70) return "moderate";
  if (capacity < 85) return "high";
  return "critical";
}

// ── Mean-reversion targets per zone ───────────────────────────────────
// Each zone gravitates toward its "target" capacity with noise, preventing
// all zones from converging to critical over time.
const ZONE_TARGETS: Record<string, number> = {
  // Stadium
  'gate-a': 70, 'gate-b': 42, 'gate-c': 85, 'gate-d': 60,
  'gate-e': 53, 'gate-f': 35,
  north: 76, south: 88, east: 63, west: 50,
  'upper-deck': 56, field: 92,
  // Airport / Mall
  'entrance-a': 65, 'entrance-b': 42,
  'hall-1': 55, 'hall-2': 70, 'hall-3': 40,
  'food-court': 85,
  'exit-a': 35, 'exit-b': 45,
  // Arena
  'tunnel-nw': 40, 'tunnel-ne': 35, 'tunnel-sw': 58, 'tunnel-se': 72,
  'section-north': 63, 'section-east': 78, 'section-south': 55, 'section-west': 45,
  'center-stage': 90,
};

// ── Simulation Tick ───────────────────────────────────────────────────
// Called every ~2 seconds. Uses mean-reverting drift for realistic oscillation.

export function simulationTick(zones: Zone[]): Zone[] {
  return zones.map((zone) => {
    const target = ZONE_TARGETS[zone.id] ?? 60;

    // Mean-reverting drift: pull toward target + random noise
    const pull = (target - zone.capacity) * 0.06; // gentle pull toward target
    const noise = (Math.random() - 0.5) * 4; // random noise ±2
    const drift = pull + noise;
    const newCapacity = Math.max(20, Math.min(99, zone.capacity + drift));
    const riskLevel = computeRiskLevel(newCapacity);

    // Flow rate varies slightly
    const flowDrift = (Math.random() - 0.5) * 10;
    const flowRate = Math.max(15, Math.min(200, zone.flowRate + flowDrift));

    // Trend based on drift
    const trend =
      drift > 0.8
        ? ("rising" as const)
        : drift < -0.8
          ? ("falling" as const)
          : ("stable" as const);

    // Active visitors from capacity
    const activeVisitors = Math.round((zone.maxCapacity * newCapacity) / 100);

    return {
      ...zone,
      capacity: Math.round(newCapacity * 10) / 10,
      riskLevel,
      trend,
      activeVisitors,
      flowRate: Math.round(flowRate),
    };
  });
}

// ── AI Reasoning Generator ────────────────────────────────────────────

export function generateReasoning(zones: Zone[]): AIReasoning {
  const sorted = [...zones].sort((a, b) => b.capacity - a.capacity);
  const worst = sorted[0];
  const second = sorted[1];
  const criticalCount = zones.filter((z) => z.riskLevel === "critical").length;

  // Find a low-capacity zone for redirect suggestions — works across all venue types
  const lowZone =
    [...zones]
      .filter(z =>
        z.type === 'concourse' || z.type === 'gate' ||
        z.type === 'entrance' || z.type === 'exit' || z.type === 'hall'
      )
      .sort((a, b) => a.capacity - b.capacity)[0] ?? zones[zones.length - 1];

  const causes = [
    `${worst.name} at ${Math.round(worst.capacity)}% capacity`,
    `${criticalCount} zone${criticalCount > 1 ? "s" : ""} at critical capacity levels`,
    `High crowd density detected in ${worst.name}`,
  ];

  const trends = [
    `Increasing at +${Math.floor(Math.random() * 5 + 2)}% per minute`,
    `Crowd flow velocity dropping in ${worst.name}`,
    `Density wave propagating toward ${second.name}`,
  ];

  const preds = [
    `Will reach ${Math.min(99, Math.round(worst.capacity + 3 + Math.random() * 5))}% in ${Math.floor(Math.random() * 7 + 3)} minutes`,
    `Risk of crowd compression in ${Math.floor(Math.random() * 5 + 3)} minutes`,
    `Adjacent zones will see +${Math.floor(Math.random() * 10 + 5)}% spillover`,
  ];

  const reasonings = [
    `Overflow from ${second.name} contributing +${Math.floor(Math.random() * 14 + 5)}% load to ${worst.name}`,
    `Halftime crowd movement creating bottleneck at ${worst.name}`,
    `Concession clustering amplifying density in ${worst.name}`,
  ];

  const actions = [
    `Redirect to ${lowZone.name}, open ${zones.filter((z) => z.type === "gate" && z.capacity < 60)[0]?.name || "Gate F"} for overflow`,
    `Deploy crowd management team to ${worst.name}`,
    `Activate digital signage routing near ${worst.name}`,
  ];

  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  return {
    cause: pick(causes),
    trend: pick(trends),
    prediction: pick(preds),
    reasoning: pick(reasonings),
    action: pick(actions),
    status:
      "Congestion stabilizing at Field Level\nExpected drop to 85% in 2 min",
    confidence: Math.floor(Math.random() * 18 + 76),
  };
}

// ── Predictions Generator ─────────────────────────────────────────────

export function generatePredictions(zones: Zone[]): Prediction[] {
  const sorted = [...zones].sort((a, b) => b.capacity - a.capacity);
  return sorted.slice(0, 3).map((z) => ({
    zoneId: z.id,
    zoneName: z.name,
    currentPct: Math.round(z.capacity),
    predictedPct: Math.min(99, Math.round(z.capacity + Math.random() * 4 + 1)),
    timeMinutes: Math.floor(Math.random() * 7 + 3),
    confidence: Math.floor(Math.random() * 14 + 78),
    trend: z.trend === "falling" ? ("down" as const) : ("up" as const),
  }));
}

// ── Activity Event Generator ──────────────────────────────────────────

const EVENT_TEMPLATES: Array<{
  msg: (z: string) => string;
  type: ActivityEvent["type"];
}> = [
  { msg: (z) => `Flow optimization applied: ${z}`, type: "success" },
  { msg: (z) => `Digital signage updated near ${z}`, type: "info" },
  { msg: (z) => `Staff redeployed to ${z}`, type: "info" },
  {
    msg: () =>
      `AI confidence recalibrated: ${Math.floor(Math.random() * 20 + 70)}%`,
    type: "info",
  },
  {
    msg: () => `Predictive model updated with new sensor data`,
    type: "success",
  },
  { msg: (z) => `AI detected surge at ${z}`, type: "warning" },
  {
    msg: (z) =>
      `${z} throughput increased to ${Math.floor(Math.random() * 50 + 60)}/min`,
    type: "success",
  },
  { msg: (z) => `Emergency lane cleared at ${z}`, type: "critical" },
  { msg: (z) => `Crowd density normalized at ${z}`, type: "success" },
  { msg: () => `Sensor array recalibrated across all zones`, type: "info" },
];

export function generateEvent(zones: Zone[]): ActivityEvent {
  const zone = zones[Math.floor(Math.random() * zones.length)];
  const template =
    EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message: template.msg(zone.name),
    timestamp: new Date(),
    type: template.type,
  };
}

// ── System Action Generator ───────────────────────────────────────────

const ACTION_TEMPLATES: Array<{
  type: SystemAction["type"];
  desc: (z: string) => string;
}> = [
  { type: "gate_ops", desc: (z) => `Open auxiliary exit at ${z}` },
  { type: "routing", desc: (z) => `Reroute pedestrian flow from ${z}` },
  { type: "staff", desc: (z) => `Deploy security team to ${z}` },
  { type: "signage", desc: (z) => `Activate overflow signage near ${z}` },
  {
    type: "critical",
    desc: (z) => `Emergency response team on standby at ${z}`,
  },
  { type: "gate_ops", desc: (z) => `Open ${z} for overflow routing` },
  {
    type: "routing",
    desc: (z) => `Redirect crowd from ${z} to lower-density zone`,
  },
  {
    type: "staff",
    desc: (z) => `Staff redeployed from ${z} to high-priority zone`,
  },
];

export function generateAction(zones: Zone[]): SystemAction {
  const zone = zones[Math.floor(Math.random() * zones.length)];
  const template =
    ACTION_TEMPLATES[Math.floor(Math.random() * ACTION_TEMPLATES.length)];
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: template.type,
    description: template.desc(zone.name),
    timestamp: new Date(),
    status: Math.random() > 0.3 ? "active" : "completed",
  };
}

// ── Telemetry History Generator ───────────────────────────────────────
// Generates ~30 minutes of telemetry history for a zone

export function generateTelemetry(zone: Zone): TelemetryData {
  const points: TelemetryPoint[] = [];
  const now = new Date();
  let cap = zone.capacity - 12 + Math.random() * 8;

  for (let i = 30; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60000);
    cap = Math.max(10, Math.min(99, cap + (Math.random() - 0.44) * 3));
    const flowSpeed = 40 + Math.random() * 110;
    const anomaly = cap > 80 ? 0.3 + Math.random() * 0.5 : Math.random() * 0.25;

    points.push({
      time: `${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`,
      capacity: Math.round(cap),
      flowSpeed: Math.round(flowSpeed),
      anomaly: Math.round(anomaly * 100) / 100,
    });
  }

  return { zoneId: zone.id, zoneName: zone.name, points };
}

// ── Generate Initial Activity & Actions ───────────────────────────────

export function generateInitialEvents(zones: Zone[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const template =
      EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    events.push({
      id: `ev-init-${i}`,
      message: template.msg(zone.name),
      timestamp: new Date(now - i * 4000),
      type: template.type,
    });
  }
  return events;
}

export function generateInitialActions(zones: Zone[]): SystemAction[] {
  const actions: SystemAction[] = [];
  const now = Date.now();
  for (let i = 0; i < 4; i++) {
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const template =
      ACTION_TEMPLATES[Math.floor(Math.random() * ACTION_TEMPLATES.length)];
    actions.push({
      id: `act-init-${i}`,
      type: template.type,
      description: template.desc(zone.name),
      timestamp: new Date(now - i * 8000),
      status: i < 2 ? "active" : "completed",
    });
  }
  return actions;
}
