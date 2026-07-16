export type TranslationVariables = Record<string, string | number>;

export function interpolate(
  template: string,
  variables: TranslationVariables = {},
): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : token,
  );
}
