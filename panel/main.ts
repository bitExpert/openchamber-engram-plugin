import { connectHost, type GuestRequestMethod, type JsonValue } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBadge,
  mountButton,
  mountList,
  mountSearchField,
  mountSelect,
  mountSeparator,
  mountTabs,
  type TabItem,
  type Tone,
} from '@openchamber/sdk/ui';
import { renderMarkdownInto } from './markdown';

const host = connectHost();
const root = document.querySelector('#root') as HTMLElement;
if (!root) throw new Error('Missing root');

interface Config {
  executable?: string;
  dataDir?: string | null;
  projectOverride?: string | null;
}

type ProjectStatus = 'resolved' | 'ambiguous' | 'unknown';

interface ConnectResult {
  ok: boolean;
  code?: string;
  contextId?: string;
  project?: string;
  projectSource?: string;
  projectPath?: string;
  projectStatus?: ProjectStatus;
  errorHint?: string;
  candidates?: string[];
  version?: string;
  required?: string;
}

interface ProjectStats {
  sessions: number;
  observations: number;
  prompts: number;
}

interface ConnectState {
  contextId: string;
  project: string;
  projectSource: string;
  projectPath: string;
  projectStatus: ProjectStatus;
  errorHint: string;
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

interface PromptHit {
  id: number;
  content: string;
  preview: string;
  createdAt: string;
  sessionId?: string | null;
}

const STORAGE_KEY = 'config/v1';

let config: Config = {};
let directory: string | null = null;
let state: ConnectState | null = null;
let query = '';
let broad = true;
let limit = 20;
let currentAllContextId: string | null = null;
let stats: ProjectStats | null = null;
let currentTab: string = 'observations';
// Render token: every view render captures the current value and abandons
// after any await when a newer render has started. Without it, overlapping
// renders (search keystrokes, directory changes, reconnects) each cleared
// viewRoot first and then all appended their documents, painting the
// context block several times over.
let renderSeq = 0;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  container: HTMLElement,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  container.append(node);
  return node;
};

const main = el('div', root);
const toolbar = el('div', main, 'toolbar');
const toolbarMain = el('div', toolbar, 'toolbar-main');
const titleCol = el('div', toolbarMain, 'title-col');
const title = el('div', titleCol, 'title');
const titleName = el('span', title, 'title-name');
titleName.textContent = 'Engram Memory';
const titleVersion = el('span', title, 'title-version');
titleVersion.textContent = 'v?';
titleVersion.title = 'Detected Engram version';
const content = el('div', main, 'content');
const statusNote = el('div', content, 'note');
const viewRoot = el('div', content);

const versionLabel = (raw: string | undefined): string => {
  const m = /(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/.exec(raw ?? '');
  return m ? `v${m[1]}` : 'v?';
};

const setVersion = (raw: string | undefined): void => {
  titleVersion.textContent = versionLabel(raw);
};

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
  renderSeq++;
  viewRoot.textContent = '';
  stats = null;
  setBadge('Connecting', 'neutral');
  setVersion(undefined);
  statusNote.textContent = 'Starting local service…';
  const status = await pingService();
  if (status !== 'ready') {
    setBadge('Starting service', 'neutral');
  }
  try {
    const dir = directory ?? processDirectory();
    const revision = JSON.stringify(config);
    const result = await callService<ConnectResult>('POST', '/v1/connect', {
      config,
      configRevision: revision,
      directory: dir,
    });
    setVersion(result.version);
    if (!result.ok) {
      setBadge(result.code === 'unsupported-engram' ? 'Unsupported Engram' : 'Failed', 'error');
      statusNote.textContent =
        result.code === 'unsupported-engram'
          ? `Engram ${result.version ?? 'unknown'} is below the supported floor ${result.required ?? '3.4.0'}.`
          : `Connect failed: ${result.code ?? 'unknown'}`;
      renderSetup();
      return;
    }
    state = {
      contextId: result.contextId ?? '',
      project: result.project ?? '',
      projectSource: result.projectSource ?? '',
      projectPath: result.projectPath ?? '',
      projectStatus: result.projectStatus ?? 'unknown',
      errorHint: result.errorHint ?? '',
      candidates: result.candidates ?? [],
      version: result.version ?? '',
    };
    currentAllContextId = state.contextId || null;
    statusNote.textContent = '';
    if (state.projectStatus === 'resolved') {
      setBadge('Ready', 'success');
      void renderRecent();
    } else {
      setBadge(state.projectStatus === 'ambiguous' ? 'Pick project' : 'No project', 'warning');
      renderProjectGate();
    }
  } catch (error) {
    setBadge('Unavailable', 'error');
    statusNote.textContent = error instanceof Error ? error.message : String(error);
    renderSetup();
  }
}

