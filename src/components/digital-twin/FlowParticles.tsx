// ── Flow Particles — Dynamic crowd flow visualization ──────────────────
// Uses direct DOM manipulation via requestAnimationFrame for 60fps perf.
// v2: venue-agnostic. Paths come from the active Venue definition.
//     Zone positions are resolved at runtime from zone.position.
//     Particle density is biased by zone.importance weight.

import { useEffect, useRef } from 'react';
import { Zone, VenuePath, getRiskColor } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────

interface ResolvedPath {
  fromId: string;
  toId:   string;
  from:   { x: number; y: number };
  to:     { x: number; y: number };
}

interface Particle {
  pathIdx:  number;
  progress: number;
  speed:    number;
  opacity:  number;
  color:    string;
  offsetX:  number;
  offsetY:  number;
  reverse:  boolean;
}

const MAX_PARTICLES = 32;

// ── Component ──────────────────────────────────────────────────────────

interface FlowParticlesProps {
  zones: Zone[];
  paths: VenuePath[];
}

export function FlowParticles({ zones, paths }: FlowParticlesProps) {
  const gRef             = useRef<SVGGElement>(null);
  const particlesRef     = useRef<Particle[]>([]);
  const zonesRef         = useRef(zones);
  const resolvedPathsRef = useRef<ResolvedPath[]>([]);
  const rafRef           = useRef<number>();

  // ── Keep zonesRef current (position + capacity for color) ──────────
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // ── Re-initialize animation when paths change (venue switch) ───────
  useEffect(() => {
    const g = gRef.current;
    if (!g || paths.length === 0) return;

    // Cancel any running animation and clear old circles
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    while (g.firstChild) g.removeChild(g.firstChild);

    // Resolve paths: look up zone.position for each end-point
    const buildResolvedPaths = (): ResolvedPath[] => {
      const zoneMap: Record<string, Zone> = {};
      zonesRef.current.forEach(z => { zoneMap[z.id] = z; });
      return paths
        .map(p => ({
          fromId: p.from,
          toId:   p.to,
          from:   zoneMap[p.from]?.position ?? { x: 0, y: 0 },
          to:     zoneMap[p.to]?.position   ?? { x: 0, y: 0 },
        }))
        .filter(p => !(p.from.x === 0 && p.from.y === 0 && p.to.x === 0 && p.to.y === 0));
    };

    resolvedPathsRef.current = buildResolvedPaths();
    if (resolvedPathsRef.current.length === 0) return;

    // ── createParticle: uses refs so always up-to-date ────────────
    function createParticle(): Particle {
      const rPaths      = resolvedPathsRef.current;
      const currentZones = zonesRef.current;

      if (rPaths.length === 0) {
        return { pathIdx: 0, progress: 0, speed: 0.002, opacity: 0,
                 color: '#10b981', offsetX: 0, offsetY: 0, reverse: false };
      }

      // Weighted path selection: higher-importance zones attract more particles
      const weights = rPaths.map(p => {
        const fz = currentZones.find(z => z.id === p.fromId);
        const tz = currentZones.find(z => z.id === p.toId);
        const avg = ((fz?.importance ?? 0.5) + (tz?.importance ?? 0.5)) / 2;
        return Math.max(0.15, avg);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let rand = Math.random() * total;
      let pathIdx = 0;
      for (let i = 0; i < weights.length; i++) {
        rand -= weights[i];
        if (rand <= 0) { pathIdx = i; break; }
      }

      const rPath    = rPaths[pathIdx];
      const fromZone = currentZones.find(z => z.id === rPath.fromId);
      const toZone   = currentZones.find(z => z.id === rPath.toId);

      // Flow preferentially from high-density to low-density zones
      const reverse    = (toZone?.capacity ?? 50) > (fromZone?.capacity ?? 50);
      const sourceZone = reverse ? toZone : fromZone;

      return {
        pathIdx,
        progress: 0,
        speed:    0.0015 + Math.random() * 0.003,   // slight speed variation
        opacity:  0,
        color:    getRiskColor(sourceZone?.riskLevel ?? 'low'),
        offsetX:  (Math.random() - 0.5) * 8,         // jitter ±4 px
        offsetY:  (Math.random() - 0.5) * 8,
        reverse,
      };
    }

    // Create initial particles with staggered positions
    const initial: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = createParticle();
      p.progress = Math.random();
      p.opacity  = 0.7 + 0.3 * Math.sin(Math.PI * p.progress);
      initial.push(p);
    }
    particlesRef.current = initial;

    // Create SVG circles (imperative for 60fps)
    initial.forEach(() => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '2.4');
      circle.style.filter = 'drop-shadow(0 0 4px currentColor)';
      g.appendChild(circle);
    });

    // ── Animation loop ─────────────────────────────────────────────
    let lastTime = 0;
    const animate = (time: number) => {
      if (!lastTime) lastTime = time;
      const dt = Math.min(time - lastTime, 50); // cap delta to avoid jumps
      lastTime = time;

      const circles    = g.children;
      const rPaths     = resolvedPathsRef.current;

      particlesRef.current.forEach((p, i) => {
        p.progress += p.speed * (dt / 16);
        // Fade-in + fade-out across each path traversal
        p.opacity = 0.7 + 0.3 * Math.sin(Math.PI * Math.max(0, Math.min(1, p.progress)));

        if (p.progress >= 1) {
          const newP = createParticle();
          particlesRef.current[i] = newP;
          Object.assign(p, newP);
        }

        const rPath = rPaths[p.pathIdx];
        if (!rPath) return; // safety guard during venue switch

        const from = p.reverse ? rPath.to   : rPath.from;
        const to   = p.reverse ? rPath.from : rPath.to;
        const t    = p.progress;

        // Slight arc using sine curve on the minor axis
        const x = from.x + (to.x - from.x) * t + p.offsetX;
        const y = from.y + (to.y - from.y) * t + p.offsetY + Math.sin(t * Math.PI) * 4;

        const el = circles[i] as SVGCircleElement;
        if (el) {
          el.setAttribute('cx', x.toFixed(1));
          el.setAttribute('cy', y.toFixed(1));
          el.setAttribute('fill', p.color);
          el.setAttribute('opacity', Math.max(0.7, Math.min(1, p.opacity)).toFixed(2));
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      while (g.firstChild) g.removeChild(g.firstChild);
    };
  }, [paths]); // Re-initialize only when paths change (venue switch)

  return <g ref={gRef} />;
}
