import AdmZip from 'adm-zip';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { docxBase64, translatedLines } = req.body || {};
  if (!docxBase64 || !translatedLines) {
    return res.status(400).json({ error: 'Missing docxBase64 or translatedLines' });
  }

  try {
    // ── Parse translated lines → marker:text map ──
    const translations = {};
    let currentMarker = null;
    let currentLines = [];

    for (const line of translatedLines) {
      const m = line.match(/^⟦(P\d+|IMG\d+)⟧\s*(.*)/);
      if (m) {
        if (currentMarker) translations[currentMarker] = currentLines.join(' ').trim();
        currentMarker = m[1];
        currentLines = m[2].trim() ? [m[2].trim()] : [];
      } else if (currentMarker) {
        if (line.trim()) currentLines.push(line.trim());
      }
    }
    if (currentMarker) translations[currentMarker] = currentLines.join(' ').trim();

    const pCount = Object.keys(translations).filter(k => k.startsWith('P')).length;
    const iCount = Object.keys(translations).filter(k => k.startsWith('IMG')).length;

    // ── Open docx (zip) ──
    const buf = Buffer.from(docxBase64, 'base64');
    const zip = new AdmZip(buf);
    let xml = zip.readAsText('word/document.xml');

    // ── Replace text paragraph by paragraph ──
    // Walk w:p elements that are NOT inside sdt/tbl/tc/tr/hyperlink
    // Use the same counter logic as the pre-processor
    let pCounter = 0;
    let replaced = 0;

    // We process paragraphs using regex on the raw XML string.
    // Key insight: we track depth of skip-containers so we know
    // which w:p elements are safe to touch.

    const SKIP_OPEN  = /<(w:sdt|w:tbl|w:tc|w:tr|w:hyperlink)[\s>]/g;
    const SKIP_CLOSE = /<\/(w:sdt|w:tbl|w:tc|w:tr|w:hyperlink)>/g;
    const PARA_RE    = /<w:p[ >][\s\S]*?<\/w:p>/g;

    // Build skip zones
    const skipZones = [];
    const allSkipMatches = [];
    let m;
    const skipOpen  = /<(w:sdt|w:tbl|w:tc|w:tr|w:hyperlink)[\s>]/g;
    const skipClose = /<\/(w:sdt|w:tbl|w:tc|w:tr|w:hyperlink)>/g;

    while ((m = skipOpen.exec(xml)) !== null)  allSkipMatches.push({ pos: m.index, type: 'open',  tag: m[1] });
    while ((m = skipClose.exec(xml)) !== null) allSkipMatches.push({ pos: m.index, type: 'close', tag: m[1].replace('/', '') });
    allSkipMatches.sort((a, b) => a.pos - b.pos);

    const depthStack = [];
    let zoneStart = null;
    for (const ev of allSkipMatches) {
      if (ev.type === 'open') {
        if (depthStack.length === 0) zoneStart = ev.pos;
        depthStack.push(ev.tag);
      } else {
        depthStack.pop();
        if (depthStack.length === 0 && zoneStart !== null) {
          skipZones.push([zoneStart, ev.pos + ev.tag.length + 3]);
          zoneStart = null;
        }
      }
    }

    const inSkip = pos => skipZones.some(([s, e]) => pos >= s && pos < e);
    const hasImage = block => /wp:inline|wp:anchor|a:graphic/.test(block);
    const getTexts = block => [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x => x[1]).join('').trim();

    // Build replacements list
    const replacements = [];
    const paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let match;
    while ((match = paraRe.exec(xml)) !== null) {
      const start = match.index;
      const end   = match.index + match[0].length;
      const block = match[0];
      if (inSkip(start) || hasImage(block)) continue;
      const visible = getTexts(block);
      if (!visible) continue;
      pCounter++;
      const mid = `P${String(pCounter).padStart(3,'0')}`;
      if (!translations[mid]) continue;
      replacements.push({ start, end, block, french: translations[mid] });
    }

    // Apply replacements back-to-front to preserve offsets
    let xmlArr = xml.split('');
    for (const { start, end, block, french } of [...replacements].reverse()) {
      // Replace all w:t content: first gets French, rest get empty
      const runs = [...block.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)];
      if (!runs.length) continue;
      let newBlock = block;
      for (let i = runs.length - 1; i >= 0; i--) {
        const run = runs[i];
        const attrs = run[1].includes('xml:space') ? run[1] : ' xml:space="preserve"' + run[1];
        const escaped = i === 0
          ? french.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          : '';
        const newRun = `<w:t${attrs}>${escaped}</w:t>`;
        newBlock = newBlock.slice(0, run.index) + newRun + newBlock.slice(run.index + run[0].length);
      }
      xml = xml.slice(0, start) + newBlock + xml.slice(end);
      replaced++;
    }

    // ── Write back into zip ──
    zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));
    const outBuffer = zip.toBuffer();

    return res.status(200).json({
      docxBase64: outBuffer.toString('base64'),
      replaced,
      pCount
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
