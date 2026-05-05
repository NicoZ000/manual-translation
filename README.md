# Field Manual — Literary Translation Pipeline

Multi-language literary translation tool for *A Field Manual to Healing Trauma* by Neo Courtyard.

## What it does

1. **Upload** a `.docx` file
2. **Pass 1** — Literary translation in the author's voice (Sonnet 4.6 or Opus 4.7)
3. **Pass 2** — Native-speaker copy editor pass
4. **Pass 3** — Final literary polish
5. **Download** the result as a fully formatted `.docx` with all styles, headings, and images preserved

Supports: French, German, Dutch, Italian.

## Setup

### 1. Deploy to Vercel

Connect your GitHub repo to Vercel. Framework preset: **Other**. Output directory: `public`.

### 2. Add your Anthropic API key

Vercel dashboard → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY = sk-ant-...
```

Redeploy after adding the key.

## Project structure

```
/
├── api/
│   └── translate.js   # Serverless function — Anthropic API proxy (120s timeout)
├── public/
│   └── index.html     # Frontend — marker extraction, translation pipeline, zip restore
├── vercel.json        # 120s timeout, fra1 region
└── package.json
```
