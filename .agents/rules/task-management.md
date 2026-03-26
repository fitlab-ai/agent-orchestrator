# 通用规则 - 任务管理

## 任务语义识别

根据用户意图自动映射到对应工作流命令：
- “分析 issue XXX” -> `import-issue`
- “分析任务 TASK-XXX” -> `analyze-task`
- “设计方案” -> `plan-task`
- “实施/实现” -> `implement-task`
- “审查” -> `review-task`
- “修复审查问题” -> `refine-task`

## 任务状态管理

- 每次执行工作流命令后，必须立即更新对应任务的 `task.md`
- 至少同步 `current_step`、`updated_at`、`assigned_to`，以及本轮产物引用
- Activity Log 只能追加，不能覆盖历史记录

## 常见命令的状态更新要求

- `import-issue`：更新 `current_step`、`updated_at`、`assigned_to`
- `analyze-task`：更新 `current_step`、`updated_at`、`assigned_to`
- `plan-task`：更新 `current_step`、`updated_at`
- `implement-task`：更新 `current_step`、`updated_at`
- `review-task`：更新 `current_step`、`updated_at`
- `refine-task`：更新 `current_step`、`updated_at`
- `complete-task`：更新 `status`、`completed_at`、`updated_at`
- `block-task`：更新 `status`、`blocked_at`、`blocked_reason`
