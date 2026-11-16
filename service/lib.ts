import { createHash } from 'node:crypto';

// Minimum Engram version the service accepts (ADR-0013). Kept as a major/minor
// pair because the patch level is not part of the compatibility contract.
export const ENGRAM_FLOOR: [number, number] = [3, 4];
export const ENGRAM_FLOOR_LABEL = `${ENGRAM_FLOOR[0]}.${ENGRAM_FLOOR[1]}.0`;

// Read-only allowlist enforced service-side (ADR-0004). Nothing outside this
// set is ever forwarded to the Engram child.
export const ALLOWED_TOOLS = new Set([
  'mem_current_project',
  'mem_list_projects',
  'mem_context',
  'mem_search',
  'mem_get_observation',
  'mem_search_prompts',
  'mem_stats',
]);

export interface SpawnConfig {
  executable?: string;
  dataDir?: string | null;
  projectOverride?: string | null;
}

export function parseVersion(raw: string): [number, number] | null {
  const m = /engram\s+(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export function meetsFloor(v: [number, number] | null): boolean {
  if (!v) return false;
  if (v[0] > ENGRAM_FLOOR[0]) return true;
  if (v[0] === ENGRAM_FLOOR[0] && v[1] >= ENGRAM_FLOOR[1]) return true;
  return false;
}

export function contextId(directory: string, configKey: string): string {
  return createHash('sha1').update(`${directory}\0${configKey}`).digest('hex').slice(0, 16);
}

// Every field that changes how the Engram child is spawned must appear here, so a
// changed project mapping (or executable / data dir) gets its own child process.
// The previous expression relied on `??` binding looser than `+`, which dropped
// dataDir/projectOverride whenever an executable was configured.
export function spawnKey(config: SpawnConfig): string {
  return JSON.stringify({
    executable: config.executable ?? 'engram',
    dataDir: config.dataDir ?? null,
    projectOverride: config.projectOverride ?? null,
  });
}

export function parseEnvelope(text: string): { envelope?: Record<string, unknown>; parsed: string } {
  try {
    const envelope = JSON.parse(text);
    if (envelope && typeof envelope === 'object') return { envelope, parsed: String(envelope.result ?? '') };
  } catch {
    /* not an envelope */
  }
  return { parsed: text };
}

// Ownership is taken from the `Project:` line in the observation text, never the
// process envelope (ADR-0005). Callers must pass the parsed result, not the raw
// envelope JSON — the fixture captures the bug where the escaped `\n` of the raw
// envelope meant the guard never fired.
export function projectOfDetail(text: string): string | null {
  for (const line of text.split('\n')) {
    if (line.startsWith('Project: ')) return line.slice('Project: '.length).trim();
  }
  return null;
}

// True when the observation belongs to a different project than the one the
// caller is bound to. A missing bound project or a missing `Project:` line is
// not a mismatch (the ownership line is authoritative when present).
export function ownershipMismatch(bound: string | null | undefined, detailProject: string | null): boolean {
  return Boolean(bound && detailProject && detailProject !== bound);
}

export interface ObservationFacts {
  title: string;
  type: string;
  createdAt: string | null;
  sessionId: string | null;
  scope: string | null;
  topic: string | null;
  body: string;
}

// Observation facts from a mem_get_observation result. The stored text is
// "#<id> [<type>] <title>" followed by the content and a trailing
// bookkeeping block ("Session:", "Project:", "Scope:", "Topic:",
// "Duplicates:", "Revisions:", "Created:" — one per line). The detail card
// shows these facts, so the body drops the header line and the block.
export function observationFacts(parsed: string): ObservationFacts {
  const headerMatch = /^#[0-9]+\s*(?:\[([^\]]*)\]\s*)?([^\n]*)/.exec(parsed.trim());
  const meta: Record<string, string> = {};
  const lines = parsed.split('\n');
  let i = lines.length;
  while (i > 0) {
    const line = lines[i - 1].trim();
    if (!line) {
      i -= 1;
      continue;
    }
    const m = /^(Session|Project|Scope|Topic|Duplicates|Revisions|Created):\s*(.*)$/.exec(line);
    if (!m) break;
    meta[m[1]] = m[2].trim();
    i -= 1;
  }
  const bodyLines = lines.slice(0, i);
  if (headerMatch && bodyLines.length && /^#[0-9]+/.test(bodyLines[0].trim())) {
    bodyLines.shift();
  }
  return {
    title: (headerMatch?.[2] ?? '').trim(),
    type: (headerMatch?.[1] ?? '').trim(),
    createdAt: meta.Created ?? null,
    sessionId: meta.Session ?? null,
    scope: meta.Scope ?? null,
    topic: meta.Topic ?? null,
    body: bodyLines.join('\n').trim(),
  };
}

export function sortByCreatedAtDesc<T extends { created_at?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export type ProjectStatus = 'resolved' | 'ambiguous' | 'unknown';

// `mem_current_project` never errors on ambiguity: it returns project "" with
// project_source "ambiguous" (or a git/history conflict) plus available_projects.
export function projectStatusFor(project: string, projectSource: string, candidates: string[]): ProjectStatus {
  if (project && projectSource !== 'ambiguous') return 'resolved';
  return candidates.length ? 'ambiguous' : 'unknown';
}

export interface ProjectStatsRow {
  name: string;
  observation_count: number;
  session_count: number;
  prompt_count: number;
  directories: string[];
}

export function selectStatsTarget(projects: ProjectStatsRow[], project?: string): ProjectStatsRow | null {
  if (project) return projects.find((p) => p.name.toLowerCase() === project.toLowerCase()) ?? null;
  return projects[0] ?? null;
}
