import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('panel installer status runs when invoked through a symlinked directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pi-panel-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const actual = join(root, 'actual');
  const linked = join(root, 'linked');
  await mkdir(actual);
  for (const name of ['install.mjs', 'patches.mjs']) {
    await copyFile(new URL(`../agent/panel-visibility/${name}`, import.meta.url), join(actual, name));
  }
  await symlink(actual, linked, 'dir');
  const output = execFileSync(process.execPath, [join(linked, 'install.mjs'), 'status'], { encoding: 'utf8' });
  assert.equal(output.trim(), 'not-installed');
});
