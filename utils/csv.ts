function escapeCsvValue(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}
