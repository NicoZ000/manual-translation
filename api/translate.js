export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, pass } = req.body;
  if (!text || !pass) return res.status(400).json({ error: 'Missing text or pass' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const configs = {
    1: {
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
      user: `Translate this chapter to French. Preserve all ⟦IMG_XXX⟧ markers exactly:\n\n${text}`
    },
    2: {
      system: `You are a senior French literary copy editor specialising in memoir and psychology writing.

Review this French translation of a trauma memoir chapter:
- Fix awkward phrasing, English calques, unnatural syntax
- Ensure register is personal and direct — not clinical
- Verify metaphors (maison mentale, verre d'émotions, carte puzzle, couches protectrices) read naturally
- Never change meaning or remove content
- CRITICAL: Never modify ⟦IMG_001⟧ through ⟦IMG_005⟧ placeholders — leave exactly as-is
- Return corrected French text only — no comments, no explanation`,
      user: `Review and correct this French translation:\n\n${text}`
    },
    3: {
      system: `You are a French reader — 38 years old, educated, familiar with personal development books, not a mental health professional.

Read this French chapter naturally. Then:
1. Identify any passages that feel foreign, heavy, or like a translation
2. Adjust those passages so they feel like a French person genuinely wrote them
3. Make tone feel intimate and direct — like someone speaking to you, not at you
4. Metaphors should feel like your own vocabulary by the end
5. CRITICAL: Never modify ⟦IMG_001⟧ through ⟦IMG_005⟧ placeholders
6. Return final polished French text only — no commentary`,
      user: `Read, evaluate, and finalise this French memoir chapter:\n\n${text}`
    }
  };

  const cfg = configs[pass];
  if (!cfg) return res.status(400).json({ error: 'Invalid pass number' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: cfg.system,
        messages: [{ role: 'user', content: cfg.user }]
      })
    });

    // Read raw text first — Anthropic may return non-JSON on gateway errors
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: `Anthropic returned non-JSON response (HTTP ${response.status}): ${raw.slice(0, 200)}` });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || `Anthropic API error (${response.status})` });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ error: 'Unexpected response structure from Anthropic', raw: JSON.stringify(data).slice(0, 300) });
    }

    return res.status(200).json({ result: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: `Function error: ${err.message}` });
  }
}
