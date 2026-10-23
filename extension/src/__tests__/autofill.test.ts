import { describe, it, expect, vi, beforeEach } from "vitest";
import { findFormFields, setFieldValue, attachPdf } from "../autofill";

// jsdom doesn't have DataTransfer — stub a functional one (adds land in files).
vi.stubGlobal(
  "DataTransfer",
  class {
    private _files: File[] = [];
    items = {
      add: (f: File) => {
        this._files.push(f);
      },
    };
    get files(): FileList {
      return Object.assign([...this._files], {
        item: (i: number) => this._files[i] ?? null,
      }) as unknown as FileList;
    }
  },
);

beforeEach(() => {
  document.body.textContent = ""; // reset the DOM between tests
});

function labeledInput(id: string, labelText: string, attrs: Record<string, string> = {}): void {
  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.textContent = labelText;
  const input = document.createElement("input");
  input.id = id;
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  document.body.append(label, input);
}

describe("findFormFields", () => {
  it("detects the standard application fields and skips prefilled ones", () => {
    labeledInput("fn", "First Name");
    labeledInput("ln", "Last Name");
    labeledInput("em", "Email address");
    labeledInput("ph", "Mobile number");
    labeledInput("li", "LinkedIn URL");
    labeledInput("gh", "GitHub profile");
    labeledInput("ignored", "Something else entirely");
    const prefilled = document.createElement("input");
    prefilled.id = "pre";
    prefilled.value = "already filled";
    document.body.append(document.createElement("label"), prefilled);

    const fields = findFormFields();
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("firstName");
    expect(keys).toContain("lastName");
    expect(keys).toContain("email");
    expect(keys).toContain("phone");
    expect(keys).toContain("linkedin");
    expect(keys).toContain("github");
    expect(keys).not.toContain("fullName"); // first/last win over generic \bname\b
    // "already filled" input excluded
    expect(fields.some((f) => f.input.id === "pre")).toBe(false);
  });

  it("never matches file inputs", () => {
    labeledInput("resume", "Resume / CV", { type: "file" });
    expect(findFormFields().length).toBe(0);
  });
});

describe("setFieldValue", () => {
  it("sets the value and fires input + change events (framework-safe)", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    setFieldValue(input, "Ada Lovelace");
    expect(input.value).toBe("Ada Lovelace");
    expect(events).toEqual(["input", "change"]);
  });

  it("uses the native prototype setter, bypassing React-style instance overrides", () => {
    const input = document.createElement("input");
    document.body.append(input);
    // Simulate React having redefined `value` on the instance: the override's
    // setter must NOT be used, and the prototype getter must still read the
    // value the native setter wrote.
    const protoDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    let intercepted: string | undefined;
    Object.defineProperty(input, "value", {
      get() {
        return protoDesc.get!.call(input);
      },
      set(v: string) {
        intercepted = v;
      },
      configurable: true,
    });

    setFieldValue(input, "x");
    expect(intercepted).toBeUndefined(); // instance override bypassed
    expect(input.value).toBe("x"); // native slot updated, prototype getter reads it
  });
});

describe("attachPdf", () => {
  it("injects a resume.pdf File into a file input", () => {
    const input = document.createElement("input");
    input.type = "file";
    document.body.append(input);
    // jsdom's input.files is a getter-only accessor; Chrome's is settable
    // per spec. Shadow it with a settable own property for the test.
    let filesValue: FileList | null = null;
    Object.defineProperty(input, "files", {
      get: () => filesValue,
      set: (v: FileList | null) => {
        filesValue = v;
      },
      configurable: true,
    });
    const changed = vi.fn();
    input.addEventListener("change", changed);

    const ok = attachPdf(input, btoa("fake-pdf-bytes"));
    expect(ok).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(input.files?.length).toBe(1);
    expect(input.files?.[0]?.name).toBe("resume.pdf");
  });
});
