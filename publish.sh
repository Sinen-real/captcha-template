#!/usr/bin/env bash
# 发布到 GitHub：
#   1) 代码 —— 只推**一个快照根提交**到 origin/master。远程永远只有 1 个 commit，
#      本地历史一个字节都不动（照样 150+ 个 commit，照常 diff / 回溯）。
#   2) 网页 —— 调 deploy-pages.sh 更新 gh-pages。
#
# 为什么用快照：仓库是公开的。当前文件树早就清干净了，但**完整历史里**还留着早期的
# 调试图和一次性文件（`git log --all --  "*.png"` 能翻到 35 条）。快照之后远程只剩一棵树，
# 没历史可翻；旧的 commit 对象变成不可达，GitHub 会在回收后清掉
# （在那之前，只有知道确切旧 SHA 的人才可能用 API 直取 blob —— 内容都是截图，不是密钥）。
#
# 用法：先正常 commit（本地该有几条就几条），再 `bash publish.sh`。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REMOTE="${PUBLISH_REMOTE:-origin}"
cd "$ROOT"

# 快照只认「已提交」的内容，工作区脏就别发布（免得把半成品传上去）
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ 工作区或暂存区有未提交的改动 —— 先提交再发布。" >&2
  exit 1
fi

HEAD_TXT="$(git log -1 --format='%h %s')"
TREE="$(git write-tree)"                                   # 当前索引 = HEAD 的树
SNAP="$(git commit-tree "$TREE" -m "snapshot: $HEAD_TXT")"  # 不带 -p：没有父提交

git push -f "$REMOTE" "$SNAP:master"
git branch -f publish "$SNAP" >/dev/null 2>&1 || true       # 留个本地 ref，方便对照远程
echo "✅ origin/master = 快照 $SNAP（本地 HEAD 是 $HEAD_TXT）"

bash "$ROOT/deploy-pages.sh"
