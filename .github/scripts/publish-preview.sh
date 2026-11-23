#!/bin/bash
# Publish or remove this subject's PR preview on feather0000/eju-preview.
# Requires EJU_PREVIEW_DEPLOY_KEY (write deploy key for that repo only).
set -euo pipefail
# Never print the key.
set +o xtrace

ACTION="${1:-publish}"
SUBJECT="${SUBJECT:?}"
PR_NUM="${PR_NUM:?}"
DEST_REL="${SUBJECT}/pr-${PR_NUM}"

if [ -z "${EJU_PREVIEW_DEPLOY_KEY:-}" ]; then
  echo "EJU_PREVIEW_DEPLOY_KEY is empty" >&2
  exit 1
fi

KEYDIR="$(mktemp -d)"
cleanup() { rm -rf "$KEYDIR" "${WORK:-}"; }
trap cleanup EXIT
# Accept keys stored with or without a trailing newline.
printf '%s' "$EJU_PREVIEW_DEPLOY_KEY" > "$KEYDIR/id"
# OpenSSH private keys must end with a newline.
if [ "$(tail -c1 "$KEYDIR/id" | wc -l)" -eq 0 ]; then
  printf '\n' >> "$KEYDIR/id"
fi
chmod 600 "$KEYDIR/id"
export GIT_SSH_COMMAND="ssh -i $KEYDIR/id -o IdentitiesOnly=yes -o UserKnownHostsFile=$KEYDIR/known_hosts -o StrictHostKeyChecking=accept-new"

ITEMS=(index.html 404.html robots.txt topics assets physics claude explorer)

publish_once() {
  local repo="$1"
  rm -rf "$repo"
  git clone --depth 20 git@github.com:feather0000/eju-preview.git "$repo"
  if [ -f "$repo/CNAME" ]; then
    echo "Refusing to publish: eju-preview unexpectedly has a CNAME file." >&2
    exit 1
  fi
  if [ "$ACTION" = "cleanup" ]; then
    if [ ! -e "$repo/$DEST_REL" ]; then
      echo "Nothing to remove at $DEST_REL"
      return 0
    fi
    rm -rf "$repo/$DEST_REL"
  else
    mkdir -p "$repo/$DEST_REL"
    # Clear previous files in this PR dir, then copy the current preview tree.
    find "$repo/$DEST_REL" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    for p in "${ITEMS[@]}"; do
      if [ -e "$p" ]; then
        cp -a "$p" "$repo/$DEST_REL/"
      fi
    done
  fi
  python3 "$repo/rebuild_index.py"
  if [ -f "$repo/CNAME" ]; then
    echo "Refusing to publish: rebuild wrote a CNAME file." >&2
    exit 1
  fi
  git -C "$repo" add -A
  if git -C "$repo" diff --cached --quiet; then
    echo "No preview changes to push."
    return 0
  fi
  git -C "$repo" -c user.name='feather0000' -c user.email='126372778+feather0000@users.noreply.github.com' \
    commit -m "$( [ "$ACTION" = cleanup ] && echo "Remove $SUBJECT PR #$PR_NUM preview" || echo "Publish $SUBJECT PR #$PR_NUM preview" )"
  git -C "$repo" push origin HEAD:main
}

ok=0
for attempt in 1 2 3 4 5; do
  WORK="$(mktemp -d)"
  if publish_once "$WORK"; then
    ok=1
    break
  fi
  echo "Publish attempt $attempt failed; retrying after a short wait."
  rm -rf "$WORK"
  sleep $((attempt * 3))
done
if [ "$ok" -ne 1 ]; then
  echo "Failed to push the preview after several attempts." >&2
  exit 1
fi
