// 校验「打包产物」本身能否跑起来：外链脚本、字体路径重写、两个面板、导出。
// 与 captcha.html 的测试不同，这里加载的是 dist/index.html（真实交付物）。
const fs = require("fs"), path = require("path"), puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new",
    args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage();
  const errs = [], failed = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("requestfailed", r => failed.push(r.url()));
  // 记录字体请求，确认 ./assets/fonts/ 重写生效
  const fontReqs = [];
  p.on("response", r => { if (/\.woff2$/.test(r.url())) fontReqs.push(r.url().split("/").pop() + ":" + r.status()); });

  await p.setViewport({ width: 1180, height: 1200, deviceScaleFactor: 2 });
  await p.goto("file:///D:/checkcode/dist/index.html", { waitUntil: "networkidle0" });
  await p.evaluate(() => {
    window.alert = () => {};
    window.xhs = { miniTool: {
      writeTempFile: o => { window.__png = o.data; return Promise.resolve({ filePath: "t" }); },
      saveImageToPhotosAlbum: () => Promise.resolve({}) } };
  });
  await new Promise(r => setTimeout(r, 400));

  // 1. 外链脚本是否真的执行了（DOM 由 JS 填充）
  const boot = await p.evaluate(() => ({
    格数: document.querySelectorAll("#grid .cell").length,
    图标: document.querySelectorAll("#footIcons svg").length,
    字效行: document.querySelectorAll("#fxRow .fx-chip").length,
    面板数: document.querySelectorAll(".layout").length,
    版本: (document.querySelector(".app-foot") || {}).textContent || "",
  }));
  console.log("启动:", JSON.stringify(boot));

  // 2. 字体是否真的加载（file:// + 重写后的相对路径）
  const fonts = await p.evaluate(async () => {
    try { await document.fonts.ready; } catch (e) {}
    return [...document.fonts].filter(f => f.status === "loaded").map(f => f.family + "/" + f.weight);
  });
  console.log("已加载字体:", JSON.stringify([...new Set(fonts)]));

  // 3. 图片验证码导出
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 1000));
  const png1 = await p.evaluate(() => window.__png || null);
  if (png1) fs.writeFileSync(path.join(__dirname, "dist-img-export.png"), Buffer.from(png1.split(",")[1], "base64"));

  // 4. 文字验证码：切面板 + 输入 + 导出
  await p.evaluate(() => {
    window.__png = null;
    document.querySelector('#modeBar .tb-mode[data-mod="txt"]').click();
    const i = document.getElementById("txtChars"); i.value = "花根花"; i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));
  const tcap = await p.evaluate(() => ({
    顶栏目标: document.querySelectorAll("#tcapTargets .tt").length,
    图里字: document.querySelectorAll("#tcapPhoto .tcap-ch").length,
  }));
  console.log("文字验证码:", JSON.stringify(tcap));
  await p.click("#topExport");
  await new Promise(r => setTimeout(r, 1200));
  const png2 = await p.evaluate(() => window.__png || null);
  if (png2) fs.writeFileSync(path.join(__dirname, "dist-txt-export.png"), Buffer.from(png2.split(",")[1], "base64"));

  // 5. 自定义形状：这条路径要 getImageData 读像素，容器里万一 CSP / 权限把 canvas 像素读挡了，
  //    源码里跑得好好的、产物里会挂 —— 所以必须在产物里也走一遍「上传形状图 -> 抠轮廓 -> 渲染」。
  const custom = await p.evaluate(() => new Promise(res => {
    document.querySelector('#modeBar .tb-mode[data-mod="puz"]').click();
    setTimeout(() => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const x = c.getContext("2d");
      x.fillStyle = "#ff00ff"; x.fillRect(64, 96, 128, 64);      // 透明底 + 2:1 的实心块
      const url = c.toDataURL("image/png");
      puzSt.shape = "custom"; puzSt.shapeMaskThr = 30;
      puzMaskLoad(url, ok => {
        const m = puzMaskAt(30);
        const warn = document.getElementById("puzMaskWarn").style.display;
        res({ 读像素: ok, 有轮廓: !!m, 裁剪: m ? Math.round(m.bw) + "×" + Math.round(m.bh) : "-",
              顶点: m ? m.verts : 0, 提示: warn });
      });
    }, 200);
  }));
  console.log("自定义形状:", JSON.stringify(custom));
  const customOk = custom.读像素 === true && custom.有轮廓 === true && custom.顶点 > 3 && custom.提示 === "none";

  console.log("字体请求:", JSON.stringify(fontReqs));
  console.log("导出:", png1 ? "图片验证码 OK" : "图片验证码 失败", "/", png2 ? "文字验证码 OK" : "文字验证码 失败");
  console.log("请求失败:", failed.length ? failed.join(" | ") : "无");
  console.log(errs.length ? "ERRORS: " + errs.join(" | ") : "no page errors");
  await b.close();
  process.exit((errs.length || failed.length || !png1 || !png2 || !customOk) ? 1 : 0);
})();
