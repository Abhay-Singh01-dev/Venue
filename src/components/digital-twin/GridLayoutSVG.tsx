// ── Grid Layout SVG — Airport / Mall style rectangular venue ───────────
// Renders a structured grid of rounded rectangles with flow connectors.
// Shared props interface with StadiumSVG for drop-in compatibility.

import { useMemo } from "react";
import { Zone, VenuePath, ZoneType, getRiskColor } from "../../types";

// ── Zone shape dimensions by type ─────────────────────────────────────
const ZONE_DIMS: Partial<Record<ZoneType, { w: number; h: number }>> = {
  entrance: { w: 165, h: 56 },
  exit: { w: 165, h: 56 },
  hall: { w: 185, h: 78 },
  food_court: { w: 300, h: 78 },
};

const FILL: Record<string, string> = {
  low: "rgba(16, 185, 129, 0.22)",
  moderate: "rgba(245, 158, 11,  0.22)",
  high: "rgba(249, 115, 22,  0.22)",
  critical: "rgba(239, 68,  68,  0.32)",
};

interface GridLayoutSVGProps {
  zones: Zone[];
  paths: VenuePath[];
  selectedZoneId: string | null;
  predictionMode: "current" | "predicted";
  predictions: Array<{ zoneId: string; predictedPct: number }>;
  onZoneClick: (zoneId: string) => void;
  onZoneHover: (zone: Zone | null, e?: React.MouseEvent) => void;
}

export function GridLayoutSVG({
  zones,
  paths,
  selectedZoneId,
  predictionMode,
  predictions,
  onZoneClick,
  onZoneHover,
}: GridLayoutSVGProps) {
  const zoneMap = useMemo(() => {
    const m: Record<string, Zone> = {};
    zones.forEach((z) => {
      m[z.id] = z;
    });
    return m;
  }, [zones]);

  function dims(zone: Zone) {
    return ZONE_DIMS[zone.type] ?? { w: 160, h: 60 };
  }

  return (
    <svg
      viewBox="0 0 900 550"
      className="w-full h-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="grid-bg-g"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="0.5"
          />
        </pattern>
        <radialGradient id="bg-rad-g" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="rgba(6,182,212,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width="900" height="550" fill="url(#grid-bg-g)" />
      <rect width="900" height="550" fill="url(#bg-rad-g)" />

      {/* ── Flow corridor connectors ────────────────────────────── */}
      <g opacity="0.28">
        {paths.map((p, i) => {
          const from = zoneMap[p.from];
          const to = zoneMap[p.to];
          if (!from || !to) return null;
          return (
            <line
              key={i}
              x1={from.position.x}
              y1={from.position.y}
              x2={to.position.x}
              y2={to.position.y}
              stroke="rgba(6,182,212,0.55)"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
          );
        })}
      </g>

      {/* ── Zone rectangles ─────────────────────────────────────── */}
      {zones.map((zone) => {
        const { w, h } = dims(zone);
        const rx = zone.position.x - w / 2;
        const ry = zone.position.y - h / 2;
        const isSelected = selectedZoneId === zone.id;
        const outColor = getRiskColor(zone.riskLevel);
        const fill = FILL[zone.riskLevel] ?? FILL.low;

        return (
          <g key={zone.id}>
            {/* Selection halo */}
            {isSelected && (
              <rect
                x={rx - 3}
                y={ry - 3}
                width={w + 6}
                height={h + 6}
                rx={11}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
              />
            )}
            {/* Zone body */}
            <rect
              x={rx}
              y={ry}
              width={w}
              height={h}
              rx={8}
              fill={fill}
              stroke={isSelected ? "#fff" : outColor}
              strokeWidth={isSelected ? 1.5 : 1}
              className="zone-path cursor-pointer"
              style={{ transition: "fill 1s ease, stroke 0.3s ease" }}
              onClick={(e) => {
                e.stopPropagation();
                onZoneClick(zone.id);
              }}
              onMouseEnter={(e) => onZoneHover(zone, e)}
              onMouseLeave={() => onZoneHover(null)}
            />
            {/* Labels */}
            <text
              x={zone.position.x}
              y={zone.position.y - 5}
              textAnchor="middle"
              fontSize={11}
              fontWeight="700"
              fill={outColor}
              className="pointer-events-none select-none"
            >
              {zone.shortName}
            </text>
            <text
              x={zone.position.x}
              y={zone.position.y + 10}
              textAnchor="middle"
              fontSize={9}
              fontWeight="700"
              fill={outColor}
              className="pointer-events-none select-none"
            >
              {Math.round(zone.capacity)}%
            </text>
          </g>
        );
      })}

      {/* ── Prediction Overlay ───────────────────────────────────── */}
      {predictionMode === "predicted" &&
        predictions.map((pred) => {
          const zone = zoneMap[pred.zoneId];
          if (!zone) return null;
          const { w, h } = dims(zone);
          const rx = zone.position.x - w / 2;
          const ry = zone.position.y - h / 2;
          const lv =
            pred.predictedPct >= 85
              ? "#ef4444"
              : pred.predictedPct >= 70
                ? "#f97316"
                : "#f59e0b";
          return (
            <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
              <rect
                x={rx}
                y={ry}
                width={w}
                height={h}
                rx={8}
                fill={lv}
                fillOpacity={0.12}
                stroke={lv}
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeOpacity={0.5}
                style={{ transition: "all 0.8s ease" }}
              />
              <text
                x={zone.position.x}
                y={ry + h + 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill={lv}
                opacity={0.85}
              >
                → {pred.predictedPct}%
              </text>
            </g>
          );
        })}
    </svg>
  );
}
