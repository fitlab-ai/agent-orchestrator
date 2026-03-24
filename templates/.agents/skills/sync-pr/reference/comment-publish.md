# PR Summary Comment Publication

Read this file before creating or updating the single reviewer-facing PR summary comment.

### 9. Create or Update the Single Idempotent Review Summary

Use the hidden marker:

```html
<!-- sync-pr:{task-id}:summary -->
```

Fetch existing comments through the Issues comments API, not a separate PR comment API.

Recommended summary sections:
- `## Review Summary`
- `### Key Technical Decisions`
- `### Review History`
- `### Test Results`

If a summary comment already exists:
- update it only when the content changed
- otherwise skip the write

If no summary comment exists:
- create one with the marker and the current summary body

Update an existing comment with:

```bash
gh api "repos/$repo/issues/comments/{comment-id}" -X PATCH -f body="$(cat <<'EOF'
{comment-body}
EOF
)"
```

### 10. Update Task Status

Append:
`- {yyyy-MM-dd HH:mm:ss} — **Sync to PR** by {agent} — PR metadata synced, summary {created|updated|skipped} on PR #{pr-number}`
