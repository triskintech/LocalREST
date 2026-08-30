import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The version is declared twice: package.json for the toolchain, and
 * public/manifest.json for Chrome — which is the one the store listing, the
 * About row and every uninstall report actually read.
 *
 * Nothing keeps the two in step. A release that bumps one and forgets the
 * other ships a build labelled with the wrong number, and the mismatch only
 * surfaces after upload, when it is expensive to fix.
 *
 * Read from disk rather than imported: these files are outside `src`, and what
 * matters is the bytes that ship, not what the module graph resolves.
 */
function versionOf(path: string): unknown {
  const json: unknown = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  return (json as { version?: unknown }).version;
}

const packageVersion = versionOf('../../package.json');
const manifestVersion = versionOf('../../public/manifest.json');

describe('version', () => {
  it('is declared identically in package.json and the manifest', () => {
    expect(manifestVersion).toBe(packageVersion);
  });

  // Chrome takes one to four dot-separated integers, each 0-65535, with no
  // leading zeros. "1.0.0-beta" is valid semver and is rejected at upload,
  // which is a slow and public way to discover the rule.
  it('is a version string the Chrome Web Store accepts', () => {
    expect(manifestVersion).toMatch(/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/);
    for (const part of String(manifestVersion).split('.')) {
      expect(Number(part)).toBeLessThanOrEqual(65535);
    }
  });
});
