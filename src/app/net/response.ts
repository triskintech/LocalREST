export type ResponseHeader = { key: string; value: string };

export type ResponseSuccess = {
  kind: 'success';
  /** The final URL requested, used to name a saved response file. */
  url: string;
  status: number;
  statusText: string;
  headers: ResponseHeader[];
  /** Pretty-printed when the body parsed as JSON, otherwise verbatim. */
  bodyText: string;
  /** The body exactly as it arrived, for saving it to disk. */
  rawBodyText: string;
  /** True when the body was too large to render in full. */
  truncated: boolean;
  timeMs: number;
  sizeBytes: number;
};

/**
 * A request that never produced a response. Carries a title for the status
 * strip and a detail line that says what to do about it — errors don't
 * apologise and are never vague.
 */
export type ResponseFailure = {
  kind: 'failure';
  title: string;
  detail: string;
  timeMs: number;
};

export type ResponseResult = ResponseSuccess | ResponseFailure;

export type ResponseState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'done'; result: ResponseResult };

export type StatusTone = 'ok' | 'redirect' | 'client-error' | 'server-error' | 'unknown';

/** Which band a status code falls in, for colouring it. */
export function statusTone(status: number): StatusTone {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500 && status < 600) return 'server-error';
  return 'unknown';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}
