// ── Editor Toolbar ─────────────────────────────────────────────────────
// Floating overlay inside the Digital Twin SVG container.
// Only rendered when editMode = true.
// Contains: Add Zone, Add Path, Delete Zone (conditional), Cancel, Name input, Save Layout.

import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { Venue } from "../../types";

// ── Validation ────────────────────────────────────────────────────────

function validateVenue(venue: Venue): string[] {
  const warnings: string[] = [];
  const hasEntrance = venue.zones.some(
    (z) => z.type === "entrance" || z.type === "gate",
  );
  const hasExit = venue.zones.some((z) => z.type === "exit");
  if (!hasEntrance) warnings.push("No entrance/gate zone");
  if (!hasExit) warnings.push("No exit zone");
  const zonesWithPaths = new Set<string>();
  venue.paths.forEach((p) => {
    zonesWithPaths.add(p.from);
    zonesWithPaths.add(p.to);
  });
  const isolated = venue.zones.filter((z) => !zonesWithPaths.has(z.id));
  if (isolated.length > 0) warnings.push(`${isolated.length} isolated zone(s)`);
  return warnings;
}

// ── Component ─────────────────────────────────────────────────────────

export function EditorToolbar() {
  const editMode = useStore((s) => s.editMode);
  const tempVenue = useStore((s) => s.tempVenue);
  const editorSelectedZoneId = useStore((s) => s.editorSelectedZoneId);
  const isAddingPath = useStore((s) => s.isAddingPath);
  const editorPathSource = useStore((s) => s.editorPathSource);
  const availableVenues = useStore((s) => s.availableVenues);

  const addZone = useStore((s) => s.addZone);
  const deleteZone = useStore((s) => s.deleteZone);
  const cancelEditing = useStore((s) => s.cancelEditing);
  const saveCustomVenue = useStore((s) => s.saveCustomVenue);
  const toggleAddingPath = useStore((s) => s.toggleAddingPath);

  const [venueName, setVenueName] = useState("");

  if (!editMode || !tempVenue) return null;

  const customCount = availableVenues.filter((v) => v.isCustom).length;
  const defaultName = `Custom Venue ${customCount + 1}`;
  const zoneCount = tempVenue.zones.length;
  const warnings = validateVenue(tempVenue);
  const canSave = zoneCount > 0 && !isAddingPath;

  let pathHint = "";
  if (isAddingPath) {
    pathHint = editorPathSource
      ? "Click the target zone to complete path…"
      : "Click source zone to start path…";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="px-6 pb-2 flex flex-col items-center gap-2"
    >
      {/* ── Main action row ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-3 py-2 rounded-2xl bg-[#0b1221]/95 backdrop-blur-md
                      border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-auto"
      >
        {/* Left: editing actions */}
        <div className="flex items-center gap-1.5 pr-4 border-r border-white/[0.08]">
          {/* Add Zone */}
          <button
            onClick={addZone}
            disabled={zoneCount >= 12}
            title={
              zoneCount >= 12 ? "Maximum 12 zones reached" : "Add a new zone"
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04]
                       hover:bg-white/[0.08] text-[11px] text-slate-200 font-medium
                       transition-colors disabled:opacity-35 disabled:cursor-not-allowed border border-white/[0.04]"
          >
            <span className="text-cyan-400 font-bold text-sm leading-none">
              +
            </span>
            <span>
              Zone{" "}
              <span className="text-slate-500 font-normal">
                ({zoneCount}/12)
              </span>
            </span>
          </button>

          {/* Add Path */}
          <button
            onClick={toggleAddingPath}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium
                        transition-colors border ${
                          isAddingPath
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                            : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border-white/[0.04]"
                        }`}
          >
            <span className="text-cyan-400 font-bold leading-none">⟶</span>
            <span>{isAddingPath ? "Cancel Path" : "Add Path"}</span>
          </button>

          {/* Delete Zone */}
          {editorSelectedZoneId && !isAddingPath && (
            <button
              onClick={() => deleteZone(editorSelectedZoneId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10
                         hover:bg-red-500/20 text-[11px] text-red-400 font-medium
                         transition-colors border border-red-500/20 ml-1"
            >
              ✕ Delete
            </button>
          )}
        </div>

        {/* Right: name input + cancel + save */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder={defaultName}
            className="w-40 px-3 py-1.5 rounded-xl bg-[#060c18] border border-white/[0.1]
                       text-[11px] text-slate-200 placeholder-slate-600 outline-none
                       focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/40 transition-all font-medium"
          />
          <button
            onClick={cancelEditing}
            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.04]
                       text-[11px] text-slate-300 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => saveCustomVenue(venueName || defaultName)}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25
                       text-[11px] text-cyan-400 font-bold tracking-wide transition-all
                       border border-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(6,182,212,0.12)]"
          >
            Save Layout
          </button>
        </div>
      </div>

      {/* ── Path Hint & Validation warnings ─────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
        {pathHint && (
          <div className="px-4 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/20 backdrop-blur-sm shadow-lg">
            <span className="text-[11px] text-cyan-400 font-medium tracking-wide">
              {pathHint}
            </span>
          </div>
        )}
        {warnings.length > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full
                          bg-amber-950/80 border border-amber-500/30 backdrop-blur-sm shadow-lg"
          >
            <span className="text-amber-400 text-xs shrink-0 font-bold">⚠</span>
            <span className="text-[11px] text-amber-400 font-medium tracking-wide">
              Layout advisory: {warnings.join(" • ")}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
