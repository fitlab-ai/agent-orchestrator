---
name: init-labels
description: >
  Initialize the repository's standard GitHub Labels taxonomy in one pass.
  Create the common labels, auto-detect `in:` labels from the project structure,
  do not create `theme:` labels, overwrite exact-match GitHub defaults, and report unmatched defaults.
---

# Initialize GitHub Labels

Initialize the repository's standard GitHub Labels taxonomy.

## Execution Flow

### 1. Verify prerequisites

Run:

```bash
command -v gh
gh auth status
gh repo view --json nameWithOwner
```

If any command fails, tell the user to install or authenticate `gh` first and stop.

Create a temporary workspace for the rest of the steps:

```bash
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
```

### 2. Snapshot the current labels

Capture the current label names before making changes. Keep this snapshot until the skill finishes.

```bash
gh label list --limit 200 > "$tmpdir/existing.txt"
cut -f1 "$tmpdir/existing.txt" > "$tmpdir/existing-names.txt"
cat "$tmpdir/existing-names.txt"
```

### 3. Create the common labels

Create or update the common label set with `--force` so the skill stays idempotent.

```bash
cat <<'EOF' > "$tmpdir/common.tsv"
type: bug	DED6F9	A general bug
type: enhancement	DED6F9	A general enhancement
type: feature	DED6F9	A general feature
type: documentation	DED6F9	A documentation task
type: dependency-upgrade	DED6F9	A dependency upgrade
type: task	DED6F9	A general task
status: waiting-for-triage	FCF1C4	An issue we've not yet triaged or decided on
status: waiting-for-feedback	FCF1C4	We need additional information before we can continue
status: feedback-provided	FCF1C4	Feedback has been provided
status: feedback-reminder	FCF1C4	We've sent a reminder that we need additional information before we can continue
status: pending-design-work	FCF1C4	Needs design work before any code can be developed
status: in-progress	FCF1C4	Work is actively being developed
status: on-hold	FCF1C4	We can't start working on this issue yet
status: blocked	FCF1C4	An issue that's blocked on an external project change
status: declined	FCF1C4	A suggestion or change that we don't feel we should currently apply
status: duplicate	FCF1C4	A duplicate of another issue
status: invalid	FCF1C4	An issue that we don't feel is valid
status: superseded	FCF1C4	An issue that has been superseded by another
status: bulk-closed	FCF1C4	An outdated, unresolved issue that's closed in bulk as part of a cleaning process
status: ideal-for-contribution	FCF1C4	An issue that a contributor can help us with
status: backported	FCF1C4	An issue that has been backported to maintenance branches
status: waiting-for-internal-feedback	FCF1C4	An issue that needs input from a member or another team
good first issue	F9D9E6	Good for newcomers
help wanted	008672	Extra attention is needed
dependencies	0366d6	Pull requests that update a dependency file
EOF

while IFS="$(printf '\t')" read -r name color description; do
  [ -n "$name" ] || continue
  gh label create "$name" --color "$color" --description "$description" --force
done < "$tmpdir/common.tsv"
```

`good first issue` and `help wanted` intentionally use the exact GitHub default names so the commands above overwrite their color and description in place.

### 4. Auto-detect `in:` labels

Detect top-level project directories, skip hidden folders and common generated folders, and create one `in:` label per remaining directory. If no valid directory remains, create only `in: core`.

Do not create any `theme:` labels in this skill.

```bash
project_dirs=$(
  find . -mindepth 1 -maxdepth 1 -type d ! -name '.*' |
  sed 's#^\./##' |
  grep -Ev '^(node_modules|vendor|dist|build|out|target|tmp|temp|log|logs|coverage|__pycache__)$' |
  sort -u
)

if [ -z "$project_dirs" ]; then
  project_dirs="core"
fi

printf '%s\n' "$project_dirs" | while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  gh label create "in: $dir" \
    --color EBF8DF \
    --description "Issues in $dir" \
    --force
done
```

### 5. Report unmatched GitHub default labels

GitHub's default labels with exact name matches were already updated by `--force`. For the defaults that do not exactly match this taxonomy, list any that still exist and do not delete them automatically.

```bash
gh label list --limit 200 > "$tmpdir/final.txt"
cut -f1 "$tmpdir/final.txt" > "$tmpdir/final-names.txt"

: > "$tmpdir/unmatched-defaults.txt"
for label in bug documentation duplicate enhancement invalid question wontfix; do
  if grep -Fqx "$label" "$tmpdir/final-names.txt"; then
    printf '%s\n' "$label" >> "$tmpdir/unmatched-defaults.txt"
  fi
done
```

### 6. Summarize the result

Report the result to the user:

```bash
common_count="$(wc -l < "$tmpdir/common.tsv" | tr -d ' ')"
in_count="$(printf '%s\n' "$project_dirs" | sed '/^$/d' | wc -l | tr -d ' ')"

echo "GitHub Labels initialized."
echo
echo "Summary:"
echo "- Common labels created or updated: $common_count"
echo "- in: labels created or updated: $in_count"
echo "- Exact-match GitHub defaults overwritten: good first issue, help wanted"

if [ -s "$tmpdir/unmatched-defaults.txt" ]; then
  echo "- Unmatched GitHub defaults still present:"
  sed 's/^/  - /' "$tmpdir/unmatched-defaults.txt"
else
  echo "- Unmatched GitHub defaults still present: none"
fi

echo
echo "Notes:"
echo "- theme: labels were intentionally not created."
echo "- The operation is idempotent because every label uses gh label create --force."
echo "- If the detected in: labels need refinement, adjust them manually after initialization."
```

## Error Handling

- `gh` not found: prompt "GitHub CLI (`gh`) is not installed"
- Authentication failed: prompt "GitHub CLI is not authenticated"
- Repository access failed: prompt "Unable to access the current repository with gh"
- Permission error: prompt "No permission to manage labels in this repository"
- API rate limit: prompt "GitHub API rate limit reached, please retry later"
