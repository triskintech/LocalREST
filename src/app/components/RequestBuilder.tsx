import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { looksLikeCurl, parseCurl } from '../../lib/curl/parseCurl';
import { BODYLESS_METHODS, METHODS, type Method } from '../../lib/types';
import { isForbiddenHeader } from '../../lib/request/buildRequest';
import { applyParamsToUrl, splitQuery } from '../../lib/url';
import { environmentVars } from '../../lib/variables/resolve';
import {
  defaultBuilderTab,
  importToast,
  useActiveRequest,
  useEditActive,
  useStore,
} from '../state/store';
import { AuthEditor } from './AuthEditor';
import { BodyEditor } from './BodyEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { PaneSplitter, clampEditorHeight } from './PaneSplitter';
import { ResponsePane } from './ResponsePane';
import { TabBar } from './TabBar';
import { UrlField } from './UrlField';
import type { ResponseState } from '../net/response';

const TABS = [
  { key: 'params', label: 'Params' },
  { key: 'headers', label: 'Headers' },
  { key: 'body', label: 'Body' },
  { key: 'auth', label: 'Auth' },
] as const;

function headerWarning(key: string): string | null {
  return isForbiddenHeader(key)
    ? `The browser controls ${key.trim()} and will ignore this value.`
    : null;
}

