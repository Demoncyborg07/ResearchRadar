// popup.js — Runs in the popup context, not injected into the page
// This is the CORRECT way to handle PDFs in Edge (Chromium-based browsers)

const BACKEND = "http://127.0.0.1:8000";
const MAX_CHARS = 15000;

// ─── UI HELPERS ────────────────────────────────────────────

function setStatus(text, type = "default") {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");
  dot.className = "status-dot " + type;
  label.textContent = text;
}

function setOutput(text) {
  const el = document.getElementById("output");
  el.textContent = text;
  el.classList.add("plain-text");
}

function setOutputHTML(markdown) {
  const el = document.getElementById("output");
  el.innerHTML = renderMarkdown(markdown);
  el.classList.remove("plain-text");
}

// ─── MARKDOWN → HTML RENDERER ──────────────────────────────

function renderMarkdown(md) {
  // Sanitize HTML entities
  let text = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Split into sections by numbered headings — handles both **1. Title:** and 1. Title:
  const sections = [];
  const sectionRegex = /(?:^|\n)\s*(?:\*\*)?(\d+)\.\s+(.+?):?\s*(?:\*\*)?:?\s*(?=\n|$)/gm;
  let lastIdx = 0;
  let match;

  while ((match = sectionRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const pre = text.slice(lastIdx, match.index).trim();
      if (pre) sections.push({ type: "text", content: pre });
    }
    sections.push({ type: "heading", num: match[1], title: match[2].replace(/:\s*$/, "").replace(/\*\*/g, "").trim(), start: sectionRegex.lastIndex });
    lastIdx = sectionRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    sections.push({ type: "text", content: text.slice(lastIdx).trim() });
  }

  // If no sections found, just format the whole thing as inline
  if (sections.filter(s => s.type === "heading").length === 0) {
    return `<div class="section-card">${formatInline(text)}</div>`;
  }

  // Build HTML: pair each heading with the text that follows it
  let html = "";
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (sec.type === "text" && i === 0) {
      html += `<p>${formatInline(sec.content)}</p>`;
    } else if (sec.type === "heading") {
      const body = (i + 1 < sections.length && sections[i + 1].type === "text")
        ? sections[i + 1].content : "";
      const isRelated = sec.title.toLowerCase().includes("related");
      const cardClass = isRelated ? "related-works" : "section-card";
      html += `<div class="${cardClass}">`;
      html += `<h2>${sec.num}. ${formatInline(sec.title)}</h2>`;
      if (body) {
        html += formatBody(body);
        i++; // skip the text section we just consumed
      }
      html += `</div>`;
    }
  }
  return html;
}

