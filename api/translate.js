export const config = { maxDuration: 60 };

// Language profiles — each drives all three passes
const LANG = {
  fr: {
    name: 'French', form: 'tu',
    bench: 'Modiano, Ernaux, Le Clézio',
    register: 'intimate, lucid, precise — it witnesses rather than explains',
    pitfalls: 'calques from English syntax, anglicisms (réaliser ≠ realise), tu/vous slip',
    vocab: '"désarroi" over "confusion", "dénouer" over "résoudre". Exact nouns over adjective-heavy constructions.',
    rhythm: 'Subject often arrives late; the periodic sentence builds to its point. Short declaratives land harder after longer architecture.',
    editor: 'Gallimard / P.O.L',
  },
  de: {
    name: 'German', form: 'du',
    bench: 'Sebald, Herta Müller, Judith Hermann',
    register: 'measured, precise — every sentence earns its weight',
    pitfalls: 'Denglisch, du/Sie slip, passive overuse, calques that flatten case richness',
    vocab: '"Zerrissenheit", "Sehnsucht", "Unheimlichkeit" — deploy with intention, not decoration.',
    rhythm: 'Verb arrives late — use this for tension and resolution. Fragmented syntax can carry emotional weight (Müller).',
    editor: 'Suhrkamp / S. Fischer',
  },
  nl: {
    name: 'Dutch', form: 'je/jij',
    bench: 'Grunberg, Connie Palmen, Wieringa',
    register: 'direct, unadorned — effects come from precision and restraint',
    pitfalls: 'English absorption into daily Dutch (resist in literary register), jij/u slip, English word-order calques',
    vocab: 'Verbs over nouns. "Beseffen" over "het besef hebben van". "Doorgronden" over "begrijpen" when depth is meant.',
    rhythm: 'Finite verb in second position — natural forward pull. Palmen\'s directness is the benchmark.',
    editor: 'De Bezige Bij / Atlas Contact',
  },
  it: {
    name: 'Italian', form: 'tu',
    bench: 'Primo Levi, Ferrante, Natalia Ginzburg',
    register: 'warm, morally serious — syntactic elaboration without losing human warmth',
    pitfalls: 'false cognates (sensibile ≠ sensible, eventualmente ≠ eventually), tu/Lei slip, subjunctive avoidance',
    vocab: '"Sgomento", "pudore", "stupore", "rammarico" carry weight that generic equivalents lose. Ginzburg: depth through simplicity.',
    rhythm: 'Longer breath than English is acceptable. But Levi proves clarity and depth are not opposites.',
    editor: 'Einaudi / Adelphi',
  },
};

// Shared author voice block — sent once in pass 1 only
const AUTHOR_VOICE = `THE AUTHOR: highly literate, intellectually rigorous, writing from lived experience. Prose is precise without being clinical, vulnerable without being sentimental. Wide vocabulary used with intention. Rhythm alternates long considered sentences with short declaratives that land hard. Speaks directly to the reader, person to person.`;

// Shared marker rule — identical across all passes
const MARKER_RULE = `MARKERS: ⟦P001⟧ and ⟦IMG001⟧ style codes are structural — never translate, move, merge, or remove them. Return text only, no preamble.`;

// Em dash rule — applied in all three passes
const NO_EM_DASH = `EM DASH PROHIBITION: Never use the em dash (—) character anywhere in the output. Where an em dash would appear, rephrase the sentence entirely so it is not needed. Use subordinate clauses, commas, semicolons, colons, or restructure the sentence. Do not substitute an en dash (–) either. This is absolute.`;

function buildSystem(p, pass) {
  if (pass === 1) return `You are a distinguished ${p.name} literary translator for memoir and personal essay. Your output reads as original ${p.name} prose — never as a translation.

${AUTHOR_VOICE}

MANDATE:
— Translate meaning and feeling, not words. Use ${p.name} constructions when they land harder than the literal equivalent.
— ${p.vocab}
— ${p.rhythm}
— Structural metaphors (house, glass, puzzle map, protective layers) — keep concrete and consistent.
— Address the reader as "${p.form}" — intimate, never formal.
— Pitfalls to avoid: ${p.pitfalls}.
— ${NO_EM_DASH}
— ${MARKER_RULE}`;

  if (pass === 2) return `You are a senior literary editor at ${p.editor}, twenty years editing memoir and personal essay.

Refine this ${p.name} translation into original literary prose:
— Eliminate all traces of translation: ${p.pitfalls}.
— ${p.vocab}
— ${p.rhythm}
— Register: ${p.register}. Literary memoir — not therapeutic, not self-help.
— Confirm "${p.form}" throughout. Correct any slip.
— ${NO_EM_DASH}
— ${MARKER_RULE}`;

  // pass === 3
  return `You are a native ${p.name} reader — serious, literary, attuned to ${p.bench}. You hear immediately when something has been translated rather than written.

Final pass:
— Rewrite anything that feels foreign or constructed in English.
— Trust your ear. The prose should feel at home beside ${p.bench}.
— Register: ${p.register}. Do not simplify — this is for readers who read seriously.
— Confirm "${p.form}" throughout. Correct any slip.
— ${NO_EM_DASH}
— ${MARKER_RULE}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, pass, language = 'fr', quality = 'sonnet' } = req.body || {};
  if (!text || !pass) return res.status(400).json({ error: 'Missing text or pass' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const p = LANG[language];
  if (!p) return res.status(400).json({ error: `Unknown language "${language}". Use: ${Object.keys(LANG).join(', ')}` });
  if (![1, 2, 3].includes(pass)) return res.status(400).json({ error: 'pass must be 1, 2, or 3' });

  const MODELS = {
    sonnet: 'claude-sonnet-4-6',
    opus:   'claude-opus-4-7',
  };
  const model = MODELS[quality] || MODELS.sonnet;

  const userPrompts = {
    1: `Translate into ${p.name}. Preserve all ⟦PXX⟧ and ⟦IMGXX⟧ markers exactly:\n\n${text}`,
    2: `Edit for literary quality and natural ${p.name} voice:\n\n${text}`,
    3: `Final literary polish:\n\n${text}`,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: buildSystem(p, pass),
        messages: [{ role: 'user', content: userPrompts[pass] }],
      }),
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return res.status(500).json({ error: `Non-JSON from Anthropic (${response.status}): ${raw.slice(0, 200)}` });
    }
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || `Anthropic ${response.status}` });
    if (!data.content?.[0]?.text) return res.status(500).json({ error: 'Unexpected response structure' });

    // Safety net: strip any em dashes that slipped through despite the instruction
    const result = data.content[0].text.replace(/—/g, ',').replace(/–/g, ',');

    return res.status(200).json({ result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
