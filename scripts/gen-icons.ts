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
    // maskable needs safe zone — icon content within 80% circle, full bleed bg
    img = sharp(
      Buffer.from(
        svg.toString().replace('viewBox="0 0 512 512"', 'viewBox="-52 -52 616 616"')
      ),
      { density: 300 }
    ).resize(size, size);
  }
  await img.png().toFile(`/home/z/my-project/public/icons/${file}`);
  console.log("✓", file);
}
// favicon
await sharp(svg, { density: 300 }).resize(48, 48).png().toFile("/home/z/my-project/src/app/favicon.png");
console.log("✓ favicon");
