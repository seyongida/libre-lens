import {
  detectAxes,
  extractCurve,
  valueAt,
  parseAxisLabel,
  timeCalibration,
  formatTime,
  snapToClock,
  tooltipPosition,
  clamp,
} from "./decoder.js";
const $ = (s) => document.querySelector(s);
let state = null,
  busy = false,
  selection = 1,
  activePointer = null,
  installPrompt = null;
const buttons = ["#upload-button", "#demo-button", "#replace-button"];
function status(text) {
  $("#status").textContent = text;
  $("#status").hidden = !text;
}
function error(text) {
  $("#error").textContent = text;
  $("#error").hidden = !text;
}
function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
  for (const id of buttons) $(id).disabled = value;
}
function deadline(promise, ms = 20000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("OCR 시간 초과")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
function canvasCrop(canvas, x, y, w, h, scale = 1) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}
async function loadCanvas(blob) {
  if (blob.size > 25 * 1024 * 1024)
    throw Error("사진은 25MB 이하로 선택해 주세요.");
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.width * img.height > 50_000_000)
      throw Error(
        "너무 큰 이미지입니다. 긴 변이 3,000px 정도인 스크린샷을 선택해 주세요.",
      );
    const scale = Math.min(1, 1600 / img.width, 3600 / img.height),
      c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  } catch (e) {
    if (e.message?.includes("이미지")) throw e;
    throw Error(
      "이미지를 열 수 없습니다. PNG, JPG, WebP 형식의 스크린샷을 선택해 주세요.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function readTime(canvas, axes) {
  let worker,
    expired = false;
  try {
    status("시간 눈금을 읽고 있어요. 모든 분석은 기기 안에서 진행됩니다.");
    const base = new URL("../vendor/", import.meta.url).href;
    const creating = Tesseract.createWorker(["kor", "eng"], 1, {
      workerPath: base + "worker.min.js",
      corePath: base + "tesseract-core-lstm.wasm.js",
      langPath: base,
      gzip: true,
      workerBlobURL: false,
    });
    creating
      .then((w) => {
        if (expired) w.terminate();
      })
      .catch(() => {});
    worker = await deadline(creating, 30000);
    await worker.setParameters({ tessedit_pageseg_mode: "7" });
    const { left, right, bottom, width: w, height: h } = axes,
      span = right - left;
    // In the supported layout, the two printed ticks are at 26.5% and 64%.
    // Read each label separately, including 오전/오후 so that AM/PM is never guessed.
    const fractions = [0.265, 0.64],
      labels = [];
    for (const f of fractions) {
      const crop = canvasCrop(
        canvas,
        left + span * f - w * 0.058,
        bottom + h * 0.004,
        w * 0.116,
        h * 0.025,
        2,
      );
      const result = await deadline(worker.recognize(crop.toDataURL()));
      labels.push(parseAxisLabel(result.data.text));
    }
    const calibration = timeCalibration(
      labels[0],
      labels[1],
      fractions[0],
      fractions[1],
    );
    if (!calibration) return null;
    await worker.setParameters({ tessedit_char_whitelist: "0123456789:" });
    const clockCrop = canvasCrop(
      canvas,
      w * 0.1,
      h * 0.022,
      w * 0.16,
      h * 0.027,
      3,
    );
    const clock = await deadline(worker.recognize(clockCrop.toDataURL()));
    return snapToClock(calibration, clock.data.text);
  } catch (e) {
    console.info(
      "Time OCR unavailable; manual calibration required.",
      e?.message || "worker unavailable",
    );
    return null;
  } finally {
    expired = true;
    if (worker) await worker.terminate();
  }
}
async function importImage(blob, isDemo = false) {
  if (busy) return;
  setBusy(true);
  error("");
  status("그래프의 축과 곡선을 찾고 있어요…");
  try {
    await new Promise(requestAnimationFrame);
    const canvas = await loadCanvas(blob),
      ctx = canvas.getContext("2d", { willReadFrequently: true }),
      pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
      axes = detectAxes(pixels),
      curve = extractCurve(pixels, axes);
    const calibration = await readTime(canvas, axes);
    // A failed OCR never silently becomes a plausible time. Manual calibration is required.
    state = { canvas, ...curve, calibration, isDemo };
    selection = curve.points.at(-1).x;
    document.body.classList.add("has-data");
    $("#workspace").hidden = false;
    $("#source-badge").textContent = isDemo ? "샘플 체험" : "기기 내 분석 완료";
    $("#analysis-title").textContent = "곡선 추출 완료";
    $("#analysis-detail").textContent =
      `${canvas.width} × ${canvas.height} px · 곡선 ${Math.round(curve.coverage * 100)}% 인식`;
    $("#ocr-note").textContent = calibration
      ? "시간 눈금을 자동으로 읽었습니다. 원본과 비교해 기준을 확인해 주세요. y축은 0–350 mg/dL 비율로 환산합니다."
      : "시간 눈금을 확실하게 읽지 못했습니다. 원본을 보고 오른쪽 끝 시각과 전체 시간 범위를 입력해 주세요. 입력 전에는 시각을 표시하지 않습니다.";
    $("#calibration-panel").open = !calibration;
    $("#end-time").value = calibration
      ? formatTime(calibration.start + calibration.duration)
      : "";
    $("#hours").value = calibration
      ? String(Math.round((calibration.duration / 60) * 100) / 100)
      : "8";
    updateCalibrationLabel();
    draw();
    status("");
    if (!calibration)
      $("#calibration-panel").scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    else $("#workspace").scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (e) {
    status("");
    error(
      e?.message ||
        "분석 중 문제가 생겼습니다. 다른 스크린샷으로 다시 시도해 주세요.",
    );
  } finally {
    setBusy(false);
    $("#file-input").value = "";
  }
}
function selectedTime(x) {
  if (!state.calibration) return "시간 기준 입력 필요";
  const t = state.calibration.start + x * state.calibration.duration;
  const end = state.calibration.start + state.calibration.duration;
  return `${Math.floor(t / 1440) < Math.floor(end / 1440) ? "전날 " : ""}${formatTime(t)}`;
}
function updateCalibrationLabel() {
  const c = state.calibration;
  $("#calibration-summary").textContent = c
    ? `${c.source === "ocr" ? "자동 판독" : "직접 설정"} · ${formatTime(c.start)}–${formatTime(c.start + c.duration)}`
    : "시간 입력 필요";
  $("#duration-label").textContent = c
    ? `${(c.duration / 60).toFixed(1)}시간 기록`
    : "시간 미설정";
}
function geometry() {
  const rect = $("#chart").getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    left: 34,
    right: rect.width - 16,
    top: 27,
    bottom: rect.height - 35,
  };
}
function draw() {
  if (!state) return;
  const g = geometry(),
    { width, height, left, right, top, bottom } = g;
  const X = (x) => left + x * (right - left),
    Y = (v) => bottom - (v / 350) * (bottom - top);
  let svg = `<defs><linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a1bc7d" stop-opacity=".16"/><stop offset="100%" stop-color="#a1bc7d" stop-opacity="0"/></linearGradient><clipPath id="plot-clip"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></clipPath></defs><rect x="${left}" y="${Y(140)}" width="${right - left}" height="${Y(70) - Y(140)}" fill="#eef4e5"/>`;
  for (let v = 0; v <= 350; v += 50) {
    svg += `<line x1="${left}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e9ede3" stroke-width="1" ${v === 0 ? "" : 'stroke-dasharray="2 4"'}/><text x="${left - 9}" y="${Y(v) + 3}" text-anchor="end" fill="#a2aa96" font-size="9" stroke="none">${v}</text>`;
  }
  const c = state.calibration;
  for (let i = 0; i <= 4; i++) {
    const x = i / 4;
    svg += `<text x="${X(x)}" y="${bottom + 21}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}" fill="#98a38a" font-size="9" stroke="none">${c ? formatTime(c.start + x * c.duration) : Math.round(x * 100) + "%"}</text>`;
  }
  let segment = [],
    segments = [];
  for (const p of state.points) {
    if (segment.length && p.x - segment.at(-1).x > 0.045) {
      segments.push(segment);
      segment = [];
    }
    segment.push(p);
  }
  if (segment.length) segments.push(segment);
  for (const seg of segments) {
    const d = seg
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${X(p.x).toFixed(2)} ${Y(p.value).toFixed(2)}`,
      )
      .join(" ");
    svg += `<path d="${d} L${X(seg.at(-1).x)} ${bottom} L${X(seg[0].x)} ${bottom} Z" fill="url(#curve-fill)" stroke="none" clip-path="url(#plot-clip)"/><path d="${d}" fill="none" stroke="#3a6046" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#plot-clip)"/>`;
  }
  const val = valueAt(state.points, selection);
  if (val !== null) {
    const x = X(selection),
      y = Y(val);
    svg += `<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" stroke="#759662" stroke-width="1" stroke-dasharray="3 4"/><line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#759662" stroke-opacity=".55" stroke-width="1" stroke-dasharray="3 4"/><circle cx="${x}" cy="${y}" r="10" fill="#9ab97c" fill-opacity=".17" stroke="none"/><circle cx="${x}" cy="${y}" r="5" fill="#527443" stroke="#fff" stroke-width="2.5"/>`;
    $("#tooltip").hidden = false;
    $("#tooltip-time").textContent = selectedTime(selection);
    $("#tooltip-value").textContent = Math.round(val);
    const tip = $("#tooltip"),
      pos = tooltipPosition(
        x,
        y,
        width,
        height,
        tip.offsetWidth || 140,
        tip.offsetHeight || 84,
      );
    tip.style.left = pos.left + "px";
    tip.style.top = pos.top + "px";
  } else $("#tooltip").hidden = true;
  $("#plot").setAttribute("viewBox", `0 0 ${width} ${height}`);
  $("#plot").innerHTML = svg;
  $("#selected-value").textContent = val === null ? "—" : Math.round(val);
  $("#selected-time").textContent =
    val === null ? "이 구간은 원본 데이터가 없습니다" : selectedTime(selection);
  $("#chart").setAttribute("aria-valuenow", Math.round(selection * 100));
  $("#chart").setAttribute(
    "aria-valuetext",
    `${selectedTime(selection)}, ${val === null ? "데이터 없음" : Math.round(val) + " mg/dL 추정"}`,
  );
}
function selectPointer(e) {
  if (!state) return;
  const g = geometry(),
    r = $("#chart").getBoundingClientRect();
  selection = clamp((e.clientX - r.left - g.left) / (g.right - g.left), 0, 1);
  draw();
}
$("#chart").addEventListener("pointerdown", (e) => {
  if (!state || activePointer !== null) return;
  e.preventDefault();
  activePointer = e.pointerId;
  $("#chart").setPointerCapture(e.pointerId);
  selectPointer(e);
});
$("#chart").addEventListener("pointermove", (e) => {
  if (e.pointerId === activePointer) selectPointer(e);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  $("#chart").addEventListener(name, (e) => {
    if (e.pointerId === activePointer) activePointer = null;
  });
$("#chart").addEventListener("contextmenu", (e) => e.preventDefault());
$("#chart").addEventListener("keydown", (e) => {
  if (!state) return;
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  selection =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? 1
        : clamp(
            selection +
              (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.005),
            0,
            1,
          );
  draw();
});
new ResizeObserver(() => draw()).observe($("#chart"));
for (const id of ["#upload-button", "#replace-button"])
  $(id).addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", (e) => {
  if (e.target.files?.[0]) importImage(e.target.files[0]);
});
$("#demo-button").addEventListener("click", async () => {
  try {
    const r = await fetch(new URL("../demo.png", import.meta.url));
    if (!r.ok) throw Error();
    await importImage(await r.blob(), true);
  } catch {
    error("샘플을 열 수 없습니다. 앱을 새로고침해 주세요.");
  }
});
$("#calibration-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state) return;
  const [h, m] = $("#end-time").value.split(":").map(Number),
    duration = Number($("#hours").value) * 60;
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    duration < 300 ||
    duration > 720
  )
    return;
  state.calibration = {
    start: h * 60 + m - duration,
    duration,
    source: "manual",
  };
  updateCalibrationLabel();
  draw();
  $("#calibration-panel").open = false;
});
$("#settings-button").addEventListener("click", () => {
  const el = $("#calibration-panel");
  el.open = true;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
});
$("#help-button").addEventListener("click", () =>
  $("#help-dialog").showModal(),
);
for (const b of document.querySelectorAll("[data-close]"))
  b.addEventListener("click", () =>
    document.getElementById(b.dataset.close).close(),
  );
