// 校验「我不是机器人」前置在三个模式里都能用：
// A 三种模式各自勾上 -> 前置卡出现、该模式卡片被隐藏、且就住在当前面板里；开关都在「素材」页签
// B 点一下 -> 转圈 -> 打绿勾 -> 前置消失卡片露出来
// C 三个开关状态同步
// D 切模式时前置卡跟着搬走，不会留在上一个面板；进新模式前置重走一遍
// E 前置不进导出（显示中导出 == 不显示时导出，逐像素相同）
// F 无 JS 报错
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
    window.__mod = async m => {
      document.querySelector('.tb-mode[data-mod="' + m + '"]').click();
      await new Promise(r => setTimeout(r, 260));
    };
    window.__toggle = (on, which) => {
      const t = document.querySelector('.rc-tog[data-panel="' + (which || "img") + '"]');
      t.checked = on; t.dispatchEvent(new Event("change", { bubbles: true }));
    };
    window.__probe = () => {
      const c = document.getElementById("rcCard");
      const lay = document.querySelector(".layout:not([style*='none'])");
      const card = lay.querySelector(".challenge, .tcap, .puz-canvas");
      // 前置开关统一挂在「素材」页签的小标题下（原来图片模式那个在设计页签里，那个页签已撤）
      const tog = lay.querySelector(".rc-tog");
      const pane = tog && tog.closest(".dock-pane");
      return { 前置: getComputedStyle(c).display,
               卡片: card ? getComputedStyle(card).visibility : "?",
               同面板: lay.contains(c),
               开关页签: pane ? pane.dataset.tab : "?",
               打勾: document.getElementById("rcCheck").className,
               转圈: getComputedStyle(document.getElementById("rcSpin")).display };
    };
  });
  const mod = m => p.evaluate(x => window.__mod(x), m);
  const probe = () => p.evaluate(() => window.__probe());

  console.log("\n「我不是机器人」前置 · 三个模式：");

  // A 三种模式
  await p.evaluate(() => window.__toggle(true));
  const aBad = [];
  for (const m of ["img", "txt", "puz"]){
    await mod(m);
    const r = await probe();
    if (!(r.前置 === "block" && r.卡片 === "hidden" && r.同面板 && r.开关页签 === "mat"))
      aBad.push(m + " " + JSON.stringify(r));
  }
  check("A 三种模式：前置卡都出现、卡片都让位、开关都在「素材」里", aBad.length === 0,
        aBad.join("  ") || "img/txt/puz 都对，开关都在素材页签、卡都住在当前面板里");

  // B 点一下走完流程
  await mod("txt");
  await p.evaluate(() => document.getElementById("rcCard").click());
  await new Promise(r => setTimeout(r, 200));
  const during = await probe();
  await new Promise(r => setTimeout(r, 2100));
  const after = await probe();
  check("B 点一下：先转圈，再打绿勾、卡片露出来",
        during.转圈 === "block" && after.打勾.indexOf("done") >= 0 && after.前置 === "none" && after.卡片 === "visible",
        "转圈中 转圈=" + during.转圈 + "；走完 勾=" + after.打勾.replace("checkbox", "").trim() +
        " 前置=" + after.前置 + " 卡片=" + after.卡片);

  // D 切走再切回来：卡跟着搬，且前置重走一遍
  await mod("puz");
  const d1 = await probe();
  await mod("img");
  const d2 = await probe();
  check("D 切模式前置卡跟着搬、前置重走一遍",
        d1.同面板 && d1.前置 === "block" && d2.同面板 && d2.前置 === "block" && d2.卡片 === "hidden",
        "拼图 " + JSON.stringify(d1) + "  图片 " + JSON.stringify(d2));

  // C 三个开关同步
  await p.evaluate(() => window.__toggle(false, "puz"));
  const cOff = await p.evaluate(() => [...document.querySelectorAll(".rc-tog")].map(x => x.checked).join(","));
  await p.evaluate(() => window.__toggle(true, "txt"));
  const cOn = await p.evaluate(() => [...document.querySelectorAll(".rc-tog")].map(x => x.checked).join(","));
  check("C 三个开关状态同步", cOff === "false,false,false" && cOn === "true,true,true",
        "关 " + cOff + " / 开 " + cOn);

  // E 前置不进导出
  await mod("txt");
  await p.evaluate(() => window.__toggle(true));
  await new Promise(r => setTimeout(r, 200));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const withRc = await p.evaluate(() => window.__png);
  await p.evaluate(() => window.__toggle(false));
  await new Promise(r => setTimeout(r, 200));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const withoutRc = await p.evaluate(() => window.__png);
  check("E 前置不进导出（两次导出逐字节相同）",
        !!withRc && withRc === withoutRc,
        withRc ? "两张都 " + Math.round(withRc.length / 1024) + "KB，" + (withRc === withoutRc ? "一致" : "不一致") : "导出没读到图");

  check("F 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
