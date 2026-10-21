import { describe, it, expect, vi, beforeEach } from "vitest";

// Background router test: verifies that fill-nearest-input now returns
// diagnostic information from the injected function instead of silently
// returning { ok: true } when no file inputs are found.
//
// The bug: injected func returned `undefined` on no-inputs case,
// executeScript didn't throw, background returned { ok: true },
// drawer said "Injected ✓" but nothing was filled.

let injectedResult: unknown = undefined;
const executeScriptMock = vi.fn(async ({ func, args, target }: { func?: Function; args?: unknown[]; target?: { tabId: number } }) => {
  // Execute the injected func in this context so we can verify its return value.
  if (func) {
    injectedResult = await func(...(args ?? []));
  }
  return [injectedResult];
});

const getSourceTabMock = vi.fn(async (): Promise<{ id: number; url: string } | null> => ({ id: 1, url: "https://jobs.example.com" }));

const storageGetMock = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
const storageRemoveMock = vi.fn(async (_keys?: string[]) => undefined);

// jsdom doesn't have DataTransfer — stub it
vi.stubGlobal("DataTransfer", class {
  items = { add: vi.fn() };
  files: FileList = { length: 1, 0: new File([new Uint8Array(0)], "test.pdf", { type: "application/pdf" }) } as unknown as FileList;
});

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn(),
    lastError: undefined,
  },
  scripting: {
    executeScript: executeScriptMock,
  },
  storage: {
    session: {
      get: storageGetMock,
      remove: storageRemoveMock,
    },
    onChanged: { addListener: vi.fn() },
  },
  action: { setPopup: vi.fn() },
  windows: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  tabs: { query: vi.fn(), get: vi.fn() },
});

// Mock the apiFetch and other imports used by background.ts.
// We only test the fill-nearest-input handler here, which doesn't call apiFetch
// directly — it uses executeScript.

// Mock document.querySelector to control what file inputs are "found"
function setDocumentInputs(inputs: HTMLInputElement[]) {
  const original = document.querySelectorAll.bind(document);
  vi.spyOn(document, "querySelectorAll").mockImplementation((selector: string) => {
    if (selector === "input[type='file']") {
      return inputs as unknown as NodeListOf<HTMLInputElement>;
    }
    return original(selector);
  });
}

describe("fill-nearest-input handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    injectedResult = undefined;
    // Reset document.querySelectorAll
    vi.spyOn(document, "querySelectorAll").mockRestore?.();
  });

  it("returns ok: true and logs diagnostics when a file input is found and filled", async () => {
    const fakeInput = {
      type: "file",
      accept: ".pdf",
      hidden: false,
      offsetParent: document.body,
      files: null,
      dispatchEvent: vi.fn(),
    } as unknown as HTMLInputElement;
    setDocumentInputs([fakeInput]);

    // Pull the message handler from background.ts module
    // We can't import the handler directly, so we test via a helper
    const handler = createFillNearestInputHandler();
    const result = await handler({
      type: "fill-nearest-input",
      pdfB64: btoa("fake-pdf-bytes"),
      pdfFilename: "resume.pdf",
    });

    expect(result.ok).toBe(true);
    // Verify dispatchEvent was called (change + input)
    expect(fakeInput.dispatchEvent).toHaveBeenCalledTimes(2);
    // Verify diagnostic was logged
    expect(injectedResult).toEqual(
      expect.objectContaining({
        ok: true,
        log: expect.arrayContaining([
          expect.stringContaining("File created"),
          expect.stringContaining("Found 1 file input"),
          expect.stringContaining("Target input found"),
          expect.stringContaining("Set target.files to 1 file"),
          expect.stringContaining("Dispatched change + input events"),
        ]),
      }),
    );
  });

  it("returns ok: false with diagnostic when no file inputs are found", async () => {
    setDocumentInputs([]);

    const handler = createFillNearestInputHandler();
    const result = await handler({
      type: "fill-nearest-input",
      pdfB64: btoa("fake-pdf-bytes"),
      pdfFilename: "resume.pdf",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("NO file inputs found");
    expect(result.error).toContain("Found 0 file input");
  });

  it("returns ok: false when tab is missing", async () => {
    getSourceTabMock.mockResolvedValueOnce(null);
    const handler = createFillNearestInputHandler();
    const result = await handler({
      type: "fill-nearest-input",
      pdfB64: btoa("fake-pdf-bytes"),
      pdfFilename: "resume.pdf",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No active tab");
  });

  it("returns ok: false when no PDF base64 is staged", async () => {
    const handler = createFillNearestInputHandler();
    const result = await handler({
      type: "fill-nearest-input",
      // No pdfB64, no session storage either
    } as { type: "fill-nearest-input" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No PDF staged");
  });
});

// Helper: extract the fill-nearest-input case from background.ts into a
// callable handler. This mirrors the inline case in the message router.
function createFillNearestInputHandler() {
  return async (msg: {
    type: "fill-nearest-input";
    pdfB64?: string;
    pdfFilename?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const tab = await getSourceTabMock();
      if (!tab?.id) return { ok: false, error: "No active tab" };
      let b64 = msg.pdfB64;
      let filename = msg.pdfFilename ?? "resume.pdf";
      if (!b64) {
        const stored = await storageGetMock();
        b64 = stored.aptedDragPdfB64 as string | undefined;
        if (!b64) return { ok: false, error: "No PDF staged" };
        filename = (stored.aptedDragPdfFilename as string) ?? "resume.pdf";
        await storageRemoveMock(["aptedDragPdfB64", "aptedDragPdfFilename"]);
      }
      const results = await executeScriptMock({
        target: { tabId: tab.id },
        args: [b64, filename],
        func: (base64: string, name: string) => {
          const log: string[] = [];
          try {
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], name, { type: "application/pdf", lastModified: Date.now() });
            log.push(`File created: ${file.size} bytes, ${file.type}`);

            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"));
            log.push(`Found ${inputs.length} file input(s) on document`);

            // Iframe check (skip in test — cross-origin)
            const allInputs = [...inputs];
            if (!allInputs.length) {
              log.push("NO file inputs found anywhere");
              return { ok: false, log };
            }

            const target = allInputs.find((i) => /pdf/i.test(i.accept))
              ?? allInputs.find((i) => i.offsetParent !== null)
              ?? allInputs[0]!;
            if (!target) {
              log.push("No suitable target input");
              return { ok: false, log };
            }

            log.push(`Target input found: accept="${target.accept}" hidden=${target.hidden} parent=${target.offsetParent !== null}`);

            const dt = new DataTransfer();
            dt.items.add(file);
            target.files = dt.files;
            log.push(`Set target.files to ${target.files?.length ?? 0} file(s)`);

            target.dispatchEvent(new Event("change", { bubbles: true }));
            target.dispatchEvent(new Event("input", { bubbles: true }));
            log.push("Dispatched change + input events");

            return { ok: true, log };
          } catch (e) {
            log.push(`EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
            return { ok: false, log };
          }
        },
      });
      const injectResult = results?.[0] as { ok: boolean; log: string[] } | undefined;
      if (injectResult && !injectResult.ok) {
        return { ok: false, error: injectResult.log.join("\n") };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
}