// ── FlowState AI — Venue Definitions ──────────────────────────────────
// Three preset venues for the multi-venue Digital Twin.
// Each venue has typed zones with importance weights and flow paths.

import { Venue, VenuePath } from '../types';
import { createInitialZones } from './simulation';

// ═══════════════════════════════════════════════════════════════════════
// 1. STADIUM (reuses existing elliptical layout + simulation zones)
// ═══════════════════════════════════════════════════════════════════════

const stadiumZones = createInitialZones().map(z => ({
  ...z,
  importance: ((): number => {
    if (z.type === 'gate')      return 0.65;
    if (z.type === 'concourse') return 0.80;
    if (z.type === 'field')     return 0.50;
    if (z.type === 'deck')      return 0.70;
    return 0.50;
  })(),
}));

const stadiumPaths: VenuePath[] = [
  // Gates → Concourses
  { from: 'gate-a', to: 'north' },
  { from: 'gate-b', to: 'north' },
  { from: 'gate-c', to: 'east' },
  { from: 'gate-d', to: 'south' },
  { from: 'gate-e', to: 'south' },
  { from: 'gate-f', to: 'west' },
  // Concourse ring
  { from: 'north', to: 'east' },
  { from: 'east',  to: 'south' },
  { from: 'south', to: 'west' },
  { from: 'west',  to: 'north' },
  // Concourses → Field
  { from: 'north', to: 'field' },
  { from: 'east',  to: 'field' },
  { from: 'south', to: 'field' },
  { from: 'west',  to: 'field' },
];

// ═══════════════════════════════════════════════════════════════════════
// 2. AIRPORT / MALL  — rectangular grid layout
// ═══════════════════════════════════════════════════════════════════════
//
//  SVG 900 × 550
//
//  [  Entrance A  ]          [ Entrance B  ]     y ≈ 100
//        ↓   ↘             ↙    ↓
//  [Hall 1] ←→ [  Hall 2  ] ←→ [Hall 3]          y ≈ 225
//     ↓              ↓             ↓
//         [      Food Court      ]                 y ≈ 325
//           ↙                  ↘
//  [  Exit A  ]               [  Exit B  ]        y ≈ 442

const airportPaths: VenuePath[] = [
  { from: 'entrance-a', to: 'hall-1' },
  { from: 'entrance-a', to: 'hall-2' },
  { from: 'entrance-b', to: 'hall-2' },
  { from: 'entrance-b', to: 'hall-3' },
  { from: 'hall-1',     to: 'hall-2' },
  { from: 'hall-2',     to: 'hall-3' },
  { from: 'hall-1',     to: 'food-court' },
  { from: 'hall-2',     to: 'food-court' },
  { from: 'hall-3',     to: 'food-court' },
  { from: 'food-court', to: 'exit-a' },
  { from: 'food-court', to: 'exit-b' },
];

// ═══════════════════════════════════════════════════════════════════════
// 3. ARENA  — indoor arena with concentric radial layout
// ═══════════════════════════════════════════════════════════════════════
//
//  SVG 900 × 550
//
//  [TW-NW]   [   North Section   ]   [TW-NE]
//  [West ]   [   Center Stage    ]   [East ]
//  [TW-SW]   [   South Section   ]   [TW-SE]
//
//  Particles prefer radial center ↔ perimeter flow

const arenaPaths: VenuePath[] = [
  // Tunnels → adjacent sections (radial inflow)
  { from: 'tunnel-nw', to: 'section-north' },
  { from: 'tunnel-ne', to: 'section-north' },
  { from: 'tunnel-nw', to: 'section-west'  },
  { from: 'tunnel-sw', to: 'section-west'  },
  { from: 'tunnel-sw', to: 'section-south' },
  { from: 'tunnel-se', to: 'section-south' },
  { from: 'tunnel-ne', to: 'section-east'  },
  { from: 'tunnel-se', to: 'section-east'  },
  // Sections → Center (radial convergence)
  { from: 'section-north', to: 'center-stage' },
  { from: 'section-east',  to: 'center-stage' },
  { from: 'section-south', to: 'center-stage' },
  { from: 'section-west',  to: 'center-stage' },
];

// ═══════════════════════════════════════════════════════════════════════
// EXPORTED VENUES ARRAY
// ═══════════════════════════════════════════════════════════════════════

