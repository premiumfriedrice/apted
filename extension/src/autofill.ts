// Autofill content script (PRE-60).
//
// Detects job application form fields (name, email, phone, location) on
// supported job sites by matching label text, input name, and placeholder
// patterns. Shows a floating "Autofill" button that fetches the master
// resume contact info from the API and populates detected fields.
//
// Runs via manifest content_scripts on the same sites as inject.ts.
import { getSettings } from "./storage";

// Field patterns: label text → field key. Order matters — more specific first.
const FIELD_PATTERNS: Array<{ regex: RegExp; key: string }> = [
  { regex: /\bfirst\s*name\b/i, key: "firstName" },
  { regex: /\blast\s*name\b/i, key: "lastName" },
  { regex: /\bfull\s*name\b/i, key: "fullName" },
  { regex: /\bname\b/i, key: "fullName" },
  { regex: /\bemail\b/i, key: "email" },
  { regex: /\bphone\b/i, key: "phone" },
  { regex: /\bmobile\b/i, key: "phone" },
  { regex: /\btelephone\b/i, key: "phone" },
  { regex: /\baddress\b/i, key: "address" },
  { regex: /\bcity\b/i, key: "city" },
  { regex: /\bzip\s*(code)?\b/i, key: "zip" },
  { regex: /\bpostal\s*code\b/i, key: "zip" },
  { regex: /\blocation\b/i, key: "city" },
];

interface DetectedField {
  input: HTMLInputElement;
  key: string;
  label: string;
}

function findFormFields(): DetectedField[] {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio])"
  );
  const found: DetectedField[] = [];
  const used = new Set<HTMLInputElement>();

  for (const input of inputs) {
    if (used.has(input)) continue;

    const text = getLabelText(input).toLowerCase();
    for (const pat of FIELD_PATTERNS) {
      if (pat.regex.test(text)) {
        found.push({ input, key: pat.key, label: text.slice(0, 30) });
        used.add(input);
        break;
      }
    }
  }

  return found;
}

function getLabelText(input: HTMLInputElement): string {
  const parts: string[] = [];

  // Label element (for/id or wrapping)
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) parts.push(label.textContent ?? "");
  }
  const parentLabel = input.closest("label");
  if (parentLabel) parts.push(parentLabel.textContent ?? "");

  // aria-label
  const ariaLabel = input.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);

  // placeholder
  const placeholder = input.getAttribute("placeholder");
  if (placeholder) parts.push(placeholder);

  // name attribute
  const name = input.getAttribute("name");
  if (name) parts.push(name);

  // Preceding text (sibling or parent text nodes)
  const prevSibling = input.previousElementSibling;
  if (prevSibling && prevSibling.tagName !== "INPUT" && prevSibling.tagName !== "SELECT") {
    parts.push(prevSibling.textContent ?? "");
  }

  return parts.join(" ");
}

async function fetchMasterContact(): Promise<{
  name: string;
  email: string;
  phone: string;
} | null> {
  try {
    const settings = await getSettings();
    if (!settings.apiBase) return null;

    const res = await fetch(`${settings.apiBase}/api/master`, {
      headers: settings.authToken
        ? { Authorization: `Bearer ${settings.authToken}` }
        : {},
    });

    if (!res.ok) return null;
    const data = await res.json();
    const contact = data?.content?.contact ?? data?.contact;
    if (!contact) return null;

    return {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    };
  } catch {
    return null;
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
    right: "20px",
    zIndex: "2147483647",
    background: isError ? "#fef2f2" : "#f0fdf4",
    color: isError ? "#991b1b" : "#166534",
    border: `1px solid ${isError ? "#fecaca" : "#bbf7d0"}`,
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "13px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function createAutofillButton(fields: DetectedField[]): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = "apted-autofill-btn";
  btn.textContent = `Autofill (${fields.length} field${fields.length > 1 ? "s" : ""})`;
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
    boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
  });

  btn.addEventListener("click", async () => {
    btn.textContent = "Filling…";
    btn.disabled = true;

    const contact = await fetchMasterContact();
    if (!contact) {
      showToast("Could not load master resume. Check API connection.", true);
      btn.textContent = `Autofill (${fields.length})`;
      btn.disabled = false;
      return;
    }

    let filled = 0;
    for (const field of fields) {
      try {
        switch (field.key) {
          case "firstName":
            field.input.value = contact.name.split(" ")[0] ?? "";
            break;
          case "lastName":
            field.input.value = contact.name.split(" ").slice(1).join(" ") ?? "";
            break;
          case "fullName":
            field.input.value = contact.name;
            break;
          case "email":
            field.input.value = contact.email;
            break;
          case "phone":
            field.input.value = contact.phone;
            break;
          case "address":
          case "city":
          case "zip":
            // We don't store these yet — leave empty
            break;
        }
        // Dispatch input/change events so frameworks (React, Angular) pick up the value
        field.input.dispatchEvent(new Event("input", { bubbles: true }));
        field.input.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      } catch {
        // field might be readonly/disabled
      }
    }

    showToast(`Filled ${filled} field${filled !== 1 ? "s" : ""}`);
    btn.textContent = `✓ Done`;
    setTimeout(() => {
      btn.textContent = `Autofill (${fields.length})`;
      btn.disabled = false;
    }, 2000);
  });

  return btn;
}

(function () {
  if (document.getElementById("apted-autofill-btn")) return;

  // Wait a moment for dynamic forms (SPA frameworks) to render.
  const tryInject = () => {
    const fields = findFormFields();
    if (fields.length === 0) return;

    const btn = createAutofillButton(fields);
    document.body.appendChild(btn);
  };

  // Try immediately and again after a delay for SPAs.
  setTimeout(tryInject, 500);
  setTimeout(tryInject, 2000);
})();
