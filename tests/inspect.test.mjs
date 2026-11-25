import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import * as url from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const installed = url.fileURLToPath(new URL("../agent/npm/node_modules/pi-inspect/extensions/inspect.ts", import.meta.url));
const sourcePath = process.env.PI_INSPECT_TEST_SOURCE ?? installed;

async function fixture(t) {
	const root = await mkdtemp(path.join(tmpdir(), "pi-inspect-regression-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	let onFlush;
	let discoveryGate;
	let onDiscovery;
	const updatedPaths = [];
	const resourcePath = path.join(root, "prompt.md");
	const context = createContext({ console, process, Buffer, setTimeout, clearTimeout, URL });
	const modules = new Map([
		["node:child_process", childProcess], ["node:fs", fs], ["node:net", net],
		["node:path", path], ["node:url", url],
		["@earendil-works/pi-coding-agent", {
			getAgentDir: () => root,
			SettingsManager: { create: () => ({
				getGlobalSettings: () => ({}),
				setPromptTemplatePaths: (paths) => updatedPaths.push(paths),
				async flush() { onFlush?.(); },
			}) },
			DefaultPackageManager: class {
				async resolve() {
					onDiscovery?.();
					await discoveryGate;
					return { skills: [], prompts: [{ path: resourcePath, enabled: true,
						metadata: { scope: "user", origin: "local", source: "user", baseDir: root } }], extensions: [], themes: [] };
				}
			},
			parseFrontmatter: () => { throw new Error("Unexpected resource parsing in empty fixture"); },
		}],
	]);
	const source = await readFile(sourcePath, "utf8");
	const module = new SourceTextModule(stripTypeScriptTypes(source), {
		context, identifier: url.pathToFileURL(sourcePath).href,
		initializeImportMeta(meta) { meta.url = url.pathToFileURL(sourcePath).href; },
	});
	await module.link((specifier) => {
		const exports = modules.get(specifier);
		assert.ok(exports, `Unexpected import: ${specifier}`);
		return new SyntheticModule(Object.keys(exports), function () {
			for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
		}, { context });
	});
	await module.evaluate();
	const instances = [];
	t.after(async () => { for (const instance of instances) await instance.shutdown(); });
	function instance(id) {
		const handlers = new Map();
		let active = true;
		const guard = () => { if (!active) throw new Error("This extension ctx is stale after session replacement or reload"); };
		const api = {
			on: (event, handler) => handlers.set(event, handler),
			registerCommand() {},
			getCommands() { guard(); return [{ name: `command-${id}` }]; },
			getAllTools() { guard(); return [{ name: `tool-${id}` }]; },
			getActiveTools() { guard(); return [`tool-${id}`]; },
		};
		const ctx = {
			sessionManager: { getSessionId: () => id, getCwd: () => root, getSessionName: () => id },
			model: { id: "offline-test" }, getSystemPrompt: () => "test-only",
		};
		module.namespace.default(api);
		const result = {
			async emit(event) { await handlers.get(event)?.({}, ctx); },
			async snapshot() { return JSON.parse(await readFile(path.join(root, "inspect/snapshots", `${id}.json`), "utf8")); },
			async shutdown() { if (active) { await handlers.get("session_shutdown")?.({}, ctx); active = false; } },
		};
		instances.push(result);
		return result;
	}
	return {
		instance, root, updatedPaths,
		pauseDiscovery() {
			let release;
			discoveryGate = new Promise((resolve) => { release = resolve; });
			const entered = new Promise((resolve) => { onDiscovery = resolve; });
			return { entered, release };
		},
		async toggle() {
			let timeout;
			const flushed = new Promise((resolve, reject) => {
				onFlush = resolve;
				timeout = setTimeout(() => reject(new Error("Active session request watcher did not handle toggle")), 1500);
			});
			try {
				await writeFile(path.join(root, "inspect/requests/request.json"), JSON.stringify({
					id: "request", ts: Date.now(), action: "disable", resourceKind: "prompts", path: resourcePath, scope: "user",
				}));
				await flushed;
			} finally { clearTimeout(timeout); }
		},
	};
}

test("parent snapshot keeps its own command/tool registry after another instance starts", async (t) => {
	const { instance } = await fixture(t);
	const parent = instance("parent");
	await parent.emit("session_start");
	const child = instance("child");
	await child.emit("session_start");
	await parent.emit("before_agent_start");
	const snapshot = await parent.snapshot();
	assert.deepEqual(snapshot.commands, [{ name: "command-parent" }]);
	assert.deepEqual(snapshot.activeTools, ["tool-parent"]);
});

test("parent snapshots remain usable after a sibling runtime shuts down", async (t) => {
	const { instance } = await fixture(t);
	const parent = instance("parent");
	await parent.emit("session_start");
	const child = instance("child");
	await child.emit("session_start");
	await child.shutdown();
	for (let i = 0; i < 3; i++) await parent.emit("before_agent_start");
	assert.deepEqual((await parent.snapshot()).commands, [{ name: "command-parent" }]);
});

test("parent request watcher survives a child shutdown and handles a toggle once", async (t) => {
	const fixtureState = await fixture(t);
	const parent = fixtureState.instance("parent");
	await parent.emit("session_start");
	const child = fixtureState.instance("child");
	await child.emit("session_start");
	await child.shutdown();
	await fixtureState.toggle();
	assert.equal(fixtureState.updatedPaths.length, 1);
	assert.deepEqual(Array.from(fixtureState.updatedPaths[0]), ["-prompt.md"]);
});

test("factory discovery alone does not create a watcher or inspect files", async (t) => {
	const { instance, root } = await fixture(t);
	instance("discovered-only");
	assert.equal(fs.existsSync(path.join(root, "inspect")), false);
});

test("in-flight snapshot is discarded when its runtime shuts down", async (t) => {
	const { instance, root, pauseDiscovery } = await fixture(t);
	const session = instance("closing");
	const { entered, release } = pauseDiscovery();
	const started = session.emit("session_start");
	await entered;
	await session.shutdown();
	release();
	await started;
	assert.equal(fs.existsSync(path.join(root, "inspect/snapshots/closing.json")), false);
});

test("replacement runtime remains usable after the old instance shutdown", async (t) => {
	const { instance } = await fixture(t);
	const old = instance("old");
	await old.emit("session_start");
	await old.shutdown();
	const replacement = instance("replacement");
	await replacement.emit("session_start");
	await replacement.emit("before_agent_start");
	assert.equal((await replacement.snapshot()).sessionId, "replacement");
});
