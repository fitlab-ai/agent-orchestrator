# demo-workflow.tape — Task lifecycle: from Issue to merged PR
# Usage: vhs demo-workflow.tape
#
# NOTE: This tape simulates the Claude Code slash-command experience.
# Since VHS cannot drive a real AI TUI session, we use descriptive
# comments + command typing to illustrate the workflow visually.
# For a fully authentic recording, use asciinema inside a real
# Claude Code session instead.

Output assets/demo-workflow.gif

Set Shell "zsh"
Set FontSize 15
Set Width 1080
Set Height 640
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set WindowBar Colorful
Set WindowBarSize 40

# ── Step 1: Import Issue ──
Type "# Step 1 — Import GitHub Issue into task workspace"
Enter
Sleep 800ms

Type "/import-issue 42"
Enter
Sleep 2s

Type "# ✓ Created TASK-20260319-100000 from Issue #42"
Enter
Sleep 1.5s

# ── Step 2: Analyze ──
Type ""
Enter
Type "# Step 2 — AI analyzes the codebase and writes analysis.md"
Enter
Sleep 800ms

Type "/analyze-task TASK-20260319-100000"
Enter
Sleep 2s

Type "# ✓ Root cause: src/auth/login.ts — email with '+' not sanitized"
Enter
Sleep 1.5s

# ── Step 3: Plan ──
Type ""
Enter
Type "# Step 3 — AI proposes a fix plan (human reviews)"
Enter
Sleep 800ms

Type "/plan-task TASK-20260319-100000"
Enter
Sleep 2s

Type "# ✓ Plan: sanitize email in LoginService.validate() + add unit test"
Enter
Sleep 1s

Type "# You review and reply:"
Enter
Sleep 500ms

Type 'Looks good, but don'"'"'t change the DB schema. Fix at app layer only.'
Enter
Sleep 2s

Type "# ✓ Plan updated per your feedback"
Enter
Sleep 1.5s

# ── Step 4: Implement ──
Type ""
Enter
Type "# Step 4 — AI implements the fix and runs tests"
Enter
Sleep 800ms

Type "/implement-task TASK-20260319-100000"
Enter
Sleep 2.5s

Type "# ✓ Fix applied, test for user+tag@example.com added — all green"
Enter
Sleep 1.5s

# ── Step 5: Review ──
Type ""
Enter
Type "# Step 5 — AI reviews its own implementation"
Enter
Sleep 800ms

Type "/review-task TASK-20260319-100000"
Enter
Sleep 2s

Type "# ✓ Approved: 0 blockers, 0 major, 1 minor (missing JSDoc)"
Enter
Sleep 1.5s

# ── Step 6: Refine ──
Type ""
Enter
Type "# Step 6 — AI fixes the minor issue"
Enter
Sleep 800ms

Type "/refine-task TASK-20260319-100000"
Enter
Sleep 2s

Type "# ✓ JSDoc added, re-validated"
Enter
Sleep 1.5s

# ── Step 7–9: Commit, PR, Complete ──
Type ""
Enter
Type "# Step 7-9 — Commit, create PR, archive task"
Enter
Sleep 800ms

Type "/commit"
Enter
Sleep 1.5s

Type "/create-pr TASK-20260319-100000"
Enter
Sleep 1.5s

Type "# ✓ PR #43 opened (auto-linked to Issue #42)"
Enter
Sleep 1s

Type "/complete-task TASK-20260319-100000"
Enter
Sleep 1.5s

Type "# ✓ Task archived. From issue to merged PR in 9 commands."
Enter
Sleep 3s
