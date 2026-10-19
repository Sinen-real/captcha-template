// 校验文字验证码的「目标字变形歪斜」：
// A 默认开：都带角度、滑杆可用      B 关掉就立正置灰、再打开又转
// C 滑杆改上限，角度跟着变          D 开关只动角度、不动位置（一勾开关字不能乱跳）
// E 拖过的字关掉开关也归零          F 导出跟着变（转过角后墨迹外接框更大）
// —— 顶栏目标字那一支（跟图里散字完全独立）——
// H 默认不转  I 开顶栏只转顶栏、散字与排版都不动  J 开散字只转散字
// K 范围上限能拉到 180            L 顶栏的角度也进了导出
// N 还原之后两支开关都回默认，且滑杆的置灰 / 读数跟着对上
// M 无 JS 报错
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
    document.querySelector('.tb-mode[data-mod="txt"]').click();
    tcapChars = "花根月"; tcapExtra = ""; tcapHidden = "";
    document.getElementById("txtChars").value = "花根月";
    tcapRender();
  });
  await new Promise(r => setTimeout(r, 300));

  await p.evaluate(() => {
    const box = document.getElementById("tcapPhoto");
    box.setPointerCapture = () => {}; box.releasePointerCapture = () => {};
    window.__at = (dx, dy) => {                    // 照片内百分比 -> 屏幕坐标
      const r = box.getBoundingClientRect();
      return { x: r.left + r.width * dx / 100, y: r.top + r.height * dy / 100 };
    };
    window.__drag = (from, to) => {
      const a = window.__at(from[0], from[1]), z = window.__at(to[0], to[1]);
      const ch = document.querySelector("#tcapPhoto .tcap-ch") || box;
      const ev = (type, pt, tgt) => (tgt || box).dispatchEvent(new PointerEvent(type,
        { bubbles: true, pointerId: 1, clientX: pt.x, clientY: pt.y }));
      ev("pointerdown", a, ch);
      for (let i = 1; i <= 6; i++)
        ev("pointermove", { x: a.x + (z.x - a.x) * i / 6, y: a.y + (z.y - a.y) * i / 6 });
      ev("pointerup", z);
    };
    window.__degs = () => [...document.querySelectorAll("#tcapPhoto .tcap-ch")].map(el => {
      const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || "");
      return m ? parseFloat(m[1]) : 0;
    });
    window.__pos = () => [...document.querySelectorAll("#tcapPhoto .tcap-ch")]
      .map(el => el.style.left + "/" + el.style.top);
    // 重掷 n 次、把每次所有字的角度都收进来。
    // 单掷一次不够：±45 时三个字全落在 ±25 内的概率有 ~17%，拿它当证据会偶发假红
    window.__degSamples = n => {
      const out = [], d = document.getElementById("tcapSkewDeg");
      for (let i = 0; i < n; i++){
        d.dispatchEvent(new Event("input", { bubbles: true }));
        out.push.apply(out, window.__degs());
      }
      return out;
    };
    window.__topDegs = () => [...document.querySelectorAll("#tcapTargets .tt")].map(el => {
      const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || "");
      return m ? parseFloat(m[1]) : 0;
    });
    window.__topPos = () => [...document.querySelectorAll("#tcapTargets .tt")]
      .map(el => el.offsetLeft + "@" + el.offsetTop);      // 排版位置 = offsetXXX（不受 transform 影响）
    window.__setTop = (on, deg) => {
      const c = document.getElementById("tcapTopSkew");
      c.checked = on; c.dispatchEvent(new Event("change", { bubbles: true }));
      if (deg != null){
        const d = document.getElementById("tcapTopSkewDeg");
        d.value = deg; d.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    window.__setTopSampled = n => {                 // 重掷 n 次收样本（同散字那套，防概率性假红）
      const out = [], d = document.getElementById("tcapTopSkewDeg");
      for (let i = 0; i < n; i++){ d.dispatchEvent(new Event("input", { bubbles: true })); out.push.apply(out, window.__topDegs()); }
      return out;
    };
    // 导出图「头部」那一段的签名（顶栏字在这儿）
    window.__headSig = () => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const x = c.getContext("2d"); x.drawImage(im, 0, 0);
        const h = Math.round(im.height * 0.25);
        const d = x.getImageData(0, 0, im.width, h).data;
        let s = 0;
        for (let i = 0; i + 2 < d.length; i += 11) s = (s * 31 + d[i] + d[i+1] * 3) >>> 0;
        res(s);
      };
      im.src = window.__png;
    });
    window.__setSkew = (on, deg) => {
      const c = document.getElementById("tcapSkew");
      c.checked = on; c.dispatchEvent(new Event("change", { bubbles: true }));
      if (deg != null){
        const d = document.getElementById("tcapSkewDeg");
        d.value = deg; d.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    /* 照片底换成纯绿：这样「照片区」一定是一整片绿，凡是「不绿」的像素就是字的墨迹。
       不能拿默认的 #dcdcdc 当基准 —— 卡片头部是白的，跟灰底差得不多，
       一扫就把头部一起框进来（第一版就是这么错的：量出来正好等于整个扫描窗口）。 */
    window.__greenBg = () => new Promise(res => {
      const c = document.createElement("canvas"); c.width = 128; c.height = 128;
      const x = c.getContext("2d"); x.fillStyle = "#00c000"; x.fillRect(0, 0, 128, 128);
      tcapBg = c.toDataURL("image/png");
      tcapRender();
      setTimeout(res, 60);
    });
    window.__inkBox = () => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const x = c.getContext("2d"); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, im.width, im.height).data;
        const W = im.width, H = im.height;
        const isGreen = i => d[i] < 90 && d[i+1] > 170 && d[i+2] < 90;
        // 1) 先找照片那一段行（大部分像素是绿）
        let top = -1, bot = -1;
        for (let y = 0; y < H; y++){
          let g = 0;
          for (let xx = 0; xx < W; xx += 4) if (isGreen((y * W + xx) * 4)) g++;
          if (g > (W / 4) * 0.6){ if (top < 0) top = y; bot = y; }
        }
        if (top < 0) return res(null);
        // 2) 照片的左右边界也要找 —— 卡片两侧还有白边，不排掉的话白边会被当成墨迹，
        //    量出来的框就恒等于整张图（第一版就是这么错的）
        let left = -1, right = -1;
        for (let xx = 0; xx < W; xx++){
          let g = 0, tot = 0;
          for (let y = top; y <= bot; y += 4){ tot++; if (isGreen((y * W + xx) * 4)) g++; }
          if (g > tot * 0.6){ if (left < 0) left = xx; right = xx; }
        }
        if (left < 0) return res(null);
        // 3) 四边各往里缩 3px，避开照片边缘那圈抗锯齿（它也会被当成「不绿」）
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
        for (let y = top + 3; y <= bot - 3; y++) for (let xx = left + 3; xx <= right - 3; xx++){
          const i = (y * W + xx) * 4;
          if (!isGreen(i)){ n++; if (xx<x0)x0=xx; if (xx>x1)x1=xx; if (y<y0)y0=y; if (y>y1)y1=y; }
        }
        res(n ? { w: x1-x0+1, h: y1-y0+1, area: (x1-x0+1)*(y1-y0+1), n: n,
                  照片带: (bot - top + 1) } : null);
      };
      im.src = window.__png;
    });
  });

  console.log("\n文字验证码 · 目标字变形歪斜：");

  // A 图里散字默认开
  const a = await p.evaluate(() => ({
    on: document.getElementById("tcapSkew").checked,
    degs: window.__degs(),
    dis: document.getElementById("tcapSkewDeg").disabled,
    val: document.getElementById("tcapSkewVal").textContent }));
  // 重掷一批：光看「角度在 ±25 内」证明不了开关是开的 —— 关着的时候全是 0，也在范围内
  const aSamples = await p.evaluate(() => window.__degSamples(20));
  const aMax = Math.max.apply(null, aSamples.map(Math.abs));
  check("A 图里散字默认开着：三个字都带角度、范围 ±25、滑杆可用",
        a.on === true && a.dis === false && a.val === "±25°" &&
        a.degs.length > 0 && a.degs.every(d => Math.abs(d) <= 25) &&
        aSamples.every(d => Math.abs(d) <= 25) && aMax > 0,
        "勾选=" + a.on + "，滑杆 disabled=" + a.dis + "，标签「" + a.val + "」，角度 " +
        a.degs.join(",") + "（重掷 " + aSamples.length + " 个，最大 " + aMax + "°）");

  // D 先记位置（要在开关动作之前）
  const posBefore = await p.evaluate(() => window.__pos());

  // B 关得掉，也开得回来（默认上限 25）
  await p.evaluate(() => window.__setSkew(false));
  await new Promise(r => setTimeout(r, 120));
  const bOff = await p.evaluate(() => ({
    degs: window.__degs(),
    dis: document.getElementById("tcapSkewDeg").disabled,
    val: document.getElementById("tcapSkewVal").textContent }));
  await p.evaluate(() => window.__setSkew(true));
  await new Promise(r => setTimeout(r, 120));
  const bOn = await p.evaluate(() => window.__degSamples(6));
  const bMax = Math.max.apply(null, bOn.map(Math.abs));
  check("B 关掉就立正并置灰，再打开又转起来",
        bOff.degs.every(d => d === 0) && bOff.dis === true && bOff.val === "关" &&
        bOn.every(d => Math.abs(d) <= 25) && bMax > 0,
        "关：角度 " + bOff.degs.join(",") + "，滑杆 disabled=" + bOff.dis + "，标签「" + bOff.val +
        "」；开：重掷 " + bOn.length + " 个，最大 " + bMax + "°");

  // C 滑杆改上限
  await p.evaluate(() => window.__setSkew(true, 5));
  const c5 = await p.evaluate(() => window.__degSamples(8));
  await p.evaluate(() => window.__setSkew(true, 45));
  const c45 = await p.evaluate(() => window.__degSamples(25));
  const max5 = Math.max.apply(null, c5.map(Math.abs));
  const max45 = Math.max.apply(null, c45.map(Math.abs));
  check("C 角度上限跟着滑杆走",
        c5.every(d => Math.abs(d) <= 5) && c45.every(d => Math.abs(d) <= 45) && max45 > 25,
        "±5 抽 " + c5.length + " 个最大 " + max5 + "；±45 抽 " + c45.length + " 个最大 " + max45);

  // D 位置一动不动（这条最关键）
  const posAfter = await p.evaluate(() => window.__pos());
  check("D 开关只动角度，位置一个字都不挪",
        JSON.stringify(posBefore) === JSON.stringify(posAfter),
        posBefore.join(" ") + (JSON.stringify(posBefore) === JSON.stringify(posAfter) ? "" : "  →  " + posAfter.join(" ")));

  // E 拖过的字，关掉开关也得立正
  await p.evaluate(() => {
    const c = document.getElementById("tcapDrag"); c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const c0 = await p.evaluate(() => {
    const el = document.querySelector("#tcapPhoto .tcap-ch");
    const box = document.getElementById("tcapPhoto");
    const r = box.getBoundingClientRect(), q = el.getBoundingClientRect();
    return { cx: (q.left + q.width/2 - r.left)/r.width*100, cy: (q.top + q.height/2 - r.top)/r.height*100 };
  });
  await p.evaluate(c => window.__drag([c.cx, c.cy], [c.cx + 15, c.cy + 12]), c0);
  await new Promise(r => setTimeout(r, 120));
  const dragged = await p.evaluate(() => Object.keys(tcapPos).length);
  await p.evaluate(() => window.__setSkew(false));
  await new Promise(r => setTimeout(r, 120));
  const eDegs = await p.evaluate(() => window.__degs());
  const eRot = await p.evaluate(() => Object.keys(tcapPos).map(k => tcapPos[k].rot));
  check("E 拖过的字关掉开关也归零",
        dragged === 1 && eDegs.every(d => d === 0) && eRot.every(r => r === 0),
        "拖过 " + dragged + " 个字，关掉后角度 " + eDegs.join(",") + "，tcapPos.rot " + eRot.join(","));

  // F 导出跟着变：同一个版式，只差角度 —— 转过角的墨迹外接框更大
  await p.evaluate(() => { tcapPos = {}; tcapDragOn = false;
    const c = document.getElementById("tcapDrag"); c.checked = false; });
  await p.evaluate(() => window.__greenBg());       // 铺绿底 + 重排一次，位置就此定住
  await new Promise(r => setTimeout(r, 250));
  const posF = await p.evaluate(() => window.__pos());
  await p.evaluate(() => window.__setSkew(false));
  await new Promise(r => setTimeout(r, 150));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const offBox = await p.evaluate(() => window.__inkBox());
  await p.evaluate(() => window.__setSkew(true, 40));
  await new Promise(r => setTimeout(r, 150));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const onBox = await p.evaluate(() => window.__inkBox());
  const posF2 = await p.evaluate(() => window.__pos());
  check("F 导出跟着变（转过角后墨迹外接框更大）",
        offBox && onBox && onBox.area > offBox.area && JSON.stringify(posF) === JSON.stringify(posF2),
        offBox && onBox ? "关 " + offBox.w + "×" + offBox.h + "=" + offBox.area + "  →  开 " + onBox.w + "×" + onBox.h + "=" + onBox.area : "导出没读到图");

  // ---- 顶栏目标字那一支 ----
  await p.evaluate(() => { tcapPos = {}; tcapRender(); });     // 回到干净状态
  await new Promise(r => setTimeout(r, 200));
  const h0 = await p.evaluate(() => ({ degs: window.__topDegs(), pos: window.__topPos(),
                                       散字: window.__degs() }));
  check("H 顶栏默认不转，且和散字各有各的开关",
        h0.degs.length > 0 && h0.degs.every(d => d === 0),
        "顶栏 " + h0.degs.join(",") + "；散字标签「" +
        (await p.evaluate(() => tcapSkewVal.textContent)) + "」");

  // I 只开顶栏
  await p.evaluate(() => window.__setTop(true, 30));
  await new Promise(r => setTimeout(r, 200));
  const i1 = await p.evaluate(() => ({ top: window.__topDegs(), pos: window.__topPos(),
                                       散字: window.__degs() }));
  const iSamples = await p.evaluate(() => window.__setTopSampled(12));
  const iMax = Math.max.apply(null, iSamples.map(Math.abs));
  const 散字没动 = JSON.stringify(i1.散字) === JSON.stringify(h0.散字);
  const 排版没动 = JSON.stringify(i1.pos) === JSON.stringify(h0.pos);
  check("I 开顶栏：只有顶栏转（散字不动、排版也不动）",
        i1.top.some(d => d !== 0) && i1.top.every(d => Math.abs(d) <= 30) &&
        iSamples.every(d => Math.abs(d) <= 30) && iMax > 25 && 散字没动 && 排版没动,
        "顶栏 " + i1.top.join(",") + "（重掷 " + iSamples.length + " 个最大 " + iMax + "）；" +
        "散字 " + h0.散字.join(",") + " → " + i1.散字.join(",") + (散字没动 ? "（没动）" : "（动了！）") +
        "；排版 " + (排版没动 ? "没动" : "动了！" + h0.pos.join(" ") + " → " + i1.pos.join(" ")));

  // J 只开散字（顶栏关掉，验它不受影响）
  await p.evaluate(() => window.__setTop(false));
  await p.evaluate(() => window.__setSkew(true, 30));
  await new Promise(r => setTimeout(r, 200));
  const j1 = await p.evaluate(() => ({ top: window.__topDegs(), 散字: window.__degs() }));
  check("J 开散字：只有散字转，顶栏不受影响",
        j1.散字.some(d => d !== 0) && j1.top.every(d => d === 0),
        "散字 " + j1.散字.join(",") + "；顶栏 " + j1.top.join(","));

  // K 上限能到 180
  await p.evaluate(() => window.__setTop(true, 180));
  const kS = await p.evaluate(() => window.__setTopSampled(30));
  const kMax = Math.max.apply(null, kS.map(Math.abs));
  check("K 顶栏范围上限能拉到 180",
        kS.every(d => Math.abs(d) <= 180) && kMax > 90,
        "抽 " + kS.length + " 个，最大 " + kMax + "°（要能超过 90 才说明上限真的放开了）");
  await p.evaluate(() => window.__setTop(true, 30));
  await p.evaluate(() => window.__setSkew(false));
  await new Promise(r => setTimeout(r, 200));

  // L 顶栏的角度也进了导出
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const headOff = await p.evaluate(() => window.__headSig());
  await p.evaluate(() => window.__setTop(true, 60));
  await new Promise(r => setTimeout(r, 200));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 900));
  const headOn = await p.evaluate(() => window.__headSig());
  check("L 顶栏的角度进了导出", !!headOff && !!headOn && headOff !== headOn,
        "头部签名 " + headOff + " → " + headOn);

  // N 「还原」之后两支开关都回默认，且滑杆的置灰 / 读数跟着对上。
  //   还原那段原先是手写 .checked 同步的，滑杆的 disabled 和读数没人管 ——
  //   还原完会留下「勾没了、滑杆却还能拖、读数还写着 ±25°」这种自相矛盾的控件。
  await p.evaluate(() => {
    ["tcapSkew", "tcapTopSkew"].forEach(id => {
      const c = document.getElementById(id);
      c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
    });
    document.getElementById("topReset").click();
  });
  await new Promise(r => setTimeout(r, 200));
  await p.click("#confirmOk");
  await new Promise(r => setTimeout(r, 350));
  const nShot = await p.evaluate(() => ({
    散字勾: document.getElementById("tcapSkew").checked,
    散字灰: document.getElementById("tcapSkewDeg").disabled,
    散字读数: document.getElementById("tcapSkewVal").textContent,
    顶栏勾: document.getElementById("tcapTopSkew").checked,
    顶栏灰: document.getElementById("tcapTopSkewDeg").disabled,
    顶栏读数: document.getElementById("tcapTopSkewVal").textContent,
    散字角度: window.__degs(),
    顶栏角度: window.__topDegs() }));
  check("N 还原之后：散字回默认开、顶栏回关，两支滑杆的置灰与读数都对得上",
        nShot.散字勾 === true && nShot.散字灰 === false && nShot.散字读数 === "±25°" &&
        nShot.顶栏勾 === false && nShot.顶栏灰 === true && nShot.顶栏读数 === "关" &&
        nShot.散字角度.length > 0 && nShot.散字角度.every(d => Math.abs(d) <= 25) &&
        nShot.散字角度.some(d => d !== 0) && nShot.顶栏角度.every(d => d === 0),
        "散字 勾=" + nShot.散字勾 + " 灰=" + nShot.散字灰 + " 读数「" + nShot.散字读数 +
        "」角度 " + nShot.散字角度.join(",") + "；顶栏 勾=" + nShot.顶栏勾 + " 灰=" + nShot.顶栏灰 +
        " 读数「" + nShot.顶栏读数 + "」角度 " + nShot.顶栏角度.join(","));

  check("M 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
