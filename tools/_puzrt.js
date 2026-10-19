// 校验拼图的标题/提示改成富文本后：
// A 走真实工具条加粗 -> 画布上标题那行墨迹变多
// B 改字号 -> 卡片变高、照片整体下移（puzLayout 跟着走）
// C 改颜色 -> 画布上真的出现那个颜色
// D 长文案折行，且不超出卡片宽度
// E 清空标题 -> 那一行不占位（卡片变矮）
// F 预览与导出量到的同一段文字宽度一致
// G 无 JS 报错
const path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

let pass = 0, fail = 0;
function check(name, ok, extra){
  if (ok) { pass++; console.log("  ✅ " + name + (extra ? "  →  " + extra : "")); }
  else { fail++; console.log("  ❌ " + name + (extra ? "  →  " + extra : "")); }
}

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new",
    args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 1 });
  await p.goto("file:///D:/checkcode/captcha.html", { waitUntil: "networkidle0" });
  await p.evaluate(() => {
    window.alert = () => {};
    window.xhs = { miniTool: { writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
                               saveImageToPhotosAlbum: () => Promise.resolve({}) } };
    document.querySelector('.tb-mode[data-mod="puz"]').click();
  });
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate(() => document.querySelector('#panelPuz .dock-tab[data-tab="text"]').click());
  await new Promise(r => setTimeout(r, 250));

  await p.evaluate(() => {
    // 设编辑器内容 + 派发 input（真实打字走的就是这条路）
    window.__setRt = (id, html) => {
      const el = document.getElementById(id);
      el.innerHTML = html;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    window.__geo = () => { const L = puzLayout(); return { H: L.H, photoTop: L.photoTop }; };
    // 读画布某一段横条里的墨迹（非白像素）范围与数量
    window.__ink = (cv, y0, y1) => {
      const x = cv.getContext("2d");
      const d = x.getImageData(0, 0, cv.width, cv.height).data;
      const W = cv.width;
      let x0 = 1e9, x1 = -1, n = 0, red = 0;
      for (let y = Math.max(0, Math.round(y0)); y < Math.min(cv.height, Math.round(y1)); y++)
        for (let xx = 0; xx < W; xx++){
          const i = (y * W + xx) * 4;
          if (d[i] < 210 || d[i+1] < 210 || d[i+2] < 210){
            n++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
            if (d[i] > 150 && d[i+1] < 90 && d[i+2] < 90) red++;
          }
        }
      return { x0: x0, x1: x1, w: x1 < 0 ? 0 : x1 - x0 + 1, n: n, 红: red };
    };
    // 标题那一行在画布上的像素带（按当前倍率换算）
    window.__titleBand = (cv, scale) => {
      const T = puzTextRows();
      return window.__ink(cv, PUZ.PAD_T * scale, (PUZ.PAD_T + T.titleH) * scale);
    };
    window.__tipBand = (cv, scale) => {
      const T = puzTextRows();
      return window.__ink(cv, T.tipY * scale, (T.tipY + T.tipH) * scale);
    };
  });

  console.log("\n拼图 · 标题与提示改富文本：");

  // A 真实工具条加粗
  const a0 = await p.evaluate(() => window.__titleBand(document.getElementById("puzCanvas"), puzPreviewScale));
  await p.evaluate(() => {
    const ed = document.getElementById("puzTitleRt");
    const r = document.createRange(); r.selectNodeContents(ed);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    ed.dispatchEvent(new Event("focus"));
  });
  await p.click("#panelPuz .rt-tools button[data-rt=bold]");
  await new Promise(r => setTimeout(r, 250));
  const a1 = await p.evaluate(() => window.__titleBand(document.getElementById("puzCanvas"), puzPreviewScale));
  const aHtml = await p.evaluate(() => puzSt.title);
  check("A 工具条加粗真的落到画布上",
        a1.n > a0.n && /font-weight|fontStyle|<b>/.test(aHtml),
        "墨迹 " + a0.n + " → " + a1.n + "，状态里的 HTML：" + aHtml);

  // B 改字号 -> 卡片变高、照片下移
  const b0 = await p.evaluate(() => window.__geo());
  await p.evaluate(() => window.__setRt("puzTitleRt", '<span style="font-size:30px">安全验证</span>'));
  await new Promise(r => setTimeout(r, 250));
  const b1 = await p.evaluate(() => window.__geo());
  check("B 字号变大 -> 卡片变高、照片下移",
        b1.H > b0.H + 10 && b1.photoTop > b0.photoTop + 10,
        "H " + b0.H + " → " + b1.H + "，photoTop " + b0.photoTop + " → " + b1.photoTop);

  // C 改颜色 -> 画布上出现这个颜色
  await p.evaluate(() => window.__setRt("puzTipRt", '<span style="color:#ff0000">拖动下方滑块完成拼图</span>'));
  await new Promise(r => setTimeout(r, 250));
  const c = await p.evaluate(() => window.__tipBand(document.getElementById("puzCanvas"), puzPreviewScale));
  check("C 改颜色真的画出来", c.红 > 40, "提示那行红像素 " + c.红 + " 个（总墨迹 " + c.n + "）");

  // D 长文案折行且不出卡片
  await p.evaluate(() => window.__setRt("puzTitleRt",
    "这是一段故意写得很长的标题文案用来触发自动折行看看会不会戳出卡片外面"));
  await new Promise(r => setTimeout(r, 250));
  const d = await p.evaluate(() => {
    const cv = document.getElementById("puzCanvas"), s = puzPreviewScale;
    const band = window.__titleBand(cv, s);
    return { band: band, T: puzTextRows(), 画布宽: cv.width, s: s };
  });
  check("D 长文案折成多行且不超出卡片宽度",
        d.T.title.length > 1 && d.band.x0 >= 0 && d.band.x1 < d.画布宽 - 1 &&
        (d.band.x1 / d.s) <= 320 - 8 + 1,
        d.T.title.length + " 行，墨迹 x " + d.band.x0 + "~" + d.band.x1 + "（画布宽 " + d.画布宽 + "）");

  // E 清空标题 -> 那行不占位
  await p.evaluate(() => window.__setRt("puzTitleRt", ""));
  await new Promise(r => setTimeout(r, 250));
  const e1 = await p.evaluate(() => ({ geo: window.__geo(), T: puzTextRows() }));
  check("E 清空标题后那一行不占位", e1.T.titleBlank === true && e1.geo.photoTop < d.T.titleY + 40,
        "titleBlank=" + e1.T.titleBlank + "，photoTop=" + e1.geo.photoTop);

  // F 预览与导出的文字宽度一致
  await p.evaluate(() => window.__setRt("puzTitleRt", "安全验证"));
  await p.evaluate(() => window.__setRt("puzTipRt", "拖动下方滑块完成拼图"));
  await new Promise(r => setTimeout(r, 300));
  const prev = await p.evaluate(() => {
    const cv = document.getElementById("puzCanvas"), s = puzPreviewScale;
    const b = window.__titleBand(cv, s);
    return { w: b.w / s, s: s };
  });
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const exp = await p.evaluate(() => {
    const b = window.__titleBand(puzCanvasAt(2), 2);
    return { w: b.w / 2 };
  });
  check("F 预览与导出的文字宽度一致",
        Math.abs(prev.w - exp.w) <= 2,
        "预览 " + prev.w.toFixed(1) + "px（倍率 " + prev.s.toFixed(2) + "）  vs  导出 " + exp.w.toFixed(1) + "px");

  check("G 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
