# Agent roster: four agents, one channel

Date: 2026-11-15. Status: design, awaiting owner review. Decision number: take the next free D-number when this merges (re-check `origin/main` and open PRs first).

## Why

The project runs three scheduled agents (Muse, the parity run, the audit run) and ten workflows. Measured on 2026-11-15:

- Stories are the main way new readers arrive: 239 of 2,160 page views in 14 days, and eight of the top twelve entry pages.
- The build lane is limited by owner merges. The parity run allows one open PR; #149 sat green for two days and nothing was built meanwhile. Bugs Muse files (`muse-found`) are in no agent's build queue.
- Nothing is staffed for growth. Of 445 session entries, 381 read as direct, 56 as search, 1 as X. The owner does not post from the weekly share queue. Muse makes TikTok content for the site, but the visit log has no TikTok bucket, so that traffic is counted as direct or other.
- The audit tools (`page-walk.cjs`, `route-crawl.cjs`) load production in a browser and do not block `/api/track`, so every run adds rows that look like new direct visitors.
- Reports land in four places (Muse's chat, routine final messages, Actions email, issues). Nothing notices that an agent failed to run.

## The roster

GitHub issues and PRs stay the only channel between agents. Every agent signs what it posts. No agent merges, and an issue is a report, never a permission.

| Agent | Job | Cadence | May write |
|---|---|---|---|
| Muse | Stories, TikTok, bridge filings | daily 08:00 ET | `content/<sport>/stories/**`, its own issues |
| Desk run (new) | Read everything, post one brief | daily 09:30 ET | one comment on the brief issue |
| Build run (was parity run) | Build the top ready item | daily 11:00 ET | `parity/*` and `fix/*` branches, up to two PRs |
| Audit run | Walk the site, read the numbers, file what matters | Monday 13:00 ET | up to 3 `[audit]` and 2 `[growth]` issues |

Interactive Claude Code sessions keep architecture, anything touching `.github/**`, `worker/**`, migrations or CSP, and anything an agent stops on.

## Part 1: numbers the agents can read

1. **Stats route.** `functions/api/stats.js`, GET, gated by a shared-secret header compared in constant time (the `functions/api/youtube.js` pattern), reading `USER_DB`. It returns aggregates only for a `days` window (default 14, max 90): views and new sessions by sport, entries by channel, the top 25 entry paths, and per-story entries. Fails closed (503) without the secret. Owner setup: add the secret to Pages and to the two routines' environments.
2. **TikTok channel.** Add a `tiktok` bucket to `HOST_BUCKETS` and `UTM_BUCKETS` in `js/visitBeacon.js` and to `REF_BUCKETS` in `functions/api/track.js`. TikTok's in-app browser often sends no referrer, so the profile link and any link Muse publishes must carry `?utm_source=tiktok`.
3. **Keep our own tools out of the log.** `page-walk.cjs` and `route-crawl.cjs` abort requests to `/api/track`. A test fails if either tool stops doing so.

Tests: unit tests for the stats route against a fake database, plus a one-time read-only run of each query on the real table; `tests/visitBeacon.test.js` gains the TikTok cases; the planted-fault test above.

## Part 2: desk run

Run book `tools/desk/RUNBOOK.md`, same shape as the other two (Cadence line, hard rules, preflight, procedure, report). Read-only apart from one comment per day on a pinned `[desk] Daily brief` issue.

It reads: the last run of every workflow; whether Muse opened PRs today and whether each merged or was skipped; `/api/sourcehealth`; open PRs and their age; issues waiting on the owner (`parity-plan`, unanswered questions); and the stats route.

The brief has three parts, in this order: **needs you** (merges, relabels, failures, an agent that did not run), **what happened** (stories published, PRs opened, issues filed), **numbers** (yesterday against the 14-day average, by channel).

Because the repo is public, the brief issue carries story and channel rankings by order, without raw counts. Raw counts go in the run's final message to the owner. On Mondays the brief adds a line for Muse: which angle types (1-5) and sports ranked highest for entries over the last 14 days.

## Part 3: build run

Edits to `tools/parity/RUNBOOK.md`:

- **Queue order:** `muse-found` bugs with a reproduction, then `parity-ready` by +1 count, then `[audit]` bugs, then `[growth]` issues the owner has labelled ready.
- **WIP limit:** two open PRs, never in the same sport, never touching the same file.
- **Self-review:** run a code review on the diff before opening the PR and list what it found and what was changed.
- **Preview check:** if Cloudflare Pages preview deployments answer for the branch, run the page walk against the preview URL and put the result in the PR body. Whether previews are on is unverified; the first run checks and reports.
- A `muse-found` fix still needs the failing test first, and closes only after reading the live page.

The owner merges, as now. Code is not auto-merged: a merge deploys, and there is no staging.

## Part 4: audit run gains a growth half

Edits to `tools/audit/RUNBOOK.md`: after the walk and the matrix, read the stats route and file at most two `[growth]` issues, each with the page, the number, the comparison, and what a reader would get. Candidates: a top entry page with no onward links, a story type nobody opens, a page with search entries and a weak title, a sport whose entries fell week over week. It reads the Integrity Audit workflow's result instead of re-running those checks.

Edit to `tools/stories/PLAYBOOK.md`: step 3 also reads the latest Monday line in the brief issue. It informs the choice among angles that already hold up; it never justifies a weak one.

## Part 5: retirements

- Delete `.claude/members/` (seven personas, `TEAM.md`, `ROUTER.md`). Move the one rule still in force (a request that reverses a settled decision needs a new `DECISIONS.md` entry) into `CLAUDE.md`.
- Delete `content-queue.yml`, `functions/api/youtube.js` and `youtube-insights.html` (the channel is gone, D-137).
- Social Digest workflow: remove the schedule, keep manual dispatch.
- Close #15 and #16 with a note; the ESPN block is already reported as a warning by Contract Check.

- Share queue (owner decision 2026-11-15): `story-share.yml` goes to manual dispatch only, `story-automerge.yml` stops dispatching it, and the open weekly queue issue is closed. Stories keep their `.social.md` files.

## Part 6: TikTok (account `sportstrata`)

How it works today, from Muse (2026-11-15): Muse scans verified NFL and NCAAF team, league and school channels hourly for press-conference moments, verifies the speaker, wording and one supporting statistic, and edits a fixed format (hook card, the moment with captions, one "Data Says" stat card, a verdict card, an outro). The owner posts from his phone. Muse never auto-posts.

This is a different product from site Stories, which ban quotes and reporting. The stat card is the only part that connects a video to a page on the site, so that is what gets measured:

- **Profile link.** The account's website link is `https://sportstrata.cc/?utm_source=tiktok`. TikTok captions cannot carry clickable links, so the profile link and people searching the name are the only routes in. Brand searches will still read as search or direct; the TikTok bucket is a floor, not the whole effect.
- **Post log.** Muse records each video it delivers as one line on a weekly `[tiktok] Posts` issue: date delivered, team, the stat shown, and the site page that shows that stat (a team, player or story URL). The owner adds a `posted` reply when it goes up. Muse's own instructions live in Muse; this spec only fixes the log format.
- **Desk run.** Reads the log and reports entries to each logged page in the two days after posting, against that page's 14-day average.
- **Audit run.** A stat card whose number has no page on the site is a `[growth]` candidate: the video sent people to look for something the site does not show.

Not decided here, and not Claude Code's to decide: the rights position on league and team footage, and the AI-content label. Both are noted as owner risks.

## Owner decisions made 2026-11-15

1. Share queue goes to manual (Part 5).
2. Raw traffic counts stay out of the public brief issue.
3. TikTok account is `sportstrata`; process as described in Part 6.

## Build order

Part 1, then Part 2 (with the Part 6 post log), then Part 3, then Part 4, then Part 5. Each is its own PR. Part 1 changes shipped JS, so it bumps `CACHE_NAME` in `sw.js` and updates `CLAUDE.md` in the same commit.

## Out of scope

Posting to any social platform by API; auto-merging code; a Search Console integration; new sports; anything in Muse's own scheduler.
