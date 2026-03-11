---
name: update-ai-collaboration
description: >
  更新当前项目的 AI 协作基础设施和项目治理配置，使其与最新的 ai-collaboration-installer 模板保持一致。
  智能合并模板变更，同时保留项目特定的定制内容。
---

# 更新项目

## 步骤 1：读取项目配置

读取项目根目录的 `collaborator.json`，提取：
- `project`、`org`
- `language`
- `modules`
- `templateSource`
- `files.managed` / `files.merged` / `files.ejected`

## 步骤 2：定位并刷新模板源

1. 如果 `~/.ai-collaboration-installer/` 不存在，报错并停止：
   "模板源未找到。请先安装：
   curl -fsSL https://raw.githubusercontent.com/fitlab-ai/ai-collaboration-installer/main/install.sh | sh"
2. 执行 `git -C ~/.ai-collaboration-installer pull` 拉取最新模板
3. 记录模板源当前 commit SHA（`git -C ~/.ai-collaboration-installer rev-parse --short HEAD`）

再根据 `templateSource`（默认：`templates/`）定位模板根目录。
所有更新输入都必须先从该模板树渲染，不能直接读取项目自身的文件。

## 步骤 3：确定更新范围并分类文件

### 3.0 同步文件注册表

读取模板源的 `lib/defaults.json`，将其文件列表与项目 `collaborator.json` 的对应列表进行对比，
自动追加新增的条目：

1. 遍历 `defaults.json` 中 `files.managed` 的每个条目：
   如果该条目**不在**项目 `collaborator.json` 的 `managed`、`merged`、`ejected` 任何一个列表中，
   追加到项目的 `files.managed`。
2. 遍历 `defaults.json` 中 `files.merged` 的每个条目：
   如果该条目**不在**项目 `collaborator.json` 的 `managed`、`merged`、`ejected` 任何一个列表中，
   追加到项目的 `files.merged`。
3. 已在 `files.ejected` 中的条目不动（用户已明确接管，优先级最高）。
4. 项目 `collaborator.json` 中额外添加的自定义条目保留不动（只增不删）。

如果有新增条目，立即更新内存中的文件列表，后续步骤使用更新后的列表。
在最终报告中列出所有新增的条目，以便用户知晓。

### 3.1 模块过滤

只处理 `modules` 中列出的模块。

### 3.2 文件分类

**文件分类优先级**（高 → 低）：
1. `files.ejected` 中列出的路径 → **ejected**（用户完全拥有，不触碰）
2. `files.merged` 中列出的路径或 glob 模式所匹配的文件 → **merged**（AI 智能合并）
3. `files.managed` 中列出的目录或路径 → **managed**（模板覆盖写入）

**关键**：一个文件即使位于 managed 目录下，只要它匹配 `files.merged` 中的任何 glob 模式，
就必须使用 merged 策略。判断时将 glob 模式与文件在项目中的相对路径进行匹配。

### Glob 匹配语义

模式遵循标准 glob 规则：
- `*` 匹配单个路径组件（不跨越 `/`）。
  示例：`*/test.*` 匹配 `commands/test.md`，但**不匹配** `.claude/commands/test.md`。
- `**` 匹配零个或多个路径组件（任意深度）。
  示例：`**/test.*` 匹配 `test.md`、`commands/test.md`、`.claude/commands/test.md`。
- 模式对文件在项目中的**完整相对路径**进行匹配（从项目根目录起算）。

## 步骤 4：处理 managed 文件

对 managed 目录/路径下的每个模板文件，按以下顺序处理：

### 4.0 排除 merged / ejected 文件（必须首先执行）

遍历 managed 目录中的文件时，**逐个检查**该文件的目标相对路径是否匹配
`files.merged` 或 `files.ejected` 中的任何条目（精确路径或 glob 模式）。
**如果匹配，跳过该文件**，留给步骤 5 或步骤 6 处理。

> **示例**：`.agents/skills/` 是 managed 目录，但 `files.merged` 包含
> `.agents/skills/test/SKILL.*`。处理该目录时：
> - `.agents/skills/commit/SKILL.md` → 不匹配任何 merged 模式 → **按 managed 处理**
> - `.agents/skills/test/SKILL.md` → 匹配 `.agents/skills/test/SKILL.*` → **跳过，留给步骤 5**
>
> **常见错误**：先批量处理整个 managed 目录，再单独处理 merged 文件。
> 这会导致 merged 文件被 managed 逻辑覆盖，用户定制内容（如已填充的 TODO）丢失。

