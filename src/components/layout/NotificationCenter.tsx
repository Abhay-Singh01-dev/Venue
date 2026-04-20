import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store/useStore";
import { ActivityEvent } from "../../types";

type Notice = {
  id: string;
  message: string;
  type: ActivityEvent["type"];
  timestampMs: number;
  timestampLabel: string;
};

const DOT_CLASS: Record<ActivityEvent["type"], string> = {
  info: "bg-cyan-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};

export function NotificationCenter() {
  const activityFeed = useStore((s) => s.activityFeed);
  const systemHealth = useStore((s) => s.systemHealth);
  const pipelineFallbackReason = useStore((s) => s.pipelineFallbackReason);
  const lastPipelineRun = useStore((s) => s.lastPipelineRun);
  const lastDataUpdate = useStore((s) => s.lastDataUpdate);
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Record<string, true>>({});
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "critical">(
    "all",
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = (timestampMs: number): string => {
    const deltaSec = Math.floor((Date.now() - timestampMs) / 1000);
    if (deltaSec <= 3) return "now";
    return new Date(timestampMs).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const notices = useMemo<Notice[]>(() => {
    const synthetic: Notice[] = [];

    if (systemHealth === "degraded" || systemHealth === "offline") {
      const timestampMs = lastDataUpdate.getTime();
      synthetic.push({
        id: `health-${systemHealth}`,
        message:
          systemHealth === "offline"
            ? "System temporarily unavailable. Reconnecting to pipeline."
            : pipelineFallbackReason ||
              "System degraded. Pipeline latency detected.",
        type: systemHealth === "offline" ? "critical" : "warning",
        timestampMs,
        timestampLabel: formatTimestamp(timestampMs),
      });
    }

    if (lastPipelineRun) {
      const timestampMs = new Date(lastPipelineRun).getTime();
      synthetic.push({
        id: `intervention-${lastPipelineRun}`,
        message: "Congestion risk detected. Mitigation action applied.",
        type: "success",
        timestampMs,
        timestampLabel: formatTimestamp(timestampMs),
      });
    }

    const feedMapped = activityFeed.slice(0, 40).map((event) => ({
      id: event.id,
      message: event.message,
      type: event.type,
      timestampMs: new Date(event.timestamp).getTime(),
      timestampLabel: formatTimestamp(new Date(event.timestamp).getTime()),
    }));

    return [...synthetic, ...feedMapped].sort(
      (a, b) => b.timestampMs - a.timestampMs,
    );
  }, [
    activityFeed,
    lastDataUpdate,
    lastPipelineRun,
    pipelineFallbackReason,
    systemHealth,
  ]);

  const unreadCount = notices.reduce(
    (count, notice) => count + (seenIds[notice.id] ? 0 : 1),
    0,
  );
  const criticalCount = notices.filter(
    (notice) => notice.type === "critical",
  ).length;
  const filteredNotices = notices.filter((notice) => {
    if (activeTab === "unread") return !seenIds[notice.id];
    if (activeTab === "critical") return notice.type === "critical";
    return true;
  });
  const badgeCount = Math.min(unreadCount, 9);

  const cycleFilter = (direction: 1 | -1) => {
    const order: Array<"all" | "unread" | "critical"> = [
      "all",
      "unread",
      "critical",
    ];
    const currentIndex = order.indexOf(activeTab);
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    setActiveTab(order[nextIndex]);
  };

  const markAllAsRead = () => {
    setSeenIds((prev) => {
      const next = { ...prev };
      notices.forEach((notice) => {
        next[notice.id] = true;
      });
      return next;
    });
  };

  return (
    <div
      className="relative"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
        if (event.key === "ArrowLeft") {
          cycleFilter(-1);
        }
        if (event.key === "ArrowRight") {
          cycleFilter(1);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-label={`System notifications${badgeCount > 0 ? `, ${badgeCount} unread` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-10 px-3 rounded-full bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors inline-flex items-center gap-2"
        title="System notifications"
      >
        <svg
          className="w-4 h-4 text-cyan-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        <span className="text-xs text-slate-300 font-medium">
          Notifications
        </span>
        {badgeCount > 0 && (
          <span
            className="h-5 min-w-[1.25rem] px-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] text-cyan-300 font-semibold inline-flex items-center justify-center"
            aria-live="polite"
          >
            {badgeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            role="menu"
            className="absolute top-full right-0 mt-2 w-[340px] max-h-[360px] overflow-y-auto bg-[#081428]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl z-[1000]"
          >
            <div className="px-4 py-3 border-b border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-cyan-300 font-semibold tracking-wider uppercase">
                  System Messages
                </p>
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Mark all read
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  aria-pressed={activeTab === "all"}
                  className={`h-7 px-2.5 rounded-md text-[10px] font-medium border transition-colors ${
                    activeTab === "all"
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                      : "bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All ({notices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("unread")}
                  aria-pressed={activeTab === "unread"}
                  className={`h-7 px-2.5 rounded-md text-[10px] font-medium border transition-colors ${
                    activeTab === "unread"
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                      : "bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("critical")}
                  aria-pressed={activeTab === "critical"}
                  className={`h-7 px-2.5 rounded-md text-[10px] font-medium border transition-colors ${
                    activeTab === "critical"
                      ? "bg-red-500/15 border-red-500/30 text-red-300"
                      : "bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Critical ({criticalCount})
                </button>
              </div>
            </div>
            <div className="py-1">
              {filteredNotices.length === 0 && (
                <p className="px-4 py-4 text-xs text-slate-500">
                  No messages in this view.
                </p>
              )}
              {filteredNotices.map((notice) => (
                <button
                  type="button"
                  key={notice.id}
                  className={`px-4 py-2.5 border-b border-white/[0.04] last:border-b-0 cursor-pointer transition-colors w-full text-left ${
                    seenIds[notice.id]
                      ? "hover:bg-white/[0.02]"
                      : "bg-cyan-500/[0.06] hover:bg-cyan-500/[0.1]"
                  }`}
                  onClick={() =>
                    setSeenIds((prev) => ({
                      ...prev,
                      [notice.id]: true,
                    }))
                  }
                  aria-label={`${notice.message}${seenIds[notice.id] ? " (read)" : " (unread)"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${DOT_CLASS[notice.type]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-slate-200 leading-relaxed">
                        {notice.message}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-slate-500">
                          {notice.timestampLabel}
                        </p>
                        {!seenIds[notice.id] && (
                          <span className="text-[9px] text-cyan-300 font-semibold uppercase tracking-wide">
                            New
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
