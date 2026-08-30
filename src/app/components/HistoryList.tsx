import { useStore } from '../state/store';
import { MethodChip } from './MethodChip';

/** "just now" / "8m ago" / "3h ago" / "2d ago". */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function HistoryList() {
  const { state, dispatch } = useStore();
  const { history } = state.data;

  if (history.length === 0) {
    return (
      <div className="state-center">
        <div className="state-title">No history yet</div>
        <p className="state-detail text-muted">
          Every request you send lands here, so you can pull one back without rebuilding it.
        </p>
      </div>
    );
  }

  return (
    <div>
      {history.map((entry) => (
        <button
          type="button"
          className="btn history-row"
          key={entry.id}
          onClick={() => dispatch({ type: 'restoreFromHistory', id: entry.id })}
        >
          <MethodChip method={entry.method} />
          <div className="history-meta">
            <div className="history-url mono">{entry.url}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {entry.status === 0 ? 'failed' : entry.status} · {relativeTime(entry.at)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
