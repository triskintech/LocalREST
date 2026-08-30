import { useState } from 'react';
import { FormDataEditor } from './FormDataEditor';
import { JsonBodyEditor } from './JsonBodyEditor';
import { KeyValueEditor } from './KeyValueEditor';
import type { Body, BodyMode } from '../../lib/types';

const MODES: { value: BodyMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form-data', label: 'Form data' },
  { value: 'x-www-form-urlencoded', label: 'Urlencoded' },
];

export function BodyEditor({
  body,
  disabled,
  files,
  onChange,
}: {
  body: Body;
  /** GET and HEAD never carry a body. */
  disabled: boolean;
  /** Session-only file handles for form-data fields. */
  files: Map<string, File>;
  onChange: (body: Body) => void;
}) {
  const [prettifyError, setPrettifyError] = useState<string | null>(null);

  if (disabled) {
    return (
      <p className="text-muted mono" style={{ fontSize: 13, margin: 0 }}>
        This method does not send a body.
      </p>
    );
  }

  const prettify = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(body.raw), null, 2);
      setPrettifyError(null);
      onChange({ ...body, raw: formatted });
    } catch (e) {
      setPrettifyError(e instanceof Error ? e.message : 'That is not valid JSON.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <div className="seg seg-compact">
          {MODES.map((mode) => (
            <label className="seg-opt" key={mode.value}>
              <input
                type="radio"
                name="body-mode"
                checked={body.mode === mode.value}
                onChange={() => onChange({ ...body, mode: mode.value })}
              />
              {mode.label}
            </label>
          ))}
        </div>

        {body.mode === 'json' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {prettifyError && (
              <span className="kv-warning mono" style={{ fontSize: 11 }}>
                {prettifyError}
              </span>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 8px' }}
              onClick={prettify}
            >
              Prettify
            </button>
          </div>
        )}
      </div>

      {body.mode === 'json' && (
        <JsonBodyEditor
          value={body.raw}
          onChange={(raw) => {
            setPrettifyError(null);
            onChange({ ...body, raw });
          }}
        />
      )}

      {body.mode === 'text' && (
        <textarea
          className="input mono body-textarea"
          aria-label="Request body"
          placeholder="Raw body"
          value={body.raw}
          onChange={(e) => onChange({ ...body, raw: e.target.value })}
        />
      )}

      {body.mode === 'x-www-form-urlencoded' && (
        <KeyValueEditor
          rows={body.urlencoded}
          addLabel="+ Add field"
          keyPlaceholder="field"
          onChange={(urlencoded) => onChange({ ...body, urlencoded })}
        />
      )}

      {body.mode === 'form-data' && (
        <FormDataEditor
          rows={body.formData}
          files={files}
          onChange={(formData) => onChange({ ...body, formData })}
        />
      )}
    </div>
  );
}
