import { appConfig } from "../codex-visualizer.config.mjs";

export function createMockStream() {
  let timerIds = [];
  let isRunning = false;

  return {
    start(handlers) {
      if (isRunning) {
        return;
      }
      isRunning = true;

      handlers.onStatus({
        transport: "mock",
        status: "connected",
        initialized: true,
        message: "Mock playback started",
      });

      for (const step of buildScript()) {
        const timerId = setTimeout(() => {
          if (!isRunning) {
            return;
          }

          if (step.kind === "thread") {
            handlers.onThread(step.payload, { replaceHistory: false });
            return;
          }
          if (step.kind === "notification") {
            handlers.onNotification(step.payload);
            return;
          }
          if (step.kind === "serverRequest") {
            handlers.onServerRequest(step.payload);
          }
        }, step.delayMs);

        timerIds.push(timerId);
      }
    },
    stop(handlers) {
      isRunning = false;
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      }
      timerIds = [];
      handlers.onStatus({
        transport: "disconnected",
        status: "idle",
        initialized: false,
        message: "Mock playback stopped",
      });
    },
  };
}

function buildScript() {
  const threadId = "thread_main_demo";
  const turnId = "turn_demo_001";
  const subThreadId = "thread_subagent_research";
  const repoCwd = appConfig.mock.repoCwd;
  const workspaceRoot = appConfig.mock.workspaceRoot;

  return [
    {
      delayMs: 60,
      kind: "thread",
      payload: {
        id: threadId,
        preview: "开发 Codex 可视化插件",
        ephemeral: false,
        modelProvider: "openai",
        createdAt: nowUnix(),
        updatedAt: nowUnix(),
        status: { type: "active", activeFlags: [] },
        path: null,
        cwd: repoCwd,
        cliVersion: "0.115.0",
        source: "cli",
        agentNickname: null,
        agentRole: null,
        gitInfo: null,
        name: "Codex Visualizer Prototype",
        turns: [],
      },
    },
    {
      delayMs: 140,
      kind: "notification",
      payload: {
        method: "turn/started",
        params: {
          threadId,
          turn: {
            id: turnId,
            items: [],
            status: "inProgress",
            error: null,
          },
        },
      },
    },
    {
      delayMs: 260,
      kind: "notification",
      payload: {
        method: "thread/tokenUsage/updated",
        params: {
          threadId,
          turnId,
          tokenUsage: {
            total: {
              totalTokens: 62118,
              inputTokens: 50260,
              cachedInputTokens: 11200,
              outputTokens: 11858,
              reasoningOutputTokens: 2048,
            },
            last: {
              totalTokens: 62118,
              inputTokens: 50260,
              cachedInputTokens: 11200,
              outputTokens: 11858,
              reasoningOutputTokens: 2048,
            },
            modelContextWindow: 128000,
          },
        },
      },
    },
    {
      delayMs: 380,
      kind: "notification",
      payload: {
        method: "turn/plan/updated",
        params: {
          threadId,
          turnId,
          explanation: "Build a standalone dashboard against Codex app-server.",
          plan: [
            { step: "Inspect app-server protocol", status: "completed" },
            { step: "Create dashboard shell", status: "completed" },
            { step: "Aggregate tools, agents, and plan state", status: "inProgress" },
            { step: "Validate live and mock modes", status: "pending" },
          ],
        },
      },
    },
    {
      delayMs: 520,
      kind: "notification",
      payload: {
        method: "item/started",
        params: {
          threadId,
          turnId,
          item: {
            type: "commandExecution",
            id: "item_cmd_001",
            command: "codex app-server generate-ts --out web/codex-visualizer/protocol",
            cwd: workspaceRoot,
            processId: "23627",
            status: "inProgress",
            commandActions: [
              {
                type: "unknown",
                command: "codex app-server generate-ts --out web/codex-visualizer/protocol",
              },
            ],
            aggregatedOutput: null,
            exitCode: null,
            durationMs: null,
          },
        },
      },
    },
    {
      delayMs: 820,
      kind: "notification",
      payload: {
        method: "item/started",
        params: {
          threadId,
          turnId,
          item: {
            type: "dynamicToolCall",
            id: "item_tool_001",
            tool: "functions.exec_command",
            arguments: {
              cmd: "rg -n \"tokenUsage|plan|collabAgentToolCall\" web/codex-visualizer/protocol/*.ts",
            },
            status: "inProgress",
            contentItems: null,
            success: null,
            durationMs: null,
          },
        },
      },
    },
    {
      delayMs: 1080,
      kind: "notification",
      payload: {
        method: "item/started",
        params: {
          threadId,
          turnId,
          item: {
            type: "collabAgentToolCall",
            id: "item_agent_001",
            tool: "spawnAgent",
            status: "inProgress",
            senderThreadId: threadId,
            receiverThreadIds: [subThreadId],
            prompt: "Summarize protocol surfaces related to plan and token usage.",
            model: "gpt-5.4-mini",
            reasoningEffort: "medium",
            agentsStates: {
              [subThreadId]: {
                status: "running",
                message: "Inspecting ThreadItem and ServerNotification types",
              },
            },
          },
        },
      },
    },
    {
      delayMs: 1180,
      kind: "thread",
      payload: {
        id: subThreadId,
        preview: "Inspect protocol types",
        ephemeral: true,
        modelProvider: "openai",
        createdAt: nowUnix(),
        updatedAt: nowUnix(),
        status: { type: "active", activeFlags: [] },
        path: null,
        cwd: repoCwd,
        cliVersion: "0.115.0",
        source: {
          subAgent: {
            thread_spawn: {
              parent_thread_id: threadId,
              depth: 1,
              agent_nickname: "protocol-scout",
              agent_role: "explorer",
            },
          },
        },
        agentNickname: "protocol-scout",
        agentRole: "explorer",
        gitInfo: null,
        name: "Protocol Scout",
        turns: [],
      },
    },
    {
      delayMs: 1320,
      kind: "serverRequest",
      payload: {
        jsonrpc: "2.0",
        id: 991,
        method: "execCommandApproval",
        params: {
          approvalId: "approval_991",
          command: ["npm", "install"],
          cwd: repoCwd,
          reason: "Network access required to install dependencies",
          parsedCmd: [],
        },
      },
    },
    {
      delayMs: 1600,
      kind: "notification",
      payload: {
        method: "item/completed",
        params: {
          threadId,
          turnId,
          item: {
            type: "commandExecution",
            id: "item_cmd_001",
            command: "codex app-server generate-ts --out web/codex-visualizer/protocol",
            cwd: workspaceRoot,
            processId: "23627",
            status: "completed",
            commandActions: [
              {
                type: "unknown",
                command: "codex app-server generate-ts --out web/codex-visualizer/protocol",
              },
            ],
            aggregatedOutput: "Protocol definitions generated",
            exitCode: 0,
            durationMs: 1804,
          },
        },
      },
    },
    {
      delayMs: 1860,
      kind: "notification",
      payload: {
        method: "item/completed",
        params: {
          threadId,
          turnId,
          item: {
            type: "dynamicToolCall",
            id: "item_tool_001",
            tool: "functions.exec_command",
            arguments: {
              cmd: "rg -n \"tokenUsage|plan|collabAgentToolCall\" web/codex-visualizer/protocol/*.ts",
            },
            status: "completed",
            contentItems: [
              {
                type: "output_text",
                text: "Found thread/tokenUsage/updated, turn/plan/updated, collabAgentToolCall",
              },
            ],
            success: true,
            durationMs: 351,
          },
        },
      },
    },
    {
      delayMs: 2140,
      kind: "notification",
      payload: {
        method: "item/completed",
        params: {
          threadId,
          turnId,
          item: {
            type: "collabAgentToolCall",
            id: "item_agent_001",
            tool: "spawnAgent",
            status: "completed",
            senderThreadId: threadId,
            receiverThreadIds: [subThreadId],
            prompt: "Summarize protocol surfaces related to plan and token usage.",
            model: "gpt-5.4-mini",
            reasoningEffort: "medium",
            agentsStates: {
              [subThreadId]: {
                status: "completed",
                message: "Located relevant notification and item types",
              },
            },
          },
        },
      },
    },
    {
      delayMs: 2380,
      kind: "notification",
      payload: {
        method: "turn/plan/updated",
        params: {
          threadId,
          turnId,
          explanation: "Build a standalone dashboard against Codex app-server.",
          plan: [
            { step: "Inspect app-server protocol", status: "completed" },
            { step: "Create dashboard shell", status: "completed" },
            { step: "Aggregate tools, agents, and plan state", status: "completed" },
            { step: "Validate live and mock modes", status: "inProgress" },
          ],
        },
      },
    },
    {
      delayMs: 2660,
      kind: "notification",
      payload: {
        method: "serverRequest/resolved",
        params: {
          threadId,
          requestId: 991,
        },
      },
    },
  ];
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}
