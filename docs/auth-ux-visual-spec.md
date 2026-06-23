# A-031 — Auth UX & Visual Spec (Vera + Kael)

**Status:** DRAFT — pending review. Behavioral + visual gates for D-031 Phase 1.

## Vera — interaction
**Principle:** sign-in is optional and additive. Every page works signed-out exactly as today; signing in only *adds* follows + synced prefs. No wall, no forced account.

**Entry points**
- Header **account control** (right cluster, near Settings): "Sign in" pill when signed-out; avatar (initial) menu when signed-in.
- Contextual prompts: tapping a **follow** control while signed-out opens the sign-in sheet, then completes the original action (never lose the user's intent).

**Sign-in sheet** (modal on desktop, bottom-sheet on mobile)
- Three choices: **Use a passkey**, **Continue with Google**, **Email me a link**. No password field.
- One step; closes back to where the user was.

**States to build**
- signed-out · signing-in (loading) · signed-in · error (declined/failed, retry) · magic-link-sent ("check your email") · email-unverified · account-management.

**Follows**
- A star/＋ control on team & player cards and detail pages. Active = filled accent. Signed-out tap → sign-in sheet → auto-applies the follow on return.
- Followed entities will power a personalized rail in a later phase (out of scope to *display* now; we just capture them).

**Preferences sync**
- theme, default sport, scoring format. On sign-in, server values load; local changes push up. Conflict rule: **server wins on load, client writes win going forward.**

**Account management** (minimal page)
- Email, linked sign-in methods, **Export my data**, **Delete account** (requires re-auth; irreversible; confirms twice).

**Accessibility**
- Sheet traps focus, Esc closes, returns focus to the trigger; provider buttons keyboard-reachable; ARIA labels; honors reduced-motion.

## Kael — visual
- **Account control:** signed-out = accent "Sign in" pill; signed-in = circular avatar with initial (accent ring), opening a small card menu. Sits beside Settings; no layout shift for signed-out users.
- **Sign-in sheet:** existing `--bg-card` surface + `--radius-lg`, accent primary CTA, provider buttons with logos on `--bg-raised`, generous spacing, brand-minimal (no marketing copy).
- **Follow control:** outline star when off, accent-filled when on; identical treatment on cards and detail headers.
- **Tokens only:** reuse existing variables; new classes namespaced `.auth-*`. No new color primitives.

## Gate output
Behavioral states + visual surfaces above are the contract Finn implements. Nothing renders for signed-out users beyond the unobtrusive account control and the follow stars.
