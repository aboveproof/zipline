export function normalizeAllowedTypes(types: string[]) {
  return [
    ...new Set(
      types
        .flatMap((type) => type.split(','))
        .map((type) => type.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    ),
  ];
}

export function fileRequestAccepts(type: string, filename: string, allowedTypes: string[]) {
  if (!allowedTypes.length) return true;

  const mimetype = (type || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';

  return allowedTypes.some((allowed) => {
    if (!allowed.includes('/')) return allowed === extension;
    if (allowed.endsWith('/*')) return mimetype.startsWith(allowed.slice(0, -1));
    return allowed === mimetype;
  });
}
