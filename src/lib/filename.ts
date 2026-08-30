/**
 * A filename for a saved response: the request path, plus a timestamp so
 * saving the same endpoint twice does not silently overwrite.
 */
export function responseFilename(
  url: string,
  contentType: string,
  now = new Date(),
): string {
  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');

  return `${baseName(url)}-${stamp}.${extensionFor(contentType)}`;
}

function baseName(url: string): string {
  let path = url;
  try {
    // Decoded first, or a percent-escape leaks into the name as digits.
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    // Keep whatever was given; it is only a filename.
  }
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'response';
}

function extensionFor(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('json')) return 'json';
  if (type.includes('html')) return 'html';
  if (type.includes('xml')) return 'xml';
  if (type.includes('csv')) return 'csv';
  return 'txt';
}