export function RequestBuilder({
  response,
  sending,
  files,
  onSend,
  onCancel,
}: {
  response: ResponseState;
  sending: boolean;
  files: Map<string, File>;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { state, dispatch } = useStore();
  const request = useActiveRequest();
  const edit = useEditActive();
  const tab = state.builderTab;

  const environment = state.data.environments.find(
    (each) => each.id === state.data.activeEnvironmentId,
  );
  // Rebuilt only when the environment itself changes: the URL field holds
  // this in a CodeMirror compartment, and a fresh object every render would
  // reconfigure the editor on every keystroke.
  const vars = useMemo(() => environmentVars(environment), [environment]);
  const bodyless = BODYLESS_METHODS.has(request.method);

  const panesRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorHeight = state.data.editorHeight;

  /**
   * Live measurements of the split, so the stored height can be checked
   * against the window it is being restored into.
   *
   * Reading the refs during render instead returned 0 until something else
   * re-rendered, which is why the first keyboard nudge used to slam the editor
   * down to its minimum rather than stepping from where it was.
   */
  const [layout, setLayout] = useState({ available: 0, editor: 0 });

  useLayoutEffect(() => {
    const panes = panesRef.current;
    const editor = editorRef.current;
    if (!panes || !editor) return;

    const measure = () => {
      const available = panes.getBoundingClientRect().height;
      const height = editor.getBoundingClientRect().height;
      // Same numbers means the same object, so this cannot loop through the
      // observer that triggered it.
      setLayout((current) =>
        current.available === available && current.editor === height
          ? current
          : { available, editor: height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panes);
    observer.observe(editor);
    return () => observer.disconnect();
  }, []);

  /**
   * A height saved on a taller window, or one the window has since shrunk
   * past, is clamped here rather than trusted. Left alone it pushed the
   * splitter and the entire response pane out of the (overflow: hidden) split,
   * with no handle left on screen to drag them back.
   */
  const appliedHeight =
    editorHeight === null
      ? null
      : layout.available > 0
        ? clampEditorHeight(editorHeight, layout.available)
        : editorHeight;

  // Keyboard nudges need a number even while the pane is on its default 44%.
  const measuredEditorHeight = appliedHeight ?? layout.editor;

  /**
   * Keep the URL bar and the Params table saying the same thing. A query typed
   * or pasted into the URL becomes rows (winning over rows of the same name),
   * and the URL is then rewritten from the full row set — so the query is
   * visible in both places and can never drift between them.
   */
  const syncQueryAndParams = () => {
    const fromQuery = splitQuery(request.url).params;
    if (fromQuery.length === 0) {
      const normalised = applyParamsToUrl(request.url, request.params);
      if (normalised !== request.url) edit({ url: normalised });
      return;
    }

    const namedByQuery = new Set(fromQuery.map((param) => param.key));
    const merged = [
      ...request.params.filter((param) => !namedByQuery.has(param.key)),
      ...fromQuery,
    ];
    edit({ url: applyParamsToUrl(request.url, merged), params: merged });
  };

  /**
   * Edits in the Params table write straight back into the URL bar. The
   * current rows are passed as the previous set so a renamed or deleted key
   * leaves the URL with them — see applyParamsToUrl.
   */
  const setParams = (params: typeof request.params) =>
    edit({ params, url: applyParamsToUrl(request.url, params, request.params) });

  /**
   * A curl command pasted into the URL bar replaces the whole request rather
   * than becoming the URL — the same read `parseCurl` gives the Import curl
   * dialog, just applied in place instead of opening a new tab.
   */
  const pasteCurl = (text: string): boolean => {
    if (!looksLikeCurl(text)) return false;

    let parsed;
    try {
      parsed = parseCurl(text);
    } catch {
      dispatch({ type: 'toast', message: 'That could not be read as a curl command.' });
      return true;
    }
    if (!parsed.url) {
      dispatch({ type: 'toast', message: 'No URL found in that curl command.' });
      return true;
    }

    edit({
      // Cleared for the same reason a dialog import clears it: a name typed
      // for the old request would go on describing an endpoint this tab no
      // longer points at.
      name: '',
      method: parsed.method,
      url: parsed.url,
      params: parsed.params,
      headers: parsed.headers,
      body: parsed.body,
      auth: parsed.auth,
    });
    dispatch({ type: 'setBuilderTab', tab: defaultBuilderTab(parsed.method) });
    dispatch({ type: 'toast', message: importToast(parsed) });
    return true;
  };

  const counts: Record<string, number> = {
    params: request.params.length,
    headers: request.headers.length,
  };

  return (
    <div className="builder">
      <TabBar />

      {/* Left empty, the field shows the URL — so a request always has
          something to be called without anyone having to name it first. */}
      <div className="name-bar">
        <input
          className="input request-name"
          type="text"
          aria-label="Request name"
          placeholder={request.url || 'Untitled request'}
          value={request.name}
          onChange={(e) => edit({ name: e.target.value })}
        />
      </div>

      <div className="url-bar">
        <select
          className="input mono method-select"
          aria-label="Method"
          value={request.method}
          onChange={(e) => edit({ method: e.target.value as Method })}
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <UrlField
          value={request.url}
          vars={vars}
          environmentName={environment?.name ?? null}
          placeholder="https://api.example.com/resource"
          onChange={(url) => edit({ url })}
          onPaste={pasteCurl}
          // Syncing on blur rather than on every keystroke keeps the field from
          // rewriting itself while you are still typing in it.
          onBlur={syncQueryAndParams}
          onSubmit={() => {
            if (sending) return;
            syncQueryAndParams();
            onSend();
          }}
        />

        {sending ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onSend}>
            Send
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'openDialog', dialog: { kind: 'save-request' } })}
        >
          Save
        </button>
      </div>

      <div className="tabstrip" role="tablist" aria-label="Request">
        {TABS.map((entry) => (
          <button
            type="button"
            role="tab"
            key={entry.key}
            className="btn tabstrip-tab"
            aria-selected={tab === entry.key}
            onClick={() => dispatch({ type: 'setBuilderTab', tab: entry.key })}
          >
            {entry.label}
            {counts[entry.key] !== undefined && (
              <span className="tag tag-neutral" style={{ fontSize: 10 }}>
                {counts[entry.key]}
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 8px' }}
          onClick={() => dispatch({ type: 'openDialog', dialog: { kind: 'curl-snippet' } })}
        >
          Curl snippet
        </button>
      </div>

      <div className="builder-panes" ref={panesRef}>
        <div
          className="builder-editor"
          ref={editorRef}
          style={appliedHeight === null ? undefined : { height: appliedHeight, maxHeight: 'none' }}
        >
          {tab === 'params' && (
            <KeyValueEditor
              rows={request.params}
              addLabel="+ Add param"
              onChange={setParams}
            />
          )}
          {tab === 'headers' && (
            <KeyValueEditor
              rows={request.headers}
              addLabel="+ Add header"
              keyPlaceholder="header"
              warningFor={(row) => headerWarning(row.key)}
              onChange={(headers) => edit({ headers })}
            />
          )}
          {tab === 'body' && (
            <BodyEditor
              body={request.body}
              disabled={bodyless}
              files={files}
              onChange={(body) => edit({ body })}
            />
          )}
          {tab === 'auth' && (
            <AuthEditor auth={request.auth} onChange={(auth) => edit({ auth })} />
          )}
        </div>

        <PaneSplitter panesRef={panesRef} currentHeight={measuredEditorHeight} />

        <ResponsePane response={response} />
      </div>
    </div>
  );
}
