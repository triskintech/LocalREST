import { describe, expect, it } from 'vitest';
import { responseFilename } from './filename';

const at = new Date('2026-08-09T09:15:30Z');

describe('responseFilename', () => {
  it('uses the path and a timestamp', () => {
    expect(responseFilename('https://api.test/v1/items', 'application/json', at)).toBe(
      'v1-items-2026-08-09-09-15-30.json',
    );
  });

  it('picks the extension from the content type', () => {
    const name = (type: string) => responseFilename('https://api.test/x', type, at);
    expect(name('application/json; charset=utf-8')).toMatch(/\.json$/);
    expect(name('text/html')).toMatch(/\.html$/);
    expect(name('application/xml')).toMatch(/\.xml$/);
    expect(name('text/csv')).toMatch(/\.csv$/);
    expect(name('text/plain')).toMatch(/\.txt$/);
    expect(name('')).toMatch(/\.txt$/);
  });

  it('falls back when the path is empty', () => {
    expect(responseFilename('https://api.test/', 'application/json', at)).toBe(
      'response-2026-08-09-09-15-30.json',
    );
  });

  it('survives a url it cannot parse', () => {
    expect(responseFilename('not a url', 'text/plain', at)).toBe(
      'not-a-url-2026-08-09-09-15-30.txt',
    );
  });

  it('strips characters that do not belong in a filename', () => {
    expect(responseFilename('https://api.test/a b/c?d=1', 'text/plain', at)).toBe(
      'a-b-c-2026-08-09-09-15-30.txt',
    );
  });
});
