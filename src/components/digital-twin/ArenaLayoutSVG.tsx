// ── Arena Layout SVG — Indoor arena with radial concentric layout ───────
// Corner tunnel gates → perimeter sections → center stage.
// Radial flow bias is achieved through path structure + importance weights.

import { useMemo } from 'react';
import { Zone, VenuePath, getRiskColor } from '../../types';

// ── Section dimensions by zone id ────────────────────────────────────
const SECTION_DIMS: Record<string, { w: number; h: number }> = {
  'section-north': { w: 300, h: 80 },
  'section-south': { w: 300, h: 80 },
  'section-east':  { w: 162, h: 150 },
  'section-west':  { w: 162, h: 150 },
};

const TUNNEL_R = 32;    // gate circle radius
const STAGE_RX = 90;   // center-stage ellipse rx
const STAGE_RY = 55;   // center-stage ellipse ry

const FILL: Record<string, string> = {
  low:      'rgba(16, 185, 129, 0.22)',
  moderate: 'rgba(245, 158, 11,  0.22)',
  high:     'rgba(249, 115, 22,  0.22)',
  critical: 'rgba(239, 68,  68,  0.32)',
};

interface ArenaLayoutSVGProps {
  zones: Zone[];
  paths: VenuePath[];
  selectedZoneId: string | null;
  predictionMode: 'current' | 'predicted';
  predictions: Array<{ zoneId: string; predictedPct: number }>;
  onZoneClick: (zoneId: string) => void;
  onZoneHover: (zone: Zone | null, e?: React.MouseEvent) => void;
}

