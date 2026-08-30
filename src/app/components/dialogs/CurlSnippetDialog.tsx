import { useState } from 'react';
import { toCurl } from '../../../lib/curl/toCurl';
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
  const { dispatch } = useStore();
  const request = useActiveRequest();
  const [command, setCommand] = useState(() => toCurl(request));
  const close = () => dispatch({ type: 'closeDialog' });

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
    </Dialog>
  );
}