function formatInline(text) {
  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Bare URLs
  text = text.replace(/(?<!["=])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return text;
}

function formatBody(text) {
  // Split into lines, process lists and paragraphs
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let listType = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) { html += `</${listType}>`; inList = false; }
      continue;
    }

    // Numbered list item: 1. text or 1) text
    const olMatch = line.match(/^\d+[\.\)]\s+(.+)/);
    // Bullet list item: - text or * text
    const ulMatch = line.match(/^[-*]\s+(.+)/);

    if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) html += `</${listType}>`;
        html += "<ol>"; inList = true; listType = "ol";
      }
      html += `<li>${formatInline(olMatch[1])}</li>`;
    } else if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) html += `</${listType}>`;
        html += "<ul>"; inList = true; listType = "ul";
      }
      html += `<li>${formatInline(ulMatch[1])}</li>`;
    } else {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<p>${formatInline(line)}</p>`;
    }
  }
  if (inList) html += `</${listType}>`;
  return html;
}

// ─── PDF FETCHING ──────────────────────────────────────────

// Content scripts / popup CANNOT fetch file:// URLs (browser security).
// For file:// PDFs we ask the background service worker to fetch,
// since it has the "file:///*" host_permission.
async function fetchPDFBytes(url) {
  if (url.startsWith("file://")) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "FETCH_PDF", url }, response => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || !response.success) {
          return reject(new Error(response?.error || "Background fetch failed"));
        }
        resolve(new Uint8Array(response.data).buffer);
      });
    });
  }

  const fetchResponse = await fetch(url);
  if (!fetchResponse.ok) throw new Error("Could not fetch PDF (status " + fetchResponse.status + ")");
  return fetchResponse.arrayBuffer();
}

// ─── PDF TEXT EXTRACTION ───────────────────────────────────

async function extractPDFText(url) {
  const pdfjsLib = await import(chrome.runtime.getURL("pdf.mjs"));
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");

  const arrayBuffer = await fetchPDFBytes(url);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
  }

  return fullText;
}

// ─── PAPER TYPE DETECTION ──────────────────────────────────

function detectResearchPaper(text) {
  const indicators = [
    "abstract", "introduction", "methodology", "methods",
    "experiment", "results", "dataset", "conclusion", "references"
  ];
  const lower = text.toLowerCase();
  let score = 0;
  indicators.forEach(w => { if (lower.includes(w)) score++; });
  return score >= 4;
}

// ─── MAIN LOGIC ────────────────────────────────────────────

async function analyzeCurrentTab() {
  setOutput("Analyzing current page...");

  // Get the active tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || "";

  console.log("Current tab URL:", url);

  // ── CASE 1: PDF file ──────────────────────────────────────
  const isPDF = url.toLowerCase().includes(".pdf") ||
    url.startsWith("file://") && url.toLowerCase().endsWith(".pdf");

  if (isPDF) {
    setStatus("PDF detected — extracting text...", "pdf");
    setOutput("📄 Reading PDF...");

    // Phase 1: Extract text from PDF
    let pdfText;
    try {
      pdfText = await extractPDFText(url);
    } catch (err) {
      console.error("PDF extraction error:", err);
      setStatus("PDF extraction failed", "error");
      setOutput("❌ Failed to read PDF.\n\nError: " + err.message +
        "\n\nTips:\n• Make sure the extension has 'Allow access to file URLs' enabled in edge://extensions\n• Make sure pdf.mjs and pdf.worker.mjs are present in the extension folder.");
      return;
    }

    if (!pdfText || pdfText.trim().length < 50) {
      setStatus("PDF appears to be image-only (scanned)", "error");
      setOutput("⚠️ This PDF appears to be a scanned image.\n\nText could not be extracted. Only text-based PDFs are supported.");
      return;
    }

    // Phase 2: Send to backend
    const truncated = pdfText.substring(0, MAX_CHARS);
    const isResearch = detectResearchPaper(truncated);

    setStatus(`PDF ready — sending to backend (${isResearch ? "Research Paper" : "Document"})...`, "loading");
    setOutput("⏳ Analyzing PDF...");

    try {
      const response = await fetch(`${BACKEND}/analyze_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: truncated,
          type: isResearch ? "research" : "normal"
        })
      });

      if (!response.ok) throw new Error(`Server responded with status ${response.status}`);

      const data = await response.json();

      setStatus(isResearch ? "✅ Research paper analyzed" : "✅ Document analyzed", "default");
      setOutputHTML(data.analysis);

    } catch (err) {
      console.error("Backend connection error:", err);
      setStatus("Backend not reachable", "error");
      setOutput("❌ Cannot connect to backend.\n\nMake sure the FastAPI server is running:\n\n  cd AI_Agent\n  uvicorn main:app --reload");
    }

    return;
  }

  // ── CASE 2: Arxiv abstract page ───────────────────────────
  const isArxiv = url.includes("arxiv.org/abs/");

  if (isArxiv) {
    setStatus("ArXiv paper detected — reading via page...", "default");
    setOutput("⏳ Injecting analysis script into page...");

    // Execute script in the tab to grab title + abstract
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const title = document.querySelector("h1.title");
          const abstract = document.querySelector("blockquote.abstract");
          return {
            title: title ? title.innerText.replace("Title:", "").trim() : null,
            abstract: abstract ? abstract.innerText.replace("Abstract:", "").trim() : null
          };
        }
      });
    } catch (err) {
      setStatus("Failed to read page", "error");
      setOutput("❌ Could not read the arxiv page.\n\nError: " + err.message);
      return;
    }

    const { title, abstract } = results[0].result;

    if (!title || !abstract) {
      setStatus("Could not find paper elements", "error");
      setOutput("⚠️ Could not find title or abstract on this page.\n\nMake sure you are on an arxiv.org/abs/ page.");
      return;
    }

    setStatus("Sending to backend...", "loading");
    setOutput("⏳ Analyzing paper:\n\n" + title);

    try {
      const response = await fetch(`${BACKEND}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abstract })
      });

      if (!response.ok) throw new Error(`Server responded with status ${response.status}`);

      const data = await response.json();

      setStatus("✅ Paper analyzed", "default");
      setOutputHTML(data.analysis);

    } catch (err) {
      console.error("Arxiv analysis error:", err);
      setStatus("Backend not reachable", "error");
      setOutput("❌ Cannot connect to backend.\n\nMake sure the FastAPI server is running:\n\n  cd AI_Agent\n  uvicorn main:app --reload");
    }

    return;
  }

  // ── CASE 3: Unsupported page ──────────────────────────────
  setStatus("Page not supported", "error");
  setOutput("ℹ️ This extension works on:\n\n• arxiv.org/abs/* pages\n• Any PDF file (local or online)\n\nNavigate to one of those and click the extension icon again.");
}

// ─── BUTTON HANDLERS ──────────────────────────────────────

document.getElementById("copyBtn").addEventListener("click", () => {
  const text = document.getElementById("output").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
  });
});

document.getElementById("retryBtn").addEventListener("click", () => {
  analyzeCurrentTab();
});

// ─── INIT ──────────────────────────────────────────────────
analyzeCurrentTab();
