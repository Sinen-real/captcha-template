// 校验「新功能的一次性 NEW 角标」：
// A 开箱：歪斜 1 个、自定义 2 个（缺口那行 + 拼图块那行，共用一个 key）
// B/C 各自用过一次 -> 对应角标消失，且只消失它自己
// D 刷新后依然消失（记住了）
// E 角标不吃点击（不挡住它提示的那个按钮）
// F ?new=1 强制全亮，用掉也不消失、不记账
// G 无 JS 报错
const puppeteer = require("puppeteer-core");
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
  await p.evaluate(() => { window.alert = () => {}; });
  await new Promise(r => setTimeout(r, 300));

  // 当前还挂着（没被 .hide 收掉）的角标 key
  const live = () => p.evaluate(() =>
    [...document.querySelectorAll(".nb")].filter(el => !el.classList.contains("hide"))
      .map(el => el.dataset.nb).sort());
  const toPuz = async tab => {
    await p.evaluate(t => {
      document.querySelector('.tb-mode[data-mod="puz"]').click();
      setTimeout(() => {
        const dk = document.querySelector(".layout:not([style*='none']) .dock");
        dk.querySelectorAll(".dock-tab").forEach(b => { if (b.dataset.tab === t) b.click(); });
      }, 120);
    }, tab);
    await new Promise(r => setTimeout(r, 320));
  };

  console.log("\nNEW 角标 · 一次性提示：");

  const a0 = await live();
  check("A 开箱三个角标：歪斜 1 个 + 自定义 2 个",
        a0.join(",") === "custom,custom,skew", a0.join(","));

  // B 缺口那行点「自定义」 -> 两个 custom 一起消失（同一个 key），歪斜还在
  await toPuz("hole");
  await p.evaluate(() => document.querySelector('#puzShape .mode-btn[data-shape="custom"]').click());
  await new Promise(r => setTimeout(r, 250));
  const a1 = await live();
  check("B 点过缺口的「自定义」-> 两处 custom 角标一起消失，歪斜还在",
        a1.join(",") === "skew", a1.join(","));

  // C 动一下歪斜开关 -> skew 消失
  await p.evaluate(() => {
    document.querySelector('.tb-mode[data-mod="txt"]').click();
    setTimeout(() => {
      const c = document.getElementById("tcapTopSkew"); c.checked = true;
      c.dispatchEvent(new Event("change", { bubbles: true }));
    }, 120);
  });
  await new Promise(r => setTimeout(r, 320));
  const a2 = await live();
  check("C 动过歪斜开关 -> 角标消失（且没留下别的）", a2.length === 0, "剩 " + a2.length + " 个");

  // D 刷新后不该又冒出来
  await p.reload({ waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 300));
  const a3 = await live();
  const saved = await p.evaluate(() => { try { return localStorage.getItem("puzNewSeen"); } catch (e) { return null; } });
  check("D 刷新后照样不冒出来（记住点过了）", a3.length === 0, "剩 " + a3.length + " 个，存的是 " + saved);

  // E 角标不吃点击：点角标正中心，命中的应当是它提示的那个按钮
  await p.evaluate(() => { try { localStorage.removeItem("puzNewSeen"); } catch (e) {} });
  await p.reload({ waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 300));
  await toPuz("hole");
  const e1 = await p.evaluate(() => {
    const el = document.querySelector('#puzShape .nb[data-nb="custom"]');
    if (!el) return { 穿透: false, 命中: "(没找到角标)" };
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { 穿透: !!(hit && hit.closest('.mode-btn[data-shape="custom"]')),
             命中: hit ? (hit.className || hit.tagName) : "null" };
  });
  check("E 角标不吃点击（点下去穿到「自定义」按钮）", e1.穿透, "命中 " + e1.命中);

  // F ?new=1：全亮，用掉也不消失、不记账
  await p.goto("file:///D:/checkcode/captcha.html?new=1", { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 300));
  const f0 = await live();
  await toPuz("hole");
  await p.evaluate(() => document.querySelector('#puzShape .mode-btn[data-shape="custom"]').click());
  await new Promise(r => setTimeout(r, 250));
  const f1 = await live();
  const fSaved = await p.evaluate(() => { try { return localStorage.getItem("puzNewSeen"); } catch (e) { return null; } });
  check("F ?new=1 强制全亮，且用掉也不消失、不记账",
        f0.length === 3 && f1.length === 3 && fSaved === null,
        "开局 " + f0.length + " 个 / 用过 " + f1.length + " 个 / 存储 " + fSaved);

  check("G 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
