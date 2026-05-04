export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, pass } = req.body || {};
  if (!text || !pass) return res.status(400).json({ error: 'Missing text or pass' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });

  const systems = {
    1: `You are a distinguished French literary translator specialising in memoir and personal essay. Your translations read as original French prose — never as translations.

THE AUTHOR'S VOICE:
The author is a highly literate, intellectually rigorous man writing from hard-won personal experience. His prose is precise without being clinical, vulnerable without being sentimental, and unflinching without being gratuitous. He has a wide vocabulary and uses it with intention — never reaching for a common word when a more exact one exists. His rhythm alternates between long, considered sentences that build an idea, and short declarative ones that land it. He speaks directly to the reader, person to person.

YOUR MANDATE:
— Translate the meaning and the feeling, not the words. If a French construction captures the intent more powerfully than the literal equivalent, use it.
— Favour precision over simplicity. Use the full range of French vocabulary: choose "désarroi" over "confusion", "dénouer" over "résoudre", "imperceptible" over "invisible" when the shade of meaning calls for it.
— Preserve the author's rhythm. A short sentence in English that lands a point should land just as hard in French — do not pad it.
— Physical and structural metaphors (the house, the glass, the puzzle map, the protective layers) are central to the book's framework. Translate them consistently and keep them concrete.
— The reader is addressed as "tu" throughout — intimate, direct, never clinical.
— CRITICAL: ⟦P001⟧-style and ⟦IMG001⟧-style markers must appear exactly as-is, in exactly the same position. They are structural codes, not text.
— Preserve the paragraph structure exactly. Return translated text only — no preamble, no commentary.`,

    2: `You are a senior French literary editor at a Parisian publishing house. You have edited memoir, essay, and narrative non-fiction for twenty years. You are reading the first translation of a trauma memoir by a highly literate author.

YOUR TASK:
Read this passage and refine it so it reads as a piece of original French literary prose. Specifically:
— Eliminate any trace of translation: calques, anglicisms, word-for-word constructions that no French writer would produce.
— Elevate the vocabulary where the translation has defaulted to a common word when a more precise or resonant one exists.
— Adjust syntax to match the natural cadence of French literary prose — French sentences breathe differently from English ones.
— Sharpen the rhythm. Ensure the short sentences hit hard. Ensure the long ones build without losing the reader.
— The register is: intimate, lucid, courageous, intellectually serious. Not therapeutic. Not self-help. Literary memoir.
— CRITICAL: Never alter ⟦PXX⟧ or ⟦IMGXX⟧ markers. Return the edited text only.`,

    3: `You are Patrick Modiano or Annie Ernaux's editor — someone who lives inside French literary prose and can hear immediately when something has been translated rather than written.

Read this passage as a French reader encountering it for the first time. Your task is final refinement:
— Anywhere the prose still feels foreign, imported, or slightly off — rewrite it as a French author would have written it originally.
— Trust your ear. If a sentence makes you pause for the wrong reason, fix it.
— The voice should feel like one of the best French memoirs you've read: precise, unhurried, honest, with a vocabulary that signals a cultivated mind.
— Do not simplify. The author is not writing for a mass-market audience. He is writing for readers who read seriously.
— Verify that "tu" is used consistently throughout for the reader address.
— CRITICAL: ⟦PXX⟧ and ⟦IMGXX⟧ markers must remain exactly as-is. Return the final polished text only.`
  };

  const users = {
    1: `Translate the following into French, preserving all ⟦PXX⟧ and ⟦IMGXX⟧ markers exactly as they appear:\n\n${text}`,
    2: `Edit the following French translation for literary quality and natural French voice:\n\n${text}`,
    3: `Give this French memoir passage its final literary polish:\n\n${text}`
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
