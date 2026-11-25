import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const sourcePath = /^(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.[cm]?[jt]sx?$/;
const exactVersion = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
const workbench = join(repo, 'agent');
const baseline = join(repo, 'node_modules/.pi-workbench-source-hashes.json');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function regularFile(root, relative) {
  let path = root;
  const segments = relative.split('/');
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment);
    const info = lstatSync(path);
    if (!(index === segments.length - 1 ? info.isFile() : info.isDirectory())) {
      throw new Error(`Expected a regular path: ${relative}`);
    }
  }
  return path;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Cannot read package metadata: ${path}`);
  }
}

function recordBaseline(dependencies) {
  const files = Object.create(null);
  for (const [name, version] of Object.entries(dependencies)) {
    if (!packageName.test(name) || !exactVersion.test(version)) throw new Error('Expected an exact npm pin');
    const root = `npm/node_modules/${name}`;
    const visit = (prefix) => {
      for (const entry of readdirSync(join(workbench, root, prefix), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const path = `${prefix}${entry.name}`;
        if (entry.isDirectory()) visit(`${path}/`);
        if (entry.isFile() && sourcePath.test(path)) files[`${name}@${version}/${path}`] = sha256(join(workbench, root, path));
      }
    };
    const metadata = readJson(regularFile(workbench, `${root}/package.json`));
    if (metadata.name !== name || metadata.version !== version) throw new Error(`Wrong prepared version: ${name}`);
    visit('');
  }
  writeFileSync(baseline, JSON.stringify(files), { flag: 'wx', mode: 0o600 });
}

function capture([name, file, flag, ...extra]) {
  const dependencies = readJson(join(workbench, 'npm/package.json')).dependencies;
  if (name === '--record-baseline' && !file) return recordBaseline(dependencies);
  if (!name || !file || extra.length || (flag && flag !== '--from-checkout') || !packageName.test(name) || !sourcePath.test(file) ||
      file.split('/').some(segment => segment.toLowerCase() === 'node_modules')) {
    throw new Error('Usage: node scripts/capture-npm-patch.mjs <npm-package> <JS-or-TS-source-path> [--from-checkout]');
  }
  const profile = resolve(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi/agent'));
  const version = Object.hasOwn(dependencies, name) ? dependencies[name] : '';
  if (!exactVersion.test(version)) throw new Error(`${name} is not pinned to an exact version in Workbench`);
  const relative = `npm/node_modules/${name}`;
  for (const root of [workbench, profile]) {
    const pkg = readJson(regularFile(root, `${relative}/package.json`));
    if (pkg.name !== name || pkg.version !== version) {
      throw new Error(`Expected ${name} version ${version} in both installations`);
    }
  }
  const roots = flag ? [profile, workbench] : [workbench, profile];
  const [oldPath, newPath] = roots.map(root => regularFile(root, `${relative}/${file}`));
  const expected = readJson(baseline)[`${name}@${version}/${file}`];
  const before = sha256(oldPath), after = sha256(newPath);
  if (before !== expected) throw new Error('Conflict: comparison source differs from the prepared baseline');
  const diff = spawnSync('diff', ['-u', '-L', `a/${name}/${file}`, '-L', `b/${name}/${file}`, oldPath, newPath], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  if (diff.error) throw diff.error;
  if (diff.status === 0) throw new Error('No changes to capture');
  if (diff.status !== 1 || !diff.stdout.startsWith('--- ')) {
    throw new Error('Could not capture a text patch');
  }
  if (before !== sha256(oldPath) || after !== sha256(newPath)) throw new Error('File changed during capture');
  process.stdout.write(`${diff.stdout}# workbench-npm-v1 ${version} ${before} ${after}\n`);
}

try {
  capture(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
