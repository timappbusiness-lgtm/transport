'use client';

import { useEffect, useRef } from 'react';

/*
 * The corridor network behind the hero: a perspective-projected node-and-arc
 * field on canvas 2D. No WebGL and no library — see design/README.md for why.
 * Cities carry real coordinates, so Hamburg sits north-west of București on
 * screen because it does on a map.
 */

interface City {
  lat: number;
  lng: number;
  name: string;
  ro: boolean;
}

const CITIES = {
  hamburg: { lat: 53.55, lng: 9.99, name: 'Hamburg', ro: false },
  amsterdam: { lat: 52.37, lng: 4.9, name: 'Amsterdam', ro: false },
  berlin: { lat: 52.52, lng: 13.4, name: 'Berlin', ro: false },
  munchen: { lat: 48.14, lng: 11.58, name: 'München', ro: false },
  milano: { lat: 45.46, lng: 9.19, name: 'Milano', ro: false },
  madrid: { lat: 40.42, lng: -3.7, name: 'Madrid', ro: false },
  viena: { lat: 48.21, lng: 16.37, name: 'Viena', ro: false },
  budapesta: { lat: 47.5, lng: 19.04, name: 'Budapesta', ro: false },
  bucuresti: { lat: 44.43, lng: 26.1, name: 'București', ro: true },
  cluj: { lat: 46.77, lng: 23.6, name: 'Cluj-Napoca', ro: true },
  timisoara: { lat: 45.75, lng: 21.23, name: 'Timișoara', ro: true },
  constanta: { lat: 44.17, lng: 28.64, name: 'Constanța', ro: true },
  iasi: { lat: 47.16, lng: 27.59, name: 'Iași', ro: true },
} satisfies Record<string, City>;

type CityKey = keyof typeof CITIES;

const ROUTES: readonly { from: CityKey; to: CityKey; speed: number; lift: number }[] = [
  { from: 'hamburg', to: 'bucuresti', speed: 0.055, lift: 1.0 },
  { from: 'amsterdam', to: 'cluj', speed: 0.062, lift: 0.92 },
  { from: 'milano', to: 'constanta', speed: 0.048, lift: 1.05 },
  { from: 'madrid', to: 'timisoara', speed: 0.038, lift: 1.25 },
  { from: 'munchen', to: 'iasi', speed: 0.07, lift: 0.85 },
  { from: 'berlin', to: 'bucuresti', speed: 0.058, lift: 0.78 },
  { from: 'budapesta', to: 'cluj', speed: 0.115, lift: 0.4 },
  { from: 'viena', to: 'timisoara', speed: 0.1, lift: 0.45 },
];

const CENTER_LNG = 13.5;
const CENTER_LAT = 48.0;
const SPREAD = 0.62;
const ARC_STEPS = 30;
const REST_YAW = -0.3;
const REST_PITCH = 0.92;

interface Vec3 { x: number; y: number; z: number }
interface Projected { x: number; y: number; d: number }

/** World coordinates: x east, z north (negative = away), y up. */
function world(c: City): Vec3 {
  return { x: (c.lng - CENTER_LNG) * SPREAD, y: 0, z: -(c.lat - CENTER_LAT) * SPREAD * 1.45 };
}

