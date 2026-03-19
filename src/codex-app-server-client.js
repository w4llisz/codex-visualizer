export class CodexAppServerClient {
  constructor({ url, onStatus, onThread, onNotification, onServerRequest, onResponse }) {
    this.url = url;
    this.onStatus = onStatus;
    this.onThread = onThread;
    this.onNotification = onNotification;
    this.onServerRequest = onServerRequest;
    this.onResponse = onResponse;
    this.socket = null;
    this.requestId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not available in this environment.");
    }

    this.onStatus({
      transport: "websocket",
      status: "connecting",
      message: `Connecting to ${this.url}`,
      initialized: false,
    });

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error(`Unable to connect to ${this.url}`)),
        { once: true },
      );
      socket.addEventListener("message", (event) => this.handleMessage(event.data));
      socket.addEventListener("close", () => {
        this.onStatus({
          transport: "disconnected",
          status: "idle",
          message: "Disconnected",
          initialized: false,
        });
      });
    });

    this.onStatus({
      transport: "websocket",
      status: "connected",
      message: `Connected to ${this.url}`,
      initialized: false,
    });

    await this.initialize();
    await this.bootstrapThreads();
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    for (const entry of this.pending.values()) {
      entry.reject(new Error("Socket closed"));
    }
    this.pending.clear();
  }

  async initialize() {
    const result = await this.request("initialize", {
      clientInfo: {
        name: "codex-visualizer",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    this.onStatus({
      transport: "websocket",
      status: "connected",
      message: `${result.platformOs} / ${result.userAgent}`,
      initialized: true,
    });
  }

  async bootstrapThreads() {
    const loaded = await this.request("thread/loaded/list", {
      limit: 32,
    }).catch(() => ({ data: [] }));

    const listed = await this.request("thread/list", {
      limit: 24,
      archived: false,
    }).catch(() => ({ data: [] }));

    const loadedIds = new Set(loaded.data || []);
    const threads = listed.data || [];

    for (const thread of threads) {
      this.onThread(thread, { replaceHistory: false });
    }

    const priorityIds = [
      ...loadedIds,
      ...threads.map((thread) => thread.id),
    ].filter(uniqueOnly);

    for (const threadId of priorityIds.slice(0, 8)) {
      await this.readThread(threadId);
    }
  }

  async readThread(threadId) {
    const response = await this.request("thread/read", {
      threadId,
      includeTurns: true,
    });

    if (response?.thread) {
      this.onThread(response.thread, { replaceHistory: true });
    }

    return response;
  }

  request(method, params) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }

    const id = this.requestId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    this.socket.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
    });
  }

  handleMessage(rawData) {
    const payload = JSON.parse(rawData);

    if (typeof payload.id !== "undefined" && !payload.method) {
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }

      this.pending.delete(payload.id);
      this.onResponse(payload);

      if (payload.error) {
        pending.reject(new Error(payload.error.message || "Unknown JSON-RPC error"));
        return;
      }

      pending.resolve(payload.result);
      return;
    }

    if (payload.method && typeof payload.id !== "undefined") {
      this.onServerRequest(payload);
      return;
    }

    if (payload.method) {
      this.onNotification(payload);
    }
  }
}

function uniqueOnly(value, index, values) {
  return values.indexOf(value) === index;
}
