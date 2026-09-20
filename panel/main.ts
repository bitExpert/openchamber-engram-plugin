import { connectHost, type GuestRequestMethod } from '@openchamber/sdk';
import { applyHostReady, mountBadge, mountButton, mountList, mountSearchField, mountSelect, mountSeparator, type Tone } from '@openchamber/sdk/ui';
import { renderMarkdownInto } from './markdown';

const host = connectHost();
const root = document.querySelector('#root') as HTMLElement;
if (!root) throw new Error('Missing root');

interface Config {
  executable?: string;
  dataDir?: string | null;
  projectOverride?: string | null;
}

interface ConnectState {
  contextId: string;
  project: string;
  projectSource: string;
  candidates: string[];
  version: string;
}

interface SearchHit {
  id: number;
  title: string;
  type: string;
  preview: string;
  scope: string;
}

const STORAGE_KEY = 'config/v1';

let config: Config = {};
let directory: string | null = null;
let state: ConnectState | null = null;
let query = '';
let broad = true;
let limit = 20;
let currentAllContextId: string | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, container: HTMLElement, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  container.append(node);
  return node;
};

const main = el('div', root);
const toolbar = el('div', main, 'toolbar');
const badge = mountBadge(toolbar, { label: 'Initializing', tone: 'neutral' });
const content = el('div', main, 'content');
const statusNote = el('div', content, 'note');
const viewRoot = el('div', content);

const setBadge = (label: string, tone: Tone): void => badge.update({ label, tone });

async function pingService(): Promise<string | null> {
  try {
    const status = await host.serviceStatus();
    return status.status === 'ready' ? 'ready' : status.status === 'failed' ? 'failed' : 'starting';
  } catch {
    return null;
  }
}

async function callService<T>(method: GuestRequestMethod, path: string, body: Record<string, unknown>): Promise<T> {
  const result = await host.serviceRequest({ method, path, body: JSON.stringify(body) });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`service ${result.status}: ${result.body}`);
  }
  return JSON.parse(result.body) as T;
}

async function connect(): Promise<void> {
  viewRoot.textContent = '';
  setBadge('Connecting', 'neutral');
  statusNote.textContent = 'Starting local service…';
  const status = await pingService();
  if (status !== 'ready') {
    setBadge('Starting service', 'neutral');
  }
  try {
    const dir = directory ?? processDirectory();
    const revision = JSON.stringify(config);
    const result = await callService<{ ok: boolean; code?: string; contextId?: string; project?: string; projectSource?: string; candidates?: string[]; version?: string }>('POST', '/v1/connect', { config, configRevision: revision, directory: dir });
    if (!result.ok) {
      setBadge(result.code === 'unsupported-engram' ? 'Unsupported Engram' : 'Failed', 'error');
      statusNote.textContent = result.code === 'unsupported-engram' ? `Engram ${result.version ?? 'unknown'} is below the supported floor 2.0.0.` : `Connect failed: ${result.code ?? 'unknown'}`;
      renderSetup();
      return;
    }
    state = result as ConnectState;
    currentAllContextId = result.contextId ?? null;
    setBadge('Ready', 'success');
    statusNote.textContent = `Engram ${state.version}`;
    renderRecent();
  } catch (error) {
    setBadge('Unavailable', 'error');
    statusNote.textContent = error instanceof Error ? error.message : String(error);
    renderSetup();
  }
}

function processDirectory(): string {
  return directory ?? '~';
}

async function renderRecent(): Promise<void> {
  if (!state) return;
  viewRoot.textContent = '';
  const heading = el('h3', viewRoot);
  heading.textContent = 'Recent memories';
  const doc = el('div', viewRoot);
  const result = await callService<{ ok: boolean; code?: string; document?: string }>('POST', '/v1/recent', { contextId: state.contextId, project: state.project || undefined });
  if (!result.ok) {
    statusNote.textContent = `Recent unavailable: ${result.code ?? 'unknown'}`;
    return;
  }
  renderMarkdownInto(doc, result.document ?? '', (url) => void host.openUrl(url));
}

