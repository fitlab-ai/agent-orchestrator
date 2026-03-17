---
name: sync-issue
description: >
  Sync task progress to the corresponding GitHub Issue as a comment.
  Triggered when the user requests syncing progress to an Issue.
  Argument: task-id.
---

# Sync Progress to Issue

Sync task progress to its associated GitHub Issue. Argument: task-id.

## Execution Flow

### 1. Verify Task Exists

Search for the task in priority order:
- `.agent-workspace/active/{task-id}/task.md`
- `.agent-workspace/blocked/{task-id}/task.md`
- `.agent-workspace/completed/{task-id}/task.md`

Note: `{task-id}` format is `TASK-{yyyyMMdd-HHmmss}`, e.g. `TASK-20260306-143022`

### 2. Read Task Information

From task.md, extract:
- `issue_number` (required - if missing, prompt user)
- Task title, description, status
- `current_step`, `created_at`, `updated_at`

### 3. Read Context Files

Check and read (if they exist):
- `analysis.md` - Requirement analysis
- `plan.md` - Technical plan
- `implementation.md` - Implementation report
- `review.md` - Review report

### 4. Detect Delivery Status

Run the following checks in order; if any step fails, fall back to "Mode C: In Development" and do not invent unverified information.

**a) Extract the commit hash**

From `## Activity Log` in task.md, find the last `**Commit** by` entry. The activity log format is fixed as:

```text
**Commit** by {agent} — {hash} {subject}
```

Extract the first token as the commit hash. If none is found, mark it as "no commit".

**b) Check whether the commit is on a protected branch**

If a commit hash exists, run:

```bash
git branch -a --contains {commit-hash} 2>/dev/null
```

Decision rules:
- Output contains `main` or `master` -> merged into the primary branch; record the branch name
- Output matches a `{major}.{minor}.x` branch name -> merged into a release branch; record the branch name
- Otherwise -> not on a protected branch

**c) Check the linked PR**

Inspect the `pr_number` field in task.md. If it exists, run:

```bash
gh pr view {pr-number} --json state,mergedAt
```

Use the result to classify the PR as `OPEN`, `MERGED`, or another state.

**d) Check the Issue state**

Run:

```bash
gh issue view {issue-number} --json state
```

Record whether the Issue is currently `OPEN` or `CLOSED`.

**e) Determine the delivery mode**

Choose the summary mode using the following priority:

| Condition | Mode |
|------|------|
| commit is on a protected branch | Mode A: Completed |
| a PR exists and its state is `OPEN` or `MERGED` | Mode B: PR Stage |
| otherwise | Mode C: In Development |

Priority must be `Mode A > Mode B > Mode C`. Even if a PR exists, if the commit is already on a protected branch, treat it as completed.

### 5. Sync Labels

Sync Issue labels based on the delivery status detected in step 4.

**a) Check whether the label system is initialized**

Run:

```bash
gh label list --search "type:" --limit 1 --json name --jq 'length'
```

Decision rules:
- Returns `0` -> the standard label set is missing. Run the `init-labels` skill first (idempotent), then rerun this step
- Returns non-`0` -> continue with label synchronization

**b) Sync the type label**

Map the `type` field from task.md using the following table:

| task.md type | GitHub label |
|---|---|
| bug | `type: bug` |
| feature | `type: feature` |
| enhancement | `type: enhancement` |
| documentation | `type: documentation` |
| dependency-upgrade | `type: dependency-upgrade` |
| task | `type: task` |
| anything else (including refactoring) | skip |

When the type maps to a standard label, run:

```bash
gh issue edit {issue-number} --add-label "{type-label}"
```

If the type is unmapped, skip it and do not create a new label.

**c) Sync the status label**

First read the existing `status:` labels on the Issue:

```bash
gh issue view {issue-number} --json labels --jq '.labels[].name | select(startswith("status:"))'
```

Remove each existing `status:` label:

```bash
gh issue edit {issue-number} --remove-label "{status-label}"
```

Then decide whether to add a new `status:` label using the following priority:

| Condition | Action |
|---|---|
| Task is under `blocked/` | add `status: blocked` |
| Mode A: Completed | add no new status label |
| Mode B: PR is `MERGED` | add no new status label |
| Mode B: PR is `OPEN` | add `status: in-progress` |
| Mode C + `current_step` ∈ {`requirement-analysis`, `technical-design`} | add `status: pending-design-work` |
| Mode C + `current_step` ∈ {`implementation`, `code-review`, `refinement`} | add `status: in-progress` |

If a new status label is needed, run:

```bash
gh issue edit {issue-number} --add-label "{status-label}"
```

**d) Sync the in: labels**

Extract affected file paths from `implementation.md` first, or fall back to `analysis.md`:
- Prefer the file lists under `## Modified Files` / `## New Files`
- If the implementation report does not exist, use the affected file list from the analysis report

For each file path:
1. Take the first directory segment as the module name
2. Deduplicate modules
3. Check whether the corresponding label exists in the repository:

```bash
gh label list --search "in: {module}" --limit 10 --json name --jq '.[].name'
```

4. Only when an exact `in: {module}` label exists, run:

```bash
gh issue edit {issue-number} --add-label "in: {module}"
```

5. **Only add labels; never remove** existing `in:` labels

### 6. Sync Development

If task.md contains `pr_number`, ensure the PR body links the current Issue.

1. Read the PR body:

```bash
gh pr view {pr-number} --json body --jq '.body // ""'
```

2. Check whether the body already contains any of:
- `Closes #{issue-number}`
- `Fixes #{issue-number}`
- `Resolves #{issue-number}`