### 4.1 语言选择

按 `language` 字段选择：
- `zh-CN`：优先使用 `.zh-CN.*` 变体，输出到去掉 `.zh-CN.` 后缀的目标路径；
  跳过对应的英文文件。若无 `.zh-CN.*` 变体则回退到英文文件。
- `en`（默认）：使用非 `.zh-CN.*` 文件，跳过 `.zh-CN.*` 文件。
- 每个目标路径只输出一种语言版本。

### 4.2 渲染占位符

模板文件中使用两种占位符：

**内容占位符**：模板文本中使用双花括号包裹的 `project` 和 `org` 占位符。
渲染时将它们分别替换为 collaborator.json 中 `project` 和 `org` 的实际值。

**路径占位符**：文件名或目录名中的 `_project_`，替换为项目名。

> **警告**：不可跳过渲染直接复制模板原文件。跳过渲染会导致输出文件包含未替换的占位符，
> 从而在下次执行时产生大量虚假变更，破坏幂等性。

### 4.3 写入

- 覆盖写入本地项目
- 模板新增而本地不存在的文件要创建
- 模板已删除的文件只提示用户，不自动删除

## 步骤 5：处理 merged 文件（模板为底 + 增量萃取）

先渲染出模板最新版（同步骤 4 的语言选择和占位符渲染规则），再读取本地当前文件。

**如果本地文件不存在**（首次安装），直接写入渲染后的模板，跳过合并。

如果本地文件存在，执行以下合并算法：

### 5.1 以模板为基底

使用渲染后的新模板作为输出的基底。模板代表最佳实践，其结构和内容具有权威性。

### 5.2 从本地文件萃取增量

扫描本地文件，找出比模板内容"多"的部分（用户增量）：
- **已填充的 TODO**：模板中的 TODO 占位符在本地文件中被替换为实际内容
- **新增段落/章节**：本地文件中存在但模板中不存在的内容
- **扩展内容**：对模板现有内容的补充说明

### 5.3 合入新模板

将萃取的增量合入新模板的适当位置：
- 已填充的 TODO → 替换对应的 TODO 占位符
- 新增段落 → 插入最相关的位置
- 扩展内容 → 合入对应章节

### 5.4 通读验证

整体检查合并后文件的逻辑完整性，确保：
- 增量合入位置正确
- 无重复内容
- 文档结构连贯

### 5.5 冲突处理

当本地文件修改过的内容与模板新内容冲突时：
- 保留模板版本（模板权威性原则）
- 在报告中提示用户该冲突，以便用户确认

### 5.6 残余 TODO 提示

合并完成后，如果仍有模板 TODO 未被本地文件的内容填充，在报告中提示用户。

## 步骤 6：处理 ejected 文件

- **本地文件已存在**：不触碰（ejected = 用户完全拥有）
- **本地文件不存在**（首次安装）：从模板渲染并写入一份，后续更新跳过

## 步骤 7：更新 collaborator.json

### 自更新检测

在更新 `templateVersion` 之前，比较当前项目与 `~/.ai-collaboration-installer/` 的 git remote URL。
如果两者一致（即当前项目就是模板源仓库本身），且步骤 4-6 未产生任何文件变更，
则跳过 `templateVersion` 更新，报告项目已是最新状态。

> **原因**：模板源仓库自身存在版本追踪死循环 —— 更新 templateVersion → 提交 → SHA 变化 →
> 下次更新又需要改 templateVersion。当无实质文件变更时，跳过此字段即可打破循环。

### 常规更新

更新 `templateVersion` 为模板源当前版本（步骤 2 记录的 commit SHA）。
除非用户明确要求迁移模板目录，否则保持 `templateSource` 不变。

## 步骤 8：验证与输出报告

**方向检查**：输出报告前，用 `git diff` 抽查变更方向是否正确。
正确方向：模板新内容 → 本地；错误方向：将已渲染内容退化回占位符。
如果发现错误方向的变更，暂停并排查原因。

输出报告后**停止**，不要对项目做其他更改。
