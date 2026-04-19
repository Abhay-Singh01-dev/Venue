import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockStoreState = {
  systemHealth: "healthy",
};

vi.mock("../../store/useStore", () => ({
  useStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("renders dashboard navigation and system status", () => {
    render(<Sidebar />);

    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/system active/i)).toBeInTheDocument();
  });

  it("renders operational footer signal", () => {
    render(<Sidebar />);

    expect(screen.getByText(/ai loop running every 30s/i)).toBeInTheDocument();
  });
});
