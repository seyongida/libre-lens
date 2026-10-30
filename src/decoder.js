// Pure pixel geometry. No image or health data leaves the browser.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function detectAxes({ data, width: w, height: h }) {
  if (w < 280 || h < 500 || h / w < 1.7 || h / w > 2.5)
    throw new Error(
      "세로형 LibreLink 전체 스크린샷을 선택해 주세요. 잘리거나 가로로 늘어난 이미지는 지원하지 않습니다.",
    );
  const gray = (x, y) => {
    const i = (y * w + x) * 4,
      r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    return r > 115 && r < 230 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
  };
  const rows = [];
  for (let y = Math.floor(h * 0.31); y < h * 0.75; y++) {
    let count = 0,
      total = 0;
    for (let x = Math.floor(w * 0.18); x < w * 0.92; x += 3) {
      total++;
      if (gray(x, y)) count++;
    }
    if (count / total > 0.76) rows.push(y);
  }
  const groups = [];
  for (const y of rows) {
    if (!groups.length || y - groups.at(-1).at(-1) > 4) groups.push([y]);
    else groups.at(-1).push(y);
  }
  const lines = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  if (lines.length !== 7)
    throw new Error(
      "50–350 mg/dL의 눈금 7개를 찾지 못했습니다. 샘플과 같은 밝은 화면의 전체 스크린샷을 사용해 주세요.",
    );
  const step = (lines[6] - lines[0]) / 6;
  if (
    step < h * 0.045 ||
    step > h * 0.085 ||
    lines.some((y, i) => Math.abs(y - lines[0] - step * i) > step * 0.06)
  )
    throw new Error(
      "그래프 축의 간격이 일정하지 않습니다. 원본 스크린샷으로 다시 시도해 주세요.",
    );
  const y = Math.round(lines[0]);
  let left = Math.floor(w * 0.18),
    right = Math.floor(w * 0.8);
  while (left > w * 0.08 && gray(left - 1, y)) left--;
  while (right < w * 0.97 && gray(right + 1, y)) right++;
  if (left < w * 0.09 || right < w * 0.9)
    throw new Error("그래프의 가로 경계를 찾지 못했습니다.");
  return {
    left,
    right,
    top: lines[0],
    bottom: lines[6] + step,
    step,
    lines,
    width: w,
    height: h,
  };
}
export function extractCurve(image, axes = detectAxes(image)) {
  const { data, width: w } = image,
    { left, right, top, bottom, step } = axes;
  const markerPixels = [];
  for (
    let x = Math.round(right - w * 0.035);
    x < Math.min(w, right + w * 0.035);
    x++
  ) {
    for (let y = Math.ceil(top + 5); y < bottom; y++) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (r > 65 && r < 200 && g > r + 25 && g > 130 && b < 115)
        markerPixels.push([x, y]);
    }
  }
  let marker = null;
  if (markerPixels.length > w * 0.05) {
    const ys = markerPixels.map((p) => p[1]);
    if (Math.max(...ys) - Math.min(...ys) < w * 0.08)
      marker = {
        x: markerPixels.reduce((a, p) => a + p[0], 0) / markerPixels.length,
        y: markerPixels.reduce((a, p) => a + p[1], 0) / markerPixels.length,
      };
  }
  const points = [],
    dx = Math.max(1, Math.round(w / 700));
  for (let x = Math.ceil(left); x <= right - Math.max(5, w * 0.005); x += dx) {
    if (marker && x > marker.x - w * 0.028) break;
    const runs = [];
    let start = null;
    for (let y = Math.ceil(top + 4); y < bottom - 4; y++) {
      const i = (y * w + x) * 4,
        dark = data[i] < 85 && data[i + 1] < 85 && data[i + 2] < 85;
      if (dark && start === null) start = y;
      if ((!dark || y >= bottom - 5) && start !== null) {
        if (y - start >= Math.max(2, w * 0.002) && y - start < step * 0.7)
          runs.push({ y: (start + y - 1) / 2, size: y - start });
        start = null;
      }
    }
    if (runs.length) {
      const prev = points.at(-1);
      runs.sort((a, b) =>
        prev
          ? Math.abs(a.y - prev.pixelY) - Math.abs(b.y - prev.pixelY)
          : b.size - a.size,
      );
      const pixelY = runs[0].y;
      points.push({
        x: (x - left) / (right - left),
        value: ((bottom - pixelY) / step) * 50,
        pixelY,
      });
    }
  }
  if (marker)
    points.push({
      x: clamp((marker.x - left) / (right - left), 0, 1),
      value: ((bottom - marker.y) / step) * 50,
      pixelY: marker.y,
    });
  const coverage = (points.length * dx) / (right - left);
  if (coverage < 0.3 || points.length < 30)
    throw new Error(
      "읽을 수 있는 검은 혈당 곡선을 찾지 못했습니다. 빈 그래프나 다른 화면인지 확인해 주세요.",
    );
  return { axes, points, coverage: Math.min(1, coverage), marker: !!marker };
}
export function valueAt(points, x) {
  if (!points.length || x < points[0].x - 0.002 || x > points.at(-1).x + 0.002)
    return null;
  let lo = 0,
    hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid;
    else hi = mid;
  }
  const a = points[lo],
    b = points[hi];
  // Do not invent data across a missing interval. The endpoint marker may cover ~3%.
  if (b.x - a.x > 0.045) return null;
  return (
    a.value + (b.value - a.value) * clamp((x - a.x) / (b.x - a.x || 1), 0, 1)
  );
}
export function parseAxisLabel(text) {
  const compact = text.replace(/\s/g, "").replace(/[Oo]/g, "0");
  const pm = /오후|PM/i.test(compact),
    am = /오전|AM/i.test(compact);
  const m = compact.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let hour = Number(m[1]),
    minute = Number(m[2] || 0);
  if (hour > 23 || minute > 59) return null;
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return { minutes: hour * 60 + minute, explicitPeriod: pm || am || hour > 12 };
}
export function timeCalibration(label1, label2, x1, x2) {
  if (!label1 || !label2 || !label1.explicitPeriod || !label2.explicitPeriod)
    return null;
  let diff = label2.minutes - label1.minutes;
  if (diff <= 0) diff += 1440;
  if (diff < 60 || diff > 360 || x2 <= x1) return null;
  const duration = diff / (x2 - x1),
    start = label1.minutes - x1 * duration;
  if (duration < 300 || duration > 720) return null;
  return { start, duration, source: "ocr" };
}
export function snapToClock(calibration, text) {
  if (!calibration) return null;
  const cleaned = text.trim();
  const m =
    cleaned.match(/(\d{1,2}):(\d{2})/) || cleaned.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return calibration;
  const hour = Number(m[1]),
    minute = Number(m[2]);
  if (hour > 23 || minute > 59) return calibration;
  const end = calibration.start + calibration.duration;
  const candidates = [];
  for (let day = -1; day <= 1; day++)
    for (const offset of hour <= 12 ? [0, 12] : [0])
      candidates.push(day * 1440 + ((hour % 12) + offset) * 60 + minute);
  // For 24-hour times above 12, preserve the hour.
  if (hour > 12)
    for (let day = -1; day <= 1; day++)
      candidates.push(day * 1440 + hour * 60 + minute);
  candidates.sort((a, b) => Math.abs(a - end) - Math.abs(b - end));
  if (Math.abs(candidates[0] - end) > 3) return calibration;
  return { ...calibration, start: candidates[0] - calibration.duration };
}
export function formatTime(minutes) {
  const n = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function tooltipPosition(x, y, width, height, boxW = 140, boxH = 76) {
  return {
    left: clamp(
      x + 18 + boxW > width ? x - boxW - 18 : x + 18,
      8,
      Math.max(8, width - boxW - 8),
    ),
    top: clamp(y - boxH - 20, 8, Math.max(8, height - boxH - 8)),
  };
}
