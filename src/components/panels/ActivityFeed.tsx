// ── Activity Feed — Live event timeline ───────────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { GlowCard } from "../ui/GlowCard";
import { ActivityEvent } from "../../types";
import { useEffect, useRef } from "react";

const DOT_COLORS: Record<ActivityEvent["type"], string> = {
  info: "bg-cyan-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityFeed() {
  const feed = useStore((s) => s.activityFeed);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event (PHASE 6)
  useEffect(() => {
    if (scrollContainerRef.current) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 0);
    }
  }, [feed.length]);

  return (
    <GlowCard
      className="p-5 h-full flex flex-col"
      glowColor="rgba(6,182,212,0.06)"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <svg
              className="w-4 h-4 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Activity Feed</h3>
            <p className="text-[10px] text-slate-500">System event log</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse" />
          <span className="text-[10px] text-emerald-400 font-medium">Live</span>
        </div>
      </div>

      {/* Event List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0"
        style={{ maxHeight: "240px" }}
      >
        <AnimatePresence initial={false} mode="sync">
          {feed.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25 }}
              className="flex items-start gap-2.5 py-2 border-b border-white/[0.03] last:border-0"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${DOT_COLORS[event.type]}`}
              />
              <p className="text-[12px] text-slate-300 flex-1 leading-relaxed">
                {event.message}
              </p>
              <span className="text-[10px] text-slate-600 tabular-nums flex-shrink-0 mt-0.5">
                {formatTime(event.timestamp)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlowCard>
  );
}
