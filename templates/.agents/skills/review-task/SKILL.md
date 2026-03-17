---
name: review-task
description: >
  Review task implementation code and output a code review report with
  findings categorized by severity (Blocker / Major / Minor). Triggered
  when the user requests code review after implementation is complete.
  Argument: task-id.
---

# Code Review

## Boundary / Critical Rules

- This skill only reads code and produces a review artifact (`review.md` or `review-r{N}.md`) -- it does not modify business code
- After executing this skill, you **must** immediately update task status in task.md

## Steps

### 1. Verify Prerequisites

Check required files:
- `.agent-workspace/active/{task-id}/task.md` - Task file
- At least one implementation report: `implementation.md` or `implementation-r{N}.md`

Note: `{task-id}` format is `TASK-{yyyyMMdd-HHmmss}`, e.g. `TASK-20260306-143022`

If either requirement is missing, prompt the user to complete the prerequisite step first.

### 2. Determine the Review Round

Scan `.agent-workspace/active/{task-id}/` for review artifacts:
- If neither `review.md` nor `review-r*.md` exists -> this is Round 1 and must create `review.md`
- If `review.md` exists and no `review-r*.md` exists -> this is Round 2 and must create `review-r2.md`
- If `review-r{N}.md` exists -> this is Round N+1 and must create `review-r{N+1}.md`

Record:
- `{review-round}`: the current review round
- `{review-artifact}`: the review report filename for this round

### 3. Read Implementation Report

Scan the task directory for implementation reports (`implementation.md`, `implementation-r{N}.md`) and read the highest-round artifact to understand:
- List of modified files
- Key functionality implemented
- Test situation
- Items the implementer flagged for attention

### 4. Execute Code Review

Follow the `code-review` step in `.agents/workflows/feature-development.yaml`:

**Required review areas**:
- [ ] Code quality and coding standards (per project instructions)
- [ ] Bug and potential issue detection
- [ ] Test coverage and test quality
- [ ] Error handling and edge cases
- [ ] Performance and security issues
- [ ] Code comments and documentation
- [ ] Consistency with technical plan

**Review principles**:
1. **Strict but fair**: Point out issues, but also acknowledge strengths
2. **Be specific**: Provide exact file paths and line numbers
3. **Provide suggestions**: Don't just flag problems -- offer solutions
4. **Categorize by severity**: Distinguish must-fix from nice-to-have

Also review the `git diff` to see all changes in context.

### 5. Output Review Report

Create `.agent-workspace/active/{task-id}/{review-artifact}`.

### 6. Update Task Status

Get the current time:

```bash
date "+%Y-%m-%d %H:%M:%S"
```

Update `.agent-workspace/active/{task-id}/task.md`:
- `current_step`: code-review
- `assigned_to`: {reviewer}
- `updated_at`: {current time}
- Record the review artifact for this round: `{review-artifact}` (Round `{review-round}`)
- Mark code-review as complete in workflow progress and include the actual round when the task template supports it
- **Append** to `## Activity Log` (do NOT overwrite previous entries):
  ```
  - {yyyy-MM-dd HH:mm:ss} — **Code Review (Round {N})** by {agent} — Verdict: {Approved/Changes Requested/Rejected}, Blockers: {n}, Major: {n}, Minor: {n} → {artifact-filename}
  ```

### 7. Inform User

> **IMPORTANT**: All TUI command formats listed below must be output in full. Do not show only the format for the current AI agent.

Output based on review result:

**If approved with no issues** (Major = 0 and Minor = 0):
```
Code review complete for task {task-id}. Verdict: Approved.
- Blockers: 0 | Major: 0 | Minor: 0

Next step - commit changes:
  - Claude Code / OpenCode: /commit
  - Gemini CLI: /{{project}}:commit
  - Codex CLI: $commit
```

**If approved with issues** (Major > 0 or Minor > 0):
```
Code review complete for task {task-id}. Verdict: Approved.
- Blockers: 0 | Major: {n} | Minor: {n}
- Report: .agent-workspace/active/{task-id}/{review-artifact}

Next step - fix issues then commit (recommended):
  - Claude Code / OpenCode: /refine-task {task-id}
  - Gemini CLI: /{{project}}:refine-task {task-id}
  - Codex CLI: $refine-task {task-id}

Or commit directly (skip fixes):
  - Claude Code / OpenCode: /commit
  - Gemini CLI: /{{project}}:commit
  - Codex CLI: $commit
```

