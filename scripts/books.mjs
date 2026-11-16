// Downloads public-domain books from Project Gutenberg and splits them into chapter files.
// Output: books/library.json, books/<id>/toc.json, books/<id>/NNN.json
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync(new URL('./books.config.json', import.meta.url)));
const OUT = 'books';

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function roman(s) {
  let n = 0; s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]], nx = ROMAN[s[i + 1]] || 0;
    n += v < nx ? -v : v;
  }
  return n;
}
const pad = (n) => String(n).padStart(3, '0');
const clean = (s) => s.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();

async function download(id) {
  if (process.env.BOOKS_LOCAL_TEXT) return fs.readFileSync(process.env.BOOKS_LOCAL_TEXT, 'utf8');
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
  ];
  let err;
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'glance-books/1.0 (personal reading app)' } });
      if (r.ok) return await r.text();
      err = new Error(u + ' -> ' + r.status);
    } catch (e) { err = e; }
  }
  throw err;
}

function parse(raw) {
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const a = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  if (a >= 0) text = text.slice(text.indexOf('\n', a) + 1);
  const z = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (z >= 0) text = text.slice(0, z);
  const lines = text.split('\n');

  // 1. find heading events
  const ev = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length > 110) continue;
    let m;
    if ((m = /^(?:PART|Part)\s+([IVX]+)\b\.?\s*$/.exec(t))) { ev.push({ i, k: 'part', v: 'Part ' + m[1].toUpperCase(), end: i + 1 }); continue; }
    if (/^(?:FROM THE AUTHOR|From the Author|From The Author)\.?$/.test(t)) { ev.push({ i, k: 'pre', v: 'From The Author', end: i + 1 }); continue; }
    if (/^Footnotes?$/.test(t) && i > lines.length * 0.5) { ev.push({ i, k: 'foot', v: 'Footnotes', end: i + 1 }); continue; }
    if (/^(?:EPILOGUE|Epilogue)\.?$/.test(t)) { ev.push({ i, k: 'part', v: 'Epilogue', epi: true, end: i + 1 }); continue; }
    if ((m = /^(?:BOOK|Book)\s+([IVX]+)\b\.?[\s\-:—]*(.*)$/.exec(t))) {
      let title = m[2], end = i + 1;
      if (!title) { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; if (j - i <= 4 && lines[j].trim().length <= 100 && !/^(CHAPTER|BOOK|PART)\b/i.test(lines[j].trim())) { title = lines[j].trim(); end = j + 1; } }
      ev.push({ i, k: 'book', no: roman(m[1]), rn: m[1].toUpperCase(), v: clean(title), end }); continue;
    }
    if ((m = /^(?:CHAPTER|Chapter)\s+([IVX]+)\b\.?[\s\-:—]*(.*)$/.exec(t))) {
      let title = m[2], end = i + 1;
      if (!title) { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; if (j - i <= 4 && lines[j].trim().length <= 100) { title = lines[j].trim(); end = j + 1; } }
      ev.push({ i, k: 'chap', no: roman(m[1]), v: clean(title), end }); continue;
    }
  }

  // 2. build chapters; table-of-contents entries have almost no body text, so skip them
  const chapters = [];
  let part = '', epi = false, book = null, started = false;
  for (let e = 0; e < ev.length; e++) {
    const x = ev[e];
    if (x.k === 'pre') {
      const nx = e + 1 < ev.length ? ev[e + 1].i : lines.length;
      const pb = lines.slice(x.end, nx).join('\n');
      if (pb.trim().length > 400) {
        started = true;
        chapters.push({ label: '·', section: 'Foreword', title: x.v, p: pb.split(/\n\s*\n/).map((q) => q.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) });
      }
      continue;
    }
    if (x.k === 'foot') {
      const fb = lines.slice(x.end).join('\n');
      const fp = fb.split(/\n\s*\n/).map((q) => q.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
      if (fp.length) chapters.push({ label: '·', section: 'Notes', title: 'Footnotes', p: fp });
      continue;
    }
    if (x.k === 'part') { part = x.v; epi = !!x.epi; book = null; continue; }
    if (x.k === 'book') { book = x; continue; }
    const nextI = e + 1 < ev.length ? ev[e + 1].i : lines.length;
    let body = lines.slice(x.end, nextI).join('\n');
    // text between a Part/Book heading and its first chapter (e.g. a foreword) belongs to that chapter
    const prev = ev[e - 1];
    if (prev && prev.k !== 'chap') {
      const gap = lines.slice(prev.end, x.i).join('\n');
      if (gap.trim().length > 200) body = gap + '\n\n' + body;
    }
    if (!started && body.trim().length < 400) continue;
    started = true;
    const paras = body.split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\{\d+\}/g, '').trim())
      .filter((p) => p && !/^\[Illustration[^\]]*\]$/i.test(p));
    let section = part, label = String(x.no);
    if (book) { section = (part ? part + ' · ' : '') + 'Book ' + book.rn + (book.v ? '. ' + book.v : ''); label = book.no + '.' + x.no; }
    if (epi) label = 'E.' + x.no;
    chapters.push({ label, section, title: x.v || ('Chapter ' + x.no), p: paras });
  }
  // footnote list printed at the very end of the text: "[1] ..." paragraphs -> separate final section
  const last = chapters[chapters.length - 1];
  if (last && !chapters.some((c) => c.title === 'Footnotes')) {
    const k = last.p.findIndex((q, i) => /^\[1\]\s/.test(q) && last.p.slice(i).every((r) => /^\[\d+\]/.test(r)));
    if (k > 0) chapters.push({ label: '·', section: 'Notes', title: 'Footnotes', p: last.p.splice(k) });
  }
  return chapters;
}

const lib = [];
fs.mkdirSync(OUT, { recursive: true });
let failed = false;
for (const b of cfg.books) {
  try {
    const chapters = parse(await download(b.gutenberg));
    if (chapters.length < (b.minChapters || 1)) throw new Error(`${b.id}: only ${chapters.length} chapters found`);
    for (const c of chapters) {
      const len = c.p.join('').length;
      if (len < 300) throw new Error(`${b.id}: chapter ${c.label} "${c.title}" has only ${len} chars`);
    }
    const dir = path.join(OUT, b.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const toc = { id: b.id, title: b.title, author: b.author, translator: b.translator || '', source: 'Project Gutenberg #' + b.gutenberg, count: chapters.length, chapters: [] };
    chapters.forEach((c, i) => {
      const n = i + 1;
      fs.writeFileSync(path.join(dir, pad(n) + '.json'), JSON.stringify({ n, label: c.label, section: c.section, title: c.title, p: c.p }));
      toc.chapters.push({ n, label: c.label, section: c.section, title: c.title });
    });
    fs.writeFileSync(path.join(dir, 'toc.json'), JSON.stringify(toc));
    console.log(`${b.id}: ${chapters.length} chapters, ${chapters.reduce((s, c) => s + c.p.join(' ').split(/\s+/).length, 0)} words`);
    console.log(chapters.slice(0, 3).concat(chapters.slice(-3)).map((c) => `  ${c.label} | ${c.section} | ${c.title}`).join('\n'));
  } catch (e) { console.error('FAILED', e.message); failed = true; }
}
// rebuild the library index from whatever book folders exist
for (const d of fs.readdirSync(OUT)) {
  const f = path.join(OUT, d, 'toc.json');
  if (fs.existsSync(f)) { const t = JSON.parse(fs.readFileSync(f)); lib.push({ id: t.id, title: t.title, author: t.author, count: t.count }); }
}
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify(lib));
if (failed) process.exit(1);
