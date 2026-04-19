// ── Zone Tooltip — Solid, dark, animated ──────────────────────────────
import { motion } from 'framer-motion';
import { Zone, getRiskColor, getRiskTextClass } from '../../types';

interface ZoneTooltipProps {
  zone: Zone;
  x: number;
  y: number;
}

export function ZoneTooltip({ zone, x, y }: ZoneTooltipProps) {
  const trendIcon = zone.trend === 'rising' ? '↑' : zone.trend === 'falling' ? '↓' : '→';
  const trendLabel = zone.trend === 'rising' ? 'Rising' : zone.trend === 'falling' ? 'Falling' : 'Stable';

  // Keep tooltip within bounds (offset from cursor)
  const offsetX = x > 600 ? -220 : 16;
  const offsetY = y > 350 ? -160 : 16;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute pointer-events-none z-50"
      style={{ left: x + offsetX, top: y + offsetY }}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 min-w-[190px] shadow-2xl"
        style={{ borderLeftColor: getRiskColor(zone.riskLevel), borderLeftWidth: 3 }}
      >
        {/* Zone Name + Risk Dot */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-2 h-2 rounded-full" style={{ background: getRiskColor(zone.riskLevel), boxShadow: `0 0 6px ${getRiskColor(zone.riskLevel)}` }} />
          <span className="text-sm font-semibold text-white">{zone.name}</span>
        </div>

        {/* Stats Grid */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Capacity</span>
            <span className="text-white font-semibold tabular-nums">{Math.round(zone.capacity)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Active visitors</span>
            <span className="text-white font-semibold tabular-nums">{zone.activeVisitors.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Flow rate</span>
            <span className="text-white font-semibold tabular-nums">{zone.flowRate}/min</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Trend</span>
            <span className={`font-semibold ${getRiskTextClass(zone.riskLevel)}`}>
              {trendIcon} {trendLabel}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
