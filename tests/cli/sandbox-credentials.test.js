import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertModeBits, loadFreshEsm } from "../helpers.js";

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

function validBlob(overrides = {}) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: "token",
      refreshToken: "refresh-token",
      scopes: ["user:profile", "user:sessions:claude_code"],
      expiresAt: Date.now() + 7_200_000,
      ...overrides
    }
  }, null, 2);
}

test("extractClaudeCredentialsBlob reads the full Claude Code credentials blob from macOS Keychain", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const rawBlob = validBlob();

  withPlatform("darwin", () => {
    const blob = credentials.extractClaudeCredentialsBlob("/Users/demo", (cmd, args, options) => {
      assert.equal(cmd, "security");
      assert.deepEqual(args, [
        "find-generic-password",
        "-a",
        "demo",
        "-s",
        "Claude Code-credentials",
        "-w"
      ]);
      assert.deepEqual(options, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      return `${rawBlob}\n`;
    });

    assert.equal(blob, rawBlob);
  });
});

test("extractClaudeCredentialsBlob returns null when macOS Keychain lookup fails", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    assert.equal(credentials.extractClaudeCredentialsBlob("/Users/demo", () => {
      throw new Error("missing keychain item");
    }), null);
  });
});

test("extractClaudeCredentialsBlob returns null for empty macOS Keychain output", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    assert.equal(credentials.extractClaudeCredentialsBlob("/Users/demo", () => ""), null);
  });
});

test("extractClaudeCredentialsBlob returns null for invalid macOS Keychain JSON", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    assert.equal(credentials.extractClaudeCredentialsBlob("/Users/demo", () => "not-json"), null);
  });
});

test("extractClaudeCredentialsBlob returns null when macOS credentials lack required scopes", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    assert.equal(credentials.extractClaudeCredentialsBlob("/Users/demo", () => JSON.stringify({
      claudeAiOauth: {
        accessToken: "token",
        refreshToken: "refresh-token",
        scopes: ["user:inference"]
      }
    })), null);
  });
});

