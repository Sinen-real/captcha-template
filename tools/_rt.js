// 校验富文本框的「局部染色」：只染选中部分，不能波及整行。
// 图片面板四行有「行基色」(LINE_COLORS)，文字面板没有 —— 两边都要对。
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// 默认跑开发源；TARGET 指到打包产物就能验同一套断言在 dist 里也成立
const TARGET = process.env.TARGET || "file:///D:/checkcode/captcha.html";

const RED = "rgb(255, 0, 0)", BLUE = "rgb(0, 0, 255)";
const WHITE = "rgb(255, 255, 255)", BLACK = "rgb(34, 34, 34)";

const setup = p => p.evaluate(() => {
  // 逐字符取「实际渲染值」：文字节点的值 = 最近带该样式的祖先计算值
  window.__prop = function (root, prop){
    const out = [];
    (function walk(node, inherited){
      for (let i = 0; i < node.childNodes.length; i++){
        const c = node.childNodes[i];
        if (c.nodeType === 3){
          const s = c.nodeValue;
          for (let k = 0; k < s.length; k++) out.push({ ch: s.charAt(k), color: inherited });
        } else if (c.nodeType === 1) walk(c, getComputedStyle(c)[prop]);
      }
    })(root, getComputedStyle(root)[prop]);
    return out;
  };
  window.__colors = root => window.__prop(root, "color");
  window.__weights = root => window.__prop(root, "fontWeight");
  window.__tool = function (edId, kind){
    document.getElementById(edId).parentElement
      .querySelector('button[data-rt="' + kind + '"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };
  // 选中 [a,b) 个字符（跨 span 也认）
  window.__select = function (boxId, a, b){
    const box = document.getElementById(boxId);
    box.focus();
    let pos = 0, start = null, end = null;
    (function walk(node){
      for (let i = 0; i < node.childNodes.length; i++){
        const c = node.childNodes[i];
        if (c.nodeType === 3){
          const len = c.nodeValue.length;
          if (start === null && pos + len > a) start = { n: c, o: a - pos };
          if (end === null && pos + len >= b) end = { n: c, o: b - pos };
          pos += len;
        } else walk(c);
      }
    })(box);
    if (!start || !end) return "选区越界";
    const r = document.createRange();
    r.setStart(start.n, start.o); r.setEnd(end.n, end.o);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  };
  window.__pick = function (id, v){
    const el = document.querySelector(id.startsWith("#") || id.startsWith(".") ? id : "#" + id);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // 清掉选区（模拟用户点空白处）
  window.__clear = function (){ window.getSelection().removeAllRanges(); };
  window.alert = () => {};
  window.xhs = { miniTool: {
    writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
    saveImageToPhotosAlbum: () => Promise.resolve({}) } };
});

// 导出 PNG 里「接近纯红」的像素数（染整行 vs 只染 2 个字，差别很大）
async function redPixels(p, prepare){
  await prepare();
  await p.evaluate(() => { window.__png = null; });
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 1500));
  const png = await p.evaluate(() => window.__png);
  if (!png) return -1;
  return p.evaluate(d => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0);
      const d2 = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d2.length; i += 4)
        if (d2[i] > 200 && d2[i + 1] < 60 && d2[i + 2] < 60) n++;
      res(n);
    };
    im.src = d;
  }), png);
}

const colors  = (p, id) => p.evaluate(id => window.__colors(document.getElementById(id)), id);
const weights = (p, id) => p.evaluate(id => window.__weights(document.getElementById(id)), id);
const sel = (p, id, a, b) => p.evaluate((id, a, b) => window.__select(id, a, b), id, a, b);
const pick = (p, id, v) => p.evaluate((id, v) => window.__pick(id, v), id, v);
const tool = (p, id, k) => p.evaluate((id, k) => window.__tool(id, k), id, k);
const clear = p => p.evaluate(() => window.__clear());

// 把逐字符颜色压成「段」：{ch,color} -> [{t:"abc", c:color}]
const runs = cs => {
  const out = [];
  cs.forEach(o => {
    const last = out[out.length - 1];
    if (last && last.c === o.color) last.t += o.ch; else out.push({ t: o.ch, c: o.color });
  });
  return out.map(r => r.t + "=" + ({ "rgb(255, 255, 255)": "白", "rgb(255, 0, 0)": "红",
    "rgb(0, 0, 255)": "蓝", "rgb(34, 34, 34)": "深灰" }[r.c] || r.c)).join(" | ");
};
const flat = cs => cs.map(o => o.color).filter((c, i, a) => a.indexOf(c) === i);

