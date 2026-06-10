import { vi } from "vitest";

// Mock the Chrome extension API surface used by pdf.ts.
// chrome.runtime.sendMessage is the only Chrome API called by the
// shared pdf.ts module. Other files (sidepanel, background, inject)
// have their own Chrome API usage and are tested separately.

type SendMessageCb = (reply: unknown) => void;

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn((_msg: unknown, cb: SendMessageCb) => {
      // Default: call cb immediately with no error. Individual tests override
      // this mock to return specific payloads or errors.
      cb({ ok: true, data: null });
    }),
    lastError: undefined,
  },
});
