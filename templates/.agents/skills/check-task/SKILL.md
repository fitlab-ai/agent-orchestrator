---
name: check-task
description: >
  View a task's current status, workflow progress, and context files.
  This is a read-only operation that reports the task state and suggests
  the appropriate next action. Triggered when the user requests a task
  status check. Argument: task-id.
---

# Check Task Status

## Boundary / Critical Rules

- This skill is **read-only** -- it does not modify any files
- Always check active, blocked, and completed directories

## Steps

### 1. Find Task

Search for the task in this priority order:
1. `.agent-workspace/active/{task-id}/task.md`
2. `.agent-workspace/blocked/{task-id}/task.md`
3. `.agent-workspace/completed/{task-id}/task.md`

Note: `{task-id}` format is `TASK-{yyyyMMdd-HHmmss}`, e.g. `TASK-20260306-143022`

If not found in any directory, prompt "Task {task-id} not found".

### 2. Read Task Metadata

From `task.md`, extract:
- `id`, `title`, `type`, `status`, `workflow`
- `current_step`, `assigned_to`
- `created_at`, `updated_at`
- `issue_number`, `pr_number` (if applicable)

### 3. Check Context Files

Scan and report the existence, round, and status of these artifact types:
- `analysis.md` - Requirement analysis
- `plan.md` - Technical plan
- `implementation.md`, `implementation-r2.md`, ... - Implementation reports
- `review.md`, `review-r2.md`, ... - Review reports

For `implementation` and `review`:
- Scan the task directory for every versioned artifact
- Record the latest round, latest filename, and total rounds for each artifact type
- When `task.md` Activity Log records the latest round, verify it matches the actual latest artifact

### 4. Output Status Report

Format the output with clear structure and status indicators:

```
Task Status: {task-id}
=======================

Basic Info:
- Title: {title}
- Type: {type}
- Status: {status}
- Workflow: {workflow}
- Assigned to: {assigned_to}
- Created: {created_at}
- Updated: {updated_at}

Workflow Progress:
  [done]       Requirement Analysis    analysis.md
  [done]       Technical Design        plan.md
  [current]    Implementation          implementation.md (Round 1)
  [pending]    Code Review             review.md (Round 1 will be created next)
  [pending]    Final Commit

Context Files:
- analysis.md:       exists
- plan.md:           exists
- implementation.md: exists (Round 1, latest)
- review.md:         not started

If multiple rounds exist, list every artifact and mark the latest one, for example:
- implementation.md: exists (Round 1)
- implementation-r2.md: exists (Round 2, latest)
- review.md: exists (Round 1)
- review-r2.md: exists (Round 2, latest)

Next Step:
  Complete implementation, then run the review-task skill with {task-id}
```

**Status indicators**:
- `[done]` - Step completed
- `[current]` - Currently in progress
- `[pending]` - Not started yet
- `[blocked]` - Blocked
- `[skipped]` - Skipped

### 5. Suggest Next Action

Based on the current workflow state, suggest the appropriate next skill. You must show all TUI command formats from every column in the table below, not just the column for the current AI agent:

| Current State | Claude Code / OpenCode | Gemini CLI | Codex CLI |
|--------------|------------------------|------------|-----------|
| analysis complete | `/plan-task {task-id}` | `/{{project}}:plan-task {task-id}` | `$plan-task {task-id}` |
| plan complete | `/implement-task {task-id}` | `/{{project}}:implement-task {task-id}` | `$implement-task {task-id}` |
| implementation complete | `/review-task {task-id}` | `/{{project}}:review-task {task-id}` | `$review-task {task-id}` |
| review passed | `/commit` | `/{{project}}:commit` | `$commit` |
| review has issues | `/refine-task {task-id}` | `/{{project}}:refine-task {task-id}` | `$refine-task {task-id}` |
| task blocked | Unblock or provide required info | — | Unblock or provide required info |
| task completed | No action needed | — | No action needed |

## Notes

1. **Read-only**: This skill only reads and reports -- it does not modify any files
2. **Multi-directory search**: Always check active, blocked, and completed directories
3. **Quick reference**: Use this skill anytime to check where a task stands in the workflow
4. **Versioned artifacts**: `implementation` and `review` must report real rounds instead of only fixed filenames