async function fetchStats(): Promise<void> {
  if (!state || !state.contextId) {
    stats = null;
    return;
  }
  try {
    const result = await callService<{ ok: boolean; code?: string; stats?: ProjectStats }>('POST', '/v1/stats', {
      contextId: state.contextId,
      project: state.project || undefined,
    });
    stats = result.ok ? (result.stats ?? null) : null;
  } catch {
    stats = null;
  }
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function renderStatsGrid(container: HTMLElement): void {
  const grid = el('div', container, 'stats-grid');
  const tiles: { label: string; value: string }[] = [
    { label: 'Sessions', value: stats ? formatCount(stats.sessions) : '—' },
    { label: 'Observations', value: stats ? formatCount(stats.observations) : '—' },
    { label: 'Prompts', value: stats ? formatCount(stats.prompts) : '—' },
  ];
  for (const tile of tiles) {
    const node = el('div', grid, 'stat-tile');
    const label = el('span', node, 'stat-label');
    label.textContent = tile.label;
    const value = el('span', node, 'stat-value');
    value.textContent = tile.value;
  }
}

function processDirectory(): string {
  return directory ?? '~';
}

async function renderRecent(): Promise<void> {
  if (!state) return;
  const seq = ++renderSeq;
  backTarget = { restore: 'list' };
  viewRoot.textContent = '';
  renderProjectLine(viewRoot);
  if (state.projectStatus === 'resolved') {
    await fetchStats();
    if (seq !== renderSeq) return;
    renderStatsGrid(viewRoot);
  }

  if (seq !== renderSeq) return;

  // Tabs UI
  const tabsSection = el('div', viewRoot, 'tabs-section');
  const tabsContainer = el('div', tabsSection);
  const tabsItems: TabItem[] = [
    { id: 'observations', label: 'Observations', count: stats?.observations },
    { id: 'sessions', label: 'Sessions', count: stats?.sessions },
    { id: 'prompts', label: 'Prompts', count: stats?.prompts },
  ];
  const tabsHandle = mountTabs(tabsContainer, {
    items: tabsItems,
    activeId: currentTab,
    onChange: (id) => {
      currentTab = id;
      tabsHandle.update({ activeId: id });
      renderTab();
    },
  });

  const contentContainer = el('div', tabsSection, 'tab-content');
  renderTabContent(contentContainer);
}

function renderTab(): void {
  if (!state || state.projectStatus !== 'resolved') return;
  const tabContent = viewRoot.querySelector<HTMLElement>('.tab-content');
  if (!tabContent) return;
  tabContent.textContent = '';
  renderTabContent(tabContent);
}

async function renderTabContent(container: HTMLElement): Promise<void> {
  if (currentTab === 'observations') {
    await renderObservationsTab(container);
  } else if (currentTab === 'sessions') {
    await renderSessionsTab(container);
  } else if (currentTab === 'prompts') {
    await renderPromptsTab(container);
  }
}

async function renderObservationsTab(container: HTMLElement): Promise<void> {
  if (!state) return;
  const seq = ++renderSeq;
  statusNote.textContent = '';
  const result = await callService<{ ok: boolean; code?: string; hits?: SearchHit[]; note?: string }>(
    'POST',
    '/v1/observations',
    {
      contextId: state.contextId,
      project: state.project || undefined,
      limit,
    },
  );
  if (seq !== renderSeq) return;
  if (!result.ok) {
    statusNote.textContent = `Observations unavailable: ${result.code ?? 'unknown'}`;
    return;
  }
  if (result.note) {
    const note = el('p', container, 'note');
    note.textContent = result.note;
    return;
  }
  const hits = result.hits ?? [];
  if (!hits.length) {
    const note = el('p', container, 'note');
    note.textContent = 'No observations found.';
    return;
  }
  mountList(container, {
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

interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  summary: string;
  directory: string;
  observationCount: number;
  promptCount: number;
}

// Back navigation: each detail view records on entry where Back should return
// to. Flows are at most two levels deep (list → session → observation/prompt),
// so one mutable target is enough — no stack needed. 'list' means the tab list
// (or the active search results when a query is set).
type BackEntry = { restore: 'list' } | { restore: 'session'; sessionId: string };
let backTarget: BackEntry = { restore: 'list' };

function formatDuration(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

async function renderSessionsTab(container: HTMLElement): Promise<void> {
  if (!state) return;
  const seq = ++renderSeq;
  statusNote.textContent = '';
  const result = await callService<{ ok: boolean; code?: string; sessions?: Session[] }>('POST', '/v1/sessions', {
    contextId: state.contextId,
    project: state.project || undefined,
  });
  if (seq !== renderSeq) return;
  if (!result.ok) {
    statusNote.textContent = `Sessions unavailable: ${result.code ?? 'unknown'}`;
    return;
  }
  const sessions = result.sessions ?? [];
  if (!sessions.length) {
    const note = el('p', container, 'note');
    note.textContent = 'No sessions found.';
    return;
  }
  mountList(container, {
    items: sessions.map((s) => {
      const summaryFirstLine = s.summary.split('\n')[0].trim();
      const title = summaryFirstLine || `Session ${s.id.slice(-8)}`;
      const subtitle = s.summary && s.summary.split('\n').length > 1 ? s.summary.substring(0, 200) : undefined;
      const meta = s.startedAt
        ? `${new Date(s.startedAt).toLocaleDateString()} · ${s.observationCount} obs · ${s.promptCount} prompts`
        : '—';
      return {
        id: s.id,
        title,
        subtitle,
        meta,
        badge: s.endedAt === null ? { label: 'active', tone: 'success' } : undefined,
      };
    }),
    onSelect: (id) => void showSessionDetail(id),
  });
}

async function renderPromptsTab(container: HTMLElement): Promise<void> {
  if (!state) return;
  const seq = ++renderSeq;
  statusNote.textContent = '';
  const result = await callService<{ ok: boolean; code?: string; hits?: PromptHit[]; note?: string }>(
    'POST',
    '/v1/prompts',
    {
      contextId: state.contextId,
      project: state.project || undefined,
      limit,
    },
  );
  if (seq !== renderSeq) return;
  if (!result.ok) {
    statusNote.textContent = `Prompts unavailable: ${result.code ?? 'unknown'}`;
    return;
  }
  if (result.note) {
    const note = el('p', container, 'note');
    note.textContent = result.note;
    return;
  }
  const hits = result.hits ?? [];
  if (!hits.length) {
    const note = el('p', container, 'note');
    note.textContent = 'No prompts found.';
    return;
  }
  mountList(container, {
    items: hits.map((h) => ({
      id: String(h.id),
      title: h.preview.split('\n')[0] || `Prompt #${h.id}`,
      subtitle: h.preview,
      meta: h.createdAt,
    })),
    onSelect: (id) => {
      const hit = hits.find((h) => String(h.id) === id);
      if (hit) void showPromptDetail(hit);
    },
  });
}

function showPromptDetail(hit: PromptHit): void {
  if (!state || state.projectStatus !== 'resolved') return;
  renderSeq++;
  viewRoot.textContent = '';
  const back = el('div', viewRoot, 'actions');
  mountButton(back, {
    label: 'Back',
    variant: 'ghost',
    size: 'xs',
    onClick: () => {
      goBack();
    },
  });
  // Card: title = first line of content, badge, meta (Created, Project, Prompt #id, Session)
  const card = el('div', viewRoot, 'detail-card');
  const head = el('div', card, 'detail-head');
  const firstLine = (hit.content || '').split('\n')[0].trim();
  const titleText = firstLine || `Prompt #${hit.id}`;
  const h3 = el('h3', head, 'detail-title');
  h3.textContent = titleText;
  mountBadge(head, { label: 'prompt', tone: 'neutral' });
  const meta = el('div', card, 'detail-meta');
  const metaRows: Array<[string, string | HTMLElement]> = [
    ['Created', hit.createdAt ? new Date(hit.createdAt).toLocaleString() : '—'],
    ['Project', state.project || '—'],
    ['Prompt', `#${hit.id}`],
  ];
  if (hit.sessionId) {
    const sessionLink = el('a', meta, 'detail-meta-value');
    sessionLink.href = '#';
    sessionLink.textContent = `Session`;
    sessionLink.onclick = () => {
      backTarget = { restore: 'list' };
      void showSessionDetail(hit.sessionId!);
    };
    metaRows.push(['Session', sessionLink]);
  } else {
    metaRows.push(['Session', '—']);
  }
  for (const [key, value] of metaRows) {
    const k = el('span', meta, 'detail-meta-key');
    k.textContent = key;
    if (typeof value === 'string') {
      const v = el('span', meta, 'detail-meta-value');
      v.textContent = value;
    } else {
      (value as HTMLElement).className = 'detail-meta-value';
      meta.appendChild(value);
    }
  }
  // Divider below card, then section below for content
  const divider = el('hr', viewRoot, 'detail-divider');
  void divider;
  const section = el('div', viewRoot, 'section');
  const sectionHeading = el('h4', section, 'section-heading');
  sectionHeading.textContent = 'Prompt';
  const body = el('div', section);
  renderMarkdownInto(body, hit.content, (url) => void host.openUrl(url));
  const actions = el('div', viewRoot, 'actions');
  mountButton(actions, {
    label: 'Copy prompt',
    size: 'sm',
    onClick: () => {
      void host.writeClipboard(hit.content);
      setBadge('Copied', 'success');
      setTimeout(() => setBadge('Ready', 'success'), 1500);
    },
  });
  const detailState = state;
  mountButton(actions, {
    label: 'Insert into chat',
    size: 'sm',
    variant: 'secondary',
    onClick: () => {
      const text = `### ${hit.createdAt ?? `Prompt #${hit.id}`} (project: ${detailState?.project})\n${hit.content}`;
      void host
        .compose({ text, mode: 'append' })
        .then(() => setBadge('Inserted', 'success'))
        .catch(() => setBadge('Insert failed', 'error'));
    },
  });
}

async function showSessionDetail(sessionId: string): Promise<void> {
  if (!state || state.projectStatus !== 'resolved') return;
  const seq = ++renderSeq;
  viewRoot.textContent = '';
  backTarget = { restore: 'list' };
  currentTab = 'sessions';

  const back = el('div', viewRoot, 'actions');
  mountButton(back, {
    label: 'Back',
    variant: 'ghost',
    size: 'xs',
    onClick: () => {
      void goBack();
    },
  });

  const result = await callService<{
    ok: boolean;
    code?: string;
    session?: any;
    observations?: any[];
    prompts?: any[];
  }>('POST', '/v1/sessionDetail', {
    contextId: state.contextId,
    project: state.project,
    sessionId,
  });
  if (seq !== renderSeq) return;
  if (!result.ok) {
    statusNote.textContent = `Session detail failed: ${result.code ?? 'unknown'}`;
    return;
  }

  const session = result.session;
  const summaryFirstLine = (session?.summary || '').split('\n')[0].trim();
  const title = summaryFirstLine || `Session ${sessionId.slice(-8)}`;
  const started = session?.startedAt ? new Date(session.startedAt) : null;
  const ended = session?.endedAt ? new Date(session.endedAt) : null;

  // Session header card: title + state badge, meta grid, count tiles
  const card = el('div', viewRoot, 'detail-card');
  const head = el('div', card, 'detail-head');
  const h3 = el('h3', head, 'detail-title');
  h3.textContent = title;
  mountBadge(head, { label: ended ? 'ended' : 'active', tone: ended ? 'neutral' : 'success' });

  const meta = el('div', card, 'detail-meta');
  const metaRows: Array<[string, string]> = [
    ['Started', started ? started.toLocaleString() : '—'],
    ['Ended', ended ? ended.toLocaleString() : '—'],
    ['Duration', started ? formatDuration(started, ended ?? new Date()) : '—'],
    ['Project', session?.project || state.project || '—'],
    ['Directory', session?.directory || '—'],
  ];
  for (const [key, value] of metaRows) {
    const k = el('span', meta, 'detail-meta-key');
    k.textContent = key;
    const v = el('span', meta, 'detail-meta-value');
    v.textContent = value;
  }

  const counts = el('div', card, 'session-counts');
  const obsCount = el('div', counts, 'count-tile');
  const obsValue = el('span', obsCount, 'count-value');
  obsValue.textContent = String(result.observations?.length ?? 0);
  const obsLabel = el('span', obsCount, 'count-label');
  obsLabel.textContent = 'Observations';
  const promptCount = el('div', counts, 'count-tile');
  const promptValue = el('span', promptCount, 'count-value');
  promptValue.textContent = String(result.prompts?.length ?? 0);
  const promptLabel = el('span', promptCount, 'count-label');
  promptLabel.textContent = 'Prompts';

  // Summary section
  if (session?.summary) {
    const section = el('div', viewRoot, 'section');
    const heading = el('h4', section, 'section-heading');
    heading.textContent = 'Summary';
    const body = el('div', section);
    renderMarkdownInto(body, session.summary, (url) => void host.openUrl(url));
  }

  // Observations section
  {
    const section = el('div', viewRoot, 'section');
    const heading = el('h4', section, 'section-heading');
    heading.textContent = 'Observations';
    if (result.observations?.length) {
      mountList(section, {
        items: result.observations.map((o: any) => ({
          id: String(o.id),
          title: o.title,
          subtitle: o.preview,
          leading: o.type,
          meta: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '',
        })),
        onSelect: (id) => {
          backTarget = { restore: 'session', sessionId };
          void showDetail(Number(id));
        },
      });
    } else {
      const note = el('p', section, 'note');
      note.textContent = 'No observations in this session.';
    }
  }

  // Prompts section
  {
    const section = el('div', viewRoot, 'section');
    const heading = el('h4', section, 'section-heading');
    heading.textContent = 'Prompts';
    if (result.prompts?.length) {
      mountList(section, {
        items: result.prompts.map((p: any) => ({
          id: String(p.id),
          title: p.content.split('\n')[0] || `Prompt #${p.id}`,
          subtitle: p.content,
          meta: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
        })),
        onSelect: (id) => {
          const p = result.prompts?.find((pp: any) => String(pp.id) === id);
          if (p) {
            backTarget = { restore: 'session', sessionId };
            void showPromptDetail(p);
          }
        },
      });
    } else {
      const note = el('p', section, 'note');
      note.textContent = 'No prompts in this session.';
    }
  }
}

function goBack(): void {
  const target = backTarget;
  backTarget = { restore: 'list' };
  viewRoot.textContent = '';
  if (target.restore === 'session') {
    void showSessionDetail(target.sessionId);
  } else if (query.trim()) {
    void doSearch();
  } else {
    void renderRecent();
  }
}

async function doSearch(): Promise<void> {
  if (!state) return;
  if (state.projectStatus !== 'resolved') {
    renderProjectGate();
    return;
  }
  if (!query.trim()) {
    void renderRecent();
    return;
  }
  const seq = ++renderSeq;
  backTarget = { restore: 'list' };
  viewRoot.textContent = '';
  const result = await callService<{ ok: boolean; code?: string; hits?: SearchHit[]; note?: string }>(
    'POST',
    '/v1/search',
    {
      contextId: state.contextId,
      query,
      broad,
      limit,
      project: state.project || undefined,
    },
  );
  if (seq !== renderSeq) return;
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
  if (!state || state.projectStatus !== 'resolved') return;
  const seq = ++renderSeq;
  viewRoot.textContent = '';
  const back = el('div', viewRoot, 'actions');
  mountButton(back, {
    label: 'Back',
    variant: 'ghost',
    size: 'xs',
    onClick: () => {
      goBack();
    },
  });
  const result = await callService<{
    ok: boolean;
    code?: string;
    title?: string;
    type?: string;
    createdAt?: string | null;
    sessionId?: string | null;
    scope?: string | null;
    topic?: string | null;
    markdown?: string;
  }>('POST', '/v1/getMemory', { contextId: state.contextId, id, project: state.project || undefined });
  if (seq !== renderSeq) return;
  if (!result.ok) {
    statusNote.textContent = `Detail failed: ${result.code ?? 'unknown'}`;
    return;
  }
  // Card: title, badge (observation type), meta rows (Created, Project, Memory #id, Session), matching session/prompt detail pages
  const card = el('div', viewRoot, 'detail-card');
  const head = el('div', card, 'detail-head');
  const h3 = el('h3', head, 'detail-title');
  h3.textContent = result.title || `Memory #${id}`;
  mountBadge(head, { label: result.type || 'observation', tone: 'neutral' });
  const meta = el('div', card, 'detail-meta');
  const metaRows: Array<[string, string | HTMLElement]> = [
    ['Created', result.createdAt ? new Date(result.createdAt).toLocaleString() : '—'],
    ['Project', state.project || '—'],
    ['Memory', `#${id}`],
  ];
  if (result.sessionId) {
    const sessionLink = el('a', meta, 'detail-meta-value');
    sessionLink.href = '#';
    sessionLink.textContent = 'Session';
    sessionLink.onclick = () => {
      backTarget = { restore: 'list' };
      void showSessionDetail(result.sessionId!);
    };
    metaRows.push(['Session', sessionLink]);
  } else {
    metaRows.push(['Session', '—']);
  }
  for (const [key, value] of metaRows) {
    const k = el('span', meta, 'detail-meta-key');
    k.textContent = key;
    if (typeof value === 'string') {
      const v = el('span', meta, 'detail-meta-value');
      v.textContent = value;
    } else {
      (value as HTMLElement).className = 'detail-meta-value';
      meta.appendChild(value);
    }
  }
  // Divider below card, then section below for content (matches prompt detail page)
  const divider = el('hr', viewRoot, 'detail-divider');
  void divider;
  const section = el('div', viewRoot, 'section');
  const sectionHeading = el('h4', section, 'section-heading');
  sectionHeading.textContent = 'Observation';
  const body = el('div', section);
  renderMarkdownInto(body, result.markdown ?? '', (url) => void host.openUrl(url));
  const actions = el('div', viewRoot, 'actions');
  mountButton(actions, {
    label: 'Copy Markdown',
    size: 'sm',
    onClick: () => {
      void host.writeClipboard(result.markdown ?? '');
      setBadge('Copied', 'success');
      setTimeout(() => setBadge('Ready', 'success'), 1500);
    },
  });
  const detailState = state;
  mountButton(actions, {
    label: 'Insert into chat',
    size: 'sm',
    variant: 'secondary',
    onClick: () => {
      const text = `## ${result.title ?? `Memory #${id}`} (project: ${detailState?.project})\n${result.markdown ?? ''}`;
      void host
        .compose({ text, mode: 'append' })
        .then(() => setBadge('Inserted', 'success'))
        .catch(() => setBadge('Insert failed', 'error'));
    },
  });
}

function renderSetup(): void {
  if (!viewRoot) return;
  renderSeq++;
  mountSeparator(viewRoot);
  const heading = el('h3', viewRoot);
  heading.textContent = 'Engram setup';
  const note = el('p', viewRoot, 'note');
  note.textContent = 'Open the extension settings to change the executable, data directory, and project mapping.';
}

function projectLabel(source: string): string {
  switch (source) {
    case 'process_override':
    case 'explicit_override':
      return 'explicit override';
    case 'git_remote':
      return 'detected via git remote';
    case 'dir_basename':
      return 'detected from directory name';
    case 'session':
      return 'from session';
    case 'ambiguous':
      return 'needs a choice';
    case 'all_projects':
      return 'all projects';
    case '':
      return 'undetected';
    default:
      return source;
  }
}

function renderProjectLine(container: HTMLElement): void {
  if (!state || !state.project) return;
  const line = el('div', container, 'project-line');
  const label = el('span', line, 'project-label');
  label.textContent = `Project: ${state.project}`;
}

function renderProjectGate(): void {
  if (!state) return;
  renderSeq++;
  viewRoot.textContent = '';
  const heading = el('h3', viewRoot);
  heading.textContent = state.projectStatus === 'ambiguous' ? 'Choose a project' : 'Project not detected';
  const note = el('p', viewRoot, 'note');
  note.textContent =
    state.errorHint ||
    (state.projectStatus === 'ambiguous'
      ? 'Engram matched more than one project for this workspace. Pick the one to browse.'
      : 'Engram could not detect a project for this workspace. Pick one to browse.');
  if (state.projectPath) {
    const path = el('p', viewRoot, 'note');
    path.textContent = `Detected path: ${state.projectPath}`;
  }
  const candidates = state.candidates;
  if (!candidates.length) {
    const hint = el('p', viewRoot, 'note');
    hint.textContent = 'No projects are known to Engram yet. Open the extension settings to set a project mapping.';
    return;
  }
  const row = el('div', viewRoot, 'project-pick');
  let chosen = config.projectOverride && candidates.includes(config.projectOverride) ? config.projectOverride : '';
  mountSelect(row, {
    value: chosen || null,
    placeholder: 'Select a project…',
    searchable: candidates.length > 8,
    options: candidates.map((name) => ({ id: name, label: name })),
    onChange: (id) => {
      chosen = id;
    },
  });
  mountButton(row, {
    label: 'Use project',
    size: 'sm',
    onClick: () => {
      if (chosen) void applyProjectOverride(chosen);
      else statusNote.textContent = 'Pick a project first.';
    },
  });
}

async function applyProjectOverride(name: string | null): Promise<void> {
  config = { ...config, projectOverride: name };
  try {
    await host.storage.set(STORAGE_KEY, config as unknown as JsonValue);
  } catch {
    // Persisting is best-effort; the in-memory config still applies for this session.
  }
  await connect();
}

const searchFieldWrap = el('label', toolbarMain, 'oc-sdk oc-sdk-field');
const searchCaption = el('span', searchFieldWrap, 'oc-sdk-field-label');
searchCaption.textContent = 'Search memories';
const searchField = mountSearchField(searchFieldWrap, {
  value: '',
  placeholder: 'Search memories…',
  label: 'Search memories',
  autofocus: false,
  onChange: (value) => {
    query = value;
    void doSearch();
  },
});

const modeSelect = mountSelect(toolbarMain, {
  label: 'Match',
  value: broad ? 'any' : 'all',
  options: [
    { id: 'any', label: 'Broader', hint: 'Any keyword matches' },
    { id: 'all', label: 'Strict', hint: 'Every keyword matches' },
  ],
  onChange: (value) => {
    broad = value === 'any';
    void doSearch();
  },
});

const limitSelect = mountSelect(toolbarMain, {
  label: 'Limit',
  value: String(limit),
  options: [
    { id: '10', label: '10' },
    { id: '20', label: '20' },
  ],
  onChange: (value) => {
    limit = Number(value);
    void doSearch();
  },
});

const titleStatus = el('div', titleCol, 'title-status');
const badge = mountBadge(titleStatus, { label: 'Initializing', tone: 'neutral' });
const setBadge = (label: string, tone: Tone): void => badge.update({ label, tone });

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  void host.storage
    .get(STORAGE_KEY)
    .then((stored) => {
      if (stored && typeof stored === 'object') config = stored as Config;
    })
    .finally(() => {
      void connect();
    });
  if (context.directory !== undefined) directory = context.directory ?? null;

  // Mobile/Phone support: log device info and adjust layout if needed
  // `ready.device` is available in OpenChamber >= 2.7.1
  // - formFactor: 'phone' | 'tablet' | 'desktop'
  // - pointer: 'coarse' (touch) | 'fine' (mouse)
  // - insets: { top, right, bottom, left } in px (safe area)
  // - keyboard: px of keyboard height (0 when closed)
  if (context.device) {
    console.log('OpenChamber device context:', {
      formFactor: context.device.formFactor,
      pointer: context.device.pointer,
      insets: context.device.insets,
      keyboard: context.device.keyboard,
    });
  }
});

host.onDirectory((dir) => {
  directory = dir;
  void connect();
});
