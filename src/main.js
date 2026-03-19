import { CodexAppServerClient } from "./codex-app-server-client.js";
import { createMockStream } from "./mock-stream.js";
import { createStore, deriveViewModel, formatThreadSource } from "./store.js";

const isBrowser = typeof document !== "undefined";

if (isBrowser) {
  bootstrap();
}

export function bootstrap() {
  const mountNode = document.getElementById("app");
  const store = createStore();
  const mockStream = createMockStream();
  let liveClient = null;

  store.subscribe((state) => {
    renderApp(mountNode, deriveViewModel(state), {
      onModeChange(mode) {
        store.setMode(mode);
      },
      onUrlChange(url) {
        store.setUrl(url);
      },
      async onConnect() {
        const snapshot = store.getState();
        disconnectActiveTransport(snapshot, liveClient, mockStream, store);
        store.resetRuntime(true);
        if (snapshot.connection.mode === "mock") {
          mockStream.start(buildHandlers(store));
          return;
        }

        const handlers = buildHandlers(store);
        liveClient = new CodexAppServerClient({
          url: snapshot.connection.url,
          ...handlers,
        });

        try {
          await liveClient.connect();
        } catch (error) {
          store.setConnection({
            transport: "disconnected",
            status: "error",
            initialized: false,
            message: error.message,
          });
        }
      },
      onDisconnect() {
        const snapshot = store.getState();
        disconnectActiveTransport(snapshot, liveClient, mockStream, store);
        liveClient = null;
      },
      async onSelectThread(threadId) {
        store.setActiveThread(threadId);
        if (liveClient && store.getState().connection.mode === "live") {
          try {
            await liveClient.readThread(threadId);
          } catch (error) {
            store.setConnection({
              message: `Failed to read thread ${threadId}: ${error.message}`,
            });
          }
        }
      },
    });
  });

  renderApp(mountNode, deriveViewModel(store.getState()), {
    onModeChange(mode) {
      store.setMode(mode);
    },
    onUrlChange(url) {
      store.setUrl(url);
    },
    onConnect() {
      return Promise.resolve();
    },
    onDisconnect() {},
    onSelectThread() {},
  });
}

function disconnectActiveTransport(snapshot, liveClient, mockStream, store) {
  mockStream.stop(buildHandlers(store));

  if (liveClient) {
    liveClient.disconnect();
  }
  store.setConnection({
    transport: "disconnected",
    status: "idle",
    initialized: false,
    message: "Disconnected",
  });
}

function buildHandlers(store) {
  return {
    onStatus(statusPatch) {
      store.setConnection(statusPatch);
    },
    onThread(thread, options) {
      store.ingestThread(thread, options);
    },
    onNotification(notification) {
      store.ingestNotification(notification);
    },
    onServerRequest(request) {
      store.ingestServerRequest(request);
    },
    onResponse(response) {
      store.ingestResponse(response);
    },
  };
}