for (const d of document.querySelectorAll("dialog"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
$("#original-button").addEventListener("click", () => {
  if (!state) return;
  const c = $("#original-canvas");
  c.width = state.canvas.width;
  c.height = state.canvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(state.canvas, 0, 0);
  const a = state.axes;
  ctx.strokeStyle = "#318c57";
  ctx.lineWidth = 5;
  ctx.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
  $("#original-dialog").showModal();
});
$("#clear-button").addEventListener("click", () => {
  state = null;
  activePointer = null;
  document.body.classList.remove("has-data");
  $("#workspace").hidden = true;
  $("#plot").innerHTML = "";
  $("#original-canvas").width = 0;
  $("#original-canvas").height = 0;
  error("");
  status("");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#export-button").addEventListener("click", () => {
  if (!state) return;
  const rows = ["time,day_offset,x_ratio,estimated_glucose_mg_dL"];
  const c = state.calibration;
  for (const p of state.points) {
    const t = c ? c.start + p.x * c.duration : null,
      day = c
        ? Math.floor(t / 1440) - Math.floor((c.start + c.duration) / 1440)
        : "";
    rows.push(
      `${c ? formatTime(t) : ""},${day},${p.x.toFixed(5)},${p.value.toFixed(1)}`,
    );
  }
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "libre-lens-estimates.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install-button").hidden = false;
});
$("#install-button").addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  $("#install-button").hidden = true;
});
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(new URL("../sw.js", import.meta.url))
    .then(async () => {
      await navigator.serviceWorker.ready;
      $("#offline-status").textContent =
        "오프라인 준비 완료 · 사진은 기기 안에서만 분석";
    })
    .catch(() => {
      $("#offline-status").textContent =
        "기기 내 분석 · 오프라인 준비를 위해 다시 접속해 주세요";
    });
}