export function ArenaLayoutSVG({
  zones, paths, selectedZoneId, predictionMode, predictions,
  onZoneClick, onZoneHover,
}: ArenaLayoutSVGProps) {

  const zoneMap = useMemo(() => {
    const m: Record<string, Zone> = {};
    zones.forEach(z => { m[z.id] = z; });
    return m;
  }, [zones]);

  // ── Render helpers ───────────────────────────────────────────────

  function renderTunnel(zone: Zone) {
    const { x, y } = zone.position;
    const isSelected = selectedZoneId === zone.id;
    const color = getRiskColor(zone.riskLevel);
    const fill  = FILL[zone.riskLevel] ?? FILL.low;

    // Label position: above for N tunnels, below for S tunnels
    const labelY = y < 275 ? y - TUNNEL_R - 8 : y + TUNNEL_R + 14;

    return (
      <g key={zone.id}>
        {isSelected && (
          <circle cx={x} cy={y} r={TUNNEL_R + 5}
            fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        )}
        <circle cx={x} cy={y} r={TUNNEL_R}
          fill={fill} stroke={isSelected ? '#fff' : color}
          strokeWidth={isSelected ? 1.5 : 1}
          className="zone-path cursor-pointer"
          style={{ transition: 'fill 1s ease, stroke 0.3s ease' }}
          onClick={e => { e.stopPropagation(); onZoneClick(zone.id); }}
          onMouseEnter={e => onZoneHover(zone, e)}
          onMouseLeave={() => onZoneHover(null)}
        />
        <text x={x} y={labelY} textAnchor="middle"
          fontSize={9} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {zone.shortName}
        </text>
        <text x={x} y={labelY + 12} textAnchor="middle"
          fontSize={8} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {Math.round(zone.capacity)}%
        </text>
      </g>
    );
  }

  function renderSection(zone: Zone) {
    const { x, y } = zone.position;
    const { w, h } = SECTION_DIMS[zone.id] ?? { w: 200, h: 100 };
    const rx = x - w / 2;
    const ry = y - h / 2;
    const isSelected = selectedZoneId === zone.id;
    const color = getRiskColor(zone.riskLevel);
    const fill  = FILL[zone.riskLevel] ?? FILL.low;

    return (
      <g key={zone.id}>
        {isSelected && (
          <rect x={rx - 4} y={ry - 4} width={w + 8} height={h + 8} rx={12}
            fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        )}
        <rect x={rx} y={ry} width={w} height={h} rx={8}
          fill={fill} stroke={isSelected ? '#fff' : color}
          strokeWidth={isSelected ? 1.5 : 1}
          className="zone-path cursor-pointer"
          style={{ transition: 'fill 1s ease, stroke 0.3s ease' }}
          onClick={e => { e.stopPropagation(); onZoneClick(zone.id); }}
          onMouseEnter={e => onZoneHover(zone, e)}
          onMouseLeave={() => onZoneHover(null)}
        />
        <text x={x} y={y - 4} textAnchor="middle"
          fontSize={11} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {zone.shortName}
        </text>
        <text x={x} y={y + 10} textAnchor="middle"
          fontSize={9} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {Math.round(zone.capacity)}%
        </text>
      </g>
    );
  }

  function renderCenterStage(zone: Zone) {
    const { x, y } = zone.position;
    const isSelected = selectedZoneId === zone.id;
    const color = getRiskColor(zone.riskLevel);
    const fill  = FILL[zone.riskLevel] ?? FILL.low;

    return (
      <g key={zone.id}>
        {/* Outer ring decoration */}
        <ellipse cx={x} cy={y} rx={STAGE_RX + 8} ry={STAGE_RY + 8}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {isSelected && (
          <ellipse cx={x} cy={y} rx={STAGE_RX + 5} ry={STAGE_RY + 5}
            fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        )}
        <ellipse cx={x} cy={y} rx={STAGE_RX} ry={STAGE_RY}
          fill={fill} stroke={isSelected ? '#fff' : color}
          strokeWidth={isSelected ? 1.5 : 1}
          className="zone-path cursor-pointer"
          style={{ transition: 'fill 1s ease, stroke 0.3s ease' }}
          onClick={e => { e.stopPropagation(); onZoneClick(zone.id); }}
          onMouseEnter={e => onZoneHover(zone, e)}
          onMouseLeave={() => onZoneHover(null)}
        />
        <text x={x} y={y - 5} textAnchor="middle"
          fontSize={12} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {zone.shortName}
        </text>
        <text x={x} y={y + 10} textAnchor="middle"
          fontSize={10} fontWeight="700" fill={color}
          className="pointer-events-none select-none">
          {Math.round(zone.capacity)}%
        </text>
      </g>
    );
  }

  return (
    <svg viewBox="0 0 900 550" className="w-full h-full">
      <defs>
        <pattern id="grid-bg-a" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none"
            stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
        </pattern>
        <radialGradient id="bg-rad-a" cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor="rgba(6,182,212,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width="900" height="550" fill="url(#grid-bg-a)" />
      <rect width="900" height="550" fill="url(#bg-rad-a)" />

      {/* ── Radial flow connectors (tunnel → section → stage) ─────── */}
      <g opacity="0.22">
        {paths.map((p, i) => {
          const from = zoneMap[p.from];
          const to   = zoneMap[p.to];
          if (!from || !to) return null;
          return (
            <line key={i}
              x1={from.position.x} y1={from.position.y}
              x2={to.position.x}   y2={to.position.y}
              stroke="rgba(6,182,212,0.6)"
              strokeWidth="1.5" strokeDasharray="5 5"
            />
          );
        })}
      </g>

      {/* ── Sections (rendered first so tunnels sit on top) ──────── */}
      {zones
        .filter(z => z.type === 'concourse')
        .map(z => renderSection(z))}

      {/* ── Center Stage ────────────────────────────────────────── */}
      {zones
        .filter(z => z.type === 'field')
        .map(z => renderCenterStage(z))}

      {/* ── Corner Tunnel Gates ──────────────────────────────────── */}
      {zones
        .filter(z => z.type === 'gate')
        .map(z => renderTunnel(z))}

      {/* ── Prediction Overlay ───────────────────────────────────── */}
      {predictionMode === 'predicted' && predictions.map(pred => {
        const zone = zoneMap[pred.zoneId];
        if (!zone) return null;
        const lv = pred.predictedPct >= 85 ? '#ef4444'
                 : pred.predictedPct >= 70 ? '#f97316' : '#f59e0b';
        const { x, y } = zone.position;

        if (zone.type === 'gate') {
          return (
            <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
              <circle cx={x} cy={y} r={TUNNEL_R}
                fill={lv} fillOpacity={0.12}
                stroke={lv} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
              <text x={x} y={y < 275 ? y - TUNNEL_R - 16 : y + TUNNEL_R + 26}
                textAnchor="middle" fontSize={8} fontWeight="bold" fill={lv} opacity={0.85}>
                → {pred.predictedPct}%
              </text>
            </g>
          );
        }
        if (zone.type === 'field') {
          return (
            <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
              <ellipse cx={x} cy={y} rx={STAGE_RX} ry={STAGE_RY}
                fill={lv} fillOpacity={0.12}
                stroke={lv} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
              <text x={x} y={y + STAGE_RY + 16}
                textAnchor="middle" fontSize={9} fontWeight="bold" fill={lv} opacity={0.85}>
                → {pred.predictedPct}%
              </text>
            </g>
          );
        }
        const { w, h } = SECTION_DIMS[zone.id] ?? { w: 200, h: 100 };
        return (
          <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={8}
              fill={lv} fillOpacity={0.12}
              stroke={lv} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
            <text x={x} y={y + h / 2 + 14}
              textAnchor="middle" fontSize={9} fontWeight="bold" fill={lv} opacity={0.85}>
              → {pred.predictedPct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
