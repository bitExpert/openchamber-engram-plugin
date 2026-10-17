// service/main.ts
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!port || !token) {
  console.error("OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}
var ALLOWED_TOOLS = new Set([
  "mem_current_project",
  "mem_list_projects",
  "mem_context",
  "mem_search",
  "mem_get_observation",
  "mem_timeline",
  "mem_stats"
]);
var ENGRAM_FLOOR = [2, 0];
var CONTEXT_IDLE_MS = 60000;
var MCP_CALL_TIMEOUT_MS = 8000;
var MAX_CONTEXTS = 2;
var contexts = new Map;
var json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid-json"));
      }
    });
    req.on("error", reject);
  });
}
function parseVersion(raw) {
  const m = /engram\s+(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!m)
    return null;
  return [Number(m[1]), Number(m[2])];
}
function meetsFloor(v) {
  if (!v)
    return false;
  if (v[0] > ENGRAM_FLOOR[0])
    return true;
  if (v[0] === ENGRAM_FLOOR[0] && v[1] >= ENGRAM_FLOOR[1])
    return true;
  return false;
}
function sendMcp(ctx, method, params, id) {
  if (!ctx.alive)
    return Promise.reject(new Error("transport-closed"));
  const requestId = id ?? ctx.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ctx.pending.delete(requestId);
      reject(new Error("mcp-timeout"));
    }, MCP_CALL_TIMEOUT_MS);
    ctx.pending.set(requestId, (msg) => {
      clearTimeout(timer);
      const m = msg;
      if (m.error)
        resolve({ error: m.error });
      else
        resolve({ result: m.result });
    });
    ctx.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + `
`);
  });
}
async function notify(ctx, method) {
  ctx.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + `
`);
}
async function initializeMcp(ctx) {
  await sendMcp(ctx, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "openchamber-engram", version: "0.2.0" }
  });
  await notify(ctx, "notifications/initialized");
  const tools = await sendMcp(ctx, "tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  const missing = ["mem_current_project", "mem_context", "mem_search", "mem_get_observation"].filter((n) => !names.includes(n));
  if (missing.length)
    throw new Error(`unsupported-engram`);
}
function contextId(directory, configRevision) {
  return createHash("sha1").update(`${directory}\x00${configRevision}`).digest("hex").slice(0, 16);
}
function spawnContext(config, directory) {
  const id = contextId(directory, config.executable ?? "" + (config.dataDir ?? "") + (config.projectOverride ?? ""));
  if (contexts.size >= MAX_CONTEXTS && !contexts.has(id)) {
    return Promise.reject(new Error("context-limit"));
  }
  const existing = contexts.get(id);
  if (existing && existing.alive) {
    touchContext(existing);
    return Promise.resolve(existing);
  }
  if (existing)
    stopContext(existing);
  const executable = config.executable ?? "engram";
  const env = { ...process.env };
  if (config.dataDir)
    env.ENGRAM_DATA_DIR = config.dataDir;
  if (config.projectOverride)
    env.ENGRAM_PROJECT = config.projectOverride;
  const child = spawn(executable, ["mcp", "--tools=agent,admin"], { cwd: directory, env, shell: false });
  const ctx = {
    id,
    directory,
    executable,
    dataDir: config.dataDir ?? null,
    projectOverride: config.projectOverride ?? null,
    child,
    buf: "",
    nextId: 1,
    pending: new Map,
    idleTimer: null,
    alive: true
  };
  child.stdout.on("data", (d) => {
    ctx.buf += d.toString();
    let nl;
    while ((nl = ctx.buf.indexOf(`
`)) !== -1) {
      const line = ctx.buf.slice(0, nl).trim();
      ctx.buf = ctx.buf.slice(nl + 1);
      if (!line)
        continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const m = msg;
      if (m.id !== undefined && ctx.pending.has(m.id)) {
        const handler = ctx.pending.get(m.id);
        ctx.pending.delete(m.id);
        handler(msg);
      }
    }
  });
  child.stderr.on("data", (d) => {
    process.stderr.write(`[engram] ${d}`);
  });
  child.on("exit", (code, signal) => {
    ctx.alive = false;
    if (ctx.idleTimer)
      clearTimeout(ctx.idleTimer);
    for (const [, handler] of ctx.pending)
      handler({ error: { code: -32000, message: `child-exited ${code ?? signal}` } });
    ctx.pending.clear();
  });
  child.on("error", (err) => {
    ctx.alive = false;
    for (const [, handler] of ctx.pending)
      handler({ error: { code: -32000, message: `child-error ${err.message}` } });
    ctx.pending.clear();
  });
  contexts.set(id, ctx);
  touchContext(ctx);
  return initializeMcp(ctx).then(() => ctx);
}
function touchContext(ctx) {
  if (ctx.idleTimer)
    clearTimeout(ctx.idleTimer);
  ctx.idleTimer = setTimeout(() => {
    if (contexts.get(ctx.id) === ctx)
      stopContext(ctx);
  }, CONTEXT_IDLE_MS);
}
function stopContext(ctx) {
  if (ctx.idleTimer)
    clearTimeout(ctx.idleTimer);
  ctx.alive = false;
  try {
    ctx.child.kill("SIGTERM");
  } catch {}
  contexts.delete(ctx.id);
}
async function toolCall(ctx, name, args) {
  if (!ALLOWED_TOOLS.has(name))
    return { error: `denied: ${name}` };
  touchContext(ctx);
  let result;
  try {
    result = await sendMcp(ctx, "tools/call", { name, arguments: args });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (result.error)
    return { error: `mcp-error: ${JSON.stringify(result.error)}` };
  const content = result.result?.content ?? [];
  const textContent = content.find((c) => c.type === "text");
  return { text: textContent?.text ?? "" };
}
function parseEnvelope(text) {
  try {
    const envelope = JSON.parse(text);
    if (envelope && typeof envelope === "object")
      return { envelope, parsed: String(envelope.result ?? "") };
  } catch {}
  return { parsed: text };
}
function projectOfDetail(text) {
  for (const line of text.split(`
`)) {
    if (line.startsWith("Project: "))
      return line.slice("Project: ".length).trim();
  }
  return null;
}
var server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "method-not-allowed" });
    return;
  }
  try {
    const body = await readBody(req);
    switch (url.pathname) {
      case "/v1/connect": {
        const config = body.config ?? {};
        const configRevision = String(body.configRevision ?? "default");
        const directory = String(body.directory ?? process.cwd());
        const executable = config.executable ?? "engram";
        const versionOut = await new Promise((resolve, reject) => {
          execFile(executable, ["--version"], { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout)
              return reject(new Error("exec-not-found"));
            resolve(stdout);
          });
        });
        const version = parseVersion(versionOut);
        if (!meetsFloor(version)) {
          json(res, 200, { ok: false, code: "unsupported-engram", version: versionOut.trim() });
          return;
        }
        const ctx = await spawnContext(config, directory);
        const cur = await toolCall(ctx, "mem_current_project", {});
        let project = "";
        let projectSource = "";
        let candidates = [];
        if (cur.text) {
          const { envelope } = parseEnvelope(cur.text);
          project = String(envelope?.project ?? "");
          projectSource = String(envelope?.project_source ?? "");
          candidates = Array.isArray(envelope?.available_projects) ? envelope.available_projects : [];
        }
        if (!project) {
          const pl = await toolCall(ctx, "mem_list_projects", {});
          if (pl.text) {
            const { envelope } = parseEnvelope(pl.text);
            candidates = envelope?.projects?.map((p) => p.name) ?? candidates;
          }
        }
        touchContext(ctx);
        json(res, 200, { ok: true, contextId: ctx.id, project, projectSource, candidates, version: versionOut.trim() });
        return;
      }
      case "/v1/recent": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        const r = await toolCall(ctx, "mem_context", {
          ...project ? { project } : {},
          max_bytes: 16384,
          compact: true
        });
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const { envelope, parsed } = parseEnvelope(r.text);
        json(res, 200, { ok: true, document: parsed, envelopeProject: envelope?.project ?? null });
        return;
      }
      case "/v1/search": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const query = String(body.query ?? "").trim();
        if (!query) {
          json(res, 200, { ok: false, code: "empty-query" });
          return;
        }
        const limit = Math.min(Number(body.limit ?? 20) || 20, 20);
        const r = await toolCall(ctx, "mem_search", {
          query,
          project: typeof body.project === "string" ? body.project : undefined,
          limit,
          response_format: "compact",
          match_mode: body.broad ?? true ? "any" : "all"
        });
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const { envelope, parsed } = parseEnvelope(r.text);
        const results = Array.isArray(envelope?.results) ? envelope.results : [];
        const message = parsed.trim();
        json(res, 200, {
          ok: true,
          hits: results.map((row) => ({
            id: row.id,
            title: row.title,
            type: row.type,
            preview: row.preview,
            truncated: row.truncated,
            scope: row.scope,
            createdAt: undefined
          })),
          note: message && results.length === 0 ? message : undefined
        });
        return;
      }
      case "/v1/getMemory": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) {
          json(res, 200, { ok: false, code: "invalid-id" });
          return;
        }
        const bound = typeof body.project === "string" ? body.project : ctx.projectOverride;
        const r = await toolCall(ctx, "mem_get_observation", { id });
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const text = r.text;
        const { envelope, parsed } = parseEnvelope(text);
        const detailProject = projectOfDetail(parsed);
        if (bound && detailProject && detailProject !== bound) {
          json(res, 200, { ok: false, code: "project-mismatch" });
          return;
        }
        const titleMatch = /^#[0-9]+\s*([^\n]*)/.exec(parsed.trim());
        json(res, 200, { ok: true, id, title: titleMatch?.[1]?.trim() ?? "", markdown: parsed, meta: { created: undefined } });
        return;
      }
      case "/v1/disconnect": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (ctx)
          stopContext(ctx);
        json(res, 200, { ok: true });
        return;
      }
      default:
        json(res, 404, { error: "not-found" });
    }
  } catch (e) {
    json(res, 200, { ok: false, code: "service-error", message: e instanceof Error ? e.message : String(e) });
  }
});
server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => {
  for (const ctx of contexts.values())
    stopContext(ctx);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
