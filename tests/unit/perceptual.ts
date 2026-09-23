/**
 * CIEDE2000 — how different two colours look, not how different their
 * numbers are.
 *
 * WCAG contrast measures luminance only: two colours of the same lightness
 * and opposite hue score 1:1. That is the right floor for reading text and
 * the wrong question for „can I see the button at a glance", which is a
 * question about colour as the eye has it. ΔE00 of about 2 is the smallest
 * difference most people notice side by side; the dark sections use 40 as
 * the bar for „distinguishable at a glance", and the petrol accent measured
 * 14 against them before this pass.
 *
 * sRGB → linear → XYZ (D65) → CIELAB → CIEDE2000, the reference formula
 * (Sharma, Wu, Dalal 2005), with kL = kC = kH = 1.
 */

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE2000(a: string, b: string): number {
  const [L1, a1, b1] = toLab(a);
  const [L2, a2, b2] = toLab(b);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (y: number, x: number) => {
    const h = Math.atan2(y, x) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lbar = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbar = h1p + h2p;
  if (C1p * C2p !== 0) {
    hbar = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
    if (hbar >= 360) hbar -= 360;
  }
  const T =
    1 -
    0.17 * Math.cos((hbar - 30) * rad) +
    0.24 * Math.cos(2 * hbar * rad) +
    0.32 * Math.cos((3 * hbar + 6) * rad) -
    0.2 * Math.cos((4 * hbar - 63) * rad);
  const SL = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT =
    -2 *
    Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hbar - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH),
  );
}

/** `fg` at `alpha` over `bg`, as a hex colour. */
export function over(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return `#${f
    .map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`;
}
