import { variablePattern } from './resolve';

/** Where one `{{name}}` sits in a string, braces and name located separately. */
export type VariableToken = {
  /** Index of the first `{`. */
  from: number;
  /** Index just past the last `}`. */
  to: number;
  /** Index of the first character of the name. */
  nameFrom: number;
  /** Index just past the last character of the name. */
  nameTo: number;
  name: string;
};

/**
 * Every variable in `text`, in the order it appears.
 *
 * Offsets come from the match's own group lengths rather than searching the
 * matched text for the name. A name may legally begin with `{` — the pattern
 * only forbids `}` and whitespace — so `{{{a}}` would have the search land on
 * the wrong brace, and the colouring would be off by one on exactly the input
 * nobody thinks to try.
 */
export function findVariables(text: string): VariableToken[] {
  const tokens: VariableToken[] = [];
  const pattern = variablePattern();

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const whole = match[0];
    const open = match[1] ?? '';
    const lead = match[2] ?? '';
    const name = match[3] ?? '';
    const nameFrom = match.index + open.length + lead.length;

    tokens.push({
      from: match.index,
      to: match.index + whole.length,
      nameFrom,
      nameTo: nameFrom + name.length,
      name,
    });
  }

  return tokens;
}
