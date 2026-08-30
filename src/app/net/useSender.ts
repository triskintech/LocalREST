import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRequest } from '../../lib/request/buildRequest';
import { environmentVars } from '../../lib/variables/resolve';
import { newId } from '../../lib/ids';
import type { ApiRequest, HistoryEntry } from '../../lib/types';
import { activeRequest, activeTab, useStore } from '../state/store';
import { execute } from './execute';
import { requestHostAccess } from './hostAccess';
import { hostOf } from '../../lib/request/hostPattern';
import type { ResponseState } from './response';

const IDLE: ResponseState = { phase: 'idle' };

export type Sender = {
  response: ResponseState;
  sending: boolean;
  send: () => void;
  cancel: () => void;
};

/**
 * Responses are keyed by tab and never persisted, so a new tab, an imported
 * request and a reopened app all start blank instead of showing a reply that
 * belongs to some other request.
 */
export function useSender(files: ReadonlyMap<string, File>): Sender {
  const { state, dispatch } = useStore();
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const controllers = useRef(new Map<string, AbortController>());

  const tabId = activeTab(state)?.id ?? null;
  const response = (tabId && responses[tabId]) || IDLE;

  const setFor = (id: string, next: ResponseState) =>
    setResponses((current) => ({ ...current, [id]: next }));

  const cancel = useCallback(() => {
    if (!tabId) return;
    controllers.current.get(tabId)?.abort();
  }, [tabId]);

  /**
   * A closed tab's request is nobody's request. Without this the fetch ran to
   * its 60-second timeout with no one left to show the answer to, and both
   * maps grew for the life of the session.
   */
  const tabs = state.data.tabs;
  useEffect(() => {
    const open = new Set(tabs.map((tab) => tab.id));

    for (const [id, controller] of [...controllers.current]) {
      if (open.has(id)) continue;
      controller.abort();
      controllers.current.delete(id);
    }

    setResponses((current) => {
      const stale = Object.keys(current).filter((id) => !open.has(id));
      if (stale.length === 0) return current;
      const next = { ...current };
      for (const id of stale) delete next[id];
      return next;
    });
  }, [tabs]);

  const send = useCallback(() => {
    if (!tabId) return;

    const request: ApiRequest = activeRequest(state);
    const environment = state.data.environments.find(
      (e) => e.id === state.data.activeEnvironmentId,
    );
    const built = buildRequest(request, environmentVars(environment), files);

    if (built.error) {
      setFor(tabId, {
        phase: 'done',
        result: { kind: 'failure', title: 'Cannot send', detail: built.error, timeMs: 0 },
      });
      return;
    }

    if (built.missing.length > 0) {
      dispatch({
        type: 'toast',
        message: `No value for ${built.missing.map((n) => `{{${n}}}`).join(', ')}.`,
      });
    }

    // Sending again supersedes whatever this tab had in flight. Left running,
    // the old request held a connection to its timeout and — for anything but
    // a GET — the server still carried out work whose answer is discarded.
    controllers.current.get(tabId)?.abort();

    const controller = new AbortController();
    controllers.current.set(tabId, controller);
    setFor(tabId, { phase: 'sending' });

    // Called here, before anything is awaited, because Chrome only honours a
    // permission request inside the user gesture that reached this line. The
    // extension declares no host permissions, so this is what grants access
    // to an origin the first time a request goes to it; on every later send
    // it resolves straight through without a prompt.
    void requestHostAccess(built.url)
      .then((access) => {
        if (controllers.current.get(tabId) !== controller) return null;

        // Nothing was sent, so this is shown but not recorded: history is
        // the requests that actually went out, which is what makes replaying
        // one from it meaningful. A request rejected by buildRequest above is
        // left out for the same reason.
        if (access === 'denied') {
          const host = hostOf(built.url);
          controllers.current.delete(tabId);
          setFor(tabId, {
            phase: 'done',
            result: {
              kind: 'failure',
              title: 'Access not granted',
              detail: `LocalREST asked for access to ${host} and it was declined, so the request was not sent. Send again and choose Allow — or, to stop being asked per host, use Settings ⚙ → Site access → Allow all sites.`,
              timeMs: 0,
            },
          });
          return null;
        }

        return execute(built, controller.signal);
      })
      .then((result) => {
        // Null means a newer send on the same tab already superseded this one.
        if (result === null) return;
        if (controllers.current.get(tabId) !== controller) return;
        controllers.current.delete(tabId);
        setFor(tabId, { phase: 'done', result });

        const entry: HistoryEntry = {
          id: newId(),
          method: request.method,
          url: built.url,
          status: result.kind === 'success' ? result.status : 0,
          timeMs: result.timeMs,
          at: Date.now(),
          snapshot: request,
        };
        dispatch({ type: 'recordHistory', entry });
      });
  }, [tabId, state, dispatch, files]);

  return { response, sending: response.phase === 'sending', send, cancel };
}
