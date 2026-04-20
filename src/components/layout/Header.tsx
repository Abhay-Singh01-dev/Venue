import { useStore } from "../../store/useStore";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AIStatusRotator } from "../ai/AIStatusRotator";
import { PipelineTicker } from "../ai/PipelineTicker";
import { NotificationCenter } from "./NotificationCenter";

/**
 * Header
 *
 * Shows system health, simulation controls, notifications, and venue switching.
 */
export function Header() {
  const aiCycleCountdown = useStore((s) => s.aiCycleCountdown);
  const currentVenueId = useStore((s) => s.currentVenueId);
  const availableVenues = useStore((s) => s.availableVenues);
  const setVenue = useStore((s) => s.setVenue);
  const deleteCustomVenue = useStore((s) => s.deleteCustomVenue);
  const isSimulating = useStore((s) => s.isSimulating);
  const simulationSecondsRemaining = useStore(
    (s) => s.simulationSecondsRemaining,
  );
  const startSimulation = useStore((s) => s.startSimulation);
  const systemHealth = useStore((s) => s.systemHealth);
  const lastDataUpdate = useStore((s) => s.lastDataUpdate);
  const lastPipelineRun = useStore((s) => s.lastPipelineRun);
  const [time, setTime] = useState(new Date());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scenarioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (
        scenarioRef.current &&
        !scenarioRef.current.contains(event.target as Node)
      ) {
        setScenarioMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentVenue = availableVenues.find((v) => v.id === currentVenueId);

  // Calculate seconds since last update
  const secondsSinceUpdate = Math.floor(
    (Date.now() - lastDataUpdate.getTime()) / 1000,
  );
  const updateText =
    secondsSinceUpdate === 0 ? "now" : `${secondsSinceUpdate}s ago`;
  const lastRunText = lastPipelineRun
    ? new Date(lastPipelineRun).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "awaiting first run";

  const healthIndicator = {
    healthy: { color: "emerald", icon: "●", label: "Healthy" },
    degraded: { color: "amber", icon: "⚠", label: "Degraded" },
    offline: { color: "slate", icon: "●", label: "Offline" },
  }[systemHealth];

  const scenarios = [
    { label: "Normal Flow", value: "normal" },
    { label: "Gate Congestion", value: "congestion" },
    { label: "Halftime Surge", value: "halftime" },
    { label: "Emergency Exit", value: "emergency" },
  ];

  const chipClass =
    "h-10 px-4 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs inline-flex items-center gap-2 whitespace-nowrap";

  return (
    <header className="flex items-start justify-between mb-6 gap-6">
      <div className="min-w-0">
        <h1 className="text-4xl font-semibold text-white tracking-tight leading-tight">
          Operations Dashboard
        </h1>
        <p className="text-xl text-cyan-400/85 mt-2 font-medium max-w-[680px] leading-snug">
          Venue monitors, predicts, and prevents crowd risks in real time.
        </p>
        <div className="mt-3">
          <AIStatusRotator />
        </div>
        <div className="mt-2 h-5">
          <PipelineTicker />
        </div>
      </div>

      <div className="flex items-start gap-3 flex-wrap justify-end max-w-[58%]">
        <div className={chipClass}>
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              systemHealth === "healthy"
                ? "bg-emerald-400"
                : systemHealth === "degraded"
                  ? "bg-amber-400"
                  : "bg-slate-500"
            } ${systemHealth === "healthy" ? "live-pulse live-dot-glow" : ""}`}
          />
          <span
            className={`${
              systemHealth === "healthy"
                ? "text-emerald-400"
                : systemHealth === "degraded"
                  ? "text-amber-400"
                  : "text-slate-400"
            } font-medium tracking-wide`}
          >
            System: {healthIndicator?.label}
          </span>
        </div>

        <div className={`${chipClass} text-slate-400`}>
          Updated{" "}
          <span className="text-cyan-400 font-semibold">{updateText}</span>
        </div>

        <div className={`${chipClass} text-slate-400`}>
          AI Loop{" "}
          <span className="text-cyan-400 font-semibold tabular-nums">
            {aiCycleCountdown}s
          </span>
        </div>

        <div className={`${chipClass} text-slate-400`}>
          Last run{" "}
          <span className="text-cyan-400 font-semibold tabular-nums">
            {lastRunText}
          </span>
        </div>

        <div className={`${chipClass} text-slate-400`}>
          Local time{" "}
          <span className="text-cyan-400 font-semibold tabular-nums">
            {time.toLocaleTimeString("en-US", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        <NotificationCenter />

        {/* ── Venue Mode Switcher ─────────── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label={`Venue selector, current venue ${currentVenue?.name ?? "unknown"}`}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            className="h-10 flex items-center gap-2 px-4 rounded-full bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-[9px] text-slate-500 font-semibold tracking-widest uppercase select-none">
              Venue:
            </span>
            <span className="text-cyan-400 text-[11px] font-bold tracking-wide">
              {currentVenue?.name}
            </span>
            <span className="text-slate-500 text-[10px] ml-1">▼</span>
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-2 w-52 bg-[#0b1221]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="flex flex-col py-1.5">
                  {availableVenues.map((v) => (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                        currentVenueId === v.id
                          ? "bg-cyan-500/15"
                          : "hover:bg-white/[0.06]"
                      }`}
                      onClick={() => {
                        setVenue(v.id);
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-semibold ${currentVenueId === v.id ? "text-cyan-400" : "text-slate-300"}`}
                        >
                          {v.name}
                        </span>
                        {v.isCustom && (
                          <span className="text-[9px] text-slate-400 font-medium px-1.5 py-0.5 rounded bg-white/[0.06]">
                            Custom
                          </span>
                        )}
                      </div>

                      {v.isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomVenue(v.id);
                          }}
                          className="h-5 w-5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete Custom Layout"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Scenario Event Trigger (PHASE 6) ───────── */}
        <div className="relative" ref={scenarioRef}>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => setScenarioMenuOpen(!scenarioMenuOpen)}
              aria-label={
                isSimulating
                  ? `Scenario running, ${simulationSecondsRemaining} seconds remaining`
                  : "Open simulation scenario menu"
              }
              aria-haspopup="menu"
              aria-expanded={scenarioMenuOpen && !isSimulating}
              className={`h-10 flex items-center gap-2 px-4 rounded-full border text-sm font-medium transition-colors ${
                isSimulating
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/15"
              }`}
              title="Inject real-world scenario into system"
            >
              <span>
                {isSimulating
                  ? `Scenario Running · ${simulationSecondsRemaining}s`
                  : "Simulate Event"}
              </span>
              {!isSimulating && <span className="text-[11px]">▼</span>}
            </button>
            {!isSimulating && (
              <span className="text-[9px] text-slate-500 italic">
                Inject real-world scenario
              </span>
            )}
          </div>

          <AnimatePresence>
            {scenarioMenuOpen && !isSimulating && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-2 w-48 bg-[#0b1221]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
                role="menu"
                aria-label="Simulation scenarios"
              >
                <div className="flex flex-col py-1.5">
                  {scenarios.map((scenario) => (
                    <button
                      key={scenario.value}
                      role="menuitem"
                      aria-label={`Run scenario: ${scenario.label}`}
                      onClick={() => {
                        startSimulation(scenario.value);
                        setScenarioMenuOpen(false);
                      }}
                      className="px-3 py-2 mx-1 rounded-lg text-left text-[11px] text-slate-300 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors"
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
