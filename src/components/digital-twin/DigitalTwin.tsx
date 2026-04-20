// ── Digital Twin — Container Component ─────────────────────────────────
// Orchestrates VenueRenderer, FlowParticles, ZoneTooltip, and controls.

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { VenueRenderer } from "./VenueRenderer";
import { FlowParticles } from "./FlowParticles";
import { ZoneTooltip } from "./ZoneTooltip";
import { TelemetryPanel } from "../telemetry/TelemetryPanel";
import { EditorToolbar } from "../editor/EditorToolbar";
import { ZoneEditPanel } from "../editor/ZoneEditPanel";
import { ZoneInspectionPanel } from "../panels/ZoneInspectionPanel";
import { Zone } from "../../types";

/**
 * DigitalTwin
 *
 * Renders the live venue canvas, selection state, and editor overlays.
 */
export function DigitalTwin() {
  const zones = useStore((s) => s.zones);
  const selectedZoneId = useStore((s) => s.selectedZoneId);
  const predictionMode = useStore((s) => s.predictionMode);
  const predictions = useStore((s) => s.predictions);
  const selectZone = useStore((s) => s.selectZone);
  const togglePredictionMode = useStore((s) => s.togglePredictionMode);
  const currentVenueId = useStore((s) => s.currentVenueId);
  const availableVenues = useStore((s) => s.availableVenues);

  // Editor State
  const editMode = useStore((s) => s.editMode);
  const tempVenue = useStore((s) => s.tempVenue);
  const toggleEditMode = useStore((s) => s.toggleEditMode);
  const editorSelectedZoneId = useStore((s) => s.editorSelectedZoneId);
  const isAddingPath = useStore((s) => s.isAddingPath);
  const editorPathSource = useStore((s) => s.editorPathSource);
  const selectEditorZone = useStore((s) => s.selectEditorZone);
  const updateZonePosition = useStore((s) => s.updateZonePosition);
  const updateZoneData = useStore((s) => s.updateZoneData);
  const removePath = useStore((s) => s.removePath);

  // Derive the active venue
  const currentVenue = useMemo(
    () =>
      availableVenues.find((v) => v.id === currentVenueId) ??
      availableVenues[0],
    [availableVenues, currentVenueId],
  );
  const activeVenue = editMode && tempVenue ? tempVenue : currentVenue;
  const activeZones = editMode && tempVenue ? tempVenue.zones : zones;

  const [hoveredZone, setHoveredZone] = useState<Zone | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoneHover = useCallback(
    (zone: Zone | null, e?: React.MouseEvent) => {
      if (zone && e && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      setHoveredZone(zone);
    },
    [],
  );

  const handleZoneClick = useCallback(
    (zoneId: string) => {
      if (editMode) {
        selectEditorZone(zoneId);
      } else {
        selectZone(zoneId);
      }
    },
    [editMode, selectEditorZone, selectZone],
  );

  // Click on background closes telemetry or deselects editor zone
  const handleBgClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if click originated from SVG background
      if ((e.target as Element).tagName === "svg") {
        if (editMode && (editorSelectedZoneId || isAddingPath)) {
          selectEditorZone(null);
        } else if (!editMode && selectedZoneId) {
          selectZone(null);
        }
      }
    },
    [
      editMode,
      editorSelectedZoneId,
      isAddingPath,
      selectEditorZone,
      selectedZoneId,
      selectZone,
    ],
  );

  // ESC key closes zone inspection panel (PHASE 3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedZoneId && !editMode) {
        selectZone(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedZoneId, editMode, selectZone]);

  // Legend items
  const legend = [
    { label: "Low (<50%)", color: "#10b981" },
    { label: "Moderate (50-70%)", color: "#f59e0b" },
    { label: "High (70-85%)", color: "#f97316" },
    { label: "Critical (>85%)", color: "#ef4444" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="bg-white/[0.03] backdrop-blur-lg border border-white/[0.07] rounded-xl mb-6 overflow-hidden"
    >
      {/* Header Bar */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 live-pulse" />
            <h2 className="text-[11px] font-semibold text-white tracking-widest uppercase">
              Real-Time Venue State
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Live crowd topology. Click zones for telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden xl:flex items-center gap-3">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: l.color }}
                />
                <span className="text-[10px] text-slate-500">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Prediction Toggle */}
          <div className="h-9 flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden text-[11px]">
            <button
              onClick={() =>
                predictionMode !== "current" && togglePredictionMode()
              }
              className={`h-full px-3 transition-colors ${
                predictionMode === "current"
                  ? "bg-cyan-500/15 text-cyan-400 font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Current
            </button>
            <button
              onClick={() =>
                predictionMode !== "predicted" && togglePredictionMode()
              }
              className={`h-full px-3 transition-colors ${
                predictionMode === "predicted"
                  ? "bg-cyan-500/15 text-cyan-400 font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Predicted (10m)
            </button>
          </div>
        </div>
      </div>

      {/* ── Venue Mode Label  (micro-improvement #5) ────────────── */}
      <div className="px-6 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 tracking-widest uppercase font-medium">
            Venue Mode:
          </span>
          <motion.span
            key={activeVenue.id + (editMode ? "-edit" : "")}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="text-[10px] text-cyan-400/75 tracking-widest uppercase font-bold"
          >
            {activeVenue.name}
            {!editMode && activeVenue.isCustom && (
              <span className="ml-1.5 text-slate-500 font-medium">
                (USER-DEFINED)
              </span>
            )}
            {editMode && (
              <span className="ml-1.5 text-cyan-500 font-bold">(EDITING)</span>
            )}
          </motion.span>
        </div>

        {/* Edit Layout Button (Top Right of Digital Twin content) */}
        {!editMode && (
          <button
            onClick={toggleEditMode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border overflow-hidden
                       bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.1]
                       text-[10px] uppercase tracking-widest text-slate-300
                       transition-colors shadow-sm"
          >
            <span className="text-cyan-400 text-xs">✎</span>
            <span>Edit Layout</span>
          </button>
        )}
      </div>

      {/* Editor toolbar sits above canvas to avoid covering grid/zones */}
      <EditorToolbar />

      {/* SVG Container */}
      <div
        ref={containerRef}
        className="relative px-6 pb-4"
        style={{ height: "520px" }}
        onPointerDown={handleBgClick}
      >
        <ZoneEditPanel />

        {/* ── Venue transition wrapper (micro-improvement #3) ─────── */}
        <AnimatePresence mode="sync">
          <motion.div
            key={activeVenue.id + (editMode ? "-edit" : "")}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="w-full h-full relative"
          >
            <svg
              viewBox="0 0 900 550"
              className="w-full h-full absolute inset-0"
              style={{ maxHeight: "500px" }}
              focusable="false"
            >
              {/* Venue-agnostic layout */}
              <VenueRenderer
                venue={activeVenue}
                zones={activeZones}
                selectedZoneId={
                  editMode ? editorSelectedZoneId : selectedZoneId
                }
                predictionMode={predictionMode}
                predictions={predictions}
                onZoneClick={handleZoneClick}
                onZoneHover={handleZoneHover}
                editMode={editMode}
                isAddingPath={isAddingPath}
                editorPathSource={editorPathSource}
                onZoneDragEnd={updateZonePosition}
                onZoneResizeEnd={(zoneId, size) =>
                  updateZoneData(zoneId, {
                    shapeWidth: size.w,
                    shapeHeight: size.h,
                  })
                }
                onPathDelete={removePath}
              />
              {/* Particle flow overlay */}
              {!editMode && (
                <FlowParticles zones={activeZones} paths={activeVenue.paths} />
              )}
            </svg>
          </motion.div>
        </AnimatePresence>

        {/* Tooltip overlay (positioned absolutely over SVG) */}
        <AnimatePresence mode="sync">
          {hoveredZone && (
            <ZoneTooltip zone={hoveredZone} x={tooltipPos.x} y={tooltipPos.y} />
          )}
        </AnimatePresence>
      </div>

      {/* Flow particles legend */}
      <div className="px-6 pb-5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            <div className="w-1 h-1 rounded-full bg-cyan-400/60" />
            <div className="w-6 h-px bg-gradient-to-r from-cyan-400/60 to-transparent" />
            <div className="w-1 h-1 rounded-full bg-cyan-400/30" />
          </div>
          <span className="text-[10px] text-slate-500">Flow particles</span>
        </div>
      </div>

      <TelemetryPanel />

      {/* Zone Inspection Panel (PHASE 3) - Deep zone analytics on click */}
      {!editMode && selectedZoneId && (
        <ZoneInspectionPanel
          zone={activeZones.find((z) => z.id === selectedZoneId) || null}
          onClose={() => selectZone(null)}
        />
      )}
    </motion.div>
  );
}
