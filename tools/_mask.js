// 校验自定义形状的「掩版 -> 轮廓」算法层。这一层 UI 测不出来（形状画出来像不像、
// 顶点有没有封顶、绕向对不对），所以单开一个套件直接调函数。
// A 透明底 + 彩色形状：抠得出来，宽高比对（形状本身不是黑的也要能抠）
// B 轮廓外接框恰好填满 [0,1]²（四条边都触到）
// C 圆形掩版的轮廓是圆的（各顶点到中心距离的离散度 < 5%）
// D 白底 + 灰形状（不透明）：靠估背景色 + L1 距离也能抠出来
// E 阈值越高前景越少（单调不增）
// F 同一个阈值连取三次只构建一次（缓存），换图后缓存失效
// G 抠失败（全透明 / 全不透明）返回 null 而不是抛错
// H 顶点封顶：再复杂的形状也不超过 256 个顶点
// I 绕向：外轮廓与洞方向相反，且每条环都闭合
// J 打包结构自洽：polys 长度 = 2 × lens 之和
// K 无 JS 报错
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
  await p.evaluate(() => {
    window.alert = () => {};
    // 造各种形状图：256×256 画布，形状只占中间一块（顺便验「裁掉四周空白」）
    window.__img = kind => new Promise(res => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const x = c.getContext("2d");
      if (kind === "trap"){                       // 透明底 + 品红梯形，128×64 = 2:1
        x.fillStyle = "#ff00ff";
        x.beginPath(); x.moveTo(76, 96); x.lineTo(180, 96); x.lineTo(192, 160); x.lineTo(64, 160);
        x.closePath(); x.fill();
      } else if (kind === "circle"){              // 透明底 + 黑圆，直径 160
        x.fillStyle = "#123456";
        x.beginPath(); x.arc(128, 128, 80, 0, Math.PI * 2); x.fill();
      } else if (kind === "grey"){                // 白底 + #999 方框（不透明）
        x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 256);
        x.fillStyle = "#999999"; x.fillRect(80, 100, 96, 56);
      } else if (kind === "donut"){               // 透明底 + 带洞的环（验多轮廓绕向）
        x.fillStyle = "#ff0000";
        x.beginPath(); x.arc(128, 128, 90, 0, Math.PI * 2);
        x.arc(128, 128, 40, 0, Math.PI * 2, true); x.fill();
      } else if (kind === "empty"){               // 全透明
      } else if (kind === "full"){                // 全不透明纯白
        x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 256);
      }
      puzMaskLoad(c.toDataURL("image/png"), ok => res(ok));
    });
    window.__at = thr => puzMaskAt(thr);
    window.__gridCount = thr => {
      const g = puzMaskGrid(puzMask.hole.raw, thr);
      let n = 0; for (let i = 0; i < g.length; i++) n += g[i];
      return n;
    };
  });

  console.log("\n自定义形状 · 掩版转轮廓：");

  // A 透明底 + 彩色形状
  const okTrap = await p.evaluate(() => window.__img("trap"));
  const trap = await p.evaluate(() => {
    const m = puzMaskAt(30);
    return m ? { bw: m.bw, bh: m.bh, verts: m.verts, loops: m.lens.length } : null;
  });
  check("A 透明底 + 品红梯形：抠得出来，宽高比 ≈ 2:1",
        okTrap === true && trap && Math.abs(trap.bw / trap.bh - 2) < 0.1 && trap.verts >= 4,
        trap ? "裁剪后 " + trap.bw + "×" + trap.bh + "（比 " + (trap.bw / trap.bh).toFixed(3) +
               "），顶点 " + trap.verts + "，轮廓 " + trap.loops + " 条" : "抠失败了");

  // B 外接框恰好填满 [0,1]²
  const box = await p.evaluate(() => {
    const m = puzMaskAt(30);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < m.polys.length; i += 2){
      const u = m.polys[i], v = m.polys[i + 1];
      if (u < x0) x0 = u; if (u > x1) x1 = u;
      if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  });
  check("B 轮廓外接框恰好填满 [0,1]²",
        Math.abs(box.x0) < 1e-6 && Math.abs(box.y0) < 1e-6 &&
        Math.abs(box.x1 - 1) < 1e-6 && Math.abs(box.y1 - 1) < 1e-6,
        "x " + box.x0.toFixed(6) + "~" + box.x1.toFixed(6) + "  y " + box.y0.toFixed(6) + "~" + box.y1.toFixed(6));

  // C 圆形掩版的轮廓要圆
  await p.evaluate(() => window.__img("circle"));
  const circ = await p.evaluate(() => {
    const m = puzMaskAt(30);
    if (!m) return null;
    const ds = [];
    for (let i = 0; i < m.polys.length; i += 2){
      const u = m.polys[i] - 0.5, v = m.polys[i + 1] - 0.5;
      ds.push(Math.sqrt(u * u + v * v));
    }
    const mean = ds.reduce((a, x) => a + x, 0) / ds.length;
    const sd = Math.sqrt(ds.reduce((a, x) => a + (x - mean) * (x - mean), 0) / ds.length);
    return { 离散度: sd / mean, verts: ds.length, 比例: m.bw / m.bh };
  });
  // 注意「离散度」这个判据本身有个盲区：顶点被简化成 2 个时（比如首尾同点那条 DP bug），
  // 离散度反而是 0.00% —— 所以这里必须同时要求顶点数够多。
  check("C 圆形掩版的轮廓是圆的（半径离散度 < 5%，且顶点数够多）",
        circ && circ.离散度 < 0.05 && circ.verts >= 12 && Math.abs(circ.比例 - 1) < 0.1,
        circ ? "离散度 " + (circ.离散度 * 100).toFixed(2) + "%，顶点 " + circ.verts +
               "，裁剪比例 " + circ.比例.toFixed(3) : "抠失败了");

  // D 白底 + 灰形状（不透明）
  await p.evaluate(() => window.__img("grey"));
  const grey = await p.evaluate(() => {
    const raw = puzMask.hole.raw, m = puzMaskAt(30);
    return { hasAlpha: raw.hasAlpha, bg: raw.bg, m: m ? { bw: m.bw, bh: m.bh } : null };
  });
  check("D 白底 + #999 形状（不透明）：估背景色 + L1 抠得出来",
        grey.hasAlpha === false && grey.bg.join() === "255,255,255" && grey.m &&
        Math.abs(grey.m.bw / grey.m.bh - 96 / 56) < 0.15,
        "hasAlpha=" + grey.hasAlpha + "，估到的背景 rgb(" + grey.bg.join(",") + ")，裁剪后 " +
        (grey.m ? grey.m.bw + "×" + grey.m.bh + "（要接近 96×56）" : "抠失败"));

  // E 阈值越高前景越少
  const mono = await p.evaluate(() => {
    const ns = [];
    for (let t = 0; t <= 100; t += 10) ns.push(window.__gridCount(t));
    return ns;
  });
  const 单调 = mono.every((v, i) => i === 0 || v <= mono[i - 1]);
  check("E 阈值越高前景像素越少（单调不增）", 单调,
        "0→100 每 10 一档：" + mono.join(" "));

  // F 缓存：同阈值连取三次只建一次；换图后缓存失效
  const cache = await p.evaluate(() => {
    puzMask.hole.cache.clear();
    const orig = puzMaskBuild;
    let n = 0;
    puzMaskBuild = function(){ n++; return orig.apply(null, arguments); };
    puzMaskAt(50); puzMaskAt(50); puzMaskAt(50);
    const 同阈值 = n;
    puzMaskAt(51);                       // 换个档位应该再建一次
    const 换档 = n;
    puzMaskBuild = orig;
    puzMaskReset();                      // 换图 = 缓存清空
    const 换图后 = puzMask.hole.cache.size;
    return { 同阈值: 同阈值, 换档: 换档, 换图后: 换图后 };
  });
  check("F 同阈值连取三次只构建一次；换档位才再建；换图清空缓存",
        cache.同阈值 === 1 && cache.换档 === 2 && cache.换图后 === 0,
        "同阈值三次构建 " + cache.同阈值 + " 次（应为 1），换档位累计 " + cache.换档 +
        " 次（应为 2），还原后缓存 " + cache.换图后 + " 条（应为 0）");

  // G 抠失败要返回 null，不能抛
  const g1 = await p.evaluate(async () => {
    const ok = await window.__img("empty");
    return { ok: ok, m: puzMaskAt(30) };
  });
  const g2 = await p.evaluate(async () => {
    const ok = await window.__img("full");
    return { ok: ok, m: puzMaskAt(30) };
  });
  check("G 全透明 / 全不透明都判失败并返回 null（不抛）",
        g1.ok === true && g1.m === null && g2.ok === true && g2.m === null,
        "全透明 -> " + g1.m + "；全不透明 -> " + g2.m);

  // H/I/J 拿带洞的环验：顶点封顶、绕向、打包结构
  await p.evaluate(() => window.__img("donut"));
  const donut = await p.evaluate(() => {
    const m = puzMaskAt(30);
    if (!m) return null;
    const area = pts => {
      let a = 0;
      for (let i = 0, n = pts.length; i < n; i++){
        const q = pts[(i + 1) % n];
        a += pts[i][0] * q[1] - q[0] * pts[i][1];
      }
      return a / 2;
    };
    const loops = [];
    let at = 0;
    for (let i = 0; i < m.lens.length; i++){
      const n = m.lens[i], pts = [];
      for (let k = 0; k < n; k++){ pts.push([m.polys[at], m.polys[at + 1]]); at += 2; }
      loops.push({ n: n, area: area(pts) });
    }
    return { 顶点: m.verts, 环: loops, polysLen: m.polys.length,
             lensSum: m.lens.reduce((a, x) => a + x, 0) };
  });
  const 有洞 = donut && donut.环.length >= 2;
  const 外正内负 = 有洞 && donut.环.some(l => l.area > 0) && donut.环.some(l => l.area < 0);
  check("H 顶点封顶不超 256", donut && donut.顶点 <= 256, donut ? "顶点 " + donut.顶点 : "抠失败");
  check("I 带洞的形状抠出两条环，且绕向相反（nonzero 下洞才是洞）",
        有洞 && 外正内负,
        donut ? donut.环.map(l => l.n + " 点/面积 " + l.area.toFixed(4)).join("，") : "抠失败");
  check("J 打包结构自洽：polys 长度 = 2 × lens 之和",
        donut && donut.polysLen === donut.lensSum * 2,
        donut ? "polys " + donut.polysLen + " = 2 × " + donut.lensSum : "抠失败");

  check("K 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
