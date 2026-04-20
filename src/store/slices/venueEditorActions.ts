import {
  generatePredictions,
  generateReasoning,
  generateTelemetry,
} from "../../data/simulation";
import type { Venue, Zone } from "../../types";
import type { FlowStateStore } from "../storeTypes";

type StoreSet = (
  partial:
    | Partial<FlowStateStore>
    | ((state: FlowStateStore) => Partial<FlowStateStore>),
  replace?: boolean,
) => void;

type StoreGet = () => FlowStateStore;

type VenueEditorActionKeys =
  | "selectZone"
  | "setVenue"
  | "toggleEditMode"
  | "cancelEditing"
  | "selectEditorZone"
  | "toggleAddingPath"
  | "updateZonePosition"
  | "updateZoneData"
  | "addZone"
  | "deleteZone"
  | "addPath"
  | "removePath"
  | "saveCustomVenue"
  | "deleteCustomVenue";

const EDIT_CANVAS_SHIFT_X = 150;
const EDIT_CANVAS_SHIFT_Y = 35;

interface VenueEditorActionOptions {
  applyLatestBackendSnapshot: () => void;
}

export function createVenueEditorActions(
  set: StoreSet,
  get: StoreGet,
  options: VenueEditorActionOptions,
): Pick<FlowStateStore, VenueEditorActionKeys> {
  const { applyLatestBackendSnapshot } = options;

  return {
    // Toggle open/close telemetry panel and lazily seed chart data.
    selectZone: (id) => {
      const state = get();

      if (id === state.selectedZoneId) {
        set({ selectedZoneId: null });
        return;
      }

      if (id && !state.telemetryData[id]) {
        const zone = state.zones.find((z) => z.id === id);
        if (zone) {
          set({
            selectedZoneId: id,
            telemetryData: {
              ...state.telemetryData,
              [id]: generateTelemetry(zone),
            },
          });
          return;
        }
      }

      set({ selectedZoneId: id });
    },

    setVenue: (venueId) => {
      const state = get();
      const venue = state.availableVenues.find((v) => v.id === venueId);
      if (!venue) return;

      set({
        currentVenueId: venueId,
        zones: venue.zones,
        selectedZoneId: null,
        telemetryData: {},
        predictionMode: "current",
        predictions: generatePredictions(venue.zones),
        reasoning: generateReasoning(venue.zones),
        aiCycleCountdown: 30,
        editMode: false,
        tempVenue: null,
        editorSelectedZoneId: null,
        editorPathSource: null,
        isAddingPath: false,
      });

      if (venueId === "stadium") {
        applyLatestBackendSnapshot();
      }
    },

    toggleEditMode: () => {
      const state = get();
      if (state.editMode) {
        set({
          editMode: false,
          tempVenue: null,
          editorSelectedZoneId: null,
          editorPathSource: null,
          isAddingPath: false,
        });
        return;
      }

      const activeVenue =
        state.availableVenues.find((v) => v.id === state.currentVenueId) ??
        state.availableVenues[0];
      const shouldCenterForEdit = !activeVenue.isCustom;

      const zones = activeVenue.zones.map((z) => ({
        ...z,
        position: shouldCenterForEdit
          ? {
              x: Math.max(
                80,
                Math.min(1120, z.position.x + EDIT_CANVAS_SHIFT_X),
              ),
              y: Math.max(
                40,
                Math.min(580, z.position.y + EDIT_CANVAS_SHIFT_Y),
              ),
            }
          : z.position,
      }));

      const paths = activeVenue.paths.map((p, i) => ({
        ...p,
        id: p.id ?? `path-${Date.now()}-${i}`,
      }));

      set({
        editMode: true,
        tempVenue: { ...activeVenue, zones, paths },
        editorSelectedZoneId: null,
        editorPathSource: null,
        isAddingPath: false,
      });
    },

    cancelEditing: () =>
      set({
        editMode: false,
        tempVenue: null,
        editorSelectedZoneId: null,
        editorPathSource: null,
        isAddingPath: false,
      }),

    selectEditorZone: (id) => {
      const state = get();
      if (state.isAddingPath) {
        if (id === null) {
          set({ isAddingPath: false, editorPathSource: null });
        } else if (!state.editorPathSource) {
          set({ editorPathSource: id });
        } else if (id !== state.editorPathSource) {
          get().addPath(state.editorPathSource, id);
        }
        return;
      }
      set({ editorSelectedZoneId: id });
    },

    toggleAddingPath: () => {
      const state = get();
      if (state.isAddingPath) {
        set({ isAddingPath: false, editorPathSource: null });
      } else {
        set({
          isAddingPath: true,
          editorPathSource: null,
          editorSelectedZoneId: null,
        });
      }
    },

    updateZonePosition: (id, position) => {
      const state = get();
      if (!state.tempVenue) return;
      const zones = state.tempVenue.zones.map((z) =>
        z.id === id ? { ...z, position } : z,
      );
      set({ tempVenue: { ...state.tempVenue, zones } });
    },

    updateZoneData: (id, updates) => {
      const state = get();
      if (!state.tempVenue) return;
      const zones = state.tempVenue.zones.map((z) =>
        z.id === id ? { ...z, ...updates } : z,
      );
      set({ tempVenue: { ...state.tempVenue, zones } });
    },

    addZone: () => {
      const state = get();
      if (!state.tempVenue || state.tempVenue.zones.length >= 12) return;

      const idx = state.tempVenue.zones.length;
      const offsets = [
        [0, 0],
        [-160, -80],
        [160, -80],
        [-160, 80],
        [160, 80],
        [0, -120],
        [0, 120],
        [-240, 0],
        [240, 0],
        [-80, -120],
        [80, 120],
        [-240, -80],
      ];

      const [ox, oy] = offsets[idx % offsets.length];
      const newZone: Zone = {
        id: `zone-${Date.now()}`,
        name: `Zone ${idx + 1}`,
        shortName: `Z${idx + 1}`,
        capacity: 50,
        activeVisitors: 500,
        maxCapacity: 1000,
        flowRate: 80,
        trend: "stable",
        riskLevel: "moderate",
        type: "zone",
        importance: 0.5,
        position: {
          x: Math.max(80, Math.min(820, 450 + ox)),
          y: Math.max(40, Math.min(510, 275 + oy)),
        },
      };

      set({
        tempVenue: {
          ...state.tempVenue,
          zones: [...state.tempVenue.zones, newZone],
        },
      });
    },

    deleteZone: (id) => {
      const state = get();
      if (!state.tempVenue) return;

      const zones = state.tempVenue.zones.filter((z) => z.id !== id);
      const paths = state.tempVenue.paths.filter(
        (p) => p.from !== id && p.to !== id,
      );

      set({
        tempVenue: { ...state.tempVenue, zones, paths },
        editorSelectedZoneId:
          state.editorSelectedZoneId === id ? null : state.editorSelectedZoneId,
      });
    },

    addPath: (from, to) => {
      const state = get();
      if (!state.tempVenue) return;

      const exists = state.tempVenue.paths.some(
        (p) =>
          (p.from === from && p.to === to) || (p.from === to && p.to === from),
      );
      const newPath = { id: `path-${Date.now()}`, from, to };

      set({
        tempVenue: exists
          ? state.tempVenue
          : { ...state.tempVenue, paths: [...state.tempVenue.paths, newPath] },
        editorPathSource: null,
        isAddingPath: false,
      });
    },

    removePath: (pathId) => {
      const state = get();
      if (!state.tempVenue) return;
      const paths = state.tempVenue.paths.filter((p) => p.id !== pathId);
      set({ tempVenue: { ...state.tempVenue, paths } });
    },

    saveCustomVenue: (name) => {
      const state = get();
      if (!state.tempVenue || state.tempVenue.zones.length === 0) return;

      const customCount = state.availableVenues.filter(
        (v) => v.isCustom,
      ).length;
      const venueName = name.trim() || `Custom Venue ${customCount + 1}`;
      const venueId = `custom-${Date.now()}`;
      const newVenue: Venue = {
        ...state.tempVenue,
        id: venueId,
        name: venueName,
        layoutType: "custom",
        isCustom: true,
      };

      set({
        availableVenues: [...state.availableVenues, newVenue],
        currentVenueId: venueId,
        zones: newVenue.zones,
        editMode: false,
        tempVenue: null,
        editorSelectedZoneId: null,
        editorPathSource: null,
        isAddingPath: false,
        selectedZoneId: null,
        telemetryData: {},
        predictionMode: "current",
        predictions: generatePredictions(newVenue.zones),
        reasoning: generateReasoning(newVenue.zones),
        aiCycleCountdown: 30,
      });
    },

    deleteCustomVenue: (id) => {
      const state = get();
      const newVenues = state.availableVenues.filter((v) => v.id !== id);
      set({ availableVenues: newVenues });

      if (state.currentVenueId === id && newVenues.length > 0) {
        get().setVenue(newVenues[0].id);
      }
    },
  };
}
