import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const sdkRoot = fileURLToPath(new URL('../../../node_modules/@earendil-works/pi-coding-agent', import.meta.url));
const moduleRoot = fileURLToPath(new URL('../../npm/node_modules', import.meta.url));
const controller = fileURLToPath(new URL('../../extensions/panel-visibility.ts', import.meta.url));
const sdk = await import(join(sdkRoot, 'dist/index.js'));
const require = createRequire(join(moduleRoot, '../package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  '@earendil-works/pi-coding-agent': join(sdkRoot, 'dist/index.js'),
  '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui'),
  '@earendil-works/pi-ai': join(sdkRoot, 'dist/core/extensions/pi-ai-extension-view.js'),
} });
const tasksDir = join(moduleRoot, '@tintinweb/pi-tasks');
const agentsDir = join(moduleRoot, '@tintinweb/pi-subagents');
const { TaskStore } = await jiti.import(join(tasksDir, 'src/task-store.ts'));
const { TaskWidget } = await jiti.import(join(tasksDir, 'src/ui/task-widget.ts'));
const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: (s) => s, strikethrough: (s) => s };
function terminalUI() {
  const widgets = new Map();
  const statuses = new Map();
  const notices = [];
  const inputs = new Set();
  let editorWrites = 0;
  const ui = new Proxy({
    setWidget: (key, value) => value === undefined ? widgets.delete(key) : widgets.set(key, value),
    setStatus: (key, value) => statuses.set(key, value),
    notify: (message, level) => notices.push({ message, level }),
    onTerminalInput: (fn) => { inputs.add(fn); return () => inputs.delete(fn); },
    getEditorText: () => 'untouched draft',
    setEditorText: () => { editorWrites++; },
  }, { get: (target, key) => target[key] ?? (() => undefined) });
  const render = (key) => widgets.get(key)?.({ terminal: { columns: 120 }, requestRender() {} }, theme).render(120).join('\n') ?? '';
  return { ui, widgets, statuses, notices, inputs, render, editorWrites: () => editorWrites };
}

test('task widget stays hidden across updates and restores current tasks without changing execution', () => {
  const terminal = terminalUI();
  const store = new TaskStore();
  const task = store.create('original', 'fixture');
  store.update(task.id, { status: 'in_progress' });
  const widget = new TaskWidget(store);
  widget.setUICtx(terminal.ui);
  try {
    widget.update();
    assert.match(terminal.render('tasks'), /original/);
    widget.setHidden(true);
    assert(!terminal.widgets.has('tasks'));
    store.update(task.id, { subject: 'updated while hidden' });
    widget.setActiveTask(task.id);
    widget.addTokenUsage(5, 7);
    widget.update();
    assert(!terminal.widgets.has('tasks'));
    assert.equal(store.get(task.id).status, 'in_progress');
    widget.setHidden(false);
    assert.match(terminal.render('tasks'), /updated while hidden/);
    assert.equal(terminal.editorWrites(), 0);
  } finally { widget.dispose(); }
});

