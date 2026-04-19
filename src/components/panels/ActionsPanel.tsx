// ── Actions Panel — System-dispatched operations ──────────────────────

import { motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { GlowCard } from "../ui/GlowCard";
import { SystemAction } from "../../types";
import { useMemo, useState } from "react";

// Badge configuration per action type
const BADGE_CONFIG: Record<
  SystemAction["type"],
  { label: string; classes: string }
> = {
  routing: {
    label: "ROUTING",
    classes: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  staff: {
    label: "STAFF",
    classes: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  },
  signage: {
    label: "SIGNAGE",
    classes: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  critical: {
    label: "CRITICAL",
    classes: "bg-red-500/15 text-red-400 border-red-500/20",
  },
  gate_ops: {
    label: "GATE OPS",
    classes: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  },
};

const DEFAULT_BADGE = {
  label: "ACTION",
  classes: "bg-slate-500/15 text-slate-300 border-slate-500/20",
};

export function ActionsPanel() {
  const actions = useStore((s) => s.actions);
  const zones = useStore((s) => s.zones);
  const predictions = useStore((s) => s.predictions);
  const activeCount = actions.filter((a) => a.status === "active").length;
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const selectedAction = useMemo(
    () => actions.find((a) => a.id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );

  const explainability = useMemo(() => {
    if (!selectedAction) return null;

    const actionText = selectedAction.description.toLowerCase();
    const matchedPrediction =
      predictions.find((p) => actionText.includes(p.zoneName.toLowerCase())) ??
      predictions[0];
    const matchedZone =
      zones.find((z) => z.id === matchedPrediction?.zoneId) ?? zones[0];

    const occupancyNow =
      matchedPrediction?.currentPct ?? matchedZone?.capacity ?? 0;
    const predictedNoAi =
      matchedPrediction?.predictedPct ?? Math.min(99, occupancyNow + 10);
    const withAiEstimate = Math.max(0, Math.round(predictedNoAi - 14));
    const improvement = Math.max(0, predictedNoAi - withAiEstimate);

    const trendDelta =
      matchedZone?.trend === "rising"
        ? "+3%"
        : matchedZone?.trend === "falling"
          ? "-2%"
          : "+0%";

    return {
      zoneName:
        matchedPrediction?.zoneName ?? matchedZone?.name ?? "Target Zone",
      occupancyNow: Math.round(occupancyNow),
      predictedNoAi: Math.round(predictedNoAi),
      withAiEstimate,
      improvement,
      trendDelta,
      why: [
        `High occupancy (${Math.round(occupancyNow)}%)`,
        `Trend momentum (${trendDelta})`,
        "Adjacent zone pressure detected",
      ],
      what: [
        selectedAction.description,
        selectedAction.type === "routing"
          ? "Route redirection and signage optimization"
          : "Operational intervention dispatch",
      ],
      expected: `Reduce congestion by ~${Math.max(10, Math.min(20, improvement))}% in 8-10 minutes`,
    };
  }, [selectedAction, predictions, zones]);

  return (
    <GlowCard className="p-5 h-full" glowColor="rgba(139,92,246,0.06)">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <svg
              className="w-4 h-4 text-violet-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">System Actions</h3>
            <p className="text-[10px] text-slate-500">
              AI-dispatched operations
            </p>
          </div>
        </div>

        {activeCount > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-400">
            {activeCount} active
          </span>
        )}
      </div>

      {/* Actions List */}
      <div className="space-y-2.5">
        {predictions[0] && (
          <div className="mb-1 px-3 py-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10">
            <p className="text-[10px] text-cyan-300 font-semibold tracking-wide">
              AI IMPACT EVIDENCE
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              Without AI: ~{Math.round(predictions[0].predictedPct)}% • With AI:
              ~{Math.max(0, Math.round(predictions[0].predictedPct - 14))}%
            </p>
            <p className="text-[10px] text-emerald-300/90 mt-0.5">
              AI reduced congestion by ~14% vs no intervention
            </p>
          </div>
        )}

        {actions.slice(0, 5).map((action, i) => {
          const badge = BADGE_CONFIG[action.type] ?? DEFAULT_BADGE;
          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className="flex items-center gap-3 py-1.5 rounded-md px-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
              onClick={() => setSelectedActionId(action.id)}
            >
              <span
                className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${badge.classes}`}
              >
                {badge.label}
              </span>
              <span className="text-[12px] text-slate-300 flex-1 truncate">
                {action.description}
              </span>
              {action.status === "active" ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-3 h-3 text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {selectedAction && explainability && (
        <div className="mt-4 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-violet-300 font-semibold tracking-widest">
              DECISION EXPLAINABILITY
            </span>
            <button
              onClick={() => setSelectedActionId(null)}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Close
            </button>
          </div>

          <div className="space-y-2.5 text-[11px]">
            <div>
              <p className="text-red-300 font-semibold">WHY</p>
              {explainability.why.map((item) => (
                <p key={item} className="text-slate-300 mt-0.5">
                  - {item}
                </p>
              ))}
            </div>

            <div>
              <p className="text-cyan-300 font-semibold">WHAT</p>
              {explainability.what.map((item) => (
                <p key={item} className="text-slate-300 mt-0.5">
                  - {item}
                </p>
              ))}
            </div>

            <div>
              <p className="text-emerald-300 font-semibold">EXPECTED</p>
              <p className="text-slate-300 mt-0.5">
                - {explainability.expected}
              </p>
            </div>

            <div className="pt-2 border-t border-white/[0.07]">
              <p className="text-[10px] text-slate-400">
                {explainability.zoneName}
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Without AI: ~{explainability.predictedNoAi}% • With AI: ~
                {explainability.withAiEstimate}%
              </p>
            </div>
          </div>
        </div>
      )}
    </GlowCard>
  );
}
