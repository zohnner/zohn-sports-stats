# A-031 — Legal & Privacy Checklist (Folio)

**Status:** DRAFT — pending review. Legal gate for D-031 Phase 1.
**Not legal advice.** This is the requirements checklist; a qualified lawyer should review the published policies before launch (and again before any paid tier).

## Privacy Policy (must publish + link in footer and sign-in sheet)
- **What we collect:** email; display name (optional); linked auth-provider ids; follows & preferences; limited security logs (IP, user-agent, timestamps) for the login audit.
- **Why:** to provide accounts, sync, and security. No advertising/tracking profiles in Phase 1.
- **Processors / third parties:** Cloudflare (hosting, D1), the auth library's OAuth providers (Google), the email sender for magic-links, ESPN/Sleeper/nflverse (sports data only — no user data shared to them).
- **Retention:** sessions expire and are purged daily; deleted accounts are removed with no residue; security logs kept 90 days.
- **Rights:** access, export, and deletion — **self-serve** in account settings (ties to Relay's export/delete).
- **Contact** + policy "last updated" date + change process.

## Terms of Service
- Acceptable use; account responsibilities; **data provided "as is"** from third-party sources; **not betting/financial advice**; limitation of liability; termination; governing law; change notice.

## Cookies / consent
- Phase 1 uses **only essential cookies** (the session cookie). No analytics/ad cookies → a concise "we use essential cookies" notice + privacy link is sufficient; **no consent wall required** while strictly essential.
- The moment analytics or ads are added, a real consent mechanism (GDPR opt-in / CCPA) becomes required — revisit then.

## GDPR / CCPA operational
- Data-subject access/export/delete: satisfied by the self-serve endpoints (Relay spec).
- Maintain a **processor list** + sign DPAs with Cloudflare, the OAuth provider, and the email sender.
- We do **not sell** personal data (CCPA "Do Not Sell" therefore N/A — but state it).

## Pre-launch checklist
- [ ] Privacy Policy + ToS published and linked (footer + sign-in).
- [ ] Essential-cookie notice live.
- [ ] Export + delete verified working end-to-end.
- [ ] Processor list + DPAs in place.
- [ ] Lawyer review complete (liability, ToS, data rights).
