# Label 和 Issue Type 同步

在编辑 `status:`、`in:` 或 Issue Type 元数据之前先读取本文件。

## 同步 Labels 和 Issue Type

必要时先初始化 label：

```bash
gh label list --search "type:" --limit 1 --json name --jq 'length'
```

如果结果是 `0`，先执行 `init-labels`，然后重新执行本步骤。

`status:` label 工作流：

```bash
gh issue view {issue-number} --json labels --jq '.labels[].name | select(startswith("status:"))'
gh issue edit {issue-number} --remove-label "{status-label}"
gh issue edit {issue-number} --add-label "{status-label}"
```

`status:` 判断表：

| Condition | Action |
|---|---|
| task lives under `blocked/` | add `status: blocked` |
| Mode A: completed | add no new `status:` label |
| Mode B: PR is `MERGED` | add no new `status:` label |
| Mode B: PR is `OPEN` | add `status: in-progress` |
| Mode C + `current_step` ∈ {`requirement-analysis`, `technical-design`} | add `status: pending-design-work` |
| Mode C + `current_step` ∈ {`implementation`, `code-review`, `refinement`} | add `status: in-progress` |

`in:` label 工作流：

```bash
gh label list --search "in: {module}" --limit 10 --json name --jq '.[].name'
gh issue edit {issue-number} --add-label "in: {module}"
```

`in:` label 流程：
1. 优先从实现产物中提取改动文件路径；只有在不存在实现产物时，才回退到分析产物
2. 取路径的第一级目录作为 `{module}`
3. 对推断出的所有模块去重
4. 仅在对应的精确 `in: {module}` label 存在时才添加
5. 只添加匹配的 label；绝不移除已有的 `in:` label

Issue Type 工作流：

```bash
gh api "orgs/$owner/issue-types" --jq '.[].name'
gh api "repos/$repo/issues/{issue-number}" -X PATCH -f type="{name}"
```

Issue Type 映射：

| task.md type | GitHub Issue Type |
|---|---|
| `bug`, `bugfix` | `Bug` |
| `feature`, `enhancement` | `Feature` |
| `task`, `documentation`, `dependency-upgrade`, `chore`, `docs`, `refactor`, `refactoring` 以及其他所有值 | `Task` |

如果 Issue Type 不可用，记录 `Issue Type: skipped (not enabled)`，然后继续执行。
