import { describe, expect, it } from 'vitest';
import { activeRequest, activeTab, initialState, reducer, type State } from './store';
import { emptyData } from '../../lib/storage/schema';
import { HISTORY_LIMIT, newRequest, type ApiRequest, type Collection } from '../../lib/types';

const request = (id: string, name: string): ApiRequest =>
  newRequest(id, { name, url: `https://api.test/${id}` });

const collection = (id: string, name: string, requests: ApiRequest[]): Collection => ({
  id,
  name,
  expanded: true,
  requests,
});

/** A loaded workspace with one collection, its first request open in a tab. */
function loaded(collections: Collection[] = [collection('c1', 'Imported', [request('r1', 'One')])]) {
  return reducer(initialState(), {
    type: 'loaded',
    data: { ...emptyData(), collections },
  });
}

const collectionNames = (state: State) => state.data.collections.map((c) => c.name);
const requestNames = (state: State, collectionName: string) =>
  state.data.collections.find((c) => c.name === collectionName)?.requests.map((r) => r.name);

describe('saveRequest — from a draft', () => {
  const withDraft = () => {
    const base = loaded();
    const drafted = reducer(base, { type: 'newTab' });
    return reducer(drafted, {
      type: 'editActive',
      patch: { url: 'https://api.test/new' },
    });
  };

  it('creates a new collection and puts the request in it', () => {
    const next = reducer(withDraft(), {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'My API',
      name: 'Created',
    });
    expect(collectionNames(next)).toContain('My API');
    expect(requestNames(next, 'My API')).toEqual(['Created']);
  });

  it('turns the draft tab into a saved tab', () => {
    const next = reducer(withDraft(), {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'My API',
      name: 'Created',
    });
    const tab = activeTab(next);
    expect(tab?.requestId).toBeTruthy();
    expect(tab?.draft).toBeNull();
    expect(activeRequest(next).name).toBe('Created');
  });

  it('adds to an existing collection when one is chosen', () => {
    const next = reducer(withDraft(), {
      type: 'saveRequest',
      collectionId: 'c1',
      collectionName: '',
      name: 'Second',
    });
    expect(requestNames(next, 'Imported')).toEqual(['One', 'Second']);
    expect(next.data.collections).toHaveLength(1);
  });

  it('keeps what was typed into the draft', () => {
    const next = reducer(withDraft(), {
      type: 'saveRequest',
      collectionId: 'c1',
      collectionName: '',
      name: 'Second',
    });
    expect(activeRequest(next).url).toBe('https://api.test/new');
  });
});

describe('saveRequest — from a request already in a collection', () => {
  // Regression: this silently closed the dialog and did nothing, because it
  // only ever looked at tab.draft, which is null once a tab is saved.
  it('creates a new collection and moves the request into it', () => {
    const next = reducer(loaded(), {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'Trips',
      name: 'One',
    });
    expect(collectionNames(next)).toContain('Trips');
    expect(requestNames(next, 'Trips')).toEqual(['One']);
    expect(requestNames(next, 'Imported')).toEqual([]);
  });

  it('renames in place when the collection is unchanged', () => {
    const next = reducer(loaded(), {
      type: 'saveRequest',
      collectionId: 'c1',
      collectionName: '',
      name: 'Renamed',
    });
    expect(requestNames(next, 'Imported')).toEqual(['Renamed']);
    expect(next.data.collections).toHaveLength(1);
  });

  it('does not duplicate the request when moving', () => {
    const next = reducer(loaded(), {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'Trips',
      name: 'One',
    });
    const total = next.data.collections.reduce((n, c) => n + c.requests.length, 0);
    expect(total).toBe(1);
  });

  it('keeps the request id, so open tabs still resolve', () => {
    const before = loaded();
    const id = activeTab(before)?.requestId;
    const next = reducer(before, {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'Trips',
      name: 'One',
    });
    expect(activeTab(next)?.requestId).toBe(id);
    expect(activeRequest(next).name).toBe('One');
  });

  it('moves between two existing collections', () => {
    const base = loaded([
      collection('c1', 'Imported', [request('r1', 'One')]),
      collection('c2', 'Keep', []),
    ]);
    const next = reducer(base, {
      type: 'saveRequest',
      collectionId: 'c2',
      collectionName: '',
      name: 'One',
    });
    expect(requestNames(next, 'Imported')).toEqual([]);
    expect(requestNames(next, 'Keep')).toEqual(['One']);
  });

  it('reports where it landed', () => {
    const next = reducer(loaded(), {
      type: 'saveRequest',
      collectionId: null,
      collectionName: 'Trips',
      name: 'One',
    });
    expect(next.toast).toContain('Trips');
    expect(next.dialog).toBeNull();
  });
});

