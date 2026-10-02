/** The server historically returns SQL column names for teams and brackets. */
export function normalizeApiData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeApiData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), normalizeApiData(item),
  ]));
}