function renderApp(root, vm, actions) {
  const activeThread = vm.activeThread;
  const activeStatus = vm.connection.status;
  const canConnect = activeStatus !== "connecting";
  const connectLabel = activeStatus === "connected" ? "Reconnect" : "Connect";

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <p class="eyebrow">Codex Observatory</p>
          <h1>Visualizer</h1>
          <p class="subtle">Track context, tools, sub-agents, and plan progress in one surface.</p>
        </div>

        <section class="panel control-panel">
          <div class="section-heading">
            <h2>Connection</h2>
            <span class="status-pill status-${escapeHtml(activeStatus)}">${escapeHtml(activeStatus)}</span>
          </div>
          <label class="field">
            <span>Mode</span>
            <select id="mode-select">
              <option value="mock" ${vm.connection.mode === "mock" ? "selected" : ""}>Mock</option>
              <option value="live" ${vm.connection.mode === "live" ? "selected" : ""}>Live</option>
            </select>
          </label>
          <label class="field">
            <span>WebSocket URL</span>
            <input id="url-input" type="text" value="${escapeHtml(vm.connection.url)}" ${vm.connection.mode === "mock" ? "disabled" : ""} />
          </label>
          <div class="button-row">
            <button id="connect-button" ${canConnect ? "" : "disabled"}>${connectLabel}</button>
            <button id="disconnect-button">Disconnect</button>
          </div>
          <p class="transport-line">
            <strong>Transport:</strong>
            <span>${escapeHtml(vm.connection.transport)}</span>
          </p>
          <p class="subtle mono">${escapeHtml(vm.connection.message)}</p>
        </section>

        <section class="panel">
          <div class="section-heading">
            <h2>Threads</h2>
            <span class="count-badge">${vm.threads.length}</span>
          </div>
          <div class="thread-list">
            ${vm.threads.length === 0 ? `<p class="empty-state">No threads loaded yet.</p>` : vm.threads.map((thread) => renderThreadRow(thread, vm.activeThread?.id)).join("")}
          </div>
        </section>
      </aside>

      <main class="content">
        <section class="hero">
          <div>
            <p class="eyebrow">Selected Thread</p>
            <h2>${escapeHtml(activeThread?.meta?.name || activeThread?.meta?.preview || "No thread selected")}</h2>
            <p class="subtle">${escapeHtml(activeThread ? `${formatThreadSource(activeThread.meta.source)} · ${activeThread.meta.cwd}` : "Connect to Codex or start mock playback.")}</p>
          </div>
          <div class="hero-meta">
            <span class="hero-badge">${escapeHtml(activeThread?.latestTurnId || "No active turn")}</span>
            <span class="hero-badge">${escapeHtml(activeThread?.meta?.modelProvider || "unknown provider")}</span>
          </div>
        </section>

        <section class="metrics-grid">
          ${renderMetricCard("Context Remaining", formatTokenValue(vm.context.remainingTokens), vm.context.modelContextWindow ? `Window ${formatTokenValue(vm.context.modelContextWindow)}` : "Window unknown")}
          ${renderMetricCard("Active Tools", String(vm.activeTools.length), `${vm.pendingServerRequests.length} pending approvals / callbacks`)}
          ${renderMetricCard("Sub Agents", String(vm.relatedSubAgents.length + vm.activeAgentsFromItems.length), `${vm.relatedSubAgents.length} spawned threads visible`)}
          ${renderMetricCard("Todo Progress", `${vm.plan.percent}%`, `${vm.plan.completedSteps}/${vm.plan.steps.length || 0} completed`)}
        </section>

        <section class="main-grid">
          <section class="panel tall">
            <div class="section-heading">
              <h2>Plan</h2>
              <span class="count-badge">${vm.plan.steps.length}</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${vm.plan.percent}%"></div>
            </div>
            <p class="subtle">${escapeHtml(vm.plan.explanation || vm.plan.streaming || "No plan streamed for this turn.")}</p>
            <div class="plan-list">
              ${vm.plan.steps.length === 0 ? `<p class="empty-state">No plan items.</p>` : vm.plan.steps.map(renderPlanStep).join("")}
            </div>
          </section>

          <section class="panel tall">
            <div class="section-heading">
              <h2>Tools</h2>
              <span class="count-badge">${vm.activeTools.length}</span>
            </div>
            <div class="stack">
              ${vm.activeTools.length === 0 ? `<p class="empty-state">No active tools right now.</p>` : vm.activeTools.map(renderToolCard).join("")}
              ${vm.pendingServerRequests.length > 0 ? vm.pendingServerRequests.map(renderPendingRequestCard).join("") : ""}
            </div>
          </section>

          <section class="panel tall">
            <div class="section-heading">
              <h2>Sub Agents</h2>
              <span class="count-badge">${vm.relatedSubAgents.length + vm.activeAgentsFromItems.length}</span>
            </div>
            <div class="stack">
              ${renderAgentItems(vm)}
            </div>
          </section>

          <section class="panel wide">
            <div class="section-heading">
              <h2>Activity</h2>
              <span class="count-badge">${vm.items.length}</span>
            </div>
            <div class="timeline">
              ${vm.items.length === 0 ? `<p class="empty-state">No thread items recorded yet.</p>` : vm.items.slice().reverse().map(renderItemTimeline).join("")}
            </div>
          </section>

          <section class="panel wide">
            <div class="section-heading">
              <h2>Raw Event Feed</h2>
              <span class="count-badge">${vm.rawEvents.length}</span>
            </div>
            <div class="event-feed">
              ${vm.rawEvents.length === 0 ? `<p class="empty-state">No events yet.</p>` : vm.rawEvents.map(renderRawEvent).join("")}
            </div>
          </section>
        </section>
      </main>
    </div>
  `;

  root.querySelector("#mode-select")?.addEventListener("change", (event) => {
    actions.onModeChange(event.target.value);
  });

  root.querySelector("#url-input")?.addEventListener("input", (event) => {
    actions.onUrlChange(event.target.value);
  });

  root.querySelector("#connect-button")?.addEventListener("click", () => {
    actions.onConnect();
  });

  root.querySelector("#disconnect-button")?.addEventListener("click", () => {
    actions.onDisconnect();
  });

  root.querySelectorAll("[data-thread-id]").forEach((element) => {
    element.addEventListener("click", () => {
      actions.onSelectThread(element.getAttribute("data-thread-id"));
    });
  });
}

function renderMetricCard(label, value, hint) {
  return `
    <article class="panel metric-card">
      <p class="metric-label">${escapeHtml(label)}</p>
      <p class="metric-value">${escapeHtml(value)}</p>
      <p class="subtle">${escapeHtml(hint)}</p>
    </article>
  `;
}

function renderThreadRow(thread, activeThreadId) {
  const isActive = thread.id === activeThreadId;
  const title = thread.meta.name || thread.id;
  const preview = thread.meta.preview && thread.meta.preview !== title
    ? thread.meta.preview
    : "No assistant reply yet.";

  return `
    <button class="thread-row ${isActive ? "thread-row-active" : ""}" data-thread-id="${escapeHtml(thread.id)}">
      <div class="thread-row-top">
        <strong>${escapeHtml(title)}</strong>
        <span class="status-dot ${statusClass(thread.meta.status)}"></span>
      </div>
      <p>${escapeHtml(preview)}</p>
      <p>${escapeHtml(formatThreadSource(thread.meta.source))}</p>
      <p class="thread-row-foot mono">${escapeHtml(thread.id)}</p>
    </button>
  `;
}

function renderPlanStep(step, index) {
  return `
    <article class="plan-step">
      <span class="plan-index">${index + 1}</span>
      <div>
        <p>${escapeHtml(step.step)}</p>
        <span class="status-pill status-${escapeHtml(step.status)}">${escapeHtml(step.status)}</span>
      </div>
    </article>
  `;
}

function renderToolCard(item) {
  const primary = item.type === "commandExecution"
    ? item.command
    : item.type === "dynamicToolCall"
      ? item.tool
      : item.type === "mcpToolCall"
        ? `${item.server}.${item.tool}`
        : item.type;

  const detail = item.type === "commandExecution"
    ? item.cwd
    : item.type === "dynamicToolCall"
      ? JSON.stringify(item.arguments)
      : item.type === "mcpToolCall"
        ? JSON.stringify(item.arguments)
        : "";

  return `
    <article class="stack-card">
      <div class="stack-card-top">
        <strong>${escapeHtml(primary)}</strong>
        <span class="status-pill status-${escapeHtml(item.status || "inProgress")}">${escapeHtml(item.status || "inProgress")}</span>
      </div>
      <p class="mono wrap">${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderPendingRequestCard(request) {
  return `
    <article class="stack-card caution">
      <div class="stack-card-top">
        <strong>${escapeHtml(request.method)}</strong>
        <span class="status-pill status-pending">pending</span>
      </div>
      <p class="mono wrap">${escapeHtml(JSON.stringify(request.params))}</p>
    </article>
  `;
}

function renderAgentItems(vm) {
  const segments = [];

  for (const item of vm.activeAgentsFromItems) {
    segments.push(`
      <article class="stack-card">
        <div class="stack-card-top">
          <strong>${escapeHtml(item.tool)}</strong>
          <span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        </div>
        <p>${escapeHtml(item.prompt || "No prompt captured")}</p>
        <p class="mono wrap">${escapeHtml(item.receiverThreadIds.join(", ") || "No target thread yet")}</p>
      </article>
    `);
  }

  for (const thread of vm.relatedSubAgents) {
    segments.push(`
      <article class="stack-card accent">
        <div class="stack-card-top">
          <strong>${escapeHtml(thread.meta.agentNickname || thread.meta.name || thread.id)}</strong>
          <span class="status-pill ${statusClass(thread.meta.status)}">${escapeHtml(formatThreadSource(thread.meta.source))}</span>
        </div>
        <p>${escapeHtml(thread.meta.agentRole || "sub-agent")}</p>
        <p class="mono wrap">${escapeHtml(thread.id)}</p>
      </article>
    `);
  }

  if (segments.length === 0) {
    return `<p class="empty-state">No sub-agent activity recorded.</p>`;
  }

  return segments.join("");
}

function renderItemTimeline(item) {
  const header = `${item.type} · ${item.turnId || "unknown turn"}`;
  const body = (() => {
    switch (item.type) {
      case "commandExecution":
        return `${item.command} (${item.status})`;
      case "dynamicToolCall":
        return `${item.tool} (${item.status})`;
      case "mcpToolCall":
        return `${item.server}.${item.tool} (${item.status})`;
      case "collabAgentToolCall":
        return `${item.tool} -> ${item.receiverThreadIds.join(", ") || "pending"}`;
      case "agentMessage":
        return item.text;
      case "plan":
        return item.text;
      default:
        return JSON.stringify(item);
    }
  })();

  return `
    <article class="timeline-row">
      <p class="timeline-title">${escapeHtml(header)}</p>
      <p class="mono wrap">${escapeHtml(body)}</p>
    </article>
  `;
}

function renderRawEvent(event) {
  return `
    <article class="event-row">
      <div class="stack-card-top">
        <strong>${escapeHtml(event.kind)}</strong>
        <span class="subtle mono">${escapeHtml(event.receivedAt)}</span>
      </div>
      <pre>${escapeHtml(JSON.stringify(event.payload, null, 2))}</pre>
    </article>
  `;
}

function statusClass(status) {
  if (!status) {
    return "status-idle";
  }

  if (typeof status === "string") {
    return `status-${status}`;
  }

  if (status.type) {
    return `status-${status.type}`;
  }

  return "status-idle";
}

function formatTokenValue(value) {
  if (typeof value !== "number") {
    return "Unknown";
  }

  return Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
