// ── Custom Editor SVG ──────────────────────────────────────────────────
// Renders zones as uniform rounded rects for both edit mode and
// view mode of user-saved (isCustom) venues.
// Drag, path creation visual feedback, grid overlay all live here.

import { useState, useMemo } from "react";
import { Zone, VenuePath, getRiskColor } from "../../types";

// ── Constants ─────────────────────────────────────────────────────────

const SNAP = 20;
const CANVAS_W = 1200;
const CANVAS_H = 620;
const ZONE_W = 150;
const ZONE_H = 60;
const SAFE_PAD_X = 4;
const SAFE_PAD_Y = 6;
const MIN_W = 80;
const MAX_W = 360;
const MIN_H = 36;
const MAX_H = 220;

const FILL_THEME: Record<string, string> = {
  low: "rgba(16, 185, 129, 0.22)",
  moderate: "rgba(245, 158, 11,  0.22)",
  high: "rgba(249, 115, 22,  0.22)",
  critical: "rgba(239, 68,  68,  0.32)",
};

interface DragState {
  id: string;
  x: number;
  y: number;
}
interface ResizeState {
  id: string;
  mode: "w" | "h" | "both";
  startClientX: number;
  startClientY: number;
  startW: number;
  startH: number;
  w: number;
  h: number;
}

function getBounds(editMode: boolean) {
  return {
    minX: SAFE_PAD_X,
    maxX: CANVAS_W - SAFE_PAD_X,
    minY: SAFE_PAD_Y,
    maxY: CANVAS_H - SAFE_PAD_Y,
  };
}

function clampSize(w: number, h: number) {
  return {
    w: Math.max(MIN_W, Math.min(MAX_W, w)),
    h: Math.max(MIN_H, Math.min(MAX_H, h)),
  };
}

function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  bounds: ReturnType<typeof getBounds>,
) {
  return {
    x: Math.max(bounds.minX + w / 2, Math.min(bounds.maxX - w / 2, x)),
    y: Math.max(bounds.minY + h / 2, Math.min(bounds.maxY - h / 2, y)),
  };
}

function getZoneSize(zone: Zone, override?: { w: number; h: number }) {
  const w = override?.w ?? zone.shapeWidth ?? ZONE_W;
  const h = override?.h ?? zone.shapeHeight ?? ZONE_H;
  return clampSize(w, h);
}

// ── Props ─────────────────────────────────────────────────────────────