describe('saveRequest — position', () => {
  it('keeps a renamed request where it was instead of moving it to the bottom', () => {
    // Save stripped and re-appended unconditionally, so correcting the name of
    // the first request in a collection shuffled it to the end.
    let state = initialState();
    state = reducer(state, {
      type: 'loaded',
      data: {
        ...emptyData(),
        collections: [
          {
            id: 'c1',
            name: 'Mine',
            expanded: true,
            requests: [
              newRequest('r1', { name: 'first', url: 'https://x.test/1' }),
              newRequest('r2', { name: 'second', url: 'https://x.test/2' }),
              newRequest('r3', { name: 'third', url: 'https://x.test/3' }),
            ],
          },
        ],
        tabs: [{ id: 't1', requestId: 'r1', draft: null }],
        activeTabId: 't1',
      },
    });

    state = reducer(state, {
      type: 'saveRequest',
      collectionId: 'c1',
      collectionName: '',
      name: 'first, renamed',
    });

    expect(state.data.collections[0]?.requests.map((r) => r.name)).toEqual([
      'first, renamed',
      'second',
      'third',
    ]);
  });

  it('still moves a request that was saved into a different collection', () => {
    let state = initialState();
    state = reducer(state, {
      type: 'loaded',
      data: {
        ...emptyData(),
        collections: [
          { id: 'c1', name: 'From', expanded: true, requests: [newRequest('r1', { name: 'x' })] },
          { id: 'c2', name: 'To', expanded: true, requests: [newRequest('r2', { name: 'y' })] },
        ],
        tabs: [{ id: 't1', requestId: 'r1', draft: null }],
        activeTabId: 't1',
      },
    });

    state = reducer(state, {
      type: 'saveRequest',
      collectionId: 'c2',
      collectionName: '',
      name: 'x',
    });

    expect(state.data.collections[0]?.requests).toHaveLength(0);
    expect(state.data.collections[1]?.requests.map((r) => r.name)).toEqual(['y', 'x']);
  });
});

// ── tab lifecycle ───────────────────────────────────────────────────────────
// The builder always renders whatever the active tab points at, so every path
// that removes a tab or a request has to leave a resolvable active tab behind.
// A blank builder is the failure mode these guard against.

const tabIds = (state: State) => state.data.tabs.map((t) => t.id);

/** Two requests in one collection, both open, the second one active. */
function twoOpenTabs() {
  const base = loaded([
    collection('c1', 'Imported', [request('r1', 'One'), request('r2', 'Two')]),
  ]);
  return reducer(base, { type: 'openRequest', id: 'r2' });
}

