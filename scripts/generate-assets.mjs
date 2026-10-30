// Reproducible, fictional demo. No original health screenshot is published.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const images = await page.evaluate(() => {
  const result = {};
  for (const size of [180, 192, 512]) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.scale(size / 64, size / 64);
    g.fillStyle = "#183c32";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#c4ed94";
    g.lineWidth = 3.5;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(13, 35);
    g.lineTo(22, 35);
    g.lineTo(28, 22);
    g.lineTo(37, 44);
    g.lineTo(43, 32);
    g.lineTo(51, 32);
    g.stroke();
    g.beginPath();
    g.arc(43, 32, 4, 0, Math.PI * 2);
    g.fillStyle = "#c4ed94";
    g.fill();
    result[size] = c.toDataURL().split(",")[1];
  }
  const c = document.createElement("canvas");
  c.width = 1206;
  c.height = 2622;
  const g = c.getContext("2d");
  g.fillStyle = "white";
  g.fillRect(0, 0, 1206, 2622);
  g.fillStyle = "#203b34";
  g.font = "bold 45px sans-serif";
  g.fillText("20:52", 140, 116);
  g.textAlign = "center";
  g.font = "bold 50px sans-serif";
  g.fillText("Libre Lens · DEMO", 603, 253);
  g.fillStyle = "#d8eabf";
  g.fillRect(0, 301, 1206, 450);
  g.fillStyle = "#203b34";
  g.font = "38px sans-serif";
  g.fillText("가상의 샘플 데이터", 603, 420);
  g.font = "bold 190px sans-serif";
  g.fillText("115", 530, 650);
  g.font = "45px sans-serif";
  g.fillText("mg/dL", 826, 640);
  const left = 138,
    right = 1145,
    top = 892,
    step = 165,
    bottom = 2047,
    Y = (v) => bottom - (v / 50) * step;
  g.fillStyle = "#eef5e3";
  g.fillRect(left, Y(140), right - left, Y(70) - Y(140));
  g.textAlign = "right";
  g.font = "34px sans-serif";
  for (let v = 50; v <= 350; v += 50) {
    g.strokeStyle = "#aaa";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(left, Y(v));
    g.lineTo(right, Y(v));
    g.stroke();
    g.fillStyle = "#252a22";
    g.fillText(v, left - 18, Y(v) + 10);
  }
  g.strokeStyle = "#92978d";
  g.beginPath();
  g.moveTo(left, bottom);
  g.lineTo(right, bottom);
  g.stroke();
  g.textAlign = "center";
  g.fillStyle = "#202a23";
  g.font = "34px sans-serif";
  g.fillText("오후3", left + 0.265 * (right - left), bottom + 48);
  g.fillText("오후6", left + 0.64 * (right - left), bottom + 48);
  const vals = [
    119, 115, 115, 111, 113, 109, 102, 102, 98, 93, 103, 97, 91, 105, 100, 95,
    88, 87, 89, 95, 108, 113, 94, 83, 94, 100, 99, 95, 109, 130, 138, 125, 118,
    115,
  ];
  g.strokeStyle = "#121b15";
  g.lineWidth = 11;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  vals.forEach((v, i) => {
    const x = left + ((right - left) * i) / (vals.length - 1);
    if (!i) g.moveTo(x, Y(v));
    else g.lineTo(x, Y(v));
  });
  g.stroke();
  g.setLineDash([18, 12]);
  g.strokeStyle = "#777";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(right, 780);
  g.lineTo(right, bottom);
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  g.arc(right, Y(115), 26, 0, Math.PI * 2);
  g.fillStyle = "#91c737";
  g.fill();
  g.strokeStyle = "#202a20";
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = "#f1f4ed";
  g.fillRect(50, 2190, 1106, 140);
  g.fillStyle = "#879479";
  g.font = "32px sans-serif";
  g.fillText("실제 건강 정보가 아닌 데모 이미지입니다.", 603, 2275);
  result.demo = c.toDataURL().split(",")[1];
  return result;
});
for (const size of [180, 192, 512])
  await writeFile(
    `public/icons/${size === 180 ? "apple-touch-icon" : "icon-" + size}.png`,
    Buffer.from(images[size], "base64"),
  );
await writeFile("public/demo.png", Buffer.from(images.demo, "base64"));
await browser.close();
