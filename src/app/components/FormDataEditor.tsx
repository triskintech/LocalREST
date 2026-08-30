import { useRef } from 'react';
import { newId } from '../../lib/ids';
import type { FormField } from '../../lib/types';

/**
 * Form-data rows. A picked File is held in a session-only map keyed by field
 * id — only the filename is persisted, so after a reload the row shows what
 * was chosen and asks for it again rather than pretending it still has it.
 */
export function FormDataEditor({
  rows,
  files,
  onChange,
}: {
  rows: FormField[];
  files: Map<string, File>;
  onChange: (rows: FormField[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null);

  const patch = (id: string, changes: Partial<FormField>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  const pickFile = (id: string) => {
    pendingId.current = id;
    inputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const id = pendingId.current;
          if (file && id) {
            files.set(id, file);
            patch(id, { fileName: file.name });
          }
          event.target.value = '';
        }}
      />

      {rows.map((row) => {
        const attached = files.has(row.id);
        return (
          <div key={row.id}>
            <div className="kv-row">
              <input
                className="check"
                type="checkbox"
                checked={row.enabled}
                aria-label={row.key ? `Enable ${row.key}` : 'Enable field'}
                onChange={(e) => patch(row.id, { enabled: e.target.checked })}
              />
              <input
                className="input mono"
                type="text"
                placeholder="field"
                aria-label="field"
                value={row.key}
                onChange={(e) => patch(row.id, { key: e.target.value })}
              />

              {row.kind === 'text' ? (
                <input
                  className="input mono"
                  type="text"
                  placeholder="value"
                  aria-label="value"
                  value={row.value}
                  onChange={(e) => patch(row.id, { value: e.target.value })}
                />
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
                  onClick={() => pickFile(row.id)}
                >
                  {row.fileName ? (attached ? row.fileName : `${row.fileName} — choose again`) : 'Choose file…'}
                </button>
              )}

              <select
                className="input"
                style={{ width: 90, flex: 'none' }}
                aria-label="Field type"
                value={row.kind}
                onChange={(e) => {
                  const kind = e.target.value === 'file' ? 'file' : 'text';
                  files.delete(row.id);
                  patch(row.id, { kind, value: '', fileName: undefined });
                }}
              >
                <option value="text">Text</option>
                <option value="file">File</option>
              </select>

              <button
                type="button"
                className="btn btn-icon"
                aria-label={row.key ? `Remove ${row.key}` : 'Remove field'}
                onClick={() => {
                  files.delete(row.id);
                  onChange(rows.filter((r) => r.id !== row.id));
                }}
              >
                ×
              </button>
            </div>

            {row.kind === 'file' && row.fileName && !attached && (
              <div className="kv-warning mono">
                Files are not saved with the request. Choose “{row.fileName}” again to send it.
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() =>
          onChange([
            ...rows,
            { id: newId(), key: '', value: '', enabled: true, kind: 'text' },
          ])
        }
      >
        + Add field
      </button>
    </div>
  );
}
