/**
 * Draws the two placeholder photos for the sweater dispute (DEMO-1002):
 *   public/demo/sweater-listing.png  navy sweater, even daylight
 *   public/demo/sweater-buyer.png    the same sweater in dim, warm indoor light
 * Replace them with real phone photos for the demo video if you can.
 *   npm run demo:photos
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

const W = 512;
const H = 512;

type RGB = [number, number, number];

function encodePng(pixels: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0; // no filter
    Buffer.from(pixels.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Sweater outline (front view), clockwise.
const SWEATER: [number, number][] = [
  [200, 105], [312, 105], [372, 128], [456, 300], [412, 324], [350, 205],
  [352, 432], [160, 432], [162, 205], [100, 324], [56, 300], [140, 128],
];

function inside(x: number, y: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Small deterministic noise so both images are reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;

function draw(opts: { background: (x: number, y: number) => RGB; light: (x: number, y: number) => number; cast: RGB; noise: number }) {
  const navy: RGB = [31, 45, 88];
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: RGB;
      if (inside(x, y, SWEATER)) {
        const knit = Math.sin(x * 0.9) * 5 + Math.sin(y * 0.55) * 2; // knit texture
        const rib = y > 408 || (y > 290 && (x < 118 || x > 394)) ? -9 : 0; // hem and cuff ribbing
        const collar = ((x - 256) / 50) ** 2 + ((y - 108) / 20) ** 2 < 1 ? -14 : 0;
        const shade = 1 - (y - 105) / 1400; // light from above
        c = navy.map((v) => (v + knit + rib + collar) * shade) as RGB;
      } else {
        c = opts.background(x, y);
      }
      const l = opts.light(x, y);
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        const v = c[k] * l * opts.cast[k] + rand() * opts.noise;
        px[i + k] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return encodePng(px);
}

const outDir = path.join(process.cwd(), "public", "demo");
mkdirSync(outDir, { recursive: true });

// Listing photo: studio-like, bright neutral background, even light.
writeFileSync(
  path.join(outDir, "sweater-listing.png"),
  draw({
    background: (_x, y) => [236 - y / 40, 234 - y / 40, 229 - y / 40],
    light: () => 1,
    cast: [1, 1, 1],
    noise: 3,
  }),
);

// Buyer photo: dim warm lamp light, vignette and camera noise.
writeFileSync(
  path.join(outDir, "sweater-buyer.png"),
  draw({
    background: (x, y) => [150 - y / 12 + x / 30, 118 - y / 14, 84 - y / 16],
    light: (x, y) => 0.46 * (1 - 0.55 * (((x - 300) / 360) ** 2 + ((y - 230) / 330) ** 2)),
    cast: [1.12, 0.96, 0.72],
    noise: 9,
  }),
);

console.log("Wrote public/demo/sweater-listing.png and public/demo/sweater-buyer.png");
