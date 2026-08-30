import type { Auth, AuthType } from '../../lib/types';

const TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
];

export function AuthEditor({
  auth,
  onChange,
}: {
  auth: Auth;
  onChange: (auth: Auth) => void;
}) {
  const patch = (changes: Partial<Auth>) => onChange({ ...auth, ...changes });

  return (
    <div>
      <div className="seg" style={{ marginBottom: 'var(--space-3)' }}>
        {TYPES.map((type) => (
          <label className="seg-opt" key={type.value}>
            <input
              type="radio"
              name="auth-type"
              checked={auth.type === type.value}
              onChange={() => patch({ type: type.value })}
            />
            {type.label}
          </label>
        ))}
      </div>

      {auth.type === 'bearer' && (
        <div className="field">
          <label htmlFor="auth-token">Token</label>
          <input
            id="auth-token"
            className="input mono"
            type="text"
            value={auth.token}
            onChange={(e) => patch({ token: e.target.value })}
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              className="input mono"
              type="text"
              value={auth.username}
              onChange={(e) => patch({ username: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="input mono"
              type="password"
              value={auth.password}
              onChange={(e) => patch({ password: e.target.value })}
            />
          </div>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="auth-key">Key</label>
            <input
              id="auth-key"
              className="input mono"
              type="text"
              value={auth.key}
              onChange={(e) => patch({ key: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="auth-value">Value</label>
            <input
              id="auth-value"
              className="input mono"
              type="text"
              value={auth.value}
              onChange={(e) => patch({ value: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label htmlFor="auth-in">Send in</label>
            <select
              id="auth-in"
              className="input"
              value={auth.apiKeyIn}
              onChange={(e) =>
                patch({ apiKeyIn: e.target.value === 'query' ? 'query' : 'header' })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
