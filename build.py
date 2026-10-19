#!/usr/bin/env python3
"""Build mini-tool artifact: externalize inline script -> assets/main.js, emit dist/ + tool.zip."""
from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "captcha.html"
DIST = ROOT / "dist"
ZIP_PATH = ROOT / "tool.zip"


def build() -> None:
    html = SRC.read_text(encoding="utf-8")

    # 抽取内联脚本（容器 CSP 禁止内联 <script>）
    m = re.search(r"<script>(.*?)</script>", html, re.S)
    if not m:
        raise SystemExit("no inline <script> found")
    script = m.group(1)

    # 剥掉本地调试专用段（@DEV-START ... @DEV-END）：
    # 里面有浏览器直下的 a[download]，容器规范禁止，只在源码里保留
    dev_re = re.compile(r"/\* @DEV-START.*?@DEV-END \*/", re.S)
    stripped = len(dev_re.findall(script))
    script = dev_re.sub("", script)

    # 用外链脚本替换
    html = html[: m.start()] + '<script src="./assets/main.js"></script>' + html[m.end():]

    # 源码里字体引用 ./fonts/（直接打开 captcha.html 也能加载），
    # 产物里统一放到 assets/fonts/，这里重写路径
    html = html.replace("url('./fonts/", "url('./assets/fonts/")

    # 清理 dist
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)

    (DIST / "index.html").write_text(html, encoding="utf-8")
    (DIST / "assets" / "main.js").write_text(script, encoding="utf-8")

    # 复制本地字体（@font-face 引用 ./assets/fonts/*.woff2）
    fonts_src = ROOT / "fonts"
    if fonts_src.is_dir():
        dst = DIST / "assets" / "fonts"
        dst.mkdir(parents=True, exist_ok=True)
        for f in sorted(fonts_src.glob("*.woff2")):
            shutil.copy2(f, dst / f.name)

    # 打包：压缩 dist 的“内容”，保证 index.html 在 zip 根目录
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(DIST.rglob("*")):
            if f.is_file() and ".DS_Store" not in f.name:
                z.write(f, f.relative_to(DIST).as_posix())

    print(f"built {DIST}")
    print(f"built {ZIP_PATH}")


if __name__ == "__main__":
    build()
