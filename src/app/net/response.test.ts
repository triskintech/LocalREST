import { describe, expect, it } from 'vitest';
import { formatSize, statusTone } from './response';

describe('statusTone', () => {
  it('treats the 2xx band as success', () => {
    expect(statusTone(200)).toBe('ok');
    expect(statusTone(201)).toBe('ok');
    expect(statusTone(204)).toBe('ok');
    expect(statusTone(299)).toBe('ok');
  });

  it('treats redirects separately from success and failure', () => {
    expect(statusTone(301)).toBe('redirect');
    expect(statusTone(304)).toBe('redirect');
  });

  it('separates client from server errors', () => {
    expect(statusTone(400)).toBe('client-error');
    expect(statusTone(401)).toBe('client-error');
    expect(statusTone(404)).toBe('client-error');
    expect(statusTone(500)).toBe('server-error');
    expect(statusTone(503)).toBe('server-error');
  });

  it('has a band for anything outside the ranges', () => {
    expect(statusTone(0)).toBe('unknown');
    expect(statusTone(100)).toBe('unknown');
    expect(statusTone(600)).toBe('unknown');
  });

  it('puts the boundaries in the right band', () => {
    expect(statusTone(199)).toBe('unknown');
    expect(statusTone(300)).toBe('redirect');
    expect(statusTone(399)).toBe('redirect');
    expect(statusTone(499)).toBe('client-error');
    expect(statusTone(599)).toBe('server-error');
  });
});

describe('formatSize', () => {
  it('uses bytes below a kilobyte', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(537)).toBe('537 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('switches to kilobytes at a kilobyte', () => {
    expect(formatSize(1024)).toBe('1.00 KB');
    expect(formatSize(2714)).toBe('2.65 KB');
  });
});
