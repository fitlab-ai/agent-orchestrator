import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadFreshEsm } from "../helpers.js";

function withHome(home, fn) {
  const previousHome = process.env.HOME;
  if (home === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = home;
  }
  try {
    return fn();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
}

function withPlatform(platform, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  try {
    return fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  }
}

function validBlob(expiresAt = Date.now() + 3_600_000) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: "token",
      refreshToken: "refresh-token",
      scopes: ["user:profile", "user:sessions:claude_code"],
      expiresAt
    }
  });
}

test("probeClaudeStatus maps claude status process results", async () => {
  const { probeClaudeStatus } = await loadFreshEsm("lib/sandbox/commands/refresh.js");

  assert.deepEqual(probeClaudeStatus((cmd, args, options) => {
    assert.equal(cmd, "claude");
    assert.deepEqual(args, ["/status"]);
    assert.equal(options.timeout, 30_000);
    return { status: 0, stderr: "" };
  }), { ok: true, stderr: "", error: null });

  assert.deepEqual(probeClaudeStatus(() => ({
    status: 1,
    stderr: "auth failed",
    error: new Error("failed")
  })), { ok: false, stderr: "auth failed", error: "failed" });
});

test("runProbe resolves Windows command shims through the shell wrapper", async () => {
  const { runProbe } = await loadFreshEsm("lib/sandbox/shell.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-win32-"));
  const claudePath = path.join(tmpDir, "claude.cmd");
  const previousPath = process.env.PATH;
  const previousPathext = process.env.PATHEXT;

  try {
    fs.writeFileSync(claudePath, "#!/bin/sh\nexit 0\n", "utf8");
    fs.chmodSync(claudePath, 0o755);
    process.env.PATH = `${tmpDir}${path.delimiter}${previousPath ?? ""}`;
    process.env.PATHEXT = ".CMD";

    withPlatform("win32", () => {
      const result = runProbe("claude", ["/status"], {
        spawnFn: (cmd, args, options) => {
          assert.equal(cmd, claudePath);
          assert.deepEqual(args, ["/status"]);
          assert.equal(options.shell, true);
          return { status: 0, stderr: "" };
        }
      });
      assert.deepEqual(result, { status: 0, stderr: "" });
    });
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousPathext === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = previousPathext;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("refresh batch mode lists discovered projects and syncs each one", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-"));
  const stdout = [];

  try {
    const code = await withHome(tmpDir, () => withPlatform("darwin", () => refresh([], {
      discoverFn: () => ["alpha", "beta"],
      execFn: () => validBlob(Date.now() + 3_600_000),
      writeStdout: (chunk) => stdout.push(chunk),
      writeStderr: () => {}
    })));

    assert.equal(code, 0);
    assert.equal(stdout.filter((line) => line.startsWith("[")).length, 2);
    assert.ok(fs.existsSync(path.join(tmpDir, ".agent-infra", "credentials", "alpha", "claude-code", ".credentials.json")));
    assert.ok(fs.existsSync(path.join(tmpDir, ".agent-infra", "credentials", "beta", "claude-code", ".credentials.json")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("refresh batch mode writes nothing when no projects exist", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const stdout = [];

  const code = await refresh([], {
    discoverFn: () => [],
    writeStdout: (chunk) => stdout.push(chunk)
  });

  assert.equal(code, 0);
  assert.equal(stdout.join(""), "No project credentials to refresh.\n");
});

test("refresh prints usage for help flags", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const stdout = [];

  assert.equal(await refresh(["--help"], {
    writeStdout: (chunk) => stdout.push(chunk)
  }), 0);
  assert.equal(stdout.join(""), "Usage: ai sandbox refresh [branch]\n");
});

test("refresh requires HOME in batch mode", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");

  await assert.rejects(
    withHome(undefined, () => refresh([], {
      discoverFn: () => []
    })),
    /sandbox: HOME environment variable is required/
  );
});

test("refresh single mode uses current project config", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-single-"));
  const stdout = [];

  try {
    const code = await withHome(tmpDir, () => withPlatform("darwin", () => refresh(["feature-x"], {
      loadConfigFn: () => ({ project: "current-project", repoRoot: tmpDir }),
      execFn: () => validBlob(),
      writeStdout: (chunk) => stdout.push(chunk),
      writeStderr: () => {}
    })));

    assert.equal(code, 0);
    assert.match(stdout.join(""), /branch feature-x in project current-project/);
    assert.ok(fs.existsSync(path.join(
      tmpDir,
      ".agent-infra",
      "credentials",
      "current-project",
      "claude-code",
      ".credentials.json"
    )));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("refresh single mode rejects invalid branch arguments", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");

  await assert.rejects(
    withHome(os.tmpdir(), () => refresh([""], {
      loadConfigFn: () => ({ project: "current-project", repoRoot: os.tmpdir() })
    })),
    /Branch name is required/
  );
});

test("refresh exits 1 with login prompt when host credentials are missing", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const stderr = [];

  const code = await withPlatform("darwin", () => refresh([], {
    discoverFn: () => ["agent-infra"],
    execFn: () => {
      throw new Error("missing");
    },
    writeStdout: () => {},
    writeStderr: (chunk) => stderr.push(chunk)
  }));

  assert.equal(code, 1);
  assert.match(stderr.join(""), /claude \/login/);
});

test("refresh exits 1 when probe fails after stale host credentials", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const stderr = [];

  const code = await withPlatform("darwin", () => refresh([], {
    discoverFn: () => ["agent-infra"],
    execFn: () => "not-json",
    spawnFn: () => ({ status: 1, stderr: "stale" }),
    writeStdout: () => {},
    writeStderr: (chunk) => stderr.push(chunk)
  }));

  assert.equal(code, 1);
  assert.match(stderr.join(""), /claude \/login/);
});

test("refresh succeeds after stale host credentials when probe restores valid credentials", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-probe-"));
  let inspected = 0;

  try {
    const code = await withHome(tmpDir, () => withPlatform("darwin", () => refresh([], {
      discoverFn: () => ["agent-infra"],
      execFn: () => {
        inspected += 1;
        return inspected === 1 ? "not-json" : validBlob();
      },
      spawnFn: () => ({ status: 0, stderr: "" }),
      writeStdout: () => {},
      writeStderr: () => {}
    })));

    assert.equal(code, 0);
    assert.equal(inspected, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("refresh reports unchanged status when destination matches blob", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-unchanged-"));
  const blob = validBlob();
  const targetDir = path.join(tmpDir, ".agent-infra", "credentials", "agent-infra", "claude-code");
  const stdout = [];

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".credentials.json"), blob, "utf8");
    const code = await withHome(tmpDir, () => withPlatform("darwin", () => refresh([], {
      discoverFn: () => ["agent-infra"],
      execFn: () => blob,
      writeStdout: (chunk) => stdout.push(chunk),
      writeStderr: () => {}
    })));

    assert.equal(code, 0);
    assert.match(stdout.join(""), /\[agent-infra\] unchanged;/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("refresh continues on per-project sync failure and exits 1 at end", async () => {
  const { refresh } = await loadFreshEsm("lib/sandbox/commands/refresh.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-refresh-fail-"));
  const stderr = [];

  try {
    fs.writeFileSync(path.join(tmpDir, ".agent-infra"), "x", "utf8");
    const code = await withHome(tmpDir, () => withPlatform("darwin", () => refresh([], {
      discoverFn: () => ["agent-infra"],
      execFn: () => validBlob(),
      writeStdout: () => {},
      writeStderr: (chunk) => stderr.push(chunk)
    })));

    assert.equal(code, 1);
    assert.match(stderr.join(""), /\[agent-infra\] sync failed:/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
