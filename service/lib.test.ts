import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  ALLOWED_TOOLS,
  contextId,
  ENGRAM_FLOOR_LABEL,
  meetsFloor,
  observationFacts,
  ownershipMismatch,
  parseEnvelope,
  parseVersion,
  projectOfDetail,
  projectStatusFor,
  selectStatsTarget,
  sortByCreatedAtDesc,
  spawnKey,
} from './lib';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/v2.0.0/captured-responses.json', import.meta.url), 'utf8'),
) as {
  search: { text: string };
  get_observation: { text: string };
  context: { text: string };
  list_projects: { text: string };
};

describe('version floor (ADR-0013)', () => {
  test('parses the major/minor pair out of `engram --version` output', () => {
    expect(parseVersion('engram 3.4.0')).toEqual([3, 4]);
    expect(parseVersion('engram 2.0.0\n')).toEqual([2, 0]);
    expect(parseVersion('engram 10.20.30')).toEqual([10, 20]);
  });

  test('returns null for anything that is not a full version', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('not a version')).toBeNull();
    expect(parseVersion('engram 3')).toBeNull();
    expect(parseVersion('engram 3.4')).toBeNull();
  });

  test('accepts only >= 3.4', () => {
    expect(meetsFloor(null)).toBe(false);
    expect(meetsFloor([0, 0])).toBe(false);
    expect(meetsFloor([2, 9])).toBe(false);
    expect(meetsFloor([3, 3])).toBe(false);
    expect(meetsFloor([3, 4])).toBe(true);
    expect(meetsFloor([3, 9])).toBe(true);
    expect(meetsFloor([4, 0])).toBe(true);
    expect(ENGRAM_FLOOR_LABEL).toBe('3.4.0');
  });
});

describe('read-only allowlist (ADR-0004)', () => {
  test('contains exactly the read tools', () => {
    expect([...ALLOWED_TOOLS].sort()).toEqual(
      [
        'mem_context',
        'mem_current_project',
        'mem_get_observation',
        'mem_list_projects',
        'mem_search',
        'mem_search_prompts',
        'mem_stats',
      ].sort(),
    );
  });
});

describe('context identity (ADR-0007)', () => {
  test('is a stable 16-char hex id derived from directory and config', () => {
    const id = contextId('/work/a', '{"executable":"engram"}');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(contextId('/work/a', '{"executable":"engram"}')).toBe(id);
  });

  test('changes when the directory or the spawn config changes', () => {
    const base = contextId('/work/a', 'cfg');
    expect(contextId('/work/b', 'cfg')).not.toBe(base);
    expect(contextId('/work/a', 'other')).not.toBe(base);
  });
});

describe('spawnKey', () => {
  test('defaults every field', () => {
    expect(JSON.parse(spawnKey({}))).toEqual({ executable: 'engram', dataDir: null, projectOverride: null });
  });

  test('keeps dataDir and projectOverride even when an executable is set (regression)', () => {
    const key = JSON.parse(spawnKey({ executable: '/opt/engram', dataDir: '/data', projectOverride: 'proj' }));
    expect(key).toEqual({ executable: '/opt/engram', dataDir: '/data', projectOverride: 'proj' });
    expect(spawnKey({ executable: '/opt/engram' })).not.toBe(
      spawnKey({ executable: '/opt/engram', dataDir: '/data', projectOverride: 'proj' }),
    );
  });
});

describe('parseEnvelope', () => {
  test('unwraps a JSON envelope and exposes its `result`', () => {
    expect(parseEnvelope('{"result":"hello"}')).toEqual({ envelope: { result: 'hello' }, parsed: 'hello' });
  });

  test('falls back to the raw text when there is no envelope', () => {
    expect(parseEnvelope('plain text')).toEqual({ parsed: 'plain text' });
    expect(parseEnvelope('{not json')).toEqual({ parsed: '{not json' });
  });

  test('treats JSON primitives and null as non-envelopes', () => {
    expect(parseEnvelope('42')).toEqual({ parsed: '42' });
    expect(parseEnvelope('null')).toEqual({ parsed: 'null' });
  });

  test('an object without `result` yields an empty parsed string', () => {
    expect(parseEnvelope('{"count":3}')).toEqual({ envelope: { count: 3 }, parsed: '' });
  });
});

describe('projectOfDetail (ADR-0005)', () => {
  test('reads the first `Project: ` line', () => {
    expect(projectOfDetail('a\nProject: foo\nProject: bar')).toBe('foo');
    expect(projectOfDetail('Project: foo')).toBe('foo');
  });

  test('requires the space after the colon', () => {
    expect(projectOfDetail('Project:foo')).toBeNull();
    expect(projectOfDetail('nothing here')).toBeNull();
  });
});

describe('ownershipMismatch (ADR-0005)', () => {
  test('flags only a real, differing ownership line', () => {
    expect(ownershipMismatch('mine', 'other')).toBe(true);
    expect(ownershipMismatch('mine', 'mine')).toBe(false);
    expect(ownershipMismatch(null, 'other')).toBe(false);
    expect(ownershipMismatch(undefined, 'other')).toBe(false);
    expect(ownershipMismatch('mine', null)).toBe(false);
  });
});

