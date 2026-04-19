// ── Stadium SVG — Digital Twin Core Visualization ─────────────────────
// Renders the stadium oval with 12 zones, gradient fills, glow effects,
// and subtle breathing glow on critical zones.

import { useMemo } from "react";
import { Zone, getRiskColor } from "../../types";

// ── SVG Constants ─────────────────────────────────────────────────────
const CX = 450,
  CY = 275;
const DEG = Math.PI / 180;

// Ellipse rings (outer → inner)
const OUTER = { rx: 370, ry: 215 }; // stadium boundary
const MID_OUT = { rx: 295, ry: 172 }; // upper deck / concourse border
const MID_IN = { rx: 210, ry: 122 }; // concourse / field area border
const FIELD = { rx: 130, ry: 75 }; // field boundary

// Gate positions (angle in degrees on outer ellipse)
const GATE_ANGLES: Record<string, number> = {
  "gate-a": -135,
  "gate-b": -45,
  "gate-c": 0,
  "gate-d": 45,
  "gate-e": 135,
  "gate-f": 180,
};

// Concourse angle ranges
const CONCOURSE_ANGLES: Record<string, [number, number]> = {
  north: [-125, -55],
  east: [-35, 35],
  south: [55, 125],
  west: [145, 215],
};

// ── SVG Path Helpers ──────────────────────────────────────────────────

function ep(rx: number, ry: number, deg: number) {
  const a = deg * DEG;
  return { x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a) };
}

/** Full donut ring using even-odd fill rule */
function fullRingPath(outer: typeof OUTER, inner: typeof MID_OUT): string {
  return [
    `M ${CX - outer.rx} ${CY}`,
    `A ${outer.rx} ${outer.ry} 0 0 1 ${CX + outer.rx} ${CY}`,
    `A ${outer.rx} ${outer.ry} 0 0 1 ${CX - outer.rx} ${CY}`,
    `M ${CX - inner.rx} ${CY}`,
    `A ${inner.rx} ${inner.ry} 0 0 0 ${CX + inner.rx} ${CY}`,
    `A ${inner.rx} ${inner.ry} 0 0 0 ${CX - inner.rx} ${CY}`,
    "Z",
  ].join(" ");
}

