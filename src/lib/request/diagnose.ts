/**
 * Turning one `TypeError: Failed to fetch` into an accurate sentence.
 *
 * `fetch` reports a DNS failure, a refused connection, a TLS error and a
 * blocked cross-origin read as the same opaque error, so the pane used to
 * guess — and guessed "Nothing answered at that host" even when the host had
 * answered in 400ms. Sending someone to check their VPN over a CORS header is
 * the worst kind of wrong: it is confident, and it is about the wrong machine.
 *
 * The signals are gathered by execute.ts and weighed here, where the reasoning
 * is data-in/data-out and can be tested without a network.
 */
export type FetchFailureSignals = {
  host: string;
  /** The browser's own words, quoted so the pane and the console agree. */
  message: string;
  /**
   * Whether the extension holds permission for this origin — null outside the
   * extension, where the question does not apply.
   */
  hostPermission: boolean | null;
  online: boolean;
  /**
   * Whether a no-cors probe reached the host. `true` proves the network is
   * fine and only the read was refused; null when no probe could be run.
   */
  reachable: boolean | null;
};

export type Diagnosis = { title: string; detail: string };

export function diagnoseFetchFailure(signals: FetchFailureSignals): Diagnosis {
  const { host, message, hostPermission, online, reachable } = signals;

  // First, because it is the only cause fixed somewhere other than in the
  // request — and it masquerades as every other cause.
  //
  // Access is asked for per origin at send time, so reaching here means the
  // grant went away between the ask and the request: revoked under Site
  // access while the app stayed open. Sending again re-asks.
  if (hostPermission === false) {
    return {
      title: 'No access to this host',
      detail: `LocalREST does not currently hold access to ${host}, so the browser refused the request. Send again to be asked for it, or grant it under chrome://extensions → LocalREST → Site access.`,
    };
  }

  if (!online) {
    return {
      title: 'Offline',
      detail: 'This browser reports no network connection.',
    };
  }

  // The host answered; only reading the answer was refused.
  if (reachable === true) {
    // Outside the extension that is a CORS story, and naming the missing
    // header is the whole point of running the probe.
    if (hostPermission === null) {
      return {
        title: 'Blocked by the browser',
        detail: `${host} answered, but it sends no access-control-allow-origin header, so the cross-origin (CORS) check stopped this page reading the reply. That is the server's choice — nothing is wrong with your request or your network. The installed extension asks for access to a host as it sends and is not subject to it, so this only bites on the dev page.`,
      };
    }

    // Inside the extension host permissions already bypass CORS, so the cause
    // is something else — but it is emphatically not "nothing answered", which
    // the probe just disproved. Saying so anyway would be the same confident
    // lie about the wrong machine that this file exists to prevent.
    return {
      title: 'Request failed',
      detail: `${host} is reachable — it answered a probe — but the request itself failed with “${message}”. That points at this particular request rather than the host: a redirect to somewhere unreachable, a TLS problem on another origin it forwards to, or a connection dropped mid-response. Full details are in the console (right-click the page → Inspect).`,
    };
  }

  return {
    title: 'Could not connect',
    detail: `Nothing answered at ${host}. The browser said “${message}”, which covers a host needing a VPN, an untrusted TLS certificate, a refused connection and a wrong hostname alike. Full details are in the console (right-click the page → Inspect).`,
  };
}
