// ── Venue Renderer — Layout Router ─────────────────────────────────────
// Selects the correct SVG layout based on venue.layoutType.
// Keeps StadiumSVG untouched; passes paths to grid/arena variants.

import { Venue, Zone } from "../../types";
import { StadiumSVG } from "./StadiumSVG";
import { GridLayoutSVG } from "./GridLayoutSVG";
import { ArenaLayoutSVG } from "./ArenaLayoutSVG";
import { CustomEditorSVG } from "./CustomEditorSVG";

interface VenueRendererProps {
  venue: Venue;
  zones: Zone[]; // simulated zones from store (not venue.zones)
  selectedZoneId: string | null;
  predictionMode: "current" | "predicted";
  predictions: Array<{ zoneId: string; predictedPct: number }>;
  onZoneClick: (zoneId: string) => void;
  onZoneHover: (zone: Zone | null, e?: React.MouseEvent) => void;
  // Editor props
  editMode?: boolean;
  isAddingPath?: boolean;
  editorPathSource?: string | null;
  onZoneDragEnd?: (zoneId: string, pos: { x: number; y: number }) => void;
  onZoneResizeEnd?: (zoneId: string, size: { w: number; h: number }) => void;
  onPathDelete?: (pathId: string) => void;
}

/**
 * VenueRenderer
 *
 * Routes the active venue to the correct SVG renderer for the current layout.
 */
export function VenueRenderer({
  venue,
  zones,
  selectedZoneId,
  predictionMode,
  predictions,
  onZoneClick,
  onZoneHover,
  editMode = false,
  isAddingPath = false,
  editorPathSource = null,
  onZoneDragEnd = () => {},
  onZoneResizeEnd = () => {},
  onPathDelete = () => {},
}: VenueRendererProps) {
  const sharedProps = {
    zones,
    selectedZoneId,
    predictionMode,
    predictions,
    onZoneClick,
    onZoneHover,
  };

  if (editMode || venue.isCustom) {
    return (
      <CustomEditorSVG
        paths={venue.paths}
        editMode={editMode}
        isAddingPath={isAddingPath}
        editorPathSource={editorPathSource}
        onZoneDragEnd={onZoneDragEnd}
        onZoneResizeEnd={onZoneResizeEnd}
        onPathDelete={onPathDelete}
        {...sharedProps}
      />
    );
  }

  if (venue.layoutType === "stadium") {
    return <StadiumSVG {...sharedProps} />;
  }
  if (venue.layoutType === "grid") {
    return <GridLayoutSVG paths={venue.paths} {...sharedProps} />;
  }
  if (venue.layoutType === "custom") {
    return <ArenaLayoutSVG paths={venue.paths} {...sharedProps} />;
  }
  // Fallback
  return <StadiumSVG {...sharedProps} />;
}
