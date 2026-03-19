---
description: "从任务文件创建 GitHub Issue。 当用户要求为任务创建 Issue 时触发。参数：task-id。"
agent: general
subtask: false
---

为任务 $1 创建 Issue。

读取并执行 `.agents/skills/create-issue/SKILL.md` 中的 create-issue 技能。

严格按照技能中定义的所有步骤执行。
