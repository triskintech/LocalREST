import type { Method } from '../../lib/types';

/**
 * Method is encoded by weight and fill, not hue: the palette has a single
 * accent and no green or orange to borrow. Safe reads recede, writes advance,
 * destruction is darkest.
 */
function tone(method: Method): 'read' | 'write' | 'destroy' {
  if (method === 'DELETE') return 'destroy';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  return 'write';
}

export function MethodChip({ method, compact = false }: { method: Method; compact?: boolean }) {
  return (
    <span className={`method method-${tone(method)}${compact ? ' method-compact' : ''} mono`}>
      {method}
    </span>
  );
}
