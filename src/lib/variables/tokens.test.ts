import { describe, expect, it } from 'vitest';
import { resolve } from './resolve';
import { findVariables } from './tokens';

const slice = (text: string, t: { from: number; to: number }) => text.slice(t.from, t.to);
const name = (text: string, t: { nameFrom: number; nameTo: number }) =>
  text.slice(t.nameFrom, t.nameTo);

describe('findVariables', () => {
  it('finds nothing in a url without variables', () => {
    expect(findVariables('https://api.github.com/repos/a/b')).toEqual([]);
  });

  it('locates the braces and the name separately', () => {
    const text = '{{baseUrl}}/repos';
    const [token] = findVariables(text);
    expect(slice(text, token!)).toBe('{{baseUrl}}');
    expect(name(text, token!)).toBe('baseUrl');
    expect(token!.name).toBe('baseUrl');
  });

  it('finds every variable in order', () => {
    const text = '{{baseUrl}}/repos/{{owner}}/{{repo}}/issues';
    expect(findVariables(text).map((t) => t.name)).toEqual(['baseUrl', 'owner', 'repo']);
  });

  it('excludes padding from the name but not from the token', () => {
    const text = 'x/{{  owner  }}/y';
    const [token] = findVariables(text);
    expect(slice(text, token!)).toBe('{{  owner  }}');
    expect(name(text, token!)).toBe('owner');
  });

  // A name may begin with `{` — the pattern forbids only `}` and whitespace —
  // so locating it by searching the match would land on the wrong brace.
  it('locates a name that itself starts with a brace', () => {
    const text = '{{{a}}';
    const [token] = findVariables(text);
    expect(name(text, token!)).toBe('{a');
    expect(token!.nameFrom).toBe(2);
  });

  it('ignores unclosed and empty braces', () => {
    expect(findVariables('{{unclosed')).toEqual([]);
    expect(findVariables('{{}}')).toEqual([]);
    expect(findVariables('{{ }}')).toEqual([]);
  });

  it('does not carry regex state between calls', () => {
    const text = '{{a}}/{{b}}';
    expect(findVariables(text).map((t) => t.name)).toEqual(['a', 'b']);
    expect(findVariables(text).map((t) => t.name)).toEqual(['a', 'b']);
  });

  // The whole point of sharing the pattern: what is coloured as a variable and
  // what is substituted at send time must be the same set, always.
  it('agrees with the resolver about what is a variable', () => {
    const text = '{{baseUrl}}/x/{{ owner }}/{{missing}}/{{unclosed';
    const found = findVariables(text).map((t) => t.name);
    const { missing } = resolve(text, { baseUrl: 'https://api.github.com', owner: 'triskintech' });
    expect(found).toEqual(['baseUrl', 'owner', 'missing']);
    expect(missing).toEqual(['missing']);
  });
});
