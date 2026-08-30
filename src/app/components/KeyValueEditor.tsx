import { newId } from '../../lib/ids';
import type { KeyValue } from '../../lib/types';

/**
 * The one editor behind params, headers, urlencoded bodies and environment
 * variables. Rows are addressed by id rather than index so React never
 * reassigns an input's identity when a row above it is removed.
 */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
  addLabel,
  warningFor,
}: {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel: string;
  /** Optional per-row note, e.g. a header the browser refuses to send. */
  warningFor?: (row: KeyValue) => string | null;
}) {
  const patch = (id: string, changes: Partial<KeyValue>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  return (
    <div>
      {rows.map((row) => {
        const warning = warningFor?.(row) ?? null;
        return (
          <div key={row.id}>
            <div className="kv-row">
              <input
                className="check"
                type="checkbox"
                checked={row.enabled}
                aria-label={row.key ? `Enable ${row.key}` : 'Enable row'}
                onChange={(e) => patch(row.id, { enabled: e.target.checked })}
              />
              <input
                className="input mono"
                type="text"
                placeholder={keyPlaceholder}
                aria-label={keyPlaceholder}
                value={row.key}
                onChange={(e) => patch(row.id, { key: e.target.value })}
              />
              <input
                className="input mono"
                type="text"
                placeholder={valuePlaceholder}
                aria-label={valuePlaceholder}
                value={row.value}
                onChange={(e) => patch(row.id, { value: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-icon"
                aria-label={row.key ? `Remove ${row.key}` : 'Remove row'}
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                ×
              </button>
            </div>
            {warning && <div className="kv-warning mono">{warning}</div>}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange([...rows, { id: newId(), key: '', value: '', enabled: true }])}
      >
        {addLabel}
      </button>
    </div>
  );
}
