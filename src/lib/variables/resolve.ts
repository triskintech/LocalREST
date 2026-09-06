import type { Environment } from '../types';

/**
 * `{{name}}`, in five groups: opening braces, padding, name, padding, closing.
 *
 * A factory rather than a shared constant, because a /g regex carries
 * lastIndex and two callers stepping through it would skip each other's
 * matches. The groups exist so a caller that needs character offsets — the URL
 * field, to colour the braces apart from the name — can compute them from
 * lengths instead of searching the match again, and so highlighting and
 * substitution can never disagree about what counts as a variable.
 */
export const variablePattern = (): RegExp => /(\{\{)(\s*)([^}\s]+)(\s*)(\}\})/g;

export type Resolved = {
  text: string;
  /** Names that had no value, in first-seen order, each listed once. */
  missing: string[];
};

/**
 * Substitute `{{name}}` placeholders in a single pass.
 *
 * Replacements are never rescanned, so a variable whose value contains another
 * placeholder expands exactly one level. That makes runaway expansion
 * structurally impossible rather than merely guarded against.
 */
export function resolve(template: string, vars: Record<string, string>): Resolved {
  const missing: string[] = [];

  const text = template.replace(variablePattern(), (match, _open, _lead, rawName: string) => {
    const name = rawName.trim();
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name] as string;
    if (!missing.includes(name)) missing.push(name);
    return match;
  });

  return { text, missing };
}

/** Enabled variables of an environment, as a plain lookup. */
export function environmentVars(environment: Environment | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!environment) return vars;
  for (const variable of environment.variables) {
    if (variable.enabled && variable.key) vars[variable.key] = variable.value;
  }
  return vars;
}
