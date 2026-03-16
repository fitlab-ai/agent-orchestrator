---
name: refine-task
description: >
  Handle code review feedback and fix issues found during review. Fixes are
  applied in priority order (Blocker -> Major -> Minor). Only addresses
  issues flagged in the review -- no extra changes. Triggered when the user
  requests fixing review issues. Argument: task-id.
---

# Fix Review Issues

## Boundary / Critical Rules

- Fix only what was flagged in the review -- do NOT add unrelated changes or extra "improvements"
- Do NOT auto-commit. Never execute `git commit` or `git add` automatically
- After executing this skill, you **must** immediately update task status in task.md

## Steps

### 1. Verify Prerequisites

Check required files:
- `.agent-workspace/active/{task-id}/task.md` - Task file
- At least one review artifact: `review.md` or `review-r{N}.md`

Note: `{task-id}` format is `TASK-{yyyyMMdd-HHmmss}`, e.g. `TASK-20260306-143022`

If `task.md` is missing or no review artifact exists, prompt the user to complete the prerequisite step first.

Then perform discovery and consistency checks:
1. Scan the task directory for review artifacts (`review.md`, `review-r{N}.md`)
2. Select the highest-round review artifact as `{review-artifact}`
3. Scan implementation reports (`implementation.md`, `implementation-r{N}.md`) and select the highest-round artifact as `{implementation-artifact}`
4. **Consistency check**: compare the most recent Code Review entry in `## Activity Log` against the actual latest review artifact from step 2

If Activity Log and files do not match, stop immediately with:
`Review artifact mismatch: Activity Log references {expected} but file not found. Please verify the review artifact exists.`

### 2. Read Review Report

Carefully read the latest review artifact `{review-artifact}` identified in Step 1 to understand:
- All blocker issues (must fix)
- All major issues (should fix)
- Minor issues (optional optimizations)
- Reviewer's suggestions and recommendations

### 3. Plan Fixes

Categorize and prioritize issues:
1. **Blockers first**: All blocker issues must be resolved
2. **Then major issues**: Address all major issues
3. **Then minor issues**: Address if time permits (optional)

For each issue, determine:
- Which file(s) need changes
- What specific changes to make
- How to verify the fix

### 4. Execute Code Fixes

Fix issues in priority order:

**For each fix**:
1. Read the affected file
2. Apply the fix
3. Verify the fix addresses the review comment
4. Run relevant tests

**Fix principles**:
- Fix only what was flagged -- do NOT add unrelated changes
- Do NOT add extra "improvements" beyond what was requested
- Keep changes minimal and focused

### 5. Run Test Verification

Execute the project's test command. Reference the `test` skill for the project-specific test command.

Ensure all tests still pass after fixes.

### 6. Create Refinement Report

Update `.agent-workspace/active/{task-id}/{implementation-artifact}` and append the fix section.

Use this heading for the appended section:
`## Fix Log (for {review-artifact})`

### 7. Update Task Status

Get the current time:

```bash
date "+%Y-%m-%d %H:%M:%S"
```

Update `.agent-workspace/active/{task-id}/task.md`:
- `current_step`: refinement
- `assigned_to`: {current AI agent}
- `updated_at`: {current time}
- **Append** to `## Activity Log` (do NOT overwrite previous entries):
  ```
  - {yyyy-MM-dd HH:mm:ss} — **Refinement (for {review-artifact})** by {agent} — Fixed {n} blockers, {n} major, {n} minor issues
  ```

### 8. Inform User

> **IMPORTANT**: All TUI command formats listed below must be output in full. Do not show only the format for the current AI agent.

Output format:
```
Refinement complete for task {task-id}.

Fixes applied:
- Blockers fixed: {count}/{total}
- Major issues fixed: {count}/{total}
- Minor issues fixed: {count}/{total}
- All tests pass: {Yes/No}
- Review input: {review-artifact}
- Updated artifact: {implementation-artifact}

Next step - re-review or commit:
- Re-review:
  - Claude Code / OpenCode: /review-task {task-id}
  - Gemini CLI: /{{project}}:review-task {task-id}
  - Codex CLI: $review-task {task-id}
- Commit directly:
  - Claude Code / OpenCode: /commit
  - Gemini CLI: /{{project}}:commit
  - Codex CLI: $commit
```

## Output Template

Append to `{implementation-artifact}`:

```markdown
## Fix Log (for {review-artifact})

### Review Feedback Addressed

#### Blockers Fixed
1. **{Issue title}** (from {review-artifact})
   - **Fix**: {What was changed}
   - **File**: `{file-path}:{line-number}`
   - **Verification**: {How verified}

#### Major Issues Fixed
1. **{Issue title}** (from {review-artifact})
   - **Fix**: {What was changed}
   - **File**: `{file-path}:{line-number}`

#### Minor Issues Addressed
1. **{Issue title}** (from {review-artifact})
   - **Fix**: {What was changed}

#### Issues Not Addressed
- {Issue}: {Reason for not addressing, e.g. disagreed with suggestion}

### Test Results After Refinement
- All tests pass: {Yes/No}
- Test output: {Summary}
```

## Completion Checklist

- [ ] Read and understood all review findings
- [ ] Fixed all blocker issues
- [ ] Fixed all major issues
- [ ] Addressed minor issues where appropriate
- [ ] All tests pass after fixes
- [ ] Updated fix log in `{implementation-artifact}`
- [ ] Updated task status in task.md
- [ ] Appended entry to Activity Log in task.md
- [ ] Informed user of next step (must include all TUI command formats — do not filter)

## Notes

1. **Prerequisites**: A review artifact must exist (`review.md` or `review-r{N}.md`)
2. **No auto-commit**: Do NOT execute `git commit` automatically. Remind the user to commit manually
3. **Scope discipline**: Only fix what was flagged in the review -- no additional changes
4. **Disagreements**: If you disagree with a review comment, document your reasoning in the "Issues Not Addressed" section
5. **Re-review**: After fixing blockers, it is recommended to re-run the review-task skill to verify
6. **Consistency requirement**: The latest review artifact, Activity Log entry, and appended fix log heading must all reference the same review file

## Error Handling

- Task not found: Prompt "Task {task-id} not found"
- Missing review report: Prompt "Review report not found, please run the review-task skill first"
- Review artifact mismatch: Prompt "Review artifact mismatch: Activity Log references {expected} but file not found. Please verify the review artifact exists."
- Test failure after fix: Output test errors, ask user how to proceed
