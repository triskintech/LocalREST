export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type Method = (typeof METHODS)[number];

/** Methods that never carry a request body. */
export const BODYLESS_METHODS: ReadonlySet<Method> = new Set<Method>(['GET', 'HEAD']);

export type KeyValue = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

/**
 * A form-data field. File contents are deliberately absent: only the name is
 * persisted, and the File itself lives in a session-only map keyed by field id.
 * Base64-ing bytes into chrome.storage.local would blow the quota and slow
 * every save.
 */
export type FormField = KeyValue & {
  kind: 'text' | 'file';
  fileName?: string;
};

export type BodyMode = 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';

export type Body = {
  mode: BodyMode;
  /** Used by the json and text modes. */
  raw: string;
  formData: FormField[];
  urlencoded: KeyValue[];
};

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export type Auth = {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  key: string;
  value: string;
  apiKeyIn: 'header' | 'query';
};

export type ApiRequest = {
  id: string;
  name: string;
  method: Method;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: Body;
  auth: Auth;
};

export type Collection = {
  id: string;
  name: string;
  expanded: boolean;
  requests: ApiRequest[];
};

export type Environment = {
  id: string;
  name: string;
  variables: KeyValue[];
};

export type HistoryEntry = {
  id: string;
  method: Method;
  url: string;
  /** 0 when the request failed before a response arrived. */
  status: number;
  timeMs: number;
  /** Epoch ms, rendered relatively ("8m ago"). */
  at: number;
  snapshot: ApiRequest;
};

/**
 * One open request tab.
 *
 * A tab either points at a saved request — edits go straight into the
 * collection — or carries its own unsaved draft. Response state is not stored
 * here: it is per-tab but ephemeral, so a reopened tab starts blank rather
 * than showing a stale reply.
 */
export type OpenTab = {
  id: string;
  requestId: string | null;
  draft: ApiRequest | null;
};

export const SCHEMA_VERSION = 1;

/**
 * What the user picked, not what is on screen: 'system' follows the OS and can
 * change without anyone touching the app. Resolving it is the UI's job.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export type AppData = {
  schemaVersion: number;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  /** Newest first, capped at HISTORY_LIMIT. */
  history: HistoryEntry[];
  tabs: OpenTab[];
  activeTabId: string | null;
  /**
   * Height of the request editor pane in pixels, null for the default split.
   * Persisted because re-dragging the divider on every reload is a chore.
   */
  editorHeight: number | null;
  /**
   * Width of the sidebar in pixels, null for the default width. Same
   * persistence reasoning as editorHeight.
   */
  sidebarWidth: number | null;
  /**
   * Lives here rather than in its own store so it rides along in a backup and
   * reaches every open tab through the same change notification as the rest.
   */
  theme: Theme;
  /**
   * Whether uninstalling opens the one-question feedback page. The single
   * exception to "nothing leaves this browser", which is why it is a setting
   * someone can see and switch off rather than a line in a privacy policy.
   * Only has any effect once FEEDBACK_BASE_URL is filled in.
   */
  uninstallFeedback: boolean;
};

/** Bounds for the request/response split, in pixels. */
export const MIN_EDITOR_HEIGHT = 64;
export const MIN_RESPONSE_HEIGHT = 140;

/** Bounds for the sidebar/request-builder split, in pixels. */
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 480;
export const MIN_BUILDER_WIDTH = 360;

export const HISTORY_LIMIT = 50;

// ── constructors ────────────────────────────────────────────────────────────
// Every request carries a full Body and Auth even when unused, so components
// never have to guard against partially-populated shapes.

export function emptyBody(): Body {
  return { mode: 'none', raw: '', formData: [], urlencoded: [] };
}

export function emptyAuth(): Auth {
  return {
    type: 'none',
    token: '',
    username: '',
    password: '',
    key: '',
    value: '',
    apiKeyIn: 'header',
  };
}

export function newRequest(id: string, overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id,
    // Empty means unnamed, which renders as the URL. See lib/request/label.ts.
    name: '',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: emptyBody(),
    auth: emptyAuth(),
    ...overrides,
  };
}
