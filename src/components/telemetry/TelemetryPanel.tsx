// ── Telemetry Panel — Recharts-based zone telemetry ───────────────────
// Slides up below Digital Twin when a zone is clicked.
// Shows: Crowd Pressure, Flow Speed, Anomaly Level

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { getRiskColor } from "../../types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

type ChartTooltipPayload = {
  name?: string;
  value?: number | string;
  stroke?: string;
  fill?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
};

// ── Custom Tooltip ────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-[11px] shadow-xl">
      <p className="text-slate-400 mb-1">{String(label ?? "")}</p>
      {payload.map((p, i: number) => (
        <p
          key={i}
          className="font-semibold tabular-nums"
          style={{ color: p.stroke || p.fill }}
        >
          {p.name}:{" "}
          {typeof p.value === "number"
            ? p.value.toFixed(p.name === "anomaly" ? 2 : 0)
            : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function TelemetryPanel() {
  const selectedZoneId = useStore((s) => s.selectedZoneId);
  const telemetryData = useStore((s) => s.telemetryData);
  const zones = useStore((s) => s.zones);
  const selectZone = useStore((s) => s.selectZone);

  const zone = zones.find((z) => z.id === selectedZoneId);
  const data = selectedZoneId ? telemetryData[selectedZoneId] : null;

  // ESC key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectZone(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectZone]);

  const chartCommon = {
    margin: { top: 4, right: 4, bottom: 0, left: -20 },
  };

  const axisProps = {
    tick: { fontSize: 9, fill: "#475569" },
    axisLine: false,
    tickLine: false,
  };

  return (
    <AnimatePresence mode="sync">
      {selectedZoneId && zone && data && (
        <motion.div
          key="telemetry"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div
            className="bg-[#020617]/95 backdrop-blur-md border-t border-white/[0.07] p-5"
            role="region"
            aria-label={`${zone.name} telemetry`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: getRiskColor(zone.riskLevel),
                    boxShadow: `0 0 6px ${getRiskColor(zone.riskLevel)}`,
                  }}
                />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {zone.name}
                    <span className="text-slate-500 font-normal ml-2">
                      — Zone Telemetry
                    </span>
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    zone.riskLevel === "critical"
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : zone.riskLevel === "high"
                        ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  }`}
                >
                  {Math.round(zone.capacity)}%
                </span>
              </div>
              <button
                onClick={() => selectZone(null)}
                aria-label="Close telemetry panel"
                className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Crowd Pressure */}
              <div>
                <h4 className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mb-2">
                  Crowd Pressure
                </h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.points} {...chartCommon}>
                      <defs>
                        <linearGradient
                          id="tl-cap-grad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#06b6d4"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="#06b6d4"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                      />
                      <XAxis
                        dataKey="time"
                        {...axisProps}
                        interval="preserveStartEnd"
                      />
                      <YAxis domain={[0, 100]} {...axisProps} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="capacity"
                        name="capacity"
                        stroke="#06b6d4"
                        strokeWidth={1.5}
                        fill="url(#tl-cap-grad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Flow Speed */}
              <div>
                <h4 className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mb-2">
                  Flow Speed
                </h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.points} {...chartCommon}>
                      <defs>
                        <linearGradient
                          id="tl-flow-grad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#10b981"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                      />
                      <XAxis
                        dataKey="time"
                        {...axisProps}
                        interval="preserveStartEnd"
                      />
                      <YAxis {...axisProps} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="flowSpeed"
                        name="speed"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="url(#tl-flow-grad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Anomaly Level */}
              <div>
                <h4 className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mb-2">
                  Anomaly Level
                </h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.points} {...chartCommon}>
                      <defs>
                        <linearGradient
                          id="tl-anom-grad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ef4444"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ef4444"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                      />
                      <XAxis
                        dataKey="time"
                        {...axisProps}
                        interval="preserveStartEnd"
                      />
                      <YAxis domain={[0, 1]} {...axisProps} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine
                        y={0.7}
                        stroke="rgba(239,68,68,0.3)"
                        strokeDasharray="4 4"
                        label=""
                      />
                      <Area
                        type="monotone"
                        dataKey="anomaly"
                        name="anomaly"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        fill="url(#tl-anom-grad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
