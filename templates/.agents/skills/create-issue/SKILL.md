---
name: create-issue
description: >
  Create a GitHub Issue from a task file.
  Triggered when the user asks to create an Issue for a task. Argument: task-id.
---

# Create Issue

## Boundary / Critical Rules

- The only outputs of this skill are a newly created GitHub Issue and the `issue_number` field written back to `task.md`
- Build the Issue title and body from `task.md` only. Do not read `analysis.md`, `plan.md`, `implementation.md`, or other task artifacts
- Do not sync analysis, design, implementation, or review details in this skill; that belongs to `sync-issue`
- After executing this skill, you **must** immediately update task status in `task.md`

## Steps

### 1. Verify Prerequisites

Check required file:
- `.agent-workspace/active/{task-id}/task.md` - Task file

Check that GitHub CLI is available and authenticated:

```bash
gh auth status
```

Note: `{task-id}` format is `TASK-{yyyyMMdd-HHmmss}`, e.g. `TASK-20260306-143022`

If the task file does not exist, prompt `Task {task-id} not found`.

If the `issue_number` field already exists in task.md front matter and its value is neither empty nor `N/A`, ask the user whether to reuse the existing Issue or create a new one.

### 2. Extract Task Information

Read from `task.md` only:
- Task title
- `## Description` content
- `## Requirements` list
- `type` field

If the description is empty, prompt the user to update the task description first.

### 3. Build Issue Content

Issue content rules:
- **Title**: use the task title
- **Body**: include only the description and requirement list
- **Label**: map the task type to a standard `type:` label

Recommended body structure:

```markdown
## Description

{task-description}

## Requirements

- [ ] {requirement-1}
- [ ] {requirement-2}
```

Label mapping:

| task.md type | GitHub label |
|---|---|
| `bug`, `bugfix` | `type: bug` |
| `feature` | `type: feature` |
| `enhancement` | `type: enhancement` |
| `docs`, `documentation` | `type: documentation` |
| `dependency-upgrade` | `type: dependency-upgrade` |
| `task`, `chore`, `refactor`, `refactoring` | `type: task` |
| anything else | skip |

If a label is mapped, check whether it exists first:

```bash
gh label list --search "{type-label}" --limit 20 --json name --jq '.[].name'
```

Only pass `--label "{type-label}"` when an exact matching label exists; otherwise skip the label to avoid Issue creation failure.

### 4. Create Issue

Execute:

```bash
gh issue create --title "{title}" --body "{body}" --label "{type-label}"
```

If the previous step decided to skip the label, omit the `--label` argument.

Record the returned Issue URL and extract the Issue number from the trailing path segment:

```bash
issue_url="$(gh issue create ...)"
issue_number="${issue_url##*/}"
```

### 5. Update Task Status

Get the current time:

```bash
date "+%Y-%m-%d %H:%M:%S"
```

Update `.agent-workspace/active/{task-id}/task.md`:
- Add or update `issue_number`: `{issue-number}`
- `updated_at`: {current time}
- **Append** to `## Activity Log` (do NOT overwrite previous entries):
  ```
  - {yyyy-MM-dd HH:mm:ss} — **Create Issue** by {agent} — Issue #{issue-number} created
  ```

### 6. Inform User

> **IMPORTANT**: All TUI command formats listed below must be output in full. Do not show only the format for the current AI agent.

Output format:
```
Issue created for task {task-id}.

Issue details:
- Number: #{issue-number}
- URL: {issue-url}
- Label: {type-label or skipped}

Output:
- `issue_number` written back to task.md

Next step - sync task progress to the Issue:
  - Claude Code / OpenCode: /sync-issue {task-id}
  - Gemini CLI: /{{project}}:sync-issue {task-id}
  - Codex CLI: $sync-issue {task-id}
```

## Completion Checklist

- [ ] Created the GitHub Issue
- [ ] Built the Issue title and body from `task.md` only
- [ ] Recorded `issue_number` in task.md
- [ ] Updated `updated_at` in task.md
- [ ] Appended an Activity Log entry to task.md
- [ ] Informed the user of the next step (must include all TUI command formats)
- [ ] **Did not read analysis/design/implementation artifacts to build the Issue**

## STOP

After completing the checklist, **stop immediately**. Do not sync detailed Issue content or continue the workflow.

## Notes

1. **Responsibility boundary**: `create-issue` only creates the base Issue; detailed progress sync belongs to `sync-issue`
2. **Avoid duplicates**: confirm with the user if `issue_number` already exists
3. **Label tolerance**: if standard labels are not initialized, skipping the label is acceptable and should not block Issue creation

## Error Handling

- Task not found: prompt `Task {task-id} not found`
- `gh` missing or unauthenticated: prompt `GitHub CLI is not available or not authenticated`
- Empty description: prompt `Task description is empty, please update task.md first`
- Create failure: prompt `Failed to create GitHub Issue`
