import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __require = /* @__PURE__ */ createRequire(import.meta.url);

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
  "mem_search_prompts",
  "mem_stats"
]);
var ENGRAM_FLOOR = [3, 4];
var ENGRAM_FLOOR_LABEL = `${ENGRAM_FLOOR[0]}.${ENGRAM_FLOOR[1]}.0`;
var CONTEXT_IDLE_MS = 60000;
var MCP_CALL_TIMEOUT_MS = 8000;
var MAX_CONTEXTS = 2;
var contexts = new Map;
var sessionExportCache = new Map;
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
    clientInfo: { name: "openchamber-engram", version: "0.3.0" }
  });
  await notify(ctx, "notifications/initialized");
  const tools = await sendMcp(ctx, "tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  const missing = ["mem_current_project", "mem_context", "mem_search", "mem_get_observation"].filter((n) => !names.includes(n));
  if (missing.length)
    throw new Error(`unsupported-engram`);
}
function contextId(directory, configKey) {
  return createHash("sha1").update(`${directory}\x00${configKey}`).digest("hex").slice(0, 16);
}
function spawnKey(config) {
  return JSON.stringify({
    executable: config.executable ?? "engram",
    dataDir: config.dataDir ?? null,
    projectOverride: config.projectOverride ?? null
  });
}
function spawnContext(config, directory) {
  const id = contextId(directory, spawnKey(config));
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
async function exportProject(ctx, project) {
  const cacheKey = `${ctx.id}:${project}`;
  const now = Date.now();
  const cached = sessionExportCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ok: true, data: cached.data };
  }
  const tmpFile = `/tmp/opencode/engram-export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  try {
    const result = await new Promise((resolve) => {
      const env = { ...process.env };
      if (ctx.dataDir)
        env.ENGRAM_DATA_DIR = ctx.dataDir;
      if (ctx.projectOverride)
        env.ENGRAM_PROJECT = ctx.projectOverride;
      let stdout = "";
      let stderr = "";
      const proc = spawn(ctx.executable, ["export", tmpFile, "--project", project], { cwd: ctx.directory, env, shell: false });
      proc.stdout.on("data", (d) => {
        stdout += d;
      });
      proc.stderr.on("data", (d) => {
        stderr += d;
      });
      proc.on("close", (code) => resolve({ stdout, stderr, code }));
      proc.on("error", (err) => resolve({ stdout, stderr, code: -1 }));
      setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({ stdout, stderr, code: -1 });
      }, 8000);
    });
    if (result.code !== 0) {
      sessionExportCache.delete(cacheKey);
      return { ok: false, code: result.stderr.includes("not found") ? "not-found" : "read-failed" };
    }
    const raw = await new Promise((resolve, reject) => {
      import("node:fs").then(({ readFile }) => {
        readFile(tmpFile, "utf8", (err, data2) => err ? reject(err) : resolve(data2));
      }).catch(reject);
    });
    const data = JSON.parse(raw);
    sessionExportCache.set(cacheKey, { project, data, expiresAt: now + 30000 });
    return { ok: true, data };
  } catch (err) {
    sessionExportCache.delete(cacheKey);
    return { ok: false, code: err instanceof Error ? err.message : String(err) };
  } finally {
    import("node:fs").then(({ unlink }) => unlink(tmpFile, () => {})).catch(() => {});
  }
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
          json(res, 200, {
            ok: false,
            code: "unsupported-engram",
            version: versionOut.trim(),
            required: ENGRAM_FLOOR_LABEL
          });
          return;
        }
        const ctx = await spawnContext(config, directory);
        const cur = await toolCall(ctx, "mem_current_project", { directory });
        let project = "";
        let projectSource = "";
        let projectPath = "";
        let errorHint = "";
        let candidates = [];
        if (cur.text) {
          const { envelope } = parseEnvelope(cur.text);
          project = String(envelope?.project ?? "");
          projectSource = String(envelope?.project_source ?? "");
          projectPath = String(envelope?.project_path ?? "");
          errorHint = String(envelope?.error_hint ?? "");
          candidates = Array.isArray(envelope?.available_projects) ? envelope.available_projects : [];
        }
        if (!project && !candidates.length) {
          const pl = await toolCall(ctx, "mem_list_projects", {});
          if (pl.text) {
            const parsed = JSON.parse(pl.text);
            candidates = (parsed.projects ?? []).map((p) => p.name);
          }
        }
        const projectStatus = project && projectSource !== "ambiguous" ? "resolved" : candidates.length ? "ambiguous" : "unknown";
        touchContext(ctx);
        json(res, 200, {
          ok: true,
          contextId: ctx.id,
          project,
          projectSource,
          projectPath,
          projectStatus,
          errorHint,
          candidates,
          version: versionOut.trim()
        });
        return;
      }
      case "/v1/observations": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        if (!project) {
          json(res, 200, { ok: false, code: "missing-project" });
          return;
        }
        const limit = Math.min(Number(body.limit ?? 20) || 20, 20);
        const r = await toolCall(ctx, "mem_search", {
          query: project,
          project,
          limit,
          response_format: "compact",
          match_mode: "all"
        });
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const { envelope, parsed } = parseEnvelope(r.text);
        const results = Array.isArray(envelope?.results) ? envelope.results : [];
        results.sort((a, b) => {
          const at = String(a.created_at ?? "");
          const bt = String(b.created_at ?? "");
          return bt.localeCompare(at);
        });
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
            createdAt: row.created_at
          })),
          note: message && results.length === 0 ? message : undefined
        });
        return;
      }
      case "/v1/sessions": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        if (!project) {
          json(res, 200, { ok: false, code: "missing-project" });
          return;
        }
        const exp = await exportProject(ctx, project);
        if (!exp.ok) {
          json(res, 200, { ok: false, code: exp.code ?? "read-failed" });
          return;
        }
        const sessions = [];
        const sessionsMap = new Map;
        for (const s of exp.data.sessions || []) {
          sessionsMap.set(s.id, { ...s, observationCount: 0, promptCount: 0 });
        }
        for (const o of exp.data.observations || []) {
          const sid = o.session_id;
          if (sessionsMap.has(sid))
            sessionsMap.get(sid).observationCount++;
        }
        for (const p of exp.data.prompts || []) {
          const sid = p.session_id;
          if (sessionsMap.has(sid))
            sessionsMap.get(sid).promptCount++;
        }
        for (const s of sessionsMap.values()) {
          sessions.push({
            id: s.id,
            startedAt: s.started_at,
            endedAt: s.ended_at ?? null,
            summary: s.summary ?? "",
            directory: s.directory ?? "",
            observationCount: s.observationCount,
            promptCount: s.promptCount
          });
        }
        sessions.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
        json(res, 200, { ok: true, sessions });
        return;
      }
      case "/v1/sessionDetail": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        const sessionId = String(body.sessionId ?? "");
        if (!project || !sessionId) {
          json(res, 200, { ok: false, code: "missing-project-or-session" });
          return;
        }
        const exp = await exportProject(ctx, project);
        if (!exp.ok) {
          json(res, 200, { ok: false, code: exp.code ?? "read-failed" });
          return;
        }
        const session = (exp.data.sessions || []).find((s) => s.id === sessionId);
        if (!session) {
          json(res, 200, { ok: false, code: "unknown-session" });
          return;
        }
        const sessionProject = session.project ?? "";
        if (sessionProject !== project) {
          json(res, 200, { ok: false, code: "project-mismatch" });
          return;
        }
        const obs = (exp.data.observations || []).filter((o) => o.session_id === sessionId && !o.deleted_at).map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          preview: o.content ? o.content.substring(0, 300).trim() : "",
          createdAt: o.created_at
        })).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 50);
        const prompts = (exp.data.prompts || []).filter((p) => p.session_id === sessionId).map((p) => ({
          id: p.id,
          content: p.content,
          createdAt: p.created_at,
          sessionId: p.session_id
        })).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 50);
        json(res, 200, {
          ok: true,
          session: {
            id: session.id,
            startedAt: session.started_at,
            endedAt: session.ended_at ?? null,
            summary: session.summary ?? "",
            directory: session.directory ?? "",
            project: session.project ?? ""
          },
          observations: obs,
          prompts
        });
        return;
      }
      case "/v1/prompts": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        if (!project) {
          json(res, 200, { ok: false, code: "missing-project" });
          return;
        }
        const limit = Math.min(Number(body.limit ?? 20) || 20, 20);
        const r = await toolCall(ctx, "mem_search_prompts", {
          query: project,
          project,
          limit
        });
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const { envelope, parsed } = parseEnvelope(r.text);
        const results = Array.isArray(envelope?.results) ? envelope.results : [];
        results.sort((a, b) => {
          const at = String(a.created_at ?? "");
          const bt = String(b.created_at ?? "");
          return bt.localeCompare(at);
        });
        const message = parsed.trim();
        json(res, 200, {
          ok: true,
          hits: results.map((row) => ({
            id: row.id,
            content: row.content,
            preview: typeof row.content === "string" ? row.content.substring(0, 200).trim() : "",
            createdAt: row.created_at,
            sessionId: row.session_id
          })),
          note: message && results.length === 0 ? message : undefined
        });
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
      case "/v1/stats": {
        const ctx = contexts.get(String(body.contextId ?? ""));
        if (!ctx) {
          json(res, 200, { ok: false, code: "no-context" });
          return;
        }
        const project = typeof body.project === "string" ? body.project : undefined;
        const r = await toolCall(ctx, "mem_list_projects", project ? { project } : {});
        if (r.error) {
          json(res, 200, { ok: false, code: "read-failed", message: r.error });
          return;
        }
        const parsed = JSON.parse(r.text);
        const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
        const target = project ? projects.find((p) => p.name.toLowerCase() === project.toLowerCase()) : projects[0] ?? null;
        json(res, 200, { ok: true, stats: target ? { sessions: target.session_count, observations: target.observation_count, prompts: target.prompt_count } : null });
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
