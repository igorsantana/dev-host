#!/usr/bin/env node
/**
 * Clone or update every project under developmentRoot from GitHub.
 *
 * Usage:
 *   node scripts/sync-projects.mjs
 *   npm run sync
 *
 * Options (env):
 *   SYNC_DRY_RUN=1  — print actions without running git
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostRoot = resolve(scriptDir, "..");
const dryRun = process.env.SYNC_DRY_RUN === "1";

/** @type {{ developmentRoot: string; syncRepos?: SyncEntry[]; projects: SyncEntry[] }} */
const config = JSON.parse(
  readFileSync(resolve(hostRoot, "projects.json"), "utf8"),
);

const devRoot = resolve(hostRoot, config.developmentRoot);

/** @typedef {{ id?: string; name: string; path: string; repository?: string; branch?: string }} SyncEntry */

/** @returns {SyncEntry[]} */
function collectEntries() {
  const fromProjects = config.projects
    .filter((p) => p.repository)
    .map((p) => ({
      name: p.name,
      path: p.path,
      repository: p.repository,
      branch: p.branch,
    }));

  const extra = (config.syncRepos ?? []).map((r) => ({
    name: r.name,
    path: r.path,
    repository: r.repository,
    branch: r.branch,
  }));

  return [...extra, ...fromProjects];
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 */
function git(cmd, args, cwd) {
  const label = `git ${args.join(" ")}`;
  if (dryRun) {
    console.log(`  [dry-run] ${label}  (cwd: ${cwd})`);
    return 0;
  }
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    encoding: "utf8",
  });
  return result.status ?? 1;
}

/** @param {string} dir */
function isGitRepo(dir) {
  return existsSync(resolve(dir, ".git"));
}

/** @param {string} dir */
function hasLocalChanges(dir) {
  if (dryRun) return false;
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: dir,
    encoding: "utf8",
  });
  return Boolean(result.stdout?.trim());
}

/** @param {string} dir */
function currentBranch(dir) {
  if (dryRun) return "";
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  });
  return result.stdout?.trim() ?? "";
}

/** @param {SyncEntry} entry */
function syncEntry(entry) {
  const { name, path: relPath, repository, branch = "main" } = entry;
  const dir = resolve(devRoot, relPath);

  console.log(`\n→ ${name} (${relPath})`);

  if (!repository) {
    console.log("  skip: no repository in projects.json");
    return 0;
  }

  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true });
    console.log(`  clone ${repository} @ ${branch}`);
    return git("git", ["clone", "--branch", branch, repository, dir], devRoot);
  }

  if (!isGitRepo(dir)) {
    console.error(`  error: ${dir} exists but is not a git repo`);
    return 1;
  }

  if (hasLocalChanges(dir)) {
    console.warn("  warn: uncommitted changes — fetch only (pull skipped)");
    return git("git", ["fetch", "origin"], dir);
  }

  let code = git("git", ["fetch", "origin"], dir);
  if (code !== 0) return code;

  const onBranch = currentBranch(dir);
  if (onBranch !== branch) {
    console.log(`  checkout ${branch}`);
    code = git("git", ["checkout", branch], dir);
    if (code !== 0) {
      code = git("git", ["checkout", "-B", branch, `origin/${branch}`], dir);
      if (code !== 0) return code;
    }
  }

  console.log(`  pull --ff-only origin ${branch}`);
  return git("git", ["pull", "--ff-only", "origin", branch], dir);
}

function main() {
  const entries = collectEntries();
  const skipped = config.projects.filter((p) => !p.repository);

  console.log(`Development root: ${devRoot}`);
  if (dryRun) console.log("(dry run — no git commands executed)\n");

  if (skipped.length > 0) {
    console.log(
      "Not configured (add repository + branch to projects.json):",
      skipped.map((p) => p.name).join(", "),
    );
  }

  let failed = 0;
  for (const entry of entries) {
    const code = syncEntry(entry);
    if (code !== 0) failed = code;
  }

  console.log(failed === 0 ? "\nDone." : "\nFinished with errors.");
  process.exit(failed === 0 ? 0 : 1);
}

main();