describe('tabs', () => {
  it('focuses the tab already showing a request rather than opening a second one', () => {
    const state = reducer(twoOpenTabs(), { type: 'openRequest', id: 'r1' });
    expect(state.data.tabs).toHaveLength(2);
    expect(activeRequest(state).id).toBe('r1');
  });

  it('closing the active tab lands on its neighbour', () => {
    const state = twoOpenTabs();
    const closed = reducer(state, { type: 'closeTab', id: state.data.activeTabId as string });
    expect(closed.data.tabs).toHaveLength(1);
    expect(activeRequest(closed).id).toBe('r1');
  });

  it('closing an inactive tab leaves the active one alone', () => {
    const state = twoOpenTabs();
    const [first] = tabIds(state);
    const closed = reducer(state, { type: 'closeTab', id: first as string });
    expect(closed.data.activeTabId).toBe(state.data.activeTabId);
    expect(activeRequest(closed).id).toBe('r2');
  });

  it('closing the last tab opens a blank draft rather than leaving nothing', () => {
    const state = loaded();
    const closed = reducer(state, { type: 'closeTab', id: state.data.activeTabId as string });
    expect(closed.data.tabs).toHaveLength(1);
    expect(closed.data.tabs[0]?.requestId).toBeNull();
    expect(closed.data.activeTabId).toBe(closed.data.tabs[0]?.id);
    expect(activeRequest(closed).url).toBe('');
  });

  it('ignores a close for a tab that is not open', () => {
    const state = twoOpenTabs();
    expect(reducer(state, { type: 'closeTab', id: 'nope' })).toBe(state);
  });

  it('reorders tabs', () => {
    const state = twoOpenTabs();
    const [first, second] = tabIds(state);
    const moved = reducer(state, { type: 'moveTab', from: 0, to: 1 });
    expect(tabIds(moved)).toEqual([second, first]);
    // Reordering must not change which tab is in view.
    expect(moved.data.activeTabId).toBe(state.data.activeTabId);
  });

  it('ignores a move from an index that does not exist', () => {
    const state = twoOpenTabs();
    expect(reducer(state, { type: 'moveTab', from: 5, to: 0 })).toBe(state);
  });

  it('edits the draft of a draft tab without touching the collection', () => {
    const state = reducer(twoOpenTabs(), { type: 'newTab' });
    const edited = reducer(state, { type: 'editActive', patch: { url: 'https://x.test/new' } });
    expect(activeRequest(edited).url).toBe('https://x.test/new');
    expect(edited.data.collections[0]?.requests.map((r) => r.url)).toEqual([
      'https://api.test/r1',
      'https://api.test/r2',
    ]);
  });

  it('edits a saved request in place, so every tab on it agrees', () => {
    const edited = reducer(twoOpenTabs(), {
      type: 'editActive',
      patch: { method: 'POST' },
    });
    expect(edited.data.collections[0]?.requests[1]?.method).toBe('POST');
  });
});

describe('deleting', () => {
  it('closes the tabs that were showing a deleted request', () => {
    const state = twoOpenTabs();
    const deleted = reducer(state, { type: 'deleteRequest', id: 'r2' });
    expect(deleted.data.tabs).toHaveLength(1);
    expect(activeRequest(deleted).id).toBe('r1');
  });

  it('leaves a blank draft when the last request is deleted', () => {
    const deleted = reducer(loaded(), { type: 'deleteRequest', id: 'r1' });
    expect(deleted.data.collections[0]?.requests).toEqual([]);
    expect(deleted.data.tabs).toHaveLength(1);
    expect(deleted.data.tabs[0]?.requestId).toBeNull();
    expect(deleted.data.activeTabId).toBe(deleted.data.tabs[0]?.id);
  });

  it('closes every tab belonging to a deleted collection', () => {
    const deleted = reducer(twoOpenTabs(), { type: 'deleteCollection', id: 'c1' });
    expect(deleted.data.collections).toEqual([]);
    expect(deleted.data.tabs).toHaveLength(1);
    expect(deleted.data.tabs[0]?.requestId).toBeNull();
  });

  it('keeps a draft tab open when a collection goes', () => {
    const withDraft = reducer(twoOpenTabs(), { type: 'newTab' });
    const draftTabId = withDraft.data.activeTabId;
    const deleted = reducer(withDraft, { type: 'deleteCollection', id: 'c1' });
    expect(tabIds(deleted)).toEqual([draftTabId]);
    expect(deleted.data.activeTabId).toBe(draftTabId);
  });
});

