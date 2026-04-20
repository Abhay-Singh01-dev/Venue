import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityFeed } from "./ActivityFeed";

describe("ActivityFeed accessibility", () => {
  it("renders a live activity log region", () => {
    render(<ActivityFeed />);

    const log = screen.getByRole("log", { name: /live activity events/i });
    expect(log).toBeInTheDocument();
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("aria-relevant", "additions text");
  });
});
