// 打乱功能在「每格单图」「双图叠选」下的预览↔导出比对。
const path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const GRID = 4, TILE = 152, SIDE = TILE * GRID;

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

  // 造素材：__tiles[k] = 第 k 格纯色块拼成的整图；__imgs[i] = 第 i 张单图
  await p.evaluate((SIDE, TILE, GRID) => {
    const mk = (fn) => {
      const c = document.createElement("canvas"); c.width = SIDE; c.height = SIDE;
      const x = c.getContext("2d");
      for (let i = 0; i < GRID * GRID; i++){
        x.fillStyle = fn(i);
        x.fillRect((i % GRID) * TILE, Math.floor(i / GRID) * TILE, TILE, TILE);
      }
      return c;
    };
    window.__palA = [], window.__palB = [];
    const scan = (c, pal) => { const x = c.getContext("2d");
      for (let i = 0; i < GRID * GRID; i++){
        const d = x.getImageData((i % GRID) * TILE + TILE / 2, Math.floor(i / GRID) * TILE + TILE / 2, 1, 1).data;
        pal.push([d[0], d[1], d[2]]);
      } };
    const cs = mk(i => "rgb(" + (20 + i * 13) + "," + (30 + i * 7) + "," + (200 - i * 9) + ")");
    scan(cs, window.__palA);
    window.__imgA = cs.toDataURL("image/png");
    const cb = mk(i => "rgb(" + (200 - i * 9) + "," + (150 + i * 5) + "," + (40 + i * 11) + ")");
    scan(cb, window.__palB);
    window.__imgB = cb.toDataURL("image/png");
    // 每格单图：16 张整体纯色图
    window.__single = [];
    for (let i = 0; i < GRID * GRID; i++){
      const c = document.createElement("canvas"); c.width = SIDE; c.height = SIDE;
      const x = c.getContext("2d");
      x.fillStyle = "rgb(" + (10 + i * 15) + "," + (240 - i * 12) + "," + (60 + i * 8) + ")";
      x.fillRect(0, 0, SIDE, SIDE);
      window.__single.push({ url: c.toDataURL("image/png"), rgb: [10 + i * 15, 240 - i * 12, 60 + i * 8] });
    }
    window.__single_rgb = window.__single.map(s => s.rgb);
  }, SIDE, TILE, GRID);

  // 从导出 PNG 采样：返回每格还原出的调色板下标
  const sampleExport = (palKey) => p.evaluate(async (GRID, palKey) => {
    const png = window.__png; if (!png) return null;
    const im = new Image();
    await new Promise(r => { im.onload = r; im.onerror = r; im.src = png; });
    const headH = document.getElementById("pvHead").offsetHeight;
    const scale = 2, pad = 10, contentW = 304, cellW = contentW / GRID;
    const imgX = pad, imgY = pad + headH;
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, im.naturalWidth, im.naturalHeight);
    const pal = window[palKey];
    const out = [], warn = [];
    for (let idx = 0; idx < GRID * GRID; idx++){
      const r = Math.floor(idx / GRID), cc = idx % GRID;
      const X = Math.round((imgX + cc * cellW + cellW / 2) * scale);
      const Y = Math.round((imgY + r * cellW + cellW / 2) * scale);
      const i4 = (Y * px.width + X) * 4;
      const got = [px.data[i4], px.data[i4 + 1], px.data[i4 + 2]];
      let bi = -1, bd = 1e9;
      pal.forEach((q, i) => { const d = Math.abs(q[0]-got[0])+Math.abs(q[1]-got[1])+Math.abs(q[2]-got[2]); if (d < bd){ bd = d; bi = i; } });
      if (bd > 24) warn.push("格" + idx + " 偏离 " + bd + " got=" + got);
      out.push(bi);
    }
    return { out, warn, size: [im.naturalWidth, im.naturalHeight] };
  }, GRID, palKey);

  const exportPng = async () => {
    await p.evaluate(() => { window.__png = null; });
    await p.click("#topExport");
    await new Promise(r => setTimeout(r, 1200));
  };

  // ---------- A. 每格单图 ----------
  await p.evaluate((GRID) => {
    document.querySelector('#uploadMode .mode-btn[data-umode="percell"]').click();
    cellImages = {};
    for (let i = 0; i < GRID * GRID; i++) cellImages[i] = window.__single[i].url;
    renderCellUploads(); renderGrid();
  }, GRID);
  await new Promise(r => setTimeout(r, 200));
  const idxOf = (u) => window.__single.findIndex(s => s.url === u);
  const readPerCell = () => p.evaluate(() => {
    const m = window.__single;
    return [...document.querySelectorAll("#grid .cell")].map(cell => {
      const u = (cell.style.backgroundImage || "").replace(/^url\("?/, "").replace(/"?\)$/, "");
      return m.findIndex(s => s.url === u);
    });
  });
  const pcBefore = await readPerCell();
  console.log("每格单图 打乱前:", JSON.stringify(pcBefore), pcBefore.every((v,i)=>v===i) ? "(原顺序 ✓)" : "✗");
  await p.click("#btnShuffle");
  await new Promise(r => setTimeout(r, 250));
  const pcAfter = await readPerCell();
  console.log("每格单图 打乱后:", JSON.stringify(pcAfter), "| 是排列:", new Set(pcAfter).size === 16);
  await exportPng();
  const pcExp = await sampleExport("__single_rgb");
  if (!pcExp) console.log("每格单图 导出失败");
  else {
    // 单图模式下各格是纯色，直接按 rgb 反查
    const got = pcExp.warn.length ? null : pcExp.out;
    console.log("每格单图 导出还原:", JSON.stringify(pcExp.out), pcExp.warn.length ? "警告:" + pcExp.warn.join("|") : "");
    console.log(JSON.stringify(pcExp.out) === JSON.stringify(pcAfter) ? "✅ 每格单图 预览==导出" : "❌ 每格单图 不一致 预览=" + JSON.stringify(pcAfter));
  }

  // 每格单图时主图没上传，imgLoaded 仍是 true、bitmaps[0] 是灰占位图。
  // 导出若把它当第一个图标画进底栏，左下角就会凭空多一个灰方块（曾经的真 bug）。
  const foot = await p.evaluate(() => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0);
      const y0 = im.height - 90, d = x.getImageData(0, y0, im.width, 90).data;
      let gray = 0;
      for (let i = 0; i < d.length; i += 4)
        if (Math.abs(d[i] - 201) < 12 && Math.abs(d[i+1] - 201) < 12 && Math.abs(d[i+2] - 201) < 12) gray++;
      res(gray);
    };
    im.src = window.__png;
  }));
  // 图标本身是深灰描边，抗锯齿会带出几百个中间色；一整块 18×18 灰方块≈1300+
  console.log(foot < 400 ? "✅ 每格单图 底栏没有多出灰方块（" + foot + "）"
                         : "❌ 每格单图 底栏多出灰方块（灰像素 " + foot + "）");

  // ---------- B. 双图叠选 ----------
  // 预览真相：每格的 backgroundPosition 给出「源位」，图 A/B 由背景图 dataURL 判定
  await p.evaluate(() => {
    document.querySelector('#uploadMode .mode-btn[data-umode="dual"]').click();
    document.getElementById("pvImg").src = window.__imgA; imgLoaded = true;
    dualB = window.__imgB;
    renderGrid();
  });
  await new Promise(r => setTimeout(r, 200));
  await p.click("#btnShuffle");
  await new Promise(r => setTimeout(r, 250));
  // 选中 0 / 5 / 10 三格
  await p.evaluate((GRID) => {
    [0, 5, 10].forEach(i => document.querySelectorAll("#grid .cell")[i].click());
  }, GRID);
  await new Promise(r => setTimeout(r, 200));

  const readDual = () => p.evaluate((GRID) => {
    const A = window.__imgA, B = window.__imgB;
    return [...document.querySelectorAll("#grid .cell")].map(cell => {
      const u = (cell.style.backgroundImage || "").replace(/^url\("?/, "").replace(/"?\)$/, "");
      const bp = cell.style.backgroundPosition || "0% 0%";
      const [px, py] = bp.split(" ").map(s => parseFloat(s.replace("%", "")));
      const col = Math.round(px / (100 / (GRID - 1))), row = Math.round(py / (100 / (GRID - 1)));
      return { img: (u === A ? "A" : u === B ? "B" : "?"), src: row * GRID + col };
    });
  }, GRID);

  const dualPreview = await readDual();
  console.log("双图 预览:", JSON.stringify(dualPreview));
  const selSet = new Set([0, 5, 10]);
  const imgOk = dualPreview.every((d, i) => d.img === (selSet.has(i) ? "B" : "A"));
  console.log("双图 选中格显示图 B / 未选中显示图 A:", imgOk ? "✅" : "❌");

  await exportPng();
  const dualExp = await p.evaluate(async (GRID) => {
    const png = window.__png; if (!png) return null;
    const im = new Image();
    await new Promise(r => { im.onload = r; im.onerror = r; im.src = png; });
    const headH = document.getElementById("pvHead").offsetHeight;
    const scale = 2, pad = 10, contentW = 304, cellW = contentW / GRID;
    const imgX = pad, imgY = pad + headH;
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, im.naturalWidth, im.naturalHeight);
    const near = (pal, got) => { let bi = -1, bd = 1e9;
      pal.forEach((q, i) => { const d = Math.abs(q[0]-got[0])+Math.abs(q[1]-got[1])+Math.abs(q[2]-got[2]); if (d < bd){ bd = d; bi = i; } });
      return { bi, bd }; };
    const out = [], warn = [];
    for (let idx = 0; idx < GRID * GRID; idx++){
      const r = Math.floor(idx / GRID), cc = idx % GRID;
      const X = Math.round((imgX + cc * cellW + cellW / 2) * scale);
      const Y = Math.round((imgY + r * cellW + cellW / 2) * scale);
      const i4 = (Y * px.width + X) * 4;
      const got = [px.data[i4], px.data[i4 + 1], px.data[i4 + 2]];
      const a = near(window.__palA, got), bb = near(window.__palB, got);
      const pick = a.bd <= bb.bd ? { img: "A", s: a } : { img: "B", s: bb };
      if (pick.s.bd > 24) warn.push("格" + idx + " 偏离 " + pick.s.bd + " got=" + got);
      out.push({ img: pick.img, src: pick.s.bi });
    }
    return { out, warn };
  }, GRID);

  if (!dualExp) console.log("双图 导出失败");
  else {
    console.log("双图 导出:", JSON.stringify(dualExp.out));
    if (dualExp.warn.length) console.log("采样警告:", dualExp.warn.join(" | "));
    const same = JSON.stringify(dualExp.out) === JSON.stringify(dualPreview);
    console.log(same ? "✅ 双图 预览==导出（含 A/B 与打乱位）"
                     : "❌ 双图 不一致\n   预览=" + JSON.stringify(dualPreview) + "\n   导出=" + JSON.stringify(dualExp.out));
  }

  console.log(errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors");
  console.log = __log;
  await b.close();
  process.exit((__bad || errs.length) ? 1 : 0);
})();