**If changes requested**:
```
Code review complete for task {task-id}. Verdict: Changes Requested.
- Blockers: {n} | Major: {n} | Minor: {n}
- Report: .agent-workspace/active/{task-id}/{review-artifact}

Next step - fix issues:
  - Claude Code / OpenCode: /refine-task {task-id}
  - Gemini CLI: /{{project}}:refine-task {task-id}
  - Codex CLI: $refine-task {task-id}
```

**If rejected**:
```
Code review complete for task {task-id}. Verdict: Rejected - needs major rework.
- Report: .agent-workspace/active/{task-id}/{review-artifact}

Next step - re-implement:
  - Claude Code / OpenCode: /implement-task {task-id}
  - Gemini CLI: /{{project}}:implement-task {task-id}
  - Codex CLI: $implement-task {task-id}
```

## Output Template

```markdown
# Code Review Report

- **Review round**: Round {review-round}
- **Artifact file**: `{review-artifact}`
- **Implementation input**: `{implementation-artifact}`

## Review Summary

- **Reviewer**: {reviewer name}
- **Review time**: {timestamp}
- **Review scope**: {file count and main modules}
- **Overall verdict**: {Approved / Changes Requested / Rejected}

## Findings

### Blockers (Must Fix)

#### 1. {Issue title}
**File**: `{file-path}:{line-number}`
**Description**: {Detailed description}
**Suggested fix**: {Specific suggestion}
**Severity**: High

### Major Issues (Should Fix)

#### 1. {Issue title}
**File**: `{file-path}:{line-number}`
**Description**: {Detailed description}
**Suggested fix**: {Specific suggestion}
**Severity**: Medium

### Minor Issues (Nice to Have)

#### 1. {Optimization point}
**File**: `{file-path}:{line-number}`
**Suggestion**: {Optimization suggestion}

## Strengths

- {Well-done aspect 1}
- {Well-done aspect 2}

## Standards Compliance

### Coding Standards
- [ ] Naming conventions
- [ ] Code style
- [ ] Comment standards
- [ ] Test standards

### Code Quality Metrics
- Cyclomatic complexity: {Assessment}
- Code duplication: {Assessment}
- Test coverage: {Percentage or assessment}

## Test Review

### Test Coverage
- Unit tests: {Assessment}
- Edge cases: {Covered?}
- Error scenarios: {Covered?}

### Test Quality
- Test naming: {Assessment}
- Assertion adequacy: {Assessment}
- Test independence: {Assessment}

## Security Review

- SQL injection risk: {Check result}
- XSS risk: {Check result}
- Access control: {Check result}
- Sensitive data exposure: {Check result}

## Performance Review

- Algorithm complexity: {Assessment}
- Resource management: {Check result}
- Potential bottlenecks: {Assessment}

## Consistency with Plan

- [ ] Implementation matches technical plan
- [ ] No deviation from design intent
- [ ] No unplanned features added

## Verdict and Recommendations

### Approval Decision
- [ ] Approved - no blocking issues
- [ ] Changes requested - has issues to address
- [ ] Rejected - needs major rework

### Next Steps
{Recommendations based on review result}
```

## Completion Checklist

- [ ] Completed code review of all modified files
- [ ] Created review report `.agent-workspace/active/{task-id}/{review-artifact}`
- [ ] Updated `current_step` to code-review in task.md
- [ ] Updated `updated_at` to current time in task.md
- [ ] Updated `assigned_to` to reviewer name in task.md
- [ ] Appended entry to Activity Log in task.md
- [ ] Marked code-review as complete in workflow progress
- [ ] Informed user of next step based on review result (must include all TUI command formats — do not filter)

## Notes

1. **Prerequisites**: At least one implementation artifact must exist (`implementation.md` or `implementation-r{N}.md`)
2. **Objectivity**: Be strict but fair; acknowledge good work alongside issues
3. **Specificity**: Always reference exact file paths and line numbers
4. **Severity classification**: Blockers must be fixed; major issues should be fixed; minor issues are optional
5. **Versioning rule**: First-round review uses `review.md`; later rounds use `review-r{N}.md`

## Error Handling

- Task not found: Prompt "Task {task-id} not found"
- Missing implementation report: Prompt "Implementation report not found, please run the implement-task skill first"
