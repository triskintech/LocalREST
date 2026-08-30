import { useStore } from '../state/store';
import { Menu } from './Menu';
import { SettingsPanel } from './SettingsPanel';
import { Wordmark } from './Wordmark';

/**
 * Brand, storage chip, theme, environment selector, Import menu, New request.
 *
 * The design showed two separate import buttons; they collapse into one menu
 * here to pay for the environment selector without crowding the bar.
 */
export function TopBar() {
  const { state, dispatch } = useStore();
  const { environments, activeEnvironmentId } = state.data;

  return (
    <div className="nav">
      <div className="nav-brand">
        <Wordmark />
      </div>
      <div className="tag tag-outline mono">saved in this browser</div>

      <div className="nav-tools">
        <select
          className="input env-select"
          aria-label="Active environment"
          value={activeEnvironmentId ?? ''}
          onChange={(e) =>
            dispatch({ type: 'setActiveEnvironment', id: e.target.value || null })
          }
        >
          <option value="">No environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>

        <Menu
          label="Import"
          trigger={<>Import ▾</>}
          items={[
            {
              kind: 'item',
              label: 'curl command',
              onSelect: () => dispatch({ type: 'openDialog', dialog: { kind: 'import-curl' } }),
            },
            {
              kind: 'item',
              label: 'Postman collection',
              onSelect: () =>
                dispatch({ type: 'openDialog', dialog: { kind: 'import-collection' } }),
            },
            { kind: 'separator' },
            {
              kind: 'item',
              label: 'Environments…',
              onSelect: () => dispatch({ type: 'openDialog', dialog: { kind: 'environments' } }),
            },
            {
              kind: 'item',
              label: 'Backup & data…',
              onSelect: () => dispatch({ type: 'openDialog', dialog: { kind: 'backup' } }),
            },
          ]}
        />

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: 'newTab' })}
        >
          + New request
        </button>

        <Menu
          label="Settings"
          triggerClassName="btn btn-icon btn-icon-lg"
          trigger={<>⚙</>}
          panelClassName="menu-settings"
          panelRole="group"
          items={[{ kind: 'custom', content: <SettingsPanel /> }]}
        />
      </div>
    </div>
  );
}
