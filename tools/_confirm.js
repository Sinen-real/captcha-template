// 校验顶栏「还原」的二次确认：
// A 点还原 -> 弹窗出现，且设置一个字都没动（确认前不能动，这是这条需求的全部意义）
// B 点取消 -> 弹窗关、设置原样
// C 点遮罩 -> 同取消
// D 按 Esc -> 同取消
// E 点确认 -> 弹窗关、设置真的回默认
// F 三种模式各自都走确认（代理的是当前面板那个隐藏按钮）
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
    // 探针：还原代理的是「当前模式」那个隐藏按钮，所以每种模式各取一个自己的设置
    window.__st = () => ({
      拼图大小: puzSt.size, 格数: gridN, 目标字: tcapChars,
      弹窗: document.getElementById("confirmModal").classList.contains("show") });
  });
  await new Promise(r => setTimeout(r, 250));

  console.log("\n顶栏「还原」二次确认：");

  // 先把设置改乱，才看得出「有没有被动过」
  await p.evaluate(() => {
    const e = document.getElementById("puzSize"); e.value = 70;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    gridN = 3; tcapChars = "改过了";
  });
  const before = await p.evaluate(() => window.__st());

  // A 点还原只弹窗，不动设置
  await p.click("#topExport");            // 先挪开焦点，顺便确认导出没被牵连
  await p.click("#topReset");
  await new Promise(r => setTimeout(r, 200));
  const a = await p.evaluate(() => window.__st());
  check("A 点还原只弹出确认，设置一个字没动",
        a.弹窗 === true && a.拼图大小 === before.拼图大小 && a.格数 === before.格数 && a.目标字 === before.目标字,
        "弹窗=" + a.弹窗 + "，拼图大小 " + before.拼图大小 + "→" + a.拼图大小 +
        "，格数 " + before.格数 + "→" + a.格数);

  // B 取消
  await p.click("#confirmCancel");
  await new Promise(r => setTimeout(r, 150));
  const bc = await p.evaluate(() => window.__st());
  check("B 取消：弹窗关掉、设置原样",
        bc.弹窗 === false && bc.拼图大小 === before.拼图大小,
        "弹窗=" + bc.弹窗 + "，拼图大小=" + bc.拼图大小);

  // C 点遮罩
  await p.click("#topReset");
  await new Promise(r => setTimeout(r, 150));
  await p.evaluate(() => {                                  // 点弹窗遮罩本身（不是里面的框）
    const m = document.getElementById("confirmModal");
    m.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 150));
  const c = await p.evaluate(() => window.__st());
  check("C 点遮罩 = 取消", c.弹窗 === false && c.拼图大小 === before.拼图大小,
        "弹窗=" + c.弹窗 + "，拼图大小=" + c.拼图大小);

  // D Esc
  await p.click("#topReset");
  await new Promise(r => setTimeout(r, 150));
  await p.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 150));
  const d = await p.evaluate(() => window.__st());
  check("D 按 Esc = 取消", d.弹窗 === false && d.拼图大小 === before.拼图大小,
        "弹窗=" + d.弹窗 + "，拼图大小=" + d.拼图大小);

  // E 确认后真的执行（切到拼图模式：还原代理的是当前面板那个按钮，验的就是这一条）
  await p.evaluate(() => document.querySelector('.tb-mode[data-mod="puz"]').click());
  await new Promise(r => setTimeout(r, 250));
  await p.evaluate(() => {
    const el = document.getElementById("puzSize"); el.value = 70;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const eBefore = await p.evaluate(() => puzSt.size);
  await p.click("#topReset");
  await new Promise(r => setTimeout(r, 150));
  await p.click("#confirmOk");
  await new Promise(r => setTimeout(r, 300));
  const e = await p.evaluate(() => window.__st());
  check("E 确认后真的执行了（且还原的是当前模式）",
        e.弹窗 === false && eBefore === 70 && e.拼图大小 === 48,
        "拼图大小 " + eBefore + " → " + e.拼图大小 + "（默认 48）");

  // F 三种模式都走确认
  const fBad = [];
  for (const m of ["img", "txt", "puz"]){
    await p.evaluate(x => document.querySelector('.tb-mode[data-mod="' + x + '"]').click(), m);
    await new Promise(r => setTimeout(r, 200));
    await p.evaluate(() => { window.__before = JSON.stringify([puzSt.size, gridN, tcapChars]); });
    await p.click("#topReset");
    await new Promise(r => setTimeout(r, 150));
    const shown = await p.evaluate(() => ({
      弹窗: document.getElementById("confirmModal").classList.contains("show"),
      没动: JSON.stringify([puzSt.size, gridN, tcapChars]) === window.__before }));
    if (!shown.弹窗 || !shown.没动) fBad.push(m + " " + JSON.stringify(shown));
    await p.click("#confirmCancel");
    await new Promise(r => setTimeout(r, 120));
  }
  check("F 三种模式的还原都先确认、且确认前不动设置", fBad.length === 0,
        fBad.join("  ") || "img/txt/puz 都对");

  check("G 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
