// ── AI Intervention Message — WOW Moment (PHASE 4) ────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { useEffect, useState, useRef } from "react";

export function AIInterventionMessage() {
  const [show, setShow] = useState(false);
  const lastPipelineRun = useStore((s) => s.lastPipelineRun);
  const prevPipelineRef = useRef<string | null>(null);

  useEffect(() => {
    // Show message when a new pipeline run completes (timestamp changes)
    if (lastPipelineRun && lastPipelineRun !== prevPipelineRef.current) {
      prevPipelineRef.current = lastPipelineRun;
      setShow(true);

      // Auto-hide after 3 seconds
      const timer = setTimeout(() => {
        setShow(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [lastPipelineRun]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.28 }}
          className="fixed top-[5.5rem] right-5 z-[998]"
        >
          <div className="bg-[#063022]/95 border border-emerald-400/35 rounded-lg px-3.5 py-2.5 shadow-lg backdrop-blur-sm max-w-[320px]">
            <div className="flex items-start gap-2.5">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.8 }}
                className="w-2 h-2 rounded-full bg-emerald-400 mt-1"
              />
              <div>
                <p className="text-[11px] uppercase tracking-widest text-emerald-200 font-semibold">
                  AI Intervention
                </p>
                <p className="text-[13px] leading-snug text-emerald-50 mt-1">
                  Congestion risk detected. Mitigation action applied.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
