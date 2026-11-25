import { isUtf8 } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const sourcePath = /^(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.[cm]?[jt]sx?$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([a-z\d-]+(?:\.[a-z\d-]+)*))?(?:\+[a-z\d-]+(?:\.[a-z\d-]+)*)?$/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
class PatchError extends Error {}
function requireThat(condition, message) {
  if (!condition) throw new PatchError(message);
}

function snapshot(root, relative) {
  let path = root;
  for (const part of relative.split('/')) {
    requireThat(lstatSync(path).isDirectory(), 'Expected a directory, not a symlink.');
    path = join(path, part);
  }
  requireThat(lstatSync(path).isFile(), 'Expected a regular file, not a symlink.');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireThat(stat.isFile(), 'Expected a regular file.');
    return { path, bytes: readFileSync(fd), mode: stat.mode & 0o777 };
  } finally { closeSync(fd); }
}

function packageMetadata(file) {
  try { return JSON.parse(file.bytes.toString('utf8')); }
  catch { throw new PatchError('Invalid package metadata.'); }
}

function checkHunks(lines) {
  const invalid = 'Invalid single-file unified diff.';
  requireThat(lines.length, invalid);
  let i = 0;
  while (i < lines.length) {
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: [^\n]*)?$/.exec(lines[i++]);
    requireThat(hunk, invalid);
    let old = Number(hunk[1] ?? 1), next = Number(hunk[2] ?? 1);
    while (old || next) {
      const prefix = lines[i++]?.[0];
      requireThat([' ', '-', '+'].includes(prefix), invalid);
      if (prefix !== '+') old--;
      if (prefix !== '-') next--;
      requireThat(old >= 0 && next >= 0, invalid);
      if (lines[i] === '\\ No newline at end of file') i++;
    }
  }
}

function parse(bytes) {
  const invalid = 'Expected a canonical Workbench npm patch.';
  requireThat(isUtf8(bytes) && !bytes.includes(0), invalid);
  const lines = bytes.toString('utf8').split('\n');
  requireThat(lines.pop() === '', invalid);
  const trailer = /^# workbench-npm-v1 (\S+) ([a-f0-9]{64}) ([a-f0-9]{64})$/.exec(lines.pop());
  requireThat(trailer, invalid);
  const [, version, before, after] = trailer;
  const semver = versionPattern.exec(version);
  requireThat(semver && !semver[1]?.split('.').some(id => /^0\d+$/.test(id)), 'Expected an exact version.');
  const target = lines[0]?.slice(6);
  requireThat(lines[0]?.startsWith('--- a/') && lines[1] === `+++ b/${target}`, invalid);
  const segments = target.split('/');
  const name = segments.splice(0, target.startsWith('@') ? 2 : 1).join('/');
  requireThat(packageName.test(name) && sourcePath.test(segments.join('/')) &&
    !segments.some(s => s.toLowerCase() === 'node_modules'), 'Unsafe package source path.');
  checkHunks(lines.slice(2));
  return { name, target, version, before, after, diff: `${lines.join('\n')}\n` };
}

function gitApply(cwd, diff, flags) {
  // Do not discover a parent worktree, inherit GIT_* overrides or load user apply settings.
  const result = spawnSync('git', ['apply', '-p1', '--whitespace=nowarn', ...flags, '-'], {
    cwd, input: diff, encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: cwd, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: dirname(cwd) },
  });
  requireThat(result.status === 0, 'Git could not validate or apply the patch.');
  return result.stdout;
}

function publish(current, bytes, recheck) {
  const temp = join(dirname(current.path), `.pi-npm-patch-${randomUUID()}`);
  const fd = openSync(temp, 'wx', 0o600);
  try {
    try {
      writeFileSync(fd, bytes);
      fchmodSync(fd, current.mode);
    } finally { closeSync(fd); }
    recheck();
    renameSync(temp, current.path);
  } finally { rmSync(temp, { force: true }); }
}

function apply([arg, flag, ...extra]) {
  requireThat(/^patches\/npm\/[\w@][\w@.+-]*\.patch$/.test(arg) &&
    (flag === undefined || flag === '--write') && !extra.length,
  'Usage: node scripts/apply-npm-patch.mjs patches/npm/NAME.patch [--write]');
  const { name, target, version, before, after, diff } = parse(snapshot(repo, arg).bytes);
  const home = resolve(homedir());
  const profile = resolve(process.env.PI_CODING_AGENT_DIR ?? join(home, '.pi/agent'));
  const live = relative => profile.startsWith(`${home}/`)
    ? snapshot(home, `${profile.slice(home.length + 1)}/npm/node_modules/${relative}`)
    : snapshot(profile, `npm/node_modules/${relative}`);
  const checkVersion = () => {
    const deps = packageMetadata(snapshot(repo, 'agent/npm/package.json')).dependencies;
    requireThat(deps && Object.hasOwn(deps, name) && deps[name] === version, 'Package version is not pinned in Workbench.');
    const installed = packageMetadata(live(`${name}/package.json`));
    requireThat(installed.name === name && installed.version === version, 'Live package name or version differs.');
  };
  checkVersion();
  const current = live(target);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pi-apply-npm-')));
  try {
    const summary = gitApply(scratch, diff, ['--numstat', '-z']);
    const stat = /^(\d+)\t(\d+)\t([^\0]+)\0$/.exec(summary);
    requireThat(stat && stat[3] === target && (stat[1] !== '0' || stat[2] !== '0'), 'Expected exactly one changed source file.');
    const hash = digest(current.bytes);
    if (hash === after) return console.log('Already applied; no changes.');
    requireThat(hash === before, 'Conflict: live file differs from the reviewed baseline.');
    const copy = join(scratch, target);
    mkdirSync(dirname(copy), { recursive: true });
    writeFileSync(copy, current.bytes, { flag: 'wx' });
    gitApply(scratch, diff, []);
    const result = snapshot(scratch, target).bytes;
    requireThat(digest(result) === after, 'Patched content does not match the reviewed digest.');
    if (!flag) return console.log('Preview: patch applies cleanly. Use --write to update the live source.');
    const recheck = () => {
      checkVersion();
      const latest = live(target);
      requireThat(digest(latest.bytes) === before && latest.mode === current.mode, 'Conflict: live file changed during apply.');
    };
    recheck();
    publish(current, result, recheck);
    console.log('Applied patch to the live source.');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

try { apply(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof PatchError ? error.message : `Patch failed (${error.code ?? 'invalid input'}).`);
  process.exitCode = 1;
}
