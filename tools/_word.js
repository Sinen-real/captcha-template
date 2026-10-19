// 校验「词组模式」：切分粒度、顶栏/图上单位、隐藏与额外、导出。
const fs = require("fs"), path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const setField = (p, id, v) => p.evaluate((id, v) => {
  const el = document.getElementById(id); el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, id, v);

const state = p => p.evaluate(() => ({
  顶栏: [...document.querySelectorAll("#tcapTargets .tt")].map(e => e.textContent),
  图上: [...document.querySelectorAll("#tcapPhoto .tcap-ch")].map(e => ({
    t: e.textContent.replace(/\d/g, ""), ti: e.dataset.ti,
    字: parseFloat(e.style.fontSize) })),
  模式: document.querySelector("#txtSplit .mode-btn.active").dataset.split,
}));

const show = (label, s) => {
  console.log(`\n【${label}】模式=${s.模式}`);
  console.log("  顶栏:", JSON.stringify(s.顶栏));
  console.log("  图上:", s.图上.map(o => o.t + (o.ti === "-1" ? "(额外)" : "#" + o.ti)).join(" ") +
              "  字号=" + (s.图上[0] ? s.图上[0].字 : "-"));
};

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
                               saveImageToPhotosAlbum: () => Promise.resolve({}) } };
    document.querySelector('#modeBar .tb-mode[data-mod="txt"]').click(); });
  await new Promise(r => setTimeout(r, 300));

  // ---- 1. 单字模式（回归：应与改动前一致）----
  await setField(p, "txtChars", "花根");
  await new Promise(r => setTimeout(r, 250));
  const s1 = await state(p);
  show("单字模式 花根", s1);
  console.log("  期望 顶栏=[花,根] 图上=2 个 →",
    JSON.stringify(s1.顶栏) === '["花","根"]' && s1.图上.length === 2 ? "✅" : "❌");

  // ---- 2. 切到词组模式 ----
  await p.evaluate(() => document.querySelector('#txtSplit .mode-btn[data-split="word"]').click());
  await setField(p, "txtChars", "红灯 绿灯 花");
  await new Promise(r => setTimeout(r, 250));
  const s2 = await state(p);
  show("词组模式 红灯 绿灯 花", s2);
  console.log("  期望 顶栏=[红灯,绿灯,花]、图上 3 个 →",
    JSON.stringify(s2.顶栏) === '["红灯","绿灯","花"]' && s2.图上.length === 3 ? "✅" : "❌");

  // ---- 3. 隐藏一个词 ----
  await setField(p, "txtHidden", "绿灯");
  await new Promise(r => setTimeout(r, 250));
  const s3 = await state(p);
  show("隐藏「绿灯」", s3);
  const hid = JSON.stringify(s3.顶栏) === '["红灯","绿灯","花"]' && s3.图上.length === 2 &&
              !s3.图上.some(o => o.t === "绿灯");
  console.log("  期望 顶栏仍 3 个、图上 2 个且无绿灯 →", hid ? "✅" : "❌");

  // ---- 4. 加额外词 ----
  await setField(p, "txtExtra", "蓝 紫");
  await new Promise(r => setTimeout(r, 250));
  const s4 = await state(p);
  show("额外 蓝 紫", s4);
  const ext = s4.图上.length === 4 && s4.图上.filter(o => o.ti === "-1").length === 2;
  console.log("  期望 图上 4 个、其中 2 个额外 →", ext ? "✅" : "❌");

  // ---- 5. 重复词各自独立（每项保留自己的字效）----
  await setField(p, "txtHidden", "");
  await setField(p, "txtExtra", "");
  await setField(p, "txtChars", "红灯 红灯 绿灯");
  await new Promise(r => setTimeout(r, 250));
  const s5 = await state(p);
  show("重复词 红灯 红灯 绿灯", s5);
  console.log("  期望 顶栏 3 个、图上 3 个 →",
    s5.顶栏.length === 3 && s5.图上.length === 3 ? "✅" : "❌");

  // ---- 6. 导出 ----
  await setField(p, "txtChars", "红灯 绿灯 花");
  await setField(p, "txtExtra", "蓝");
  await new Promise(r => setTimeout(r, 250));
  await p.evaluate(() => { window.__png = null; });
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 1200));
  const png = await p.evaluate(() => window.__png || null);
  if (png){ fs.writeFileSync(path.join(__dirname, "word-export.png"), Buffer.from(png.split(",")[1], "base64")); console.log("\n导出: word-export.png ✅"); }
  else console.log("\n导出失败 ❌");

  // ---- 7. 还原默认应回到单字（顶栏那个「还原」现在要先过一次二次确认弹窗）----
  await p.click("#topReset");
  await new Promise(r => setTimeout(r, 200));
  await p.click("#confirmOk");
  await new Promise(r => setTimeout(r, 300));
  const s7 = await state(p);
  show("还原默认", s7);
  console.log("  期望 模式=char 顶栏=[花,根] →",
    s7.模式 === "char" && JSON.stringify(s7.顶栏) === '["花","根"]' ? "✅" : "❌");

  console.log("\n" + (errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors"));
  console.log = __log;                      // 还原，别把收尾这句自己数进去
  await b.close();
  process.exit(__bad || errs.length ? 1 : 0);
})();
