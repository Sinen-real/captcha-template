// 校验「顶栏 + 舞台 + 底栏页签」这套外壳：
// A 各种宽度都不横向溢出        B 页签切换（只有一个 pane 可见）
// B4 「设计」页签已撤、控件各归各的页签  B5 删掉的两句提示语没留痕
// B6 分组标题统一成一套：13px 黑字 + 2px 蓝竖线   B7 滑杆行的标签不折行
// B8 文字·文案页签的次序 + 顶栏目标字括号里的文案跟着切分模式走
// K 形状行在窄屏下换行而不是被压扁；阈值标签不折行
// C 顶栏导出代理当前模式        D 顶栏还原代理当前模式
// E 搬家冒烟：关键控件都还在     F 无 JS 报错
// 用法：SHOT=1 时另存三种模式在两档宽度下的整屏截图，肉眼校对
const path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WIDTHS = [320, 375, 414, 768, 1280];

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
  const load = async (w, h) => {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto("file:///D:/checkcode/captcha.html", { waitUntil: "networkidle0" });
    await p.evaluate(() => { window.alert = () => {};
      window.__png = null;
      window.xhs = { miniTool: { writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
                                 saveImageToPhotosAlbum: () => Promise.resolve({}) } }; });
    await new Promise(r => setTimeout(r, 200));
  };
  const toMode = async mod => {
    await p.evaluate(m => document.querySelector('.tb-mode[data-mod="' + m + '"]').click(), mod);
    await new Promise(r => setTimeout(r, 250));
  };

  console.log("\n外壳与底栏页签：");

  // A 各种宽度 × 三种模式都不横向溢出
  await load(1280, 900);
  const bad = [];
  for (const w of WIDTHS){
    for (const mod of ["img", "txt", "puz"]){
      await p.setViewport({ width: w, height: 780, deviceScaleFactor: 1 });
      await toMode(mod);
      const r = await p.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        body: document.body.scrollWidth
      }));
      if (r.sw > r.cw + 1 || r.body > r.cw + 1) bad.push(mod + "@" + w + " " + r.sw + "/" + r.cw);
    }
  }
  check("A 三种模式 × " + WIDTHS.join("/") + " 都不横向溢出", bad.length === 0, bad.join("  ") || "全部 ok");

  // B 页签：点谁谁在最前，且只有一个 pane 可见
  await load(375, 780);
  const tabReport = [];
  for (const mod of ["img", "txt", "puz"]){
    await toMode(mod);
    const n = await p.evaluate(() => document.querySelectorAll("#panel" + (curMod === "img" ? "Img" : curMod === "txt" ? "Txt" : "Puz") + " .dock-tab").length);
    for (let i = 0; i < n; i++){
      const r = await p.evaluate(i => {
        const dk = document.querySelector(".layout:not([style*='none']) .dock");
        dk.querySelectorAll(".dock-tab")[i].click();
        return {
          onTab: [...dk.querySelectorAll(".dock-tab")].findIndex(b => b.classList.contains("on")),
          shown: [...dk.querySelectorAll(".dock-pane")].filter(x => getComputedStyle(x).display !== "none").map(x => x.dataset.tab),
          onPane: [...dk.querySelectorAll(".dock-pane.on")].map(x => x.dataset.tab),
          scrollTop: dk.querySelector(".dock-body").scrollTop
        };
      }, i);
      const okOne = r.shown.length === 1 && r.onPane.length === 1 && r.shown[0] === r.onPane[0] && r.onTab === i;
      if (!okOne) tabReport.push(mod + " #" + i + " " + JSON.stringify(r));
    }
  }
  check("B 页签切换：点谁谁在最前，且只有一个内容区可见", tabReport.length === 0, tabReport.join(" | ") || "三种模式逐个点过");

  // B2 页签与内容区一一对应、且都不为空
  //    （搬家时多写一个 </div>，整块内容会被 HTML 解析器丢掉，而且不报错）
  const mismatch = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll(".layout").forEach(l => {
      l.querySelectorAll(".dock").forEach(dk => {
        const tabs = [...dk.querySelectorAll(".dock-tab")].map(b => b.dataset.tab);
        const panes = [...dk.querySelectorAll(".dock-pane")].map(p => p.dataset.tab);
        if (tabs.length !== panes.length || tabs.some(t => panes.indexOf(t) < 0))
          out.push(l.id + " 页签[" + tabs.join("/") + "] 对不上内容区[" + panes.join("/") + "]");
        [...dk.querySelectorAll(".dock-pane")].forEach(pd => {
          if (pd.children.length === 0) out.push(l.id + ":" + pd.dataset.tab + " 是空的");
        });
      });
    });
    return out;
  });
  check("B2 页签与内容区一一对应且非空", mismatch.length === 0, mismatch.join("  ") || "三个面板都对齐");

  // B4 「设计」页签撤了：顶栏背景 / 选中角标 并进「图标」，动画那组并进「素材」。
  //    撤页签最容易撤出一堆孤儿控件 —— 元素还在，但哪个页签都够不着，JS 会静默跳过、最难查。
  //    所以这里钉的是「归属到哪个页签」，不只看元素在不在。
  await toMode("img");
  const moved = await p.evaluate(() => {
    const l = document.querySelector(".layout:not([style*='none'])");
    const where = el => { const pd = el && el.closest(".dock-pane"); return pd ? pd.dataset.tab : "(不在任何页签里)"; };
    const tog = l.querySelector(".rc-tog");
    const col = tog && tog.closest(".dock-col");
    const sub = col && col.querySelector("h3");       // 统一之后「动画」就是普通分组标题了
    return { 页签: [...l.querySelectorAll(".dock-tab")].map(b => b.dataset.tab).join("/"),
             顶栏背景: where(document.getElementById("headColor")),
             选中角标: where(document.getElementById("badgeImgBtn")),
             点按凹入: where(document.getElementById("pressToggle")),
             前置开关: where(tog),
             前置小标题: sub ? sub.textContent.trim() : "(没找到标题)",
             前置小标题标签: sub ? sub.tagName : "" };
  });
  check("B4 「设计」页签已撤，控件各归各的页签",
        moved.页签.indexOf("design") < 0 && moved.顶栏背景 === "icon" && moved.选中角标 === "icon" &&
        moved.点按凹入 === "mat" && moved.前置开关 === "mat" &&
        moved.前置小标题 === "动画" && moved.前置小标题标签 === "H3",
        "页签[" + moved.页签 + "]；顶栏背景→" + moved.顶栏背景 + "，选中角标→" + moved.选中角标 +
        "，点按凹入→" + moved.点按凹入 + "，前置开关→" + moved.前置开关 +
        "（开关上面那个标题：" + moved.前置小标题标签 + "「" + moved.前置小标题 + "」）");

  // B5 用户点名删掉的两句提示语：不能以任何形式留在可见文本里。
  //    只扫文本节点、跳过 <script> —— 代码注释里还留着一句「宽度固定 320」是刻意的（它说的是实现，不是提示）
  const left = await p.evaluate(() => {
    const walk = n => {
      if (n.nodeType === 3) return n.nodeValue;
      if (n.nodeType !== 1) return "";
      if (n.tagName === "SCRIPT" || n.tagName === "STYLE") return "";
      return [...n.childNodes].map(walk).join(" ");
    };
    const hay = walk(document.body);
    return ["宽度固定 320", "和缺口的角度可以不一样"].filter(s => hay.indexOf(s) >= 0);
  });
  check("B5 删掉的两句提示语没留在页面文本里", left.length === 0,
        left.join(" / ") || "「宽度固定 320…」「和缺口的角度可以不一样…」都不在了");

  // B6 分组标题统一：三种模式翻遍每个页签，所有 h3 都得是同一套（13px / 黑字 / 2px 蓝竖线）。
  //    一起数一下总数 —— 样式断言最容易变成「一个都没扫到，所以全绿」。
  const styleBad = [];
  let seenHeads = 0;
  for (const mod of ["img", "txt", "puz"]){
    await toMode(mod);
    const n = await p.evaluate(() => document.querySelectorAll(".layout:not([style*='none']) .dock-tab").length);
    for (let i = 0; i < n; i++){
      const r = await p.evaluate(i => {
        const dk = document.querySelector(".layout:not([style*='none']) .dock");
        dk.querySelectorAll(".dock-tab")[i].click();
        const out = [];
        dk.querySelectorAll(".dock-pane.on h3").forEach(h => {
          if (getComputedStyle(h).display === "none") return;
          const b = getComputedStyle(h, "::before");
          out.push({ 文字: h.textContent.trim(), 字号: getComputedStyle(h).fontSize,
                     颜色: getComputedStyle(h).color, 条宽: b.width, 条色: b.backgroundColor });
        });
        return out;
      }, i);
      r.forEach(x => {
        seenHeads++;
        if (x.字号 !== "13px" || x.颜色 !== "rgb(0, 0, 0)" ||
            x.条宽 !== "2px" || x.条色 !== "rgb(26, 115, 232)")
          styleBad.push(mod + " 第" + (i + 1) + "个页签「" + x.文字 + "」" + JSON.stringify(x));
      });
    }
  }
  check("B6 分组标题统一：13px / 黑字 / 2px 蓝竖线", styleBad.length === 0 && seenHeads >= 20,
        styleBad.slice(0, 3).join("  ") ||
        "三种模式共 " + seenHeads + " 个标题，全是同一套样式");

  // B7 .puz-line 的标签是固定窄列（52px / flex:none），超过 4 个中文字就折成两行、
  //    把那一行撑得比邻居高（「拼图块角度」就是这么折的，改成「角度」才对）。
  //    跟视口宽度无关 —— 固定列宽，不会被滑块或按钮挤。一行的高度现测，不写死阈值。
  await load(375, 780);
  await toMode("puz");
  const oneLineH = await p.evaluate(() => {
    const line = document.querySelector(".layout:not([style*='none']) .dock-pane.on .puz-line");
    const probe = document.createElement("span");
    probe.textContent = "字";
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:12px;font-family:inherit";
    line.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    line.removeChild(probe);
    return h;
  });
  const wrapBad = [];
  let seenLabels = 0;
  for (const tab of ["hole", "piece"]){
    const ls = await p.evaluate(t => {
      const dk = document.querySelector(".layout:not([style*='none']) .dock");
      dk.querySelectorAll(".dock-tab").forEach(b => { if (b.dataset.tab === t) b.click(); });
      return [...dk.querySelectorAll(".dock-pane.on .puz-line > label")]
        .map(l => ({ 文字: l.textContent.trim(), 高: l.getBoundingClientRect().height }));
    }, tab);
    ls.forEach(x => {
      seenLabels++;
      if (x.高 > oneLineH * 1.5)
        wrapBad.push("「" + x.文字 + "」高 " + x.高.toFixed(1) + "px，一行是 " + oneLineH.toFixed(1) + "px");
    });
  }
  check("B7 滑杆行的标签都不折行", wrapBad.length === 0 && seenLabels >= 10,
        wrapBad.join("  ") || "缺口 / 拼图块两个页签共 " + seenLabels + " 个标签，全是一行");

  // B8 文字·「文案」页签的次序：双模式 -> 三栏（顶栏目标字 / 额外字 / 隐藏的目标字）
  //    -> 手动拖动和两支歪斜 -> 重新排布 -> 提示文字。
  //    顶栏目标字那个括号里的文案得跟着单字 / 词组模式换，所以它是个 span 而不是写死的标签。
  await load(430, 900);
  await toMode("txt");
  const ordered = await p.evaluate(() => {
    const dk = document.querySelector(".layout:not([style*='none']) .dock");
    dk.querySelectorAll(".dock-tab").forEach(b => { if (b.dataset.tab === "text") b.click(); });
    const pane = dk.querySelector('.dock-pane[data-tab="text"]');
    const keys = ["#txtSplit", "#txtChars", "#txtExtra", "#txtHidden",
                  "#tcapDrag", "#tcapTopSkew", "#tcapSkew", "#txtShuffle"];
    const tops = keys.map(k => {
      const el = pane.querySelector(k);
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    });
    const tipH = [...pane.querySelectorAll("h3")].find(h => h.textContent.trim() === "提示文字");
    const hint = document.getElementById("txtCharHint");
    const 单字文案 = hint ? hint.textContent : null;
    const 在标签里 = hint ? hint.tagName === "SPAN" && !!hint.closest("label") : false;
    dk.querySelector('#txtSplit .mode-btn[data-split="word"]').click();
    const 词组文案 = hint ? hint.textContent : null;
    dk.querySelector('#txtSplit .mode-btn[data-split="char"]').click();     // 切回来，别影响后面的
    return { tops: tops,
             单字文案: 单字文案, 词组文案: 词组文案, 在标签里: 在标签里,
             提示文字是h3: !!tipH,
             提示文字在最下: tipH && tops[tops.length - 1] !== null &&
                             Math.round(tipH.getBoundingClientRect().top) > tops[tops.length - 1] };
  });
  const 递增 = ordered.tops.every((t, i, a) => t !== null && (i === 0 || t > a[i - 1]));
  check("B8 文案页签次序对，且顶栏目标字括号里的文案跟着切分模式走",
        递增 && ordered.提示文字是h3 && ordered.提示文字在最下 && ordered.在标签里 &&
        ordered.单字文案 !== ordered.词组文案 &&
        ordered.单字文案.indexOf("字数不限") >= 0 &&
        ordered.词组文案.indexOf("空格分词") >= 0,
        "各段 top " + ordered.tops.join(" < ") + "；提示文字 h3=" + ordered.提示文字是h3 +
        " 在最下=" + ordered.提示文字在最下 + "；括号里那句话在标签里=" + ordered.在标签里 +
        "，单字「" + ordered.单字文案 + "」词组「" + ordered.词组文案 + "」");

  // K 形状行：拼图块那一栏固定**两排**（5 个预设在第一排；「跟随缺口」「自定义」并排在第二排），
  //    按钮不能被压扁。.mode-switch 默认是 flex 不换行、每个按钮 flex:1 —— 6~7 个按钮在 320px 下
  //    会被压到 30 多 px、文字挤爆；而「压扁」**不会**横向溢出，所以 A 那项抓不到，得单独量。
  //    顺带验两侧「自定义」各是各的一块（只选一侧就只露那一块）。
  const shapeBad = [];
  for (const [w, h] of [[320, 900], [375, 900]]){
    await load(w, h);
    await toMode("puz");
    // 量一个 12px 标签「一行」有多高（不写死阈值，和 B7 一个套路）
    const oneLine = await p.evaluate(() => {
      const line = document.querySelector(".layout:not([style*='none']) .dock-pane.on .puz-line");
      const probe = document.createElement("span");
      probe.textContent = "字";
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:12px;font-family:inherit";
      line.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      line.removeChild(probe);
      return h;
    });
    const r = await p.evaluate(() => {
      const dk = document.querySelector(".layout:not([style*='none']) .dock");
      const tab = t => dk.querySelectorAll(".dock-tab").forEach(b => { if (b.dataset.tab === t) b.click(); });
      // 量「文字有没有被挤出按钮」时先藏掉角标：.nb-corner 是绝对定位、故意探出去一截，
      // 会把 scrollWidth 撑大，跟「文字挤爆」是两回事
      const info = id => {
        const btns = [...document.querySelectorAll("#" + id + " .mode-btn")];
        const nbs = btns.map(b => b.querySelector(".nb"));
        nbs.forEach(n => { if (n) n.style.display = "none"; });
        const out = btns.map(b => ({
          文字: b.textContent.trim(), 宽: Math.round(b.getBoundingClientRect().width),
          顶: Math.round(b.getBoundingClientRect().top),
          溢出: b.scrollWidth - b.clientWidth }));
        nbs.forEach(n => { if (n) n.style.display = ""; });
        return out;
      };
      const lab = sel => {
        const el = document.querySelector(sel + " .puz-line > label");
        return el ? { 文字: el.textContent.trim(), 高: el.getBoundingClientRect().height } : null;
      };
      const show = () => ({ hole: document.getElementById("puzShapeCustom").style.display,
                            piece: document.getElementById("puzPieceShapeCustom").style.display });

      puzSt.shape = "jigsaw"; puzSt.pieceShape = "same"; puzSync();
      const 都隐藏 = show();
      puzSt.shape = "custom"; puzSync();                 // 只缺口选自定义
      const 只缺口 = show();
      tab("hole");
      const 缺口行 = info("puzShape"), 缺口标签 = lab("#puzShapeCustom");
      puzSt.pieceShape = "custom"; puzSync();            // 拼图块也选自定义
      const 两侧 = show();
      tab("piece");
      const 块行 = info("puzPieceShape"), 拼图块标签 = lab("#puzPieceShapeCustom");
      return { 都隐藏: 都隐藏, 只缺口: 只缺口, 两侧: 两侧, 缺口行: 缺口行, 块行: 块行,
               缺口标签: 缺口标签, 拼图块标签: 拼图块标签,
               横向溢出: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    if (r.缺口行.length !== 6) shapeBad.push(w + " 缺口行的形状按钮 " + r.缺口行.length + " 个（应 6）");
    if (r.块行.length !== 7) shapeBad.push(w + " 拼图块行的形状按钮 " + r.块行.length + " 个（应 7）");
    if (r.都隐藏.hole !== "none" || r.都隐藏.piece !== "none") shapeBad.push(w + " 没选自定义却露出了形状图块");
    if (r.只缺口.hole === "none") shapeBad.push(w + " 缺口选了自定义但没露出它自己那块");
    if (r.只缺口.piece !== "none") shapeBad.push(w + " 只有缺口选了自定义，拼图块那块却也露出来了");
    if (r.两侧.hole === "none" || r.两侧.piece === "none") shapeBad.push(w + " 两侧都选自定义时应各露一块");
    r.缺口行.concat(r.块行).forEach(b => {
      if (b.溢出 > 1) shapeBad.push(w + "px「" + b.文字 + "」文字溢出 " + b.溢出 + "px");
      if (b.宽 < 34) shapeBad.push(w + "px「" + b.文字 + "」太窄（" + b.宽 + "px）");
    });
    const tops = r.块行.map(b => b.顶), 第一排 = tops.slice(0, 5), 第二排 = tops.slice(5);
    const 同排 = a => a.every(t => t === a[0]);
    if (!(同排(第一排) && 同排(第二排) && 第二排[0] > 第一排[0]))
      shapeBad.push(w + " 拼图块形状行不是「5 个预设一排 + 跟随缺口/自定义 一排」：" + tops.join(","));
    [["缺口", r.缺口标签], ["拼图块", r.拼图块标签]].forEach(pair => {
      const l = pair[1];
      if (!l || l.文字 !== "阈值") shapeBad.push(w + " " + pair[0] + "那块的阈值标签是「" + (l && l.文字) + "」");
      else if (l.高 > oneLine * 1.5) shapeBad.push(w + " " + pair[0] + "的阈值标签折行了（高 " + l.高.toFixed(1) + "）");
    });
    if (r.横向溢出) shapeBad.push(w + "px 横向溢出了");
    await p.evaluate(() => { puzSt.shape = "jigsaw"; puzSt.pieceShape = "same"; puzSync(); });
  }
  check("K 形状行：拼图块两排、按钮不被压扁；两侧「自定义」各是各的一块", shapeBad.length === 0,
        shapeBad.slice(0, 4).join("  ") ||
        "320/375 两档：缺口 6 个 + 拼图块 5+2 两排，文字无溢出；只选一侧就只露那一块，阈值标签一行");

  // B3 底栏高度固定：切页签不该让底栏忽高忽低（否则预览会跟着重算缩放、看着一跳一跳）
  const dockH = [];
  for (const mod of ["img", "txt", "puz"]){
    await toMode(mod);
    const hs = await p.evaluate(() => {
      const dk = document.querySelector(".layout:not([style*='none']) .dock");
      const out = [];
      dk.querySelectorAll(".dock-tab").forEach(t => { t.click(); out.push(Math.round(dk.getBoundingClientRect().height)); });
      return out;
    });
    const uniq = hs.filter((v, i) => hs.indexOf(v) === i);
    dockH.push(mod + "=" + (uniq.length === 1 ? "恒定 " + uniq[0] : "不齐 " + hs.join("/")));
  }
  check("B3 底栏高度固定（切页签不跳）", dockH.every(x => x.indexOf("恒定") > 0), dockH.join("  "));

  // C 顶栏「导出」代理当前模式（各模式的成品尺寸不同，能区分出来）
  await load(375, 780);
  const sizes = {};
  for (const mod of ["img", "txt", "puz"]){
    await toMode(mod);
    await p.evaluate(() => document.getElementById("topExport").click());
    await new Promise(r => setTimeout(r, 400));
    sizes[mod] = await p.evaluate(() => {
      const img = new Image();
      return new Promise(res => { img.onload = () => res([img.width, img.height]); img.src = window.__png; });
    });
  }
  check("C 顶栏导出代理当前模式",
        sizes.img && sizes.txt && sizes.puz &&
        sizes.img.join() !== sizes.puz.join() && sizes.txt.join() !== sizes.puz.join(),
        Object.entries(sizes).map(([k, v]) => k + " " + v.join("×")).join("  "));

  // D 顶栏「还原」代理当前模式（还原现在要先过一次确认弹窗，见 _confirm.js）
  await toMode("puz");
  await p.evaluate(() => {
    const e = document.getElementById("puzSize"); e.value = 70;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("topReset").click();
  });
  await new Promise(r => setTimeout(r, 150));
  await p.click("#confirmOk");
  await new Promise(r => setTimeout(r, 250));
  const restored = await p.evaluate(() => document.getElementById("puzSize").value);
  check("D 顶栏还原代理当前模式", restored === "48", "拼图块大小 70 → " + restored);

  // E 搬家冒烟：关键控件还在、且点得到（元素丢了 JS 会静默跳过，最难查）
  const IDS = ["gridOpts", "upload", "uploadMode", "btnShuffle", "modeSwitch",
               "rowPre", "rowTarget", "rowPost", "rowLine2", "headColor", "btnText",
               "btnColorCtl", "iconRow", "pressToggle",       // 前置开关已是 .rc-tog（见 _robot.js）
               "txtBgBtn", "txtChars", "txtSplit", "fxRow", "fxFill", "badgeMode", "tcapIconRow", "txtOkText",
               "puzUpload", "puzPhotoH", "puzSize", "puzHoleColor", "puzHoleEdge", "puzPieceUpload",
               "puzGlow", "puzTitleRt", "puzHandleColor", "puzTrackColor", "puzHandleImg", "puzTrackImg", "puzIconRow"];
  const missing = [];
  for (const mod of ["img", "txt", "puz"]){
    await toMode(mod);
    // 逐个页签翻过去，控件得能看见
    const n = await p.evaluate(() => document.querySelectorAll(".layout:not([style*='none']) .dock-tab").length);
    const seen = new Set();
    for (let i = 0; i < n; i++){
      const vis = await p.evaluate(i => {
        const dk = document.querySelector(".layout:not([style*='none']) .dock");
        dk.querySelectorAll(".dock-tab")[i].click();
        const out = [];
        dk.querySelectorAll(".dock-body [id]").forEach(el => { if (el.getBoundingClientRect().height > 0) out.push(el.id); });
        return out;
      }, i);
      vis.forEach(v => seen.add(v));
    }
    const gone = await p.evaluate(ids => ids.filter(id => !document.getElementById(id)), IDS);
    gone.forEach(id => missing.push(mod + ":" + id + "(元素没了)"));
    // 该模式自己的控件必须在某个页签里出现过
    const own = { img: ["gridOpts","upload","rowPre","iconRow"],
                  txt: ["txtBgBtn","txtChars","fxRow","tcapIconRow","txtOkText"],
                  puz: ["puzUpload","puzSize","puzPieceUpload","puzGlow","puzIconRow"] }[mod];
    for (const id of own) if (!seen.has(id)) missing.push(mod + ":" + id + "(没在任何页签里露面)");
  }
  check("E 搬家冒烟：关键控件都在且可见", missing.length === 0, missing.join("  ") || IDS.length + " 个 id 全在");

  // G 小屏上的裁剪弹窗：不能把「确认裁剪」顶出屏幕（这个弹窗是所有上传的必经之路）
  await load(320, 480);
  const crop = await p.evaluate(() => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      openCrop(im, im.src, { ratio: 1, outW: 608, outH: 608, title: "测试", onDone: () => {} });
      setTimeout(() => {
        const modal = document.getElementById("cropModal");
        const ok = document.getElementById("cropOk");
        const r = ok.getBoundingClientRect();
        res({ modalH: modal.clientHeight, contentH: modal.scrollHeight,
              canScroll: modal.scrollHeight > modal.clientHeight,
              okTop: Math.round(r.top), okBottom: Math.round(r.bottom), vh: window.innerHeight });
      }, 60);
    };
    const c = document.createElement("canvas"); c.width = 800; c.height = 800;
    const x = c.getContext("2d"); x.fillStyle = "#888"; x.fillRect(0, 0, 800, 800);
    im.src = c.toDataURL("image/png");
  }));
  check("G 小屏裁剪弹窗不丢按钮",
        crop.contentH <= crop.modalH + 1 || (crop.canScroll && crop.okBottom > 0),
        "内容 " + crop.contentH + " / 可视 " + crop.modalH + (crop.canScroll ? "（可滚）" : "") +
        "，确认按钮 " + crop.okTop + "~" + crop.okBottom + " / 视口 " + crop.vh);

  // H 手机尺寸下预览卡要整张露出来（用户反馈「展示不全」）
  const notFit = [];
  for (const [w, h] of [[375, 667], [414, 896], [360, 640]]){
    await load(w, h);
    for (const mod of ["img", "txt", "puz"]){
      await toMode(mod);
      const r = await p.evaluate(() => {
        const l = document.querySelector(".layout:not([style*='none'])");
        const st = l.querySelector(".stage");
        const card = st.querySelector(".challenge, .tcap, .puz-canvas");
        const a = st.getBoundingClientRect(), b = card.getBoundingClientRect();
        return { sh: Math.round(a.height), ch: Math.round(b.height),
                 fits: b.height <= a.height + 1 && b.bottom <= a.bottom + 1,
                 tf: card.style.transform || "none" };
      });
      if (!r.fits) notFit.push(mod + "@" + w + "×" + h + " 卡 " + r.ch + " / 舞台 " + r.sh);
    }
  }
  check("H 手机尺寸下预览卡整张可见", notFit.length === 0, notFit.join("  ") || "375/414/360 三种模式都放得下");

  // I 桌面够高时不缩放（别把大屏的预览也缩小了）
  await load(1280, 1000);
  const desk = await p.evaluate(() => {
    const l = document.querySelector(".layout:not([style*='none'])");
    const card = l.querySelector(".challenge");
    return { tf: card.style.transform || "none", ch: Math.round(card.getBoundingClientRect().height),
             oh: card.offsetHeight };
  });
  check("I 桌面够高就不缩放", desk.tf === "none" && Math.abs(desk.ch - desk.oh) <= 1,
        "transform=" + desk.tf + "，卡高 " + desk.ch);

  // J 电脑端 == 手机端：同一套尺寸，只差一个居中偏移。
  //   取 430（.app 的上限宽）和 1440 比 —— 宽度一样，所有几何都该逐项相等；
  //   一旦有人给桌面又加回两列 / 单独的高度，这条立刻红
  const shape = async (w, h) => {
    await load(w, h);
    return p.evaluate(() => {
      const l = () => document.querySelector(".layout:not([style*='none'])");
      const box = el => { const r = el.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; };
      return {
        app: box(document.querySelector(".app")),
        顶栏: box(document.querySelector(".topbar")),
        舞台: box(l().querySelector(".stage")),
        底栏: box(l().querySelector(".dock")),
        卡片: box(l().querySelector(".challenge")),
        页签: [...l().querySelectorAll(".dock-tab")].map(t => Math.round(t.getBoundingClientRect().width)),
        列数: l().querySelectorAll(".dock-pane.on .dock-col").length,
        // 同一页签里第二个 dock-col 的 top 大于第一个 = 竖着排（单列），相等 = 并排（两列）
        竖排: (() => { const c = [...l().querySelectorAll(".dock-pane.on .dock-col")];
          return c.length < 2 || c[1].getBoundingClientRect().top > c[0].getBoundingClientRect().bottom - 1; })()
      };
    });
  };
  const phone = await shape(430, 900), wide = await shape(1440, 900);
  const diff = Object.keys(phone).filter(k => JSON.stringify(phone[k]) !== JSON.stringify(wide[k]));
  check("J 电脑端与手机端几何完全一致（只差居中偏移）",
        diff.length === 0 && phone.竖排 === true,
        (diff.length ? "不一致：" + diff.map(k => k + " " + JSON.stringify(phone[k]) + " vs " + JSON.stringify(wide[k])).join("；")
                     : "430 与 1440 逐项相同") +
        "；单列竖排=" + phone.竖排 + "（两列并排时为 false）");

  check("F 无 JS 报错", errs.length === 0, errs.join(" | "));

  if (process.env.SHOT){
    for (const [w, h] of [[375, 780], [1280, 900]]){
      await load(w, h);
      for (const mod of ["img", "txt", "puz"]){
        await toMode(mod);
        await p.screenshot({ path: path.join(__dirname, "_ui_" + w + "-" + mod + ".png") });
      }
    }
    console.log("（已另存 tools/_ui_<宽>-<模式>.png）");
  }

  console.log("\n" + (fail ? "❌ " + fail + " 项未过" : "✅ 全部通过") + "（" + (pass + fail) + " 项）");
  await b.close();
  process.exit(fail ? 1 : 0);
})();
