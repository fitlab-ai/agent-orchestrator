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
