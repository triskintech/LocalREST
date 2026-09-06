import { describe, expect, it } from 'vitest';
import { migrate, seedData } from './schema';
import { HISTORY_LIMIT, SCHEMA_VERSION } from '../types';

describe('migrate', () => {
  it('seeds a first run', () => {
    const data = migrate(undefined);
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0]?.name).toBe('Examples');
    expect(data.collections[0]?.requests).toHaveLength(3);
  });

  it('seeds when the stored value is not an object', () => {
    expect(migrate('garbage').collections[0]?.name).toBe('Examples');
    expect(migrate(42).collections).toHaveLength(1);
  });

  it('round-trips its own seed data unchanged', () => {
    const seeded = seedData();
    const round = migrate(JSON.parse(JSON.stringify(seeded)));
    expect(round).toEqual(seeded);
  });

  it('keeps an empty workspace empty rather than re-seeding it', () => {
    // Deleting the last collection must not resurrect the examples on reload.
    const data = migrate({ schemaVersion: SCHEMA_VERSION, collections: [] });
    expect(data.collections).toEqual([]);
  });

  it('repairs partial requests instead of dropping them', () => {
    const data = migrate({
      collections: [{ name: 'Mine', requests: [{ url: 'https://x.test' }] }],
    });
    const req = data.collections[0]?.requests[0];
    expect(req?.method).toBe('GET');
    // Unnamed is a real state now, not something to paper over with a label:
    // it is what makes the row render as the request's own URL.
    expect(req?.name).toBe('');
    expect(req?.id).toBeTruthy();
    expect(req?.params).toEqual([]);
    expect(req?.body.mode).toBe('none');
    expect(req?.auth.type).toBe('none');
  });

  it('normalises an unknown method to GET', () => {
    const data = migrate({ collections: [{ requests: [{ method: 'FETCH' }] }] });
    expect(data.collections[0]?.requests[0]?.method).toBe('GET');
  });

  it('upper-cases a lowercase method', () => {
    const data = migrate({ collections: [{ requests: [{ method: 'post' }] }] });
    expect(data.collections[0]?.requests[0]?.method).toBe('POST');
  });

  it('keeps a body on a bodyless method instead of destroying it', () => {
    // It used to be normalised away on every read. buildRequest already
    // declines to send a body on a GET, so the only thing that achieved was
    // deleting a hand-typed payload the moment someone flipped a saved POST to
    // GET to try something — with the editor hiding the loss behind "this
    // method does not send a body".
    const data = migrate({
      collections: [
        { requests: [{ method: 'GET', body: { mode: 'json', raw: '{"carefully":"typed"}' } }] },
      ],
    });
    expect(data.collections[0]?.requests[0]?.body.mode).toBe('json');
    expect(data.collections[0]?.requests[0]?.body.raw).toBe('{"carefully":"typed"}');
  });

  it('defaults an enabled flag to true but respects an explicit false', () => {
    const data = migrate({
      collections: [
        { requests: [{ headers: [{ key: 'A' }, { key: 'B', enabled: false }] }] },
      ],
    });
    const headers = data.collections[0]?.requests[0]?.headers;
    expect(headers?.[0]?.enabled).toBe(true);
    expect(headers?.[1]?.enabled).toBe(false);
  });

  it('clears an active environment id that no longer resolves', () => {
    const data = migrate({ environments: [], activeEnvironmentId: 'gone' });
    expect(data.activeEnvironmentId).toBeNull();
  });

  it('keeps an active environment id that still resolves', () => {
    const data = migrate({
      environments: [{ id: 'e1', name: 'Local', variables: [] }],
      activeEnvironmentId: 'e1',
    });
    expect(data.activeEnvironmentId).toBe('e1');
  });

  it('caps history at the limit', () => {
    const history = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => ({
      id: `h${i}`,
      method: 'GET',
      url: 'https://x.test',
    }));
    expect(migrate({ history }).history).toHaveLength(HISTORY_LIMIT);
  });

  it('rebuilds a history entry from its snapshot when the summary is missing', () => {
    const data = migrate({
      history: [{ snapshot: { method: 'DELETE', url: 'https://x.test/1' } }],
    });
    expect(data.history[0]?.method).toBe('DELETE');
    expect(data.history[0]?.url).toBe('https://x.test/1');
  });

  it('always reports the current schema version', () => {
    expect(migrate({ schemaVersion: 0 }).schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrate — open tabs', () => {
  const withRequest = (requestId: string) => ({
    collections: [{ id: 'c1', name: 'C', requests: [{ id: requestId, url: 'https://x.test' }] }],
  });

  it('defaults to no tabs when the stored data predates them', () => {
    expect(migrate(withRequest('r1')).tabs).toEqual([]);
    expect(migrate(withRequest('r1')).activeTabId).toBeNull();
  });

  it('keeps a tab pointing at a request that still exists', () => {
    const data = migrate({
      ...withRequest('r1'),
      tabs: [{ id: 't1', requestId: 'r1' }],
      activeTabId: 't1',
    });
    expect(data.tabs).toEqual([{ id: 't1', requestId: 'r1', draft: null }]);
    expect(data.activeTabId).toBe('t1');
  });

  it('drops a tab whose request was deleted', () => {
    // Otherwise the tab renders blank forever with no way to tell why.
    const data = migrate({
      ...withRequest('r1'),
      tabs: [{ id: 't1', requestId: 'gone' }],
      activeTabId: 't1',
    });
    expect(data.tabs).toEqual([]);
    expect(data.activeTabId).toBeNull();
  });

  it('keeps a draft tab and repairs its request', () => {
    const data = migrate({
      tabs: [{ id: 't1', requestId: '', draft: { url: 'https://x.test', method: 'post' } }],
      activeTabId: 't1',
    });
    expect(data.tabs[0]?.requestId).toBeNull();
    expect(data.tabs[0]?.draft?.method).toBe('POST');
  });

  it('drops a draft tab carrying no draft', () => {
    expect(migrate({ tabs: [{ id: 't1', requestId: '' }] }).tabs).toEqual([]);
  });

  it('falls back to the first tab when the active id no longer resolves', () => {
    const data = migrate({
      ...withRequest('r1'),
      tabs: [{ id: 't1', requestId: 'r1' }],
      activeTabId: 'gone',
    });
    expect(data.activeTabId).toBe('t1');
  });
});

describe('migrate — theme', () => {
  it('defaults to following the system', () => {
    expect(migrate({}).theme).toBe('system');
  });

  it.each(['light', 'dark'] as const)('keeps an explicit %s', (theme) => {
    expect(migrate({ theme }).theme).toBe(theme);
  });

  // A backup hand-edited to "Dark" or an older build that stored a boolean
  // must not leave the app with an unmatchable [data-theme] and no styling.
  it.each([['DARK'], ['solarized'], [true], [null], [{}]])(
    'falls back to system for %o',
    (theme) => {
      expect(migrate({ theme }).theme).toBe('system');
    },
  );
});

describe('migrate — request names', () => {
  const nameOf = (name: unknown) =>
    migrate({ collections: [{ requests: [{ name, url: 'https://x.test' }] }] })
      .collections[0]?.requests[0]?.name;

  it('keeps a name the user chose', () => {
    expect(nameOf('Create order')).toBe('Create order');
  });

  it('trims stored padding so it cannot masquerade as a name', () => {
    expect(nameOf('  Create order  ')).toBe('Create order');
    expect(nameOf('   ')).toBe('');
  });

  // These two were generated by older builds, never chosen by anyone, and read
  // as noise once the sidebar can show the URL instead.
  it.each(['New request', 'Untitled request'])('retires the placeholder %o', (name) => {
    expect(nameOf(name)).toBe('');
  });

  it('does not retire a name that merely contains a placeholder', () => {
    expect(nameOf('New request handler')).toBe('New request handler');
  });
});

describe('resolveCurlVariables', () => {
  it('defaults on for a store written before the setting existed', () => {
    expect(migrate({ collections: [] }).resolveCurlVariables).toBe(true);
  });

  it('keeps an explicit opt-out', () => {
    expect(migrate({ collections: [], resolveCurlVariables: false }).resolveCurlVariables).toBe(
      false,
    );
  });

  it('ignores a value that is not a boolean', () => {
    expect(migrate({ collections: [], resolveCurlVariables: 'yes' }).resolveCurlVariables).toBe(
      true,
    );
  });
});
