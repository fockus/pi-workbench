import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const version = '1.2.3';
const before = 'export const value = "unmodified π";\n';
const after = 'export const value = "reviewed π";\n';
const separate = '// separate live edit\n';
const sentinel = 'private sentinel';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const trailer = (old, next) => `# workbench-npm-v1 ${version} ${hash(old)} ${hash(next)}\n`;
const diff = (target, old = before, next = after) =>
  `--- a/${target}\n+++ b/${target}\n@@ -1 +1 @@\n-${old}+${next}`;
const patchArg = 'patches/npm/reviewed.patch';

async function fixture(t, pkg = '@example/pi-example') {
  const root = await mkdtemp(join(tmpdir(), 'pi-apply-npm-'));
  t.after(async () => {
    try { assert.equal(await readFile(join(root, 'private/auth.json'), 'utf8'), sentinel); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
  const repo = join(root, 'repo');
  const live = join(root, 'private');
  const cli = join(repo, 'scripts/apply-npm-patch.mjs');
  const pin = join(repo, 'agent/npm/package.json');
  const plugin = join(live, 'npm/node_modules', pkg);
  const meta = join(plugin, 'package.json');
  const source = join(plugin, 'src/index.ts');
  const target = `${pkg}/src/index.ts`;
  const patch = join(repo, patchArg);
  const auth = join(live, 'auth.json');
  for (const file of [cli, pin, source, patch]) await mkdir(dirname(file), { recursive: true });
  await writeFile(auth, sentinel);
  await copyFile(new URL('../scripts/apply-npm-patch.mjs', import.meta.url), cli);
  await writeFile(pin, JSON.stringify({ dependencies: { [pkg]: version } }));
  await writeFile(meta, JSON.stringify({ name: pkg, version }));
  await writeFile(source, before);
  await writeFile(patch, diff(target) + trailer(before, after));
  const run = (args = [patchArg], env = {}) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, PI_CODING_AGENT_DIR: live, ...env },
    });
    assert.ifError(result.error);
    for (const value of [sentinel, before.trim(), after.trim(), separate.trim()]) {
      assert.equal((result.stdout + result.stderr).includes(value), false, 'must not print source or private values');
    }
    return result;
  };
  return { root, live, pin, plugin, meta, source, target, patch, run };
}

function success(result, message) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, message);
}
function refusal(result) {
  assert.notEqual(result.status, 0);
  assert.notEqual(result.stderr.trim(), '');
}

for (const pkg of ['@example/pi-example', 'pi-example']) {
  test(`preview, atomic apply, no-op and reversed reviewed patch: ${pkg}`, async t => {
    const { root, source, target, patch, run } = await fixture(t, pkg);
    const oldInode = join(root, 'old-inode');
    await link(source, oldInode);
    await chmod(source, 0o750);
    success(run(), /preview|dry.run/i);
    assert.equal(await readFile(source, 'utf8'), before);
    const write = [patchArg, '--write'];
    success(run(write, { GIT_DIR: join(root, 'not-a-repo'), GIT_CONFIG_COUNT: 'garbage' }), /applied|updated|done/i);
    assert.equal(await readFile(source, 'utf8'), after);
    assert.equal(await readFile(oldInode, 'utf8'), before);
    const applied = await stat(source);
    assert.equal(applied.mode & 0o777, 0o750);
    success(run(write), /no.op|already applied|no changes/i);
    assert.equal((await stat(source)).ino, applied.ino);
    await writeFile(patch, diff(target, after, before) + trailer(after, before));
    success(run(write), /applied|updated|done/i);
    assert.equal(await readFile(source, 'utf8'), before);
  });
}

test('preserves CRLF context and a missing final newline in a unified hunk with a section heading', async t => {
  const { source, target, patch, run } = await fixture(t);
  const old = 'const x = 1;\r\nold();', next = 'const x = 1;\r\nupdated();';
  const marker = '\\ No newline at end of file\n';
  await writeFile(source, old);
  await writeFile(patch, `--- a/${target}\n+++ b/${target}\n@@ -1,2 +1,2 @@ section\n const x = 1;\r\n-old();\n${marker}+updated();\n${marker}${trailer(old, next)}`);
  success(run([patchArg, '--write']), /applied/i);
  assert.equal(await readFile(source, 'utf8'), next);
});

