import { describe, expect, it } from 'vitest';
import { originPattern } from './hostPattern';

describe('originPattern', () => {
  it('names the origin of an https url', () => {
    expect(originPattern('https://api.test/items?page=2')).toBe('https://api.test/*');
  });

  it('keeps a port, so localhost:3000 does not widen to every local port', () => {
    expect(originPattern('http://localhost:8787/get')).toBe('http://localhost:8787/*');
  });

  it('drops the path, query and hash', () => {
    expect(originPattern('https://api.test/a/b?c=1#d')).toBe('https://api.test/*');
  });

  it('ignores userinfo rather than baking it into the pattern', () => {
    expect(originPattern('https://user:pw@api.test/x')).toBe('https://api.test/*');
  });

  it('refuses a scheme the manifest cannot grant', () => {
    expect(originPattern('file:///etc/hosts')).toBeNull();
    expect(originPattern('data:text/plain,hi')).toBeNull();
    expect(originPattern('ftp://files.test/x')).toBeNull();
  });

  it('refuses something that is not a url yet', () => {
    expect(originPattern('{{baseUrl}}/items')).toBeNull();
    expect(originPattern('')).toBeNull();
    expect(originPattern('api.test/items')).toBeNull();
  });
});
