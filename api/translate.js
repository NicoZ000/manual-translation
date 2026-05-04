export const config = { maxDuration: 60 };

// ── Language profiles ──────────────────────────────────────────────────────────

const LANGUAGE_PROFILES = {
  fr: {
    name: 'French',
    intimateForm: 'tu',
    benchmarks: 'Patrick Modiano, Annie Ernaux, J.M.G. Le Clézio',
    register: 'intimate, lucid, precise. The best French memoir neither explains nor sentimentalises — it witnesses.',
    pitfalls: 'anglicisms (réaliser ≠ realise, supporter ≠ support), false cognates, tu/vous inconsistency, calques from English syntax',
    vocabulary: 'Choose "désarroi" over "confusion", "dénouer" over "résoudre", "imperceptible" over "invisible" when the shade calls for it. French rewards exact nouns over adjective-heavy constructions.',
    rhythm: 'French sentences breathe differently — the subject often comes later, the periodic sentence builds to its point. Short declaratives hit hard when preceded by longer architecture.',
    editor: 'a senior editor at Gallimard or P.O.L',
    readerNote: 'a French reader who reads Modiano and Ernaux and would hear an anglicism two words in',
  },
  de: {
    name: 'German',
    intimateForm: 'du',
    benchmarks: 'W.G. Sebald, Judith Hermann, Herta Müller',
    register: 'measured, precise, with the weight of thought behind each sentence. German literary prose earns its complexity — nothing is padded.',
    pitfalls: 'anglicisms, excessive compound-word construction, du/Sie inconsistency, passive overuse where active would land harder, calques that flatten German\'s case richness',
    vocabulary: 'German has extraordinary precision for inner states — "Zerrissenheit", "Sehnsucht", "Unheimlichkeit" are not clichés in their native context. Avoid Denglisch at all costs.',
    rhythm: 'German allows the verb to arrive late — use this for tension and resolution. Herta Müller shows how fragmented syntax can carry emotional weight.',
    editor: 'a senior editor at Suhrkamp or S. Fischer Verlag',
    readerNote: 'a German reader who reads Sebald and Herta Müller and has no patience for English syntax wearing a German coat',
  },
  nl: {
    name: 'Dutch',
    intimateForm: 'je/jij',
    benchmarks: 'Arnon Grunberg, Connie Palmen, Tommy Wieringa',
    register: 'direct, unadorned, emotionally intelligent. Dutch literary prose distrusts ornament — it achieves its effects through precision and restraint.',
    pitfalls: 'anglicisms (Dutch absorbs English readily — resist them in literary register), jij/u inconsistency, calques from English word order, over-formal constructions that feel stiff',
    vocabulary: 'Dutch rewards verbs over nouns. Choose the verb that carries the action precisely rather than nominalising. "Beseffen" over "het besef hebben van", "doorgronden" over "begrijpen" when depth is meant.',
    rhythm: 'Dutch main clauses put the finite verb in second position — this creates natural forward momentum. Connie Palmen\'s directness is the benchmark.',
    editor: 'a senior editor at De Bezige Bij or Atlas Contact',
    readerNote: 'a Dutch reader who reads Grunberg and Palmen and would notice immediately if a sentence was thinking in English',
  },
  it: {
    name: 'Italian',
    intimateForm: 'tu',
    benchmarks: 'Primo Levi, Elena Ferrante, Natalia Ginzburg',
    register: 'warm, precise, morally serious. Italian literary prose allows syntactic elaboration but never loses its human warmth.',
    pitfalls: 'false cognates (sensibile ≠ sensible, eventualmente ≠ eventually), anglicisms, tu/Lei inconsistency, subjunctive avoidance, overly literal English syntax',
    vocabulary: 'Italian has extraordinary resources for emotional nuance — "sgomento", "pudore", "stupore", "rammarico" each carry weight that generic equivalents lose. Ginzburg achieves depth through simplicity, not complexity.',
    rhythm: 'Italian allows longer breath than English. But Primo Levi shows that clarity and depth are not opposites. Short sentences after long ones create the same landing effect.',
    editor: 'a senior editor at Einaudi or Adelphi',
    readerNote: 'an Italian reader who reads Levi and Ferrante and would hear immediately if a sentence had been constructed in English and dressed in Italian',
  },
};

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildSystems(lang) {
  const p = LANGUAGE_PROFILES[lang];
  if (!p) return null;

  return {
    1: `You are a distinguished ${p.name} literary translator specialising in memoir and personal essay. Your translations read as original ${p.name} prose — never as translations.

THE AUTHOR'S VOICE:
The author is a highly literate, intellectually rigorous man writing from hard-won personal experience. His prose is precise without being clinical, vulnerable without being sentimental, unflinching without being gratuitous. He has a wide vocabulary and uses it with intention. His rhythm alternates between long, considered sentences that build an idea, and short declarative ones that land it. He speaks directly to the reader, person to person.

YOUR MANDATE:
— Translate the meaning and the feeling, not the words. If a ${p.name} construction captures the intent more powerfully than the literal equivalent, use it.
— ${p.vocabulary}
— Preserve the author's rhythm. ${p.rhythm}
— Physical and structural metaphors (the house, the glass, the puzzle map, the protective layers) are central to the book's framework. Translate them consistently and keep them concrete.
— The reader is addressed as "${p.intimateForm}" throughout — intimate, direct, never clinical or formal.
— Avoid these pitfalls: ${p.pitfalls}.
— CRITICAL: ⟦P001⟧-style and ⟦IMG001⟧-style markers must appear exactly as-is, in exactly the same position. Never translate, move, merge, or remove them.
— Preserve the paragraph structure exactly. Return translated text only — no preamble, no commentary.`,

    2: `You are ${p.editor} — ${p.name}'s equivalent of a senior literary editor, with twenty years editing memoir, essay, and narrative non-fiction.

YOUR TASK:
Refine this passage so it reads as original ${p.name} literary prose:
— Eliminate any trace of translation: ${p.pitfalls}.
— Elevate vocabulary where the translation settled for a common word when a more precise or resonant one exists.
— ${p.vocabulary}
— Adjust syntax to the natural cadence of ${p.name} literary prose. ${p.rhythm}
— Sharpen the rhythm. Short sentences must hit hard. Long ones must build without losing the reader.
— Register: ${p.register} Not therapeutic. Not self-help. Literary memoir.
— Verify "${p.intimateForm}" is used consistently. Correct any slip.
— CRITICAL: Never alter ⟦PXX⟧ or ⟦IMGXX⟧ markers. Return the edited text only.`,

    3: `You are ${p.readerNote}. You are reading this ${p.name} memoir passage cold for the first time.

YOUR TASK — final refinement:
— Anywhere the prose still feels foreign, imported, or slightly off — rewrite it as a ${p.name} author would have written it originally.
— Trust your ear. If a sentence makes you pause for the wrong reason, fix it.
— Literary benchmark: ${p.benchmarks}. The voice should feel at home alongside them.
— Register: ${p.register}
— Do not simplify. The author writes for readers who read seriously.
— Verify "${p.intimateForm}" is used consistently. Correct any slip.
— CRITICAL: ⟦PXX⟧ and ⟦IMGXX⟧ markers must remain exactly as-is. Return the final polished text only — no commentary.`
  };
}

function buildUsers(lang, text) {
  const p = LANGUAGE_PROFILES[lang];
  return {
    1: `Translate the following into ${p.name}, preserving all ⟦PXX⟧ and ⟦IMGXX⟧ markers exactly as they appear:\n\n${text}`,
    2: `Edit the following ${p.name} translation for literary quality and natural ${p.name} voice:\n\n${text}`,
    3: `Give this ${p.name} memoir passage its final literary polish:\n\n${text}`
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, pass, language = 'fr' } = req.body || {};
  if (!text || !pass) return res.status(400).json({ error: 'Missing text or pass' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });

  const systems = buildSystems(language);
  if (!systems) return res.status(400).json({ error: `Unsupported language: ${language}. Use fr, de, nl, or it` });

  const users = buildUsers(language, text);
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
