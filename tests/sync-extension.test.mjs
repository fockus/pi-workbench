import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const cli = new URL("../scripts/sync-extension.mjs", import.meta.url);
const extension = "nested/example.ts";
const first = 'export const version = "first";\n';
const second = 'export const version = "second";\n';
const third = 'export const version = "third";\n';

function put(path, contents) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
}

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "pi-sync-extension-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const repo = join(root, "workbench");
	const home = join(root, "home");
	const live = join(home, ".pi", "agent");
	const repoExtensions = join(repo, "agent", "extensions");
	const liveExtensions = join(live, "extensions");
	const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
	const installCli = (directory) => {
		const script = join(directory, "scripts", "sync-extension.mjs");
		mkdirSync(dirname(script), { recursive: true });
		copyFileSync(cli, script);
		return script;
	};
	mkdirSync(repo);
	mkdirSync(home);
	git("init", "--quiet");
	const script = installCli(repo);
	const env = { ...process.env, HOME: home, USERPROFILE: home };
	delete env.PI_CODING_AGENT_DIR;
	return {
		root, repo, live, repoExtensions, liveExtensions, git, installCli,
		repoFile: join(repoExtensions, extension), liveFile: join(liveExtensions, extension),
		run(args, overrides = {}) {
			const result = spawnSync(process.execPath, [overrides.script ?? script, ...args], {
				cwd: home,
				env: { ...env, ...overrides.env },
				encoding: "utf8",
			});
			assert.ifError(result.error);
			return { status: result.status, output: result.stdout + result.stderr };
		},
	};
}

function succeeds(result, expected) {
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, expected);
}

function refuses(result, expected) {
	assert.notEqual(result.status, 0, result.output);
	assert.match(result.output, expected);
}

const contents = (path) => readFileSync(path, "utf8");

test("apply preview neither creates a missing live profile nor writes baseline state", (t) => {
	const f = fixture(t);
	put(f.repoFile, first);
	const gitDir = join(f.repo, ".git");
	const before = readdirSync(gitDir, { recursive: true }).sort();

	const result = f.run(["apply", extension]);

	succeeds(result, /preview:.*create.*nested\/example\.ts/i);
	assert.equal(existsSync(f.live), false);
	assert.deepEqual(readdirSync(gitDir, { recursive: true }).sort(), before);
	assert.equal(contents(f.repoFile), first);
	assert.doesNotMatch(result.output, /export const|first/);
});

test("apply can add one file and subsequent edits sync in either direction", (t) => {
	const f = fixture(t);
	const auth = join(f.live, "auth.json");
	const neighbor = join(f.liveExtensions, "do-not-copy.mjs");
	const privateValue = "PRIVATE_SENTINEL_3539";
	put(auth, privateValue);
	put(neighbor, privateValue);
	put(f.repoFile, first);

	const applied = f.run(["apply", extension, "--write"]);
	assert.equal(contents(f.liveFile), first);
	put(f.liveFile, second);
	const preview = f.run(["import", extension]);
	assert.equal(contents(f.repoFile), first);
	const imported = f.run(["import", extension, "--write"]);
	assert.equal(contents(f.repoFile), second);
	put(f.repoFile, third);
	const updated = f.run(["apply", extension, "--write"]);

	succeeds(applied, /creat/i);
	succeeds(preview, /preview:.*updat/i);
	succeeds(imported, /updat/i);
	succeeds(updated, /updat/i);
	assert.equal(contents(f.liveFile), third);
	assert.equal(contents(auth), privateValue);
	assert.equal(contents(neighbor), privateValue);
	assert.equal(existsSync(join(f.repoExtensions, "do-not-copy.mjs")), false);
	for (const { output } of [applied, preview, imported, updated]) {
		assert.doesNotMatch(output, /export const|PRIVATE_SENTINEL/);
	}
});

test("import can add a single .mjs file from the configured profile instead of HOME", (t) => {
	const f = fixture(t);
	const override = join(f.root, "separate-profile");
	const name = "custom.mjs";
	put(join(override, "extensions", name), first);

	const result = f.run(["import", name, "--write"], { env: { PI_CODING_AGENT_DIR: override } });

	succeeds(result, /creat/i);
	assert.equal(contents(join(f.repoExtensions, name)), first);
	assert.equal(existsSync(f.live), false);
});

