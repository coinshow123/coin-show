#!/usr/bin/env node
/* Reads an uploaded dealer list (PDF, Excel or CSV) and writes the dealers next to it as JSON.
   Used by the GitHub workflow "Read dealer lists" when a file lands in incoming/dealer-lists/.
   Usage: node tools/read-dealer-list.js incoming/dealer-lists/CA-VACAVILLE-2026-10-25-r7.pdf [more files...] */
'use strict';
const fs = require('fs');
const path = require('path');
const DL = require('./dealer-list-parse.js');
const ROOT = path.join(__dirname, '..');
const cityIndex = DL.cityIndexFrom(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8')));

function parseCsvText(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

async function linesOf(file) {
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === '.pdf') {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      tc.items.forEach(it => { it.page = p; items.push(it); });
    }
    if (!items.length) throw new Error('This PDF has no readable text (it may be a scanned picture). Please type the list in or ask the organizer for the original file.');
    return DL.linesFromPdfItems(items);
  }
  if (ext === '.csv' || ext === '.txt') return DL.linesFromTable(parseCsvText(buf.toString('utf8')));
  if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return DL.linesFromTable(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }));
  }
  throw new Error('Unsupported file type ' + ext + '. Please upload a PDF, Excel or CSV file.');
}

(async () => {
  const files = process.argv.slice(2);
  for (const f of files) {
    const out = f.replace(/\.[a-z0-9]+$/i, '') + '.json';
    let result;
    try {
      const r = DL.parse(await linesOf(f), { cityIndex });
      result = { ok: true, file: path.basename(f), read: new Date().toISOString(), count: r.dealers.length, needsLook: r.dealers.filter(d => d.flag).length, headerFound: r.header, dealers: r.dealers, skipped: r.skipped.slice(0, 40) };
    } catch (e) {
      result = { ok: false, file: path.basename(f), read: new Date().toISOString(), error: e.message, dealers: [] };
    }
    fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
    console.log(`${f}: ${result.ok ? result.count + ' dealers, ' + result.needsLook + ' to check' : 'ERROR ' + result.error}`);
  }
})();
