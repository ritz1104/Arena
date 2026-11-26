// Generates samples/teams-sample.pdf — a simple text PDF in the formats the importer understands.
// usage: node samples/make-sample-pdf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lines = [
  'Offline Coding Batch - Registered Teams',
  '',
  'Team Name: Quantum Coders',
  'Member 1: Asha Verma',
  'Member 2: Ravi Teja',
  'Member 3: Imran Shaikh',
  '',
  'Team 2 - Bit Busters',
  '1. Leela Fernandes',
  '2. Om Patil',
  '3. Sana Mirza',
  '',
  'Recursion Rebels: Dev Anand, Kriti Rao, Manish Gupta, Ira Sen',
  'Lambda Legends: Nikita Joshi, Pranav Iyer',
  'Overflow Ops: A One, B Two, C Three, D Four, E Five',
];

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
let y = 790;
const content = ['BT', '/F1 13 Tf'];
for (const l of lines) {
  content.push(`1 0 0 1 60 ${y} Tm (${esc(l)}) Tj`);
  y -= 22;
}
content.push('ET');
const stream = content.join('\n');

const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'teams-sample.pdf');
fs.writeFileSync(out, pdf);
console.log('wrote', out);