test('native packages and companion provide working commands, F6 and enhanced Ctrl+Alt+H', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-panels-sdk-'));
  const agentDir = join(cwd, 'agent');
  await mkdir(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_TASKS = 'off';
  let pi;
  const settingsManager = sdk.SettingsManager.inMemory();
  const settingsBefore = structuredClone(settingsManager.getGlobalSettings());
  const eventBus = sdk.createEventBus();
  const loader = new sdk.DefaultResourceLoader({
    cwd, agentDir, settingsManager, eventBus, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
    additionalExtensionPaths: [join(tasksDir, 'src/index.ts'), join(agentsDir, 'src/index.ts'), ...(existsSync(controller) ? [controller] : [])],
    extensionFactories: [(api) => { pi = api; }],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const replies = new Map();
  pi.events.on('panel-visibility:response', (reply) => replies.set(reply.panel, reply));
  pi.events.emit('panel-visibility:request', { version: 1 });
  assert.deepEqual([...replies.keys()].sort(), ['subagents', 'tasks']);
  const modelRuntime = await sdk.ModelRuntime.create({ agentDir });
  const model = modelRuntime.getModel('openai', 'gpt-4.1-mini');
  const sessionManager = sdk.SessionManager.inMemory();
  sessionManager.appendMessage({ role: 'assistant', api: model.api, provider: model.provider, model: model.id,
    content: [{ type: 'toolCall', id: 'panels-test', name: 'TaskCreate', arguments: {} }],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse', timestamp: Date.now(),
  });
  const { session } = await sdk.createAgentSession({ cwd, agentDir, settingsManager, resourceLoader: loader, sessionManager, modelRuntime, model, eventBus });
  const terminal = terminalUI();
  try {
    await session.bindExtensions({ mode: 'interactive', uiContext: terminal.ui });
    const ext = loader.getExtensions().extensions.find((item) => item.path === controller);
    assert(ext?.commands.has('panels'));
    const ctx = session.extensionRunner.createToolContext('panels-test', new AbortController().signal);
    const command = ext.commands.get('panels');
    const run = (args) => command.handler(args, ctx);
    const createResult = await ctx.executeTool('TaskCreate', { subject: 'SDK visible task', description: 'fixture' });
    assert(!createResult.isError, JSON.stringify(createResult));
    assert(terminal.widgets.has('tasks'));
    await run('hide');
    assert(!terminal.widgets.has('tasks'));
    assert([...replies.values()].every((reply) => reply.hidden));
    await ctx.executeTool('TaskCreate', { subject: 'SDK task created while hidden', description: 'fixture' });
    assert(!terminal.widgets.has('tasks'));
    await run('show');
    assert.match(terminal.render('tasks'), /SDK task created while hidden/);
    const f6 = ext.shortcuts.get('f6');
    assert(f6);
    await f6.handler(ctx);
    assert(!terminal.widgets.has('tasks'));
    await f6.handler(ctx);
    assert(terminal.widgets.has('tasks'));
    const dispatch = (data) => {
      for (const callback of terminal.inputs) if (callback(data)?.consume) return true;
      return false;
    };
    assert.equal(dispatch('\x1b\x08'), false, 'Alt+Backspace must not be intercepted');
    assert(terminal.widgets.has('tasks'));
    assert.equal(dispatch('\x1b[104;7u'), true);
    assert(!terminal.widgets.has('tasks'));
    assert.equal(dispatch('\x1b[104;7:3u'), true);
    assert(!terminal.widgets.has('tasks'), 'key release must not toggle again');
    assert.equal(dispatch('\x1b[104;7:2u'), true);
    assert(!terminal.widgets.has('tasks'), 'key repeat must not toggle again');
    assert.equal(dispatch('\x1b[27;7;104~'), true);
    assert(terminal.widgets.has('tasks'));
    pi.events.emit('panel-visibility:request', { version: 1, hidden: 'true' });
    await run('status');
    assert([...replies.values()].every((reply) => reply.hidden === false));
    assert.deepEqual(settingsManager.getGlobalSettings(), settingsBefore);
    assert.equal(terminal.editorWrites(), 0);
    eventBus.clear();
    await run('hide');
    assert.match(terminal.notices.at(-1).message, /API|недоступ/);
    assert(terminal.widgets.has('tasks'), 'missing providers must not cause a partial toggle');
  } finally { session.dispose(); }
});

test('agent widget and fleet suppression preserves queued agents and independent display settings', async () => {
  const { AgentManager } = await jiti.import(join(agentsDir, 'src/agent-manager.ts'));
  const { AgentWidget } = await jiti.import(join(agentsDir, 'src/ui/agent-widget.ts'));
  const { FleetList } = await jiti.import(join(agentsDir, 'src/ui/fleet-list.ts'));
  const manager = new AgentManager(undefined, 0);
  const terminal = terminalUI();
  const activity = new Map();
  let hidden = false;
  let mode = 'background';
  const widget = new AgentWidget(manager, activity, () => hidden ? 'off' : mode);
  const fleet = new FleetList(manager, activity);
  widget.setUICtx(terminal.ui);
  fleet.setUICtx(terminal.ui);
  const workflow = { id: 'fixture', name: 'running workflow', status: 'running', doneCount: 0, totalCount: 1, startedAt: Date.now(), tokens: 0 };
  fleet.setWorkflowSource(() => [workflow], () => {});
  const id = manager.spawn({}, {}, 'general-purpose', 'fixture', { description: 'queued fixture', isBackground: true });
  try {
    widget.update(); fleet.update();
    assert(terminal.widgets.has('agents'));
    assert([...terminal.widgets.keys()].some((key) => key !== 'agents'));
    hidden = true;
    widget.update(); fleet.setEnabled(false);
    widget.update(); fleet.update();
    assert.equal(terminal.widgets.size, 0);
    assert.equal(manager.listAgents().find((agent) => agent.id === id).status, 'queued');
    workflow.doneCount = 1;
    hidden = false;
    widget.update(); fleet.setEnabled(true);
    assert(terminal.widgets.has('agents'));
    mode = 'off';
    hidden = true; widget.update();
    hidden = false; widget.update();
    assert(!terminal.widgets.has('agents'), 'original off preference must remain off');
  } finally { widget.dispose(); fleet.dispose(); await manager.dispose(); }
});
