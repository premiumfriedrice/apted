// JSON -> LaTeX using Jake Gutierrez's resume template macros:
//   \resumeSubheading, \resumeProjectHeading, \resumeItem, \section,
//   \resumeSubHeadingListStart/End, \resumeItemListStart/End.
//
// The preamble and macros below are adapted from Jake Gutierrez's resume
// template (MIT, https://github.com/jakegut/resume), itself based on
// Sourabh Bajaj's earlier template. See /LICENSE-jake-resume.md at the repo
// root for the full notice.
//
// NOTE: When apted later supports a Typst renderer, swap this module's
// `renderJake` for a `renderResumeTyp` counterpart and update
// /api/drafts/[id]/tex + compile-service to accept both. The contract is
// just "Resume JSON in, source string out".
import type { Resume, Section } from "../resume";

// Prepended to every emitted .tex so downstream artifacts (PDFs, downloads)
// carry the upstream MIT notice.
const ATTRIBUTION = `% Based on Jake Gutierrez's resume template (MIT).
% Source: https://github.com/jakegut/resume
% See LICENSE-jake-resume.md in this repo for the full notice.
`;

// LaTeX-escape and strip the formatting we promised the LLM not to use.
function tex(s: string): string {
  if (!s) return "";
  // Strip em-dashes and inline markdown bold/italic. We promised no em-dashes
  // and no inline bold; this is a belt-and-suspenders strip in case the model
  // still produced one.
  let out = s.replace(/—/g, ", ").replace(/–/g, "-");
  out = out.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  out = out.replace(/(^|\s)\*(.+?)\*/g, "$1$2").replace(/(^|\s)_(.+?)_/g, "$1$2");
  // Escape LaTeX specials. Order matters; backslash first.
  out = out
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
  return out;
}

function dateRange(start: string, end: string): string {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (s && e) return `${tex(s)} -- ${tex(e)}`;
  return tex(s || e);
}

function renderSection(sec: Section): string {
  // Jake Gutierrez's list macros expand to \begin{itemize}...\end{itemize},
  // which LaTeX rejects when empty ("Something's wrong--perhaps a missing
  // \item"). Drop the whole section when there are no items to render.
  if (sec.items.length === 0) return "";

  const head = `\\section{${tex(sec.title)}}`;
  if (sec.kind === "experience") {
    const body = sec.items.map((it) => {
      const head = `\\resumeSubheading
      {${tex(it.title)}}{${dateRange(it.start, it.end)}}
      {${tex(it.org)}}{${tex(it.location)}}`;
      const items = it.bullets.length
        ? `\\resumeItemListStart\n${it.bullets.map((b) => `        \\resumeItem{${tex(b.text)}}`).join("\n")}\n      \\resumeItemListEnd`
        : "";
      return `${head}\n      ${items}`;
    }).join("\n\n    ");
    return `${head}
  \\resumeSubHeadingListStart
    ${body}
  \\resumeSubHeadingListEnd`;
  }
  if (sec.kind === "projects") {
    const body = sec.items.map((it) => {
      const heading = it.stack
        ? `\\textbf{${tex(it.name)}} $|$ \\emph{${tex(it.stack)}}`
        : `\\textbf{${tex(it.name)}}`;
      const head = `\\resumeProjectHeading
      {${heading}}{${dateRange(it.start, it.end)}}`;
      const items = it.bullets.length
        ? `\\resumeItemListStart\n${it.bullets.map((b) => `        \\resumeItem{${tex(b.text)}}`).join("\n")}\n      \\resumeItemListEnd`
        : "";
      return `${head}\n      ${items}`;
    }).join("\n\n    ");
    return `${head}
  \\resumeSubHeadingListStart
    ${body}
  \\resumeSubHeadingListEnd`;
  }
  if (sec.kind === "education") {
    const body = sec.items.map((it) => {
      const head = `\\resumeSubheading
      {${tex(it.school)}}{${tex(it.location)}}
      {${tex(it.degree)}}{${dateRange(it.start, it.end)}}`;
      const items = it.bullets.length
        ? `\\resumeItemListStart\n${it.bullets.map((b) => `        \\resumeItem{${tex(b.text)}}`).join("\n")}\n      \\resumeItemListEnd`
        : "";
      return `${head}\n      ${items}`;
    }).join("\n\n    ");
    return `${head}
  \\resumeSubHeadingListStart
    ${body}
  \\resumeSubHeadingListEnd`;
  }
  if (sec.kind === "achievements") {
    // Each item is one freeform line; split on the first " - " into bold
    // title and plain detail. If no separator, render the whole line bold.
    const rows = sec.items
      .map((it) => {
        const raw = (it.text ?? "").trim();
        const idx = raw.indexOf(" - ");
        if (idx === -1) {
          return `     \\textbf{${tex(raw)}} \\\\`;
        }
        const title = raw.slice(0, idx);
        const detail = raw.slice(idx + 3);
        return `     \\textbf{${tex(title)} }{- ${tex(detail)}} \\\\`;
      })
      .join("\n");
    return `${head}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
${rows}
    }}
 \\end{itemize}`;
  }
  // skills
  const rows = sec.items.map((g) => `     \\textbf{${tex(g.category)}}{: ${tex(g.items)}} \\\\`).join("\n");
  return `${head}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
${rows}
    }}
 \\end{itemize}`;
}

function renderContact(r: Resume): string {
  const c = r.contact;
  const bits: string[] = [];
  if (c.phone) bits.push(tex(c.phone));
  if (c.email) bits.push(`\\href{mailto:${c.email}}{\\underline{${tex(c.email)}}}`);
  for (const l of c.links) bits.push(`\\href{${l.href}}{\\underline{${tex(l.label)}}}`);
  return `\\begin{center}
    \\textbf{\\Huge \\scshape ${tex(c.name)}} \\\\ \\vspace{1pt}
    \\small ${bits.join(" $|$ ")}
\\end{center}`;
}

// Jake Gutierrez preamble. Adapted from the canonical template.
const PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

% Tectonic compiles via XeTeX, which handles Unicode glyph mapping natively.
% The pdfTeX-specific \input{glyphtounicode} and \pdfgentounicode=1 lines from
% the canonical Jake Gutierrez template are omitted because they'd undefined-
% control-sequence-error under XeTeX.

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.7in}
\addtolength{\textheight}{1.4in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`;

export function renderJake(resume: Resume): string {
  const sections = resume.sections.map(renderSection).join("\n\n");
  return `${ATTRIBUTION}${PREAMBLE}
\\begin{document}

${renderContact(resume)}

${sections}

\\end{document}
`;
}
