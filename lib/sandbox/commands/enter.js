import { loadConfig } from '../config.js';
import { assertValidBranchName, containerNameCandidates } from '../constants.js';
import { detectEngine } from '../engine.js';
import { formatRemaining, syncClaudeCredentialsFromKeychain } from '../credentials.js';
import { runInteractiveEngine, runSafeEngine } from '../shell.js';
import { resolveTaskBranch } from '../task-resolver.js';

const USAGE = `Usage: ai sandbox exec <branch> [cmd...]`;
const TMUX_ENTRY_PATH = '/usr/local/bin/sandbox-tmux-entry';

// Terminal-detection variables that interactive TUIs (e.g. claude-code)
// inspect to enable progressive enhancements such as the kitty keyboard
// protocol, which is what makes Shift+Enter distinguishable from Enter.
// `docker exec` does not forward these by default, so we must pass them
// through explicitly.
const FORWARDED_TERMINAL_ENV = [
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'LC_TERMINAL',
  'LC_TERMINAL_VERSION'
];

export function terminalEnvFlags(env = process.env) {
  const flags = [];
  for (const name of FORWARDED_TERMINAL_ENV) {
    const value = env[name];
    if (value) {
      flags.push('-e', `${name}=${value}`);
    }
  }
  return flags;
}

export function enter(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(`${USAGE}\n`);
    if (args.length === 0) {
      return 1;
    }
    return 0;
  }

  const config = loadConfig();
  const engine = detectEngine();
  const [branchOrTaskId, ...cmd] = args;
  const branch = resolveTaskBranch(branchOrTaskId, config.repoRoot);
  assertValidBranchName(branch);
  const running = runSafeEngine(engine, 'docker', ['ps', '--format', '{{.Names}}']).split('\n');
  const container = containerNameCandidates(config, branch).find((name) => running.includes(name));

  if (!container) {
    throw new Error(`No running sandbox found for branch '${branch}'`);
  }

  if (config.tools.includes('claude-code')) {
    try {
      const result = syncClaudeCredentialsFromKeychain(config.home, config.project);
      if (result.status === 'STALE_ACCESS') {
        process.stderr.write(
          'Warning: Claude Code credentials on host appear stale. Run "ai sandbox refresh" or "claude /login" to renew.\n'
        );
      } else if (result.status === 'MISSING') {
        process.stderr.write('Warning: Claude Code credentials missing on host. Run "claude /login" to authenticate.\n');
      } else if (result.status === 'OK' && result.written) {
        const message = `Synced Claude Code credentials from host Keychain (expires in ${formatRemaining(result.expiresAt)})`;
        process.stderr.write(process.stderr.isTTY ? `\x1b[2m${message}\x1b[0m\n` : `${message}\n`);
      }
    } catch (error) {
      process.stderr.write(`Warning: Failed to sync Claude Code credentials: ${error.message}\n`);
    }
  }

  const envFlags = terminalEnvFlags();
  if (cmd.length === 0) {
    return runInteractiveEngine(engine, 'docker', ['exec', '-it', ...envFlags, container, 'bash', TMUX_ENTRY_PATH]);
  }

  return runInteractiveEngine(engine, 'docker', ['exec', '-it', ...envFlags, container, ...cmd]);
}
