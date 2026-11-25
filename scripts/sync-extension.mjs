import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync, closeSync, constants, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync,
	openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

class SyncError extends Error {}

const digest = (value) => createHash("sha256").update(value).digest("hex");

function argumentsForSync([direction, path, flag, ...extra]) {
	if (!["import", "apply"].includes(direction) || !path || (flag !== undefined && flag !== "--write") || extra.length) {
		throw new SyncError("Usage: node scripts/sync-extension.mjs import|apply <extension-path> [--write]");
	}
	const parts = path.split("/");
	if (parts.some((part) => part === "." || part === ".." || !/^[\w.@-]+$/.test(part)) ||
		![".ts", ".js", ".mjs"].includes(extname(path))) {
		throw new SyncError("Expected a safe relative path to a .ts, .js or .mjs source file");
	}
	return { direction, path, parts, write: flag === "--write" };
}

function statIfPresent(path) {
	return lstatSync(path, { throwIfNoEntry: false });
}

function worktreeGitDir(repo) {
	const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
	const git = spawnSync("git", ["-C", repo, "rev-parse", "--show-prefix", "--absolute-git-dir"], { env, encoding: "utf8" });
	if (git.status !== 0 || !git.stdout.startsWith("\n")) {
		throw new SyncError("Cannot locate the Git metadata for the workbench root");
	}
	return realpathSync(git.stdout.slice(1, -1));
}

function liveProfile() {
	const override = process.env.PI_CODING_AGENT_DIR;
	if (!override) return { root: realpathSync(homedir()), parts: [".pi", "agent"] };
	let root = resolve(override);
	const parts = [];
	while (root !== dirname(root) && (!parts.length || !statIfPresent(root))) {
		parts.unshift(basename(root));
		root = dirname(root);
	}
	return { root: realpathSync(root), parts };
}

function managedFile(root, parts, label) {
	return { root, parents: parts.slice(0, -1), path: join(root, ...parts), label };
}

function checkType(stats, label, directory) {
	if (stats.isSymbolicLink()) throw new SyncError(`Refusing a symlink in the ${label} path`);
	if (directory ? !stats.isDirectory() : !stats.isFile()) {
		throw new SyncError(`Expected a ${directory ? "directory" : "regular file"} in the ${label} path`);
	}
}

function checkParents(file, makeDirectory) {
	let path = file.root;
	for (const part of file.parents) {
		path = join(path, part);
		const stats = statIfPresent(path);
		if (stats) checkType(stats, file.label, true);
		else if (makeDirectory) makeDirectory(path);
		else return false;
	}
	return true;
}

function snapshot(file) {
	if (!checkParents(file)) return undefined;
	const entry = statIfPresent(file.path);
	if (!entry) return undefined;
	checkType(entry, file.label, false);
	const fd = openSync(file.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stats = fstatSync(fd);
		checkType(stats, file.label, false);
		const bytes = readFileSync(fd);
		return { bytes, digest: digest(bytes), mode: stats.mode & 0o777 };
	} finally {
		closeSync(fd);
	}
}

function requireUnchanged(file, expectedDigest) {
	if (snapshot(file)?.digest !== expectedDigest) {
		throw new SyncError(`Conflict: ${file.label} changed during sync; preview again`);
	}
}

function publish(file, bytes, previous, verify) {
	checkParents(file, (path) => mkdirSync(path, { mode: 0o700 }));
	const tempDir = mkdtempSync(join(dirname(file.path), ".pi-extension-sync-"));
	try {
		const temp = join(tempDir, "file");
		writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
		if (previous) chmodSync(temp, previous.mode);
		verify();
		requireUnchanged(file, previous?.digest);
		if (previous) renameSync(temp, file.path);
		// An exclusive link publishes all bytes without clobbering a new destination.
		else linkSync(temp, file.path);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function syncExtension({ direction, path, parts, write }) {
	const repoRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
	const profile = liveProfile();
	const repo = managedFile(repoRoot, ["agent", "extensions", ...parts], "repo extension");
	const live = managedFile(profile.root, [...profile.parts, "extensions", ...parts], "live extension");
	const [source, destination] = direction === "import" ? [live, repo] : [repo, live];
	const from = snapshot(source);
	if (!from) throw new SyncError(`Missing source: ${source.label}`);
	const to = snapshot(destination);

	const key = digest(`${join(profile.root, ...profile.parts)}\0${path}`);
	const state = managedFile(worktreeGitDir(repoRoot), ["pi-extension-sync", key], "baseline");
	const accepted = snapshot(state);
	const baseline = accepted?.bytes.toString("utf8");
	if (accepted && !/^[a-f0-9]{64}$/.test(baseline)) throw new SyncError("Invalid baseline; inspect local Git metadata");

	const identical = from.digest === to?.digest;
	if (!identical && to?.digest !== baseline) {
		const reason = baseline ? `${destination.label} changed since the baseline` : "files differ and no baseline exists";
		throw new SyncError(`Conflict: ${reason} for ${path}; reconcile the files manually`);
	}
	if (identical && from.digest === baseline) {
		console.log(`${write ? "Done" : "Preview"}: no changes for ${path}.`);
		return;
	}

	const transfer = to ? "update" : "create";
	const action = identical ? "register baseline for" : `${transfer} ${destination.label}`;
	if (!write) {
		console.log(`Preview: ${action} ${path}. Use --write to confirm.`);
		return;
	}
	if (!identical) publish(destination, from.bytes, to, () => requireUnchanged(source, from.digest));
	publish(state, from.digest, accepted, () => {
		requireUnchanged(source, from.digest);
		requireUnchanged(destination, from.digest);
	});
	console.log(`Done: ${action} ${path}.`);
}

try {
	syncExtension(argumentsForSync(process.argv.slice(2)));
} catch (error) {
	console.error(error instanceof SyncError ? error.message : `Sync failed (${error.code ?? "unexpected error"}).`);
	process.exitCode = 1;
}
