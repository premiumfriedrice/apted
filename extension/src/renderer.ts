// Lightweight HTML preview of the Resume JSON. The web app renders via Tectonic
// PDF; this extension just needs a readable one-page mirror for quick feedback.

import type { Resume, Section } from "./types";

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });

const dates = (start?: string, end?: string): string => {
  const a = (start ?? "").trim();
  const b = (end ?? "").trim();
  if (a && b) return `${esc(a)} – ${esc(b)}`;
  return esc(a || b || "");
};

function renderBullets(bullets: { id: string; text: string }[]): string {
  if (!bullets?.length) return "";
  return `<ul>${bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>`;
}

function renderSection(s: Section): string {
  const heading = `<h2>${esc(s.title)}</h2>`;
  switch (s.kind) {
    case "experience":
      return (
        heading +
        s.items
          .map(
            (it) => `
            <div class="entry">
              <div class="entry-head">
                <span class="entry-title">${esc(it.title)}</span>
                <span class="entry-dates">${dates(it.start, it.end)}</span>
              </div>
              <div class="entry-sub">
                <span>${esc(it.org)}</span>
                <span>${esc(it.location ?? "")}</span>
              </div>
              ${renderBullets(it.bullets)}
            </div>`,
          )
          .join("")
      );
    case "projects":
      return (
        heading +
        s.items
          .map(
            (it) => `
            <div class="entry">
              <div class="entry-head">
                <span class="entry-title">${esc(it.name)}${
                  it.stack ? ` <span class="stack">| ${esc(it.stack)}</span>` : ""
                }</span>
                <span class="entry-dates">${dates(it.start, it.end)}</span>
              </div>
              ${renderBullets(it.bullets)}
            </div>`,
          )
          .join("")
      );
    case "education":
      return (
        heading +
        s.items
          .map(
            (it) => `
            <div class="entry">
              <div class="entry-head">
                <span class="entry-title">${esc(it.school)}</span>
                <span class="entry-dates">${dates(it.start, it.end)}</span>
              </div>
              <div class="entry-sub">
                <span>${esc(it.degree ?? "")}</span>
                <span>${esc(it.location ?? "")}</span>
              </div>
              ${renderBullets(it.bullets)}
            </div>`,
          )
          .join("")
      );
    case "skills":
      return (
        heading +
        `<ul class="skills">${s.items
          .map(
            (g) =>
              `<li><span class="cat">${esc(g.category)}:</span> ${esc(g.items)}</li>`,
          )
          .join("")}</ul>`
      );
    default:
      return heading;
  }
}

export function renderResumeHTML(resume: Resume | null): string {
  if (!resume) {
    return `<div class="empty">No draft yet. Tailor a JD to get started.</div>`;
  }
  const c = resume.contact ?? { name: "" };
  const linksHtml = (c.links ?? [])
    .map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join(" · ");
  const metaParts: string[] = [];
  if (c.phone) metaParts.push(esc(c.phone));
  if (c.email) metaParts.push(esc(c.email));
  if (linksHtml) metaParts.push(linksHtml);

  const sections = (resume.sections ?? []).map(renderSection).join("\n");

  return `
    <article class="resume">
      <header>
        <h1>${esc(c.name)}</h1>
        <div class="contact">${metaParts.join(" · ")}</div>
      </header>
      ${sections}
    </article>
  `;
}
