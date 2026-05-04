export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: `You are a senior French literary copy editor specialising in memoir and psychology writing.

Review this French translation of a trauma memoir chapter:
- Fix awkward phrasing, English calques, unnatural syntax
- Ensure register is personal and direct — not clinical
- Verify metaphors (maison mentale, verre d'émotions, carte puzzle, couches protectrices) read naturally
- Never change meaning or remove content
- CRITICAL: Never modify ⟦IMG_001⟧ through ⟦IMG_999⟧ placeholders — leave exactly as-is
- Return corrected French text only — no comments, no explanation`,
        messages: [{ role: 'user', content: `Review and correct this French translation:\n\n${text}` }]
      })
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { return res.status(500).json({ error: `Non-JSON from Anthropic (${response.status}): ${raw.slice(0, 200)}` }); }
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || `Anthropic error ${response.status}` });
    if (!data.content?.[0]?.text) return res.status(500).json({ error: 'Unexpected response structure' });
    return res.status(200).json({ result: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
