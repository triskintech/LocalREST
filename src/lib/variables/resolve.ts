import type { Environment } from '../types';

const PATTERN = /\{\{\s*([^}\s]+)\s*\}\}/g;

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

  const text = template.replace(PATTERN, (match, rawName: string) => {
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
