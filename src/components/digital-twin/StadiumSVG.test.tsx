import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StadiumSVG } from "./StadiumSVG";
import { Zone } from "../../types";

const baseZone: Zone = {
  id: "north",
  name: "North Concourse",
  shortName: "NORTH",
  capacity: 72,
  activeVisitors: 1200,
  maxCapacity: 2000,
  flowRate: 140,
  trend: "rising",
  riskLevel: "moderate",
  position: { x: 420, y: 170 },
  type: "concourse",
};

describe("StadiumSVG accessibility", () => {
  it("renders interactive zone with keyboard semantics", () => {
    const onZoneClick = vi.fn();

    render(
      <StadiumSVG
        zones={[baseZone]}
        selectedZoneId={null}
        predictionMode="current"
        predictions={[]}
        onZoneClick={onZoneClick}
        onZoneHover={() => {}}
      />,
    );

    const zoneButton = screen.getByRole("button", {
      name: /north concourse zone/i,
    });

    expect(zoneButton).toBeInTheDocument();
    expect(zoneButton).toHaveAttribute("tabindex", "0");
  });

  it("triggers zone click when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onZoneClick = vi.fn();

    render(
      <StadiumSVG
        zones={[baseZone]}
        selectedZoneId={null}
        predictionMode="current"
        predictions={[]}
        onZoneClick={onZoneClick}
        onZoneHover={() => {}}
      />,
    );

    const zoneButton = screen.getByRole("button", {
      name: /north concourse zone/i,
    });

    zoneButton.focus();
    await user.keyboard("{Enter}");

    expect(onZoneClick).toHaveBeenCalledWith("north");
  });
});
