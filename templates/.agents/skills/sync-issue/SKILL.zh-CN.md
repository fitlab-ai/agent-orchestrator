---
name: sync-issue
description: >
  将任务处理进度同步到对应的 GitHub Issue 评论。
  当用户要求同步进度到 Issue 时触发。参数：task-id 或 issue-number。
---

# 同步进度到 Issue

将任务处理进度同步到关联的 GitHub Issue。参数：task-id 或 issue-number。

## 执行流程

### 0. 解析参数

识别用户提供的参数：
- 纯数字（如 `123`）或 `#` + 数字（如 `#123`）-> 视为 issue number
- `TASK-` 开头 -> 视为 task-id（现有格式）

如果参数是 issue number：
- 遍历 `.agent-workspace/active/`、`.agent-workspace/blocked/`、`.agent-workspace/completed/` 下所有任务目录
- 读取每个 `task.md` 的 `issue_number` 字段并匹配目标编号
- 找到匹配任务后，记录对应 `{task-id}` 和任务目录，然后继续执行步骤 1
- 如果没有找到，提示 `No task found associated with Issue #{issue-number}`

如果参数是 task-id，继续执行步骤 1 的现有逻辑。

### 1. 验证任务存在

对于 `task-id` 路径，按优先顺序搜索任务：
- `.agent-workspace/active/{task-id}/task.md`
- `.agent-workspace/blocked/{task-id}/task.md`
- `.agent-workspace/completed/{task-id}/task.md`

注意：`{task-id}` 格式为 `TASK-{yyyyMMdd-HHmmss}`，例如 `TASK-20260306-143022`

如果步骤 0 已通过 issue number 找到匹配任务，则直接使用该任务目录继续后续步骤，无需再次扫描。

### 2. 读取任务信息

从 task.md 中提取：
- `issue_number`（必需 —— 如果缺失，提示用户）
- 任务标题、描述、状态
- `current_step`、`created_at`、`updated_at`

### 3. 读取上下文文件

检查并读取（如存在）：
- `analysis.md` - 需求分析
- `plan.md` - 技术方案
- `implementation.md` - 实现报告
- `review.md` - 审查报告

### 4. 探测交付状态

依次执行以下探测；任一步失败时，降级到“模式 C：开发中”，不要编造无法确认的信息。

**a) 提取 commit hash**

从 task.md 的 `## Activity Log` 中匹配最后一条 `**Commit** by` 记录，活动日志格式固定为：

```text
**Commit** by {agent} — {hash} {subject}
```

提取第一个词作为 commit hash；如果找不到，标记为“无 commit”。

**b) 检测 commit 是否在受保护分支上**

如果存在 commit hash，执行：

```bash
git branch -a --contains {commit-hash} 2>/dev/null
```

判断规则：
- 输出包含 `main` 或 `master` -> 已合入主分支，记录分支名
- 输出匹配 `{major}.{minor}.x` 模式的分支名 -> 已合入版本分支，记录分支名
- 都不匹配 -> 未合入受保护分支

**c) 检测关联 PR**

检查 task.md 的 `pr_number` 字段；如果存在，执行：

```bash
gh pr view {pr-number} --json state,mergedAt
```

根据返回结果识别 PR 是 `OPEN`、`MERGED` 还是其他状态。

**d) 检测 Issue 状态**

执行：

```bash
gh issue view {issue-number} --json state
```

记录 Issue 当前是 `OPEN` 还是 `CLOSED`。

**e) 综合判定交付模式**

按以下优先级确定摘要模式：

| 条件 | 模式 |
|------|------|
| commit 已在受保护分支上 | 模式 A：已完成 |
| 有 PR，且状态为 `OPEN` 或 `MERGED` | 模式 B：PR 阶段 |
| 其他情况 | 模式 C：开发中 |

优先级必须为 `模式 A > 模式 B > 模式 C`。即使存在 PR，只要 commit 已在受保护分支上，也按“已完成”处理。

