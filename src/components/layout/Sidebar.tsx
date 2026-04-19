// ── Sidebar ───────────────────────────────────────────────────────────

import { useStore } from "../../store/useStore";

export function Sidebar() {
  const systemHealth = useStore((s) => s.systemHealth);
  const healthDotClass =
    systemHealth === "healthy"
      ? "bg-emerald-400"
      : systemHealth === "degraded"
        ? "bg-amber-400"
        : "bg-red-400";
  const healthTextClass =
    systemHealth === "healthy"
      ? "text-emerald-300"
      : systemHealth === "degraded"
        ? "text-amber-300"
        : "text-red-300";

  return (
    <aside className="hidden lg:flex w-60 h-screen bg-[#060d1f] border-r border-white/[0.06] flex-col fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold text-white leading-none tracking-tight">
              FlowState AI
            </div>
            <div className="text-[11px] text-slate-500 font-medium tracking-[0.14em] mt-1">
              STADIUM OPS
            </div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="px-6 py-4">
        <div
          className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border border-white/[0.08] bg-white/[0.03] ${healthTextClass}`}
        >
          <div className={`w-2 h-2 rounded-full ${healthDotClass}`} />
          <span className="text-xs font-medium">System Active</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <button className="w-full h-11 flex items-center gap-3 px-4 rounded-xl text-sm font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 transition-all duration-200">
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
          </svg>
          Dashboard
        </button>
      </nav>

      {/* Footer */}
      <div className="px-6 py-6 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60" />
          AI Loop running every 30s
        </div>
        <div className="text-[10px] text-slate-600 mt-2">
          v2.4.1 • FlowState
        </div>
      </div>
    </aside>
  );
}
