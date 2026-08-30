import { newId } from '../ids';
import {
  HISTORY_LIMIT,
  MAX_SIDEBAR_WIDTH,
  METHODS,
  MIN_EDITOR_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  SCHEMA_VERSION,
  emptyAuth,
  emptyBody,
  type ApiRequest,
  type AppData,
  type Auth,
  type Body,
  type BodyMode,
  type Collection,
  type Environment,
  type FormField,
  type HistoryEntry,
  type KeyValue,
  type Method,
  type OpenTab,
  type Theme,
} from '../types';

/**
 * Frozen from the first public release onward. Every installation's whole
 * workspace lives under this key, so changing it later would silently hand a
 * first run to everyone who has ever used the app. Renaming it is free only
 * while nothing has shipped — which stopped being true at v1.0.
 */
export const STORAGE_KEY = 'localrest:data';

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    history: [],
    tabs: [],
    activeTabId: null,
    editorHeight: null,
    sidebarWidth: null,
    theme: 'system',
    uninstallFeedback: true,
  };
}

/** First-run contents, matching the Examples collection in the design. */
export function seedData(): AppData {
  return {
    ...emptyData(),
    collections: [
      {
        id: newId(),
        name: 'Examples',
        expanded: true,
        requests: [
          {
            id: newId(),
            name: 'Get request',
            method: 'GET',
            url: 'https://postman-echo.com/get',
            params: [],
            headers: [{ id: newId(), key: 'Accept', value: 'application/json', enabled: true }],
            body: emptyBody(),
            auth: emptyAuth(),
          },
          {
            id: newId(),
            name: 'Create post',
            method: 'POST',
            url: 'https://postman-echo.com/post',
            params: [],
            headers: [
              { id: newId(), key: 'Content-Type', value: 'application/json', enabled: true },
            ],
            body: {
              ...emptyBody(),
              mode: 'json',
              raw: '{\n  "title": "First post",\n  "userId": 1\n}',
            },
            auth: emptyAuth(),
          },
          {
            id: newId(),
            name: 'Not found',
            method: 'GET',
            url: 'https://postman-echo.com/status/404',
            params: [],
            headers: [],
            body: emptyBody(),
            auth: emptyAuth(),
          },
        ],
      },
    ],
  };
}

// ── coercion ────────────────────────────────────────────────────────────────
// Stored data is untrusted: it may come from an older schema, a hand-edited
// backup file, or a half-written save. Every field is coerced back into shape
// rather than trusted, so a single bad value can never blank the whole app.

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const METHOD_SET = new Set<string>(METHODS);
const BODY_MODES = new Set<BodyMode>([
  'none',
  'json',
  'text',
  'form-data',
  'x-www-form-urlencoded',
]);

function coerceTheme(v: unknown): Theme {
  return v === 'light' || v === 'dark' ? v : 'system';
}

function coerceMethod(v: unknown): Method {
  const upper = str(v).toUpperCase();
  return METHOD_SET.has(upper) ? (upper as Method) : 'GET';
}

function coerceKeyValue(v: unknown): KeyValue {
  const r = isRecord(v) ? v : {};
  return {
    id: str(r['id']) || newId(),
    key: str(r['key']),
    value: str(r['value']),
    enabled: bool(r['enabled'], true),
  };
}

function coerceFormField(v: unknown): FormField {
  const r = isRecord(v) ? v : {};
  const base = coerceKeyValue(v);
  const kind = r['kind'] === 'file' ? 'file' : 'text';
  const fileName = str(r['fileName']);
  return { ...base, kind, ...(fileName ? { fileName } : {}) };
}

function coerceBody(v: unknown): Body {
  const r = isRecord(v) ? v : {};
  const mode = r['mode'];
  return {
    mode: BODY_MODES.has(mode as BodyMode) ? (mode as BodyMode) : 'none',
    raw: str(r['raw']),
    formData: arr(r['formData']).map(coerceFormField),
    urlencoded: arr(r['urlencoded']).map(coerceKeyValue),
  };
}

function coerceAuth(v: unknown): Auth {
  const r = isRecord(v) ? v : {};
  const type = r['type'];
  const base = emptyAuth();
  return {
    type:
      type === 'bearer' || type === 'basic' || type === 'apikey' ? type : base.type,
    token: str(r['token']),
    username: str(r['username']),
    password: str(r['password']),
    key: str(r['key']),
    value: str(r['value']),
    apiKeyIn: r['apiKeyIn'] === 'query' ? 'query' : 'header',
  };
}

/**
 * Names this app invented before an unnamed request was a state it could
 * represent. Neither was ever chosen by a user, and both read as noise in a
 * sidebar, so they migrate to the empty name that now renders as the URL.
 */
