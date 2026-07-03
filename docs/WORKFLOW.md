# Development Workflow

This document describes how work is created, worked on, and completed. Share this with any agent or contributor joining the project.

## Creating Work

### Linear is the source of truth

All work is tracked in Linear. Every feature, bug, or improvement gets a Linear issue before any code is written.

- **Epics**: Large features or multi-part work. Created as a single issue in Linear with a description outlining scope and sub-tasks. The epic issue number is referenced in commits, handoff docs, and comments.
- **Issues**: Individual units of work. Each issue should be small enough to complete in one worktree session. If an issue spans multiple sessions, it should be broken into smaller issues.

### How to create an issue

1. Search Linear first to confirm the issue doesn't already exist (avoid duplicates)
2. Create the issue with a clear title and description
3. If it's part of a larger effort, add a comment linking it to the epic
4. Set priority: 1=urgent, 2=high, 3=medium, 4=low

### Writing a good issue

A good issue description includes:
- **What**: The change to make
- **Why**: The problem or motivation
- **Context**: Relevant file paths, current behavior, expected behavior
- **Constraints**: Anything the agent should know (don't touch X, must preserve Y, etc.)

## Working on an Issue

### Start from a clean main

```bash
git checkout main
git pull origin main
```

### Create a feature branch

```bash
git checkout -b feature/<short-description>
```

### Worktrees (for parallel work)

Worktrees allow working on multiple features simultaneously without switching branches. Create them as sibling directories to the main repo, not nested inside it:

```bash
git worktree add ../<project-name>-<short-description> -b feature/<short-description>
cd ../<project-name>-<short-description>
npm install  # and any other setup steps
```

### Write a handoff doc

Before starting implementation in a worktree, write a handoff doc at `docs/handoff/YYYY-MM-DD-<short-description>.md`. This allows another agent to pick up the work in a fresh session. Include:

- **Branch and worktree path**
- **Linear issue number**
- **What exists now** (current state, key files, relevant line numbers)
- **What to build** (each feature or change, with implementation hints)
- **How to test** (which commands to run, what should pass)
- **Architecture constraints** (patterns to follow, things not to change)

### Implement

- Follow existing patterns in the codebase. Don't reinvent what's already there.
- Read at least one relevant existing file before writing new code.
- Commit early and often with clear messages.

### Commit message convention

Prefix commits with:
- `feat:` — new feature
- `fix:` — bug fix
- `style:` — visual/UI-only change
- `docs:` — documentation only
- `chore:` — tooling, dependencies, config
- `perf:` — performance improvement
- `refactor:` — code restructuring without behavior change

Include the Linear issue number in the merge commit or PR description (e.g. "Merge PR: Drawer UI improvements (PRE-81)").

## Completing Work

### Verify before claiming done

Before merging, run and confirm:

1. **Tests pass** — Run the full test suite. No failures allowed.
2. **Type checking passes** — `tsc --noEmit` must exit clean.
3. **Build succeeds** — Any build steps (extension build, next build, etc.) must complete without errors.

Do not claim work is complete without running these. Evidence before assertions.

### Merge to main

```bash
# From the feature branch (or worktree)
git add -A
git commit -m "feat: description"

# Switch to main and merge
git checkout main
git pull origin main
git merge feature/<name> --no-ff -m "Merge PR: <description> (<ISSUE-ID>)"
git push origin main
```

The `--no-ff` flag preserves the merge commit so the feature branch history is visible.

### Clean up

```bash
# Remove the worktree if used
git worktree remove ../<project-name>-<short-description>

# Delete the feature branch
git branch -d feature/<name>
```

### Update Linear

After merging:
- Comment on the Linear issue with a summary of what was merged
- Include the issue ID in the merge commit message
- The issue can be closed/marked as done

## Agent Session Boundaries

### Starting a new session in a worktree

When a new agent session opens in an existing worktree, it should:

1. Read the handoff doc (if one exists in `docs/handoff/`)
2. Read any design docs in `docs/plans/`
3. Check `git log` to see what's been done so far
4. Run tests to verify the current state passes
5. Continue from where the previous session left off

### Ending a session

Before ending a session:
1. Commit all work (no uncommitted changes left behind)
2. Update the handoff doc if work is incomplete — note what's done and what remains
3. Comment on the Linear issue with progress

## Key Principles

- **Linear first**: No code without an issue
- **Test before merge**: All tests must pass, no exceptions
- **Handoff docs**: Any worktree should have a handoff doc so another agent can continue
- **Clean commits**: Use the prefix convention, keep messages clear
- **Clean merge**: `--no-ff` merge, push to main, clean up branch and worktree
- **Don't break main**: Feature branches hold the risk; main should always be green