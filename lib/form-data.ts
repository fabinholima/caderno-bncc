export function formString(
  data: FormData,
  name: string,
  fallback = '',
): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : fallback;
}