### 5. 同步 Labels

基于步骤 4 的探测结果同步 Issue labels。

**a) 检查 label 体系是否已初始化**

执行：

```bash
gh label list --search "type:" --limit 1 --json name --jq 'length'
```

判断规则：
- 返回 `0` -> 说明标准 label 体系缺失。先执行 `init-labels` 技能（幂等），然后重新执行本步骤
- 返回非 `0` -> 继续后续 label 同步

**b) 同步 type label**

根据 task.md 的 `type` 字段按下表映射：

| task.md type | GitHub label |
|---|---|
| bug | `type: bug` |
| feature | `type: feature` |
| enhancement | `type: enhancement` |
| documentation | `type: documentation` |
| dependency-upgrade | `type: dependency-upgrade` |
| task | `type: task` |
| 其他（含 refactoring 等） | 跳过 |

如果映射到具体 label，执行：

```bash
gh issue edit {issue-number} --add-label "{type-label}"
```

未映射到标准 type label 时跳过，不创建新 label。

**c) 同步 status label**

先读取 Issue 上已有的 `status:` labels：

```bash
gh issue view {issue-number} --json labels --jq '.labels[].name | select(startswith("status:"))'
```

对每个已有的 `status:` label 执行移除：

```bash
gh issue edit {issue-number} --remove-label "{status-label}"
```

然后按以下优先级决定是否添加新的 `status:` label：

| 条件 | 动作 |
|---|---|
| 任务位于 `blocked/` 目录 | 添加 `status: blocked` |
| 模式 A：已完成 | 不添加新的 status label |
| 模式 B：PR 已 MERGED | 不添加新的 status label |
| 模式 B：PR OPEN | 添加 `status: in-progress` |
| 模式 C + `current_step` ∈ {`requirement-analysis`, `technical-design`} | 添加 `status: pending-design-work` |
| 模式 C + `current_step` ∈ {`implementation`, `code-review`, `refinement`} | 添加 `status: in-progress` |

如果需要添加新 label，执行：

```bash
gh issue edit {issue-number} --add-label "{status-label}"
```

**d) 同步 in: label**

从 `implementation.md`（优先）或 `analysis.md` 中提取受影响文件路径：
- 优先读取 `## 修改文件` / `## 新建文件` 中的文件列表
- 如果实现报告不存在，则回退到分析报告中的受影响文件列表

对每个文件路径：
1. 取第一级目录作为模块名
2. 去重
3. 检查仓库中是否存在对应 label：

```bash
gh label list --search "in: {module}" --limit 10 --json name --jq '.[].name'
```

4. 只有存在精确匹配的 `in: {module}` label 时才执行：

```bash
gh issue edit {issue-number} --add-label "in: {module}"
```

5. **只添加，不移除**现有的 `in:` labels

### 6. 同步 Development

如果 task.md 包含 `pr_number`，确保 PR body 关联当前 Issue。

1. 读取 PR body：

```bash
gh pr view {pr-number} --json body --jq '.body // ""'
```

2. 检查 body 是否已经包含以下任一关键词：
- `Closes #{issue-number}`
- `Fixes #{issue-number}`
- `Resolves #{issue-number}`

3. 如果已存在任一关键词，跳过更新
4. 如果不存在，在 body 末尾追加：

```bash
gh pr edit {pr-number} --body "$(cat <<'EOF'
{existing-body}

Closes #{issue-number}
EOF
)"
```

5. 如果 task.md 不包含 `pr_number`，记录为 `Development: N/A`

### 7. 同步 Milestone

根据 Issue 当前状态、任务显式配置和分支策略，为 Issue 关联线里程碑。

**a) 检查 Issue 是否已有 Milestone**

执行：

```bash
gh issue view {issue-number} --json milestone --jq '.milestone.title // empty'
```