test('refuses a diverged file, wrong output digest or different installed package / pin', async t => {
  const { pin, meta, source, target, patch, run } = await fixture(t);
  const write = () => run([patchArg, '--write']);
  await writeFile(source, separate);
  const conflict = write();
  refusal(conflict);
  assert.match(conflict.stderr, /conflict/i);
  assert.equal(await readFile(source, 'utf8'), separate);
  await writeFile(source, before);
  await writeFile(patch, diff(target) + trailer(before, 'not the result'));
  refusal(write());
  assert.equal(await readFile(source, 'utf8'), before);
  await writeFile(patch, diff(target) + trailer(before, after));
  await writeFile(source, after); // Even the no-op path must validate package identity and pin.
  const pkg = '@example/pi-example';
  for (const data of [{ name: pkg, version: '2.0.0' }, { name: 'other', version }]) {
    await writeFile(meta, JSON.stringify(data));
    refusal(write());
  }
  await writeFile(meta, JSON.stringify({ name: pkg, version }));
  for (const dependencies of [{}, { [pkg]: '^1.2.3' }, { [pkg]: '2.0.0' }]) {
    await writeFile(pin, JSON.stringify({ dependencies }));
    refusal(write());
  }
  assert.equal(await readFile(source, 'utf8'), after);
});

test('keeps a separate edit made while Git applies the patch to its temporary copy', async t => {
  const { root, source, run } = await fixture(t, 'pi-example');
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'git'), `#!/bin/sh
PATH=\${PATH#*:}
export PATH
git "$@" || exit 1
case " $* " in
  *' --numstat '*) ;;
  *) printf '%s\\n' '// separate live edit' > "$(dirname "$0")/../private/npm/node_modules/pi-example/src/index.ts" ;;
esac
`, { mode: 0o700 });
  const conflict = run([patchArg, '--write'], { PATH: `${bin}:${process.env.PATH}` });
  refusal(conflict);
  assert.match(conflict.stderr, /conflict/i);
  assert.equal(await readFile(source, 'utf8'), separate);
});

test('rejects ambiguous headers, multiple targets, non-source paths and noncanonical patch metadata', async t => {
  const { target, patch, source, run } = await fixture(t);
  const body = diff(target);
  const end = trailer(before, after);
  const invalid = [
    body + diff(target) + end, body + diff('other/index.ts') + end,
    body.replace('+++ b/', '+++ b/other/') + end,
    body.replace(`--- a/${target}`, '--- /dev/null') + end,
    'old mode 100644\nnew mode 100755\n' + body + end,
    body + 'rename to other.ts\n' + end, body + end + end, body,
    diff('@example/pi-example/../src/index.ts') + end, diff('@example/pi-example/auth.json') + end,
    diff('@example/pi-example/.private/index.ts') + end,
    Buffer.concat([Buffer.from(body), Buffer.of(0xff), Buffer.from(end)]),
  ];
  for (const bytes of invalid) {
    await writeFile(patch, bytes);
    refusal(run([patchArg, '--write']));
    assert.equal(await readFile(source, 'utf8'), before);
  }
});

test('rejects noncanonical patch arguments and symlinks in patch and live paths', async t => {
  const { live, plugin, source, patch, run } = await fixture(t);
  for (const args of [[patch], ['patches/npm/../npm/reviewed.patch'], ['--write', patchArg], [patchArg, '--unknown'], [patchArg, '--write', '--write']]) {
    refusal(run(args));
  }
  const checkLink = async path => {
    await rename(path, `${path}-original`);
    await symlink(`${path}-original`, path);
    try { refusal(run([patchArg, '--write'])); }
    finally { await rm(path); await rename(`${path}-original`, path); }
  };
  for (const path of [patch, dirname(patch), live, plugin, join(plugin, 'package.json'), dirname(source), source]) await checkLink(path);
  assert.equal(await readFile(source, 'utf8'), before);
});
