# PRE-70→74 — Extension drawer UI polish

**Ticket:** PRE-70, PRE-71, PRE-72, PRE-73, PRE-74
**Type of work:** Chrome extension UI
**Status:** shipped

## Summary

Polished the extension floating drawer: added a fullscreen PDF viewer with the
native Chrome reader, made the drawer full-viewport-height, prevented scroll
leakage to the host page, and fixed the settings button to open the options
page from a content script.

## Context / problem

The extension drawer had accumulated UI friction:

1. **Preview was small** — the 280px iframe showed the resume but users wanted
to zoom in. The fullscreen button was disabled half the time.
2. **Scrolling leaked** — scrolling inside the drawer or the preview PDF also
scrolled the host page, which was disorienting.
3. **Drawer height was capped** — `max-height: calc(100vh - 24px)` left an
awkward gap at the bottom.
4. **Settings button was broken** — `chrome.runtime.openOptionsPage()` is not
available in content scripts (it returns `undefined`), so the gear icon did
nothing.
5. **Button clutter** — Download, Save, Fullscreen, and Inject were all text
buttons in a cramped row.

## Options considered

### How to show the PDF in fullscreen?

- ✅ **Native Chrome PDF viewer in an iframe** — gives zoom, download, print,
  and search for free. The toolbar is visible in fullscreen (suppressed in the
  small preview via `toolbar=0`). The trade-off is a black background that can't
  be styled.
- ❌ **Custom canvas renderer (pdfjs-dist)** — we built this: `pdfjs-dist` bundled
  into the drawer, a canvas element at `devicePixelRatio` for crisp text, zoom
  in/out buttons, and a liquid-glass blur frame. It worked but the bundle grew
  from 40KB to 364KB, the worker was 1.3MB, and the custom zoom controls were
  clunky compared to the native viewer. The user rejected it.
- ❌ **Open PDF in a new tab** — simple, but loses the in-page feel and the
  glass blur frame.

### How to open the options page from a content script?

- ✅ **Send a message to the background script** — added `open-options` to `Msg`
  and `MsgResultMap`. The content script calls `send({ type: "open-options" })`,
  the background handler calls `chrome.runtime.openOptionsPage()`. Works because
  the background script has the full extension API.
- ❌ **Try `chrome.runtime.openOptionsPage()` directly** — returns `undefined`
  in content scripts, silently fails. This is the bug that forced the change.

### How to prevent scroll from leaking to the host page?

- ✅ **`stopPropagation()` on wheel events** — listen on `wheel` at the drawer
  body, preview container, and fullscreen overlay. Stop propagation so the
  host page never sees the event. `overscroll-behavior: contain` on the drawer
  body catches the CSS-level scroll-chaining too.
- ❌ **Pointer-events: none on the overlay** — would break clicking inside the
  drawer.

## Decision

Shipped the native PDF viewer in fullscreen, message-based settings, and scroll
containment. The user accepted the black background of the native viewer as a
reasonable trade-off for functionality.

## Files touched

- `extension/src/drawer.ts` — fullscreen overlay HTML/CSS, click-away close,
  Escape handling, scroll containment, icon buttons, full-height drawer
- `extension/src/background.ts` — `open-options` message handler
- `extension/src/messages.ts` — `open-options` message type and result
- `extension/src/__tests__/drawer.test.ts` — updated test expectations

## Follow-ups

- [ ] The fullscreen iframe uses a blob URL (no `toolbar=0` suppression) — the
  Chrome PDF viewer toolbar is visible. If the user wants a custom-styled viewer
  later, we may need to revisit the pdfjs-dist approach.
- [ ] The `stopPropagation` approach for scroll containment works but is
  aggressive. If the user wants to scroll the host page while the drawer is open,
  we'd need a more nuanced approach (e.g., only stop propagation when the drawer
  body is actually scrollable).
