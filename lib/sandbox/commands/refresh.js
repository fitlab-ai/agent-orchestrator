import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import {
  claudeCredentialsPath,
  formatRemaining,
  inspectClaudeKeychainStatus,
  syncClaudeCredentialsFromKeychain
} from '../credentials.js';
import { runProbe } from '../shell.js';

const USAGE = 'Usage: ai sandbox refresh';

export function probeClaudeStatus(spawnFn = runProbe) {
  const result = spawnFn('claude', ['/status'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000
  });
  return {
    ok: result.status === 0,
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null
  };
}

function discoverProjects(home) {
  const credentialsRoot = path.join(home, '.agent-infra', 'credentials');
  if (!fs.existsSync(credentialsRoot)) {
    return [];
  }

  return fs.readdirSync(credentialsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((project) => fs.existsSync(claudeCredentialsPath(home, project)));
}

export async function refresh(args, deps = {}) {
  const {
    spawnFn = runProbe,
    execFn,
    discoverFn = discoverProjects,
    writeStdout = (chunk) => process.stdout.write(chunk),
    writeStderr = (chunk) => process.stderr.write(chunk)
  } = deps;

  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    writeStdout(`${USAGE}\n`);
    return 0;
  }

  const { positionals } = parseArgs({ args, allowPositionals: true, strict: true });
  if (positionals.length > 0) {
    throw new Error(USAGE);
  }

  const home = homedir();
  if (!home) {
    throw new Error('sandbox: home directory is required');
  }

  const projects = discoverFn(home);
  if (projects.length === 0) {
    writeStdout('No project credentials to refresh.\n');
    return 0;
  }

  let inspection = inspectClaudeKeychainStatus(home, execFn);
  if (inspection.status === 'STALE_ACCESS') {
    writeStdout('Host credentials appear stale; probing claude /status to trigger refresh...\n');
    const probe = probeClaudeStatus(spawnFn);
    if (!probe.ok) {
      writeStderr(`Probe failed: ${probe.stderr || probe.error || 'unknown error'}\n`);
      writeStderr('Run "claude /login" on the host to renew credentials.\n');
      return 1;
    }
    writeStdout('Probe succeeded; re-inspecting host credentials.\n');
    inspection = inspectClaudeKeychainStatus(home, execFn);
  }

  if (inspection.status === 'MISSING') {
    writeStderr('No Claude Code credentials found on host.\n');
    writeStderr('Run "claude /login" on the host to authenticate.\n');
    return 1;
  }

  if (inspection.status !== 'OK') {
    writeStderr('Host credentials still invalid after probe; run "claude /login".\n');
    return 1;
  }

  let anyFailed = false;
  for (const project of projects) {
    try {
      const result = syncClaudeCredentialsFromKeychain(home, project, { execFn, inspection });
      const action = result.written ? 'updated' : 'unchanged';
      writeStdout(`[${project}] ${action}; expires in ${formatRemaining(result.expiresAt)}\n`);
    } catch (error) {
      anyFailed = true;
      writeStderr(`[${project}] sync failed: ${error.message}\n`);
    }
  }

  return anyFailed ? 1 : 0;
}
