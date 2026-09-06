import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { newId } from '../../lib/ids';
import { cloneRequest } from '../../lib/request/clone';
import { requestLabel } from '../../lib/request/label';
import { emptyData } from '../../lib/storage/schema';
import {
  BODYLESS_METHODS,
  HISTORY_LIMIT,
  newRequest,
  type ApiRequest,
  type AppData,
  type Collection,
  type Environment,
  type HistoryEntry,
  type Method,
  type OpenTab,
  type Theme,
} from '../../lib/types';
import { createSaver, loadData, subscribeToExternalWrites } from './persistence';

const IMPORTED_COLLECTION = 'Imported';

export type SidebarView = 'collections' | 'history';
export type BuilderTab = 'params' | 'headers' | 'body' | 'auth';
export type ResponseTab = 'body' | 'headers';

export type Dialog =
  | { kind: 'import-curl' }
  | { kind: 'import-collection' }
  | { kind: 'save-request' }
  | { kind: 'environments' }
  | { kind: 'backup' }
  | { kind: 'rename'; target: 'request' | 'collection'; id: string; name: string }
  | { kind: 'confirm-delete'; target: 'request' | 'collection'; id: string; name: string }
  | { kind: 'curl-snippet' };

export type State = {
  ready: boolean;
  data: AppData;
  sidebarView: SidebarView;
  builderTab: BuilderTab;
  responseTab: ResponseTab;
  dialog: Dialog | null;
  toast: string | null;
};

export type Action =
  | { type: 'loaded'; data: AppData }
  | { type: 'externalChange'; data: AppData }
  | { type: 'openRequest'; id: string }
  | { type: 'newTab' }
  | { type: 'closeTab'; id: string }
  | { type: 'activateTab'; id: string }
  | { type: 'moveTab'; from: number; to: number }
  | { type: 'editActive'; patch: Partial<ApiRequest> }
  | { type: 'toggleCollection'; id: string }
  | { type: 'saveRequest'; collectionId: string | null; collectionName: string; name: string }
  | { type: 'renameRequest'; id: string; name: string }
  | { type: 'duplicateRequest'; id: string }
  | { type: 'deleteRequest'; id: string }
  | { type: 'renameCollection'; id: string; name: string }
  | { type: 'deleteCollection'; id: string }
  | { type: 'importRequest'; request: ApiRequest }
  | { type: 'importCollection'; collection: Collection; environment: Environment | null }
  | { type: 'recordHistory'; entry: HistoryEntry }
  | { type: 'restoreFromHistory'; id: string }
  | { type: 'replaceAll'; data: AppData }
  | { type: 'setActiveEnvironment'; id: string | null }
  | { type: 'setEnvironments'; environments: Environment[]; activate?: string | null }
  | { type: 'setEditorHeight'; height: number | null }
  | { type: 'setSidebarWidth'; width: number | null }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setUninstallFeedback'; enabled: boolean }
  | { type: 'setResolveCurlVariables'; enabled: boolean }
  | { type: 'setSidebarView'; view: SidebarView }
  | { type: 'setBuilderTab'; tab: BuilderTab }
  | { type: 'setResponseTab'; tab: ResponseTab }
  | { type: 'openDialog'; dialog: Dialog }
  | { type: 'closeDialog' }
  | { type: 'toast'; message: string | null };

// ── tab helpers ─────────────────────────────────────────────────────────────

const draftTab = (request?: ApiRequest): OpenTab => ({
  id: newId(),
  requestId: null,
  draft: request ?? newRequest(newId()),
});

const savedTab = (requestId: string): OpenTab => ({ id: newId(), requestId, draft: null });

/**
 * Say when the importer unticked something, so a header going unsent is never
 * a silent decision the user has to discover by debugging a failed request.
 * Exported so the URL bar's paste-a-curl-command shortcut reports the same
 * way importing one through the dialog does.
 */
export function importToast(request: ApiRequest): string {
  const unticked = request.headers.filter((header) => !header.enabled).length;
  const note =
    unticked > 0
      ? ` ${unticked} browser-only header${unticked === 1 ? '' : 's'} left unticked.`
      : '';
  return `Imported “${requestLabel(request)}”.${note}`;
}

