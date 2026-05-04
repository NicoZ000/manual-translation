export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, pass } = req.body || {};
  if (!text || !pass) return res.status(400).json({ error: 'Missing text or pass' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });

  const systems = {
    1: `You translate a single page from a French trauma healing memoir. Voice: direct, personal, raw, first person. Short and long sentences mixed. Reader addressed directly. Concrete metaphors (house, glass, puzzle, layers) must stay exact. NEVER alter ⟦IMG_001⟧-style markers — preserve exactly as-is. Same paragraph structure as input. Return translated text only, no preamble.`,
    2: `You are a senior French literary copy editor. Fix calques, unnatural syntax, awkward phrasing in this translated memoir page. Keep register personal and direct, never clinical. NEVER alter ⟦IMG_XXX⟧ markers. Return corrected text only.`,
    3: `You are a French reader, 38, educated. Make this memoir page feel like it was originally written in French — intimate, direct, flowing. NEVER alter ⟦IMG_XXX⟧ markers. Return polished text only.`
  };

  const users = {
    1: `Translate this page to French, preserve all ⟦IMG_XXX⟧ markers exactly:\n\n${text}`,
    2: `Copy-edit this French translation:\n\n${text}`,
    3: `Polish this French memoir page:\n\n${text}`
  };

  const system = systems[pass];
  const user = users[pass];
  if (!system) return res.status(400).json({ error: 'Invalid pass (must be 1, 2, or 3)' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return res.status(500).json({ error: `Non-JSON from Anthropic (${response.status}): ${raw.slice(0, 200)}` });
    }
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || `Anthropic error ${response.status}` });
    if (!data.content?.[0]?.text) return res.status(500).json({ error: 'Unexpected Anthropic response structure' });

    return res.status(200).json({ result: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
