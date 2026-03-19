#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appConfig, getDashboardUrl } from "../codex-visualizer.config.mjs";

const args = [
  "-m",
  "http.server",
  String(appConfig.dashboard.port),
  "--bind",
  appConfig.dashboard.host,
];

console.log(`Serving Codex Visualizer at ${getDashboardUrl()}`);

const child = spawn("python3", args, {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
