import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, isKeyRepeat, matchesKey } from "@earendil-works/pi-tui";

type Panel = "tasks" | "subagents";
type Action = "toggle" | "hide" | "show" | "status";

export default function panelVisibility(pi: ExtensionAPI) {
  const replies = new Map<Panel, boolean>();
  let removeInput: (() => void) | undefined;

  pi.events.on("panel-visibility:response", (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const reply = data as { version?: unknown; panel?: unknown; hidden?: unknown };
    if (reply.version === 1 && (reply.panel === "tasks" || reply.panel === "subagents") && typeof reply.hidden === "boolean") {
      replies.set(reply.panel, reply.hidden);
    }
  });

  function request(hidden?: boolean): boolean {
    replies.clear();
    pi.events.emit("panel-visibility:request", { version: 1, hidden });
    return replies.has("tasks") && replies.has("subagents");
  }

  function act(action: Action, ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    if (!request()) {
      ctx.ui.notify("API панелей недоступен. После обновления пакетов: node ~/.pi/agent/panel-visibility/install.mjs apply, затем /reload. Неизвестные версии автоматически не патчатся.", "warning");
      return;
    }
    if (action === "status") {
      const state = [...replies.values()].every(Boolean) ? "скрыты" : [...replies.values()].some(Boolean) ? "частично скрыты" : "показаны";
      ctx.ui.notify(`Панели: ${state}. F6 или /panels; Ctrl+Alt+H — только CSI-u/modifyOtherKeys.`, "info");
      return;
    }
    const hidden = action === "hide" || (action === "toggle" && ![...replies.values()].every(Boolean));
    if (!request(hidden) || [...replies.values()].some((value) => value !== hidden)) {
      ctx.ui.notify("Не удалось переключить все панели. Проверь /panels status и перезагрузи расширения через /reload.", "warning");
      return;
    }
    ctx.ui.setStatus("panel-visibility", hidden ? "Панели скрыты · F6" : undefined);
  }

  pi.registerCommand("panels", {
    description: "Скрыть/показать панели задач и агентов: [toggle|hide|show|status]",
    handler: async (args, ctx) => {
      const action = args.trim() || "toggle";
      if (action !== "toggle" && action !== "hide" && action !== "show" && action !== "status") {
        ctx.ui.notify("Использование: /panels [toggle|hide|show|status]", "warning");
        return;
      }
      act(action, ctx);
    },
  });

  pi.registerShortcut("f6", {
    description: "Скрыть/показать панели задач и агентов",
    handler: async (ctx) => act("toggle", ctx),
  });

  pi.on("session_start", (_event, ctx) => {
    removeInput?.();
    removeInput = undefined;
    if (!ctx.hasUI) return;
    removeInput = ctx.ui.onTerminalInput((data) => {
      // Legacy ESC+BS совпадает с Alt+Backspace: его нельзя забирать у редактора.
      if (data.startsWith("\x1b[") && matchesKey(data, "ctrl+alt+h")) {
        if (isKeyRelease(data) || isKeyRepeat(data)) return { consume: true };
        act("toggle", ctx);
        return { consume: true };
      }
      return undefined;
    });
    if (!request()) act("status", ctx);
  });

  pi.on("session_shutdown", () => {
    removeInput?.();
    removeInput = undefined;
  });
}
