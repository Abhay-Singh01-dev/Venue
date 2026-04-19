// ── Error Overlay — Shows when backend unreachable or in degraded mode (PHASE 7)

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { useEffect, useRef, useState } from "react";

export function ErrorOverlay() {
  const systemHealth = useStore((s) => s.systemHealth);
  const pipelineFallbackReason = useStore((s) => s.pipelineFallbackReason);

  const isError = systemHealth === "offline" || systemHealth === "degraded";
  const [visible, setVisible] = useState(false);
  const prevHealthRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isError) {
      setVisible(false);
      prevHealthRef.current = null;
      return;
    }

    if (prevHealthRef.current !== systemHealth) {
      prevHealthRef.current = systemHealth;
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isError, systemHealth]);

  if (!isError || !visible) return null;

  const errorConfig = {
    offline: {
      title: "System Temporarily Unavailable",
      message: "Retrying connection to AI pipeline...",
      icon: "⚠",
      color: "from-red-500 to-red-600",
      borderColor: "border-red-400/45",
      bgColor: "bg-[#3a0b12]/95",
    },
    degraded: {
      title: "System Degraded",
      message:
        pipelineFallbackReason ||
        "Pipeline latency detected. AI responses may be delayed.",
      icon: "⚡",
      color: "from-amber-400 to-amber-500",
      borderColor: "border-amber-400/45",
      bgColor: "bg-[#37250a]/95",
    },
  };

  const config = errorConfig[systemHealth];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22 }}
        className={`fixed top-5 right-5 max-w-[340px] pointer-events-none z-[999] ${config.bgColor} border ${config.borderColor} rounded-xl overflow-hidden shadow-2xl`}
      >
        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div
            className={`text-2xl flex-shrink-0 bg-gradient-to-br ${config.color} text-white w-10 h-10 rounded-lg flex items-center justify-center`}
          >
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3
              className={`text-sm font-semibold ${systemHealth === "offline" ? "text-red-100" : "text-amber-100"}`}
            >
              {config.title}
            </h3>
            <p
              className={`text-xs mt-1 leading-relaxed ${systemHealth === "offline" ? "text-red-100/90" : "text-amber-100/90"}`}
            >
              {config.message}
            </p>
          </div>
        </div>

        {/* Pulse animation indicator */}
        {systemHealth === "offline" && (
          <div className="h-px bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0 animate-pulse" />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
