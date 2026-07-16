export type CsvHeader = readonly [key: string, label: string];

export function quoteCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(
  headers: readonly CsvHeader[],
  rows: readonly Record<string, unknown>[],
  disclaimer: string,
): string {
  return [
    "\uFEFF" + headers.map((header) => quoteCsvCell(header[1])).join(","),
    ...rows.map((row) =>
      headers.map((header) => quoteCsvCell(row[header[0]])).join(","),
    ),
    quoteCsvCell(disclaimer),
  ].join("\r\n");
}
