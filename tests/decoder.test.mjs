import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import {
  detectAxes,
  extractCurve,
  valueAt,
  parseAxisLabel,
  timeCalibration,
  formatTime,
  snapToClock,
  tooltipPosition,
} from "../src/decoder.js";
const demo = PNG.sync.read(fs.readFileSync("public/demo.png"));
test("fictional reference: axes, low point, endpoint and coverage", () => {
  const curve = extractCurve(demo);
  assert.ok(Math.abs(curve.axes.left - 138) < 3);
  assert.ok(Math.abs(curve.axes.bottom - 2047) < 3);
  assert.ok(curve.coverage > 0.94);
  assert.ok(Math.abs(valueAt(curve.points, 1) - 115) < 1);
  assert.ok(Math.abs(valueAt(curve.points, 23 / 33) - 83) < 2);
  assert.ok(Math.abs(valueAt(curve.points, 30 / 33) - 138) < 2);
});
test(
  "source screenshot: actual provided sample (local, excluded from Git)",
  { skip: !fs.existsSync("../sample.png") },
  () => {
    const curve = extractCurve(PNG.sync.read(fs.readFileSync("../sample.png")));
    assert.ok(curve.coverage > 0.9);
    assert.ok(Math.abs(valueAt(curve.points, 1) - 115) < 2);
    assert.ok(Math.min(...curve.points.map((p) => p.value)) > 80);
    assert.ok(Math.max(...curve.points.map((p) => p.value)) < 145);
  },
);
test("rejects incorrect layouts and blank screenshots", () => {
  assert.throws(() =>
    detectAxes({ width: 500, height: 500, data: new Uint8Array(1e6) }),
  );
  const blank = {
    width: demo.width,
    height: demo.height,
    data: Buffer.alloc(demo.data.length, 255),
  };
  assert.throws(() => detectAxes(blank), /目|눈금/);
});
test("does not interpolate missing data, handles boundaries", () => {
  const p = [
    { x: 0.1, value: 100 },
    { x: 0.12, value: 120 },
    { x: 0.5, value: 300 },
    { x: 0.52, value: 310 },
  ];
  assert.equal(valueAt(p, 0), null);
  assert.equal(valueAt(p, 0.11), 110);
  assert.equal(valueAt(p, 0.3), null);
  assert.equal(valueAt(p, 0.9), null);
});
test("AM/PM and midnight are explicit; uncertain OCR rejected", () => {
  assert.deepEqual(parseAxisLabel("오후 3"), {
    minutes: 900,
    explicitPeriod: true,
  });
  assert.equal(parseAxisLabel("오전12").minutes, 0);
  assert.equal(parseAxisLabel("오후12").minutes, 720);
  assert.equal(parseAxisLabel("23:59").minutes, 1439);
  assert.equal(parseAxisLabel("99:99"), null);
  assert.equal(
    timeCalibration(parseAxisLabel("3"), parseAxisLabel("6"), 0.265, 0.64),
    null,
  );
  const c = timeCalibration(
    parseAxisLabel("오후3"),
    parseAxisLabel("오후6"),
    0.265,
    0.64,
  );
  assert.equal(c.duration, 480);
  assert.equal(formatTime(c.start + c.duration), "20:53");
  assert.equal(formatTime(-20), "23:40");
  assert.equal(formatTime(1460), "00:20");
  const midnight = timeCalibration(
    parseAxisLabel("오후11"),
    parseAxisLabel("오전2"),
    0.265,
    0.64,
  );
  assert.equal(midnight.duration, 480);
});
test("tooltip remains visible at all edges on compact screens", () => {
  for (const w of [240, 280, 320, 390, 768])
    for (const x of [0, w / 2, w])
      for (const y of [0, 150, 300]) {
        const p = tooltipPosition(x, y, w, 310, 132, 84);
        assert.ok(p.left >= 0 && p.left + 132 <= w);
        assert.ok(p.top >= 0 && p.top + 84 <= 310);
      }
});

test("status clock corrects sub-minute pixel calibration without guessing AM/PM", () => {
  const c = { start: 772.8, duration: 480, source: "ocr" };
  assert.equal(formatTime(snapToClock(c, "852").start + 480), "20:52");
  assert.equal(formatTime(snapToClock(c, "8:52").start + 480), "20:52");
  assert.deepEqual(snapToClock(c, "9:30"), c);
});
function drawFixture(scale = 1) {
  const w = Math.round(600 * scale),
    h = Math.round(1300 * scale),
    png = new PNG({ width: w, height: h });
  png.data.fill(255);
  const left = 69 * scale,
    right = 570 * scale,
    top = 440 * scale,
    step = 82.5 * scale,
    bottom = top + 7 * step;
  function pixel(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = c;
  }
  for (let k = 0; k < 7; k++)
    for (let x = Math.ceil(left); x <= right; x++)
      for (let d = 0; d < Math.max(1, scale); d++)
        pixel(x, top + k * step + d, 170);
  for (let x = Math.ceil(left); x < right - 5 * scale; x++) {
    const fraction = (x - left) / (right - left),
      value = 160 + 120 * Math.sin(fraction * Math.PI * 2),
      y = bottom - (value / 50) * step;
    for (let d = -3 * scale; d <= 3 * scale; d++) pixel(x, y + d, 20);
  }
  return png;
}
test("changing curve: high/low values at multiple resolutions", () => {
  for (const scale of [1, 1.5, 2]) {
    const p = drawFixture(scale),
      c = extractCurve(p);
    assert.ok(c.coverage > 0.97);
    assert.ok(Math.abs(valueAt(c.points, 0.25) - 280) < 2);
    assert.ok(Math.abs(valueAt(c.points, 0.75) - 40) < 2);
  }
});
