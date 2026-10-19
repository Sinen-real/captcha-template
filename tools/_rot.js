// 校验拼图块与缺口的独立旋转：
// A 默认 0 度，且 puzGeom 与「未旋转那套公式」逐值相同（默认外观一个像素都不能动）
// A2 五个内置形状 × 8 角度 × 3 尺寸，新几何逐值等于原来那套公式（外观零变化的硬门）
// B 只转缺口 -> 缺口那片像素变了、拼图块没动
// C 只转拼图块 -> 反过来
// D 两角相等且对齐 -> 拼图块仍精确盖住缺口（不漏深色）
// E 两角错开 -> 盖不住（这正是「可以不一样」的意义）
// F 转到大角度时外接框仍待在照片里（夹取范围跟着旋转走）
// G 转过的拼图块还抓得住（命中判定跟着转）
// I 「匹配缺口」快捷按钮：一键抄缺口的角度、画布重画、对齐后置灰
// I2 只改缺口角度时按钮从置灰里活过来，且不会顺手改拼图块角度
// J 自定义形状：2:1 轮廓内切进方块（宽占满、高减半、tab=0）  J2 转 45° 的外接框 = 解析值
// H 无 JS 报错
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
    window.__slider = (id, v) => {
      const e = document.getElementById(id); e.value = v;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    };
    /* 铺一张纯 128 灰的底图：缺口压暗后是 ~70（算「深色」），拼图块里是 128（不算），
       「缺口有没有被盖住」这才量得出来。用默认的 #c9c9c9 的话缺口只压到 110，
       根本不算深色 —— 怎么量都是 0，坑过一次。 */
    window.__flat = () => new Promise(res => {
      const c = document.createElement("canvas"); c.width = 640; c.height = 352;
      const x = c.getContext("2d"); x.fillStyle = "rgb(128,128,128)"; x.fillRect(0, 0, 640, 352);
      const im = new Image();
      im.onload = () => { puzImg = im; puzRender(); setTimeout(res, 80); };
      im.src = c.toDataURL("image/png");
    });
    // 某个矩形区域的像素签名（拿来做「这片变没变」的判据）
    window.__sig = (x, y, w, h) => {
      const cv = puzCanvasAt(2), X = cv.getContext("2d");
      const px = Math.max(0, Math.round(x * 2)), py = Math.max(0, Math.round(y * 2));
      const pw = Math.min(Math.round(w * 2), cv.width - px);
      const ph = Math.min(Math.round(h * 2), cv.height - py);
      if (pw <= 0 || ph <= 0) return 0;
      const d = X.getImageData(px, py, pw, ph).data;
      let s = 0;
      // i 走到尾巴上会让 d[i+1] 变 undefined -> NaN -> >>> 0 直接 0，
      // 签名就恒为 0、什么都测不出来。上界必须收住
      for (let i = 0; i + 2 < d.length; i += 13) s = (s * 33 + d[i] + d[i + 1] * 3) >>> 0;
      return s;
    };
    // 缺口 / 拼图块各自那片区域（给足余量，转过 45° 也框得住）
    window.__zone = which => {
      const g = puzGeom(), pad = g.S / 2;
      const x = which === "hole" ? g.hx : g.px, y = which === "hole" ? g.hy : g.py;
      return { x: x - pad, y: y - g.tab - pad, w: g.S + pad * 2, h: g.S + g.tab + pad * 2 };
    };
    window.__zoneSig = which => { const z = window.__zone(which); return window.__sig(z.x, z.y, z.w, z.h); };
    // 照片区里有多少「深色」= 缺口没被盖住漏出来的量（只扫照片那一段，别把标题正文算进来）
    window.__dark = () => {
      const cv = puzCanvasAt(2), L = puzLayout();
      const y0 = Math.round(L.photoTop * 2), y1 = Math.round((L.photoTop + puzSt.photoH) * 2);
      const d = cv.getContext("2d").getImageData(0, y0, cv.width, y1 - y0).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 90) n++;
      return n;
    };
  });
  await new Promise(r => setTimeout(r, 350));
  await p.evaluate(() => window.__flat());          // 先铺灰底，后面的判据都靠它

  console.log("\n拼图块与缺口的独立旋转：");

  // A 默认 0：和「未旋转那套公式」逐值相同
  const a = await p.evaluate(() => {
    const g = puzGeom(), S = puzSt.size, tab = g.tab;
    return {
      角度: [puzSt.holeRot, puzSt.pieceRot],
      原点x: g.hx - puzSt.holeX / 100 * (320 - S),
      原点y: g.hy - (g.L.photoTop + tab + puzSt.holeY / 100 * (puzSt.photoH - tab - S)),
      块点x: g.px - puzSt.pieceX / 100 * (320 - S)
    };
  });
  check("A 默认 0 度，且几何与原来那套公式逐值相同",
        a.角度[0] === 0 && a.角度[1] === 0 &&
        Math.abs(a.原点x) < 1e-9 && Math.abs(a.原点y) < 1e-9 && Math.abs(a.块点x) < 1e-9,
        "角度 " + a.角度.join("/") + "，与原公式的偏差 " +
        a.原点x.toFixed(12) + " / " + a.原点y.toFixed(12) + " / " + a.块点x.toFixed(12));

  // A2 五个内置形状 × 8 个角度 × 3 个尺寸：新的 extent / rotBox 都要逐值等于「原来那套写死的公式」。
  //    自定义形状把几何从 (S, tab) 推广成了 (hw, hhUp, hhDn)，这条钉住推广在旧形状上一步没走样。
  //    写死旧公式是有意的 —— 它就是要钉住「以前长什么样」。
  const a2Bad = [];
  for (const shape of ["jigsaw", "square", "circle", "tri", "star"]){
    for (const rot of [0, 17, 45, 90, 135, 180, 270, 350]){
      for (const size of [34, 48, 72]){
        const r = await p.evaluate((shape, rot, size) => {
          puzSt.shape = shape; puzSt.size = size;
          puzSt.holeRot = rot; puzSt.pieceRot = rot;
          const S = size;
          const tab = puzShapeTabOf("hole");
          const th = rot * Math.PI / 180, c = Math.abs(Math.cos(th)), s2 = Math.abs(Math.sin(th));
          const e = puzRotBox(puzExtent("hole", S), rot);
          return Math.max(Math.abs(e.hw   - (S / 2 * c + (S / 2 + tab) * s2)),
                          Math.abs(e.hhUp - (S / 2 * s2 + (S / 2 + tab) * c)),
                          Math.abs(e.hhDn - (S / 2 * s2 + S / 2 * c)));
        }, shape, rot, size);
        if (!(r < 1e-9)) a2Bad.push(shape + "@" + rot + "°/" + size + " 差 " + r);
      }
    }
  }
  check("A2 五个内置形状 × 8 角度 × 3 尺寸：新几何逐值等于原来那套公式", a2Bad.length === 0,
        a2Bad.join("；") || "5×8×3 = 120 组，偏差都 < 1e-9");
  await p.evaluate(() => { puzSt.shape = "jigsaw"; puzSt.size = 48;
    puzSt.holeRot = 0; puzSt.pieceRot = 0; });          // A2 摸过状态，还原回去

  // 把两块拉开，各自的采样区才不重叠
  await p.evaluate(() => { window.__slider("puzHoleRot", 0); window.__slider("puzPieceRot", 0);
    puzSt.holeX = 75; puzSt.pieceX = 10; puzRender(); });
  await new Promise(r => setTimeout(r, 200));
  const base = await p.evaluate(() => ({ hole: window.__zoneSig("hole"), piece: window.__zoneSig("piece") }));

  // B 只转缺口
  await p.evaluate(() => window.__slider("puzHoleRot", 45));
  await new Promise(r => setTimeout(r, 200));
  const bb = await p.evaluate(() => ({ hole: window.__zoneSig("hole"), piece: window.__zoneSig("piece") }));
  check("B 只转缺口：缺口变了、拼图块没动",
        bb.hole !== base.hole && bb.piece === base.piece,
        "缺口签名 " + base.hole + " → " + bb.hole + "；拼图块签名 " + base.piece +
        (bb.piece === base.piece ? "（未变）" : " → " + bb.piece + "（不该变！）"));

  // C 只转拼图块
  await p.evaluate(() => { window.__slider("puzHoleRot", 0); window.__slider("puzPieceRot", 45); });
  await new Promise(r => setTimeout(r, 200));
  const cc = await p.evaluate(() => ({ hole: window.__zoneSig("hole"), piece: window.__zoneSig("piece") }));
  check("C 只转拼图块：拼图块变了、缺口没动",
        cc.piece !== base.piece && cc.hole === base.hole,
        "拼图块签名 " + base.piece + " → " + cc.piece + "；缺口签名 " + base.hole +
        (cc.hole === base.hole ? "（未变）" : " → " + cc.hole + "（不该变！）"));

  // D 两角相等 + 对齐 -> 还是严丝合缝（复用 R2 的思路：漏出来的深色要趋近 0）
  const leakAt = async rot => {
    await p.evaluate(r => {
      window.__slider("puzHoleRot", r); window.__slider("puzPieceRot", r);
      puzSt.pieceX = puzSt.holeX; puzRender();
    }, rot);
    await new Promise(r => setTimeout(r, 200));
    return p.evaluate(() => window.__dark());
  };
  const d90 = await leakAt(90);
  const d37 = await leakAt(37);
  check("D 两角相等且对齐 -> 仍然严丝合缝（不漏深色）",
        d90 <= 60 && d37 <= 60, "都转 90° 漏 " + d90 + " px；都转 37° 漏 " + d37 + " px");

  // E 两角错开 -> 盖不住（这正是「角度可以不一样」的意义）
  const eMis = await leakAt(45);                        // 两角都是 45°：对得上
  const eOff = await p.evaluate(() => {                 // 缺口留 45°、拼图块转 90°：错开
    window.__slider("puzPieceRot", 90);
    puzSt.pieceX = puzSt.holeX; puzRender();
    return window.__dark();
  });
  check("E 两角错开 -> 盖不住（缺口露出来了）",
        eMis <= 60 && eOff > eMis * 5,
        "两角同为 45° 漏 " + eMis + " px；错开（45° vs 90°）漏 " + eOff + " px");

  // F 大角度下外接框仍在照片里
  const fBad = [];
  for (const rot of [0, 20, 45, 90, 135, 180, 270, 350]){
    for (const [hxv, hyv] of [[0, 0], [100, 100], [0, 100], [100, 0]]){
      const r = await p.evaluate((rot, hx, hy) => {
        window.__slider("puzHoleRot", rot); window.__slider("puzPieceRot", rot);
        puzSt.holeX = hx; puzSt.holeY = hy; puzSt.pieceX = hx;
        const g = puzGeom(), B = puzRotBox(puzExtent("hole", g.S), rot);
        const pt = g.L.photoTop, pb = pt + puzSt.photoH;
        return { 左: g.hcx - B.hw, 右: g.hcx + B.hw - 320, 上: g.hcy - B.hhUp - pt, 下: g.hcy + B.hhDn - pb };
      }, rot, hxv, hyv);
      const over = Math.max(r.左 * -1, r.右, r.上 * -1, r.下, 0);
      if (over > 0.01) fBad.push(rot + "°@" + hxv + "," + hyv + " 越界 " + over.toFixed(2));
    }
  }
  check("F 各角度 × 四个角位，外接框都不越出照片", fBad.length === 0,
        fBad.join("；") || "8 个角度 × 4 个角位，全部贴边不越界");

  // G 转过之后还抓得住
  await p.evaluate(() => {
    window.__slider("puzHoleRot", 0); window.__slider("puzPieceRot", 60);
    puzSt.holeX = 75; puzSt.pieceX = 15; puzRender();
  });
  await new Promise(r => setTimeout(r, 250));
  const gShot = await p.evaluate(() => {
    const cv = document.getElementById("puzCanvas"), g = puzGeom();
    const r = cv.getBoundingClientRect(), k = r.width / PUZ.W;
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
    const cx = r.left + g.pcx * k, cy = r.top + g.pcy * k;
    const before = puzSt.pieceX;
    const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
    ev("pointerdown", cx, cy);
    for (let i = 1; i <= 5; i++) ev("pointermove", cx + i * 8, cy);
    ev("pointerup", cx + 40, cy);
    return { 动了: puzSt.pieceX !== before, 缺口没动: Math.abs(puzSt.holeX - 75) < 0.5 };
  });
  check("G 转过 60° 的拼图块照样抓得住（且拖的是块不是缺口）",
        gShot.动了 && gShot.缺口没动, JSON.stringify(gShot));

  // I 「匹配缺口」快捷按钮：一键把拼图块角度抄成缺口的，且画布真的重画了、对齐后置灰
  await p.evaluate(() => {
    window.__slider("puzHoleRot", 120); window.__slider("puzPieceRot", 0);
    puzSt.holeX = 75; puzSt.pieceX = 10; puzRender();
  });
  await new Promise(r => setTimeout(r, 200));
  const iSigBefore = await p.evaluate(() => window.__zoneSig("piece"));
  const iShot = await p.evaluate(() => {
    const btn = document.getElementById("puzPieceRotMatch");
    const out = { 缺口角: puzSt.holeRot, 点前块角: puzSt.pieceRot, 点前置灰: btn.disabled };
    btn.click();
    out.点后块角 = puzSt.pieceRot;
    out.点后置灰 = btn.disabled;
    out.滑块 = document.getElementById("puzPieceRot").value;
    out.读数 = document.getElementById("puzPieceRotVal").textContent;
    return out;
  });
  await new Promise(r => setTimeout(r, 200));
  const iSigAfter = await p.evaluate(() => window.__zoneSig("piece"));
  check("I 「匹配缺口」一键对齐角度、画布跟着重画、对齐后按钮置灰",
        iShot.缺口角 === 120 && iShot.点前块角 === 0 && iShot.点前置灰 === false &&
        iShot.点后块角 === 120 && iShot.点后置灰 === true &&
        iShot.滑块 === "120" && iShot.读数 === "120°" && iSigAfter !== iSigBefore,
        "缺口 120°：拼图块 " + iShot.点前块角 + "° → " + iShot.点后块角 + "°，滑块=" + iShot.滑块 +
        " 读数=" + iShot.读数 + "，置灰 " + iShot.点前置灰 + " → " + iShot.点后置灰 +
        "，画布签名 " + iSigBefore + " → " + iSigAfter);

  // I2 反着来一次：只挪缺口的角度，按钮得自己从置灰里活过来
  const i2Shot = await p.evaluate(() => {
    const btn = document.getElementById("puzPieceRotMatch");
    const 置灰回填前 = btn.disabled;                    // 上一步刚对齐过，这里应该是灰的
    window.__slider("puzHoleRot", 200);
    return { 置灰回填前: 置灰回填前, 置灰回填后: btn.disabled,
             块角没动: puzSt.pieceRot, 缺口角: puzSt.holeRot };
  });
  check("I2 只改缺口角度，按钮从置灰里活过来（且没顺手改拼图块角度）",
        i2Shot.置灰回填前 === true && i2Shot.置灰回填后 === false &&
        i2Shot.块角没动 === 120 && i2Shot.缺口角 === 200,
        "置灰 " + i2Shot.置灰回填前 + " → " + i2Shot.置灰回填后 + "，缺口 " + i2Shot.缺口角 +
        "°，拼图块还是 " + i2Shot.块角没动 + "°");

  // J 自定义形状的 extent：2:1 的轮廓按原比例内切进方块 —— 宽占满、高减半、tab = 0
  const jj = await p.evaluate(() => new Promise(res => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#00ff00"; x.fillRect(64, 96, 128, 64);        // 透明底 + 2:1 的实心块
    const url = c.toDataURL("image/png");
    puzMaskLoad(url, () => {
      puzSt.shape = "custom"; puzSt.pieceShape = "same"; puzSt.shapeMaskThr = 30;
      const S = 48, E = puzExtent("hole", S), B = puzRotBox(E, 45);
      const c2 = Math.SQRT1_2;
      res({ S: S, E: E, B: B,
            // 解析式：半宽 S/2、上下半高 S/4 的矩形转 45°
            期望hw: S / 2 * c2 + (S / 4) * c2, 期望半高: (S / 4) * c2 + (S / 2) * c2,
            内切: E.hw * 2 <= S + 1e-9 && E.hhUp + E.hhDn <= S + 1e-9 });
    });
  }));
  check("J 自定义形状：2:1 轮廓内切进方块（宽占满、高减半），tab = 0",
        Math.abs(jj.E.hw - jj.S / 2) < 1e-6 && Math.abs(jj.E.hhUp - jj.S / 4) < 1e-6 &&
        Math.abs(jj.E.hhDn - jj.S / 4) < 1e-6 && jj.E.tab === 0 && jj.内切,
        "S=48 -> hw=" + jj.E.hw.toFixed(3) + " hhUp=" + jj.E.hhUp.toFixed(3) +
        " hhDn=" + jj.E.hhDn.toFixed(3) + " tab=" + jj.E.tab);
  // 容差 1e-6 而不是 1e-9：extent 是从像素量出来的（轮廓顶点存在 Float32Array 里），
  // 裁剪后的 128 实际是 128.00000008940697 —— 量出来的尺寸自带 ~1e-9 相对误差，
  // 再乘进解析式就是 6e-9 的绝对差。这不是几何算错了。
  check("J2 自定义形状转 45° 的外接框 = 解析值",
        Math.abs(jj.B.hw - jj.期望hw) < 1e-6 && Math.abs(jj.B.hhUp - jj.期望半高) < 1e-6 &&
        Math.abs(jj.B.hhDn - jj.期望半高) < 1e-6,
        "hw " + jj.B.hw.toFixed(9) + " vs " + jj.期望hw.toFixed(9) +
        "；hh " + jj.B.hhUp.toFixed(9) + " vs " + jj.期望半高.toFixed(9));
  await p.evaluate(() => { puzSt.shape = "jigsaw"; puzSt.pieceShape = "same";
    puzMaskReset(); puzSync(); });

  check("H 无 JS 报错", errs.length === 0, errs.join(" | "));

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
