import { describe, expect, it } from 'vitest';
import { uninstallUrl } from './uninstallUrl';

describe('uninstallUrl', () => {
  it('registers nothing while the feedback page does not exist', () => {
    expect(uninstallUrl('', '1.0.0')).toBeNull();
    expect(uninstallUrl('   ', '1.0.0')).toBeNull();
  });

  it('carries the version being left behind', () => {
    expect(uninstallUrl('https://example.test/bye', '0.4.0')).toBe(
      'https://example.test/bye?v=0.4.0',
    );
  });

  it('keeps a query the form already needs', () => {
    expect(uninstallUrl('https://example.test/f?id=abc', '0.4.0')).toBe(
      'https://example.test/f?id=abc&v=0.4.0',
    );
  });

  it('replaces rather than repeats an existing v', () => {
    expect(uninstallUrl('https://example.test/f?v=old', '0.4.0')).toBe(
      'https://example.test/f?v=0.4.0',
    );
  });

  it('omits the version when there is none to report', () => {
    expect(uninstallUrl('https://example.test/bye', '')).toBe('https://example.test/bye');
  });

  // A typo in the base must not become an uninstall-time navigation to
  // something unexpected, so anything that is not plain https is refused.
  it('refuses a non-https or unparseable base', () => {
    expect(uninstallUrl('http://example.test/bye', '1.0.0')).toBeNull();
    expect(uninstallUrl('javascript:alert(1)', '1.0.0')).toBeNull();
    expect(uninstallUrl('not a url', '1.0.0')).toBeNull();
    expect(uninstallUrl('//example.test/bye', '1.0.0')).toBeNull();
  });
});
