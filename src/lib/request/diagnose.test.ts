import { describe, expect, it } from 'vitest';
import { diagnoseFetchFailure, type FetchFailureSignals } from './diagnose';

const signals = (overrides: Partial<FetchFailureSignals> = {}): FetchFailureSignals => ({
  host: 'postman-echo.com',
  message: 'Failed to fetch',
  hostPermission: null,
  online: true,
  reachable: null,
  ...overrides,
});

describe('diagnoseFetchFailure', () => {
  it('blames a narrowed site access before anything else', () => {
    // Chrome lets the user revoke site access after install, and that failure
    // looks identical to every other one — but it is the only one the user
    // fixes somewhere other than in their request.
    const d = diagnoseFetchFailure(signals({ hostPermission: false, online: false }));
    expect(d.title).toBe('No access to this host');
    expect(d.detail).toContain('chrome://extensions');
  });

  it('reports being offline when the browser says so', () => {
    expect(diagnoseFetchFailure(signals({ online: false })).title).toBe('Offline');
  });

  // The case that sent this whole investigation sideways: the host answered
  // in 400ms and we told the user nothing answered.
  it('names a cross-origin block when the host proved reachable', () => {
    const d = diagnoseFetchFailure(signals({ reachable: true }));
    expect(d.title).toBe('Blocked by the browser');
    expect(d.detail).toContain('postman-echo.com');
    expect(d.detail).toMatch(/cross-origin|CORS/i);
  });

  it('never claims nothing answered when something did', () => {
    const d = diagnoseFetchFailure(signals({ reachable: true }));
    expect(d.detail).not.toMatch(/nothing answered/i);
  });

  it('tells the user the installed extension is not subject to the block', () => {
    const d = diagnoseFetchFailure(signals({ reachable: true, hostPermission: null }));
    expect(d.detail).toMatch(/extension/i);
  });

  // Inside the extension host permissions already bypass CORS, so a reachable
  // host that still fails is not a CORS story and must not be told as one.
  it('does not blame CORS inside the extension', () => {
    const d = diagnoseFetchFailure(signals({ reachable: true, hostPermission: true }));
    expect(d.title).not.toBe('Blocked by the browser');
    expect(d.detail).not.toMatch(/CORS/i);
  });

  // ...but it must not swing to the opposite lie either. Falling through to
  // the connection message told the user nothing answered about a host the
  // probe had just proved answers — the exact failure this file exists to
  // prevent, only pointed at the other machine.
  it('never claims nothing answered inside the extension either', () => {
    const d = diagnoseFetchFailure(signals({ reachable: true, hostPermission: true }));
    expect(d.detail).not.toMatch(/nothing answered/i);
    expect(d.detail).toMatch(/reachable/i);
    expect(d.detail).toContain('postman-echo.com');
  });

  it('still says nothing answered inside the extension when the probe failed too', () => {
    const d = diagnoseFetchFailure(signals({ reachable: false, hostPermission: true }));
    expect(d.title).toBe('Could not connect');
    expect(d.detail).toMatch(/nothing answered/i);
  });

  it('falls back to a connection failure when the probe also failed', () => {
    const d = diagnoseFetchFailure(signals({ reachable: false }));
    expect(d.title).toBe('Could not connect');
    expect(d.detail).toContain('postman-echo.com');
  });

  it('falls back to a connection failure when the probe was inconclusive', () => {
    expect(diagnoseFetchFailure(signals({ reachable: null })).title).toBe('Could not connect');
  });

  it('quotes the browser message so the console and the pane agree', () => {
    const d = diagnoseFetchFailure(signals({ reachable: null, message: 'Load failed' }));
    expect(d.detail).toContain('Load failed');
  });
});
