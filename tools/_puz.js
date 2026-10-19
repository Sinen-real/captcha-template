// 校验拼图验证码：
// A 预览 canvas 与导出 PNG 逐像素一致（同一个绘制函数）
// B/C 滑块能挪动拼图块与缺口；D 拼图块与缺口始终同高
// E/F 预览里拖动滑块 / 直接拖拼图块都能挪动拼图块
// G 「随机位置」落在预期范围内
// I 拼图块取的确实是缺口那一块的画面
// J 照片高度撑高卡片而宽度不变；K/L 图标能删、能换成上传图、能还原；M 边缘的凹感与柔光
// N 另传拼图块图；O 覆盖/描边/发光可调、颜色可选；P 预览里直接拖缺口；Q 缺口的颜色/深度/描边/边缘渐变
// T 自定义形状：2:1 轮廓传到像素上、按侧解析、不同形盖不住、阈值、清除与还原
// T6 拼图块自己传一张（跟缺口不同）：两侧各用各的图，互不影响
// 素材用纯灰底：拼图块只靠边缘柔光发亮、缺口压暗，按亮度求质心即可定位。
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
  await p.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 1 });
  await p.goto("file:///D:/checkcode/captcha.html", { waitUntil: "networkidle0" });
  await p.evaluate(() => { window.alert = () => {};
    window.xhs = { miniTool: { writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
                               saveImageToPhotosAlbum: () => Promise.resolve({}) } }; });

  // 纯灰底（#808080）：拼图块提亮后 >190，缺口压暗后 <70，背景正好在中间
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 704;
    const x = c.getContext("2d");
    x.fillStyle = "#808080"; x.fillRect(0, 0, 1280, 704);
    window.__testImg = c.toDataURL("image/png");
  });

  // 工具：切到拼图面板、装素材、导出并分析
  await p.evaluate(() => {
    document.querySelector('.tb-mode[data-mod="puz"]').click();
    window.__load = () => new Promise(res => {
      const im = new Image();
      im.onload = () => { puzImg = im; puzRender(); res(); };
      im.src = window.__testImg;
    });
    // 导出画布（与预览同源），量它而不是量预览：导出才是产物
    window.__grab = () => {
      const cv = puzCanvasAt(2), w = cv.width, h = cv.height;
      // 只量照片区：卡片的白底会把「亮块」的质心带跑
      const L = puzLayout();
      const y0 = Math.round(L.photoTop * 2), y1 = Math.round((L.photoTop + puzSt.photoH) * 2);
      const d = cv.getContext("2d").getImageData(0, y0, w, y1 - y0).data;
      const rows = y1 - y0;
      let bx = 0, by = 0, bn = 0, dx = 0, dy = 0, dn = 0;
      for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++){
        const i = (y * w + x) * 4, v = (d[i] + d[i+1] + d[i+2]) / 3;
        if (v > 190){ bx += x; by += y; bn++; }       // 拼图块（提亮）
        if (v < 70){ dx += x; dy += y; dn++; }        // 缺口（压暗）
      }
      // 顶边：拼图块的描边最亮、缺口顶部的内阴影最暗；两者应当同一行
      let pTop = -1, hTop = -1;
      // 左右各让开 12px：照片是圆角裁的，四角的留白是卡片的白底，会被当成亮块
      for (let y = 0; y < rows && (pTop < 0 || hTop < 0); y++) for (let x = 12; x < w - 12; x++){
        const j = (y * w + x) * 4;
        if (pTop < 0 && d[j] > 232 && d[j+1] > 232 && d[j+2] > 232) pTop = y;
        if (hTop < 0 && d[j] < 70 && d[j+1] < 70 && d[j+2] < 70) hTop = y;
      }
      // 质心换算回 1 倍逻辑坐标（y 要加回照片顶）
      return { w: w, h: h, pTop: y0 / 2 + pTop / 2, hTop: y0 / 2 + hTop / 2,
               piece: bn ? { x: bx / bn / 2, y: y0 / 2 + by / bn / 2 } : null,
               hole: dn ? { x: dx / dn / 2, y: y0 / 2 + dy / dn / 2 } : null };
    };
    // 合成指针事件（setPointerCapture 对假 pointerId 会抛，先换掉）
    window.__drag = (from, to) => {
      const cv = document.getElementById("puzCanvas");
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
      const r = cv.getBoundingClientRect(), k = PUZ.W / r.width;
      const cx = r.left + from.x / k, cy = r.top + from.y / k;
      const opts = pid => ({ bubbles: true, pointerId: pid, clientX: cx, clientY: cy });
      cv.dispatchEvent(new PointerEvent("pointerdown", opts(1)));
      for (let i = 1; i <= 6; i++){
        const mx = from.x + (to.x - from.x) * i / 6, my = from.y + (to.y - from.y) * i / 6;
        cv.dispatchEvent(new PointerEvent("pointermove",
          { bubbles: true, pointerId: 1, clientX: r.left + mx / k, clientY: r.top + my / k }));
      }
      cv.dispatchEvent(new PointerEvent("pointerup", opts(1)));
    };
  });
  await p.evaluate(() => window.__load());

  console.log("\n拼图验证码：");
  const snap = () => p.evaluate(() => window.__grab());
  await p.evaluate(() => {
    // 走真实滑杆事件 —— 它内部是 rAF 合并的，所以等两帧再回，别只改状态绕过那条路
    window.__setThr = v => new Promise(res => {
      const e = document.getElementById("puzMaskThr");
      e.value = v; e.dispatchEvent(new Event("input", { bubbles: true }));
      requestAnimationFrame(() => requestAnimationFrame(res));
    });
  });
  const setSlider = (id, v) => p.evaluate((id, v) => {
    const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, id, v);
  // 位置条（缺口左右/上下、拼图块位置）都精简掉了，改由预览里拖：
  // 测试直接写状态再重画
  const setHoleX = v => p.evaluate(v => { puzSt.holeX = v; puzSync(); }, v);
  const setHoleY = v => p.evaluate(v => { puzSt.holeY = v; puzSync(); }, v);
  const setPieceX = v => p.evaluate(v => { puzSt.pieceX = v; puzSync(); }, v);

  // A 预览与导出走同一个绘制函数：同一倍率下逐像素一致
  //（预览的倍率跟着屏幕像素走，导出固定 2 倍，所以按预览当前的倍率比）
  const parity = await p.evaluate(() => {
    const cv = document.getElementById("puzCanvas");
    const c = puzCanvasAt(cv.width / PUZ.W);
    return { same: cv.toDataURL("image/png") === c.toDataURL("image/png"),
             size: [cv.width, cv.height], scale: cv.width / PUZ.W };
  });
  check("A 预览与导出同源同像素", parity.same, parity.size.join("×") + "（倍率 " + parity.scale.toFixed(2) + "）");

  // A2 预览位图要跟屏幕像素对上，别让浏览器再缩一次（缩了字会变细）
  const sharp = await p.evaluate(() => {
    const cv = document.getElementById("puzCanvas");
    return { bitmap: cv.width, screen: Math.round(cv.clientWidth * (window.devicePixelRatio || 1)) };
  });
  check("A2 预览位图与屏幕像素 1:1", Math.abs(sharp.bitmap - sharp.screen) <= 2,
        sharp.bitmap + " vs " + sharp.screen);

  // B 位置相关的滑块已经精简掉（位置改由预览里拖，见 E/F/P）
  const gone = await p.evaluate(() => ["puzHoleX", "puzHoleY", "puzPieceX"]
    .map(id => id + (document.getElementById(id) ? ":还在" : ":已精简")).join(" "));
  check("B 位置滑块已精简（改由预览拖拽）", gone.indexOf("还在") < 0, gone);

  // B2 位置状态仍然左右挪得动拼图块
  const s0 = await snap();
  await setPieceX(100);
  const s1 = await snap();
  check("B2 拼图块位置还挪得动，且只动水平", s1.piece && s0.piece &&
        s1.piece.x - s0.piece.x > 150 && Math.abs(s1.piece.y - s0.piece.y) < 1.5,
        Math.round(s0.piece.x) + " → " + Math.round(s1.piece.x) + " (1x)");

  // C 缺口位置（同上：直接写状态。先把拼图块挪回左边，它画在缺口之后会盖住缺口）
  await setPieceX(0);
  const before = (await snap()).hole;
  await setHoleX(100);
  const after = (await snap()).hole;
  check("C 缺口位置挪得动", after.x - before.x > 100,
        Math.round(before.x) + " → " + Math.round(after.x) + " (1x)");

  // D 上下移动时拼图块与缺口同高（这正是要拖到齐的那条线）
  await setPieceX(5);
  await setHoleX(70);
  await setHoleY(0);
  const top = await snap();
  await setHoleY(100);
  const bot = await snap();
  check("D 拼图块与缺口始终同高（比顶边，不比质心 —— 柔光会带偏质心）",
        Math.abs(top.pTop - top.hTop) <= 1 && Math.abs(bot.pTop - bot.hTop) <= 1,
        "上 " + top.hTop.toFixed(1) + "/" + top.pTop.toFixed(1) +
        "  下 " + bot.hTop.toFixed(1) + "/" + bot.pTop.toFixed(1));

  // E 拖滑块 → 拼图块跟着走
  await setPieceX(13);
  await setHoleX(65);
  await setHoleY(45);
  const e0 = await snap();
  await p.evaluate(() => {
    const g = puzGeom(), trackW = PUZ.W - PUZ.TRACK_X * 2;
    const hx = Math.max(PUZ.TRACK_X, Math.min(PUZ.TRACK_X + trackW - PUZ.HANDLE_W, g.px + g.S / 2 - PUZ.HANDLE_W / 2));
    window.__drag({ x: hx + PUZ.HANDLE_W / 2, y: g.L.trackCy }, { x: hx + PUZ.HANDLE_W / 2 + 60, y: g.L.trackCy });
  });
  const e1 = await snap();
  check("E 拖滑块带动拼图块", e1.piece.x - e0.piece.x > 40 && e1.piece.x - e0.piece.x < 80,
        "+" + Math.round(e1.piece.x - e0.piece.x) + " (拖了 +60)");
  check("E2 拖滑块不动缺口", Math.abs(e1.hole.x - e0.hole.x) < 1.5);

  // F 直接拖拼图块
  const f0 = await snap();
  await p.evaluate(() => {
    const g = puzGeom();
    window.__drag({ x: g.px + g.S / 2, y: g.py + g.S / 2 }, { x: g.px + g.S / 2 - 55, y: g.py + g.S / 2 });
  });
  const f1 = await snap();
  check("F 直接拖拼图块", f0.piece.x - f1.piece.x > 40 && f0.piece.x - f1.piece.x < 70,
        Math.round(f1.piece.x - f0.piece.x) + " (拖了 -55)");

  // G 随机位置
  const rnd = [];
  for (let i = 0; i < 12; i++){
    await p.evaluate(() => document.getElementById("puzRand").click());
    rnd.push(await p.evaluate(() => ({
      x: Math.round(puzSt.holeX),
      y: Math.round(puzSt.holeY) })));
  }
  check("G 随机位置在范围内",
        rnd.every(r => r.x >= 28 && r.x <= 88 && r.y >= 0 && r.y <= 100) &&
        new Set(rnd.map(r => r.x)).size > 1,
        rnd.slice(0, 4).map(r => r.x + "/" + r.y).join("  "));

  // I 拼图块取的必须是缺口那一块的画面（用户最在意的一条）：
  //   只在缺口位置涂一块纯红，别处留灰底 —— 拼图块上就该出现那块红，
  //   取错位置（比如漏了照片顶的偏移）时那里会是灰的。
  await setPieceX(0);
  await setHoleX(100);      // 缺口放最右：拼图块不压住它，两边能分别取样
  await setHoleY(0);
  const probe = await p.evaluate(() => {
    const g = puzGeom(), P = PUZ;
    const k = 4;                                  // 测试图 1280×704，正好是逻辑尺寸的 4 倍
    const c = document.createElement("canvas");
    c.width = P.W * k; c.height = puzSt.photoH * k;
    const x = c.getContext("2d");
    x.fillStyle = "#808080"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#ff0000";
    x.fillRect(g.hx * k, (g.hy - g.L.photoTop - g.tab) * k, g.S * k, (g.S + g.tab) * k);
    window.__testImg = c.toDataURL("image/png");
    return { px: g.px + g.S / 2 - g.tab, py: g.py + g.S / 2, hx: g.hx + g.S / 2, hy: g.hy + g.S / 2 };
  });
  await p.evaluate(() => window.__load());
  const seen = await p.evaluate(probe => {
    const cv = puzCanvasAt(2), x = cv.getContext("2d");
    const at = (a, b) => { const d = x.getImageData(Math.round(a * 2), Math.round(b * 2), 1, 1).data;
                           return [d[0], d[1], d[2]]; };
    const L = puzLayout();
    return { piece: at(probe.px, probe.py), hole: at(probe.hx, probe.hy),
             far: at(160, L.photoTop + 150) };     // 照片里离两块都远的背景
  }, probe);
  // 背景 128 = 灰；压暗 0.45 → 58；提亮 0.45*红 + 0.55*255 → (255,140,140)
  const same = seen.piece[0] > 250 && seen.piece[1] < 12 && seen.piece[2] < 12;   // 原样，不是提亮后的红
  const darkRed = seen.hole[0] > 128 && seen.hole[0] < 152 && seen.hole[1] < 25 && seen.hole[2] < 25;
  const grey = seen.far.every(v => Math.abs(v - 128) < 6);
  check("I 拼图块取的是缺口那块画面（原样，不覆盖）", same && darkRed && grey,
        "块 " + seen.piece.join(",") + " / 缺口 " + seen.hole.join(",") + " / 别处 " + seen.far.join(","));

  // J 照片高度：宽度锁死 320，高度自己拉，整张卡片跟着长
  await setPieceX(13);
  const h0 = await p.evaluate(() => puzLayout().H);
  await setSlider("puzPhotoH", 280);
  const h1 = await p.evaluate(() => ({ h: puzLayout().H, cv: puzCanvasAt(2).height, w: puzCanvasAt(2).width }));
  await setSlider("puzPhotoH", 176);
  const h2 = await p.evaluate(() => puzLayout().H);
  check("J 照片高度撑高卡片（宽度不变）",
        Math.abs(h1.h - h0 - 104) < 2 && h1.cv === h1.h * 2 && h1.w === 640 && Math.abs(h2 - h0) < 2,
        h0 + " → " + h1.h + " → " + h2 + "，宽 " + h1.w);

  // K/L 图标：默认画出来、删掉就不画、换成上传图就画那张图
  const inkAt = i => p.evaluate(i => {
    const cv = puzCanvasAt(2), x = cv.getContext("2d"), L = puzLayout(), sz = puzIcons[i].size;
    const d = x.getImageData(Math.round((PUZ_ICON_X[i] - sz / 2) * 2),
                             Math.round((L.footCy - sz / 2) * 2), sz * 2, sz * 2).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k] < 245 || d[k+1] < 245 || d[k+2] < 245) n++;
    return n;
  }, i);
  const k0 = await inkAt(0);
  await p.evaluate(() => document.querySelector('#puzIconRow button[data-act="del"][data-i="0"]').click());
  const k1 = await inkAt(0);
  check("K 图标可删（删了就不画）", k0 > 40 && k1 === 0, "涂了 " + k0 + " px → " + k1 + " px");

  // 换图走真实链路：点「改」→ pickImageAndCrop 的 onDone → 存 dataURL → 重画
  //（只把文件选择那一步桩掉，其余不动）
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 72; c.height = 72;
    const x = c.getContext("2d"); x.fillStyle = "#00ff00"; x.fillRect(0, 0, 72, 72);
    window.__iconImg = c.toDataURL("image/png");
    window.pickImageAndCrop = opts => opts.onDone(window.__iconImg);
  });
  await p.evaluate(() => document.querySelector('#puzIconRow button[data-act="up"][data-i="1"]').click());
  await new Promise(r => setTimeout(r, 150));        // 位图是异步加载的
  const l1 = await p.evaluate(() => {
    const cv = puzCanvasAt(2), x = cv.getContext("2d"), L = puzLayout();
    const d = x.getImageData(Math.round(PUZ_ICON_X[1] * 2), Math.round(L.footCy * 2), 1, 1).data;
    return { png: d[0] + "," + d[1] + "," + d[2], png2: puzCanvasAt(2).toDataURL().length,
             thumbIsImg: /<img/.test(document.querySelectorAll("#puzIconRow .thumb")[1].innerHTML) };
  });
  check("L 换成上传图后画的是那张图", l1.png === "0,255,0" && l1.thumbIsImg, l1.png + " / 槽位=" + l1.thumbIsImg);
  await p.evaluate(() => document.getElementById("puzReset").click());
  await p.evaluate(() => window.__load());
  const l2 = await inkAt(1);
  check("L2 还原默认后图标回来", l2 > 40, "涂了 " + l2 + " px");

  // I2 逐像素核对：拼图块内部的每个像素 == 照片在缺口处的对应像素（内部不覆盖任何颜色）。
  //     素材换成细棋盘格 —— 只要源矩形错一个像素（或比例不对），平均偏差立刻爆表。
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 704;
    const x = c.getContext("2d");
    for (let j = 0; j < 22; j++) for (let i = 0; i < 40; i++){
      x.fillStyle = ((i + j) % 2) ? "#303030" : "#e8e8e8";
      x.fillRect(i * 32, j * 32, 32, 32);
    }
    window.__testImg = c.toDataURL("image/png");
  });
  await p.evaluate(() => window.__load());
  const dev = await p.evaluate(() => {
    const g = puzGeom(), P = PUZ;
    // 照片在卡片上的样子
    const base = document.createElement("canvas");
    base.width = P.W; base.height = puzSt.photoH;
    const bx = base.getContext("2d");
    bx.drawImage(puzImg, 0, 0, P.W, puzSt.photoH);
    // 只比方块右半边：左边有凹口、边上还有 2px 白描边，都不是要核的画面
    const x0 = Math.round(g.S * 0.45), x1 = Math.round(g.S) - 10, y0 = 10, y1 = Math.round(g.S) - 10;
    const bd = bx.getImageData(g.hx + x0, g.hy - g.L.photoTop + y0, x1 - x0, y1 - y0).data;
    const cv = puzCanvasAt(2), cx = cv.getContext("2d");
    const cd = cx.getImageData((g.px + x0) * 2, (g.py + y0) * 2, (x1 - x0) * 2, (y1 - y0) * 2).data;
    let sum = 0, n = 0, worst = 0;
    for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < x1 - x0; x++){
      const bi = (y * (x1 - x0) + x) * 4;
      const ci = ((y * 2) * ((x1 - x0) * 2) + x * 2) * 4;
      for (let c = 0; c < 3; c++){
        const d = Math.abs(cd[ci + c] - bd[bi + c]);
        sum += d; n++; worst = Math.max(worst, d);
      }
    }
    return { avg: sum / n, worst: worst, n: n };
  });
  check("I2 拼图块逐像素 == 缺口原图", dev.avg < 1.5,
        "平均偏差 " + dev.avg.toFixed(2) + "，最大 " + dev.worst.toFixed(0) + "（" + dev.n + " 个采样）");

  // M 边缘质感：缺口贴着上边缘要比中间暗（凹感），拼图块贴着边缘要比中间亮（柔光）。
  //   灰底是纯色，这里的差就是效果本身，不是画面内容。
  await p.evaluate(() => {                       // I2 把素材换成棋盘格了，换回纯灰底
    const c = document.createElement("canvas"); c.width = 1280; c.height = 704;
    const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, 1280, 704);
    window.__testImg = c.toDataURL("image/png");
  });
  await p.evaluate(() => window.__load());
  await setPieceX(13);
  await setHoleX(70);
  await setHoleY(40);
  const edge = await p.evaluate(() => {
    const g = puzGeom(), cv = puzCanvasAt(2), x = cv.getContext("2d");
    const at = (a, b) => { const d = x.getImageData(Math.round(a * 2), Math.round(b * 2), 1, 1).data;
                           return (d[0] + d[1] + d[2]) / 3; };
    return {
      // 取样要避开凸起与凹口：凸起下方的顶边在更上面，凹口那段本来就不是块体
      holeEdge: at(g.hx + 10, g.hy + 3),             // 缺口内、贴着体块上边缘
      holeMid:  at(g.hx + g.S / 2, g.hy + g.S / 2),
      pieceEdge: at(g.px + 3, g.py + 10),            // 拼图块内、贴着左边缘（凹口上方）
      pieceMid:  at(g.px + g.S / 2, g.py + g.S / 2)
    };
  });
  check("M 缺口顶部更暗（凹感）", edge.holeMid - edge.holeEdge > 20,
        Math.round(edge.holeEdge) + " vs 中间 " + Math.round(edge.holeMid));
  check("M2 拼图块边缘更亮（柔光）", edge.pieceEdge - edge.pieceMid > 8,
        Math.round(edge.pieceEdge) + " vs 中间 " + Math.round(edge.pieceMid));

  // N 单独上传拼图块图：画的就是那张图；清除后回到「从主图抠」
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const x = c.getContext("2d"); x.fillStyle = "#00ffff"; x.fillRect(0, 0, 128, 128);
    window.__pieceImg = c.toDataURL("image/png");
    window.pickImageAndCrop = opts => opts.onDone(window.__pieceImg);
  });
  await p.evaluate(() => document.getElementById("puzPieceUpload").click());
  await new Promise(r => setTimeout(r, 150));
  const at1 = () => p.evaluate(() => {
    const g = puzGeom(), cv = puzCanvasAt(2), x = cv.getContext("2d");
    const d = x.getImageData(Math.round((g.px + g.S / 2) * 2), Math.round((g.py + g.S / 2) * 2), 1, 1).data;
    return d[0] + "," + d[1] + "," + d[2];
  });
  const n1 = await at1();
  await p.evaluate(() => document.getElementById("puzPieceDel").click());
  const n2 = await at1();
  check("N 另传拼图块图后画的是那张图 / 清除后回到抠图",
        n1 === "0,255,255" && n2 === "128,128,128", n1 + " → " + n2);

  // 取色器 helper：直接写值 + 派发 input，走控件真正的那条绑定
  const setColor = (id, v) => p.evaluate((id, v) => {
    const e = document.getElementById(id); e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, id, v);

  // O 覆盖 / 描边 / 发光三个滑块各自起效（素材是纯灰底，量到的差就是效果本身）
  await setPieceX(13);
  await setHoleX(70);
  await setHoleY(40);
  const probePx = (dx, dy) => p.evaluate((dx, dy) => {
    const g = puzGeom(), cv = puzCanvasAt(2), x = cv.getContext("2d");
    const d = x.getImageData(Math.round((g.px + dx) * 2), Math.round((g.py + dy) * 2), 1, 1).data;
    return (d[0] + d[1] + d[2]) / 3;
  }, dx, dy);
  await setSlider("puzCover", 100);
  const oCover = await probePx(24, 24);
  await setSlider("puzCover", 0);
  const oPlain = await probePx(24, 24);
  check("O 覆盖可调", oCover > 250 && Math.abs(oPlain - 128) < 2,
        "100% → " + Math.round(oCover) + "，0% → " + Math.round(oPlain));

  await setSlider("puzStroke", 0);
  const oNoStroke = await probePx(0, 10);          // 正好落在描边中线上
  await setSlider("puzStroke", 100);
  const oStroke = await probePx(0, 10);
  check("O2 描边可调", oStroke - oNoStroke > 30,
        "0% → " + Math.round(oNoStroke) + "，100% → " + Math.round(oStroke));

  await setSlider("puzGlow", 0);
  const oNoGlow = await probePx(3, 10);            // 描边内侧一点，只有柔光够得着
  await setSlider("puzGlow", 200);
  const oGlow = await probePx(3, 10);
  await setSlider("puzGlow", 100);
  check("O3 发光可调", oGlow - oNoGlow > 8,
        "0% → " + Math.round(oNoGlow) + "，200% → " + Math.round(oGlow));

  // O4~O6 覆盖 / 描边 / 发光 的颜色都能自己挑：同一个点换色，通道就该跟着翻
  const probeRGB = (dx, dy) => p.evaluate((dx, dy) => {
    const g = puzGeom(), cv = puzCanvasAt(2), x = cv.getContext("2d");
    const d = x.getImageData(Math.round((g.px + dx) * 2), Math.round((g.py + dy) * 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, dx, dy);

  await setSlider("puzCover", 100);
  await setColor("puzCoverColor", "#ff0000");
  const covR = await probeRGB(24, 24);
  await setColor("puzCoverColor", "#ffffff");
  await setSlider("puzCover", 0);
  check("O4 覆盖颜色可选", covR[0] > 250 && covR[1] < 6 && covR[2] < 6, covR.join(","));

  await setSlider("puzStroke", 100);
  await setColor("puzStrokeColor", "#00ff00");
  const strG = await probeRGB(0, 10);
  await setColor("puzStrokeColor", "#ffffff");
  await setSlider("puzStroke", 62);
  check("O5 描边颜色可选", strG[1] > 250 && strG[0] < 6 && strG[2] < 6, strG.join(","));

  await setSlider("puzGlow", 200);
  await setColor("puzGlowColor", "#ff0000");
  const gloR = await probeRGB(3, 10);
  await setColor("puzGlowColor", "#ffffff");
  await setSlider("puzGlow", 100);
  check("O6 发光颜色可选", gloR[0] - gloR[1] > 40 && gloR[0] - gloR[2] > 40, gloR.join(","));

  // P 预览里直接拖缺口（拼图块压在上面时优先认拼图块，这里两块分开放）
  const hOld = await p.evaluate(() => ({ x: puzSt.holeX, y: puzSt.holeY }));
  await p.evaluate(() => {
    const g = puzGeom();
    window.__drag({ x: g.hx + g.S / 2, y: g.hy + g.S / 2 },
                  { x: g.hx + g.S / 2 - 40, y: g.hy + g.S / 2 + 30 });
  });
  const hNew = await p.evaluate(() => ({ x: puzSt.holeX, y: puzSt.holeY, px: puzSt.pieceX }));
  check("P 预览里直接拖缺口", hNew.x < hOld.x - 8 && hNew.y > hOld.y + 10 && Math.abs(hNew.px - 13) < 0.5,
        "缺口 " + Math.round(hOld.x) + "/" + Math.round(hOld.y) + " → " + Math.round(hNew.x) + "/" + Math.round(hNew.y) +
        "（拼图块位置未动：" + Math.round(hNew.px) + "）");

  // Q 缺口的颜色 / 深度 / 描边 / 边缘（放最后：会改掉 M 依赖的默认配比）
  const holeRGB = (dx, dy) => p.evaluate((dx, dy) => {
    const g = puzGeom(), cv = puzCanvasAt(2), x = cv.getContext("2d");
    const d = x.getImageData(Math.round((g.hx + dx) * 2), Math.round((g.hy + dy) * 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, dx, dy);
  await setColor("puzHoleColor", "#ff0000");
  await setSlider("puzHoleDepth", 100);
  const q1 = await holeRGB(24, 24);
  check("Q 缺口颜色 / 深度可调", q1[0] > 250 && q1[1] < 6 && q1[2] < 6, q1.join(","));
  await setColor("puzHoleColor", "#000000");
  await setSlider("puzHoleDepth", 45);

  await setColor("puzHoleStrokeColor", "#00ff00");
  await setSlider("puzHoleStroke", 100);
  await setSlider("puzHoleStrokeW", 3);
  const q2 = await holeRGB(10, 0);          // 体块上边缘，避开凸起那一段
  check("Q2 缺口描边可调", q2[1] > 250 && q2[0] < 6 && q2[2] < 6, q2.join(","));
  await setSlider("puzHoleStroke", 0);
  await setColor("puzHoleStrokeColor", "#ffffff");

  const topOn = await holeRGB(10, 3), midOn = await holeRGB(24, 24);
  await setSlider("puzHoleEdge", 0);
  const topOff = await holeRGB(10, 3);
  await setSlider("puzHoleEdge", 100);
  const sum = c => (c[0] + c[1] + c[2]) / 3;
  check("Q3 缺口边缘强度可调", sum(midOn) - sum(topOn) > 20 && Math.abs(sum(topOff) - sum(midOn)) < 8,
        "边缘开 " + Math.round(sum(topOn)) + "/中间 " + Math.round(sum(midOn)) +
        "，边缘关 " + Math.round(sum(topOff)));

  // Q4 边缘渐变的颜色可选：同一个点换绿/红，通道跟着翻
  await setColor("puzHoleEdgeColor", "#00ff00");
  const qG = await holeRGB(10, 3);
  await setColor("puzHoleEdgeColor", "#ff0000");
  const qR = await holeRGB(10, 3);
  await setColor("puzHoleEdgeColor", "#000000");
  check("Q4 缺口边缘颜色可选", qG[1] > qR[1] + 20 && qR[0] > qG[0] + 20,
        "绿边 " + qG.join(",") + " / 红边 " + qR.join(","));

  // R 形状预设：每个形状都画得出，且「拼图块与缺口同形」——
  //    把拼图块对到缺口上，缺口那点深色应当一点都漏不出来（不同形就会漏边）
  const shapes = await p.evaluate(async () => {
    const names = PUZ_SHAPES.map(x => x.id);
    const load = src => new Promise(res => { const im = new Image();
      im.onload = () => { puzImg = im; puzRender(); res(); }; im.src = src; });
    const flat = (() => { const c = document.createElement("canvas"); c.width = 1280; c.height = 704;
      const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, 1280, 704);
      return c.toDataURL("image/png"); })();
    const out = {};

    // 一、内容：只在缺口那一块涂红，拼图块中心就该是红的
    for (const sh of names){
      puzSt.shape = sh; puzSt.pieceX = 0; puzSt.holeX = 100; puzSt.holeY = 40; puzSync();
      const g = puzGeom(), k = 4;
      const c = document.createElement("canvas"); c.width = PUZ.W * k; c.height = puzSt.photoH * k;
      const x = c.getContext("2d");
      x.fillStyle = "#808080"; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "#ff0000";
      x.fillRect(g.hx * k, (g.hy - g.L.photoTop - g.tab) * k, g.S * k, (g.S + g.tab) * k);
      await load(c.toDataURL("image/png"));
      const cv = puzCanvasAt(2), cx = cv.getContext("2d");
      const d = cx.getImageData(Math.round((g.px + g.S / 2) * 2), Math.round((g.py + g.S / 2) * 2), 1, 1).data;
      out[sh + "_内容"] = (d[0] > 250 && d[1] < 6) ? "红" : (d[0] + "," + d[1] + "," + d[2]);
    }

    // 二、同形：回到纯灰底（背景 128 / 缺口压暗≈70 / 描边与柔光>190），
    //     把拼图块对到缺口上，缺口那点深色应当一点都漏不出来
    await load(flat);
    for (const sh of names){
      puzSt.shape = sh; puzSt.pieceX = Math.round(puzSt.holeX); puzSync();
      const cv = puzCanvasAt(2), w = cv.width;
      const L = puzLayout();
      const y0 = Math.round(L.photoTop * 2), y1 = Math.round((L.photoTop + puzSt.photoH) * 2);
      const d = cv.getContext("2d").getImageData(0, y0, w, y1 - y0).data;
      let dark = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4){
        const v = (d[i] + d[i+1] + d[i+2]) / 3;
        if (v < 90) dark++;
        if (v > 190) bright++;
      }
      out[sh] = { dark: dark, bright: bright, 内容: out[sh + "_内容"] };
    }
    puzSt.shape = "jigsaw"; puzSync();
    return out;
  });
  const names = ["jigsaw", "square", "circle", "tri", "star"];
  const noInk = names.filter(k => shapes[k].bright <= 200);
  const noContent = names.filter(k => shapes[k].内容 !== "红");
  check("R 五种形状：画得出 + 拼图块取到缺口那块画面",
        noInk.length === 0 && noContent.length === 0,
        names.map(k => k + " 内容" + shapes[k].内容 + "/亮" + shapes[k].bright).join("  "));
  check("R2 拼图块与缺口同形（对齐后不漏深色）",
        names.every(k => shapes[k].dark <= 60),
        names.map(k => k + " 漏" + shapes[k].dark).join("  "));
  check("R3 各形状轮廓确实不同", new Set(names.map(k => shapes[k].bright)).size === names.length,
        names.map(k => k + ":" + shapes[k].bright).join("  "));


  // T 自定义形状：上传的轮廓要一路走到渲染出来的像素上
  // T1 形状图是 2:1 的梯形 -> 缺口那点深色的外接框也得是 2:1（比例确实传到了像素上）
  // T2 按侧解析：pieceShape="same" 跟随缺口；自己挑了就各是各的
  // T3 拼图块单独挑成方形 -> 对齐也盖不住（漏深色）；改回「跟随缺口」就严丝合缝
  // T4 阈值推到抠不出东西 -> 渲染真的变了，而且会出提示（不能默默退成方块）
  // T5 清除 / 还原：形状图、pieceShape 都回默认
  const trapUrl = await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#ff00ff";
    x.beginPath(); x.moveTo(76, 96); x.lineTo(180, 96); x.lineTo(192, 160); x.lineTo(64, 160);
    x.closePath(); x.fill();
    return c.toDataURL("image/png");
  });
  await p.evaluate(url => new Promise(res => {
    puzSt.shape = "custom"; puzSt.pieceShape = "same"; puzSt.shapeMaskThr = 30;
    puzMaskLoad(url, () => { window.__load(); res(true); });
  }), trapUrl);
  await new Promise(r => setTimeout(r, 250));

  // 量「缺口那点深色」的外接框（纯灰底：缺口压暗后 <90，别处不会）
  const darkBox = () => p.evaluate(() => {
    const cv = puzCanvasAt(2), L = puzLayout();
    const y0 = Math.round(L.photoTop * 2), y1 = Math.round((L.photoTop + puzSt.photoH) * 2);
    const d = cv.getContext("2d").getImageData(0, y0, cv.width, y1 - y0).data, W = cv.width;
    let xa = 1e9, ya = 1e9, xb = -1, yb = -1, n = 0;
    for (let y = 0; y < y1 - y0; y++)
      for (let x = 0; x < W; x++){
        const i = (y * W + x) * 4;
        if ((d[i] + d[i+1] + d[i+2]) / 3 < 90){
          n++; if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y;
        }
      }
    return n ? { w: xb - xa + 1, h: yb - ya + 1, n: n } : null;
  });
  const t1 = await p.evaluate(() => {
    puzSt.holeX = 100; puzSt.pieceX = 0; puzSt.holeRot = 0; puzSt.pieceRot = 0; puzSync();
    return { bw: puzMaskAt(30).bw, bh: puzMaskAt(30).bh };
  });
  const t1box = await darkBox();
  check("T1 自定义形状（2:1 梯形）：缺口那点深色的外接框也是 2:1",
        t1box && Math.abs(t1box.w / t1box.h - 2) < 0.35 && Math.abs(t1.bw / t1.bh - 2) < 0.05,
        t1box ? "掩版裁剪 " + t1.bw + "×" + t1.bh + "，渲染出来的深色框 " + t1box.w + "×" + t1box.h +
                "（比 " + (t1box.w / t1box.h).toFixed(3) + "），深色 " + t1box.n + " px" : "没量到深色");

  const t2 = await p.evaluate(() => {
    const a = { hole: puzShapeOf("hole"), piece: puzShapeOf("piece") };   // 默认跟随
    puzSt.pieceShape = "square";
    const b = { hole: puzShapeOf("hole"), piece: puzShapeOf("piece") };
    puzSt.pieceShape = "same";
    return { a: a, b: b };
  });
  check("T2 按侧解析：默认跟随缺口，单独挑了就各是各的",
        t2.a.hole === "custom" && t2.a.piece === "custom" &&
        t2.b.hole === "custom" && t2.b.piece === "square",
        "跟随 -> " + JSON.stringify(t2.a) + "；单独挑方形 -> " + JSON.stringify(t2.b));

  // T3 两边形状不同就盖不住；改回跟随就严丝合缝
  const leakOf = () => p.evaluate(() => {
    puzSt.pieceX = Math.round(puzSt.holeX); puzSync();
    const cv = puzCanvasAt(2), L = puzLayout();
    const y0 = Math.round(L.photoTop * 2), y1 = Math.round((L.photoTop + puzSt.photoH) * 2);
    const d = cv.getContext("2d").getImageData(0, y0, cv.width, y1 - y0).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i+1] + d[i+2]) / 3 < 90) n++;
    return n;
  });
  const t3same = await p.evaluate(() => { puzSt.pieceShape = "same"; return 1; }) && await leakOf();
  const t3diff = await p.evaluate(() => { puzSt.pieceShape = "square"; return 1; }) && await leakOf();
  await p.evaluate(() => { puzSt.pieceShape = "same"; });
  check("T3 拼图块挑成别的形状就盖不住（漏深色）；跟缺口同形则严丝合缝",
        t3same <= 60 && t3diff > t3same * 5,
        "同形（跟随缺口）漏 " + t3same + " px；挑成方形漏 " + t3diff + " px");

  // T4 阈值：用不透明的白底 + 灰形状，阈值推高到抠不出东西 -> 渲染变、且出提示
  const t4 = await p.evaluate(() => new Promise(res => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#999999"; x.fillRect(80, 100, 96, 56);
    const url = c.toDataURL("image/png");
    puzMaskLoad(url, () => res(true));
  }));
  const 低 = await p.evaluate(async () => {
    await window.__setThr(20);
    return { m: !!puzMaskAt(20), warn: document.getElementById("puzMaskWarn").style.display };
  });
  const 高 = await p.evaluate(async () => {
    await window.__setThr(95);
    return { m: !!puzMaskAt(95), warn: document.getElementById("puzMaskWarn").style.display,
             文字: document.getElementById("puzMaskWarn").textContent };
  });
  check("T4 阈值推高到抠不出形状：确实变了，而且给了提示（不默默退成方块）",
        t4 === true && 低.m === true && 高.m === false &&
        低.warn === "none" && 高.warn === "block" && 高.文字.length > 0,
        "阈值 20 -> 有轮廓、无提示；阈值 95 -> 抠不出、提示「" + 高.文字 + "」");

  // T5 清除 / 还原
  const t5 = await p.evaluate(() => {
    document.getElementById("puzShapeClear").click();
    const afterClear = { url: puzMask.hole.url, hole: puzSt.shape, piece: puzSt.pieceShape,
                         块: document.getElementById("puzShapeCustom").style.display };
    puzSt.shape = "custom"; puzSt.pieceShape = "circle";
    document.getElementById("puzReset").click();
    return { afterClear: afterClear,
             afterReset: { url: puzMask.hole.url, hole: puzSt.shape, piece: puzSt.pieceShape,
                           块: document.getElementById("puzShapeCustom").style.display } };
  });
  check("T5 清除形状图会退回内置形状；还原把形状图与两边形状都复位",
        t5.afterClear.url === null && t5.afterClear.hole === "jigsaw" && t5.afterClear.piece === "same" &&
        t5.afterClear.块 === "none" &&
        t5.afterReset.url === null && t5.afterReset.hole === "jigsaw" && t5.afterReset.piece === "same" &&
        t5.afterReset.块 === "none",
        "清除后 " + JSON.stringify(t5.afterClear) + "；还原后 " + JSON.stringify(t5.afterReset));


  // T6 拼图块自己传一张（跟缺口完全不同的）形状图：两侧各用各的，互不影响。
  //    自己把两张图都装好，别依赖前面检查留下的状态（T5 已经把缺口的图清掉了）
  const t6 = await p.evaluate(() => new Promise(res => {
    const mk = draw => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      draw(c.getContext("2d"));
      return c.toDataURL("image/png");
    };
    const trap = mk(x => { x.fillStyle = "#ff00ff"; x.fillRect(64, 96, 128, 64); });   // 2:1 横条
    const bar  = mk(x => { x.fillStyle = "#00ff00"; x.fillRect(104, 32, 48, 192); });  // 1:4 竖条
    puzMaskLoad(trap, () => puzMaskLoad(bar, ok => {
      puzSt.shape = "custom"; puzSt.pieceShape = "custom";
      puzSt.shapeMaskThr = 30; puzSt.pieceShapeMaskThr = 30;
      const EH = puzExtent("hole", 48), EP = puzExtent("piece", 48);
      res({ ok: ok, EH: EH, EP: EP,
            // 两侧各按各的比例内切：2:1 横条 -> 24/12，1:4 竖条 -> 6/24
            缺口对: Math.abs(EH.hw - 24) < 1e-3 && Math.abs(EH.hhUp - 12) < 1e-3 });
    }, "piece"));
  }));
  check("T6 拼图块自己传图：两侧各用各的（缺口 2:1 横条 / 拼图块 1:4 竖条）",
        t6.ok === true && t6.缺口对 &&
        Math.abs(t6.EP.hw * 2 - 12) < 1e-3 && Math.abs(t6.EP.hhUp * 2 - 48) < 1e-3,
        "缺口 hw=" + t6.EH.hw.toFixed(2) + " 半高=" + t6.EH.hhUp.toFixed(2) + "（应 24 / 12）；" +
        "拼图块 hw=" + t6.EP.hw.toFixed(2) + " 半高=" + t6.EP.hhUp.toFixed(2) + "（应 6 / 24）");

  // 收尾：把两侧都还原，别把状态漏给后面的检查
  await p.evaluate(() => {
    puzSt.shape = "jigsaw"; puzSt.pieceShape = "same";
    puzMaskReset(); puzMaskSlot("hole").url = null; puzMaskSlot("piece").url = null;
    document.getElementById("puzShapeUpload").innerHTML = "<span>上传形状图</span>";
    document.getElementById("puzPieceShapeUpload").innerHTML = "<span>上传形状图</span>";
    puzSync();
  });

  // S 滑块 / 轨道可以贴图（按各自比例裁剪），清除后回到底色
  await p.evaluate(() => {
    const mk = c => { const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      const x = cv.getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 256, 256); return cv.toDataURL("image/png"); };
    window.__hImg = mk("#ff00ff");            // 洋红 = 滑块图
    window.__tImg = mk("#00ff00");            // 绿   = 轨道图
    // 两个上传框都走 pickImageAndCrop：用裁剪比例区分是谁（滑块 ≈1.8，轨道 ≈21）
    window.pickImageAndCrop = opts => opts.onDone(opts.ratio > 5 ? window.__tImg : window.__hImg);
  });
  const shotRgb = (dx, dy) => p.evaluate((dx, dy) => {
    const g = puzGeom(), L = g.L, P = PUZ;
    const trackW = P.W - P.TRACK_X * 2;
    const hx = Math.max(P.TRACK_X, Math.min(P.TRACK_X + trackW - P.HANDLE_W, g.px + g.S / 2 - P.HANDLE_W / 2));
    const x = dx === "hx" ? hx + 8 : P.TRACK_X + 20;      // 避开滑块中间那三条白杠
    const cv = puzCanvasAt(2), c = cv.getContext("2d");
    const d = c.getImageData(Math.round(x * 2), Math.round((dy === "cy" ? L.trackCy : dy) * 2), 1, 1).data;
    return d[0] + "," + d[1] + "," + d[2];
  }, dx, dy);

  await setPieceX(60);                                     // 滑块挪开一点，别盖住取样点
  const beforeH = await shotRgb("hx", "cy"), beforeT = await shotRgb("tx", "cy");
  await p.evaluate(() => document.getElementById("puzHandleImg").click());
  await new Promise(r => setTimeout(r, 200));
  await p.evaluate(() => document.getElementById("puzTrackImg").click());
  await new Promise(r => setTimeout(r, 200));
  const afterH = await shotRgb("hx", "cy"), afterT = await shotRgb("tx", "cy");
  await p.evaluate(() => { document.getElementById("puzHandleDel").click();
                           document.getElementById("puzTrackDel").click(); });
  await new Promise(r => setTimeout(r, 200));
  const backH = await shotRgb("hx", "cy"), backT = await shotRgb("tx", "cy");
  check("S 滑块/轨道能贴图，清除后回到底色",
        afterH === "255,0,255" && afterT === "0,255,0" &&
        backH === beforeH && backT === beforeT,
        "滑块 " + beforeH + " → " + afterH + " → " + backH +
        "；轨道 " + beforeT + " → " + afterT + " → " + backT);

  check("H 无 JS 报错", errs.length === 0, errs.join(" | "));

  // 肉眼校对：PUZ_SHOT=1 时另外存两张图（灰底太素，换张有内容的）
  if (process.env.PUZ_SHOT){
    await p.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1280; c.height = 704;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, 704);
      g.addColorStop(0, "#8fa3ad"); g.addColorStop(.5, "#5d7b88"); g.addColorStop(1, "#2b3f4a");
      x.fillStyle = g; x.fillRect(0, 0, 1280, 704);
      for (let i = 0; i < 26; i++){
        x.fillStyle = "rgba(235,240,242," + (0.2 + Math.random() * 0.5) + ")";
        x.beginPath(); x.ellipse(Math.random() * 1280, 240 + Math.random() * 420,
          40 + Math.random() * 150, 8 + Math.random() * 26, 0, 0, 7); x.fill();
      }
      for (let i = 0; i < 9; i++){
        x.fillStyle = "rgba(12,18,22," + (0.5 + Math.random() * 0.5) + ")";
        x.beginPath(); x.ellipse(Math.random() * 1280, 430 + Math.random() * 260,
          50 + Math.random() * 130, 22 + Math.random() * 60, 0, 0, 7); x.fill();
      }
      window.__testImg = c.toDataURL("image/png");
    });
    await p.evaluate(() => { document.getElementById("puzReset").click(); return window.__load(); });
    await p.evaluate(() => document.getElementById("puzExport").click());
    const fs = require("fs");
    fs.writeFileSync(path.join(__dirname, "_puz_export.png"),
      Buffer.from((await p.evaluate(() => window.__png)).split(",")[1], "base64"));
    // 再来一张「拖到位」的：拼图块正好压在缺口上，看它是不是同一块画面
    await setPieceX(await p.evaluate(() => puzSt.holeX));
    await p.evaluate(() => document.getElementById("puzExport").click());
    fs.writeFileSync(path.join(__dirname, "_puz_aligned.png"),
      Buffer.from((await p.evaluate(() => window.__png)).split(",")[1], "base64"));

    const clip = await p.evaluate(() => {
      const r = document.getElementById("panelPuz").getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await p.screenshot({ path: path.join(__dirname, "_puz_panel.png"),
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
    console.log("（已另存 tools/_puz_export.png / tools/_puz_panel.png）");
  }

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
