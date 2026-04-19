// ── Zone Inspection Panel — Deep zone analytics on click ──────────────────
// Shows occupancy, flow rate, predictions, and AI actions for selected zone

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { Zone } from "../../types";

interface ZoneInspectionPanelProps {
  zone: Zone | null;
  onClose: () => void;
}

export function ZoneInspectionPanel({
  zone,
  onClose,
}: ZoneInspectionPanelProps) {
  const predictions = useStore((s) => s.predictions);
  const actions = useStore((s) => s.actions);

  if (!zone) return null;

  const zonePredictions = predictions.filter((p) => p.zoneId === zone.id);
  const zoneActions = actions.filter((a) => a.description.includes(zone.name));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed top-32 right-6 w-80 bg-gradient-to-br from-[#0f172a]/95 to-[#020617]/95 backdrop-blur-xl border border-cyan-500/20 rounded-xl shadow-2xl z-40"
      >
        {/* Header */}
        <div className="relative p-5 border-b border-cyan-500/10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div>
            <h3 className="text-lg font-bold text-white">{zone.name}</h3>
            <p className="text-xs text-slate-400 mt-1">
              {zone.type.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-96 overflow-y-auto">
          {/* Current Status */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Current Status
            </h4>
            <div className="space-y-2.5">
              {/* Occupancy */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-300">Occupancy</span>
                  <span className="text-sm font-bold text-cyan-400 tabular-nums">
                    {zone.capacity}%
                  </span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${zone.capacity}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </div>

              {/* Flow Rate */}
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                <span className="text-xs text-slate-400">Flow Rate</span>
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                  {zone.flowRate} /min
                </span>
              </div>

              {/* Queue Depth (estimated from capacity) */}
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                <span className="text-xs text-slate-400">Queue Depth</span>
                <span className="text-sm font-semibold text-slate-300 tabular-nums">
                  {Math.round((zone.activeVisitors / zone.maxCapacity) * 100)}%
                </span>
              </div>

              {/* Trend Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                <span className="text-xs text-slate-400">Trend</span>
                <div className="flex items-center gap-1 ml-auto">
                  <svg
                    className={`w-4 h-4 ${
                      zone.trend === "rising"
                        ? "text-red-400"
                        : zone.trend === "falling"
                          ? "text-emerald-400"
                          : "text-slate-400"
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d={
                        zone.trend === "rising"
                          ? "M7 7h10v10"
                          : zone.trend === "falling"
                            ? "M7 7h10v10"
                            : "M5 12h14"
                      }
                    />
                  </svg>
                  <span className="text-xs font-medium text-slate-300">
                    {zone.trend.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Predictions */}
          {zonePredictions.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                AI Prediction
              </h4>
              {zonePredictions.map((pred) => (
                <div
                  key={pred.zoneId}
                  className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-amber-300 font-semibold">
                      10 MIN FORECAST
                    </span>
                    <span className="text-xs font-bold text-amber-400 tabular-nums">
                      {pred.predictedPct}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Confidence:{" "}
                    <span className="text-cyan-400 font-semibold">
                      {pred.confidence}%
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* AI Actions */}
          {zoneActions.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                AI Actions
              </h4>
              <div className="space-y-2">
                {zoneActions.map((action) => (
                  <div
                    key={action.id}
                    className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg"
                  >
                    <p className="text-xs text-violet-300 font-medium">
                      {action.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Data */}
          {zonePredictions.length === 0 && zoneActions.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              No AI predictions or actions for this zone yet.
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-5 py-3 border-t border-cyan-500/10 bg-white/[0.02]">
          <p className="text-[10px] text-slate-500 text-center">
            Press ESC to close • Click to dismiss
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