describe('duplicateRequest', () => {
  it('inserts the copy directly after the original, under a new id', () => {
    const state = reducer(twoOpenTabs(), { type: 'duplicateRequest', id: 'r1' });
    const requests = state.data.collections[0]?.requests ?? [];
    expect(requests.map((r) => r.name)).toEqual(['One', 'One copy', 'Two']);
    expect(requests[1]?.id).not.toBe('r1');
  });

  it('leaves an unnamed original unnamed, so the copy keeps tracking its url', () => {
    const base = loaded([collection('c1', 'C', [newRequest('r1', { url: 'https://x.test/a' })])]);
    const state = reducer(base, { type: 'duplicateRequest', id: 'r1' });
    expect(state.data.collections[0]?.requests.map((r) => r.name)).toEqual(['', '']);
  });

  it('gives the copy its own row ids, so it cannot inherit an attached file', () => {
    // Row ids key the session-only file map: shared ids meant a duplicated
    // form-data field uploaded the file belonging to the original.
    const original = newRequest('r1', {
      url: 'https://x.test/a',
      headers: [{ id: 'h1', key: 'A', value: '1', enabled: true }],
      params: [{ id: 'p1', key: 'q', value: '2', enabled: true }],
      body: {
        mode: 'form-data' as const,
        raw: '',
        urlencoded: [{ id: 'u1', key: 'u', value: '3', enabled: true }],
        formData: [
          { id: 'f1', key: 'upload', value: '', enabled: true, kind: 'file' as const },
        ],
      },
    });
    const state = reducer(loaded([collection('c1', 'C', [original])]), {
      type: 'duplicateRequest',
      id: 'r1',
    });
    const copy = state.data.collections[0]?.requests[1] as ApiRequest;

    expect(copy.headers[0]?.id).not.toBe('h1');
    expect(copy.params[0]?.id).not.toBe('p1');
    expect(copy.body.urlencoded[0]?.id).not.toBe('u1');
    expect(copy.body.formData[0]?.id).not.toBe('f1');
    // Everything else is carried over untouched.
    expect(copy.body.formData[0]?.key).toBe('upload');
    expect(copy.url).toBe('https://x.test/a');
  });

  it('does not open the copy, so the current tab is undisturbed', () => {
    const state = twoOpenTabs();
    const duplicated = reducer(state, { type: 'duplicateRequest', id: 'r1' });
    expect(duplicated.data.tabs).toHaveLength(state.data.tabs.length);
    expect(activeRequest(duplicated).id).toBe('r2');
  });
});

describe('history', () => {
  const entry = (id: string, at: number) => ({
    id,
    method: 'GET' as const,
    url: `https://api.test/${id}`,
    status: 200,
    timeMs: 12,
    at,
    snapshot: request(`snap-${id}`, id),
  });

  it('puts the newest entry first', () => {
    let state = loaded();
    state = reducer(state, { type: 'recordHistory', entry: entry('a', 1) });
    state = reducer(state, { type: 'recordHistory', entry: entry('b', 2) });
    expect(state.data.history.map((h) => h.id)).toEqual(['b', 'a']);
  });

  it('caps the list at the limit, dropping the oldest', () => {
    let state = loaded();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      state = reducer(state, { type: 'recordHistory', entry: entry(`e${i}`, i) });
    }
    expect(state.data.history).toHaveLength(HISTORY_LIMIT);
    expect(state.data.history[0]?.id).toBe(`e${HISTORY_LIMIT + 4}`);
  });

  it('replays an entry into its own draft tab without growing a collection', () => {
    let state = loaded();
    state = reducer(state, { type: 'recordHistory', entry: entry('a', 1) });
    const replayed = reducer(state, { type: 'restoreFromHistory', id: 'a' });

    expect(replayed.data.collections[0]?.requests).toHaveLength(1);
    expect(activeTab(replayed)?.requestId).toBeNull();
    expect(activeRequest(replayed).name).toBe('a');
    // A fresh id, so saving the replay cannot overwrite the request it came
    // from — and fresh row ids, so it cannot inherit its file attachments.
    expect(activeRequest(replayed).id).not.toBe('snap-a');
    const entryRows = state.data.history[0]?.snapshot.headers.map((h) => h.id) ?? [];
    for (const id of activeRequest(replayed).headers.map((h) => h.id)) {
      expect(entryRows).not.toContain(id);
    }
  });

  it('ignores a replay of an entry that is gone', () => {
    const state = loaded();
    expect(reducer(state, { type: 'restoreFromHistory', id: 'nope' })).toBe(state);
  });
});

