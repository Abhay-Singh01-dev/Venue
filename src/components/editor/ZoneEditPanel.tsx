// ── Zone Edit Panel ────────────────────────────────────────────────────
// Right-side floating panel for editing selected zone properties
// in edit mode. Slides in from the right, exits when zone deselected.

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { ZoneType, RiskLevel } from "../../types";

const DEFAULT_W = 150;
const DEFAULT_H = 60;

// ── Zone type options ─────────────────────────────────────────────────

const ZONE_TYPES: Array<{ value: ZoneType; label: string }> = [
  { value: "zone", label: "Generic Zone" },
  { value: "entrance", label: "Entrance" },
  { value: "exit", label: "Exit" },
  { value: "hall", label: "Hall / Corridor" },
  { value: "food_court", label: "Food Court" },
  { value: "gate", label: "Gate" },
  { value: "concourse", label: "Concourse" },
  { value: "field", label: "Field / Stage" },
];

// ── Helpers ───────────────────────────────────────────────────────────

function computeRisk(capacity: number): RiskLevel {
  if (capacity < 50) return "low";
  if (capacity < 70) return "moderate";
  if (capacity < 85) return "high";
  return "critical";
}

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "text-emerald-400",
  moderate: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

// ── Component ─────────────────────────────────────────────────────────

export function ZoneEditPanel() {
  const editMode = useStore((s) => s.editMode);
  const editorSelectedZoneId = useStore((s) => s.editorSelectedZoneId);
  const tempVenue = useStore((s) => s.tempVenue);
  const updateZoneData = useStore((s) => s.updateZoneData);
  const removePath = useStore((s) => s.removePath);

  const show = editMode && !!editorSelectedZoneId && !!tempVenue;
  const zone = show
    ? tempVenue!.zones.find((z) => z.id === editorSelectedZoneId)
    : null;
  const connectedPaths = show
    ? tempVenue!.paths.filter(
        (p) => p.from === editorSelectedZoneId || p.to === editorSelectedZoneId,
      )
    : [];

  return (
    <AnimatePresence>
      {show && zone && (
        <motion.div
          key={editorSelectedZoneId}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 14 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          // Sits below EditorToolbar (top-14) at right edge
          className="absolute top-14 right-2 z-20 w-52 rounded-xl
                     bg-slate-900/93 backdrop-blur border border-white/10
                     p-3 flex flex-col gap-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">
              Zone Properties
            </span>
            <span
              className={`text-[10px] font-bold uppercase ${RISK_COLOR[zone.riskLevel]}`}
            >
              {zone.riskLevel}
            </span>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={zone.name}
              onChange={(e) =>
                updateZoneData(zone.id, {
                  name: e.target.value,
                  shortName: e.target.value.slice(0, 8),
                })
              }
              className="px-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08]
                         text-[12px] text-slate-200 outline-none
                         focus:border-cyan-500/30 transition-colors"
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">
              Type
            </label>
            <select
              value={zone.type}
              onChange={(e) =>
                updateZoneData(zone.id, { type: e.target.value as ZoneType })
              }
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-white/[0.08]
                         text-[12px] text-slate-300 outline-none
                         focus:border-cyan-500/30 transition-colors cursor-pointer"
            >
              {ZONE_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-slate-900">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Capacity slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Capacity
              </label>
              <span
                className={`text-[11px] font-bold ${RISK_COLOR[zone.riskLevel]}`}
              >
                {Math.round(zone.capacity)}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={99}
              value={zone.capacity}
              onChange={(e) => {
                const cap = Number(e.target.value);
                updateZoneData(zone.id, {
                  capacity: cap,
                  riskLevel: computeRisk(cap),
                  activeVisitors: Math.round((zone.maxCapacity * cap) / 100),
                });
              }}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>Low</span>
              <span>Moderate</span>
              <span>High</span>
              <span>Crit</span>
            </div>
          </div>

          {/* Shape controls */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Width
              </label>
              <span className="text-[11px] font-bold text-cyan-400 tabular-nums">
                {Math.round(zone.shapeWidth ?? DEFAULT_W)}
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={360}
              value={zone.shapeWidth ?? DEFAULT_W}
              onChange={(e) =>
                updateZoneData(zone.id, { shapeWidth: Number(e.target.value) })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />

            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Height
              </label>
              <span className="text-[11px] font-bold text-cyan-400 tabular-nums">
                {Math.round(zone.shapeHeight ?? DEFAULT_H)}
              </span>
            </div>
            <input
              type="range"
              min={36}
              max={220}
              value={zone.shapeHeight ?? DEFAULT_H}
              onChange={(e) =>
                updateZoneData(zone.id, { shapeHeight: Number(e.target.value) })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          {/* Connected paths */}
          {connectedPaths.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Paths ({connectedPaths.length})
              </label>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {connectedPaths.map((path) => {
                  const otherId = path.from === zone.id ? path.to : path.from;
                  const otherZone = tempVenue!.zones.find(
                    (z) => z.id === otherId,
                  );
                  return (
                    <div
                      key={path.id ?? `${path.from}-${path.to}`}
                      className="flex items-center justify-between px-2 py-1 rounded-lg
                                 bg-white/[0.04] border border-white/[0.06]"
                    >
                      <span className="text-[10px] text-slate-400">
                        ↔ {otherZone?.shortName || otherId}
                      </span>
                      {path.id && (
                        <button
                          onClick={() => removePath(path.id!)}
                          className="text-[11px] text-red-400/60 hover:text-red-400
                                     transition-colors leading-none px-0.5"
                          title="Remove this path"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty path note */}
          {connectedPaths.length === 0 && (
            <p className="text-[10px] text-slate-600 italic">
              No paths connected. Use + Path to link zones.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
