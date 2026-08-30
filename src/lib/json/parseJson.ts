/**
 * JSON.parse, except that a number too big for a double keeps its digits.
 *
 * `JSON.parse` maps every number onto an IEEE double, and stringifying it back
 * is where a 64-bit id turns into a different 64-bit id:
 * 12345678901234567890 renders as 12345678901234567000, and 1e999 renders as
 * null. The viewer then shows — and "Save response" writes — an id that never
 * existed, with nothing on screen suggesting the number was touched.
 *
 * Only the numbers that cannot survive the trip are wrapped. Everything else
 * parses to an ordinary JS value, so the common case behaves exactly as before.
 */
export class RawNumber {
  constructor(readonly text: string) {}

  /** So a consumer that wants arithmetic can still opt into the lossy value. */
  valueOf(): number {
    return Number(this.text);
  }

  toString(): string {
    return this.text;
  }
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * Parse JSON text. Throws a SyntaxError on anything malformed, exactly like
 * `JSON.parse`, so callers can keep using try/catch to decide "is this JSON".
 */
export function parseJson(text: string): unknown {
  let at = 0;

  const fail = (what: string): never => {
    throw new SyntaxError(`${what} at position ${at}`);
  };

  const skipWhitespace = () => {
    while (at < text.length && WHITESPACE.has(text[at] as string)) at += 1;
  };

  const expect = (char: string) => {
    if (text[at] !== char) fail(`Expected ${char}`);
    at += 1;
  };

  const parseString = (): string => {
    expect('"');
    let out = '';
    for (;;) {
      if (at >= text.length) fail('Unterminated string');
      const char = text[at] as string;
      if (char === '"') {
        at += 1;
        return out;
      }
      if (char !== '\\') {
        // Raw control characters are invalid JSON, and letting them through
        // would put a literal newline inside a rendered row.
        if (char < ' ') fail('Unescaped control character');
        out += char;
        at += 1;
        continue;
      }
      at += 1;
      const escape = text[at];
      if (escape === undefined) fail('Unterminated escape');
      if (escape === 'u') {
        const hex = text.slice(at + 1, at + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Bad unicode escape');
        out += String.fromCharCode(parseInt(hex, 16));
        at += 5;
        continue;
      }
      const mapped = ESCAPES[escape as string];
      if (mapped === undefined) fail('Bad escape');
      out += mapped;
      at += 1;
    }
  };

  const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

  const parseNumber = (): number | RawNumber => {
    const match = NUMBER.exec(text.slice(at));
    if (!match) fail('Invalid number');
    const literal = (match as RegExpExecArray)[0];
    at += literal.length;
    const value = Number(literal);
    // Only a literal that cannot be written back out unchanged needs wrapping.
    return String(value) === literal ? value : new RawNumber(literal);
  };

  const parseKeyword = (word: string, value: unknown): unknown => {
    if (text.slice(at, at + word.length) !== word) fail('Unexpected token');
    at += word.length;
    return value;
  };

  const parseArray = (): unknown[] => {
    expect('[');
    const out: unknown[] = [];
    skipWhitespace();
    if (text[at] === ']') {
      at += 1;
      return out;
    }
    for (;;) {
      out.push(parseValue());
      skipWhitespace();
      if (text[at] === ',') {
        at += 1;
        continue;
      }
      expect(']');
      return out;
    }
  };

  const parseObject = (): Record<string, unknown> => {
    expect('{');
    const out: Record<string, unknown> = {};
    skipWhitespace();
    if (text[at] === '}') {
      at += 1;
      return out;
    }
    for (;;) {
      skipWhitespace();
      const key = parseString();
      skipWhitespace();
      expect(':');
      const value = parseValue();
      // defineProperty rather than assignment: a body with a "__proto__" key
      // would otherwise reach the object's setter instead of becoming a field,
      // which is both a rendering bug and a way to smuggle in a prototype.
      Object.defineProperty(out, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      skipWhitespace();
      if (text[at] === ',') {
        at += 1;
        continue;
      }
      expect('}');
      return out;
    }
  };

  function parseValue(): unknown {
    skipWhitespace();
    const char = text[at];
    if (char === undefined) fail('Unexpected end of input');
    if (char === '{') return parseObject();
    if (char === '[') return parseArray();
    if (char === '"') return parseString();
    if (char === 't') return parseKeyword('true', true);
    if (char === 'f') return parseKeyword('false', false);
    if (char === 'n') return parseKeyword('null', null);
    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) return parseNumber();
    return fail('Unexpected token');
  }

  const value = parseValue();
  skipWhitespace();
  if (at < text.length) fail('Unexpected trailing content');
  return value;
}
