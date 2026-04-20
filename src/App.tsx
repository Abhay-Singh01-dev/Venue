// ── FlowState AI — App Root ───────────────────────────────────────────

import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { MetricsBar } from "./components/metrics/MetricsBar";
import { DigitalTwin } from "./components/digital-twin/DigitalTwin";
import { AIReasoningPanel } from "./components/panels/AIReasoningPanel";
import { PredictionsPanel } from "./components/panels/PredictionsPanel";
import { ActionsPanel } from "./components/panels/ActionsPanel";
import { ActivityFeed } from "./components/panels/ActivityFeed";
import { BootOverlay } from "./components/overlays/BootOverlay";

export default function App() {
  const startBackendBridge = useStore((s) => s.startBackendBridge);
  const stopBackendBridge = useStore((s) => s.stopBackendBridge);

  useEffect(() => {
    startBackendBridge();
    return () => {
      stopBackendBridge();
    };
  }, [startBackendBridge, stopBackendBridge]);

  return (
    <div className="flex min-h-screen bg-[#020617]">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 ml-0 lg:ml-60 p-4 lg:p-6 overflow-y-auto"
        style={{ maxHeight: "100vh" }}
      >
        <Header />
        <MetricsBar />
        <DigitalTwin />

        {/* 2×2 Panel Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
          <AIReasoningPanel />
          <PredictionsPanel />
          <ActionsPanel />
          <ActivityFeed />
        </div>
      </main>

      {/* Boot Overlay (PHASE 1 - First Load) */}
      <BootOverlay />
    </div>
  );
}
