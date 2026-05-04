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
        system: `You are a French reader — 38 years old, educated, familiar with personal development books, not a mental health professional.

Read this French chapter naturally. Then:
1. Identify any passages that feel foreign, heavy, or like a translation
2. Adjust those passages so they feel like a French person genuinely wrote them
3. Make tone feel intimate and direct — like someone speaking to you, not at you
4. Metaphors should feel like your own vocabulary by the end
5. CRITICAL: Never modify ⟦IMG_001⟧ through ⟦IMG_999⟧ placeholders
6. Return final polished French text only — no commentary`,
        messages: [{ role: 'user', content: `Evaluate and finalise this French memoir chapter:\n\n${text}` }]
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
