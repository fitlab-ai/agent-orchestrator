# 实现报告模板

创建 `implementation.md` 或 `implementation-r{N}.md` 时，使用以下结构。

## 输出模板

```markdown
# Implementation Report

- **Implementation Round**: Round {implementation-round}
- **Artifact File**: `{implementation-artifact}`

## Modified Files

### New Files
- `{file-path}` - {description}

### Modified Files
- `{file-path}` - {change summary}

## Key Code Explanation

### {Module/Feature Name}
**File**: `{file-path}:{line-number}`

**Implementation Logic**:
{important logic summary}

**Key Code**:
```{language}
{key-code-snippet}
```

## Test Results

### Unit Tests
- Test file: `{test-file-path}`
- Test case count: {count}
- Pass rate: {percentage}

**Test Output**:
```
{test-run-output}
```

## Differences from Plan

{describe any deviation from the approved plan}

## Items for Review

**Focus areas for reviewers**:
- {item 1}
- {item 2}

## Known Issues

{known issues or follow-up ideas}

## Next Steps

{recommended follow-up}
```