export const VENUES: Venue[] = [
  // ── 1. Stadium ────────────────────────────────────────────────────
  {
    id: 'stadium',
    name: 'Stadium',
    layoutType: 'stadium',
    zones: stadiumZones,
    paths: stadiumPaths,
  },

  // ── 2. Airport / Mall ────────────────────────────────────────────
  {
    id: 'airport',
    name: 'Airport',
    layoutType: 'grid',
    zones: [
      {
        id: 'entrance-a', name: 'Entrance A', shortName: 'ENT-A',
        capacity: 65, activeVisitors: 1300, maxCapacity: 2000, flowRate: 95,
        trend: 'rising',  riskLevel: 'moderate', type: 'entrance', importance: 0.90,
        position: { x: 252, y: 100 },
      },
      {
        id: 'entrance-b', name: 'Entrance B', shortName: 'ENT-B',
        capacity: 42, activeVisitors: 840,  maxCapacity: 2000, flowRate: 110,
        trend: 'stable',  riskLevel: 'low',      type: 'entrance', importance: 0.90,
        position: { x: 648, y: 100 },
      },
      {
        id: 'hall-1', name: 'Hall 1', shortName: 'Hall 1',
        capacity: 55, activeVisitors: 2750, maxCapacity: 5000, flowRate: 75,
        trend: 'stable',  riskLevel: 'moderate', type: 'hall', importance: 0.70,
        position: { x: 143, y: 225 },
      },
      {
        id: 'hall-2', name: 'Hall 2', shortName: 'Hall 2',
        capacity: 70, activeVisitors: 3500, maxCapacity: 5000, flowRate: 60,
        trend: 'rising',  riskLevel: 'high',     type: 'hall', importance: 0.70,
        position: { x: 450, y: 225 },
      },
      {
        id: 'hall-3', name: 'Hall 3', shortName: 'Hall 3',
        capacity: 40, activeVisitors: 2000, maxCapacity: 5000, flowRate: 95,
        trend: 'falling', riskLevel: 'low',      type: 'hall', importance: 0.70,
        position: { x: 757, y: 225 },
      },
      {
        id: 'food-court', name: 'Food Court', shortName: 'Food',
        capacity: 85, activeVisitors: 4250, maxCapacity: 5000, flowRate: 30,
        trend: 'rising',  riskLevel: 'critical', type: 'food_court', importance: 0.85,
        position: { x: 450, y: 325 },
      },
      {
        id: 'exit-a', name: 'Exit A', shortName: 'EXIT-A',
        capacity: 35, activeVisitors: 700,  maxCapacity: 2000, flowRate: 145,
        trend: 'stable',  riskLevel: 'low',      type: 'exit', importance: 1.00,
        position: { x: 252, y: 442 },
      },
      {
        id: 'exit-b', name: 'Exit B', shortName: 'EXIT-B',
        capacity: 45, activeVisitors: 900,  maxCapacity: 2000, flowRate: 125,
        trend: 'falling', riskLevel: 'low',      type: 'exit', importance: 1.00,
        position: { x: 648, y: 442 },
      },
    ],
    paths: airportPaths,
  },

  // ── 3. Arena ─────────────────────────────────────────────────────
  {
    id: 'arena',
    name: 'Arena',
    layoutType: 'custom',
    zones: [
      // Corner tunnels — high importance (primary ingress/egress points)
      {
        id: 'tunnel-nw', name: 'Tunnel NW', shortName: 'TW-NW',
        capacity: 40, activeVisitors: 200, maxCapacity: 500, flowRate: 120,
        trend: 'stable',  riskLevel: 'low',      type: 'gate', importance: 0.90,
        position: { x: 125, y: 95 },
      },
      {
        id: 'tunnel-ne', name: 'Tunnel NE', shortName: 'TW-NE',
        capacity: 35, activeVisitors: 175, maxCapacity: 500, flowRate: 130,
        trend: 'falling', riskLevel: 'low',      type: 'gate', importance: 0.90,
        position: { x: 775, y: 95 },
      },
      {
        id: 'tunnel-sw', name: 'Tunnel SW', shortName: 'TW-SW',
        capacity: 58, activeVisitors: 290, maxCapacity: 500, flowRate: 100,
        trend: 'stable',  riskLevel: 'moderate', type: 'gate', importance: 0.90,
        position: { x: 125, y: 455 },
      },
      {
        id: 'tunnel-se', name: 'Tunnel SE', shortName: 'TW-SE',
        capacity: 72, activeVisitors: 360, maxCapacity: 500, flowRate: 80,
        trend: 'rising',  riskLevel: 'high',     type: 'gate', importance: 0.90,
        position: { x: 775, y: 455 },
      },
      // Seating sections — medium importance
      {
        id: 'section-north', name: 'North Section', shortName: 'North',
        capacity: 63, activeVisitors: 1260, maxCapacity: 2000, flowRate: 70,
        trend: 'stable',  riskLevel: 'moderate', type: 'concourse', importance: 0.70,
        position: { x: 450, y: 162 },
      },
      {
        id: 'section-east', name: 'East Section', shortName: 'East',
        capacity: 78, activeVisitors: 1560, maxCapacity: 2000, flowRate: 55,
        trend: 'rising',  riskLevel: 'high',     type: 'concourse', importance: 0.70,
        position: { x: 671, y: 275 },
      },
      {
        id: 'section-south', name: 'South Section', shortName: 'South',
        capacity: 55, activeVisitors: 1100, maxCapacity: 2000, flowRate: 85,
        trend: 'stable',  riskLevel: 'moderate', type: 'concourse', importance: 0.70,
        position: { x: 450, y: 388 },
      },
      {
        id: 'section-west', name: 'West Section', shortName: 'West',
        capacity: 45, activeVisitors: 900,  maxCapacity: 2000, flowRate: 100,
        trend: 'falling', riskLevel: 'low',      type: 'concourse', importance: 0.70,
        position: { x: 229, y: 275 },
      },
      // Center stage — lower importance (crowds drawn toward it, not dispersed)
      // Higher importance = more particle density → radial inward bias emerges naturally
      {
        id: 'center-stage', name: 'Center Stage', shortName: 'Stage',
        capacity: 90, activeVisitors: 900,  maxCapacity: 1000, flowRate: 20,
        trend: 'rising',  riskLevel: 'critical', type: 'field', importance: 0.60,
        position: { x: 450, y: 275 },
      },
    ],
    paths: arenaPaths,
  },
];
