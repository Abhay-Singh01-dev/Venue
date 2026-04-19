// ── Pipeline Ticker — Realism Signals (PHASE 10) ────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";

const TICKER_MESSAGES = [
  "[ANALYZING] Cross-referencing Gate A flow with North Concourse load...",
  "[CROSS-CHECK] Validating predictions against historical patterns...",
  "[MONITOR] Tracking real-time crowd velocity in Zone C...",
  "[PREDICT] Forecasting peak density in next 5 minutes...",
  "[ASSESS] Evaluating evacuation routing safety margins...",
];

export function PipelineTicker() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const backendSyncStatus = useStore((s) => s.backendSyncStatus);
  const lastPipelineRun = useStore((s) => s.lastPipelineRun);

  const isPipelineActive =
    backendSyncStatus === "live" &&
    !!lastPipelineRun &&
    Date.now() - new Date(lastPipelineRun).getTime() < 45_000;

  useEffect(() => {
    // Rotate ticker messages only while the live backend is fresh.
    if (isPipelineActive) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % TICKER_MESSAGES.length);
      }, 5500);

      return () => clearInterval(interval);
    }
  }, [isPipelineActive]);

  if (!isPipelineActive) {
    return null;
  }

  return (
    <div className="text-[11px] h-5 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.35 }}
          className="text-slate-500 font-mono tracking-tight"
        >
          {TICKER_MESSAGES[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
