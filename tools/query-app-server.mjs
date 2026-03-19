#!/usr/bin/env node

import { getAppServerUrl } from "../codex-visualizer.config.mjs";

export async function queryAppServer(method, params = {}, options = {}) {
  const url = options.url || process.env.CODEX_APP_SERVER_URL || getAppServerUrl();
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`Failed to connect to ${url}`)),
      { once: true },
    );
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);

    if (payload.method) {
      return;
    }

    const waiter = pending.get(payload.id);
    if (!waiter) {
      return;
    }

    pending.delete(payload.id);

    if (payload.error) {
      waiter.reject(new Error(payload.error.message || "Unknown JSON-RPC error"));
      return;
    }

    waiter.resolve(payload.result);
  });

  try {
    await request("initialize", {
      clientInfo: {
        name: "codex-visualizer-query",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    return await request(method, params);
  } finally {
    socket.close();
  }

  function request(methodName, requestParams) {
    const id = nextId++;
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: methodName,
        params: requestParams,
      }),
    );

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }
}

const isCliEntry = import.meta.url === new URL(process.argv[1], "file://").href;

if (isCliEntry) {
  const [, , method, paramsArg = "{}"] = process.argv;

  if (!method) {
    console.error("Usage: node tools/query-app-server.mjs <method> [json-params]");
    process.exit(1);
  }

  let params;
  try {
    params = JSON.parse(paramsArg);
  } catch (error) {
    console.error(`Invalid JSON params: ${error.message}`);
    process.exit(1);
  }

  queryAppServer(method, params)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