interface CustomEditorSVGProps {
  zones: Zone[];
  paths: VenuePath[];
  selectedZoneId: string | null;
  editMode: boolean;
  isAddingPath: boolean;
  editorPathSource: string | null;
  predictionMode: "current" | "predicted";
  predictions: Array<{ zoneId: string; predictedPct: number }>;
  onZoneClick: (zoneId: string) => void;
  onZoneHover: (zone: Zone | null, e?: React.MouseEvent) => void;
  onZoneDragEnd: (zoneId: string, pos: { x: number; y: number }) => void;
  onZoneResizeEnd: (zoneId: string, size: { w: number; h: number }) => void;
  onPathDelete: (pathId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export function CustomEditorSVG({
  zones,
  paths,
  selectedZoneId,
  editMode,
  isAddingPath,
  editorPathSource,
  predictionMode,
  predictions,
  onZoneClick,
  onZoneHover,
  onZoneDragEnd,
  onZoneResizeEnd,
  onPathDelete,
}: CustomEditorSVGProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const bounds = getBounds(editMode);

  const zoneMap = useMemo(() => {
    const m: Record<string, Zone> = {};
    zones.forEach((z) => {
      m[z.id] = z;
    });
    return m;
  }, [zones]);

  // ── Drag handlers ─────────────────────────────────────────────────

  function snap(v: number) {
    return Math.round(v / SNAP) * SNAP;
  }

  const handlePointerDown = (e: React.PointerEvent, zone: Zone) => {
    if (!editMode || isAddingPath || resizeState) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture so pointer move fires even if cursor leaves the element
    (e.target as Element).setPointerCapture(e.pointerId);
    const { w, h } = getZoneSize(zone);
    const p = clampPos(zone.position.x, zone.position.y, w, h, bounds);
    setDragState({ id: zone.id, x: p.x, y: p.y });
  };

  const handleResizeDown = (
    e: React.PointerEvent,
    zone: Zone,
    mode: "w" | "h" | "both",
  ) => {
    if (!editMode || isAddingPath || dragState) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const { w, h } = getZoneSize(zone);
    setResizeState({
      id: zone.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: w,
      startH: h,
      w,
      h,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (resizeState) {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = CANVAS_W / rect.width;
      const sy = CANVAS_H / rect.height;
      const dx = (e.clientX - resizeState.startClientX) * sx;
      const dy = (e.clientY - resizeState.startClientY) * sy;

      let w = resizeState.startW;
      let h = resizeState.startH;
      if (resizeState.mode === "w" || resizeState.mode === "both")
        w = resizeState.startW + dx * 2;
      if (resizeState.mode === "h" || resizeState.mode === "both")
        h = resizeState.startH + dy * 2;

      const clamped = clampSize(w, h);
      setResizeState((s) => (s ? { ...s, w: clamped.w, h: clamped.h } : null));
      return;
    }

    if (!dragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = zoneMap[dragState.id];
    if (!zone) return;
    const { w, h } = getZoneSize(zone);
    const x = snap(
      Math.max(
        bounds.minX,
        Math.min(
          bounds.maxX,
          (e.clientX - rect.left) * (CANVAS_W / rect.width),
        ),
      ),
    );
    const y = snap(
      Math.max(
        bounds.minY,
        Math.min(
          bounds.maxY,
          (e.clientY - rect.top) * (CANVAS_H / rect.height),
        ),
      ),
    );
    const p = clampPos(x, y, w, h, bounds);
    setDragState((d) => (d ? { ...d, x: p.x, y: p.y } : null));
  };

  const handlePointerUp = () => {
    if (resizeState) {
      const { w, h } = clampSize(resizeState.w, resizeState.h);
      const zone = zoneMap[resizeState.id];
      if (zone) {
        const p = clampPos(zone.position.x, zone.position.y, w, h, bounds);
        onZoneDragEnd(resizeState.id, p);
      }
      onZoneResizeEnd(resizeState.id, { w, h });
      setResizeState(null);
    }

    if (dragState) {
      onZoneDragEnd(dragState.id, { x: dragState.x, y: dragState.y });
      setDragState(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="w-full h-full"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        {/* Subtle 20px grid (edit mode only) */}
        <pattern
          id="editor-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgba(6,182,212,0.14)"
            strokeWidth="0.5"
          />
        </pattern>
        <radialGradient id="ceditor-bg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="rgba(6,182,212,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Grid overlay — only in editMode */}
      {editMode && (
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#editor-grid)" />
      )}
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#ceditor-bg)" />

      {/* ── Paths ─────────────────────────────────────────────────── */}
      {paths.map((path, i) => {
        const from = zoneMap[path.from];
        const to = zoneMap[path.to];
        if (!from || !to) return null;

        const fromSize = getZoneSize(
          from,
          resizeState?.id === from.id
            ? { w: resizeState.w, h: resizeState.h }
            : undefined,
        );
        const toSize = getZoneSize(
          to,
          resizeState?.id === to.id
            ? { w: resizeState.w, h: resizeState.h }
            : undefined,
        );
        const fromClamped = clampPos(
          from.position.x,
          from.position.y,
          fromSize.w,
          fromSize.h,
          bounds,
        );
        const toClamped = clampPos(
          to.position.x,
          to.position.y,
          toSize.w,
          toSize.h,
          bounds,
        );

        // During drag, use live drag position for path endpoints
        const fromPos = dragState?.id === path.from ? dragState : fromClamped;
        const toPos = dragState?.id === path.to ? dragState : toClamped;
        const midX = (fromPos.x + toPos.x) / 2;
        const midY = (fromPos.y + toPos.y) / 2;

        return (
          <g key={path.id ?? `p-${i}`}>
            <line
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              stroke="rgba(6,182,212,0.4)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            {/* Delete button on path midpoint (editMode + has id) */}
            {editMode && path.id && (
              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onPathDelete(path.id!);
                }}
              >
                <circle
                  cx={midX}
                  cy={midY}
                  r={10}
                  fill="#0f172a"
                  stroke="rgba(239,68,68,0.6)"
                  strokeWidth="1.5"
                />
                <path
                  d={`M${midX - 3},${midY - 3} L${midX + 3},${midY + 3} M${midX + 3},${midY - 3} L${midX - 3},${midY + 3}`}
                  stroke="rgba(239,68,68,0.9)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}

      {/* ── Zones ─────────────────────────────────────────────────── */}
      {zones.map((zone) => {
        const liveSize = getZoneSize(
          zone,
          resizeState?.id === zone.id
            ? { w: resizeState.w, h: resizeState.h }
            : undefined,
        );
        const isDragging = dragState?.id === zone.id;
        const clampedZonePos = clampPos(
          zone.position.x,
          zone.position.y,
          liveSize.w,
          liveSize.h,
          bounds,
        );
        const pos = isDragging
          ? { x: dragState!.x, y: dragState!.y }
          : clampedZonePos;
        const isSelected = selectedZoneId === zone.id;
        const isSource = editorPathSource === zone.id;
        // In path-creation mode, all non-source zones are potential targets
        const isTarget =
          isAddingPath && !!editorPathSource && zone.id !== editorPathSource;
        const color = getRiskColor(zone.riskLevel);
        const fill = FILL_THEME[zone.riskLevel] ?? FILL_THEME.low;
        const canDrag = editMode && !isAddingPath;

        const x0 = pos.x - liveSize.w / 2;
        const y0 = pos.y - liveSize.h / 2;
        const canResize = editMode && isSelected && !isAddingPath;

        return (
          <g
            key={zone.id}
            style={{
              cursor: canDrag
                ? isDragging
                  ? "grabbing"
                  : "grab"
                : isTarget
                  ? "crosshair"
                  : "pointer",
            }}
            onPointerDown={
              canDrag ? (e) => handlePointerDown(e, zone) : undefined
            }
            onClick={(e) => {
              e.stopPropagation();
              onZoneClick(zone.id);
            }}
            onMouseEnter={(e) => onZoneHover(zone, e)}
            onMouseLeave={() => onZoneHover(null)}
          >
            {/* Potential-target ring (path creation mode) */}
            {isTarget && (
              <rect
                x={x0 - 5}
                y={y0 - 5}
                width={liveSize.w + 10}
                height={liveSize.h + 10}
                rx={liveSize.h / 2 + 5}
                fill="none"
                stroke="rgba(245,158,11,0.5)"
                strokeWidth="1.5"
              />
            )}

            {/* Source zone pulsing ring */}
            {isSource && (
              <rect
                x={x0 - 5}
                y={y0 - 5}
                width={liveSize.w + 10}
                height={liveSize.h + 10}
                rx={liveSize.h / 2 + 5}
                fill="none"
                stroke="rgba(6,182,212,0.75)"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}

            {/* Selection ring */}
            {isSelected && !isSource && (
              <rect
                x={x0 - 4}
                y={y0 - 4}
                width={liveSize.w + 8}
                height={liveSize.h + 8}
                rx={liveSize.h / 2 + 4}
                fill="none"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="1.5"
                filter="drop-shadow(0 0 4px rgba(255,255,255,0.3))"
              />
            )}

            {/* Zone body */}
            <rect
              x={x0}
              y={y0}
              width={liveSize.w}
              height={liveSize.h}
              rx={liveSize.h / 2}
              fill={fill}
              stroke={isSource ? "#06b6d4" : isSelected ? "#fff" : color}
              strokeWidth={isSource || isSelected ? 2 : 1.5}
              style={{
                transition: isDragging
                  ? "none"
                  : "fill 1s ease, stroke 0.3s ease",
              }}
            />

            {canResize && (
              <g>
                <circle
                  cx={x0 + liveSize.w}
                  cy={pos.y}
                  r={5}
                  fill="#0f172a"
                  stroke="rgba(6,182,212,0.9)"
                  strokeWidth={1.5}
                  className="cursor-ew-resize"
                  onPointerDown={(e) => handleResizeDown(e, zone, "w")}
                />
                <circle
                  cx={pos.x}
                  cy={y0 + liveSize.h}
                  r={5}
                  fill="#0f172a"
                  stroke="rgba(6,182,212,0.9)"
                  strokeWidth={1.5}
                  className="cursor-ns-resize"
                  onPointerDown={(e) => handleResizeDown(e, zone, "h")}
                />
                <circle
                  cx={x0 + liveSize.w}
                  cy={y0 + liveSize.h}
                  r={6}
                  fill="#0f172a"
                  stroke="rgba(6,182,212,1)"
                  strokeWidth={1.5}
                  className="cursor-nwse-resize"
                  onPointerDown={(e) => handleResizeDown(e, zone, "both")}
                />
              </g>
            )}

            {/* Zone name */}
            <text
              x={pos.x}
              y={pos.y - 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight="800"
              fill={color}
              stroke="rgba(2,6,23,0.9)"
              strokeWidth={1.8}
              paintOrder="stroke"
              className="pointer-events-none select-none"
            >
              {zone.shortName || zone.name.slice(0, 10)}
            </text>
            {/* Zone type + capacity */}
            <text
              x={pos.x}
              y={pos.y + 10}
              textAnchor="middle"
              fontSize={10}
              fontWeight="600"
              fill={color}
              opacity={0.78}
              stroke="rgba(2,6,23,0.85)"
              strokeWidth={1.2}
              paintOrder="stroke"
              className="pointer-events-none select-none"
            >
              {zone.type} · {Math.round(zone.capacity)}%
            </text>
          </g>
        );
      })}

      {/* ── Prediction overlay (view mode only) ──────────────────── */}
      {predictionMode === "predicted" &&
        !editMode &&
        predictions.map((pred) => {
          const zone = zoneMap[pred.zoneId];
          if (!zone) return null;
          const zoneSize = getZoneSize(zone);
          const pos = clampPos(
            zone.position.x,
            zone.position.y,
            zoneSize.w,
            zoneSize.h,
            bounds,
          );
          const lv =
            pred.predictedPct >= 85
              ? "#ef4444"
              : pred.predictedPct >= 70
                ? "#f97316"
                : "#f59e0b";
          return (
            <g key={`pred-${pred.zoneId}`} className="pointer-events-none">
              <rect
                x={pos.x - zoneSize.w / 2}
                y={pos.y - zoneSize.h / 2}
                width={zoneSize.w}
                height={zoneSize.h}
                rx={zoneSize.h / 2}
                fill={lv}
                fillOpacity={0.12}
                stroke={lv}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.5}
              />
              <text
                x={pos.x}
                y={pos.y + zoneSize.h / 2 + 14}
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
