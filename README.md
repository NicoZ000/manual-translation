# Field Manual — French Translation Pipeline

A three-pass French translation tool for *A Field Manual to Healing Trauma* by Neo Courtyard.

## What it does

1. **Upload** a `.docx` or `.txt` chapter (max 50,000 words)
2. **Pass 1** — Translates to French in the author's voice
3. **Pass 2** — French copy editor fixes calques and unnatural phrasing
4. **Pass 3** — French reader evaluation and final polish
5. **Export** the result as a Word `.doc` file with image markers preserved

Image placeholders (e.g. `⟦IMG_001⟧`) are preserved through all passes so formatting can be restored after translation.

## Setup

### 1. Clone and deploy to Vercel

```bash
git clone <your-repo>
cd field-manual-translator
vercel deploy
```

### 2. Add your Anthropic API key

In Vercel dashboard → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY = sk-ant-...
```

Redeploy after adding the key.

### 3. Use it

- Go to your Vercel URL
- Upload a chapter `.docx` or `.txt`
- Word count is shown — must be under 50,000
- Click **Translate chapter**
- Wait ~60–90 seconds for all three passes
- Click **Export to Word** when done

## Project structure

```
/
├── api/
│   └── translate.js      # Vercel serverless function (proxy to Anthropic API)
├── public/
│   └── index.html        # Frontend UI
├── vercel.json           # Vercel config (120s timeout for long translations)
├── package.json
└── README.md
```

## Notes

- The API function runs server-side so your API key is never exposed to the browser
- Each pass can take 20–40 seconds for a full chapter
- The 120-second function timeout handles even long chapters
- Image markers `⟦IMG_001⟧` through `⟦IMG_005⟧` (or more) are preserved and highlighted in the export
