#!/usr/bin/env bash
# D-200: post a batch of share links to this week's "📣 Share queue" issue.
# One queue issue per week (weeks start Monday, UTC). The first batch of a new
# week opens that week's issue and closes any older queue: a story more than a
# week old isn't worth posting. Needs GH_TOKEN with issues:write.
# Usage: share-queue.sh <share.md>   (TODAY=YYYY-MM-DD overrides the date, for tests)
set -euo pipefail

body_file="$1"
today="${TODAY:-$(date -u +%F)}"
dow=$(date -u -d "$today" +%u)
monday=$(date -u -d "$today -$((dow - 1)) days" +%F)
title="📣 Share queue — week of $monday"

gh label create share-queue --color FBCA04 \
  --description "Weekly queue of stories to post (D-200)" >/dev/null 2>&1 || true

open=$(gh issue list --label share-queue --state open --limit 50 --json number,title \
  --jq '.[] | "\(.number)\t\(.title)"')

num=""
while IFS=$'\t' read -r n t; do
  [ -z "$n" ] && continue
  if [ "$t" = "$title" ]; then
    num="$n"
  else
    gh issue close "$n" --comment "Closed: a new week's queue started ($title). Anything not posted from this one is too old to share."
  fi
done <<< "$open"

if [ -z "$num" ]; then
  intro=$(mktemp)
  printf '%s\n\n%s\n' \
    "Stories published this week, ready to post. Each comment below is one batch, with a **Post to X** link and the Reddit text." \
    "Tick off a batch by reacting 👍 once it's posted. This issue closes itself when next week's queue opens." > "$intro"
  url=$(gh issue create --title "$title" --label share-queue --body-file "$intro")
  num="${url##*/}"
fi

gh issue comment "$num" --body-file "$body_file"
echo "Queued on #$num ($title)"
