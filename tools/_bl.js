
const fs=require("fs"), path=require("path"), puppeteer=require("puppeteer-core");
const EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
(async()=>{
  const b=await puppeteer.launch({executablePath:EDGE,headless:"new",args:["--no-sandbox","--allow-file-access-from-files"]});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.setViewport({width:1180,height:1200,deviceScaleFactor:2});
  await p.goto("file:///D:/checkcode/captcha.html",{waitUntil:"networkidle0"});
  await p.evaluate(()=>{
    window.alert=()=>{};
    window.xhs={miniTool:{writeTempFile:o=>{window.__png=o.data;return Promise.resolve({filePath:"t"});},saveImageToPhotosAlbum:()=>Promise.resolve({})}};
    document.querySelector('#modeBar .tb-mode[data-mod="txt"]').click();
    const i=document.getElementById("txtChars"); i.value="花根"; i.dispatchEvent(new Event("input",{bubbles:true}));
  });
  // 未选中时的按钮色
  const c0 = await p.evaluate(()=>getComputedStyle(document.getElementById("tcapOk")).backgroundColor);
  await p.evaluate(()=>{ document.querySelectorAll("#tcapPhoto .tcap-ch")[0].click(); });
  await new Promise(r=>setTimeout(r,200));
  const c1 = await p.evaluate(()=>getComputedStyle(document.getElementById("tcapOk")).backgroundColor);
  console.log("未选中:", c0, "| 已选中:", c1, "| 是否一致:", c0===c1);
  await p.click("#topExport");
  await new Promise(r=>setTimeout(r,900));
  const png = await p.evaluate(()=>window.__png||null);
  if(png){ fs.writeFileSync(path.join(__dirname,"blue-export.png"), Buffer.from(png.split(",")[1],"base64")); console.log("导出 ok"); }
  console.log(errs.length? "ERRORS: "+errs.join(" | ") : "no page errors");
  await b.close();
  process.exit((errs.length || !png) ? 1 : 0);
})();
