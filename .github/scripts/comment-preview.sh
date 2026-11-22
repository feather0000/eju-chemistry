#!/bin/bash
# Upsert a sticky PR comment with the preview URL (or a note if unpublished).
set -euo pipefail
SUBJECT="${SUBJECT:?}"
PR_NUM="${PR_NUM:?}"
PREVIEW_ROOT="${PREVIEW_ROOT:-https://feather0000.github.io/eju-preview}"
PUBLISHED="${PUBLISHED:-0}"
MARKER="<!-- eju-preview-bot -->"
BASE="${PREVIEW_ROOT}/${SUBJECT}/pr-${PR_NUM}/"

if [ "$SUBJECT" = "physics" ]; then
  LINKS="- 课程首页：${BASE}physics/
- 四科总入口（本预览里的副本）：${BASE}"
else
  LINKS="- 首页：${BASE}"
fi

if [ "$PUBLISHED" = "1" ]; then
  BODY="${MARKER}
预览已发布（测试版，带横幅，不会被搜索引擎收录）：

${LINKS}
- 预览目录：${PREVIEW_ROOT}/

正式站仍按原来的域名访问。本预览会随提交更新；PR 关闭后会自动撤下。"
else
  BODY="${MARKER}
预览构建已通过，但仓库还没有配置 \`EJU_PREVIEW_DEPLOY_KEY\`，所以没有发布到 ${PREVIEW_ROOT}/ 。构建产物已作为 workflow artifact 保存。配置密钥后重新跑一次本工作流即可发布。"
fi

# Find an existing sticky comment and update it.
api="repos/${GITHUB_REPOSITORY}/issues/${PR_NUM}/comments"
cid="$(gh api --paginate "$api" --jq '.[] | select(.body | contains("<!-- eju-preview-bot -->")) | .id' | tail -n 1 || true)"
if [ -n "${cid:-}" ]; then
  gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${cid}" -f body="$BODY" --silent
else
  gh api --method POST "$api" -f body="$BODY" --silent
fi
