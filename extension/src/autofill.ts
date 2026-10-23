// Autofill content script — fills job application forms from the user's
// apted profile (master resume contact) and attaches the master resume PDF
// to file inputs.
//
// Runs on job-board pages AND inside apply iframes (all_frames). Shows a
// floating "Autofill (N fields)" button when it detects form fields; the
// profile + PDF are fetched through the service worker (auth + no CORS
// issues). React-safe: values are set via the native value setter and
// InputEvents so framework state updates.
import type { Msg, MsgResultMap, Reply } from "./messages";
import type { AutofillProfile } from "./messages";

// Field patterns: label text → field key. Order matters — specific first.
const FIELD_PATTERNS: Array<{ regex: RegExp; key: string }> = [
  { regex: /\bfirst\s*name\b/i, key: "firstName" },
  { regex: /\blast\s*name\b/i, key: "lastName" },
  { regex: /\bfull\s*name\b/i, key: "fullName" },
  { regex: /\bgiven\s*name\b/i, key: "firstName" },
  { regex: /\bfamily\s*name\b/i, key: "lastName" },
  { regex: /\bsurname\b/i, key: "lastName" },
  { regex: /\bname\b/i, key: "fullName" },
  { regex: /\be-?mail\b/i, key: "email" },
  { regex: /\bphone\b/i, key: "phone" },
  { regex: /\bmobile\b/i, key: "phone" },
  { regex: /\bcell(ular)?\b/i, key: "phone" },
  { regex: /\btelephone\b/i, key: "phone" },
  { regex: /\blinkedin\b/i, key: "linkedin" },
  { regex: /\bgithub\b/i, key: "github" },
  { regex: /\b(portfolio|personal\s*site|website|home ?page|blog)\b/i, key: "website" },
  { regex: /\b(title|headline|current\s*role)\b/i, key: "title" },
  { regex: /\baddress\b/i, key: "address" },
  { regex: /\bcity\b/i, key: "city" },
  { regex: /\bzip\s*(code)?\b/i, key: "zip" },
  { regex: /\bpostal\s*code\b/i, key: "zip" },
  { regex: /\blocation\b/i, key: "city" },
];

interface DetectedField {
  input: HTMLInputElement;
  key: string;
}

function send<K extends keyof MsgResultMap>(
  msg: Extract<Msg, { type: K }>,
): Promise<MsgResultMap[K]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<MsgResultMap[K]> | undefined) => {
      if (chrome.runtime.lastError || !reply || !reply.ok) {
        reject(new Error(chrome.runtime.lastError?.message ?? "no reply"));
      } else {
        resolve(reply.data);
      }
    });
  });
}

function getLabelText(input: HTMLInputElement): string {
  const parts: string[] = [];
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) parts.push(label.textContent ?? "");
  }
  const parentLabel = input.closest("label");
  if (parentLabel) parts.push(parentLabel.textContent ?? "");
  const ariaLabel = input.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);
  const placeholder = input.getAttribute("placeholder");
  if (placeholder) parts.push(placeholder);
  const name = input.getAttribute("name");
  if (name) parts.push(name);
  const prevSibling = input.previousElementSibling;
  if (prevSibling && prevSibling.tagName !== "INPUT" && prevSibling.tagName !== "SELECT") {
    parts.push(prevSibling.textContent ?? "");
  }
  return parts.join(" ");
}

export function findFormFields(doc: Document = document): DetectedField[] {
  const inputs = doc.querySelectorAll<HTMLInputElement>(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file])"
  );
  const found: DetectedField[] = [];
  const used = new Set<HTMLInputElement>();
  for (const input of inputs) {
    if (used.has(input)) continue;
    if ((input as HTMLInputElement & { value?: string }).value) continue; // only empty fields
    const text = getLabelText(input).toLowerCase();
    for (const pat of FIELD_PATTERNS) {
      if (pat.regex.test(text)) {
        found.push({ input, key: pat.key });
        used.add(input);
        break;
      }
    }
  }
  return found;
}

