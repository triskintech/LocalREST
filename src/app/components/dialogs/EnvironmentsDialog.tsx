import { useState } from 'react';
import { newId } from '../../../lib/ids';
import type { Environment } from '../../../lib/types';
import { useStore } from '../../state/store';
import { Dialog } from '../Dialog';
import { KeyValueEditor } from '../KeyValueEditor';

export function EnvironmentsDialog() {
  const { state, dispatch } = useStore();
  const [environments, setEnvironments] = useState<Environment[]>(state.data.environments);
  const [selectedId, setSelectedId] = useState<string | null>(
    state.data.activeEnvironmentId ?? state.data.environments[0]?.id ?? null,
  );
  /**
   * Which environment Delete is armed for — an id rather than a flag, so
   * switching the picker disarms it for free instead of needing an effect to
   * notice and reset.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const close = () => dispatch({ type: 'closeDialog' });
  const selected = environments.find((e) => e.id === selectedId);
  const confirming = selected !== undefined && confirmId === selected.id;

  const addEnvironment = () => {
    const created: Environment = { id: newId(), name: 'New environment', variables: [] };
    setEnvironments([...environments, created]);
    setSelectedId(created.id);
  };

  const patchSelected = (changes: Partial<Environment>) => {
    if (!selected) return;
    setEnvironments(environments.map((e) => (e.id === selected.id ? { ...e, ...changes } : e)));
  };

  /**
   * Two clicks, because the first one is easy to make by accident and Cancel
   * is the only way back — a variable set is typed by hand and nothing else in
   * the app remembers it. Arming names the environment so the second click is
   * a decision about something specific rather than a reflex.
   */
  const removeSelected = () => {
    if (!selected) return;
    if (!confirming) {
      setConfirmId(selected.id);
      return;
    }
    const remaining = environments.filter((e) => e.id !== selected.id);
    setEnvironments(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setConfirmId(null);
  };

  const apply = () => {
    dispatch({ type: 'setEnvironments', environments, activate: selectedId });
    dispatch({ type: 'closeDialog' });
  };

  return (
    <Dialog
      wide
      title="Environments"
      description="Values here fill in {{variables}} anywhere in a request when the environment is selected."
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={apply}>
            Save environments
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="env-picker">Environment</label>
          <select
            id="env-picker"
            className="input"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {environments.length === 0 && <option value="">None yet</option>}
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={addEnvironment}>
          + Add
        </button>
        <button
          type="button"
          className={`btn ${confirming ? 'btn-primary' : 'btn-secondary'}`}
          disabled={!selected}
          onClick={removeSelected}
        >
          {confirming ? 'Delete for good' : 'Delete'}
        </button>
      </div>

      {confirming && selected && (
        <p className="kv-warning" style={{ margin: 0 }}>
          Deleting “{selected.name}”
          {selected.variables.length > 0 &&
            ` and its ${selected.variables.length} variable${
              selected.variables.length === 1 ? '' : 's'
            }`}
          . Click again to confirm, or Cancel to keep it.
        </p>
      )}

      {selected ? (
        <>
          <div className="field">
            <label htmlFor="env-name">Name</label>
            <input
              id="env-name"
              className="input"
              type="text"
              value={selected.name}
              onChange={(e) => patchSelected({ name: e.target.value })}
            />
          </div>
          <div className="dialog-scroll">
            <KeyValueEditor
              rows={selected.variables}
              addLabel="+ Add variable"
              keyPlaceholder="name"
              onChange={(variables) => patchSelected({ variables })}
            />
          </div>
        </>
      ) : (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Add an environment to start defining variables.
        </p>
      )}
    </Dialog>
  );
}