如果返回非空，保留现有里程碑并记录 `Milestone: {existing} (preserved)`，跳过后续里程碑同步步骤。

**b) 检查 task.md 是否显式指定 milestone**

如果 task.md frontmatter 中存在非空 `milestone` 字段，优先使用该值作为目标里程碑。
此字段应填写线里程碑标题或 `General Backlog`，不要自动指定具体版本里程碑。

**c) 推断目标线里程碑**

当 task.md 未显式指定 `milestone` 时，按以下顺序推断：

1. 检测当前分支：

```bash
git branch --show-current
```

- 如果分支名匹配 `{major}.{minor}.x`，目标里程碑为同名线里程碑 `{major}.{minor}.x`

2. 如果当前分支是 `main` 或 `master`，检测现有版本分支：

```bash
git branch -a | grep -oE '[0-9]+\.[0-9]+\.x' | sort -V | tail -1
```

- 如果存在最高版本分支 `X.Y.x`，则目标里程碑为 `(X+1).0.x`
- 如果不存在版本分支，则读取最新 tag：

```bash
git tag --list 'v*' --sort=-v:refname | head -1
```

- 当最新 tag 存在且可解析为 `X.Y.Z` 时，目标里程碑为 `X.Y.x`

3. 如果以上规则都无法得出结果，回退到 `General Backlog`

**d) 查找目标里程碑编号**

执行：

```bash
repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"

gh api "repos/$repo/milestones" --paginate \
  --jq '.[] | select(.title=="{target}") | .number'
```

- 如果目标里程碑不存在，则降级到查找 `General Backlog`
- 如果 `General Backlog` 也不存在，则记录 `Milestone: skipped (not found)` 并跳过关联

**e) 关联 Issue 到里程碑**

一旦找到目标里程碑编号，执行：

```bash
gh api "repos/$repo/issues/{issue-number}" -X PATCH -F milestone={milestone-number}
```

记录：
- `Milestone: {target} (assigned)` 或
- `Milestone: General Backlog (fallback)`

### 8. 生成进度摘要

生成面向**项目经理和利益相关者**的清晰进度摘要：

三种模式共享以下要求：
- 头部去掉 `**任务 ID**` 行，并在状态描述中展示 commit hash（如有）
- 如需提供链接，用 `**相关链接**` 替换 `**相关文档**`，且只包含 GitHub 上可访问的资源
- 脚注统一为 `*由 AI 自动生成 · 内部追踪：{task-id}*`

#### 模式 A：已完成

适用条件：commit 已在 `main`、`master` 或 `{major}.{minor}.x` 版本分支上。

```markdown
## 任务进度更新

**更新时间**：{当前时间}
**状态**：✅ 已完成，代码已合入 `{branch}`（`{commit-short}`）

### 完成总结

- [x] 需求分析 - {完成时间}
  - {1-2 个关键要点}
- [x] 技术设计 - {完成时间}
  - {决策和理由}
- [x] 实现 - {完成时间}
  - {核心实现内容}
- [x] 最终交付 - {完成时间}
  - {合入方式或结果}

### 最终变更

| 类型 | 内容 |
|------|------|
| 分支 | `{branch}` |
| Commit | [`{commit-short}`](../../commit/{commit-hash}) |
| PR | {PR 链接或 `N/A`} |
| Issue | {issue-state} |

---
*由 AI 自动生成 · 内部追踪：{task-id}*
```

要求：
- 使用“完成总结”替代“已完成步骤”，更简洁地说明交付结果
- 不要包含“当前进度”或“下一步”段落
- 链接信息保留在“最终变更”表格中；PR 仅在存在时附上

#### 模式 B：PR 阶段

适用条件：不存在已合入受保护分支的 commit，但存在状态为 `OPEN` 或 `MERGED` 的关联 PR。