describe('importRequest', () => {
  const imported = () => newRequest('i1', { name: 'Imported one', url: 'https://x.test/i' });

  it('opens the imported request in a tab', () => {
    const state = reducer(loaded(), { type: 'importRequest', request: imported() });
    expect(activeRequest(state).id).toBe('i1');
    expect(state.sidebarView).toBe('collections');
  });

  it('reuses the Imported collection instead of making a second one', () => {
    let state = reducer(loaded(), { type: 'importRequest', request: imported() });
    state = reducer(state, {
      type: 'importRequest',
      request: newRequest('i2', { url: 'https://x.test/j' }),
    });
    expect(collectionNames(state)).toEqual(['Imported']);
    expect(state.data.collections[0]?.requests.map((r) => r.id)).toEqual(['r1', 'i1', 'i2']);
  });

  it('says when the importer unticked browser-only headers', () => {
    const request = newRequest('i3', {
      url: 'https://x.test/i',
      headers: [{ id: 'h1', key: 'Pragma', value: 'no-cache', enabled: false }],
    });
    const state = reducer(loaded(), { type: 'importRequest', request });
    expect(state.toast).toContain('1 browser-only header');
  });
});

describe('environments', () => {
  const env = (id: string, name: string) => ({ id, name, variables: [] });

  it('keeps the active environment when it survives an edit', () => {
    let state = loaded();
    state = reducer(state, {
      type: 'setEnvironments',
      environments: [env('e1', 'Dev'), env('e2', 'Prod')],
      activate: 'e2',
    });
    state = reducer(state, { type: 'setActiveEnvironment', id: 'e1' });
    state = reducer(state, {
      type: 'setEnvironments',
      environments: [env('e1', 'Development'), env('e2', 'Prod')],
      activate: 'e2',
    });
    expect(state.data.activeEnvironmentId).toBe('e1');
  });

  it('activates the one just edited when nothing was selected', () => {
    const state = reducer(loaded(), {
      type: 'setEnvironments',
      environments: [env('e1', 'Dev')],
      activate: 'e1',
    });
    expect(state.data.activeEnvironmentId).toBe('e1');
  });

  it('clears the selection when the active environment was deleted', () => {
    let state = reducer(loaded(), {
      type: 'setEnvironments',
      environments: [env('e1', 'Dev')],
      activate: 'e1',
    });
    state = reducer(state, { type: 'setEnvironments', environments: [], activate: 'e1' });
    expect(state.data.activeEnvironmentId).toBeNull();
  });
});

// ── builderTab defaults ─────────────────────────────────────────────────────
// GET/HEAD are read through Params; everything else is built through Body —
// every path that puts a request in view is responsible for landing on
// whichever tab actually has something to show.

