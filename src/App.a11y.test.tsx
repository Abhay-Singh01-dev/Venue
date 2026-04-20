import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

type AppStoreState = {
  startBackendBridge: () => void;
  stopBackendBridge: () => void;
};

const mockStoreState: AppStoreState = {
  startBackendBridge: vi.fn(),
  stopBackendBridge: vi.fn(),
};

vi.mock("./store/useStore", () => ({
  useStore: (selector: (state: AppStoreState) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("./components/layout/Sidebar", () => ({
  Sidebar: () => <aside aria-label="Primary navigation">Sidebar</aside>,
}));

vi.mock("./components/layout/Header", () => ({
  Header: () => <header>Header</header>,
}));

vi.mock("./components/metrics/MetricsBar", () => ({
  MetricsBar: () => <section aria-label="Metrics">Metrics</section>,
}));

vi.mock("./components/digital-twin/DigitalTwin", () => ({
  DigitalTwin: () => <section aria-label="Digital twin">Digital Twin</section>,
}));

vi.mock("./components/panels/AIReasoningPanel", () => ({
  AIReasoningPanel: () => (
    <section aria-label="AI reasoning">AI Reasoning</section>
  ),
}));

vi.mock("./components/panels/PredictionsPanel", () => ({
  PredictionsPanel: () => (
    <section aria-label="Predictions">Predictions</section>
  ),
}));

vi.mock("./components/panels/ActionsPanel", () => ({
  ActionsPanel: () => <section aria-label="Actions">Actions</section>,
}));

vi.mock("./components/panels/ActivityFeed", () => ({
  ActivityFeed: () => (
    <section aria-label="Activity feed">Activity Feed</section>
  ),
}));

vi.mock("./components/overlays/BootOverlay", () => ({
  BootOverlay: () => <div aria-hidden="true">Boot Overlay</div>,
}));

import App from "./App";

describe("App dashboard accessibility", () => {
  it("renders dashboard shell with zero axe violations", async () => {
    const { container } = render(<App />);

    const results = await axe(container, {
      rules: {
        // JSDOM does not implement canvas APIs used by axe color-contrast checks.
        "color-contrast": { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