describe('observationFacts', () => {
  test('splits header, body, and the trailing bookkeeping block', () => {
    const text = [
      '#7 [pattern] My title',
      'Body line 1',
      'Body line 2',
      'Session: s-1',
      'Project: p',
      'Scope: project',
      'Created: 2026-01-01 00:00:00',
    ].join('\n');
    expect(observationFacts(text)).toEqual({
      title: 'My title',
      type: 'pattern',
      createdAt: '2026-01-01 00:00:00',
      sessionId: 's-1',
      scope: 'project',
      topic: null,
      body: 'Body line 1\nBody line 2',
    });
  });

  test('handles a header without a type and no metadata', () => {
    expect(observationFacts('#9 Title only\nbody')).toEqual({
      title: 'Title only',
      type: '',
      createdAt: null,
      sessionId: null,
      scope: null,
      topic: null,
      body: 'body',
    });
  });

  test('tolerates blank lines around the metadata block', () => {
    const facts = observationFacts('#2 [decision] T\nB\n\nProject: p\n\n');
    expect(facts.body).toBe('B');
    expect(facts.title).toBe('T');
    expect(facts.type).toBe('decision');
  });

  test('treats text without a header as body', () => {
    const facts = observationFacts('just body');
    expect(facts.title).toBe('');
    expect(facts.type).toBe('');
    expect(facts.body).toBe('just body');
  });
});

describe('sortByCreatedAtDesc', () => {
  test('orders newest first without mutating the input', () => {
    const rows = [{ id: 1, created_at: '2020-01-01' }, { id: 2, created_at: '2021-01-01' }, { id: 3 }];
    expect(sortByCreatedAtDesc(rows).map((r) => r.id)).toEqual([2, 1, 3]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('projectStatusFor', () => {
  test('resolves, flags ambiguity, or reports unknown', () => {
    expect(projectStatusFor('fixture-proj', 'explicit_override', [])).toBe('resolved');
    expect(projectStatusFor('p', '', ['a'])).toBe('resolved');
    expect(projectStatusFor('', 'ambiguous', ['a'])).toBe('ambiguous');
    expect(projectStatusFor('p', 'ambiguous', [])).toBe('unknown');
    expect(projectStatusFor('', '', [])).toBe('unknown');
  });
});

describe('selectStatsTarget', () => {
  const projects = [{ name: 'fixture-proj', observation_count: 3, session_count: 1, prompt_count: 0, directories: [] }];

  test('matches the project name case-insensitively', () => {
    expect(selectStatsTarget(projects, 'FIXTURE-PROJ')?.name).toBe('fixture-proj');
  });

  test('falls back to the first project, or null when there is none', () => {
    expect(selectStatsTarget(projects)?.name).toBe('fixture-proj');
    expect(selectStatsTarget(projects, 'missing')).toBeNull();
    expect(selectStatsTarget([])).toBeNull();
  });
});

describe('captured Engram 2.0.0 fixtures', () => {
  test('the observation fixture round-trips through envelope, ownership, and facts', () => {
    const { parsed } = parseEnvelope(fixture.get_observation.text);
    expect(projectOfDetail(parsed)).toBe('fixture-proj');
    expect(observationFacts(parsed)).toEqual({
      title: 'Fixture: JWT auth middleware decision',
      type: 'decision',
      createdAt: '2026-09-20 09:09:27',
      sessionId: 'manual-save-fixture-proj',
      scope: 'project',
      topic: null,
      body: 'Switched from sessions to JWT, set httpOnly+secure cookies',
    });
  });

  test('reading ownership off the raw envelope never matches (the original bug)', () => {
    expect(projectOfDetail(fixture.get_observation.text)).toBeNull();
  });

  test('a different bound project is a mismatch', () => {
    const { parsed } = parseEnvelope(fixture.get_observation.text);
    expect(ownershipMismatch('some-other-project', projectOfDetail(parsed))).toBe(true);
    expect(ownershipMismatch('fixture-proj', projectOfDetail(parsed))).toBe(false);
  });

  test('the search fixture exposes its results through the envelope', () => {
    const { envelope, parsed } = parseEnvelope(fixture.search.text);
    expect(parsed).toBe('Found 3 memories.');
    const results = envelope?.results;
    expect(Array.isArray(results)).toBe(true);
    expect((results as unknown[]).length).toBe(3);
  });

  test('the list_projects fixture drives the stats target', () => {
    const parsed = JSON.parse(fixture.list_projects.text) as {
      projects: {
        name: string;
        observation_count: number;
        session_count: number;
        prompt_count: number;
        directories: string[];
      }[];
    };
    const target = selectStatsTarget(parsed.projects, 'fixture-proj');
    expect(target?.name).toBe('fixture-proj');
    expect(target?.observation_count).toBe(3);
    expect(target?.session_count).toBe(1);
  });
});