let fails = 0;
function check(label, cs, expectSel, selIdx, expectOther){
  const picked = selIdx.every(i => cs[i] && cs[i].color === expectSel);
  const rest = cs.every((o, i) => selIdx.indexOf(i) >= 0 || o.color === expectOther);
  const ok = picked && rest;
  if (!ok) fails++;
  console.log("  " + (ok ? "✅" : "❌") + " " + label + "  →  " + runs(cs));
  if (!ok) console.log("      期望：选中位 " + JSON.stringify(selIdx) + " = " + expectSel + "，其余 = " + expectOther);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new",
    args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.setViewport({ width: 1180, height: 1200, deviceScaleFactor: 2 });
  await p.goto(TARGET, { waitUntil: "networkidle0" });
  await setup(p);

  // ================= 图片面板 =================
  console.log("##### 图片面板 · 第一行「请选择所有包含」 #####");
  // A. 干文本，选中间 2 个字（「择所」）染红
  await sel(p, "rowPre", 2, 4);
  await pick(p, "clPre", "#ff0000");
  check("A 首次局部染色（选 2-3 位）", await colors(p, "pvPre"), RED, [2, 3], WHITE);
  console.log("      诊断 pvPre:", await p.evaluate(() =>
    "style.color=" + (document.getElementById("pvPre").style.color || "(无)") +
    " innerHTML=" + document.getElementById("pvPre").innerHTML));

  // B. 整行先染蓝，再选中间 2 字染红
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  await sel(p, "rowPre", 0, 7); await pick(p, "clPre", "#0000ff"); await clear(p);   // 「请选择所有包含」7 字
  await sel(p, "rowPre", 2, 4); await pick(p, "clPre", "#ff0000");
  check("B 整行染蓝后，再局部染红", await colors(p, "pvPre"), RED, [2, 3], BLUE);

  // C. 无选区时改行基色 —— 必须整行都变（这是预期功能，不能被改坏）
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  await pick(p, "clPre", "#ff0000");
  check("C 无选区改整行基色", await colors(p, "pvPre"), RED, [0, 1, 2, 3, 4, 5], RED);

  console.log("\n##### 图片面板 · 第二行「红绿灯」 #####");
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  await sel(p, "rowTarget", 1, 2);
  await pick(p, "clTarget", "#ff0000");
  check("D 选「绿」染红", await colors(p, "pvTarget"), RED, [1], WHITE);

  // E. 整行加粗后，选中间 2 字取消加粗 —— 同样不能波及整行
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  await sel(p, "rowPre", 0, 7); await tool(p, "rowPre", "bold"); await clear(p);
  await sel(p, "rowPre", 2, 4); await tool(p, "rowPre", "bold");
  const w = await weights(p, "pvPre");
  const wok = w[2].color === "400" && w[3].color === "400" && w[0].color === "700" && w[6].color === "700";
  if (!wok) fails++;
  console.log("  " + (wok ? "✅" : "❌") + " E 整行加粗后局部取消加粗  →  " +
    w.map(o => o.ch + "=" + o.color).join(" "));

  // F. 导出比对：整行染红 vs 局部染红，红像素数必须差一个量级
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  const full = await redPixels(p, () => pick(p, "clPre", "#ff0000"));          // 无选区：整行红
  await p.reload({ waitUntil: "networkidle0" }); await setup(p);
  await sel(p, "rowPre", 2, 4);
  const part = await redPixels(p, () => pick(p, "clPre", "#ff0000"));          // 有选区：只 2 个字红
  const ep = full > 0 && part > 0 && part < full * 0.5;
  if (!ep) fails++;
  console.log("  " + (ep ? "✅" : "❌") + " F 导出红像素 整行=" + full + " 局部=" + part +
              "（局部 / 整行 = " + (full > 0 ? (part / full * 100).toFixed(0) : "-") + "%）");

  // ================= 文字面板（基准：据说是对的） =================
  console.log("\n##### 文字面板 · 提示文字「请在下图依次点击：」 #####");
  await p.evaluate(() => document.querySelector('#modeBar .tb-mode[data-mod="txt"]').click());
  await new Promise(r => setTimeout(r, 300));
  await sel(p, "tipPre", 2, 4);
  await pick(p, ".rt-tools#rtTools .rt-color", "#ff0000");   // 注意：这个取色器没有 id
  check("G 选 2-3 位染红（基准行为，应始终正确）", await colors(p, "tcapPre"), RED, [2, 3], BLACK);

  console.log("\n" + (errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors"));
  console.log(fails ? "\n❌ " + fails + " 项不符" : "\n✅ 全部符合");
  await b.close();
  process.exit((fails || errs.length) ? 1 : 0);
})();
