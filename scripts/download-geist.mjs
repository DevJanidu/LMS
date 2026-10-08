import { mkdirSync, writeFileSync } from "node:fs";
const urls = [
  "https://raw.githubusercontent.com/vercel/geist-font/main/fonts/Geist/variable/Geist%5Bwght%5D.woff2",
  "https://raw.githubusercontent.com/vercel/geist-font/main/packages/next/dist/fonts/geist-sans/Geist-Variable.woff2",
  "https://raw.githubusercontent.com/vercel/geist-font/1.4.2/packages/next/dist/fonts/geist-sans/Geist-Variable.woff2",
];
mkdirSync("src/fonts", { recursive: true });
let done = false;
for (const url of urls) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0,4).toString() !== "wOF2") continue;
    const license = await fetch("https://raw.githubusercontent.com/vercel/geist-font/main/OFL.txt", { signal: AbortSignal.timeout(10000) });
    if (!license.ok) throw new Error("License unavailable.");
    writeFileSync("src/fonts/Geist-Variable.woff2", bytes);
    writeFileSync("src/fonts/OFL.txt", await license.text());
    console.info(JSON.stringify({ font: "Geist variable", bytes: bytes.length, source: url, license: "SIL OFL 1.1" })); done = true; break;
  } catch { /* Try another official release path. */ }
}
if (!done) { console.error("Official Geist font could not be fetched; no replacement font was written."); process.exitCode = 1; }
