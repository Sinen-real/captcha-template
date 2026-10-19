// 校验「打乱切块」：预览排列 == 导出排列，且确实被打乱（不是原顺序）。
// 素材用 4x4 纯色块，便于从导出 PNG 采样还原出排列。
const path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const GRID = 4, TILE = 152, SIDE = TILE * GRID;      // 608 = 上传裁剪的 outW

/* 这个脚本是「打印式」的：❌ 只是打印出来，进程照样退 0 —— 外面 `node _xxx.js` 永远以为
   它绿了（_word 的「还原默认」那步就这么默默 ❌ 了很久才被发现）。数输出里的 ❌，有就退 1。 */
let __bad = 0;
const __log = console.log;
console.log = (...a) => { if (a.join(" ").indexOf("❌") >= 0) __bad++; __log(...a); };

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new",
    args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.setViewport({ width: 1180, height: 1200, deviceScaleFactor: 2 });
  await p.goto("file:///D:/checkcode/captcha.html", { waitUntil: "networkidle0" });
  await p.evaluate(() => { window.alert = () => {};
    window.xhs = { miniTool: { writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
                               saveImageToPhotosAlbum: () => Promise.resolve({}) } }; });

  // 1. 造 4x4 纯色素材（每格一个可反推下标的颜色）
  await p.evaluate((SIDE, TILE, GRID) => {
    const c = document.createElement("canvas"); c.width = SIDE; c.height = SIDE;
    const x = c.getContext("2d");
    for (let i = 0; i < GRID * GRID; i++){
      const r = Math.floor(i / GRID), cc = i % GRID;
      x.fillStyle = "rgb(" + (20 + i * 13) + "," + (30 + i * 7) + "," + (200 - i * 9) + ")";
      x.fillRect(cc * TILE, r * TILE, TILE, TILE);
    }
    window.__palette = [];
    const x2 = c.getContext("2d");
    for (let i = 0; i < GRID * GRID; i++){
      const d = x2.getImageData((i % GRID) * TILE + TILE / 2, Math.floor(i / GRID) * TILE + TILE / 2, 1, 1).data;
      window.__palette.push([d[0], d[1], d[2]]);
    }
    window.__testImg = c.toDataURL("image/png");
  }, SIDE, TILE, GRID);

  const inject = () => p.evaluate(() => {
    document.getElementById("pvImg").src = window.__testImg;
    imgLoaded = true;
    renderGrid();
  });

  // 从预览 DOM 的 backgroundPosition 还原排列（格数要用当前值，不能用写死的 4）
  const readPreview = () => p.evaluate(() => {
    const n = gridN;
    const out = [];
    document.querySelectorAll("#grid .cell").forEach(cell => {
      const bp = cell.style.backgroundPosition || "0% 0%";
      const [px, py] = bp.split(" ").map(s => parseFloat(s.replace("%", "")));
      const col = Math.round(px / (100 / (n - 1))), row = Math.round(py / (100 / (n - 1)));
      out.push(row * n + col);
    });
    return out;
  });

  await inject();
  const before = await readPreview();
  console.log("打乱前:", JSON.stringify(before), before.every((v, i) => v === i) ? "(=原顺序 ✓)" : "(非原顺序 ✗)");

  // 2. 打乱
  await p.click("#btnShuffle");
  await new Promise(r => setTimeout(r, 200));
  const after = await readPreview();
  const isIdentity = after.every((v, i) => v === i);
  const isPerm = new Set(after).size === GRID * GRID;
  console.log("打乱后:", JSON.stringify(after), "| 是排列:", isPerm, "| 仍是原顺序:", isIdentity);

  // 3. 导出，再从 PNG 采样还原排列
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 1200));
  const sampled = await p.evaluate(async (GRID, TILE, SIDE) => {
    const png = window.__png;
    if (!png) return null;
    const im = new Image();
    await new Promise(res => { im.onload = res; im.onerror = res; im.src = png; });
    const headH = document.getElementById("pvHead").offsetHeight;
    const scale = 2, pad = 10, contentW = 304;
    const cellW = contentW / GRID;                 // 画布坐标（1x）
    const imgX = pad, imgY = pad + headH;          // 导出里图片区左上（1x）
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;   // 按导出图实际尺寸建，否则右侧/下方被裁成 0
    const x = c.getContext("2d");
    x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, im.naturalWidth, im.naturalHeight);
    const at = (X, Y) => {
      const i = (Y * px.width + X) * 4;
      return [px.data[i], px.data[i + 1], px.data[i + 2]];
    };
    const pal = window.__palette;
    const near = c0 => {
      let bi = -1, bd = 1e9;
      pal.forEach((c1, i) => {
        const d = Math.abs(c1[0] - c0[0]) + Math.abs(c1[1] - c0[1]) + Math.abs(c1[2] - c0[2]);
        if (d < bd){ bd = d; bi = i; }
      });
      return { i: bi, d: bd };
    };
    const out = [], warn = [];
    for (let idx = 0; idx < GRID * GRID; idx++){
      const r = Math.floor(idx / GRID), cc = idx % GRID;
      // 格子中心（1x 画布坐标）-> 2x 像素
      const X = Math.round((imgX + cc * cellW + cellW / 2) * scale);
      const Y = Math.round((imgY + r * cellW + cellW / 2) * scale);
      const got = at(X, Y);
      const { i, d } = near(got);
      if (d > 24) warn.push("格" + idx + " 颜色偏离 " + d + " got=" + got);
      out.push(i);
    }
    return { out, warn, exportSize: [im.naturalWidth, im.naturalHeight] };
  }, GRID, TILE, SIDE);

  if (!sampled){ console.log("导出失败：没有拿到 PNG"); }
  else {
    console.log("导出还原:", JSON.stringify(sampled.out), "| 导出尺寸:", JSON.stringify(sampled.exportSize));
    if (sampled.warn.length) console.log("采样警告:", sampled.warn.join(" | "));
    const same = JSON.stringify(sampled.out) === JSON.stringify(after);
    console.log(same ? "✅ 预览排列 == 导出排列" : "❌ 预览与导出不一致\n   预览=" + JSON.stringify(after) + "\n   导出=" + JSON.stringify(sampled.out));
  }

  // 4. 切格数应复位
  await p.evaluate(() => document.querySelector('#gridOpts .opt[data-n="3"]').click());
  await new Promise(r => setTimeout(r, 200));
  const after3 = await readPreview();
  const reset3 = after3.length === 9 && after3.every((v, i) => v === i);
  console.log("切 3x3 后复位为原顺序:", reset3 ? "✅" : "❌ " + JSON.stringify(after3));

  console.log(errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors");
  console.log = __log;                      // 还原，别把收尾这句自己数进去
  await b.close();
  process.exit(__bad || errs.length ? 1 : 0);
})();