3. If any keyword already exists, skip the update
4. Otherwise append this text to the end of the body:

```bash
gh pr edit {pr-number} --body "$(cat <<'EOF'
{existing-body}

Closes #{issue-number}
EOF
)"
```

5. If task.md does not contain `pr_number`, record `Development: N/A`

### 7. Generate Progress Summary

Generate a clear progress summary oriented toward **project managers and stakeholders**:

All three modes share these rules:
- Remove the `**Task ID**` line from the header, and show the commit hash inside the status description when available
- When links are needed, replace `**Related Documents**` with `**Related Links**` and include only GitHub-accessible resources
- Use a unified footer: `*Auto-generated by AI · Internal tracking: {task-id}*`

#### Mode A: Completed

Applies when the commit is already on `main`, `master`, or a `{major}.{minor}.x` release branch.

```markdown
## Task Progress Update

**Updated**: {current time}
**Status**: ✅ Completed, code is already in `{branch}` (`{commit-short}`)

### Completion Summary

- [x] Requirement Analysis - {completion time}
  - {1-2 key takeaways}
- [x] Technical Design - {completion time}
  - {Decision and rationale}
- [x] Implementation - {completion time}
  - {Core implementation delivered}
- [x] Final Delivery - {completion time}
  - {Merge path or outcome}

### Final Changes

| Type | Content |
|------|------|
| Branch | `{branch}` |
| Commit | [`{commit-short}`](../../commit/{commit-hash}) |
| PR | {PR link or `N/A`} |
| Issue | {issue-state} |

---
*Auto-generated by AI · Internal tracking: {task-id}*
```

Requirements:
- Use "Completion Summary" instead of "Completed Steps" to emphasize the final outcome
- Do not include "Current Progress" or "Next Steps"
- Keep link information inside the "Final Changes" table; include the PR only when it exists

#### Mode B: PR Stage

Applies when there is no protected-branch commit, but a linked PR exists in `OPEN` or `MERGED` state.

```markdown
## Task Progress Update

**Updated**: {current time}
**Status**: PR [#{pr-number}](../../pull/{pr-number}) {awaiting review or merged}{ (`{commit-short}`) optional}

### Completed Steps

- [x] Requirement Analysis - {completion time}
  - {1-2 key takeaways}
- [x] Technical Design - {completion time}
  - {Decision and rationale}
- [x] Implementation - {completion time}
  - {Core implementation delivered}
- [ ] Code Review
- [ ] Final Commit

### Current Progress

{Current PR state, review status, or merge outcome}

### Related Links

- PR: [#{pr-number}](../../pull/{pr-number})

---
*Auto-generated by AI · Internal tracking: {task-id}*
```

Requirements:
- Keep "Completed Steps" and "Current Progress"
- Do not include "Next Steps", because the PR itself is the vehicle for the next action
- Related links must include only GitHub-accessible resources, at minimum the PR

#### Mode C: In Development

Applies when neither a protected-branch commit nor an `OPEN`/`MERGED` PR can be confirmed.

```markdown
## Task Progress Update

**Updated**: {current time}
**Status**: {status description}{ (`{commit-short}`) optional}

### Completed Steps

- [x] Requirement Analysis - {completion time}
  - {1-2 key takeaways}
- [x] Technical Design - {completion time}
  - {Decision and rationale}
- [ ] Implementation (in progress)
- [ ] Code Review
- [ ] Final Commit

### Current Progress

{Description of current step}

### Next Steps

{What needs to happen next}

---
*Auto-generated by AI · Internal tracking: {task-id}*
```

Requirements:
- Keep "Completed Steps", "Current Progress", and "Next Steps"
- Do not include a "Related Links" section, because there may not be any suitable public GitHub resources yet

**Summary principles**:
- **Stakeholder-oriented**: Focus on progress, decisions, and timeline
- **Status-aware**: Choose the mode from detected delivery status instead of assuming a fixed "commit -> PR -> merge" path
- **Concise**: Avoid excessive technical detail
- **Logically clear**: Chronological progress flow
- **Human-readable**: Use plain language, not jargon

### 8. Post to Issue

```bash
gh issue comment {issue-number} --body "$(cat <<'EOF'
{generated summary}
EOF
)"
```

### 9. Update Task Status

Get the current time:

```bash
date "+%Y-%m-%d %H:%M:%S"
```

Add or update `last_synced_at` field in task.md to `{current time}`.
- **Append** to `## Activity Log` (do NOT overwrite previous entries):
  ```
  - {yyyy-MM-dd HH:mm:ss} — **Sync to Issue** by {agent} — Progress synced to Issue #{issue-number}
  ```

### 10. Inform User

```
Progress synced to Issue #{issue-number}.

Synced content:
- Completed steps: {count}
- Current status: {status}
- Labels: type={type-label or skipped}, status={status-label or cleared}, in:={count added}
- Development: {Closes keyword appended / already linked / skipped because no PR}
- Next step: {description or N/A}

View: https://github.com/{owner}/{repo}/issues/{issue-number}
```

## Notes

1. **Issue number required**: Task must have `issue_number` in task.md. If missing, prompt user.
2. **Audience**: The `sync-issue` skill is for stakeholders; the `sync-pr` skill is for code reviewers. Different focus.
3. **Timing**: Sync after completing important phases (analysis, design, implementation, review) or when blocked.
4. **Avoid spam**: Don't sync too frequently.

## Error Handling

- Task not found: Prompt "Task {task-id} not found"
- Missing issue number: Prompt "Task has no issue_number field"
- Issue not found: Prompt "Issue #{number} not found"
- gh auth failure: Prompt "Please check GitHub CLI authentication"
