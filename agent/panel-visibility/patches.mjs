const requestHandler = (body) => `
  // Временное подавление не меняет сохранённые настройки панелей.
  pi.events.on("panel-visibility:request", (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const request = data as { version?: unknown; hidden?: unknown };
    if (request.version !== 1 || (request.hidden !== undefined && typeof request.hidden !== "boolean")) return;
${body}
  });`;

export const PATCHES = [
  {
    package: '@tintinweb/pi-tasks', version: '0.9.1', file: 'src/ui/task-widget.ts',
    edits: [
      ['  private widgetRegistered = false;', '  private widgetRegistered = false;\n  private hidden = false;'],
      ['  setStore(store: TaskStore) {', '  setHidden(hidden: boolean) {\n    this.hidden = hidden;\n    this.update();\n  }\n\n  setStore(store: TaskStore) {'],
      ['    if (tasks.length === 0) {', '    if (tasks.length === 0 || this.hidden) {'],
    ],
  },
  {
    package: '@tintinweb/pi-tasks', version: '0.9.1', file: 'src/index.ts',
    edits: [[
      '  const widget = new TaskWidget(store, cfg);',
      '  const widget = new TaskWidget(store, cfg);\n  let panelsHidden = false;' + requestHandler(`    if (typeof request.hidden === "boolean" && panelsHidden !== request.hidden) {
      panelsHidden = request.hidden;
      widget.setHidden(panelsHidden);
    }
    pi.events.emit("panel-visibility:response", { version: 1, panel: "tasks", hidden: panelsHidden });`),
    ]],
  },
  {
    package: '@tintinweb/pi-subagents', version: '0.23.0', file: 'src/index.ts',
    edits: [
      ['  let widgetMode: WidgetMode = "background";', '  let widgetMode: WidgetMode = "background";\n  let panelsHidden = false;'],
      ['  const widget = new AgentWidget(manager, agentActivity, getWidgetMode, isShowCostEnabled, isShowModelEnabled);', '  const widget = new AgentWidget(manager, agentActivity, () => panelsHidden ? "off" : getWidgetMode(), isShowCostEnabled, isShowModelEnabled);'],
      [
        '  function setFleetViewEnabled(b: boolean): void { fleetViewEnabled = b; fleet.setEnabled(b); }',
        '  function setFleetViewEnabled(b: boolean): void { fleetViewEnabled = b; fleet.setEnabled(b && !panelsHidden); }' + requestHandler(`    if (typeof request.hidden === "boolean" && panelsHidden !== request.hidden) {
      panelsHidden = request.hidden;
      widget.update();
      fleet.setEnabled(fleetViewEnabled && !panelsHidden);
    }
    pi.events.emit("panel-visibility:response", { version: 1, panel: "subagents", hidden: panelsHidden });`),
      ],
    ],
  },
];
