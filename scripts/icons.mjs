// Renders the PNG app icons from the mountain logo. Run after changing the logo: `npm run icons`
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const BLUE = "#1f5e8c";
// the logo's artwork without its rounded tile, on a 64×64 grid
const art = (fill = "#fff", detail = "#cfe0ee") =>
  `<path d="M8 52 L27 22 L35 33 L41 25 L56 52Z" fill="${fill}"/><path d="M27 22 L31 28 L27 30 L23 28Z" fill="${detail}"/><path d="M41 25 L41 13 L50 16 L41 19" fill="none" stroke="${fill}" stroke-width="2.5" stroke-linejoin="round"/>`;

/** scale < 1 shrinks the artwork towards the centre (maskable icons need it inside the middle 80%) */
const svg = ({ rounded = true, bg = BLUE, scale = 1, fill, detail } = {}) => {
  const off = (64 - 64 * scale) / 2;
  const tile = bg ? `<rect width="64" height="64" ${rounded ? 'rx="14"' : ""} fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${tile}<g transform="translate(${off} ${off}) scale(${scale})">${art(fill, detail)}</g></svg>`;
};

const out = [
  ["public/icon-192.png", 192, svg()],
  ["public/icon-512.png", 512, svg()],
  // full-bleed square; Android crops it to a circle or squircle
  ["public/icon-maskable-512.png", 512, svg({ rounded: false, scale: 0.72 })],
  // iOS rounds the corners itself and shows transparency as black
  ["app/apple-icon.png", 180, svg({ rounded: false, scale: 0.86 })],
  // Android status-bar badge: only the alpha channel is used
  ["public/badge-96.png", 96, svg({ bg: null, scale: 1.1, fill: "#fff", detail: "#fff" })],
];

for (const [file, size, s] of out) {
  await writeFile(file, await sharp(Buffer.from(s), { density: (72 * size) / 64 * 2 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
  console.log(file);
}
