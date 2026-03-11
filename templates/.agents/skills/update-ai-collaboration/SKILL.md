---
name: update-ai-collaboration
description: >
  Update the current project's AI collaboration infrastructure
  and project governance to match the latest ai-collaboration-installer
  templates. Intelligently merges template changes while
  preserving project-specific customizations.
---

# Update Project

## Step 1: Read project config

Read `collaborator.json` from project root. Extract:
- `project`, `org`
- `language`
- `modules`
- `templateSource`
- `files.managed` / `files.merged` / `files.ejected`

## Step 2: Locate and refresh template source

1. If `~/.ai-collaboration-installer/` does not exist, report error and stop:
   "Template source not found. Please install first:
   curl -fsSL https://raw.githubusercontent.com/fitlab-ai/ai-collaboration-installer/main/install.sh | sh"
2. Run `git -C ~/.ai-collaboration-installer pull` to fetch the latest templates.
3. Record the template source's current commit SHA (`git -C ~/.ai-collaboration-installer rev-parse --short HEAD`).

Resolve the template root from `templateSource` (default: `templates/`).
All update inputs must be rendered from that template tree, not from the
project's own files.

## Step 3: Determine update scope and classify files

### 3.0 Sync file registry

Read `lib/defaults.json` from the template source and compare its file lists
against the project's `collaborator.json`, automatically appending new entries:

1. For each entry in `defaults.json`'s `files.managed`:
   if it does NOT appear in the project's `managed`, `merged`, or `ejected` lists,
   append it to the project's `files.managed`.
2. For each entry in `defaults.json`'s `files.merged`:
   if it does NOT appear in the project's `managed`, `merged`, or `ejected` lists,
   append it to the project's `files.merged`.
3. Entries already in `files.ejected` are never touched (user has full ownership,
   highest priority).
4. Custom entries added by the project to `collaborator.json` are kept as-is
   (add-only, never remove).

If new entries were added, update the in-memory file lists immediately so that
subsequent steps use the updated lists.
List all newly added entries in the final report so the user is aware.

### 3.1 Module filtering

Only process files belonging to modules listed in `collaborator.json.modules`.

### 3.2 File classification

**File classification priority** (high → low):
1. Paths listed in `files.ejected` → **ejected** (user fully owns, do not touch)
2. Paths or glob patterns in `files.merged` → **merged** (AI intelligent merge)
3. Paths listed in `files.managed` → **managed** (template overwrites)

**Critical**: Even if a file lives inside a managed directory, if it matches
ANY glob pattern in `files.merged`, it MUST use the merged strategy.
Match glob patterns against the file's relative path in the project.

### Glob matching semantics

Patterns follow standard glob rules:
- `*` matches a single path component (does not cross `/`).
  Example: `*/test.*` matches `commands/test.md` but NOT `.claude/commands/test.md`.
- `**` matches zero or more path components (any depth).
  Example: `**/test.*` matches `test.md`, `commands/test.md`, and `.claude/commands/test.md`.
- Patterns are matched against the file's **full relative path** from the project root.

## Step 4: Process managed files

For each template file under a managed directory/path, follow these sub-steps in order:

### 4.0 Exclude merged / ejected files (MUST run first)

When iterating files inside a managed directory, **check each file's target
relative path** against every entry (exact path or glob pattern) in
`files.merged` and `files.ejected`.
**If it matches, skip the file** — it will be handled in Step 5 or Step 6.

> **Example**: `.agents/skills/` is a managed directory, but `files.merged`
> contains `.agents/skills/test/SKILL.*`. When processing that directory:
> - `.agents/skills/commit/SKILL.md` → no merged match → **process as managed**
> - `.agents/skills/test/SKILL.md` → matches `.agents/skills/test/SKILL.*` → **skip, leave for Step 5**
>
> **Common mistake**: batch-processing the entire managed directory first, then
> handling merged files separately. This overwrites merged files with template
> content, destroying user customizations (e.g., filled-in TODOs).

### 4.1 Language selection

Based on the `language` field:
- `zh-CN`: prefer `.zh-CN.*` variant, output to target path without
  `.zh-CN.` suffix; skip the English counterpart. If no `.zh-CN.*`
  variant exists, fall back to the English file.
- `en` (default): use non-`.zh-CN.*` files; skip `.zh-CN.*` files.
- Each target path receives exactly ONE language version.

### 4.2 Render placeholders

Template files use two types of placeholders:

**Content placeholders**: Double-brace placeholders for `project` and `org`
within the template text. During rendering, replace them with the actual values
from collaborator.json's `project` and `org` fields.

**Path placeholders**: `_project_` in file or directory names, replaced with
the project name.

> **Warning**: Never skip rendering and copy template files as-is. Skipping
> rendering leaves unresolved placeholders in the output, causing massive
> spurious changes on the next run and breaking idempotency.

### 4.3 Write

- Overwrite existing local files
- Create new files that exist in the template but not locally
- Flag files removed from the template source; do not auto-delete them

## Step 5: Process merged files (template-based merge with delta extraction)

Render the latest template version (same language selection and placeholder
rendering rules as Step 4), then read the current local file.

**If the local file does not exist** (first-time setup), write the rendered
template directly and skip merge.

If the local file exists, execute the following merge algorithm:

### 5.1 Use template as the base

Use the rendered new template as the output base. The template represents
best practices; its structure and content are authoritative.

### 5.2 Extract deltas from local file

Scan the local file for content that goes beyond the template (user deltas):
- **Filled TODOs**: Template TODO placeholders replaced with actual content
- **Added sections**: Content in local file that does not exist in template
- **Extended content**: Supplementary details added to existing template sections

### 5.3 Merge deltas into template

Insert extracted deltas into appropriate positions in the new template:
- Filled TODOs → replace the corresponding TODO placeholder
- Added sections → insert at the most relevant location
- Extended content → merge into the corresponding section

### 5.4 Full read-through

Review the merged file for logical completeness. Verify:
- Deltas are placed correctly
- No duplicate content
- Document structure is coherent

### 5.5 Conflict handling

When user-modified content conflicts with new template content:
- Keep the template version (template authority principle)
- Flag the conflict in the report so the user can confirm

### 5.6 Remaining TODOs

After merge, if template TODOs remain unfilled by local file content,
flag them in the report for the user.

## Step 6: Process ejected files

- **If the local file already exists**: do not touch it (ejected = user owns it).
- **If the local file does not exist** (first-time setup): render from template
  and write it once. Future updates will skip it.

## Step 7: Update collaborator.json

### Self-update detection

Before updating `templateVersion`, compare the current project's git remote URL
with `~/.ai-collaboration-installer/`'s remote URL. If they match (i.e., the
project IS the template source repository), and steps 4-6 produced no file
changes, skip the `templateVersion` update and report the project as up-to-date.

> **Rationale**: The template source repo has a version tracking loop —
> updating templateVersion → commit → SHA changes → next update needs to change
> templateVersion again. When no substantive file changes occurred, skipping
> this field breaks the cycle.

### Regular update

Set `templateVersion` to the template source's current commit SHA
(recorded in Step 2).
Keep `templateSource` unchanged unless the user explicitly wants to move
to a different template tree.

## Step 8: Verify and output report

**Direction check**: Before outputting the report, spot-check with `git diff`
that the change direction is correct (correct: new template content → local;
wrong: reverting rendered content back to placeholders). If wrong-direction
changes are found, pause and investigate.

Output the report, then **STOP** — do not make other changes to the project.
