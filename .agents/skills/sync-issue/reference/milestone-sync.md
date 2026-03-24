# Milestone Sync

Read this file before selecting or editing the Issue milestone.

### 8. Sync the Milestone

Milestone priority:
1. existing Issue milestone
2. explicit `milestone` field in task.md
3. inferred version line from the current branch
4. `General Backlog`

Inference algorithm when `task.md` does not set `milestone` explicitly:
1. detect the current branch with `git branch --show-current`
2. if the current branch matches `{major}.{minor}.x`, use that exact line milestone
3. if the current branch is `main` or `master`, inspect existing `{major}.{minor}.x` branches
4. when a highest existing line `X.Y.x` exists, target `(X+1).0.x`
5. if no version line exists, inspect the latest `vX.Y.Z` tag and fall back to `X.Y.x`
6. if no branch or tag rule yields a version line, fall back to `General Backlog`

Useful commands:

```bash
gh issue view {issue-number} --json milestone
git branch --show-current
git branch -a | grep -oE '[0-9]+\.[0-9]+\.x'
git tag --list 'v*' --sort=-v:refname | head -1
gh issue edit {issue-number} --milestone "{milestone-title}"
```
