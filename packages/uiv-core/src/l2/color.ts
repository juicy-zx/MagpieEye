/**
 * CIEDE2000 色差(T1.3 Step 5,Sharma 2005 公式直译)。
 * labDeltaE:两 Lab 色的 ΔE00(kL=kC=kH=1);ciede2000:hex→线性 sRGB→XYZ(D65)→Lab→ΔE00。
 */
export type Lab = readonly [L: number, a: number, b: number];

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const pow7 = (x: number): number => x ** 7;

export function labDeltaE(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(pow7(Cbar) / (pow7(Cbar) + pow7(25))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (b: number, ap: number): number => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos(rad(hbarp - 30))
    + 0.24 * Math.cos(rad(2 * hbarp))
    + 0.32 * Math.cos(rad(3 * hbarp + 6))
    - 0.20 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(pow7(Cbarp) / (pow7(Cbarp) + pow7(25)));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2
    + RT * (dCp / SC) * (dHp / SH),
  );
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/** #RRGGBB → CIE Lab(D65)。 */
export function hexToLab(hex: string): Lab {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (m === null) throw new Error(`invalid hex color: ${hex}`);
  const int = Number.parseInt(m[1] as string, 16);
  const r = srgbToLinear((int >> 16) & 0xff);
  const g = srgbToLinear((int >> 8) & 0xff);
  const b = srgbToLinear(int & 0xff);

  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y / 1.0);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function ciede2000(hexA: string, hexB: string): number {
  return labDeltaE(hexToLab(hexA), hexToLab(hexB));
}
