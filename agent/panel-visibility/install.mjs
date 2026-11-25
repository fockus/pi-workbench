import { readFile, writeFile, mkdir, stat, rename, open, unlink, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATCHES } from './patches.mjs';

const base = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = resolve(base, '../npm/node_modules');
export const BACKUP_ROOT = join(base, 'backups', 'tasks-0.9.1_subagents-0.23.0');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const backupName = (spec) => `${spec.package.split('/').at(-1)}_${spec.file.replaceAll('/', '_')}`;

async function atomicWrite(file, text) {
  const temp = `${file}.panel-visibility.${randomUUID()}.tmp`;
  const mode = await stat(file).then((s) => s.mode, (error) => {
    if (error.code !== 'ENOENT') throw error;
    return 0o600;
  });
  const handle = await open(temp, 'wx', mode);
  try {
    await handle.writeFile(text);
    await handle.close();
    await rename(temp, file);
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw error;
  }
}

function patchedSource(original, spec) {
  let result = original;
  for (const [before, after] of spec.edits) {
    if (result.split(before).length !== 2) throw new Error(`Unsupported source: ${spec.package}/${spec.file}; no files changed`);
    result = result.replace(before, after);
  }
  return result;
}

export async function patchStatus(moduleRoot = MODULE_ROOT, backupRoot = BACKUP_ROOT) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(backupRoot, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return 'not-installed'; throw error; }
  const states = await Promise.all(manifest.targets.map(async (entry) => {
    const actual = hash(await readFile(join(moduleRoot, entry.package, entry.file), 'utf8'));
    return actual === entry.patchedHash ? 'installed' : actual === entry.originalHash ? 'restored' : 'changed';
  }));
  return states.every((state) => state === 'installed') ? 'installed'
    : states.every((state) => state === 'restored') ? 'restored'
    : states.every((state) => state !== 'changed') ? 'partial' : 'changed';
}

export async function applyPatches(moduleRoot = MODULE_ROOT, backupRoot = BACKUP_ROOT) {
  const status = await patchStatus(moduleRoot, backupRoot);
  if (status === 'installed') return status;
  if (status === 'partial') throw new Error('Partial installation: run restore before applying again');
  if (status === 'changed') throw new Error('Package sources changed since backup; refusing to overwrite them');
  const targets = [];
  for (const spec of PATCHES) {
    const metadata = JSON.parse(await readFile(join(moduleRoot, spec.package, 'package.json'), 'utf8'));
    if (metadata.version !== spec.version) throw new Error(`Unsupported ${spec.package}@${metadata.version}; expected ${spec.version}; no files changed`);
    const file = join(moduleRoot, spec.package, spec.file);
    const original = await readFile(file, 'utf8');
    const patched = patchedSource(original, spec);
    targets.push({ ...spec, original, patched, originalHash: hash(original), patchedHash: hash(patched), backup: backupName(spec) });
  }
  await mkdir(backupRoot, { recursive: true });
  for (const target of targets) {
    const backup = join(backupRoot, target.backup);
    try { await writeFile(backup, target.original, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (hash(await readFile(backup, 'utf8')) !== target.originalHash) throw new Error(`Backup mismatch: ${target.backup}`);
    }
  }
  await atomicWrite(join(backupRoot, 'manifest.json'), JSON.stringify({ version: 1, targets: targets.map(({ package: pkg, version, file, originalHash, patchedHash, backup }) => ({ package: pkg, version, file, originalHash, patchedHash, backup })) }, null, 2));
  const written = [];
  try {
    for (const target of targets) {
      const file = join(moduleRoot, target.package, target.file);
      if (hash(await readFile(file, 'utf8')) !== target.originalHash) throw new Error('Package changed during installation');
      await atomicWrite(file, target.patched);
      written.push(target);
    }
  } catch (error) {
    for (const target of written.reverse()) await atomicWrite(join(moduleRoot, target.package, target.file), target.original);
    throw error;
  }
  return 'installed';
}

export async function restorePatches(moduleRoot = MODULE_ROOT, backupRoot = BACKUP_ROOT) {
  const status = await patchStatus(moduleRoot, backupRoot);
  if (status === 'restored' || status === 'not-installed') return status;
  if (status !== 'installed' && status !== 'partial') throw new Error('Package sources changed; refusing to overwrite an update or another edit');
  const manifest = JSON.parse(await readFile(join(backupRoot, 'manifest.json'), 'utf8'));
  const originals = await Promise.all(manifest.targets.map(async (entry) => {
    const original = await readFile(join(backupRoot, entry.backup), 'utf8');
    if (hash(original) !== entry.originalHash) throw new Error(`Corrupted backup: ${entry.backup}`);
    return { ...entry, original };
  }));
  for (const entry of originals) {
    const file = join(moduleRoot, entry.package, entry.file);
    const current = hash(await readFile(file, 'utf8'));
    if (current === entry.originalHash) continue;
    if (current !== entry.patchedHash) throw new Error('Package changed during restore; refusing to overwrite it');
    await atomicWrite(file, entry.original);
  }
  return 'restored';
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  try {
    const action = process.argv[2] ?? 'status';
    const actions = { apply: applyPatches, restore: restorePatches, status: patchStatus };
    if (!Object.hasOwn(actions, action)) throw new Error('Usage: node install.mjs apply|restore|status');
    console.log(await actions[action]());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
