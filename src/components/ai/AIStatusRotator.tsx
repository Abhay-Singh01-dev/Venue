// ── AI Status Rotator — "Alive" Status (PHASE 3) ────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";

const STATUS_MESSAGES = [
  "Analyzing crowd flow patterns...",
  "Predicting congestion risk...",
  "Optimizing movement paths...",
  "Monitoring system stability...",
];

export function AIStatusRotator() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const backendSyncStatus = useStore((s) => s.backendSyncStatus);
  const lastPipelineRun = useStore((s) => s.lastPipelineRun);

  useEffect(() => {
    // Rotate status every 4 seconds, but pause when pipeline is actively updating
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const isPipelineActive =
    backendSyncStatus === "live" &&
    !!lastPipelineRun &&
    Date.now() - new Date(lastPipelineRun).getTime() < 45_000;

  return (
    <div className="h-5 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className={`flex items-center gap-2 text-xs ${
            isPipelineActive ? "text-cyan-300" : "text-slate-400"
          }`}
        >
          <motion.span
            animate={{ rotate: isPipelineActive ? 360 : 0 }}
            transition={{
              duration: isPipelineActive ? 1.5 : 0,
              repeat: isPipelineActive ? Infinity : 0,
              ease: "linear",
            }}
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isPipelineActive ? "bg-cyan-400" : "bg-slate-600"
            }`}
          />
          <span className="font-medium">{STATUS_MESSAGES[currentIndex]}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
