import { describe, expect, it } from 'vitest';
import { isUnnamed, requestLabel } from './label';

describe('requestLabel', () => {
  it('prefers a name the user gave it', () => {
    expect(requestLabel({ name: 'Create order', url: 'https://api.test/orders' })).toBe(
      'Create order',
    );
  });

  it('falls back to the URL when there is no name', () => {
    expect(requestLabel({ name: '', url: 'https://api.test/orders' })).toBe(
      'https://api.test/orders',
    );
  });

  it('treats a whitespace-only name as no name', () => {
    expect(requestLabel({ name: '   ', url: 'https://api.test/orders' })).toBe(
      'https://api.test/orders',
    );
  });

  it('trims a name rather than rendering the padding', () => {
    expect(requestLabel({ name: '  Create order  ', url: '' })).toBe('Create order');
  });

  // A brand new tab has neither, and an empty sidebar row is unclickable.
  it('has something to say when both are empty', () => {
    expect(requestLabel({ name: '', url: '' })).toBe('Untitled request');
  });

  it('shows an unresolved template rather than hiding it', () => {
    expect(requestLabel({ name: '', url: '{{baseUrl}}/orders' })).toBe('{{baseUrl}}/orders');
  });
});

describe('isUnnamed', () => {
  it.each([
    ['', true],
    ['   ', true],
    ['Create order', false],
  ])('%o -> %o', (name, expected) => {
    expect(isUnnamed({ name })).toBe(expected);
  });
});