test("extractClaudeCredentialsBlob returns null when Linux credentials file is missing", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-token-missing-"));

  try {
    withPlatform("linux", () => {
      assert.equal(credentials.extractClaudeCredentialsBlob(tmpDir), null);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("extractClaudeCredentialsBlob returns null for invalid Linux credentials JSON", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-token-invalid-"));
  const claudeDir = path.join(tmpDir, ".claude");

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, ".credentials.json"), "garbage", "utf8");
    withPlatform("linux", () => {
      assert.equal(credentials.extractClaudeCredentialsBlob(tmpDir), null);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("extractClaudeCredentialsBlob returns null when Linux credentials lack required scopes", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-token-scopes-"));
  const claudeDir = path.join(tmpDir, ".claude");

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, ".credentials.json"), JSON.stringify({
      claudeAiOauth: {
        accessToken: "token",
        refreshToken: "refresh-token",
        scopes: ["user:inference"]
      }
    }), "utf8");
    withPlatform("linux", () => {
      assert.equal(credentials.extractClaudeCredentialsBlob(tmpDir), null);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("extractClaudeCredentialsBlob reads Linux credentials from the Claude config directory", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-token-"));
  const claudeDir = path.join(tmpDir, ".claude");
  const rawBlob = validBlob();

  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, ".credentials.json"), rawBlob, "utf8");
    withPlatform("linux", () => {
      assert.equal(credentials.extractClaudeCredentialsBlob(tmpDir), rawBlob);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("credential path helpers and writer manage the shared credential file", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-credentials-write-"));
  const credentialsDir = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code");
  const credentialsPath = path.join(credentialsDir, ".credentials.json");

  try {
    assert.equal(
      credentials.claudeCredentialsDir("/home/demo", "agent-infra"),
      "/home/demo/.agent-infra/credentials/agent-infra/claude-code"
    );
    assert.equal(
      credentials.claudeCredentialsPath("/home/demo", "agent-infra"),
      "/home/demo/.agent-infra/credentials/agent-infra/claude-code/.credentials.json"
    );

    credentials.writeClaudeCredentialsFile(tmpDir, "demo", "blob-1");
    credentials.writeClaudeCredentialsFile(tmpDir, "demo", "blob-2");
    assertModeBits(credentialsDir, 0o700);
    assertModeBits(credentialsPath, 0o600);
    assert.equal(fs.readFileSync(credentialsPath, "utf8"), "blob-2");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("assertClaudeCredentialsAvailable writes credentials only when claude-code is enabled", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const writes = [];

  credentials.assertClaudeCredentialsAvailable(
    "/Users/demo",
    "agent-infra",
    [{ tool: { id: "claude-code" }, dir: "/tmp/claude" }],
    () => "valid-blob",
    (...args) => writes.push(args)
  );
  assert.deepEqual(writes, [["/Users/demo", "agent-infra", "valid-blob"]]);

  let extractCalled = false;
  credentials.assertClaudeCredentialsAvailable(
    "/Users/demo",
    "agent-infra",
    [{ tool: { id: "codex" }, dir: "/tmp/codex" }],
    () => {
      extractCalled = true;
      return "blob";
    },
    () => {}
  );
  assert.equal(extractCalled, false);
});

test("assertClaudeCredentialsAvailable throws a readable error when credentials are missing", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  assert.throws(() => credentials.assertClaudeCredentialsAvailable(
    "/Users/demo",
    "agent-infra",
    [{ tool: { id: "claude-code" }, dir: "/tmp/claude" }],
    () => null,
    () => {}
  ), /Claude Code credentials not found on host/);
});

test("inspectClaudeKeychainStatus reports macOS credential states", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    assert.equal(credentials.inspectClaudeKeychainStatus("/Users/demo", () => validBlob()).status, "OK");
    assert.equal(credentials.inspectClaudeKeychainStatus("/Users/demo", () => {
      throw new Error("missing");
    }).status, "MISSING");
    assert.equal(credentials.inspectClaudeKeychainStatus("/Users/demo", () => "not-json").status, "STALE_ACCESS");
    assert.equal(credentials.inspectClaudeKeychainStatus("/Users/demo", () => JSON.stringify({
      claudeAiOauth: { accessToken: "token" }
    })).status, "STALE_ACCESS");
  });
});

test("inspectClaudeKeychainStatus reports Linux credential states", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-inspect-"));
  const credentialsPath = path.join(tmpDir, ".claude", ".credentials.json");
  const rawBlob = validBlob({ expiresAt: 123456 });

  try {
    withPlatform("linux", () => {
      assert.equal(credentials.inspectClaudeKeychainStatus(tmpDir).status, "MISSING");
    });
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    fs.writeFileSync(credentialsPath, "not-json", "utf8");
    withPlatform("linux", () => {
      assert.equal(credentials.inspectClaudeKeychainStatus(tmpDir).status, "STALE_ACCESS");
    });
    fs.writeFileSync(credentialsPath, rawBlob, "utf8");
    withPlatform("linux", () => {
      assert.deepEqual(credentials.inspectClaudeKeychainStatus(tmpDir), {
        status: "OK",
        blob: rawBlob,
        expiresAt: 123456
      });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("inspectClaudeMountFile reports mounted credential states", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-mount-inspect-"));
  const targetPath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");
  const rawBlob = validBlob({ expiresAt: 987654 });

  try {
    assert.equal(credentials.inspectClaudeMountFile(tmpDir, "demo").status, "MISSING");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "not-json", "utf8");
    assert.equal(credentials.inspectClaudeMountFile(tmpDir, "demo").status, "STALE_ACCESS");
    fs.writeFileSync(targetPath, rawBlob, "utf8");
    assert.deepEqual(credentials.inspectClaudeMountFile(tmpDir, "demo"), {
      status: "OK",
      blob: rawBlob,
      expiresAt: 987654
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("discoverProjects lists project credential copies only", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-discover-"));

  try {
    fs.mkdirSync(path.join(tmpDir, ".agent-infra", "credentials", "alpha", "claude-code"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".agent-infra", "credentials", "beta", "claude-code"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".agent-infra", "credentials", "alpha", "claude-code", ".credentials.json"),
      validBlob(),
      "utf8"
    );

    assert.deepEqual(credentials.discoverProjects(tmpDir), ["alpha"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("writeClaudeCredentialsToHost updates macOS Keychain credentials", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const rawBlob = validBlob();

  withPlatform("darwin", () => {
    assert.deepEqual(credentials.writeClaudeCredentialsToHost("/Users/demo", rawBlob, {
      execFn: (cmd, args, options) => {
        assert.equal(cmd, "security");
        assert.deepEqual(args, [
          "add-generic-password",
          "-U",
          "-a",
          "demo",
          "-s",
          "Claude Code-credentials",
          "-w",
          rawBlob
        ]);
        assert.deepEqual(options, {
          stdio: ["ignore", "ignore", "pipe"]
        });
      }
    }), { ok: true });
  });
});

test("writeClaudeCredentialsToHost returns a soft failure when macOS Keychain write fails", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");

  withPlatform("darwin", () => {
    const result = credentials.writeClaudeCredentialsToHost("/Users/demo", validBlob(), {
      execFn: () => {
        throw new Error("keychain locked");
      }
    });

    assert.deepEqual(result, { ok: false, error: "keychain locked" });
  });
});

test("writeClaudeCredentialsToHost atomically replaces Linux host credentials", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-host-write-"));
  const targetPath = path.join(tmpDir, ".claude", ".credentials.json");
  const rawBlob = validBlob();

  try {
    withPlatform("linux", () => {
      assert.deepEqual(credentials.writeClaudeCredentialsToHost(tmpDir, rawBlob, {
        randomFn: () => "fixed"
      }), { ok: true });
    });

    assertModeBits(path.dirname(targetPath), 0o700);
    assertModeBits(targetPath, 0o600);
    assert.equal(fs.readFileSync(targetPath, "utf8"), rawBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("writeClaudeCredentialsToHost preserves Linux host credentials when rename fails", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-claude-host-rename-fail-"));
  const targetDir = path.join(tmpDir, ".claude");
  const targetPath = path.join(targetDir, ".credentials.json");

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, "original", "utf8");

    withPlatform("linux", () => {
      const result = credentials.writeClaudeCredentialsToHost(tmpDir, validBlob(), {
        randomFn: () => "fixed",
        renameFn: () => {
          throw new Error("rename failed");
        }
      });

      assert.deepEqual(result, { ok: false, error: "rename failed" });
    });

    assert.equal(fs.readFileSync(targetPath, "utf8"), "original");
    assert.equal(fs.existsSync(`${targetPath}.tmp.${process.pid}.fixed`), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("syncClaudeCredentialsFromKeychain writes only when destination bytes differ", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const rawBlob = validBlob({ expiresAt: 123456 });
  const writes = [];

  withPlatform("darwin", () => {
    assert.deepEqual(credentials.syncClaudeCredentialsFromKeychain("/Users/demo", "agent-infra", {
      execFn: () => rawBlob,
      existsFn: () => false,
      writeFn: (...args) => writes.push(args)
    }), { status: "OK", written: true, expiresAt: 123456 });

    assert.deepEqual(credentials.syncClaudeCredentialsFromKeychain("/Users/demo", "agent-infra", {
      execFn: () => rawBlob,
      existsFn: () => true,
      readFn: () => rawBlob,
      writeFn: (...args) => writes.push(args)
    }), { status: "OK", written: false, expiresAt: 123456 });

    assert.deepEqual(credentials.syncClaudeCredentialsFromKeychain("/Users/demo", "agent-infra", {
      execFn: () => rawBlob,
      existsFn: () => true,
      readFn: () => "old",
      writeFn: (...args) => writes.push(args)
    }), { status: "OK", written: true, expiresAt: 123456 });

    assert.equal(writes.length, 2);
  });
});

test("syncClaudeCredentialsFromKeychain and formatRemaining handle unavailable or coarse states", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const now = 1_700_000_000_000;
  const originalNow = Date.now;
  let writeCalled = false;

  try {
    Date.now = () => now;
    withPlatform("darwin", () => {
      assert.deepEqual(credentials.syncClaudeCredentialsFromKeychain("/Users/demo", "agent-infra", {
        execFn: () => {
          throw new Error("missing");
        },
        writeFn: () => {
          writeCalled = true;
        }
      }), { status: "MISSING", written: false });
      assert.equal(writeCalled, false);
    });

    assert.equal(credentials.formatRemaining(null), "unknown");
    assert.equal(credentials.formatRemaining(now - 1), "EXPIRED");
    assert.equal(credentials.formatRemaining(now + 47 * 60_000), "47m");
    assert.equal(credentials.formatRemaining(now + 5 * 60 * 60_000 + 47 * 60_000), "5h 47m");
  } finally {
    Date.now = originalNow;
  }
});

test("reconcileClaudeCredentials writes project files when host credentials are newer", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-host-newer-"));
  const hostBlob = validBlob({ accessToken: "host", expiresAt: 200 });
  const fileBlob = validBlob({ accessToken: "file", expiresAt: 100 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(filePath, fileBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "OK");
    assert.equal(result.authoritative, "host");
    assert.deepEqual(result.filesWritten, ["demo"]);
    assert.equal(fs.readFileSync(filePath, "utf8"), hostBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials writes host credentials when a project file is newer", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-file-newer-"));
  const hostBlob = validBlob({ accessToken: "host", expiresAt: 100 });
  const fileBlob = validBlob({ accessToken: "file", expiresAt: 200 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(filePath, fileBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"],
      writeHostFn: (home, blob) => credentials.writeClaudeCredentialsToHost(home, blob, { randomFn: () => "fixed" })
    }));

    assert.equal(result.status, "OK");
    assert.equal(result.authoritative, "file:demo");
    assert.equal(result.hostWritten, true);
    assert.equal(fs.readFileSync(hostPath, "utf8"), fileBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials picks the freshest credentials across multiple project files", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-multi-"));
  const hostBlob = validBlob({ accessToken: "host", expiresAt: 100 });
  const alphaBlob = validBlob({ accessToken: "alpha", expiresAt: 200 });
  const betaBlob = validBlob({ accessToken: "beta", expiresAt: 300 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const alphaPath = path.join(tmpDir, ".agent-infra", "credentials", "alpha", "claude-code", ".credentials.json");
  const betaPath = path.join(tmpDir, ".agent-infra", "credentials", "beta", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(alphaPath), { recursive: true });
    fs.mkdirSync(path.dirname(betaPath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(alphaPath, alphaBlob, "utf8");
    fs.writeFileSync(betaPath, betaBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["alpha", "beta"]
    }));

    assert.equal(result.authoritative, "file:beta");
    assert.equal(result.hostWritten, true);
    assert.deepEqual(result.filesWritten, ["alpha"]);
    assert.equal(fs.readFileSync(hostPath, "utf8"), betaBlob);
    assert.equal(fs.readFileSync(alphaPath, "utf8"), betaBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials keeps host authoritative when host expiresAt is unknown", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-host-unknown-expiry-"));
  const hostBlob = validBlob({ accessToken: "host", expiresAt: undefined });
  const fileBlob = validBlob({ accessToken: "file", expiresAt: 300 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(filePath, fileBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "OK");
    assert.equal(result.authoritative, "host");
    assert.deepEqual(result.filesWritten, ["demo"]);
    assert.equal(fs.readFileSync(filePath, "utf8"), hostBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials reports KEYCHAIN_WRITE_FAILED when host write fails", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const fileBlob = validBlob({ expiresAt: 200 });

  withPlatform("darwin", () => {
    const result = credentials.reconcileClaudeCredentials("/Users/demo", {
      projects: ["demo"],
      execFn: () => {
        throw new Error("missing");
      },
      readFn: () => fileBlob,
      existsFn: () => true,
      writeHostFn: () => ({ ok: false, error: "keychain locked" })
    });

    assert.equal(result.status, "KEYCHAIN_WRITE_FAILED");
    assert.equal(result.authoritative, "file:demo");
    assert.deepEqual(result.warnings, ["keychain locked"]);
  });
});

test("reconcileClaudeCredentials skips writes when expiresAt values are equal", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-equal-"));
  const hostBlob = validBlob({ accessToken: "host", expiresAt: 100 });
  const fileBlob = validBlob({ accessToken: "file", expiresAt: 100 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(filePath, fileBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.authoritative, "host");
    assert.equal(result.hostWritten, false);
    assert.deepEqual(result.filesWritten, []);
    assert.equal(fs.readFileSync(filePath, "utf8"), fileBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials restores missing host credentials from a project file", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-host-missing-"));
  const fileBlob = validBlob({ expiresAt: 200 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fileBlob, "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "OK");
    assert.equal(result.authoritative, "file:demo");
    assert.equal(result.hostWritten, true);
    assert.equal(fs.readFileSync(hostPath, "utf8"), fileBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials falls back to host one-way sync when files are stale", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-file-stale-"));
  const hostBlob = validBlob({ expiresAt: 200 });
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, hostBlob, "utf8");
    fs.writeFileSync(filePath, "not-json", "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "OK");
    assert.equal(result.authoritative, "host");
    assert.deepEqual(result.filesWritten, ["demo"]);
    assert.equal(fs.readFileSync(filePath, "utf8"), hostBlob);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials reports stale when no endpoint has valid credentials", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-stale-"));
  const hostPath = path.join(tmpDir, ".claude", ".credentials.json");
  const filePath = path.join(tmpDir, ".agent-infra", "credentials", "demo", "claude-code", ".credentials.json");

  try {
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(hostPath, "not-json", "utf8");
    fs.writeFileSync(filePath, "not-json", "utf8");

    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "STALE_ACCESS");
    assert.equal(result.authoritative, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reconcileClaudeCredentials reports missing when no endpoint exists", async () => {
  const credentials = await loadFreshEsm("lib/sandbox/credentials.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-infra-reconcile-missing-"));

  try {
    const result = withPlatform("linux", () => credentials.reconcileClaudeCredentials(tmpDir, {
      projects: ["demo"]
    }));

    assert.equal(result.status, "MISSING");
    assert.equal(result.authoritative, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
