#!/usr/bin/env node

import { spawn } from "node:child_process";
import { getAppServerUrl } from "../codex-visualizer.config.mjs";

const listenUrl = getAppServerUrl();

console.log(`Starting Codex app-server at ${listenUrl}`);

const child = spawn("codex", ["app-server", "--listen", listenUrl], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
