// ── Predictions Panel — Top 3 predicted hotspots ──────────────────────

import { motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { GlowCard } from "../ui/GlowCard";

export function PredictionsPanel() {
  const predictions = useStore((s) => s.predictions);

  return (
    <GlowCard className="p-5 h-full" glowColor="rgba(239,68,68,0.06)">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center">
          <svg
            className="w-4 h-4 text-red-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">
            Predicted Hotspots
          </h3>
          <p className="text-[10px] text-slate-500">Next 10 minutes forecast</p>
        </div>
      </div>

      {/* Prediction Items */}
      <div className="space-y-4">
        {predictions.map((pred, i) => (
          <motion.div
            key={pred.zoneId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            {/* Zone header */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-white">
                {pred.zoneName}
              </span>
              <div className="flex items-center gap-1.5">
                <svg
                  className={`w-3 h-3 ${pred.trend === "up" ? "text-red-400" : "text-emerald-400"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path
                    d={pred.trend === "up" ? "M7 17l5-5 5 5" : "M7 7l5 5 5-5"}
                  />
                </svg>
                <span className="text-[10px] text-slate-400">
                  in {pred.timeMinutes} min
                </span>
              </div>
            </div>

            {/* Progress bar: current → predicted */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-red-400 font-bold tabular-nums w-8">
                {pred.currentPct}%
              </span>
              <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-red-400/10 to-red-500/5" />
                {/* Current level */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500 to-red-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${pred.currentPct}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  style={{ width: `${Math.max(20, pred.currentPct * 0.25)}%` }}
                  animate={{ x: ["-30%", "260%"] }}
                  transition={{
                    duration: 4.8,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                />
                {/* Predicted level (dashed overlay) */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full border-r-2 border-dashed border-red-300/40"
                  style={{ width: `${pred.predictedPct}%` }}
                  animate={{ opacity: [0.3, 0.55, 0.3] }}
                  transition={{
                    duration: 3.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
              <span className="text-[11px] text-red-300 font-bold tabular-nums w-8 text-right">
                {pred.predictedPct}%
              </span>
            </div>

            {/* Confidence bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">
                Confidence score
              </span>
              <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${pred.confidence}%` }}
                  transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] text-cyan-400 font-semibold tabular-nums">
                {pred.confidence}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </GlowCard>
  );
}
