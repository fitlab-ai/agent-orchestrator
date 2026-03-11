const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function filePath(relativePath) {
  return path.join(rootDir, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function listFilesRecursive(relativeDir) {
  const entries = fs.readdirSync(filePath(relativeDir), { withFileTypes: true });

  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(relativePath);
    }
    return [relativePath];
  });
}

function listSkillNames() {
  return fs.readdirSync(filePath(".agents/skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function langTemplate(basePath, lang) {
  if (lang === "zh-CN") {
    const ext = path.extname(basePath);
    const variant = basePath.replace(ext, `.zh-CN${ext}`);
    if (exists(variant)) return variant;
  }
  return basePath;
}

function renderPlaceholders(content, replacements) {
  return content
    .replace(/\{\{project\}\}/g, replacements.project)
    .replace(/\{\{org\}\}/g, replacements.org);
}

function buildCommandSyncFiles(project) {
  return listSkillNames().flatMap((skill) => [
    [`.claude/commands/${skill}.md`, `templates/.claude/commands/${skill}.md`],
    [`.opencode/commands/${skill}.md`, `templates/.opencode/commands/${skill}.md`],
    [`.gemini/commands/${project}/${skill}.toml`, `templates/.gemini/commands/_project_/${skill}.toml`]
  ]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadFresh(relativePath) {
  const resolved = require.resolve(filePath(relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

function assertContainsPatterns(relativePath, patterns) {
  const content = read(relativePath);

  patterns.forEach((pattern) => {
    assert.match(content, pattern, `${relativePath} should match ${pattern}`);
  });
}

function skillDocPaths(skill) {
  return [
    `.agents/skills/${skill}/SKILL.md`,
    `templates/.agents/skills/${skill}/SKILL.md`,
    `templates/.agents/skills/${skill}/SKILL.zh-CN.md`
  ].filter(exists);
}

const commandSpecs = {
  "analyze-codescan": {
    usage: "<alert-number>",
    en: "Analyze CodeQL alert #$1.",
    zh: "分析 CodeQL 告警 #$1。"
  },
  "analyze-dependabot": {
    usage: "<alert-number>",
    en: "Analyze Dependabot alert #$1.",
    zh: "分析 Dependabot 告警 #$1。"
  },
  "analyze-issue": {
    usage: "<issue-number>",
    en: "Analyze Issue #$1.",
    zh: "分析 Issue #$1。"
  },
  "block-task": {
    usage: "<task-id> [reason]",
    en: "Block task: $ARGUMENTS",
    zh: "阻塞任务：$ARGUMENTS"
  },
  "check-task": {
    usage: "<task-id>",
    en: "Check status of task $1.",
    zh: "查看任务 $1 的状态。"
  },
  commit: {},
  "close-codescan": {
    usage: "<alert-number>",
    en: "Close CodeQL alert #$1.",
    zh: "关闭 CodeQL 告警 #$1。"
  },
  "close-dependabot": {
    usage: "<alert-number>",
    en: "Close Dependabot alert #$1.",
    zh: "关闭 Dependabot 告警 #$1。"
  },
  "complete-task": {
    usage: "<task-id>",
    en: "Complete task $1.",
    zh: "完成任务 $1。"
  },
  "create-pr": {
    usage: "[target-branch]",
    en: "Create PR: $ARGUMENTS",
    zh: "创建 PR：$ARGUMENTS"
  },
  "create-release-note": {
    usage: "<ver> [prev]",
    en: "Generate release note: $ARGUMENTS",
    zh: "生成发布说明：$ARGUMENTS"
  },
  "create-task": {
    usage: "<description>",
    en: "Task description: $ARGUMENTS",
    zh: "任务描述：$ARGUMENTS"
  },
  "implement-task": {
    usage: "<task-id>",
    en: "Implement task $1.",
    zh: "实施任务 $1。"
  },
  "plan-task": {
    usage: "<task-id>",
    en: "Design plan for task $1.",
    zh: "为任务 $1 设计方案。"
  },
  "refine-task": {
    usage: "<task-id>",
    en: "Refine task $1.",
    zh: "修复任务 $1 的审查问题。"
  },
  "refine-title": {
    usage: "<number>",
    en: "Refine title of #$1.",
    zh: "优化 #$1 的标题。"
  },
  release: {
    usage: "<version>",
    en: "Release version $1.",
    zh: "发布版本 $1。"
  },
  "review-task": {
    usage: "<task-id>",
    en: "Review task $1.",
    zh: "审查任务 $1。"
  },
  "sync-issue": {
    usage: "<task-id>",
    en: "Sync task $1 to Issue.",
    zh: "同步任务 $1 到 Issue。"
  },
  "sync-pr": {
    usage: "<task-id>",
    en: "Sync task $1 to PR.",
    zh: "同步任务 $1 到 PR。"
  },
  test: {},
  "test-integration": {},
  "update-ai-collaboration": {},
  "upgrade-dependency": {
    usage: "<pkg> <from> <to>",
    en: "Upgrade dependency: $ARGUMENTS",
    zh: "升级依赖：$ARGUMENTS"
  }
};

test("collaborator.json declares templates as the template source", () => {
  const collaborator = JSON.parse(read("collaborator.json"));

  assert.equal(collaborator.templateSource, "templates/");
});

test("collaborator.json merged patterns use recursive command globs and explicit skill paths", () => {
  const collaborator = JSON.parse(read("collaborator.json"));
  const merged = collaborator.files.merged;

  [
    "**/test.*",
    "**/test-integration.*",
    "**/release.*",
    "**/upgrade-dependency.*",
    ".agents/skills/test/SKILL.*",
    ".agents/skills/test-integration/SKILL.*",
    ".agents/skills/release/SKILL.*",
    ".agents/skills/upgrade-dependency/SKILL.*"
  ].forEach((pattern) => {
    assert.ok(merged.includes(pattern), `merged should include ${pattern}`);
  });

  [
    "*/test.*",
    "*/test-integration.*",
    "*/release.*",
    "*/upgrade-dependency.*"
  ].forEach((pattern) => {
    assert.ok(!merged.includes(pattern), `merged should not include legacy ${pattern}`);
  });
});

test("required template files were migrated into templates/", () => {
  const requiredFiles = [
    "templates/.mailmap",
    "templates/.editorconfig",
    "templates/.agents/workflows/feature-development.yaml",
    "templates/.agents/templates/task.md",
    "templates/.agents/README.md",
    "templates/.agents/QUICKSTART.md",
    "templates/.agents/skills/update-ai-collaboration/SKILL.md",
    "templates/.ai-workspace/README.md",
    "templates/.ai-workspace/README.zh-CN.md",
    "templates/.claude/CLAUDE.md",
    "templates/.claude/project-rules.md",
    "templates/.claude/settings.json",
    "templates/.claude/commands/update-ai-collaboration.md",
    "templates/.codex/README.md",
    "templates/.gemini/settings.json",
    "templates/.gemini/commands/_project_/update-ai-collaboration.toml",
    "templates/.opencode/README.md",
    "templates/.opencode/COMMAND_STYLE_GUIDE.md",
    "templates/.opencode/commands/update-ai-collaboration.md",
    "templates/.github/ISSUE_TEMPLATE/01_bug_report.yml",
    "templates/.github/workflows/pr-title-check.yml",
    "templates/.github/PULL_REQUEST_TEMPLATE.md",
    "templates/AGENTS.md",
    "templates/CONTRIBUTING.md",
    "templates/SECURITY.md",
    "templates/.gitignore",
    "templates/README.md",
    "templates/README.zh-CN.md"
  ];

  requiredFiles.forEach((relativePath) => {
    assert.ok(exists(relativePath), `Missing migrated template file: ${relativePath}`);
  });
});

test("templates do not contain legacy single-brace project or org placeholders", () => {
  const templateFiles = listFilesRecursive("templates");

  templateFiles.forEach((relativePath) => {
    const content = read(relativePath);

    assert.doesNotMatch(
      content,
      /(?<!\{)\{project\}(?!\})/,
      `${relativePath} should not contain legacy {project} placeholders`
    );
    assert.doesNotMatch(
      content,
      /(?<!\{)\{org\}(?!\})/,
      `${relativePath} should not contain legacy {org} placeholders`
    );
  });
});

test("init-project files have been removed", () => {
  const removedFiles = [
    ".agents/skills/init-project/SKILL.md",
    ".claude/commands/init-project.md",
    ".gemini/commands/collaborator/init-project.toml",
    ".opencode/commands/init-project.md",
    "templates/.agents/skills/init-project/SKILL.md",
    "templates/.claude/commands/init-project.md",
    "templates/.gemini/commands/_project_/init-project.toml",
    "templates/.opencode/commands/init-project.md"
  ];

  removedFiles.forEach((relativePath) => {
    assert.ok(!exists(relativePath), `init-project file should be removed: ${relativePath}`);
  });
});

test("bootstrap CLI files exist", () => {
  assert.ok(exists("install.sh"), "install.sh should exist");
  assert.ok(exists("bin/cli.js"), "bin/cli.js (node) should exist");

  const installSh = read("install.sh");
  assert.match(installSh, /git clone/);
  assert.match(installSh, /\.ai-collaboration-installer/);

  const nodeCli = read("bin/cli.js");
  assert.match(nodeCli, /ai-collaboration-installer/);

  const nodeStats = fs.statSync(filePath("bin/cli.js"));
  assert.ok(nodeStats.mode & 0o111, "bin/cli.js should be executable");
});

test("paths detect clone installs when bundled templates live under HOME", () => {
  const os = require("node:os");
  const originalHomedir = os.homedir;
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ai-collab-home-"));

  try {
    const installDir = path.join(tmpDir, ".ai-collaboration-installer");
    fs.mkdirSync(path.join(installDir, "templates"), { recursive: true });

    os.homedir = () => tmpDir;
    const paths = loadFresh("lib/paths.js");

    assert.equal(paths.resolveInstallDir(), installDir);
    assert.equal(paths.resolveTemplateDir(), filePath("templates"));
    assert.equal(paths.isCloneInstall(), false);

    fs.rmSync(path.join(installDir, "templates"), { recursive: true, force: true });
    fs.symlinkSync(filePath("templates"), path.join(installDir, "templates"), "dir");

    const clonePaths = loadFresh("lib/paths.js");
    assert.equal(clonePaths.resolveTemplateDir(), filePath("templates"));
    assert.equal(clonePaths.isCloneInstall(), true);
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("update-ai-collaboration instructions point to templates rendering", () => {
  const updateSkill = read(".agents/skills/update-ai-collaboration/SKILL.md");
  const geminiUpdate = read(".gemini/commands/ai-collaboration-installer/update-ai-collaboration.toml");

  assert.match(updateSkill, /templateSource/);
  assert.match(updateSkill, /templates\//);
  assert.match(updateSkill, /git.*pull/);
  assert.match(geminiUpdate, /SKILL\.md/);
});

test("skill command templates use thin adapter bodies", () => {
  const skills = listSkillNames();

  skills.forEach((skill) => {
    const spec = commandSpecs[skill] || {};
    const markdownTargets = [
      `templates/.claude/commands/${skill}.md`,
      `templates/.claude/commands/${skill}.zh-CN.md`,
      `templates/.opencode/commands/${skill}.md`,
      `templates/.opencode/commands/${skill}.zh-CN.md`
    ];
    const tomlTargets = [
      `templates/.gemini/commands/_project_/${skill}.toml`,
      `templates/.gemini/commands/_project_/${skill}.zh-CN.toml`
    ];
    const skillPathPattern = new RegExp(escapeRegExp(`.agents/skills/${skill}/SKILL.md`));

    markdownTargets.forEach((target) => {
      const content = read(target);
      const isChinese = target.endsWith(".zh-CN.md");
      const contextLine = isChinese ? spec.zh : spec.en;

      assert.match(content, skillPathPattern, `${target} should reference the skill file`);
      assert.doesNotMatch(content, /^name:/m, `${target} should not declare a name field`);
      assert.doesNotMatch(content, /^argument-hint:/m, `${target} should not declare an argument hint`);

      if (target.includes("/.claude/")) {
        if (spec.usage) {
          assert.match(
            content,
            new RegExp(`^usage: "${escapeRegExp(`/${skill} ${spec.usage}`)}"$`, "m"),
            `${target} should declare the Claude usage`
          );
        } else {
          assert.doesNotMatch(content, /^usage:/m, `${target} should not declare usage`);
        }
      } else {
        assert.doesNotMatch(content, /^usage:/m, `${target} should not declare usage`);
      }

      if (target.includes("/.opencode/")) {
        assert.match(content, /^agent: general$/m, `${target} should declare the OpenCode agent`);
        assert.match(content, /^subtask: false$/m, `${target} should declare the OpenCode subtask flag`);
      }

      if (contextLine && !target.includes("/.claude/")) {
        assert.match(
          content,
          new RegExp(escapeRegExp(contextLine)),
          `${target} should include the command argument context`
        );
      } else if (!contextLine) {
        assert.doesNotMatch(content, /\$1|\$ARGUMENTS/, `${target} should not include argument placeholders`);
      }

      if (isChinese) {
        assert.match(content, /读取并执行/, `${target} should use the Chinese thin adapter body`);
        assert.match(content, /严格按照技能中定义的所有步骤执行/, `${target} should include the Chinese execution instruction`);
      } else {
        assert.match(content, /Read and execute the .* skill from/, `${target} should use the English thin adapter body`);
        assert.match(content, /Follow all steps defined in the skill exactly/, `${target} should include the English execution instruction`);
      }
    });

    tomlTargets.forEach((target) => {
      const content = read(target);
      const isChinese = target.endsWith(".zh-CN.toml");
      const contextLine = (isChinese ? spec.zh : spec.en)
        ?.replace(/\$1/g, "{{args}}")
        .replace(/\$ARGUMENTS/g, "{{args}}");

      assert.match(content, /^description = "/, `${target} should declare a TOML description`);
      assert.match(content, /^prompt = """$/m, `${target} should use a multiline TOML prompt`);
      assert.match(content, skillPathPattern, `${target} should reference the skill file`);

      if (contextLine) {
        assert.match(
          content,
          new RegExp(escapeRegExp(contextLine)),
          `${target} should include the Gemini argument context`
        );
      } else {
        assert.doesNotMatch(content, /\{\{args\}\}/, `${target} should not include Gemini arguments`);
      }

      if (isChinese) {
        assert.match(content, /读取并执行/, `${target} should use the Chinese thin adapter body`);
        assert.match(content, /严格按照技能中定义的所有步骤执行/, `${target} should include the Chinese execution instruction`);
      } else {
        assert.match(content, /Read and execute the .* skill from/, `${target} should use the English thin adapter body`);
        assert.match(content, /Follow all steps defined in the skill exactly/, `${target} should include the English execution instruction`);
      }
    });
  });
});

test("update-ai-collaboration template copies stay in sync with working files", () => {
  const collaborator = JSON.parse(read("collaborator.json"));
  const project = collaborator.project;
  const org = collaborator.org;
  const lang = collaborator.language;

  const syncFiles = [
    [".agents/skills/update-ai-collaboration/SKILL.md", "templates/.agents/skills/update-ai-collaboration/SKILL.md"],
    ...buildCommandSyncFiles(project)
  ];

  syncFiles.forEach(([source, target]) => {
    const templatePath = langTemplate(target, lang);
    const rendered = renderPlaceholders(read(templatePath), { project, org });
    assert.equal(rendered, read(source), `${templatePath} is out of sync with ${source}`);
  });
});

test("artifact versioning guidance exists in repeatable workflow skills", () => {
  [
    ".agents/skills/implement-task/SKILL.md",
    "templates/.agents/skills/implement-task/SKILL.md",
    "templates/.agents/skills/implement-task/SKILL.zh-CN.md"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /implementation-r\{N\}\.md/,
      /Implementation \(Round \{N\}\)/,
      /\{implementation-artifact\}/
    ]);
  });

  [
    ".agents/skills/review-task/SKILL.md",
    "templates/.agents/skills/review-task/SKILL.md",
    "templates/.agents/skills/review-task/SKILL.zh-CN.md"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /review-r\{N\}\.md/,
      /implementation-r\{N\}\.md/,
      /Code Review \(Round \{N\}\)/
    ]);
  });

  [
    ".agents/skills/refine-task/SKILL.md",
    "templates/.agents/skills/refine-task/SKILL.md",
    "templates/.agents/skills/refine-task/SKILL.zh-CN.md"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /review-r\{N\}\.md/,
      /Review artifact mismatch:/,
      /\{implementation-artifact\}/
    ]);
  });

  [
    ".agents/skills/check-task/SKILL.md",
    "templates/.agents/skills/check-task/SKILL.md",
    "templates/.agents/skills/check-task/SKILL.zh-CN.md"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /implementation-r2\.md/,
      /review-r2\.md/,
      /latest/
    ]);
  });

  [
    ".agents/skills/complete-task/SKILL.md",
    "templates/.agents/skills/complete-task/SKILL.md",
    "templates/.agents/skills/complete-task/SKILL.zh-CN.md"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /review-r\{N\}\.md/,
      /Approved/
    ]);
  });
});

test("workflows document artifact versioning for implementation, review, and fix loops", () => {
  [
    ".agents/workflows/feature-development.yaml",
    ".agents/workflows/bug-fix.yaml",
    ".agents/workflows/refactoring.yaml",
    "templates/.agents/workflows/feature-development.yaml",
    "templates/.agents/workflows/bug-fix.yaml",
    "templates/.agents/workflows/refactoring.yaml",
    "templates/.agents/workflows/feature-development.zh-CN.yaml",
    "templates/.agents/workflows/bug-fix.zh-CN.yaml",
    "templates/.agents/workflows/refactoring.zh-CN.yaml"
  ].forEach((relativePath) => {
    assertContainsPatterns(relativePath, [
      /artifact_versioning:/,
      /implementation-r\{N\}\.md/,
      /review-r\{N\}\.md/,
      /Activity Log/
    ]);
  });
});

test("skills that write timestamps require date command guidance", () => {
  const timestampSkills = [
    "analyze-codescan",
    "analyze-dependabot",
    "analyze-issue",
    "block-task",
    "close-codescan",
    "close-dependabot",
    "commit",
    "complete-task",
    "create-pr",
    "create-task",
    "implement-task",
    "plan-task",
    "refine-task",
    "review-task",
    "sync-issue",
    "sync-pr"
  ];

  timestampSkills.forEach((skill) => {
    skillDocPaths(skill).forEach((relativePath) => {
      const content = read(relativePath);
      assert.match(
        content,
        /date "\+%Y-%m-%d %H:%M:%S"/,
        `${relativePath} should require the date command for timestamp writes`
      );
    });
  });
});

test("renderPlaceholders only replaces double-brace placeholders", () => {
  const rendered = renderPlaceholders(
    "literal {project} {{project}} {org} {{org}}",
    { project: "demo", org: "acme" }
  );

  assert.equal(rendered, "literal {project} demo {org} acme");
});

test("cli version output stays in sync with package.json", () => {
  const { execFileSync } = require("node:child_process");
  const pkg = JSON.parse(read("package.json"));
  const output = execFileSync(process.execPath, [filePath("bin/cli.js"), "version"], {
    encoding: "utf8"
  });

  assert.equal(output.trim(), `ai-collaboration-installer ${pkg.version}`);
});

test("prompt does not recreate readline after close", async () => {
  const readline = require("node:readline");
  const originalCreateInterface = readline.createInterface;
  const originalStdoutWrite = process.stdout.write;
  let createCount = 0;

  readline.createInterface = () => {
    createCount += 1;
    const handlers = {};
    return {
      on(event, handler) {
        handlers[event] = handler;
        return this;
      },
      close() {
        if (handlers.close) handlers.close();
      }
    };
  };
  process.stdout.write = () => true;

  try {
    const promptModule = loadFresh("lib/prompt.js");
    const firstPrompt = promptModule.prompt("Project name", "demo");
    promptModule.closePrompt();
    const firstValue = await firstPrompt;
    const secondValue = await promptModule.prompt("Project name", "demo");

    assert.equal(firstValue, "demo");
    assert.equal(secondValue, "demo");
    assert.equal(createCount, 1);
  } finally {
    readline.createInterface = originalCreateInterface;
    process.stdout.write = originalStdoutWrite;
  }
});

test("ai-collaboration-installer init generates seed files in a temp directory", () => {
  const os = require("node:os");
  const { execSync } = require("node:child_process");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-collab-test-"));
  const cli = filePath("bin/cli.js");

  try {
    // run init with piped input: project=testproj, org=testorg, language=default
    execSync(
      `printf 'testproj\\ntestorg\\n\\n' | node "${cli}" init`,
      { cwd: tmpDir, stdio: "pipe" }
    );

    // verify collaborator.json was generated
    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "collaborator.json"), "utf8")
    );
    assert.equal(config.project, "testproj");
    assert.equal(config.org, "testorg");
    assert.ok(!config.branchPrefix, "branchPrefix should not exist");
    assert.ok(!config.source, "consumer projects should not have source: self");
    assert.ok(!config.files.managed.includes(".mailmap"), ".mailmap should not be managed");
    assert.ok(config.files.merged.includes(".mailmap"), ".mailmap should be merged");
    [
      "**/test.*",
      "**/test-integration.*",
      "**/release.*",
      "**/upgrade-dependency.*",
      ".agents/skills/test/SKILL.*",
      ".agents/skills/test-integration/SKILL.*",
      ".agents/skills/release/SKILL.*",
      ".agents/skills/upgrade-dependency/SKILL.*"
    ].forEach((pattern) => {
      assert.ok(
        config.files.merged.includes(pattern),
        `init should generate merged pattern ${pattern}`
      );
    });

    // verify seed command files exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, ".agents/skills/update-ai-collaboration/SKILL.md")),
      "skill should be installed"
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, ".claude/commands/update-ai-collaboration.md")),
      "claude command should be installed"
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, ".codex/commands/testproj-update-ai-collaboration.md")),
      "codex prompt adapter should not be installed"
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, ".codex/scripts/install-prompts.sh")),
      "codex prompt sync script should not be installed"
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, ".codex/prompts/testproj-update-ai-collaboration.md")),
      "codex prompt should not be synced to the global dir"
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, ".gemini/commands/testproj/update-ai-collaboration.toml")),
      "gemini command should be installed"
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, ".opencode/commands/update-ai-collaboration.md")),
      "opencode command should be installed"
    );

    // verify placeholders were rendered
    const skill = fs.readFileSync(
      path.join(tmpDir, ".agents/skills/update-ai-collaboration/SKILL.md"), "utf8"
    );
    assert.doesNotMatch(skill, /\{\{project\}\}/, "skill should not contain unrendered {{project}}");
    assert.doesNotMatch(skill, /\{\{org\}\}/, "skill should not contain unrendered {{org}}");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ai-collaboration-installer init rejects invalid input", () => {
  const os = require("node:os");
  const { execSync } = require("node:child_process");
  const cli = filePath("bin/cli.js");

  const cases = [
    { input: 'demo"x\\ntestorg\\n\\n', desc: "project name with quote" },
    { input: 'testproj\\ntestorg\\nbad-lang\\n', desc: "unsupported language" }
  ];

  cases.forEach(({ input, desc }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-collab-test-"));
    try {
      assert.throws(() => {
        execSync(
          `printf '${input}' | node "${cli}" init`,
          { cwd: tmpDir, stdio: "pipe" }
        );
      }, `should reject: ${desc}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test("collaborator.json does not contain license field", () => {
  const collaborator = JSON.parse(read("collaborator.json"));
  assert.ok(!("license" in collaborator), "license field should not exist in collaborator.json");
});

test("collaborator.json excludes deprecated codex prompt paths", () => {
  const collaborator = JSON.parse(read("collaborator.json"));
  assert.ok(
    !collaborator.files.managed.includes(".codex/commands/"),
    ".codex/commands/ should not be in managed list"
  );
  assert.ok(
    !collaborator.files.managed.includes(".codex/scripts/"),
    ".codex/scripts/ should not be in managed list"
  );
});

test("README documents the bootstrap installation flow", () => {
  const readme = read("README.md");
  const readmeZh = read("README.zh-CN.md");

  assert.match(readme, /install\.sh/);
  assert.match(readme, /ai-collaboration-installer init/);
  assert.match(readme, /update-ai-collaboration/);
  assert.match(readme, /npm install -g/);
  assert.match(readme, /npx ai-collaboration-installer/);
  assert.match(readmeZh, /install\.sh/);
  assert.match(readmeZh, /ai-collaboration-installer init/);
  assert.match(readmeZh, /update-ai-collaboration/);
  assert.match(readmeZh, /npm install -g/);
  assert.match(readmeZh, /npx ai-collaboration-installer/);
});
