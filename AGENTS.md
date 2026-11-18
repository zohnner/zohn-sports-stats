# SportStrata — Agent Instructions

The project instructions live in [`CLAUDE.md`](CLAUDE.md). Read it first and follow it; it is the only maintained copy. This file used to hold a separate copy that went stale, so it now only points there.

Also read before working:

- [`GOALS.md`](GOALS.md) — what the site is for, the rules that never bend, and the current priorities.
- [`DESIGN.md`](DESIGN.md) — house style; visual changes are reviewed against it.
- [`DECISIONS.md`](DECISIONS.md) — the decision log. Check it before treating anything as new ground.

Scheduled agents have their own run books: `tools/stories/PLAYBOOK.md` (Muse), `tools/parity/RUNBOOK.md` (parity run), `tools/desk/RUNBOOK.md` (desk run), `tools/audit/RUNBOOK.md` (audit run).

Ground rules that apply to every agent: no framework, bundler or build step; never push to `main` or merge a code PR (only Story PRs auto-merge); every number shown or published must have a source.