const PLACEHOLDER_NAMES = new Set(['New request', 'Untitled request']);

function coerceName(v: unknown): string {
  const name = str(v).trim();
  return PLACEHOLDER_NAMES.has(name) ? '' : name;
}

function coerceRequest(v: unknown): ApiRequest {
  const r = isRecord(v) ? v : {};
  const method = coerceMethod(r['method']);
  const body = coerceBody(r['body']);
  return {
    id: str(r['id']) || newId(),
    name: coerceName(r['name']),
    method,
    url: str(r['url']),
    params: arr(r['params']).map(coerceKeyValue),
    headers: arr(r['headers']).map(coerceKeyValue),
    // Kept even on a GET. This used to normalise a bodyless method's body away
    // so "the editor and the wire agree", but the wire already agrees —
    // buildRequest declines to send one — and reading it back destroyed a
    // hand-typed payload the moment someone flipped a saved POST to GET to try
    // something. Storage is not the place to throw away work that costs
    // nothing to keep.
    body,
    auth: coerceAuth(r['auth']),
  };
}

function coerceCollection(v: unknown): Collection {
  const r = isRecord(v) ? v : {};
  return {
    id: str(r['id']) || newId(),
    name: str(r['name']) || 'Untitled collection',
    expanded: bool(r['expanded'], true),
    requests: arr(r['requests']).map(coerceRequest),
  };
}

function coerceEnvironment(v: unknown): Environment {
  const r = isRecord(v) ? v : {};
  return {
    id: str(r['id']) || newId(),
    name: str(r['name']) || 'Untitled environment',
    variables: arr(r['variables']).map(coerceKeyValue),
  };
}

function coerceHistoryEntry(v: unknown): HistoryEntry {
  const r = isRecord(v) ? v : {};
  const snapshot = coerceRequest(r['snapshot']);
  return {
    id: str(r['id']) || newId(),
    method: coerceMethod(r['method'] ?? snapshot.method),
    url: str(r['url']) || snapshot.url,
    status: num(r['status']),
    timeMs: num(r['timeMs']),
    at: num(r['at'], Date.now()),
    snapshot,
  };
}

function coerceTab(v: unknown): OpenTab {
  const r = isRecord(v) ? v : {};
  const requestId = str(r['requestId']);
  const hasDraft = isRecord(r['draft']);
  return {
    id: str(r['id']) || newId(),
    requestId: requestId || null,
    draft: !requestId && hasDraft ? coerceRequest(r['draft']) : null,
  };
}

/**
 * Bring anything read out of storage up to the current schema. Returns seed
 * data for a first run (undefined/null) and repairs anything else in place.
 * Future schema bumps branch on `schemaVersion` here.
 */
export function migrate(stored: unknown): AppData {
  if (stored === undefined || stored === null) return seedData();
  if (!isRecord(stored)) return seedData();

  const environments = arr(stored['environments']).map(coerceEnvironment);
  const activeEnvId = str(stored['activeEnvironmentId']);

  const collections = arr(stored['collections']).map(coerceCollection);
  const requestIds = new Set(collections.flatMap((c) => c.requests.map((r) => r.id)));

  // A tab pointing at a request that no longer exists would render blank
  // forever, so drop it here rather than guarding at every read site.
  const tabs = arr(stored['tabs'])
    .map(coerceTab)
    .filter((tab) => (tab.requestId === null ? tab.draft !== null : requestIds.has(tab.requestId)));

  const activeTabId = str(stored['activeTabId']);

  return {
    schemaVersion: SCHEMA_VERSION,
    collections,
    environments,
    // Never point at an environment that no longer exists.
    activeEnvironmentId: environments.some((e) => e.id === activeEnvId) ? activeEnvId : null,
    history: arr(stored['history']).map(coerceHistoryEntry).slice(0, HISTORY_LIMIT),
    tabs,
    activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : (tabs[0]?.id ?? null),
    // A stored height from a taller window is clamped at render, not here.
    editorHeight:
      typeof stored['editorHeight'] === 'number' && Number.isFinite(stored['editorHeight'])
        ? Math.max(MIN_EDITOR_HEIGHT, stored['editorHeight'])
        : null,
    // Same reasoning as editorHeight — the render-time clamp handles a window
    // that has since shrunk.
    sidebarWidth:
      typeof stored['sidebarWidth'] === 'number' && Number.isFinite(stored['sidebarWidth'])
        ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, stored['sidebarWidth']))
        : null,
    theme: coerceTheme(stored['theme']),
    // Defaults on: only an explicit false is a decision to opt out, so a
    // store written before this existed keeps the shipped default.
    uninstallFeedback: stored['uninstallFeedback'] !== false,
  };
}
