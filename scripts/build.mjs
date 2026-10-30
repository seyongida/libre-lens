import { mkdir, cp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { renderSponsor } from "./sponsor.mjs";
// Validate before downloading OCR files or changing the previous build.
const sponsor = renderSponsor(JSON.parse(await readFile("monetization.json", "utf8")));
await mkdir(".cache", { recursive: true });
for (const lang of ["kor", "eng"]) {
  const file = `.cache/${lang}.traineddata.gz`;
  try {
    await readFile(file);
  } catch {
    const res = await fetch(
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/${lang}.traineddata`,
    );
    if (!res.ok) throw Error(`OCR language download failed: ${res.status}`);
    await writeFile(file, gzipSync(Buffer.from(await res.arrayBuffer())));
  }
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist/vendor", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });
const html = await readFile("index.html", "utf8");
if (!html.includes("<!-- SPONSOR_SLOT -->")) throw Error("Sponsor slot missing");
await writeFile("dist/index.html", html.replace("<!-- SPONSOR_SLOT -->", sponsor));
await cp(
  "node_modules/tesseract.js/dist/tesseract.min.js",
  "dist/vendor/tesseract.min.js",
);
await cp(
  "node_modules/tesseract.js/dist/worker.min.js",
  "dist/vendor/worker.min.js",
);
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm"])
  await cp(`node_modules/tesseract.js-core/${f}`, `dist/vendor/${f}`);
for (const lang of ["kor", "eng"])
  await cp(
    `.cache/${lang}.traineddata.gz`,
    `dist/vendor/${lang}.traineddata.gz`,
  );
await mkdir("dist/licenses", { recursive: true });
await cp(
  "node_modules/tesseract.js/LICENSE.md",
  "dist/licenses/tesseract-js.txt",
);
await cp(
  "node_modules/tesseract.js-core/LICENSE",
  "dist/licenses/tesseract-core.txt",
);
await cp("THIRD_PARTY_NOTICES.md", "dist/licenses/NOTICE.md");
await writeFile("dist/.nojekyll", "");
async function files(path) {
  let out = [];
  for (const d of await readdir(path, { withFileTypes: true })) {
    const p = `${path}/${d.name}`;
    out.push(...(d.isDirectory() ? await files(p) : [p]));
  }
  return out;
}
const all = (await files("dist")).filter((f) => !f.endsWith("/sw.js"));
const hash = createHash("sha256");
for (const f of all) hash.update(await readFile(f));
const assets = ["./", ...all.map((f) => "./" + f.slice(5))];
const sw = await readFile("scripts/sw-template.js", "utf8");
await writeFile(
  "dist/sw.js",
  sw
    .replace("__VERSION__", hash.digest("hex").slice(0, 12))
    .replace("__ASSETS__", JSON.stringify(assets)),
);
console.log(
  `Built ${all.length + 1} local assets. OCR included; no runtime CDN.`,
);

