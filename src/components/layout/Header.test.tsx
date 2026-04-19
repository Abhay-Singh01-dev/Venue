import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockStoreState = {
  aiCycleCountdown: 12,
  currentVenueId: "stadium-main",
  availableVenues: [
    { id: "stadium-main", name: "Main Stadium", isCustom: false },
  ],
  setVenue: vi.fn(),
  deleteCustomVenue: vi.fn(),
  isSimulating: false,
  simulationSecondsRemaining: 0,
  startSimulation: vi.fn(),
  systemHealth: "healthy",
  lastDataUpdate: new Date(),
  lastPipelineRun: new Date().toISOString(),
};

vi.mock("../../store/useStore", () => ({
  useStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("../ai/AIStatusRotator", () => ({
  AIStatusRotator: () => <div>AI status</div>,
}));

vi.mock("../ai/PipelineTicker", () => ({
  PipelineTicker: () => <div>Pipeline ticker</div>,
}));

vi.mock("./NotificationCenter", () => ({
  NotificationCenter: () => <div>Notifications</div>,
}));

import { Header } from "./Header";

describe("Header accessibility", () => {
  it("shows scenario trigger with menu semantics", () => {
    render(<Header />);

    const scenarioButton = screen.getByRole("button", {
      name: /open simulation scenario menu/i,
    });

    expect(scenarioButton).toBeInTheDocument();
    expect(scenarioButton).toHaveAttribute("aria-haspopup", "menu");
  });

  it("renders system health and ai loop indicators", () => {
    render(<Header />);

    expect(screen.getByText(/system: healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/ai loop/i)).toBeInTheDocument();
  });
});