test("a preview of identical files does not accept a baseline; explicit write does", (t) => {
	const f = fixture(t);
	put(f.repoFile, first);
	put(f.liveFile, first);
	const gitDir = join(f.repo, ".git");
	const before = readdirSync(gitDir, { recursive: true }).sort();

	succeeds(f.run(["apply", extension]), /preview:.*baseline/i);
	assert.deepEqual(readdirSync(gitDir, { recursive: true }).sort(), before);
	put(f.repoFile, second);
	refuses(f.run(["apply", extension, "--write"]), /conflict.*baseline/i);
	assert.equal(contents(f.liveFile), first);
	put(f.repoFile, first);
	succeeds(f.run(["apply", extension, "--write"]), /baseline/i);
	put(f.repoFile, second);
	succeeds(f.run(["apply", extension, "--write"]), /updat/i);
	assert.equal(contents(f.liveFile), second);
});

test("conflicts stop preview and write when the destination was edited", (t) => {
	const f = fixture(t);
	put(f.repoFile, first);
	succeeds(f.run(["apply", extension, "--write"]), /creat/i);
	put(f.liveFile, second);

	refuses(f.run(["apply", extension]), /conflict/i);
	refuses(f.run(["apply", extension, "--write"]), /conflict/i);
	put(f.repoFile, third);
	refuses(f.run(["import", extension, "--write"]), /conflict/i);
	refuses(f.run(["apply", extension, "--write"]), /conflict/i);

	assert.equal(contents(f.repoFile), third);
	assert.equal(contents(f.liveFile), second);
	put(f.repoFile, first);
	succeeds(f.run(["import", extension, "--write"]), /updat/i);
	assert.equal(contents(f.repoFile), second);
});

test("baseline does not cross profile or linked worktree boundaries", (t) => {
	const f = fixture(t);
	put(f.repoFile, first);
	succeeds(f.run(["apply", extension, "--write"]), /creat/i);
	const override = join(f.root, "separate-profile");
	put(join(override, "extensions", extension), first);
	put(f.repoFile, second);
	refuses(f.run(["apply", extension, "--write"], { env: { PI_CODING_AGENT_DIR: override } }), /conflict.*baseline/i);

	const worktree = join(f.root, "linked-workbench");
	f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "fixture");
	f.git("worktree", "add", "--quiet", "--detach", worktree);
	const script = f.installCli(worktree);
	put(join(worktree, "agent", "extensions", extension), second);
	refuses(f.run(["apply", extension, "--write"], { script }), /conflict.*baseline/i);
	assert.equal(contents(f.liveFile), first);
});

test("absolute, traversing, non-source, and non-regular paths are rejected", (t) => {
	const f = fixture(t);
	put(join(f.repo, "agent", "private.js"), first);
	put(join(f.repoExtensions, "settings.json"), first);
	mkdirSync(join(f.repoExtensions, "directory.ts"));

	for (const name of ["../private.js", "nested/../private.js", "./settings.json", "nested//example.ts", "nested\\example.ts", join(f.repo, "agent", "private.js"), "settings.json", "directory.ts"]) {
		refuses(f.run(["apply", name, "--write"]), /path|regular|source/i);
	}
	assert.equal(existsSync(f.live), false);
});

test("file and ancestor symlinks on either side never copy private data or overwrite it", (t) => {
	const f = fixture(t);
	const outside = join(f.root, "outside");
	const secret = join(outside, "example.ts");
	const privateValue = "PRIVATE_SENTINEL_1698";
	put(secret, privateValue);
	mkdirSync(dirname(f.liveFile), { recursive: true });
	mkdirSync(dirname(f.repoFile), { recursive: true });
	symlinkSync(secret, f.liveFile);
	put(f.repoFile, first);
	for (const command of ["apply", "import"]) {
		const result = f.run([command, extension, "--write"]);
		refuses(result, /symlink|symbolic link/i);
		assert.doesNotMatch(result.output, /PRIVATE_SENTINEL/);
	}
	assert.equal(contents(f.repoFile), first);
	assert.equal(contents(secret), privateValue);

	symlinkSync(outside, join(f.repoExtensions, "outside"), "dir");
	refuses(f.run(["apply", "outside/example.ts", "--write"]), /symlink|symbolic link/i);
	symlinkSync(outside, join(f.liveExtensions, "outside"), "dir");
	refuses(f.run(["import", "outside/example.ts", "--write"]), /symlink|symbolic link/i);
	assert.equal(contents(secret), privateValue);
});

test("an independently deleted destination is not silently recreated", (t) => {
	const f = fixture(t);
	put(f.repoFile, first);
	succeeds(f.run(["apply", extension, "--write"]), /creat/i);
	rmSync(f.liveFile);
	put(f.repoFile, second);
	refuses(f.run(["apply", extension, "--write"]), /conflict/i);
	assert.equal(existsSync(f.liveFile), false);
});

test("missing source never deletes the destination", (t) => {
	const f = fixture(t);
	put(f.liveFile, first);

	refuses(f.run(["apply", extension, "--write"]), /missing source|source.*missing/i);

	assert.equal(contents(f.liveFile), first);
});
