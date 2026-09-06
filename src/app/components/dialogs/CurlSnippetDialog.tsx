import { useEffect, useMemo, useState } from 'react';
import { toCurl } from '../../../lib/curl/toCurl';
import { environmentVars } from '../../../lib/variables/resolve';
import { copyText } from '../../net/download';
import { useActiveRequest, useStore } from '../../state/store';
import { Dialog } from '../Dialog';

/**
 * The active request as the curl command "Copy as curl" produces, shown in
 * an editable, scrollable box instead of only copied straight to the
 * clipboard. Edits here are local to the dialog — Copy takes whatever is
 * currently in the box, matching the way a terminal command is usually
 * tweaked right before it's used.
 */
export function CurlSnippetDialog() {
  const { state, dispatch } = useStore();
  const request = useActiveRequest();
  const close = () => dispatch({ type: 'closeDialog' });

  const resolveVariables = state.data.resolveCurlVariables;
  const environment = state.data.environments.find(
    (each) => each.id === state.data.activeEnvironmentId,
  );
  const vars = useMemo(
    () => (resolveVariables ? environmentVars(environment) : {}),
    [resolveVariables, environment],
  );

  const [command, setCommand] = useState(() => toCurl(request, vars));

  // Flipping the toggle changes what the command is made of, so it is rebuilt
  // rather than patched — and any hand edit in the box goes with it. A command
  // half in one form and half in the other would be worse than either.
  useEffect(() => {
    setCommand(toCurl(request, vars));
  }, [request, vars]);

  const copy = async () => {
    const ok = await copyText(command);
    dispatch({ type: 'toast', message: ok ? 'Copied as curl.' : 'Could not reach the clipboard.' });
  };

  return (
    <Dialog
      title="Curl snippet"
      onClose={close}
      wide
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void copy()}>
            Copy
          </button>
        </>
      }
    >
      <textarea
        className="input mono curl-snippet"
        aria-label="Curl command"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        spellCheck={false}
      />

      {/* Only shown when there is an environment to resolve against: a switch
          that cannot change the command is a puzzle, not a control. */}
      {environment && (
        <label className="curl-snippet-option">
          <input
            type="checkbox"
            className="check"
            checked={resolveVariables}
            onChange={(e) =>
              dispatch({ type: 'setResolveCurlVariables', enabled: e.target.checked })
            }
          />
          <span>
            Fill in values from {environment.name}
            {resolveVariables ? '' : ' — the command keeps its {{variables}}'}
          </span>
        </label>
      )}
    </Dialog>
  );
}
