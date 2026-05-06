import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { hostJoin } from './engines/wsl2-paths.js';

function validateClaudeCredentialsBlob(raw, blob = null) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { status: 'MISSING' };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { status: 'STALE_ACCESS' };
  }

  const payload = parsed?.claudeAiOauth ?? parsed;
  const scopes = Array.isArray(payload?.scopes) ? payload.scopes : [];
  const hasRequiredScopes = scopes.includes('user:profile')
    && scopes.includes('user:sessions:claude_code');
  if (!payload?.accessToken || !payload?.refreshToken || !hasRequiredScopes) {
    return { status: 'STALE_ACCESS' };
  }

  return {
    status: 'OK',
    blob: blob ?? trimmed,
    expiresAt: typeof payload?.expiresAt === 'number' ? payload.expiresAt : null
  };
}

export function inspectClaudeKeychainStatus(home, execFn = execFileSync) {
  if (process.platform === 'darwin') {
    try {
      const keychainAccount = path.basename(home);
      const credentials = execFn('security', [
        'find-generic-password',
        '-a',
        keychainAccount,
        '-s',
        'Claude Code-credentials',
        '-w'
      ], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return validateClaudeCredentialsBlob(credentials);
    } catch {
      return { status: 'MISSING' };
    }
  }

  const credentialsPath = path.join(home, '.claude', '.credentials.json');
  if (!fs.existsSync(credentialsPath)) {
    return { status: 'MISSING' };
  }

  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8');
    return validateClaudeCredentialsBlob(raw, raw);
  } catch {
    return { status: 'STALE_ACCESS' };
  }
}

export function extractClaudeCredentialsBlob(home, execFn = execFileSync) {
  const inspection = inspectClaudeKeychainStatus(home, execFn);
  return inspection.status === 'OK' ? inspection.blob : null;
}

export function claudeCredentialsDir(home, project) {
  return hostJoin(home, '.agent-infra', 'credentials', project, 'claude-code');
}

export function claudeCredentialsPath(home, project) {
  return hostJoin(claudeCredentialsDir(home, project), '.credentials.json');
}

export function writeClaudeCredentialsFile(home, project, blob) {
  const dir = claudeCredentialsDir(home, project);
  const filePath = claudeCredentialsPath(home, project);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(filePath, blob, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function syncClaudeCredentialsFromKeychain(home, project, options = {}) {
  const {
    execFn = execFileSync,
    writeFn = writeClaudeCredentialsFile,
    readFn = (filePath) => fs.readFileSync(filePath, 'utf8'),
    existsFn = fs.existsSync,
    inspection = null
  } = options;

  const currentInspection = inspection ?? inspectClaudeKeychainStatus(home, execFn);
  if (currentInspection.status !== 'OK') {
    return { status: currentInspection.status, written: false };
  }

  const targetPath = claudeCredentialsPath(home, project);
  let existing = null;
  if (existsFn(targetPath)) {
    try {
      existing = readFn(targetPath);
    } catch {
      existing = null;
    }
  }

  if (existing === currentInspection.blob) {
    return { status: 'OK', written: false, expiresAt: currentInspection.expiresAt };
  }

  writeFn(home, project, currentInspection.blob);
  return { status: 'OK', written: true, expiresAt: currentInspection.expiresAt };
}

export function formatRemaining(expiresAt) {
  if (typeof expiresAt !== 'number') {
    return 'unknown';
  }

  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    return 'EXPIRED';
  }

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function assertClaudeCredentialsAvailable(
  home,
  project,
  resolvedTools,
  extractFn = extractClaudeCredentialsBlob,
  writeFn = writeClaudeCredentialsFile
) {
  const claudeCodeEntry = resolvedTools.find(({ tool }) => tool.id === 'claude-code');
  if (!claudeCodeEntry) {
    return;
  }

  const blob = extractFn(home);
  if (!blob) {
    throw new Error([
      'Claude Code credentials not found on host.',
      '',
      'The sandbox needs your Claude Code OAuth credentials so the container can use Claude Code.',
      '',
      'To fix:',
      '  1. On the host, run "claude" once and complete the OAuth login flow.',
      '  2. Verify with "claude /status" that you see your subscription.',
      '  3. Re-run "ai sandbox create".',
      '',
      'Alternatively, if you do not need Claude Code in this sandbox,',
      'remove "claude-code" from the "sandbox.tools" array in .agents/.airc.json.'
    ].join('\n'));
  }

  writeFn(home, project, blob);
}
