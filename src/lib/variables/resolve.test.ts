import { describe, expect, it } from 'vitest';
import { environmentVars, resolve } from './resolve';
import type { Environment } from '../types';

describe('resolve', () => {
  it('substitutes a variable', () => {
    expect(resolve('{{base}}/users', { base: 'https://x.test' }).text).toBe(
      'https://x.test/users',
    );
  });

  it('substitutes the same variable more than once', () => {
    expect(resolve('{{a}}-{{a}}', { a: '1' }).text).toBe('1-1');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(resolve('{{ base }}/x', { base: 'https://x.test' }).text).toBe('https://x.test/x');
  });

  it('leaves an unknown variable in place and reports it', () => {
    const result = resolve('{{base}}/{{missing}}', { base: 'b' });
    expect(result.text).toBe('b/{{missing}}');
    expect(result.missing).toEqual(['missing']);
  });

  it('reports each missing name once', () => {
    expect(resolve('{{a}} {{a}} {{b}}', {}).missing).toEqual(['a', 'b']);
  });

  it('does not re-expand a value that itself looks like a variable', () => {
    // Non-recursive by construction: this is what makes infinite expansion
    // impossible rather than merely unlikely.
    const result = resolve('{{a}}', { a: '{{b}}', b: 'deep' });
    expect(result.text).toBe('{{b}}');
    expect(result.missing).toEqual([]);
  });

  it('survives a variable that refers to itself', () => {
    expect(resolve('{{loop}}', { loop: '{{loop}}' }).text).toBe('{{loop}}');
  });

  it('substitutes an empty value', () => {
    const result = resolve('a{{gap}}b', { gap: '' });
    expect(result.text).toBe('ab');
    expect(result.missing).toEqual([]);
  });

  it('leaves text with no variables untouched', () => {
    expect(resolve('https://x.test/plain', { a: '1' }).text).toBe('https://x.test/plain');
  });

  it('ignores single braces', () => {
    expect(resolve('{a}', { a: '1' }).text).toBe('{a}');
  });
});

describe('environmentVars', () => {
  const env = (variables: Environment['variables']): Environment => ({
    id: 'e1',
    name: 'Dev',
    variables,
  });
  const row = (key: string, value: string, enabled = true) => ({ id: key, key, value, enabled });

  it('has nothing to offer when no environment is selected', () => {
    expect(environmentVars(undefined)).toEqual({});
  });

  it('reads enabled variables', () => {
    expect(environmentVars(env([row('base', 'https://x.test')]))).toEqual({
      base: 'https://x.test',
    });
  });

  it('skips unticked variables, so they read as missing rather than stale', () => {
    expect(environmentVars(env([row('base', 'https://x.test', false)]))).toEqual({});
  });

  it('skips a row with no name', () => {
    expect(environmentVars(env([row('', 'orphan')]))).toEqual({});
  });

  it('lets the last row win when a name is defined twice', () => {
    expect(environmentVars(env([row('a', 'first'), { ...row('a', 'second'), id: 'a2' }]))).toEqual({
      a: 'second',
    });
  });

  it('keeps an empty value, which is a choice and not an omission', () => {
    const vars = environmentVars(env([row('token', '')]));
    expect(resolve('{{token}}!', vars)).toEqual({ text: '!', missing: [] });
  });
});
