---
name: init-labels
description: >
  一次性初始化仓库的标准 GitHub Labels 体系。
  创建通用 labels、基于项目目录结构自动探测 `in:` labels、
  不创建 `theme:` labels、覆盖名称完全匹配的 GitHub 默认 labels，并提示未覆盖的默认 labels。
---

# 初始化 GitHub Labels

一次性初始化仓库的标准 GitHub Labels 体系。

## 执行流程

### 1. 验证前置条件

执行：

```bash
command -v gh
gh auth status
gh repo view --json nameWithOwner
```

如果任一命令失败，提示用户先安装或登录 `gh`，然后停止。

为后续步骤创建临时工作目录：

```bash
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
```

### 2. 记录当前 labels 快照

在修改前保存当前 label 名称快照。直到技能结束前都保留这份快照。

```bash
gh label list --limit 200 > "$tmpdir/existing.txt"
cut -f1 "$tmpdir/existing.txt" > "$tmpdir/existing-names.txt"
cat "$tmpdir/existing-names.txt"
```

### 3. 创建通用 labels

使用 `--force` 创建或更新通用 label 集，确保技能保持幂等。

```bash
cat <<'EOF' > "$tmpdir/common.tsv"
type: bug	DED6F9	A general bug
type: enhancement	DED6F9	A general enhancement
type: feature	DED6F9	A general feature
type: documentation	DED6F9	A documentation task
type: dependency-upgrade	DED6F9	A dependency upgrade
type: task	DED6F9	A general task
status: waiting-for-triage	FCF1C4	An issue we've not yet triaged or decided on
status: waiting-for-feedback	FCF1C4	We need additional information before we can continue
status: feedback-provided	FCF1C4	Feedback has been provided
status: feedback-reminder	FCF1C4	We've sent a reminder that we need additional information before we can continue
status: pending-design-work	FCF1C4	Needs design work before any code can be developed
status: in-progress	FCF1C4	Work is actively being developed
status: on-hold	FCF1C4	We can't start working on this issue yet
status: blocked	FCF1C4	An issue that's blocked on an external project change
status: declined	FCF1C4	A suggestion or change that we don't feel we should currently apply
status: duplicate	FCF1C4	A duplicate of another issue
status: invalid	FCF1C4	An issue that we don't feel is valid
status: superseded	FCF1C4	An issue that has been superseded by another
status: bulk-closed	FCF1C4	An outdated, unresolved issue that's closed in bulk as part of a cleaning process
status: ideal-for-contribution	FCF1C4	An issue that a contributor can help us with
status: backported	FCF1C4	An issue that has been backported to maintenance branches
status: waiting-for-internal-feedback	FCF1C4	An issue that needs input from a member or another team
good first issue	F9D9E6	Good for newcomers
help wanted	008672	Extra attention is needed
dependencies	0366d6	Pull requests that update a dependency file
EOF

while IFS="$(printf '\t')" read -r name color description; do
  [ -n "$name" ] || continue
  gh label create "$name" --color "$color" --description "$description" --force
done < "$tmpdir/common.tsv"
```

`good first issue` 和 `help wanted` 故意使用 GitHub 默认 label 的原始名称，这样上面的命令会直接覆盖它们的颜色和描述。

### 4. 自动探测 `in:` labels

探测项目顶层目录，排除隐藏目录和常见构建/缓存目录，为剩余的每个目录创建一个 `in:` label。如果过滤后没有有效目录，则只创建 `in: core`。

本技能**不创建**任何 `theme:` labels。

```bash
project_dirs=$(
  find . -mindepth 1 -maxdepth 1 -type d ! -name '.*' |
  sed 's#^\./##' |
  grep -Ev '^(node_modules|vendor|dist|build|out|target|tmp|temp|log|logs|coverage|__pycache__)$' |
  sort -u
)

if [ -z "$project_dirs" ]; then
  project_dirs="core"
fi

printf '%s\n' "$project_dirs" | while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  gh label create "in: $dir" \
    --color EBF8DF \
    --description "Issues in $dir" \
    --force
done
```

### 5. 提示未覆盖的 GitHub 默认 labels

名称完全匹配的 GitHub 默认 labels 已经通过 `--force` 覆盖。对于名称不完全匹配的默认 labels，如果它们仍然存在，只提示用户，不自动删除。

```bash
gh label list --limit 200 > "$tmpdir/final.txt"
cut -f1 "$tmpdir/final.txt" > "$tmpdir/final-names.txt"

: > "$tmpdir/unmatched-defaults.txt"
for label in bug documentation duplicate enhancement invalid question wontfix; do
  if grep -Fqx "$label" "$tmpdir/final-names.txt"; then
    printf '%s\n' "$label" >> "$tmpdir/unmatched-defaults.txt"
  fi
done
```

### 6. 汇总结果

向用户报告执行结果：

```bash
common_count="$(wc -l < "$tmpdir/common.tsv" | tr -d ' ')"
in_count="$(printf '%s\n' "$project_dirs" | sed '/^$/d' | wc -l | tr -d ' ')"

echo "GitHub Labels initialized."
echo
echo "Summary:"
echo "- Common labels created or updated: $common_count"
echo "- in: labels created or updated: $in_count"
echo "- Exact-match GitHub defaults overwritten: good first issue, help wanted"

if [ -s "$tmpdir/unmatched-defaults.txt" ]; then
  echo "- Unmatched GitHub defaults still present:"
  sed 's/^/  - /' "$tmpdir/unmatched-defaults.txt"
else
  echo "- Unmatched GitHub defaults still present: none"
fi

echo
echo "Notes:"
echo "- theme: labels were intentionally not created."
echo "- The operation is idempotent because every label uses gh label create --force."
echo "- If the detected in: labels need refinement, adjust them manually after initialization."
```

## 错误处理

- 未找到 `gh`：提示 "GitHub CLI (`gh`) is not installed"
- 认证失败：提示 "GitHub CLI is not authenticated"
- 仓库访问失败：提示 "Unable to access the current repository with gh"
- 权限不足：提示 "No permission to manage labels in this repository"
- API 限流：提示 "GitHub API rate limit reached, please retry later"
