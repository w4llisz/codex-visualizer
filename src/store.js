import { appConfig, getAppServerUrl } from "../codex-visualizer.config.mjs";

const MAX_RAW_EVENTS = 80;

const DEFAULT_CONNECTION = {
  mode: appConfig.connection.defaultMode,
  status: "idle",
  url: getAppServerUrl(),
  message: "Ready",
  transport: "disconnected",
  initialized: false,
};

export function createDefaultConnection(overrides = {}) {
  return {
    ...DEFAULT_CONNECTION,
    ...overrides,
  };
}

export function createStore(options = {}) {
  const state = {
    connection: createDefaultConnection(options.connection),
    threads: {},
    threadOrder: [],
    activeThreadId: null,
    pendingServerRequests: {},
    rawEvents: [],
  };

  const listeners = new Set();

  return {
    getState() {
      return structuredCloneSafe(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setConnection(patch) {
      Object.assign(state.connection, patch);
      emit();
    },
    setMode(mode) {
      state.connection.mode = mode;
      emit();
    },
    setUrl(url) {
      state.connection.url = url;
      emit();
    },
    setActiveThread(threadId) {
      state.activeThreadId = threadId;
      emit();
    },
    resetRuntime(keepConnection = true) {
      const connection = keepConnection
        ? { ...state.connection, initialized: false }
        : createDefaultConnection();

      state.connection = connection;
      state.threads = {};
      state.threadOrder = [];
      state.activeThreadId = null;
      state.pendingServerRequests = {};
      state.rawEvents = [];
      emit();
    },
    ingestThread(thread, options = {}) {
      const current = ensureThreadState(state, thread.id);
      current.meta = normalizeThreadMeta(thread);
      if (!state.threadOrder.includes(thread.id)) {
        state.threadOrder.unshift(thread.id);
      } else {
        moveThreadToFront(state.threadOrder, thread.id);
      }

      if (options.replaceHistory) {
        current.items = {};
        current.itemOrder = [];
        current.turns = {};
        current.plan = {
          turnId: null,
          explanation: "",
          steps: [],
          streaming: "",
        };
      }

      for (const turn of thread.turns || []) {
        current.turns[turn.id] = {
          id: turn.id,
          status: turn.status,
          error: turn.error,
        };
        for (const item of turn.items || []) {
          ingestThreadItem(current, item, turn.id);
        }
      }

      if (!state.activeThreadId) {
        state.activeThreadId = thread.id;
      }

      emit();
    },
    ingestNotification(notification) {
      appendRawEvent(state, "notification", notification);
      applyNotification(state, notification);
      emit();
    },
    ingestServerRequest(request) {
      appendRawEvent(state, "serverRequest", request);
      state.pendingServerRequests[String(request.id)] = {
        id: String(request.id),
        method: request.method,
        params: request.params,
        receivedAt: Date.now(),
      };
      emit();
    },
    ingestResponse(response) {
      appendRawEvent(state, "response", response);
      emit();
    },
    markServerRequestResolved(requestId) {
      delete state.pendingServerRequests[String(requestId)];
      emit();
    },
  };

  function emit() {
    const snapshot = structuredCloneSafe(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function appendRawEvent(state, kind, payload) {
  state.rawEvents.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    payload,
    receivedAt: new Date().toISOString(),
  });
  state.rawEvents = state.rawEvents.slice(0, MAX_RAW_EVENTS);
}

function ensureThreadState(state, threadId) {
  if (!state.threads[threadId]) {
    state.threads[threadId] = {
      id: threadId,
      meta: {
        id: threadId,
        name: null,
        preview: "",
        status: { type: "notLoaded" },
        cwd: "",
        source: "unknown",
        agentNickname: null,
        agentRole: null,
        updatedAt: 0,
        createdAt: 0,
        modelProvider: "",
        cliVersion: "",
        gitInfo: null,
      },
      tokenUsage: null,
      plan: {
        turnId: null,
        explanation: "",
        steps: [],
        streaming: "",
      },
      items: {},
      itemOrder: [],
      turns: {},
      latestTurnId: null,
    };
  }

  return state.threads[threadId];
}

function normalizeThreadMeta(thread) {
  return {
    id: thread.id,
    name: thread.name ?? null,
    preview: thread.preview ?? "",
    status: thread.status ?? { type: "notLoaded" },
    cwd: thread.cwd ?? "",
    source: thread.source ?? "unknown",
    agentNickname: thread.agentNickname ?? null,
    agentRole: thread.agentRole ?? null,
    updatedAt: thread.updatedAt ?? 0,
    createdAt: thread.createdAt ?? 0,
    modelProvider: thread.modelProvider ?? "",
    cliVersion: thread.cliVersion ?? "",
    gitInfo: thread.gitInfo ?? null,
  };
}

function moveThreadToFront(threadOrder, threadId) {
  const index = threadOrder.indexOf(threadId);
  if (index > 0) {
    threadOrder.splice(index, 1);
    threadOrder.unshift(threadId);
  }
}

function ingestThreadItem(threadState, item, turnId) {
  threadState.items[item.id] = {
    ...item,
    turnId,
  };
  if (!threadState.itemOrder.includes(item.id)) {
    threadState.itemOrder.push(item.id);
  }
  threadState.latestTurnId = turnId;
  threadState.meta.updatedAt = nowUnix();

  const nextPreview = extractThreadPreview(item);
  if (nextPreview) {
    threadState.meta.preview = nextPreview;
  }
}

function applyNotification(state, notification) {
  const { method, params } = notification;

  switch (method) {
    case "thread/started":
      ensureThreadState(state, params.thread.id);
      state.threads[params.thread.id].meta = normalizeThreadMeta(params.thread);
      moveThreadToFrontOrInsert(state.threadOrder, params.thread.id);
      if (!state.activeThreadId) {
        state.activeThreadId = params.thread.id;
      }
      return;
    case "thread/status/changed": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.meta.status = params.status;
      threadState.meta.updatedAt = nowUnix();
      moveThreadToFrontOrInsert(state.threadOrder, params.threadId);
      return;
    }
    case "thread/name/updated": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.meta.name = params.threadName ?? null;
      threadState.meta.updatedAt = nowUnix();
      return;
    }
    case "thread/tokenUsage/updated": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.tokenUsage = params.tokenUsage;
      threadState.latestTurnId = params.turnId;
      threadState.meta.updatedAt = nowUnix();
      return;
    }
    case "turn/started": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.turns[params.turn.id] = {
        id: params.turn.id,
        status: params.turn.status,
        error: params.turn.error,
      };
      threadState.latestTurnId = params.turn.id;
      threadState.meta.updatedAt = nowUnix();
      moveThreadToFrontOrInsert(state.threadOrder, params.threadId);
      return;
    }
    case "turn/completed": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.turns[params.turn.id] = {
        id: params.turn.id,
        status: params.turn.status,
        error: params.turn.error,
      };
      threadState.latestTurnId = params.turn.id;
      threadState.meta.updatedAt = nowUnix();
      moveThreadToFrontOrInsert(state.threadOrder, params.threadId);
      return;
    }
    case "turn/plan/updated": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.plan = {
        turnId: params.turnId,
        explanation: params.explanation ?? "",
        steps: params.plan ?? [],
        streaming: "",
      };
      threadState.latestTurnId = params.turnId;
      threadState.meta.updatedAt = nowUnix();
      return;
    }
    case "item/plan/delta": {
      const threadState = ensureThreadState(state, params.threadId);
      threadState.plan.turnId = params.turnId;
      threadState.plan.streaming += params.delta ?? "";
      threadState.latestTurnId = params.turnId;
      threadState.meta.updatedAt = nowUnix();
      return;
    }
    case "item/started":
    case "item/completed": {
      const threadState = ensureThreadState(state, params.threadId);
      ingestThreadItem(threadState, params.item, params.turnId);
      threadState.latestTurnId = params.turnId;
      moveThreadToFrontOrInsert(state.threadOrder, params.threadId);
      return;
    }
    case "serverRequest/resolved":
      delete state.pendingServerRequests[String(params.requestId)];
      return;
    default:
      return;
  }
}

