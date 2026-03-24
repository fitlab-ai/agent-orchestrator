# Issue Template Matching

Read this file before deciding how to build the Issue body from `.github/ISSUE_TEMPLATE`.

#### 3a. Detect Issue Templates

Search project templates with:

```bash
rg --files .github/ISSUE_TEMPLATE -g '*.yml' -g '!config.yml'
```

If templates exist, inspect their top-level `name:` fields and choose the best match for the task title and description.

#### 3b. Build the Body from the Matched Template

Read the matched template's:
- `name`
- `type:`
- `labels:`
- `body:`

Field handling rules:
- `textarea` and `input`: use `attributes.label` as the markdown heading and fill values from task.md
- `markdown`: skip template explanation prose
- `dropdown` and `checkboxes`: skip
- when task.md lacks a suitable value, write `N/A`
