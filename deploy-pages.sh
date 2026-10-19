#!/usr/bin/env bash
# 把页面发布到 GitHub Pages（gh-pages 分支），可重复执行。
#
# 注意：发布的是**源码版 captcha.html**，不是 dist/。
# build.py 会把「浏览器下载」那个降级（@DEV-START ... @DEV-END 段）剥掉 —— 剥完之后
# 没有 window.xhs 桥接的环境里点「下载 PNG」是静默无反应的。源码版自带降级，直接能跑，
# 唯一的相对依赖是 ./fonts/（7 个 woff2）。
#
# 实现上是纯 plumbing（hash-object / update-index / write-tree / commit-tree）：
# 不切分支、不开 worktree，所以重复跑不会因为「gh-pages 分支已存在」之类的原因失败 ——
# 早先用 `git checkout --orphan` 的版本只能跑一次（踩过）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP="${PAGES_TMP:-${TMPDIR:-/tmp}/captcha-pages-idx}"
REMOTE="${PAGES_REMOTE:-origin}"
BRANCH="${PAGES_BRANCH:-gh-pages}"

cd "$ROOT"
MSG="$(git log -1 --format='%h %s')"

mkdir -p "$TMP"
export GIT_INDEX_FILE="$TMP/site.index"     # 独立索引，不碰仓库自己的
rm -f "$GIT_INDEX_FILE"
git read-tree --empty

put(){                                       # put <源文件> <仓库里的路径>
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$1"),$2"
}
put "$ROOT/captcha.html" index.html
n=0
for f in "$ROOT"/fonts/*.woff2; do
  put "$f" "fonts/$(basename "$f")"
  n=$((n + 1))
done

TREE="$(git write-tree)"
SNAP="$(git commit-tree "$TREE" -m "deploy: $MSG")"
git push -f "$REMOTE" "$SNAP:refs/heads/$BRANCH"

echo "✅ $BRANCH = $SNAP（index.html + $n 个字体）"
echo "   来自本地 HEAD：$MSG"
