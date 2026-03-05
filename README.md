# AI Research Agent

A browser extension + FastAPI backend that automatically analyzes research papers and PDF documents using AI. Point it at an arXiv page or any PDF and get a structured, readable summary in seconds.

## How It Works

```
Browser Extension (Edge/Chrome)
        │
        ├── arXiv abstract page → extracts title + abstract → POST /analyze
        │
        └── PDF file (local or online) → extracts text via pdf.js → POST /analyze_pdf
                                                                        │
                                                            FastAPI Backend (localhost:8000)
                                                                        │
                                                            Groq API (Llama 3.1 8B)
                                                                        │
                                                            Structured analysis returned
                                                            and rendered in the browser
```

## Features

- **ArXiv Paper Analysis** — Detects `arxiv.org/abs/*` pages, extracts the title and abstract, and returns a structured analysis covering contribution, methodology, key findings, limitations, and related works.
- **PDF Analysis** — Reads any PDF (local files or online URLs) using pdf.js. Automatically detects whether the document is a research paper or a general document and applies the appropriate analysis template.
- **Page-Chunked Navigation** — Long PDFs are split into page chunks with a Prev/Next navigation bar so the entire document can be analyzed section by section.
- **LaTeX Cleanup** — The backend converts LaTeX math notation in LLM output to readable Unicode symbols (Greek letters, superscripts, operators, etc.).
- **Floating UI** — On PDF pages, a draggable panel is auto-injected with minimize-to-bubble functionality. On arXiv pages, the same panel appears via content script.
- **Popup Interface** — Clicking the extension icon opens a popup that detects the current page type and shows the analysis with copy and retry buttons.

## Project Structure

```
AI_Agent/
  main.py              # FastAPI backend — /analyze and /analyze_pdf endpoints

research-agent-extension/
  manifest.json        # Chrome/Edge Manifest V3 extension config
  background.js        # Service worker — auto-injects PDF panel, proxies file:// fetches
  content.js           # Content script for arxiv.org/abs/* pages
  popup.html           # Extension popup UI
  popup.js             # Popup logic — page detection, PDF extraction, backend calls
  pdf_panel.js         # Auto-injected floating panel for PDF pages
  pdf.mjs              # pdf.js library (text extraction from PDFs)
  pdf.worker.mjs       # pdf.js web worker
```

## Prerequisites

- **Python 3.8+**
- **Groq API key** — Sign up at [groq.com](https://groq.com) and get an API key
- **Edge or Chrome** browser

## Setup

### 1. Backend

```bash
cd AI_Agent

# Install dependencies
pip install fastapi uvicorn python-dotenv requests pydantic

# Create a .env file with your Groq API key
echo GROQ_API_KEY=your_key_here > .env

# Start the server
uvicorn main:app --reload
```

The server runs at `http://127.0.0.1:8000`.

### 2. Browser Extension

1. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `research-agent-extension/` folder.
4. *(Optional)* To analyze local PDF files, enable **Allow access to file URLs** in the extension's details page.

## Usage

| Page Type | Action |
|---|---|
| `arxiv.org/abs/*` | The panel appears automatically, or click the extension icon. |
| Any `.pdf` URL or local PDF | A floating panel is auto-injected into the page. You can also click the extension icon. |
| Other pages | Click the icon to see supported page types. |

## API Endpoints

### `POST /analyze`

Analyzes an arXiv paper from its title and abstract.

```json
{
  "title": "Paper Title",
  "abstract": "Paper abstract text..."
}
```

### `POST /analyze_pdf`

Analyzes extracted PDF text. The `type` field should be `"research"` or `"normal"`.

```json
{
  "text": "Extracted PDF text...",
  "type": "research"
}
```

## Tech Stack

- **Backend:** FastAPI, Groq API (Llama 3.1 8B Instant)
- **Extension:** Chrome Manifest V3, pdf.js, vanilla JavaScript
- **LLM:** Llama 3.1 8B via Groq (low-latency inference)
