import { describe, it, expect } from "vitest";
import bgSrc from "../background.ts?raw";
import msgSrc from "../messages.ts?raw";
import type { Msg } from "../messages";

// Regression guard for the SW message router. A previous bug deleted the
// `case "get-version"` from background.ts while the message type stayed in
// messages.ts, so the switch returned `undefined`, the drawer's
// `(await send(...) as Draft).id` threw, and matched-resume previews silently
// broke. This asserts every message type the drawer/sidepanel can send has a
// matching case in the router.

const bgSrcMatch = bgSrc; // ?raw import of background.ts

// Collect every `type: "x"` literal from the Msg union in messages.ts.
const msgTypes = Array.from(msgSrc.matchAll(/type:\s*"([a-z-]+)"/g)).map((m) => m[1]!);

// "open-drawer" is intentionally not handled by the SW (it's sent FROM the
// SW to content scripts); background.ts explicitly throws if it arrives.
const UNHANDLED = new Set(["open-drawer"]);

describe("background message router coverage", () => {
  it("has a case for every Msg type (except open-drawer)", () => {
    const missing = msgTypes.filter(
      (t) => !UNHANDLED.has(t) && !bgSrc.includes(`case "${t}"`),
    );
    expect(missing).toEqual([]);
  });

  it("includes the get-version case specifically", () => {
    expect(bgSrc).toContain('case "get-version"');
  });
});
