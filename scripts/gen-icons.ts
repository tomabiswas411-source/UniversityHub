import sharp from "sharp";
import fs from "fs";

const svg = fs.readFileSync("/home/z/my-project/public/logo.svg");

const sizes = [
  { file: "icon-192x192.png", size: 192 },
  { file: "icon-512x512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "maskable-icon-512x512.png", size: 512 },
  { file: "icon-96x96.png", size: 96 },
];

for (const { file, size } of sizes) {
  let img = sharp(svg, { density: 300 }).resize(size, size);
  if (file.startsWith("maskable")) {
    // maskable needs full-bleed background + safe zone: paint expanded bg behind icon
    const padded = svg
      .toString()
      .replace(
        /(<svg[^>]*>)/,
        '$1<rect x="-60" y="-60" width="632" height="632" fill="#241C15"/>'
      );
    img = sharp(Buffer.from(padded), { density: 300 }).resize(size, size);
  }
  await img.png().toFile(`/home/z/my-project/public/icons/${file}`);
  console.log("✓", file);
}
// favicon
await sharp(svg, { density: 300 }).resize(48, 48).png().toFile("/home/z/my-project/src/app/favicon.png");
console.log("✓ favicon");
