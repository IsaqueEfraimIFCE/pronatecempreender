export function csv(rows) {
  const cell = (value) => {
    let string = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(string)) string = `'${string}`;
    return `"${string.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
