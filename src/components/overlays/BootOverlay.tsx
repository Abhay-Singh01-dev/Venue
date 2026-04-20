// ── Boot Overlay — First-Load Perception (PHASE 1) ─────────────────────

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * BootOverlay
 *
 * Briefly shows system initialization steps during the first render cycle.
 */
export function BootOverlay() {
  const [isVisible, setIsVisible] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Auto-hide after 2.5 seconds (fail-safe)
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2500);

    return () => clearTimeout(hideTimer);
  }, []);

  useEffect(() => {
    // Animate boot steps
    if (step < 4) {
      const stepTimer = setTimeout(() => {
        setStep(step + 1);
      }, 400);
      return () => clearTimeout(stepTimer);
    }
  }, [step]);

  if (!isVisible) return null;

  const steps = [
    "Connecting to Firestore...",
    "Booting AI decision engine...",
    "Syncing crowd simulation...",
    "System ready",
  ];

  return (
    <motion.div
      initial={{ opacity: 1, backdropFilter: "blur(0px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onAnimationComplete={() => {
        if (step >= 4) {
          setIsVisible(false);
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-br from-[#0f172a] via-[#0b1221] to-[#020617] border border-cyan-500/20 rounded-2xl p-8 shadow-2xl max-w-md"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Venue</h1>
          <p className="text-sm text-cyan-400 font-medium tracking-wide">
            Initializing...
          </p>
        </div>

        {/* Boot Steps */}
        <div className="space-y-3">
          {steps.map((stepText, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -12 }}
              animate={
                step > idx ? { opacity: 1, x: 0 } : { opacity: 0.3, x: -12 }
              }
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <div className="flex-shrink-0">
                {step > idx ? (
                  <motion.div
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center"
                  >
                    <span className="text-emerald-400 text-xs font-bold">
                      ✓
                    </span>
                  </motion.div>
                ) : step === idx ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="w-5 h-5 rounded-full border-2 border-cyan-500/40 border-t-cyan-400"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1]" />
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  step > idx
                    ? "text-emerald-300"
                    : step === idx
                      ? "text-cyan-400"
                      : "text-slate-600"
                }`}
              >
                {stepText}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={step >= 4 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-6 pt-6 border-t border-cyan-500/10"
        >
          <p className="text-xs text-slate-400 text-center">
            Dashboard loading • Please wait
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
