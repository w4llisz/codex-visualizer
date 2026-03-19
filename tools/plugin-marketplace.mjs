#!/usr/bin/env node

import path from "node:path";
import { queryAppServer } from "./query-app-server.mjs";

const [, , command, pluginNameArg] = process.argv;
const cwd = process.cwd();
const marketplacePath = path.join(cwd, ".agents", "plugins", "marketplace.json");
const pluginName = pluginNameArg || "codex-visualizer";

if (!command || !["list", "read", "install"].includes(command)) {
  console.error("Usage: node tools/plugin-marketplace.mjs <list|read|install> [plugin-name]");
  process.exit(1);
}

const handlers = {
  async list() {
    return queryAppServer("plugin/list", {
      cwds: [cwd],
    });
  },
  async read() {
    return queryAppServer("plugin/read", {
      marketplacePath,
      pluginName,
    });
  },
  async install() {
    return queryAppServer("plugin/install", {
      marketplacePath,
      pluginName,
    });
  },
};

handlers[command]()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