function findRequest(data: AppData, id: string): ApiRequest | undefined {
  for (const collection of data.collections) {
    const found = collection.requests.find((r) => r.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Opens a tab for a request, or focuses the one already showing it. */
function withRequestOpen(data: AppData, requestId: string): AppData {
  const existing = data.tabs.find((tab) => tab.requestId === requestId);
  if (existing) return { ...data, activeTabId: existing.id };
  const tab = savedTab(requestId);
  return { ...data, tabs: [...data.tabs, tab], activeTabId: tab.id };
}

/** Drops tabs whose request has gone, keeping at least one tab open. */
function pruneTabs(data: AppData, removedRequestIds: ReadonlySet<string>): AppData {
  const tabs = data.tabs.filter(
    (tab) => tab.requestId === null || !removedRequestIds.has(tab.requestId),
  );
  if (tabs.length === data.tabs.length) return data;

  const ensured = tabs.length > 0 ? tabs : [draftTab()];
  const activeTabId = ensured.some((t) => t.id === data.activeTabId)
    ? data.activeTabId
    : (ensured[ensured.length - 1]?.id ?? null);
  return { ...data, tabs: ensured, activeTabId };
}

/** The tab currently in view. */
export function activeTab(state: State): OpenTab | undefined {
  return state.data.tabs.find((tab) => tab.id === state.data.activeTabId);
}

/** A tab's request, wherever it lives — saved, or its own unsaved draft. */
function requestForTab(data: AppData, tab: OpenTab): ApiRequest {
  if (tab.requestId === null) return tab.draft ?? newRequest('none');
  return findRequest(data, tab.requestId) ?? newRequest('none');
}

/** The request currently being edited, wherever it lives. */
export function activeRequest(state: State): ApiRequest {
  const tab = activeTab(state);
  return tab ? requestForTab(state.data, tab) : newRequest('none');
}

/**
 * GET and HEAD requests are read there through Params; everything else is
 * built through Body, so that's what should be in view the moment a request
 * opens — landing on an empty Params tab for a POST just makes people click
 * again to find the tab that matters. Exported so the URL bar's paste-a-curl
 * shortcut can land on the same tab a saved request of that method would.
 */
export function defaultBuilderTab(method: Method): BuilderTab {
  return BODYLESS_METHODS.has(method) ? 'params' : 'body';
}

/** The label a tab shows — its name, or the URL standing in for one. */
export function tabTitle(data: AppData, tab: OpenTab): string {
  const request = tab.requestId !== null ? findRequest(data, tab.requestId) : tab.draft;
  return request ? requestLabel(request) : 'Untitled request';
}

export function initialState(): State {
  return {
    ready: false,
    data: emptyData(),
    sidebarView: 'collections',
    builderTab: 'params',
    responseTab: 'body',
    dialog: null,
    toast: null,
  };
}

/** Guarantee at least one tab, so the builder always has something to show. */
function withAtLeastOneTab(data: AppData): AppData {
  if (data.tabs.length > 0) {
    return data.activeTabId ? data : { ...data, activeTabId: data.tabs[0]?.id ?? null };
  }
  const first = data.collections.flatMap((c) => c.requests)[0];
  const tab = first ? savedTab(first.id) : draftTab();
  return { ...data, tabs: [tab], activeTabId: tab.id };
}

function mapRequest(
  data: AppData,
  id: string,
  update: (request: ApiRequest) => ApiRequest,
): AppData {
  return {
    ...data,
    collections: data.collections.map((collection) =>
      collection.requests.some((r) => r.id === id)
        ? {
            ...collection,
            requests: collection.requests.map((r) => (r.id === id ? update(r) : r)),
          }
        : collection,
    ),
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded': {
      const data = withAtLeastOneTab(action.data);
      const tab = data.tabs.find((t) => t.id === data.activeTabId);
      const method = tab ? requestForTab(data, tab).method : 'GET';
      return { ...state, ready: true, data, builderTab: defaultBuilderTab(method) };
    }

    case 'externalChange':
      return { ...state, data: withAtLeastOneTab(action.data) };

    case 'openRequest': {
      const request = findRequest(state.data, action.id);
      return {
        ...state,
        data: withRequestOpen(state.data, action.id),
        builderTab: defaultBuilderTab(request?.method ?? 'GET'),
      };
    }

    case 'newTab': {
      const tab = draftTab();
      return {
        ...state,
        data: { ...state.data, tabs: [...state.data.tabs, tab], activeTabId: tab.id },
        sidebarView: 'collections',
        builderTab: defaultBuilderTab(tab.draft?.method ?? 'GET'),
      };
    }

    case 'activateTab': {
      const tab = state.data.tabs.find((t) => t.id === action.id);
      const method = tab ? requestForTab(state.data, tab).method : 'GET';
      return {
        ...state,
        data: { ...state.data, activeTabId: action.id },
        builderTab: defaultBuilderTab(method),
      };
    }

    case 'closeTab': {
      const index = state.data.tabs.findIndex((tab) => tab.id === action.id);
      if (index === -1) return state;
      const tabs = state.data.tabs.filter((tab) => tab.id !== action.id);
      const ensured = tabs.length > 0 ? tabs : [draftTab()];
      // Closing the active tab lands on its neighbour, the way editors behave.
      const activeTabId =
        state.data.activeTabId === action.id
          ? (ensured[Math.min(index, ensured.length - 1)]?.id ?? null)
          : state.data.activeTabId;
      return { ...state, data: { ...state.data, tabs: ensured, activeTabId } };
    }

    case 'moveTab': {
      const tabs = [...state.data.tabs];
      const [moved] = tabs.splice(action.from, 1);
      if (!moved) return state;
      tabs.splice(action.to, 0, moved);
      return { ...state, data: { ...state.data, tabs } };
    }

    case 'editActive': {
      const tab = activeTab(state);
      if (!tab) return state;
      if (tab.requestId === null) {
        return {
          ...state,
          data: {
            ...state.data,
            tabs: state.data.tabs.map((t) =>
              t.id === tab.id && t.draft ? { ...t, draft: { ...t.draft, ...action.patch } } : t,
            ),
          },
        };
      }
      return {
        ...state,
        data: mapRequest(state.data, tab.requestId, (r) => ({ ...r, ...action.patch })),
      };
    }

    case 'toggleCollection':
      return {
        ...state,
        data: {
          ...state.data,
          collections: state.data.collections.map((c) =>
            c.id === action.id ? { ...c, expanded: !c.expanded } : c,
          ),
        },
      };

    case 'saveRequest': {
      const tab = activeTab(state);
      if (!tab) return { ...state, dialog: null };

      const source = tab.requestId === null ? tab.draft : findRequest(state.data, tab.requestId);
      if (!source) return { ...state, dialog: null };

      // A draft becomes a new request; an already-saved one keeps its identity
      // so open tabs and history keep pointing at it, and is renamed and moved
      // to wherever the dialog says it should live.
      const isDraft = tab.requestId === null;
      const saved: ApiRequest = { ...source, id: isDraft ? newId() : source.id, name: action.name };

      // Where it lives now, so that renaming in place stays in place. Strip
      // and append would have quietly relocated it to the bottom of its own
      // collection every time someone corrected its name.
      const homeId =
        state.data.collections.find((collection) =>
          collection.requests.some((request) => request.id === saved.id),
        )?.id ?? null;

      if (action.collectionId !== null && action.collectionId === homeId) {
        const collections = state.data.collections.map((collection) =>
          collection.id === homeId
            ? {
                ...collection,
                expanded: true,
                requests: collection.requests.map((request) =>
                  request.id === saved.id ? saved : request,
                ),
              }
            : collection,
        );
        return {
          ...state,
          data: {
            ...state.data,
            collections,
            tabs: state.data.tabs.map((t) =>
              t.id === tab.id ? { ...t, requestId: saved.id, draft: null } : t,
            ),
          },
          dialog: null,
          toast: `Saved “${requestLabel(saved)}” to “${
            collections.find((c) => c.id === homeId)?.name ?? 'a collection'
          }”.`,
        };
      }

      // Moving it somewhere else, or saving a draft for the first time.
      const stripped = state.data.collections.map((collection) => ({
        ...collection,
        requests: collection.requests.filter((request) => request.id !== saved.id),
      }));

      const collections =
        action.collectionId === null
          ? [
              ...stripped,
              {
                id: newId(),
                name: action.collectionName || 'My requests',
                expanded: true,
                requests: [saved],
              },
            ]
          : stripped.map((collection) =>
              collection.id === action.collectionId
                ? { ...collection, expanded: true, requests: [...collection.requests, saved] }
                : collection,
            );

      const target = collections.find((collection) =>
        collection.requests.some((request) => request.id === saved.id),
      );

      return {
        ...state,
        data: {
          ...state.data,
          collections,
          // The tab stays put and simply starts pointing at the saved request.
          tabs: state.data.tabs.map((t) =>
            t.id === tab.id ? { ...t, requestId: saved.id, draft: null } : t,
          ),
        },
        dialog: null,
        toast: `Saved “${requestLabel(saved)}” to ${target ? `“${target.name}”` : 'a collection'}.`,
      };
    }

    case 'renameRequest':
      return {
        ...state,
        data: mapRequest(state.data, action.id, (r) => ({ ...r, name: action.name })),
        dialog: null,
      };

    case 'duplicateRequest': {
      const collections = state.data.collections.map((collection) => {
        const index = collection.requests.findIndex((r) => r.id === action.id);
        if (index === -1) return collection;
        const original = collection.requests[index] as ApiRequest;
        // An unnamed original stays unnamed, so the copy keeps tracking its URL
        // instead of freezing into the string " copy".
        const copy: ApiRequest = {
          ...cloneRequest(original),
          name: original.name.trim() === '' ? '' : `${original.name} copy`,
        };
        const requests = [...collection.requests];
        requests.splice(index + 1, 0, copy);
        return { ...collection, requests };
      });
      return { ...state, data: { ...state.data, collections } };
    }

    case 'deleteRequest': {
      const collections = state.data.collections.map((c) => ({
        ...c,
        requests: c.requests.filter((r) => r.id !== action.id),
      }));
      return {
        ...state,
        data: withAtLeastOneTab(
          pruneTabs({ ...state.data, collections }, new Set([action.id])),
        ),
      };
    }

    case 'renameCollection':
      return {
        ...state,
        data: {
          ...state.data,
          collections: state.data.collections.map((c) =>
            c.id === action.id ? { ...c, name: action.name } : c,
          ),
        },
        dialog: null,
      };

    case 'deleteCollection': {
      const doomed = state.data.collections.find((c) => c.id === action.id);
      const removed = new Set((doomed?.requests ?? []).map((r) => r.id));
      const collections = state.data.collections.filter((c) => c.id !== action.id);
      return {
        ...state,
        data: withAtLeastOneTab(pruneTabs({ ...state.data, collections }, removed)),
      };
    }

    case 'importRequest': {
      const existing = state.data.collections.find((c) => c.name === IMPORTED_COLLECTION);
      const collections = existing
        ? state.data.collections.map((c) =>
            c.id === existing.id
              ? { ...c, expanded: true, requests: [...c.requests, action.request] }
              : c,
          )
        : [
            ...state.data.collections,
            {
              id: newId(),
              name: IMPORTED_COLLECTION,
              expanded: true,
              requests: [action.request],
            },
          ];
      return {
        ...state,
        // A fresh tab means a blank response pane, not the previous reply.
        data: withRequestOpen({ ...state.data, collections }, action.request.id),
        sidebarView: 'collections',
        builderTab: defaultBuilderTab(action.request.method),
        dialog: null,
        toast: importToast(action.request),
      };
    }

    case 'importCollection': {
      const { collection, environment } = action;
      const environments = environment
        ? [...state.data.environments, environment]
        : state.data.environments;
      const first = collection.requests[0];
      const count = collection.requests.length;
      const withCollection: AppData = {
        ...state.data,
        collections: [...state.data.collections, collection],
        environments,
        // Selecting the imported environment is the difference between the
        // {{variables}} resolving and every request failing on arrival.
        activeEnvironmentId: environment ? environment.id : state.data.activeEnvironmentId,
      };
      return {
        ...state,
        data: first ? withRequestOpen(withCollection, first.id) : withCollection,
        sidebarView: 'collections',
        builderTab: defaultBuilderTab(first?.method ?? 'GET'),
        dialog: null,
        toast: `Imported ${count} request${count === 1 ? '' : 's'} from “${collection.name}”.`,
      };
    }

    case 'recordHistory':
      return {
        ...state,
        data: {
          ...state.data,
          history: [action.entry, ...state.data.history].slice(0, HISTORY_LIMIT),
        },
      };

    case 'restoreFromHistory': {
      const entry = state.data.history.find((h) => h.id === action.id);
      if (!entry) return state;
      // Opens in its own tab rather than adding to the sidebar: replaying an
      // old request should not quietly grow a collection.
      const tab = draftTab(cloneRequest(entry.snapshot));
      return {
        ...state,
        data: { ...state.data, tabs: [...state.data.tabs, tab], activeTabId: tab.id },
        sidebarView: 'collections',
        builderTab: defaultBuilderTab(entry.method),
      };
    }

    case 'replaceAll': {
      const count = action.data.collections.reduce((n, c) => n + c.requests.length, 0);
      return {
        ...state,
        data: withAtLeastOneTab(action.data),
        sidebarView: 'collections',
        dialog: null,
        toast: `Restored ${count} request${count === 1 ? '' : 's'} from backup.`,
      };
    }

    case 'setActiveEnvironment':
      return { ...state, data: { ...state.data, activeEnvironmentId: action.id } };

    case 'setEnvironments': {
      const exists = (id: string | null | undefined): id is string =>
        typeof id === 'string' && action.environments.some((e) => e.id === id);
      // Creating your first environment and then finding nothing selected is a
      // dead end, so fall back to the one just edited when none is active.
      const active = exists(state.data.activeEnvironmentId)
        ? state.data.activeEnvironmentId
        : exists(action.activate)
          ? action.activate
          : null;
      return {
        ...state,
        data: { ...state.data, environments: action.environments, activeEnvironmentId: active },
      };
    }

    case 'setEditorHeight':
      return { ...state, data: { ...state.data, editorHeight: action.height } };

    case 'setSidebarWidth':
      return { ...state, data: { ...state.data, sidebarWidth: action.width } };

    case 'setTheme':
      return { ...state, data: { ...state.data, theme: action.theme } };

    case 'setUninstallFeedback':
      return { ...state, data: { ...state.data, uninstallFeedback: action.enabled } };

    case 'setResolveCurlVariables':
      return { ...state, data: { ...state.data, resolveCurlVariables: action.enabled } };

    case 'setSidebarView':
      return { ...state, sidebarView: action.view };
    case 'setBuilderTab':
      return { ...state, builderTab: action.tab };
    case 'setResponseTab':
      return { ...state, responseTab: action.tab };

    case 'openDialog':
      return { ...state, dialog: action.dialog };
    case 'closeDialog':
      return { ...state, dialog: null };
    case 'toast':
      return { ...state, toast: action.message };
  }
}

type Store = { state: State; dispatch: (action: Action) => void };

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const saver = useMemo(() => createSaver(), []);

  useEffect(() => {
    let cancelled = false;
    void loadData().then((data) => {
      if (!cancelled) dispatch({ type: 'loaded', data });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    saver.save(state.data);
  }, [state.ready, state.data, saver]);

  useEffect(() => {
    return subscribeToExternalWrites((data) => dispatch({ type: 'externalChange', data }));
  }, []);

  // A tab closing mid-debounce must not lose the last edit.
  useEffect(() => {
    const flush = () => void saver.flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [saver]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside a StoreProvider.');
  return store;
}

export function useActiveRequest(): ApiRequest {
  const { state } = useStore();
  return activeRequest(state);
}

/** Patch whichever request is active, saved or draft. */
export function useEditActive(): (patch: Partial<ApiRequest>) => void {
  const { dispatch } = useStore();
  return useCallback(
    (patch: Partial<ApiRequest>) => dispatch({ type: 'editActive', patch }),
    [dispatch],
  );
}
