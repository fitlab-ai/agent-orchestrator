# PR Body Template Rules

Read this file before generating the PR title and body.

### 2. Read PR Template

Read `.github/PULL_REQUEST_TEMPLATE.md` from the repository. If it does not exist, use the standard format.

### 3. Review Recent Merged PRs for Reference

```bash
gh pr list --limit 3 --state merged --json number,title,body
```

Use the recent merged PRs as style and formatting references.

### 4. Analyze Current Branch Changes

```bash
git status
git log <target-branch>..HEAD --oneline
git diff <target-branch>...HEAD --stat
git diff <target-branch>...HEAD
```

### 7. Create PR

- Extract `issue_number` from task.md when this work belongs to an active task
- If `issue_number` exists, query the Issue best-effort with `gh issue view {issue-number} --json number,title --jq '.number'`
- Use HEREDOC to pass the PR body
- Replace `{$IssueNumber}` in the template when present
- End the PR body with `Generated with AI assistance`

```bash
gh pr create --base <target-branch> --title "<title>" --assignee @me --body "$(cat <<'EOF'
<Complete PR description following template>

Generated with AI assistance
EOF
)"
```
