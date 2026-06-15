# PRE-75→78 + LLM extraction — Extension UI fixes 2 & intelligent scrape

**Ticket:** PRE-75, PRE-76, PRE-77, PRE-78
**Type of work:** Chrome extension / server API
**Status:** shipped

## Summary

Extended the extension drawer to work on any webpage (not just supported job
sites), added LLM-based field extraction to replace fragile scraper heuristics,
styled similar resume cards, added fullscreen PDF + clear-button UX, and
hardened the background message handler.

## Context / problem

1. **Company/role extraction was wrong** — the Leidos scraper extracted
   "Android Developer Intern" as both company and role; the Ashby scraper
   returned "ashbyhq" (the hosting domain) instead of "Rivian". Regex and
   selector-based extraction is fragile across varied job board templates.
2. **Drawer only opened on supported sites** — clicking the extension icon on
   `careers.leidos.com` or any generic page did nothing.
3. **Similar resumes weren't styled** — raw list of text, not cards.
4. **No way to clear fields** — users had to manually delete company, role,
   and JD text.
5. **Company/role persisted across page navigations** — stale data from one
   job page bled into another because session wasn't URL-aware.

## Options considered

### How to extract company/role reliably?

- ✅ **LLM extraction (DeepSeek Flash)** — send the raw JD text to a cheap
  structured-output model that returns `{ title, company, location, terms }`.
  Works on every site, handles edge cases naturally ("Rivian | Volkswagen Group
  Technologies" → company: "Rivian"), costs ~$0.001/call, adds ~1-2s latency.
  The scraper still runs first for instant feedback; LLM overwrites if it
  returns non-empty values.
- ❌ **More site-specific selectors** — every new job board needs a custom
  scraper. The Leidos/Ashby breakage showed this approach doesn't scale.
- ❌ **Domain-based heuristic** — `careers.leidos.com` → "Leidos" works for
  some sites but breaks for Ashby (`jobs.ashbyhq.com` ≠ the employer) and
  multi-brand companies.

### How to open the drawer on any page?

- ✅ **Dynamic injection via `chrome.scripting.executeScript`** — inject
  `drawer.js` into the MAIN world on the active tab when the content script
  isn't present. Dispatch a `CustomEvent("apted-open-drawer")` that the drawer
  listens for alongside `chrome.runtime.onMessage`. Works with `activeTab`
  permission.
- ❌ **Expand `content_scripts` to `<all_urls>`** — would inject the drawer
  on every page load, not just when the user clicks the icon.

## Decision

Shipped LLM extraction as the primary company/role source (scraped values serve
as instant placeholders while the LLM call resolves). The two-step flow gives
fast feedback with accurate overwrite. Used `<all_urls>` host permission for
dynamic injection. Ashby company extraction simplified to URL path parsing.

## Files touched

- `src/app/api/extract/route.ts` — new `/api/extract` endpoint: takes scraped
  fields + JD text, uses DeepSeek Flash structured output to extract
  `{ title, company, location, terms }`
- `src/app/api/extract/route.test.ts` — 5 tests for the extract endpoint
- `src/lib/llm.ts` — exported `callAndParse` for reuse by extract route
- `extension/src/messages.ts` — added `extract` message type and
  `ExtractedFields` type
- `extension/src/background.ts` — `extract` message handler routing to
  `/api/extract`
- `extension/src/drawer.ts` — calls extract after scrape, overwrites
  company/role with LLM values; similar-resume cards styled; clear button;
  fullscreen PDF; handle fades into title; dynamic injection listener
- `extension/src/sidepanel.ts` — same extract-after-scrape pattern
- `extension/src/scrapers.ts` — Ashby: company from URL path; generic fallback:
  domain-based company extraction, date-suffix stripping on title
- `extension/src/__tests__/scrapers.test.ts` — updated Ashby tests for URL-path
  company extraction; added Leidos/generic domain extraction tests
- `extension/src/__tests__/drawer.test.ts` — updated for new UI elements
- `extension/src/session.ts` — `url` field on `Snapshot`; `readSession()`
  returns null on URL mismatch
- `extension/src/types.ts` — added `id?` to `SimilarResume`
- `extension/manifest.json` — `<all_urls>` host permission; removed
  `default_popup`

## Follow-ups

- [ ] Add `location` field to the drawer UI (extracted by LLM but not yet shown)
- [ ] Add `terms` display to the drawer (extracted skills/qualifications)
- [ ] Consider caching extract results by URL hash to avoid re-calling the LLM
  when re-scraping the same page
- [ ] The LLM extract call runs sequentially after scrape but before
  similar-resumes — could run in parallel for faster perceived load