/** Ring segment between two ellipses, from startDeg to endDeg */
function ringSegmentPath(
  outerRx: number,
  outerRy: number,
  innerRx: number,
  innerRy: number,
  startDeg: number,
  endDeg: number,
): string {
  const os = ep(outerRx, outerRy, startDeg);
  const oe = ep(outerRx, outerRy, endDeg);
  const is_ = ep(innerRx, innerRy, startDeg);
  const ie = ep(innerRx, innerRy, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;

  return [
    `M ${os.x} ${os.y}`,
    `A ${outerRx} ${outerRy} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${ie.x} ${ie.y}`,
    `A ${innerRx} ${innerRy} 0 ${large} 0 ${is_.x} ${is_.y}`,
    "Z",
  ].join(" ");
}

/** Full ellipse path */
function ellipsePath(rx: number, ry: number): string {
  return [
    `M ${CX - rx} ${CY}`,
    `A ${rx} ${ry} 0 0 1 ${CX + rx} ${CY}`,
    `A ${rx} ${ry} 0 0 1 ${CX - rx} ${CY}`,
    "Z",
  ].join(" ");
}

// ── Zone Path Map ─────────────────────────────────────────────────────

function getZonePath(zoneId: string): string | null {
  if (zoneId === "upper-deck") return fullRingPath(OUTER, MID_OUT);
  if (zoneId === "field") return ellipsePath(FIELD.rx, FIELD.ry);
  if (zoneId in CONCOURSE_ANGLES) {
    const [s, e] = CONCOURSE_ANGLES[zoneId];
    return ringSegmentPath(MID_OUT.rx, MID_OUT.ry, MID_IN.rx, MID_IN.ry, s, e);
  }
  return null; // gates use circles
}

// ── Component ─────────────────────────────────────────────────────────

interface StadiumSVGProps {
  zones: Zone[];
  selectedZoneId: string | null;
  predictionMode: "current" | "predicted";
  predictions: Array<{ zoneId: string; predictedPct: number }>;
  onZoneClick: (zoneId: string) => void;
  onZoneHover: (zone: Zone | null, e?: React.MouseEvent) => void;
}

export function StadiumSVG({
  zones,
  selectedZoneId,
  predictionMode,
  predictions,
  onZoneClick,
  onZoneHover,
}: StadiumSVGProps) {
  // Build zone lookup
  const zoneMap = useMemo(() => {
    const m: Record<string, Zone> = {};
    zones.forEach((z) => {
      m[z.id] = z;
    });
    return m;
  }, [zones]);

  // Prediction lookup
  const predMap = useMemo(() => {
    const m: Record<string, number> = {};
    predictions.forEach((p) => {
      m[p.zoneId] = p.predictedPct;
    });
    return m;
  }, [predictions]);

  const handleZoneKeyDown = (
    e: React.KeyboardEvent<SVGPathElement | SVGCircleElement>,
    zoneId: string,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onZoneClick(zoneId);
    }
  };

  return (
    <svg viewBox="0 0 900 550" className="w-full h-full">
      <defs>
        {/* Soft glow filter — intensity varies by usage */}
        <filter
          id="zone-glow-soft"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Grid pattern background */}
        <pattern
          id="grid-bg"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="rgba(255,255,255,0.025)"
            strokeWidth="0.5"
          />
        </pattern>

        {/* Radial background glow */}
        <radialGradient id="bg-radial" cx="50%" cy="50%" r="45%">
          <stop offset="0%" stopColor="rgba(6,182,212,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        <filter
          id="critical-ring-glow"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background depth */}
      <rect width="900" height="550" fill="url(#grid-bg)" />
      <rect width="900" height="550" fill="url(#bg-radial)" />

      {/* Stadium boundary outline */}
      <ellipse
        cx={CX}
        cy={CY}
        rx={OUTER.rx + 5}
        ry={OUTER.ry + 5}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth="1"
      />

      {/* ── Upper Deck Zone ──────────────────────────────────── */}
      {renderZonePath("upper-deck")}

      {/* ── Concourse Zones ──────────────────────────────────── */}
      {["north", "east", "south", "west"].map((id) => renderZonePath(id))}

      {/* ── Ring borders (visual separation) ─────────────────── */}
      <ellipse
        cx={CX}
        cy={CY}
        rx={MID_OUT.rx}
        ry={MID_OUT.ry}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.75"
      />
      <ellipse
        cx={CX}
        cy={CY}
        rx={MID_IN.rx}
        ry={MID_IN.ry}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.75"
      />

      {/* Concourse divider lines */}
      {Object.values(CONCOURSE_ANGLES).map(([s, e], i) => {
        const ps = ep(MID_OUT.rx, MID_OUT.ry, s);
        const pe = ep(MID_IN.rx, MID_IN.ry, s);
        const ps2 = ep(MID_OUT.rx, MID_OUT.ry, e);
        const pe2 = ep(MID_IN.rx, MID_IN.ry, e);
        return (
          <g key={i}>
            <line
              x1={ps.x}
              y1={ps.y}
              x2={pe.x}
              y2={pe.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
            <line
              x1={ps2.x}
              y1={ps2.y}
              x2={pe2.x}
              y2={pe2.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
          </g>
        );
      })}

      {/* ── Field Level Zone ─────────────────────────────────── */}
      {renderZonePath("field")}
      {zoneMap.field?.riskLevel === "critical" && (
        <g className="pointer-events-none">
          <ellipse
            cx={CX}
            cy={CY}
            rx={138}
            ry={80}
            fill="none"
            stroke="rgba(239, 68, 68, 0.45)"
            strokeWidth="1"
            filter="url(#critical-ring-glow)"
            opacity="0.4"
          >
            <animate
              attributeName="rx"
              values="138;142;138"
              dur="5.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="ry"
              values="80;83;80"
              dur="5.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.32;0.5;0.32"
              dur="5.2s"
              repeatCount="indefinite"
            />
          </ellipse>
        </g>
      )}

      {/* ── Gate Zones (circles on perimeter) ────────────────── */}
      {Object.entries(GATE_ANGLES).map(([gateId, angle]) => {
        const zone = zoneMap[gateId];
        if (!zone) return null;
        const pos = ep(OUTER.rx - 8, OUTER.ry - 8, angle);
        const color = getRiskColor(zone.riskLevel);
        const isSelected = selectedZoneId === gateId;
        const fillTheme = {
          low: "rgba(16, 185, 129, 0.25)",
          moderate: "rgba(245, 158, 11, 0.25)",
          high: "rgba(249, 115, 22, 0.25)",
          critical: "rgba(239, 68, 68, 0.35)",
        }[zone.riskLevel];

        return (
          <g key={gateId}>
            {/* Gate circle — clean, crisp, no backgrounds */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={11}
              fill={fillTheme}
              stroke={isSelected ? "#fff" : color}
              strokeWidth={isSelected ? 1.5 : 1}
              className="zone-path cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${zone.name} zone, ${Math.round(zone.capacity)} percent occupancy, risk ${zone.riskLevel}`}
              onClick={(e) => {
                e.stopPropagation();
                onZoneClick(gateId);
              }}
              onKeyDown={(e) => handleZoneKeyDown(e, gateId)}
              onMouseEnter={(e) => onZoneHover(zone, e)}
              onMouseLeave={() => onZoneHover(null)}
              onFocus={() => onZoneHover(zone)}
              onBlur={() => onZoneHover(null)}
            />
            {/* Gate label matching stroke color */}
            <text
              x={pos.x}
              y={pos.y - 18}
              textAnchor="middle"
              className="text-[9px] font-bold select-none pointer-events-none"
              fill={color}
            >
              {zone.shortName}
            </text>
            <text
              x={pos.x}
              y={pos.y + 22}
              textAnchor="middle"
              className="text-[8px] font-bold select-none pointer-events-none"
              fill={color}
            >
              {Math.round(zone.capacity)}%
            </text>
          </g>
        );
      })}

      {/* ── Zone Labels ──────────────────────────────────────── */}
      {zones
        .filter((z) => z.type !== "gate")
        .map((zone) => {
          const color = getRiskColor(zone.riskLevel);
          return (
            <g
              key={`label-${zone.id}`}
              className="pointer-events-none select-none"
            >
              <text
                x={zone.position.x}
                y={zone.position.y - 4}
                textAnchor="middle"
                className="text-[10px] font-bold"
                fill={color}
              >
                {zone.shortName}
              </text>
              <text
                x={zone.position.x}
                y={zone.position.y + 8}
                textAnchor="middle"
                className="text-[9px] font-bold tabular-nums"
                fill={color}
              >
                {Math.round(zone.capacity)}%
              </text>
            </g>
          );
        })}

      {/* ── Prediction Overlay ───────────────────────────────── */}
      {predictionMode === "predicted" &&
        predictions.map((pred) => {
          const zone = zoneMap[pred.zoneId];
          if (!zone) return null;
          const path = getZonePath(pred.zoneId);
          if (!path) return null;
          const level =
            pred.predictedPct >= 85
              ? "#ef4444"
              : pred.predictedPct >= 70
                ? "#f97316"
                : "#f59e0b";

          return (
            <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
              <path
                d={path}
                fill={level}
                opacity={0.18}
                fillRule={pred.zoneId === "upper-deck" ? "evenodd" : undefined}
                strokeDasharray="4 3"
                stroke={level}
                strokeWidth="1"
                strokeOpacity={0.4}
                style={{ transition: "all 0.8s ease" }}
              />
              <text
                x={zone.position.x}
                y={zone.position.y + 22}
                textAnchor="middle"
                className="text-[8px] font-bold"
                fill={level}
                opacity={0.7}
              >
                → {pred.predictedPct}%
              </text>
            </g>
          );
        })}
    </svg>
  );

  // ── Render helper for path-based zones ──────────────────────────────
  function renderZonePath(zoneId: string) {
    const zone = zoneMap[zoneId];
    if (!zone) return null;
    const path = getZonePath(zoneId);
    if (!path) return null;
    const isSelected = selectedZoneId === zoneId;
    const fillRule = zoneId === "upper-deck" ? ("evenodd" as const) : undefined;

    const outColor = getRiskColor(zone.riskLevel);
    const fillTheme = {
      low: "rgba(16, 185, 129, 0.25)",
      moderate: "rgba(245, 158, 11, 0.25)",
      high: "rgba(249, 115, 22, 0.25)",
      critical: "rgba(239, 68, 68, 0.35)",
    }[zone.riskLevel];

    return (
      <g key={zoneId}>
        {/* Main zone shape — clean flat fill with solid border */}
        <path
          d={path}
          fillRule={fillRule}
          fill={fillTheme}
          stroke={isSelected ? "#fff" : outColor}
          strokeWidth={isSelected ? 1.5 : 1}
          className="zone-path cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label={`${zone.name} zone, ${Math.round(zone.capacity)} percent occupancy, risk ${zone.riskLevel}`}
          style={{
            transition:
              "fill 200ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke 200ms ease, opacity 150ms ease",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onZoneClick(zoneId);
          }}
          onKeyDown={(e) => handleZoneKeyDown(e, zoneId)}
          onMouseEnter={(e) => onZoneHover(zone, e)}
          onMouseLeave={() => onZoneHover(null)}
          onFocus={() => onZoneHover(zone)}
          onBlur={() => onZoneHover(null)}
        />
      </g>
    );
  }
}
