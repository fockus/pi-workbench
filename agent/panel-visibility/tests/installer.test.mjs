import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import fs, { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PATCHES } from '../patches.mjs';
import { BACKUP_ROOT, applyPatches, restorePatches, patchStatus } from '../install.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pi-panels-installer-'));
  const modules = join(root, 'modules');
  const backups = join(root, 'backups');
  const manifest = JSON.parse(await readFile(join(BACKUP_ROOT, 'manifest.json'), 'utf8'));
  for (const spec of PATCHES) {
    const pkg = join(modules, spec.package);
    await mkdir(dirname(join(pkg, spec.file)), { recursive: true });
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ version: spec.version }));
    const saved = manifest.targets.find((item) => item.package === spec.package && item.file === spec.file);
    await writeFile(join(pkg, spec.file), await readFile(join(BACKUP_ROOT, saved.backup)));
  }
  const source = async () => Promise.all(PATCHES.map((spec) => readFile(join(modules, spec.package, spec.file), 'utf8')));
  return { modules, backups, source };
}

test('installer applies once, preserves originals and restores exact source bytes', async () => {
  const f = await fixture();
  const original = await f.source();
  assert.equal(await applyPatches(f.modules, f.backups), 'installed');
  const patched = await f.source();
  assert.notDeepEqual(patched, original);
  assert.equal(await applyPatches(f.modules, f.backups), 'installed');
  assert.deepEqual(await f.source(), patched);
  assert.equal(await restorePatches(f.modules, f.backups), 'restored');
  assert.deepEqual(await f.source(), original);
  assert.equal(await applyPatches(f.modules, f.backups), 'installed');
});

test('unknown versions and mismatched source fail before any file is patched', async () => {
  const f = await fixture();
  const original = await f.source();
  const metadata = join(f.modules, '@tintinweb/pi-subagents/package.json');
  await writeFile(metadata, JSON.stringify({ version: '99.0.0' }));
  await assert.rejects(applyPatches(f.modules, f.backups), /Unsupported/);
  assert.deepEqual(await f.source(), original);
  await writeFile(metadata, JSON.stringify({ version: '0.23.0' }));
  const changed = join(f.modules, PATCHES[0].package, PATCHES[0].file);
  await writeFile(changed, 'independent package edit\n');
  const altered = await f.source();
  await assert.rejects(applyPatches(f.modules, f.backups), /Unsupported source/);
  assert.deepEqual(await f.source(), altered);
});

test('a failed restore can resume safely and cleans its temporary file', async () => {
  const f = await fixture();
  const original = await f.source();
  await applyPatches(f.modules, f.backups);
  const rename = fs.rename;
  let count = 0;
  const fault = mock.method(fs, 'rename', async (...args) => {
    if (++count === 2) throw Object.assign(new Error('injected rename failure'), { code: 'EACCES' });
    return rename(...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(restorePatches(f.modules, f.backups), /injected rename/); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await patchStatus(f.modules, f.backups), 'partial');
  await assert.rejects(applyPatches(f.modules, f.backups), /restore/);
  const parent = dirname(join(f.modules, PATCHES[1].package, PATCHES[1].file));
  assert(!(await readdir(parent)).some((name) => name.includes('.panel-visibility.')));
  assert.equal(await restorePatches(f.modules, f.backups), 'restored');
  assert.deepEqual(await f.source(), original);
});

test('restore does not overwrite package updates or corrupted backups', async () => {
  const f = await fixture();
  await applyPatches(f.modules, f.backups);
  const file = join(f.modules, PATCHES[0].package, PATCHES[0].file);
  await writeFile(file, `${await readFile(file, 'utf8')}\n// external update\n`);
  const changed = await f.source();
  assert.equal(await patchStatus(f.modules, f.backups), 'changed');
  await assert.rejects(restorePatches(f.modules, f.backups), /refusing/);
  assert.deepEqual(await f.source(), changed);

  const clean = await fixture();
  await applyPatches(clean.modules, clean.backups);
  const manifest = JSON.parse(await readFile(join(clean.backups, 'manifest.json'), 'utf8'));
  await writeFile(join(clean.backups, manifest.targets[0].backup), 'corrupted');
  const before = await clean.source();
  await assert.rejects(restorePatches(clean.modules, clean.backups), /Corrupted backup/);
  assert.deepEqual(await clean.source(), before);
});
