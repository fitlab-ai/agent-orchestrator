# Branch Strategy

Read this file before inferring the base branch.

### 1. Determine Target Branch

- If the user provides an argument such as `main`, `develop`, or `3.6.x`, use it directly.
- If no argument is provided, inspect:

```bash
git branch --show-current
git log --oneline --decorate --first-parent -20
```

Decision rules:
- current branch is `main` or `trunk` -> use that branch
- current branch is a feature branch -> infer the nearest parent branch from log decorations
- cannot determine -> ask the user