/** Quadratic Bézier in 3D: the arc a platform travels along. */
function arcPoint(a: Vec3, b: Vec3, lift: number, t: number): Vec3 {
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const cy = Math.hypot(b.x - a.x, b.z - a.z) * 0.3 * lift;
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
    y: 2 * u * t * cy,
    z: u * u * a.z + 2 * u * t * mz + t * t * b.z,
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function CorridorCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // next/font hashes the family name; read the resolved stack from the variable.
    const monoStack =
      getComputedStyle(document.documentElement).getPropertyValue('--font-plex-mono').trim() || 'monospace';

    let W = 1;
    let H = 1;
    let yaw = REST_YAW;
    let pitch = REST_PITCH;
    let pointerX = 0;
    let pointerY = 0;
    let raf: number | null = null;
    let onScreen = true;
    const t0 = performance.now();

    function project(p: Vec3): Projected {
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const x1 = p.x * cyaw - p.z * syaw;
      const z1 = p.x * syaw + p.z * cyaw;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const y2 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;

      const d = Math.max(z2 + 15.5, 0.35);
      const narrow = W < 900;
      const scale = (narrow ? 10.6 : 12.4) / d;
      // Desktop: the network sits in the right half, clear of the copy.
      // Phone: the copy sits above it, so it centres.
      const unit = narrow ? W * 0.082 : W * 0.056;
      return {
        x: (narrow ? W * 0.52 : W * 0.63) + x1 * scale * unit,
        y: (narrow ? H * 0.6 : H * 0.44) + y2 * scale * unit,
        d,
      };
    }

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(rect.width, 1);
      H = Math.max(rect.height, 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGrid(c: CanvasRenderingContext2D) {
      c.lineWidth = 1;
      const ext = 13;
      for (let i = -ext; i <= ext; i += 2.2) {
        for (const [a, b] of [
          [{ x: i, y: 0, z: -ext }, { x: i, y: 0, z: ext }],
          [{ x: -ext, y: 0, z: i }, { x: ext, y: 0, z: i }],
        ] as const) {
          const pa = project(a);
          const pb = project(b);
          const fade = clamp01(1 - (pa.d + pb.d) / 46);
          c.strokeStyle = `rgba(46,88,106,${(fade * 0.46).toFixed(3)})`;
          c.beginPath();
          c.moveTo(pa.x, pa.y);
          c.lineTo(pb.x, pb.y);
          c.stroke();
        }
      }
    }

    function draw(now: number) {
      if (!ctx) return;
      const time = (now - t0) / 1000;

      // Ease the camera toward the pointer instead of snapping to it.
      yaw += (REST_YAW + pointerX * 0.07 - yaw) * 0.045;
      pitch += (REST_PITCH + pointerY * 0.05 - pitch) * 0.045;
      if (!reduce) yaw += Math.sin(time * 0.055) * 0.00035;

      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx);

      // Depth-sorted arcs, far ones first.
      const arcs = ROUTES.map((route, i) => {
        const a = world(CITIES[route.from]);
        const b = world(CITIES[route.to]);
        const pts: Projected[] = [];
        for (let k = 0; k <= ARC_STEPS; k++) pts.push(project(arcPoint(a, b, route.lift, k / ARC_STEPS)));
        const depth = pts[ARC_STEPS / 2]?.d ?? 0;
        return { pts, route, depth, i };
      }).sort((p, q) => q.depth - p.depth);

      for (const { pts, route, depth, i } of arcs) {
        const near = clamp01(1 - (depth - 8) / 16);
        const first = pts[0];
        if (!first) continue;

        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(126,178,196,${(0.17 + near * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // The platform in transit: a bright head with a fading tail.
        const prog = reduce ? 0.42 + i * 0.05 : (time * route.speed + i * 0.17) % 1;
        const tail = 0.13;
        const seg: Projected[] = [];
        for (let s = 0; s <= 10; s++) {
          const tt = prog - tail + (tail * s) / 10;
          if (tt < 0 || tt > 1) continue;
          const p = pts[Math.round(tt * ARC_STEPS)];
          if (p) seg.push(p);
        }
        const start = seg[0];
        const head = seg[seg.length - 1];
        if (!start || !head || seg.length < 2) continue;

        const grad = ctx.createLinearGradient(start.x, start.y, head.x, head.y);
        grad.addColorStop(0, 'rgba(242,173,75,0)');
        grad.addColorStop(1, `rgba(242,173,75,${(0.55 + near * 0.4).toFixed(2)})`);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (const p of seg.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.8 + near * 1.1;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(head.x, head.y, 2 + near * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = '#f7c77f';
        ctx.shadowColor = 'rgba(242,173,75,.9)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Nodes on top. Romanian cities are emphasised: they are the destination.
      const nodes = (Object.values(CITIES) as City[])
        .map((c) => ({ c, p: project(world(c)) }))
        .sort((a, b) => b.p.d - a.p.d);

      ctx.font = `500 10px ${monoStack}`;
      for (const { c, p } of nodes) {
        const near = clamp01(1 - (p.d - 8) / 16);
        const r = (c.ro ? 3.1 : 2.2) * (0.62 + near * 0.55);

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = c.ro ? '#f3efe6' : 'rgba(154,167,174,.62)';
        ctx.fill();

        if (c.ro) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(243,239,230,.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (W > 560 && near > 0.14) {
          ctx.fillStyle = c.ro
            ? `rgba(243,239,230,${(0.42 + near * 0.5).toFixed(2)})`
            : `rgba(154,167,174,${(0.22 + near * 0.38).toFixed(2)})`;
          ctx.fillText(c.name.toUpperCase(), p.x + r + 6, p.y + 3.5);
        }
      }

      raf = reduce ? null : requestAnimationFrame(draw);
    }

    const run = () => {
      if (reduce || raf !== null || !onScreen || document.hidden) return;
      raf = requestAnimationFrame(draw);
    };
    const halt = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };

    const onResize = () => {
      resize();
      if (reduce) draw(performance.now());
    };
    const onPointer = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onVisibility = () => (document.hidden ? halt() : run());

    resize();
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver | undefined;
    if (reduce) {
      // One static frame.
      draw(performance.now());
    } else {
      window.addEventListener('pointermove', onPointer, { passive: true });
      // Stop burning frames when the hero is off screen.
      observer = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        if (onScreen) run();
        else halt();
      });
      observer.observe(canvas);
      run();
    }

    return () => {
      halt();
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} id="corridor" aria-hidden="true" className="absolute inset-0 -z-20 block size-full" />;
}