async function doSearch(): Promise<void> {
  if (!state) return;
  if (!query.trim()) { void renderRecent(); return; }
  viewRoot.textContent = '';
  const result = await callService<{ ok: boolean; code?: string; hits?: SearchHit[]; note?: string }>('POST', '/v1/search', {
    contextId: state.contextId,
    query,
    broad,
    limit,
    project: state.project || undefined,
  });
  if (!result.ok) {
    statusNote.textContent = `Search failed: ${result.code ?? 'unknown'}`;
    return;
  }
  statusNote.textContent = '';
  if (result.note) {
    const note = el('p', viewRoot, 'note');
    note.textContent = result.note;
    return;
  }
  const hits = result.hits ?? [];
  if (!hits.length) {
    const note = el('p', viewRoot, 'note');
    note.textContent = 'No matches.';
    return;
  }
  mountList(viewRoot, {
    items: hits.map((h) => ({
      id: String(h.id),
      title: h.title,
      subtitle: h.preview,
      leading: h.type,
      meta: h.scope,
    })),
    onSelect: (id) => void showDetail(Number(id)),
  });
}

async function showDetail(id: number): Promise<void> {
  if (!state) return;
  viewRoot.textContent = '';
  const back = el('div', viewRoot, 'actions');
  mountButton(back, { label: 'Back', variant: 'ghost', size: 'xs', onClick: () => { if (query.trim()) void doSearch(); else void renderRecent(); } });
  const result = await callService<{ ok: boolean; code?: string; title?: string; markdown?: string }>('POST', '/v1/getMemory', { contextId: state.contextId, id, project: state.project || undefined });
  if (!result.ok) {
    statusNote.textContent = `Detail failed: ${result.code ?? 'unknown'}`;
    return;
  }
  const title = el('h3', viewRoot);
  title.textContent = result.title ?? `Memory #${id}`;
  const body = el('div', viewRoot);
  renderMarkdownInto(body, result.markdown ?? '', (url) => void host.openUrl(url));
  const actions = el('div', viewRoot, 'actions');
  mountButton(actions, { label: 'Copy Markdown', size: 'sm', onClick: () => { void host.writeClipboard(result.markdown ?? ''); setBadge('Copied', 'success'); setTimeout(() => setBadge('Ready', 'success'), 1500); } });
  const detailState = state;
  mountButton(actions, { label: 'Insert into chat', size: 'sm', variant: 'secondary', onClick: () => {
    const text = `## ${result.title ?? `Memory #${id}`} (project: ${detailState?.project})\n${result.markdown ?? ''}`;
    void host.compose({ text, mode: 'append' }).then(() => setBadge('Inserted', 'success')).catch(() => setBadge('Insert failed', 'error'));
  } });
}

function renderSetup(): void {
  if (!viewRoot) return;
  mountSeparator(viewRoot);
  const heading = el('h3', viewRoot);
  heading.textContent = 'Engram setup';
  const note = el('p', viewRoot, 'note');
  note.textContent = 'Open the extension settings to change the executable, data directory, and project mapping.';
}

const searchFieldWrap = el('label', toolbar, 'oc-sdk oc-sdk-field');
const searchCaption = el('span', searchFieldWrap, 'oc-sdk-field-label');
searchCaption.textContent = 'Search memories';
const searchField = mountSearchField(searchFieldWrap, {
  value: '', placeholder: 'Search memories…', label: 'Search memories',
  autofocus: false, onChange: (value) => { query = value; void doSearch(); },
});

const modeSelect = mountSelect(toolbar, {
  label: 'Match', value: broad ? 'any' : 'all',
  options: [
    { id: 'any', label: 'Broader', hint: 'Any keyword matches' },
    { id: 'all', label: 'Strict', hint: 'Every keyword matches' },
  ],
  onChange: (value) => { broad = value === 'any'; void doSearch(); },
});

const limitSelect = mountSelect(toolbar, {
  label: 'Limit', value: String(limit),
  options: [
    { id: '10', label: '10' },
    { id: '20', label: '20' },
  ],
  onChange: (value) => { limit = Number(value); void doSearch(); },
});

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  void host.storage.get(STORAGE_KEY).then((stored) => {
    if (stored && typeof stored === 'object') config = stored as Config;
  }).finally(() => { void connect(); });
  context.directory !== undefined && (directory = context.directory ?? null);
});

host.onDirectory((dir) => {
  directory = dir;
  void connect();
});