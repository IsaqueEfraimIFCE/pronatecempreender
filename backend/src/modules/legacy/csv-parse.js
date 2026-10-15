import { InputError } from '@pronatec/shared';

export const MAX_IMPORT_ROWS = 20000;

// Minimal RFC 4180 reader for spreadsheet exports. Accepts a BOM and either
// comma or semicolon delimiters (Brazilian Excel exports use semicolons).
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (rows.length > MAX_IMPORT_ROWS + 1)
        throw new InputError(`Importe até ${MAX_IMPORT_ROWS} linhas por vez.`);
    } else cell += char;
  }
  if (quoted) throw new InputError('O arquivo CSV está incompleto (aspas não fechadas).');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