function moveThreadToFrontOrInsert(threadOrder, threadId) {
  if (!threadOrder.includes(threadId)) {
    threadOrder.unshift(threadId);
    return;
  }

  moveThreadToFront(threadOrder, threadId);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function extractThreadPreview(item) {
  if (!item || item.type !== "agentMessage") {
    return "";
  }

  const text = String(item.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function deriveViewModel(state) {
  const threads = state.threadOrder
    .map((threadId) => state.threads[threadId])
    .filter(Boolean)
    .sort((left, right) => (right.meta.updatedAt || 0) - (left.meta.updatedAt || 0));

  const activeThread =
    state.threads[state.activeThreadId] ??
    threads[0] ??
    null;

  const items = activeThread
    ? activeThread.itemOrder
        .map((itemId) => activeThread.items[itemId])
        .filter(Boolean)
    : [];

  const activeTools = items.filter((item) => {
    if (item.type === "commandExecution") {
      return item.status === "inProgress";
    }
    if (item.type === "dynamicToolCall" || item.type === "mcpToolCall") {
      return item.status === "inProgress";
    }
    return false;
  });

  const activeAgentsFromItems = items.filter((item) => {
    return item.type === "collabAgentToolCall";
  });

  const relatedSubAgents = threads.filter((thread) => {
    return typeof thread.meta.source === "object" && "subAgent" in thread.meta.source;
  });

  const planSteps = activeThread?.plan?.steps ?? [];
  const completedSteps = planSteps.filter((step) => step.status === "completed").length;
  const inProgressSteps = planSteps.filter((step) => step.status === "inProgress").length;
  const pendingSteps = planSteps.filter((step) => step.status === "pending").length;
  const planPercent = planSteps.length === 0
    ? 0
    : Math.round((completedSteps / planSteps.length) * 100);

  const tokenUsage = activeThread?.tokenUsage ?? null;
  const totalTokens = tokenUsage?.total?.totalTokens ?? null;
  const modelContextWindow = tokenUsage?.modelContextWindow ?? null;
  const remainingTokens =
    typeof modelContextWindow === "number" && typeof totalTokens === "number"
      ? Math.max(modelContextWindow - totalTokens, 0)
      : null;

  return {
    connection: state.connection,
    threads,
    activeThread,
    items,
    activeTools,
    activeAgentsFromItems,
    relatedSubAgents,
    plan: {
      explanation: activeThread?.plan?.explanation ?? "",
      streaming: activeThread?.plan?.streaming ?? "",
      steps: planSteps,
      completedSteps,
      inProgressSteps,
      pendingSteps,
      percent: planPercent,
    },
    context: {
      tokenUsage,
      totalTokens,
      modelContextWindow,
      remainingTokens,
    },
    pendingServerRequests: Object.values(state.pendingServerRequests).sort(
      (left, right) => right.receivedAt - left.receivedAt,
    ),
    rawEvents: state.rawEvents,
  };
}

export function formatThreadSource(source) {
  if (!source) {
    return "unknown";
  }

  if (typeof source === "string") {
    return source;
  }

  if ("subAgent" in source) {
    const subAgentSource = source.subAgent;
    if (typeof subAgentSource === "string") {
      return `subAgent:${subAgentSource}`;
    }
    if ("thread_spawn" in subAgentSource) {
      return `subAgent:thread_spawn`;
    }
    if ("other" in subAgentSource) {
      return `subAgent:${subAgentSource.other}`;
    }
  }

  return "unknown";
}
