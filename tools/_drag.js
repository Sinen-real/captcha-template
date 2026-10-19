// 校验文字验证码的「手动拖动文字」：
// A 没开开关时拖不动        B 开了能拖，位置记进 tcapPos
// C 拖出照片会被夹住        D 位置在重排（换字效/改字号）后仍然保持
// E 导出跟着变（导出读的就是 el.style.left/top）
// F 真拖动过的那次不会误触发「点选」
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
  await p.setViewport({ width: 1180, height: 900, deviceScaleFactor: 1 });
  await p.goto("file:///D:/checkcode/captcha.html", { waitUntil: "networkidle0" });
  await p.evaluate(() => {
    window.alert = () => {};
    window.xhs = { miniTool: { writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
                               saveImageToPhotosAlbum: () => Promise.resolve({}) } };
    document.querySelector('.tb-mode[data-mod="txt"]').click();
    // 只留一个字，导出后墨迹质心就是它的位置
    tcapChars = "花"; document.getElementById("txtChars").value = "花";
    tcapExtra = ""; tcapHidden = ""; tcapRender();
  });
  await new Promise(r => setTimeout(r, 300));

  // 合指针事件（setPointerCapture 对假 pointerId 会抛，先换掉）
  await p.evaluate(() => {
    const box = document.getElementById("tcapPhoto");
    box.setPointerCapture = () => {}; box.releasePointerCapture = () => {};
    window.__at = (dx, dy) => {                    // 照片内百分比 -> 屏幕坐标
      const r = box.getBoundingClientRect();
      return { x: r.left + r.width * dx / 100, y: r.top + r.height * dy / 100 };
    };
    window.__drag = (from, to) => {
      const a = window.__at(from[0], from[1]), z = window.__at(to[0], to[1]);
      // pointerdown 要落在字块上（真实操作就是这样），move/up 落在照片上（指针已被 capture）
      const ch = document.querySelector("#tcapPhoto .tcap-ch") || box;
      const ev = (type, pt, tgt) => (tgt || box).dispatchEvent(new PointerEvent(type,
        { bubbles: true, pointerId: 1, clientX: pt.x, clientY: pt.y }));
      ev("pointerdown", a, ch);
      for (let i = 1; i <= 6; i++)
        ev("pointermove", { x: a.x + (z.x - a.x) * i / 6, y: a.y + (z.y - a.y) * i / 6 });
      ev("pointerup", z);
    };
    window.__pos = () => {
      const el = document.querySelector("#tcapPhoto .tcap-ch"); if (!el) return null;
      return { l: parseFloat(el.style.left), t: parseFloat(el.style.top) };
    };
    window.__center = () => {                       // 字块中心（占照片的百分比）
      const el = document.querySelector("#tcapPhoto .tcap-ch");
      const box = document.getElementById("tcapPhoto");
      const r = box.getBoundingClientRect(), q = el.getBoundingClientRect();
      return { cx: (q.left + q.width / 2 - r.left) / r.width * 100,
               cy: (q.top + q.height / 2 - r.top) / r.height * 100 };
    };
  });

  console.log("\n文字验证码 · 手动拖动文字：");

  // A 没开开关
  const p0 = await p.evaluate(() => window.__pos());
  await p.evaluate(() => window.__drag([50, 50], [70, 70]));
  const p1 = await p.evaluate(() => window.__pos());
  check("A 没开开关时拖不动", p0.l === p1.l && p0.t === p1.t,
        p0.l + "/" + p0.t + " → " + p1.l + "/" + p1.t);

  // B 开了能拖
  await p.evaluate(() => {
    const c = document.getElementById("tcapDrag"); c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const before = await p.evaluate(() => window.__center());
  await p.evaluate(c => window.__drag([c.cx, c.cy], [c.cx + 18, c.cy + 14]), before);
  const after = await p.evaluate(() => window.__center());
  const saved = await p.evaluate(() => Object.keys(tcapPos).length);
  check("B 开了能拖，位置记进 tcapPos",
        Math.abs(after.cx - before.cx - 18) < 2.5 && Math.abs(after.cy - before.cy - 14) < 2.5 && saved === 1,
        "中心 " + before.cx.toFixed(1) + "/" + before.cy.toFixed(1) +
        " → " + after.cx.toFixed(1) + "/" + after.cy.toFixed(1) + "，记下 " + saved + " 个字");

  // C 夹在照片内
  await p.evaluate(c => window.__drag([c.cx, c.cy], [c.cx + 200, c.cy + 200]), after);
  const edge = await p.evaluate(() => {
    const el = document.querySelector("#tcapPhoto .tcap-ch");
    const box = document.getElementById("tcapPhoto");
    const r = box.getBoundingClientRect(), q = el.getBoundingClientRect();
    return { 右: Math.round(r.right - q.right), 下: Math.round(r.bottom - q.bottom),
             左: Math.round(q.left - r.left), 上: Math.round(q.top - r.top) };
  });
  check("C 拖出照片会被夹住", edge.右 >= -1 && edge.下 >= -1, JSON.stringify(edge));

  // D 重排后仍保持
  const keep = await p.evaluate(() => window.__pos());
  await p.evaluate(() => { tcapRender(); });                      // 模拟换字效/改字号触发的重排
  const keep2 = await p.evaluate(() => window.__pos());
  check("D 重排后手动位置不丢", keep.l === keep2.l && keep.t === keep2.t,
        keep.l + "/" + keep.t + " → " + keep2.l + "/" + keep2.t);

  // E 导出跟着变：把字拖到 (62%,66%) 附近，导出后墨迹质心也该在那儿
  await p.evaluate(() => { tcapPos = {}; tcapRender(); });
  await new Promise(r => setTimeout(r, 150));
  const c0 = await p.evaluate(() => window.__center());
  await p.evaluate(c => window.__drag([c.cx, c.cy], [62 + 3, 66 + 2]), c0);   // 目标：中心落在 65%/68%
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const ink = await p.evaluate(() => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0);
      // 照片区：卡片顶栏之下、底栏之上；照片是纯灰底 #dcdcdc，字是彩色的
      const d = x.getImageData(0, 0, im.width, im.height).data;
      let sx = 0, sy = 0, n = 0;
      const top = Math.round(im.height * 0.28), bot = Math.round(im.height * 0.86);
      for (let y = top; y < bot; y++) for (let xx = 0; xx < im.width; xx++){
        const i = (y * im.width + xx) * 4;
        const r = d[i], g = d[i+1], b2 = d[i+2];
        const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
        if (mx - mn > 40 && mx > 90){ sx += xx; sy += y; n++; }   // 有彩色的就是字
      }
      res(n ? { x: sx / n, y: sy / n, n: n, w: im.width, h: im.height } : null);
    };
    im.src = window.__png;
  }));
  // 导出画布横向：左右各留 pad=10 的粗白边（2 倍图即各 20），照片就在两者之间
  const pctX = ink ? (ink.x - 20) / (ink.w - 40) * 100 : 0;
  check("E 导出跟着变（字落在拖到的位置）", ink && Math.abs(pctX - 65) < 6,
        ink ? "导出墨迹质心 x≈" + pctX.toFixed(1) + "%（拖到 65%），采样 " + ink.n + " px" : "导出没读到图");

  // F 拖动过不会误触发点选
  const ord = await p.evaluate(() => document.querySelectorAll("#tcapPhoto .tcap-ch .ord").length);
  check("F 拖动过不误触发点选", ord === 0, "序号角标 " + ord + " 个");

  check("G 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
