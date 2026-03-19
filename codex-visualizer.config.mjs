export const appConfig = {
  dashboard: {
    host: "127.0.0.1",
    port: 4173,
  },
  appServer: {
    protocol: "ws",
    host: "127.0.0.1",
    port: 8765,
  },
  connection: {
    defaultMode: "mock",
  },
  mock: {
    repoCwd: "/workspace/codex-visualizer",
    workspaceRoot: "/workspace",
  },
};

export function getDashboardUrl() {
  const { host, port } = appConfig.dashboard;
  return `http://${host}:${port}`;
}

export function getAppServerUrl() {
  const { protocol, host, port } = appConfig.appServer;
  return `${protocol}://${host}:${port}`;
}
