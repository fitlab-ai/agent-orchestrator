# 跨平台测试守卫规范

本规则用于新增或修改跨平台测试时统一表达「整条测试在哪些真实平台运行」。目标是让平台跳过语义集中到 `tests/helpers.js` 的 `onPlatforms()`，避免在测试体内散落早返回。

## 1. 整条测试的平台守卫

整条测试只适用于部分真实平台时，必须使用 `onPlatforms()` 作为 `node:test` 的 options 参数。

✅ 推荐：

```js
test("restoreTerminal does not throw when stty is unavailable", onPlatforms("linux", "darwin"), () => {
  // ...
});
```

❌ 禁止：

```js
test("restoreTerminal does not throw when stty is unavailable", () => {
  if (process.platform === "win32") {
    return;
  }
  // ...
});
```

不要再新增 `e2eOnPlatforms()`、`unitOnly()`、`skipOnWindows()` 等别名。`onPlatforms()` 是唯一的整条测试平台守卫 helper。

## 2. 同一条测试覆盖多平台行为差异（含其调用的 helper）

同一条测试需要在多个平台运行，并断言不同平台的不同结果时，可以在测试体内或其调用的共享 helper / fixture 函数内部读取 `process.platform`。这种分支必须用于断言、构造或资源 setup，不得用于跳过整条测试。

✅ 推荐：

```js
if (process.platform === "darwin") {
  assert.equal(readKeychain(), expected);
} else {
  assert.equal(fs.readFileSync(credentialsPath, "utf8"), expected);
}
```

✅ helper / fixture 内的合法分支：

```js
function writeFakeGh(filePathname) {
  if (process.platform === "win32") {
    writeNodeCommandShim(filePathname, filePathname);
    return;
  }
  fs.chmodSync(filePathname, 0o755);
}
```

## 3. 运行时回退

某些平台的系统能力会在运行时失败，例如 Windows 无管理员权限创建 symlink 时可能抛出 `EPERM`。这类分支属于运行时回退，可以保留在测试体内，但必须只处理已知错误，不得吞掉无关失败。

✅ 推荐：

```js
try {
  createSymlink();
} catch (error) {
  if (process.platform !== "win32" || error.code !== "EPERM") {
    throw error;
  }
}
```

## 4. 已知未启用的 Windows sandbox e2e

`tests/cli/sandbox.test.js` 中的 sandbox exec e2e 当前仍限制在 Linux 和 macOS：

- `sandbox exec enters tmux automatically for interactive shells`
- `sandbox exec reconciles newer Claude credentials from a neighbouring project`

PR #313 完成 unified config-driven engine 重构后，原"win32 强制 wsl2"的 engine 选择问题已解除，理论上这两条测试可通过在 fixture 的 `.airc.json` 中写入 `sandbox.engine: "native"` 在 Windows 上运行。但 CI 实测发现 Windows runner 上 docker.cmd shim 在深层 spawn 嵌套（test → CLI → cmd.exe → node.exe）下被调用且 cmd-exit=0，但 node.exe 的 stdout 不会回传到 CLI 子进程，**导致 `runSafeEngine('docker', 'ps')` 拿到空字符串**。从测试进程或独立 subprocess 调用同一 runSafe 都正常，仅 CLI 路径下失败。根因（Node 22 BatBadBut 加固 / Windows cmd.exe stdio 重定向 / spawn 嵌套）需在 Windows 环境本地复现才能继续推进。跟踪 Issue：[#315](https://github.com/fitlab-ai/agent-infra/issues/315)。
