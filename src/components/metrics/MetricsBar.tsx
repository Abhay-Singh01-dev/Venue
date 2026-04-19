import { useStore } from "../../store/useStore";
import { GlowCard } from "../ui/GlowCard";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { motion } from "framer-motion";

export function MetricsBar() {
  const zones = useStore((s) => s.zones);

  const totalAttendees = zones.reduce((s, z) => s + z.activeVisitors, 0);
  const alertCount = zones.filter(
    (z) => z.riskLevel === "critical" || z.riskLevel === "high",
  ).length;
  const highestRisk = [...zones].sort((a, b) => b.capacity - a.capacity)[0];
  const cardClass = "h-36 p-5 flex flex-col justify-between";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {/* Total Attendees */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0, duration: 0.4 }}
      >
        <GlowCard className={cardClass} glowColor="rgba(6,182,212,0.1)">
          <div>
            <span className="text-[11px] font-medium text-slate-400 tracking-widest">
              TOTAL ATTENDEES
            </span>
          </div>
          <div className="text-[34px] leading-none font-semibold text-white tabular-nums">
            <AnimatedNumber value={totalAttendees} />
          </div>
          <div className="text-xs text-cyan-400/60 mt-1">Live count</div>
        </GlowCard>
      </motion.div>

      {/* Active Alerts */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
      >
        <GlowCard
          className={cardClass}
          glowColor={
            alertCount > 0 ? "rgba(239,68,68,0.12)" : "rgba(6,182,212,0.1)"
          }
        >
          <div>
            <span className="text-[11px] font-medium text-slate-400 tracking-widest">
              ACTIVE ALERTS
            </span>
          </div>
          <div
            className={`text-[34px] leading-none font-semibold tabular-nums ${alertCount > 0 ? "text-red-400" : "text-white"}`}
          >
            <AnimatedNumber value={alertCount} />
          </div>
          <div
            className={`text-xs mt-1 ${alertCount > 0 ? "text-red-400/60" : "text-slate-500"}`}
          >
            {alertCount > 0 ? "Requires attention" : "All clear"}
          </div>
        </GlowCard>
      </motion.div>

      {/* Highest Risk Zone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.4 }}
      >
        <GlowCard className={cardClass} glowColor="rgba(245,158,11,0.1)">
          <div>
            <span className="text-[11px] font-medium text-slate-400 tracking-widest">
              HIGHEST RISK ZONE
            </span>
          </div>
          <div className="text-2xl font-semibold text-white truncate">
            {highestRisk?.name}
            <span className="text-sm text-slate-400 font-normal ml-2">
              {Math.round(highestRisk?.capacity || 0)}%
            </span>
          </div>
          <div className="text-xs text-amber-400/60 mt-1">Trending up</div>
        </GlowCard>
      </motion.div>

      {/* AI Status */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.4 }}
      >
        <GlowCard className={cardClass} glowColor="rgba(6,182,212,0.1)">
          <div>
            <span className="text-[11px] font-medium text-slate-400 tracking-widest">
              AI STATUS
            </span>
          </div>
          <div className="text-2xl font-semibold text-white flex items-center gap-2">
            Analyzing
            <span className="flex gap-0.5 mt-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    delay: i * 0.25,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </span>
          </div>
          <div className="text-xs text-cyan-400/60 mt-1">
            Processing sensor data...
          </div>
        </GlowCard>
      </motion.div>
    </div>
  );
}
