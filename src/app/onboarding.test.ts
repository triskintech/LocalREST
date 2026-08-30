import { describe, expect, it } from 'vitest';
import { coerceOnboarding } from './onboarding';

describe('coerceOnboarding', () => {
  it('reads a missing store as a first run', () => {
    expect(coerceOnboarding(undefined)).toEqual({ siteAccessAsked: false });
    expect(coerceOnboarding(null)).toEqual({ siteAccessAsked: false });
  });

  it('reads junk as a first run rather than throwing', () => {
    expect(coerceOnboarding('yes')).toEqual({ siteAccessAsked: false });
    expect(coerceOnboarding(42)).toEqual({ siteAccessAsked: false });
    expect(coerceOnboarding([])).toEqual({ siteAccessAsked: false });
  });

  it('remembers that the choice was made', () => {
    expect(coerceOnboarding({ siteAccessAsked: true })).toEqual({ siteAccessAsked: true });
  });

  // Only a literal true suppresses the panel: a truthy leftover from some
  // other shape must not silently cost someone the one time they are asked.
  it('treats a truthy non-boolean as not yet asked', () => {
    expect(coerceOnboarding({ siteAccessAsked: 'true' })).toEqual({ siteAccessAsked: false });
    expect(coerceOnboarding({ siteAccessAsked: 1 })).toEqual({ siteAccessAsked: false });
  });

  it('ignores unrelated keys', () => {
    expect(coerceOnboarding({ other: 'x' })).toEqual({ siteAccessAsked: false });
  });
});
