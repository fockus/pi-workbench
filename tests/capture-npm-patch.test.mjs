import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pi-workbench-npm-patch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const live = join(root, 'private');
  const cli = join(repo, 'scripts/capture-npm-patch.mjs');
  const pkg = '@example/pi-example';
  await mkdir(join(repo, 'scripts'), { recursive: true });
  await copyFile(new URL('../scripts/capture-npm-patch.mjs', import.meta.url), cli);
  for (const dir of [join(repo, 'agent'), live]) {
    const plugin = join(dir, 'npm/node_modules', pkg);
    await mkdir(join(plugin, 'src'), { recursive: true });
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: pkg, version: '1.2.3' }));
    await writeFile(join(plugin, 'src/index.ts'), `export const panels = ${dir === live};\n`);
  }
  await writeFile(join(repo, 'agent/npm/package.json'), JSON.stringify({ dependencies: { [pkg]: '1.2.3' } }));
  await writeFile(join(live, 'auth.json'), 'private sentinel');
  const path = (dir, file) => join(dir, 'npm/node_modules', pkg, file);
  await mkdir(join(repo, 'node_modules'), { recursive: true });
  const record = spawnSync(process.execPath, [cli, '--record-baseline'], { encoding: 'utf8' });
  assert.equal(record.status, 0, record.stderr);
  const run = (file, ...flags) => spawnSync(process.execPath, [cli, pkg, file, ...flags], {
    env: { ...process.env, PI_CODING_AGENT_DIR: live }, encoding: 'utf8',
  });
  return { repo, live, path, run };
}

test('capture previews a patch that reproduces the selected live plugin change without copying its profile', async (t) => {
  const { repo, live, path, run } = await fixture(t);
  const patch = run('src/index.ts');
  assert.equal(patch.status, 0, patch.stderr);
  assert.match(patch.stdout, /^--- a\/@example\/pi-example\/src\/index\.ts\n/);
  assert.doesNotMatch(patch.stdout, /private sentinel/);
  assert.match(patch.stdout, /\n# workbench-npm-v1 1\.2\.3 [a-f0-9]{64} [a-f0-9]{64}\n$/);
  assert.equal(await readFile(path(join(repo, 'agent'), 'src/index.ts'), 'utf8'), 'export const panels = false;\n');
  const applied = spawnSync('git', ['apply', '--directory=agent/npm/node_modules', '-'], {
    cwd: repo, input: patch.stdout, encoding: 'utf8',
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(await readFile(path(join(repo, 'agent'), 'src/index.ts'), 'utf8'), await readFile(path(live, 'src/index.ts'), 'utf8'));
  assert.equal(await readFile(join(live, 'auth.json'), 'utf8'), 'private sentinel');
});

test('checkout edits can be exported but divergent edits cannot be captured in either direction', async (t) => {
  const { repo, live, path, run } = await fixture(t);
  const checkout = path(join(repo, 'agent'), 'src/index.ts');
  const profile = path(live, 'src/index.ts');
  await writeFile(checkout, 'export const panels = 2;\n');
  for (const flags of [[], ['--from-checkout']]) {
    const result = run('src/index.ts', ...flags);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /conflict/i);
    assert.equal(result.stdout, '');
  }
  await writeFile(profile, 'export const panels = false;\n');
  const patch = run('src/index.ts', '--from-checkout');
  assert.equal(patch.status, 0, patch.stderr);
  assert.match(patch.stdout, /\+export const panels = 2;/);
});

test('capture refuses traversal, symlink source and a mismatched plugin version', async (t) => {
  const { live, path, run } = await fixture(t);
  assert.notEqual(run('../../../../auth.json').status, 0);
  await rm(path(live, 'src/index.ts'));
  await symlink(join(live, 'auth.json'), path(live, 'src/index.ts'));
  const wrongFile = run('src/index.ts');
  assert.notEqual(wrongFile.status, 0);
  assert.equal(wrongFile.stdout, '');
  await writeFile(path(live, 'package.json'), '{"version":"9.9.0"}');
  const wrongVersion = run('src/index.ts');
  assert.notEqual(wrongVersion.status, 0);
  assert.match(wrongVersion.stderr, /version/);
});