describe('builderTab follows the method of whatever request just came into view', () => {
  const postRequest = (id: string, name: string) =>
    newRequest(id, { name, method: 'POST', url: `https://api.test/${id}` });

  it('openRequest lands on Params for a GET', () => {
    const state = reducer(loaded([collection('c1', 'C', [request('r1', 'One')])]), {
      type: 'openRequest',
      id: 'r1',
    });
    expect(state.builderTab).toBe('params');
  });

  it('openRequest lands on Body for a POST', () => {
    const state = reducer(loaded([collection('c1', 'C', [postRequest('r1', 'One')])]), {
      type: 'openRequest',
      id: 'r1',
    });
    expect(state.builderTab).toBe('body');
  });

  it('activateTab follows the method of the tab being switched to', () => {
    const base = loaded([
      collection('c1', 'C', [request('r1', 'Get one'), postRequest('r2', 'Post one')]),
    ]);
    const bothOpen = reducer(reducer(base, { type: 'openRequest', id: 'r1' }), {
      type: 'openRequest',
      id: 'r2',
    });
    const [getTabId, postTabId] = tabIds(bothOpen);

    expect(reducer(bothOpen, { type: 'activateTab', id: postTabId as string }).builderTab).toBe(
      'body',
    );
    expect(reducer(bothOpen, { type: 'activateTab', id: getTabId as string }).builderTab).toBe(
      'params',
    );
  });

  it('newTab (always GET) lands on Params', () => {
    expect(reducer(loaded(), { type: 'newTab' }).builderTab).toBe('params');
  });

  it('restoreFromHistory follows the replayed entry\'s method', () => {
    const entry = (id: string, method: 'GET' | 'POST') => ({
      id,
      method,
      url: `https://api.test/${id}`,
      status: 200,
      timeMs: 12,
      at: 1,
      snapshot: newRequest(`snap-${id}`, { method, url: `https://api.test/${id}` }),
    });
    const withHistory = reducer(
      reducer(loaded(), { type: 'recordHistory', entry: entry('g', 'GET') }),
      { type: 'recordHistory', entry: entry('p', 'POST') },
    );
    expect(reducer(withHistory, { type: 'restoreFromHistory', id: 'g' }).builderTab).toBe(
      'params',
    );
    expect(reducer(withHistory, { type: 'restoreFromHistory', id: 'p' }).builderTab).toBe('body');
  });

  it('importRequest follows the imported request\'s method', () => {
    const get = reducer(loaded(), {
      type: 'importRequest',
      request: newRequest('i1', { url: 'https://x.test/i' }),
    });
    expect(get.builderTab).toBe('params');

    const post = reducer(loaded(), {
      type: 'importRequest',
      request: newRequest('i2', { method: 'POST', url: 'https://x.test/i' }),
    });
    expect(post.builderTab).toBe('body');
  });

  it('importCollection follows the first imported request\'s method', () => {
    const state = reducer(loaded(), {
      type: 'importCollection',
      collection: collection('new', 'New', [postRequest('n1', 'First')]),
      environment: null,
    });
    expect(state.builderTab).toBe('body');
  });

  it('importCollection falls back to Params when the collection is empty', () => {
    const state = reducer(loaded(), {
      type: 'importCollection',
      collection: collection('new', 'Empty', []),
      environment: null,
    });
    expect(state.builderTab).toBe('params');
  });

  it('loaded (a fresh page load) follows the method of whichever tab is active', () => {
    const state = reducer(initialState(), {
      type: 'loaded',
      data: {
        ...emptyData(),
        collections: [collection('c1', 'C', [postRequest('r1', 'One')])],
        tabs: [{ id: 't1', requestId: 'r1', draft: null }],
        activeTabId: 't1',
      },
    });
    expect(state.builderTab).toBe('body');
  });
});

describe('externalChange', () => {
  it('adopts another window’s workspace but never leaves the builder tabless', () => {
    const state = reducer(loaded(), {
      type: 'externalChange',
      data: { ...emptyData(), collections: [collection('c9', 'Elsewhere', [request('r9', 'Nine')])] },
    });
    expect(collectionNames(state)).toEqual(['Elsewhere']);
    expect(state.data.tabs).toHaveLength(1);
    expect(activeRequest(state).id).toBe('r9');
  });
});
