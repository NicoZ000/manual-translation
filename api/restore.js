import AdmZip from 'adm-zip';

export const config = { maxDuration: 60 };

// Build sorted list of [start, end] zones to skip (sdt, tbl, tc, tr, hyperlink)
function buildSkipZones(xml) {
  const tags = 'w:sdt|w:tbl|w:tc|w:tr|w:hyperlink';
  const open  = new RegExp(`<(${tags})[\\s>]`, 'g');
  const close = new RegExp(`<\\/(${tags})>`, 'g');

  const events = [];
  let m;
  while ((m = open.exec(xml))  !== null) events.push({ pos: m.index, end: m.index + m[0].length, type: 1 });
  while ((m = close.exec(xml)) !== null) events.push({ pos: m.index, end: m.index + m[0].length, type: -1 });
  events.sort((a, b) => a.pos - b.pos);

  const zones = [];
  let depth = 0, start = 0;
  for (const ev of events) {
    if (ev.type === 1) { if (depth++ === 0) start = ev.pos; }
    else if (--depth === 0) zones.push([start, ev.end]);
  }
  return zones; // already sorted by start position
}

// Binary search — O(log n) per paragraph instead of O(n)
function inSkip(pos, zones) {
  let lo = 0, hi = zones.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = zones[mid];
    if (pos >= s && pos < e) return true;
    if (pos < s) hi = mid - 1; else lo = mid + 1;
  }
  return false;
}

// Parse ⟦PXX⟧ / ⟦IMGXX⟧ marked translation lines → { marker: text }
function parseTranslations(lines) {
  const out = {};
  let key = null, parts = [];
  for (const line of lines) {
    const m = line.match(/^\u27e6(P\d+|IMG\d+)\u27e7\s*(.*)/);
    if (m) {
      if (key) out[key] = parts.join(' ').trim();
      key = m[1]; parts = m[2].trim() ? [m[2].trim()] : [];
    } else if (key && line.trim()) {
      parts.push(line.trim());
    }
  }
  if (key) out[key] = parts.join(' ').trim();
  return out;
}

// Escape XML special characters in translation text
function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { docxBase64, translatedLines } = req.body || {};
  if (!docxBase64 || !translatedLines?.length)
    return res.status(400).json({ error: 'Missing docxBase64 or translatedLines' });

  try {
    const translations = parseTranslations(translatedLines);
    const pKeys = Object.keys(translations).filter(k => k[0] === 'P');
    if (!pKeys.length) return res.status(400).json({ error: 'No paragraph translations found in input' });

    // Load docx
    const zip = new AdmZip(Buffer.from(docxBase64, 'base64'));
    let xml = zip.readAsText('word/document.xml');

    const skipZones = buildSkipZones(xml);
    const hasMedia  = block => /wp:inline|wp:anchor|a:graphic/.test(block);
    const getText   = block => [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('').trim();

    // Two-pass: first collect replacements, then apply back-to-front
    const replacements = [];
    let pCounter = 0;
    const paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let match;

    while ((match = paraRe.exec(xml)) !== null) {
      const { index: start } = match;
      const block = match[0];
      if (inSkip(start, skipZones) || hasMedia(block)) continue;
      if (!getText(block)) continue;

      pCounter++;
      const mid = `P${String(pCounter).padStart(3, '0')}`;
      const translated = translations[mid];
      if (!translated) continue;

      replacements.push({ start, end: start + block.length, block, translated });
    }

    // Apply back-to-front so string offsets stay valid
    for (const { start, end, block, translated } of replacements.reverse()) {
      const runs = [...block.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)];
      if (!runs.length) continue;

      let newBlock = block;
      for (let i = runs.length - 1; i >= 0; i--) {
        const run = runs[i];
        const attrs = run[1].includes('xml:space') ? run[1] : ` xml:space="preserve"${run[1]}`;
        const content = i === 0 ? escXml(translated) : '';
        newBlock = newBlock.slice(0, run.index) + `<w:t${attrs}>${content}</w:t>` + newBlock.slice(run.index + run[0].length);
      }
      xml = xml.slice(0, start) + newBlock + xml.slice(end);
    }

    zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));

    return res.status(200).json({
      docxBase64: zip.toBuffer().toString('base64'),
      replaced: replacements.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
