# apted resume rules

## Ground truth

- The user's `master_resume` (JSON) is the only factual source for experience, projects, education, and skills.
- Never invent, inflate, or fabricate facts. No fake metrics, no embellished scope.
- Past `resume_versions` inform *framing and emphasis* (which bullets to lead with, how to phrase impact for a given role). They are not factual sources.
- If the user explicitly supplies a new real fact in a chat instruction (e.g. "I also led a team of 6"), it may be incorporated, and the app should offer to save it back to the master.

## Selection (when tailoring)

Selection happens at TWO levels: which sections to include, and which items within each kept section.

**Section-level inclusion.** The master holds every section the user might ever want (Education, Experience, Projects, Leadership & Activities, Achievements, Skills, etc.). The tailored draft is a subset — drop entire sections when the JD doesn't call for them. Do not include a section just because it exists in the master. Common patterns:

- Senior IC SWE role with strong project signals → keep Experience, Projects, Skills; drop Leadership & Activities if Achievements is more JD-aligned. Drop Achievements if neither hackathons nor awards are relevant.
- People-management / PM role → keep Leadership & Activities (shows ownership and team work) over a project-grinding section.
- New-grad with sparse work history → keep Education, Projects, Achievements; Experience may be thin or absent.
- Skills section is almost always worth keeping but can be dropped if the JD is pure soft-skills/communications.

When two sections compete for page real estate, pick the one whose content most directly answers the JD's signals. Two sections covering similar ground (e.g. Leadership and Achievements) is usually wasteful — pick one.

**Item-level selection.** Within kept sections, the same rules apply at finer grain:

- Domain match matters. A sales JD should surface customer-facing, revenue, and communication work; an SWE JD should surface technical builds and shipped systems. Don't include irrelevant items just because they exist in the master.
- If items carry a `tags` array, treat it as a soft selection signal: when the JD aligns with certain tags, prefer items carrying matching tags. Items without tags compete on bullet content alone.
- Aim for 3–5 strong experiences/projects total rather than padding the page with everything.

**Worked example.** Same master, two JDs:

- *JD: "Backend engineer, distributed systems, Go, Kubernetes"* — keep Experience (server-side internships), Projects (anything shipping), Skills. Drop Leadership & Activities and Achievements unless the achievements are technical (e.g. winning a systems hackathon track).
- *JD: "Engineering manager, B2B SaaS"* — keep Experience, Leadership & Activities (PM/ownership signal), Skills. Drop Projects (less load-bearing for managers) and Achievements unless they show team-leading wins.

## Formatting (hard constraints)

- Output must fit on one page when rendered through Jake Gutierrez's LaTeX template.
- No em-dashes (—) anywhere. Use commas, semicolons, or sentence breaks.
- No inline bold (`\textbf{}`) inside bullets. Bold is reserved for headings and project names.
- Prioritize shipped, real-user work over coursework or in-progress projects.
- Bullets start with strong verbs, lead with impact, and stay one to two lines each.

## Master JSON schema

The Resume shape is contact + an ordered list of sections. Each section's `kind` picks the renderer.

```json
{
  "contact": {
    "name": "string",
    "phone": "string",
    "email": "string",
    "links": [{ "label": "string", "href": "string" }]
  },
  "sections": [
    {
      "id": "string",
      "kind": "experience",
      "title": "Experience",
      "items": [
        {
          "id": "string",
          "title": "string",
          "org": "string",
          "location": "string",
          "start": "string",
          "end": "string",
          "bullets": [{ "id": "string", "text": "string" }],
          "tags": ["string"]
        }
      ]
    },
    {
      "id": "string",
      "kind": "projects",
      "title": "Projects",
      "items": [
        {
          "id": "string",
          "name": "string",
          "stack": "string",
          "start": "string",
          "end": "string",
          "bullets": [{ "id": "string", "text": "string" }],
          "tags": ["string"]
        }
      ]
    },
    {
      "id": "string",
      "kind": "education",
      "title": "Education",
      "items": [
        {
          "id": "string",
          "school": "string",
          "degree": "string",
          "location": "string",
          "start": "string",
          "end": "string",
          "bullets": [{ "id": "string", "text": "string" }],
          "tags": ["string"]
        }
      ]
    },
    {
      "id": "string",
      "kind": "achievements",
      "title": "Achievements",
      "items": [
        { "id": "string", "text": "string" }
      ]
    },
    {
      "id": "string",
      "kind": "skills",
      "title": "Technical Skills",
      "items": [
        { "id": "string", "category": "string", "items": "string" }
      ]
    }
  ]
}
```

Notes on the schema:

- `start` and `end` are free-form strings (e.g. "May 2024", "Present"). The renderer joins them with " -- " when both are present.
- `skills` items use a single `items` string (e.g. "TypeScript, Python, Go"), not an array.
- `tags` is a soft signal only; omit when not useful.
- Section ordering in the JSON is the order rendered on the page.

## JSON → Jake's template mapping

- `contact` → `\begin{center} \textbf{\Huge \scshape NAME} \\ phone $|$ \href{mailto:email}{email} $|$ \href{href}{label} ... \end{center}`
- `experience` items → `\resumeSubheading{title}{start -- end}{org}{location}` + `\resumeItemListStart` { `\resumeItem{bullet.text}` ... } `\resumeItemListEnd`
- `projects` items → `\resumeProjectHeading{\textbf{name} $|$ \emph{stack}}{start -- end}` + bullets (drop the ` $|$ \emph{stack}` part when `stack` is empty)
- `education` items → `\resumeSubheading{school}{location}{degree}{start -- end}` + bullets
- `skills` items → one line per group: `\textbf{category}{: items} \\`
- `achievements` items → one freeform line per entry. The renderer splits `text` on the first ` - ` (space-dash-space) into title + detail, emitting `\textbf{title }{- detail} \\`. If no separator, the whole line renders as `\textbf{text} \\`.

Empty sections are dropped entirely — Jake's `\resumeItemListStart` macro expands to `\begin{itemize}` which LaTeX rejects when empty.

## Output contract

- Return a single, complete JSON object matching the schema above. Never partial diffs, never free-text resumes.
- Preserve every `id` field on sections, items, and bullets exactly when editing. Mint new ids (short kebab-case) only for genuinely new content.
- Reuse existing bullet text verbatim when it already fits — rewrite only when tailoring genuinely improves the match.
- No prose, no code fences, no markdown around the JSON. The server parses your response directly.
- Preserve every item's `tags: string[]` array across edits. If an item has no tags, return `"tags": []` (an empty array, not null and not omitted).