```markdown
## 任务进度更新

**更新时间**：{当前时间}
**状态**：PR [#{pr-number}](../../pull/{pr-number}) {待审查或已合并}{（`{commit-short}`）可选}

### 已完成步骤

- [x] 需求分析 - {完成时间}
  - {1-2 个关键要点}
- [x] 技术设计 - {完成时间}
  - {决策和理由}
- [x] 实现 - {完成时间}
  - {核心实现内容}
- [ ] 代码审查
- [ ] 最终提交

### 当前进度

{当前 PR 状态、审查结论或合并情况}

### 相关链接

- PR：[#{pr-number}](../../pull/{pr-number})

---
*由 AI 自动生成 · 内部追踪：{task-id}*
```

要求：
- 保留“已完成步骤”和“当前进度”
- 不要包含“下一步”段落，因为 PR 本身就是下一步的载体
- 相关链接只列 GitHub 可访问资源，至少包含 PR

#### 模式 C：开发中

适用条件：既未检测到已合入受保护分支的 commit，也没有可用的 `OPEN`/`MERGED` PR。

```markdown
## 任务进度更新

**更新时间**：{当前时间}
**状态**：{状态描述}{（`{commit-short}`）可选}

### 已完成步骤

- [x] 需求分析 - {完成时间}
  - {1-2 个关键要点}
- [x] 技术设计 - {完成时间}
  - {决策和理由}
- [ ] 实现（进行中）
- [ ] 代码审查
- [ ] 最终提交

### 当前进度

{当前步骤的描述}

### 下一步

{接下来需要做什么}

---
*由 AI 自动生成 · 内部追踪：{task-id}*
```

要求：
- 保留“已完成步骤”“当前进度”“下一步”
- 不要包含“相关链接”段落，因为此时还没有适合公开引用的 GitHub 资源

**摘要原则**：
- **面向利益相关者**：关注进展、决策和时间线
- **状态真实**：依据探测结果选择模式，不要假设“提交 -> PR -> 合入”的固定路径
- **简洁**：避免过多技术细节
- **逻辑清晰**：按时间顺序呈现进展
- **可读性强**：使用通俗语言，避免行话

### 9. 发布到 Issue

```bash
gh issue comment {issue-number} --body "$(cat <<'EOF'
{生成的摘要}
EOF
)"
```

### 10. 更新任务状态

获取当前时间：

```bash
date "+%Y-%m-%d %H:%M:%S"
```

在 task.md 中添加或更新 `last_synced_at` 字段为 `{当前时间}`。
- **追加**到 `## Activity Log`（不要覆盖之前的记录）：
  ```
  - {yyyy-MM-dd HH:mm:ss} — **Sync to Issue** by {agent} — Progress synced to Issue #{issue-number}
  ```

### 11. 告知用户

```
进度已同步到 Issue #{issue-number}。

已同步内容：
- 已完成步骤：{数量}
- 当前状态：{状态}
- Labels：type={type-label 或 skipped}，status={status-label 或 cleared}，in:={新增数量}
- Milestone：{preserved / assigned / fallback / skipped}
- Development：{已追加 Closes 关联 / 已存在关联 / 无 PR，跳过}
- 下一步：{描述或 N/A}

查看：https://github.com/{owner}/{repo}/issues/{issue-number}
```

## 注意事项

1. **需要 Issue 编号**：任务的 task.md 中必须有 `issue_number`。如果缺失，提示用户。
2. **受众**：`sync-issue` 技能面向利益相关者；`sync-pr` 技能面向代码审查者。关注点不同。
3. **同步时机**：在完成重要阶段（分析、设计、实现、审查）或被阻塞时同步。
4. **避免刷屏**：不要同步过于频繁。

## 错误处理

- 任务未找到：提示 "Task {task-id} not found"
- 缺少 Issue 编号：提示 "Task has no issue_number field"
- Issue 未找到：提示 "Issue #{number} not found"
- gh 认证失败：提示 "Please check GitHub CLI authentication"