/** React-safe value set: native setter + InputEvent, then change. */
export function setFieldValue(input: HTMLInputElement, value: string): void {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function linkFor(
  profile: AutofillProfile,
  kind: "linkedin" | "github" | "website",
): string {
  const match = (needle: string) =>
    profile.links.find((l) => l.href.toLowerCase().includes(needle))?.href ?? "";
  if (kind === "linkedin") return match("linkedin.com");
  if (kind === "github") return match("github.com");
  // Any non-LinkedIn/GitHub link (portfolio etc.).
  return (
    profile.links.find(
      (l) =>
        !l.href.toLowerCase().includes("linkedin.com") &&
        !l.href.toLowerCase().includes("github.com"),
    )?.href ?? ""
  );
}

function valueFor(key: string, profile: AutofillProfile): string {
  const nameParts = profile.name.trim().split(/\s+/);
  switch (key) {
    case "firstName": return nameParts[0] ?? "";
    case "lastName": return nameParts.slice(1).join(" ");
    case "fullName": return profile.name;
    case "email": return profile.email;
    case "phone": return profile.phone;
    case "title": return profile.title;
    case "linkedin": return linkFor(profile, "linkedin");
    case "github": return linkFor(profile, "github");
    case "website": return linkFor(profile, "website");
    default: return ""; // address/city/zip — not stored on the profile yet
  }
}

/** Inject the master resume PDF into a file input (DataTransfer + change). */
export function attachPdf(input: HTMLInputElement, b64: string): boolean {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "resume.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function showToast(message: string, isError = false): void {
  const existing = document.getElementById("apted-autofill-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "apted-autofill-toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "80px",
    left: "20px",
    zIndex: "2147483647",
    background: isError ? "#fef2f2" : "#f0fdf4",
    color: isError ? "#991b1b" : "#166534",
    border: `1px solid ${isError ? "#fecaca" : "#bbf7d0"}`,
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "13px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  });
  (document.body ?? document.documentElement).appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function createAutofillButton(fieldCount: number): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = "apted-autofill-btn";
  btn.textContent = `Autofill (${fieldCount} field${fieldCount !== 1 ? "s" : ""})`;
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "20px",
    left: "20px",
    zIndex: "2147483647",
    background: "#166534",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "10px 18px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.2)",
  });

  btn.addEventListener("click", async () => {
    btn.textContent = "Filling…";
    btn.disabled = true;
    try {
      const { profile, pdfB64 } = await send({ type: "autofill-profile" });
      if (!profile || (!profile.name && !profile.email)) {
        showToast("Could not load your apted profile. Check Settings.", true);
        throw new Error("no profile");
      }

      let filled = 0;
      for (const field of findFormFields()) {
        const v = valueFor(field.key, profile);
        if (!v) continue;
        try {
          setFieldValue(field.input, v);
          filled++;
        } catch {
          // readonly/disabled — skip
        }
      }

      // Resume file inputs (only when we have a PDF).
      let attached = 0;
      if (pdfB64) {
        const fileInputs = document.querySelectorAll<HTMLInputElement>(
          "input[type=file]",
        );
        for (const fi of fileInputs) {
          const accept = (fi.getAttribute("accept") ?? "").toLowerCase();
          const label = getLabelText(fi).toLowerCase();
          const wantsPdf = !accept || accept.includes("pdf");
          const wantsResume = /resume|cv|curriculum/.test(label + " " + (fi.name ?? ""));
          if (wantsPdf && (wantsResume || fileInputs.length === 1)) {
            if (attachPdf(fi, pdfB64)) attached++;
          }
        }
      }

      const parts = [`Filled ${filled} field${filled !== 1 ? "s" : ""}`];
      if (attached) parts.push(`attached resume ×${attached}`);
      if (pdfB64 && attached === 0 && document.querySelector("input[type=file]")) {
        parts.push("(couldn't attach resume)");
      }
      showToast(parts.join(" · "));
      btn.textContent = "✓ Done";
    } catch {
      btn.textContent = `Autofill (${fieldCount})`;
    } finally {
      setTimeout(() => {
        btn.textContent = `Autofill (${fieldCount})`;
        btn.disabled = false;
      }, 2000);
    }
  });

  return btn;
}

(function () {
  if (document.getElementById("apted-autofill-btn")) return;
  // Skip tiny frames (analytics/pixel iframes) — only real form frames.
  if (window.frames !== window && (window.innerWidth ?? 0) < 200) return;

  const tryInject = () => {
    if (document.getElementById("apted-autofill-btn")) return;
    const fields = findFormFields();
    if (fields.length === 0 && !document.querySelector("input[type=file]")) return;
    (document.body ?? document.documentElement).appendChild(
      createAutofillButton(Math.max(fields.length, 1)),
    );
  };

  setTimeout(tryInject, 500);
  setTimeout(tryInject, 2000);
})();
