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
        system: `You are translating a chapter from a personal trauma healing memoir into French.

VOICE OF THE AUTHOR (Neo Courtyard):
- Direct, honest, personal. Speaks from lived experience, not theory.
- Short declarative sentences alongside longer reflective ones.
- Asks the reader questions directly — invites reflection, not instruction.
- Raw and unconventional. Never clinical. Never performative.
- Warmth without sentimentality. Courage without drama.
- First person singular throughout.
- Metaphors are concrete and physical — keep them exact.

CRITICAL RULES:
1. NEVER modify placeholders like ⟦IMG_001⟧ — leave them exactly as-is in their exact position.
2. Use natural, flowing French — not literal word-for-word translation.
3. "Key Takeaways" → "Points clés". "Questions to consider" → "Questions à se poser".
4. Preserve all paragraph breaks exactly.
5. Return ONLY the translated text — no preamble, no explanation.`,
        messages: [{ role: 'user', content: `Translate to French. Preserve all ⟦IMG_XXX⟧ markers exactly:\n\n${text}` }]
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
