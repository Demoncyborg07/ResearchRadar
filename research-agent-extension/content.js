// content.js — Handles arxiv.org/abs/* pages only
// Uses the same panel design as pdf_panel.js with minimize-to-bubble

(async () => {

  // Prevent double injection
  if (document.getElementById("research-agent-panel")) return;
  if (document.getElementById("research-agent-bubble")) return;

  const BACKEND = "http://127.0.0.1:8000";

  // ─── STYLES ────────────────────────────────────────────────

  if (!document.getElementById("ra-styles")) {
    const style = document.createElement("style");
    style.id = "ra-styles";
    style.textContent = `
      @keyframes ra-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
      @keyframes ra-bubble-pop { 0%{transform:scale(0)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
      @keyframes ra-panel-in { 0%{opacity:0;transform:translateX(30px)} 100%{opacity:1;transform:translateX(0)} }

      #research-agent-panel .ra-loading { animation: ra-pulse 1s infinite; }
      #research-agent-panel h2 { font-size:13px; color:#2e7d32; margin:10px 0 4px; padding-bottom:3px; border-bottom:1px solid #e0e0e0; }
      #research-agent-panel h2:first-child { margin-top:0; }
      #research-agent-panel p { margin:4px 0; }
      #research-agent-panel ul, #research-agent-panel ol { margin:4px 0 4px 18px; }
      #research-agent-panel li { margin:3px 0; }
      #research-agent-panel a { color:#1976d2; text-decoration:none; word-break:break-all; }
      #research-agent-panel a:hover { text-decoration:underline; }
      #research-agent-panel .section-card { background:#f5f9f5; border-left:3px solid #4caf50; border-radius:4px; padding:8px 10px; margin:8px 0; }
      #research-agent-panel .related-works { background:#f3f5ff; border-left:3px solid #1976d2; border-radius:4px; padding:8px 10px; margin:8px 0; }
      #research-agent-panel .related-works a { color:#1565c0; }

      #research-agent-bubble {
        position: fixed;
        right: 16px;
        bottom: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #43a047, #2e7d32);
        color: white;
        font-size: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483647;
        box-shadow: 0 4px 16px rgba(46,125,50,0.45);
        border: none;
        transition: transform 0.2s, box-shadow 0.2s;
        animation: ra-bubble-pop 0.35s ease-out;
        user-select: none;
      }
      #research-agent-bubble:hover {
        transform: scale(1.12);
        box-shadow: 0 6px 24px rgba(46,125,50,0.55);
      }
    `;
    document.head.appendChild(style);
  }

  // ─── CREATE BUBBLE ──────────────────────────────────────────

  function createBubble(onExpand) {
    const bubble = document.createElement("div");
    bubble.id = "research-agent-bubble";
    bubble.innerText = "🔍";
    bubble.title = "Open AI Research Radar";
    bubble.onclick = () => {
      bubble.style.display = "none";
      onExpand();
    };
    document.documentElement.appendChild(bubble);
    return bubble;
  }

  // ─── CREATE PANEL ────────────────────────────────────────

  function createPanel(bubble) {
    const panel = document.createElement("div");
    panel.id = "research-agent-panel";

    Object.assign(panel.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "420px",
      maxHeight: "75vh",
      background: "white",
      border: "none",
      borderRadius: "10px",
      padding: "0",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      fontFamily: "'Segoe UI', sans-serif",
      fontSize: "13px",
      overflow: "hidden",
      animation: "ra-panel-in 0.3s ease-out"
    });

    // Header
    const header = document.createElement("div");
    header.innerText = "🔍 AI Research Radar";
    Object.assign(header.style, {
      background: "#2e7d32",
      color: "white",
      padding: "12px 16px",
      fontWeight: "bold",
      fontSize: "14px",
      flexShrink: "0",
      cursor: "move",
      userSelect: "none"
    });

    // Minimize button
    const minBtn = document.createElement("button");
    minBtn.innerText = "─";
    minBtn.title = "Minimize";
    Object.assign(minBtn.style, {
      position: "absolute",
      top: "10px",
      right: "12px",
      background: "rgba(255,255,255,0.2)",
      border: "none",
      color: "white",
      cursor: "pointer",
      fontSize: "14px",
      borderRadius: "4px",
      padding: "2px 8px",
      lineHeight: "1",
      fontWeight: "bold"
    });
    minBtn.onmouseenter = () => { minBtn.style.background = "rgba(255,255,255,0.35)"; };
    minBtn.onmouseleave = () => { minBtn.style.background = "rgba(255,255,255,0.2)"; };
    minBtn.onclick = () => {
      panel.style.display = "none";
      bubble.style.display = "flex";
    };

    // Status bar
    const statusBar = document.createElement("div");
    Object.assign(statusBar.style, {
      background: "#e8f5e9",
      borderBottom: "1px solid #c8e6c9",
      padding: "7px 14px",
      fontSize: "12px",
      color: "#555",
      display: "flex",
      alignItems: "center",
      gap: "7px",
      flexShrink: "0"
    });

    const statusDot = document.createElement("span");
    Object.assign(statusDot.style, {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: "#ff9800",
      display: "inline-block",
      flexShrink: "0"
    });
    statusDot.classList.add("ra-loading");

    const statusText = document.createElement("span");
    statusText.innerText = "Reading arxiv page...";

    statusBar.appendChild(statusDot);
    statusBar.appendChild(statusText);

    // Output area
    const output = document.createElement("div");
    Object.assign(output.style, {
      padding: "14px",
      overflowY: "auto",
      flex: "1",
      lineHeight: "1.7",
      color: "#333"
    });
    output.innerText = "⏳ Detecting paper...";

    // Footer
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      display: "flex",
      gap: "8px",
      padding: "10px 14px",
      borderTop: "1px solid #eee",
      background: "#fafafa",
      flexShrink: "0"
    });

    const copyBtn = document.createElement("button");
    copyBtn.innerText = "📋 Copy";
    Object.assign(copyBtn.style, {
      flex: "1",
      padding: "7px",
      background: "#4caf50",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      fontWeight: "500"
    });
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(output.innerText);
      copyBtn.innerText = "✅ Copied!";
      setTimeout(() => { copyBtn.innerText = "📋 Copy"; }, 2000);
    };

    const retryBtn = document.createElement("button");
    retryBtn.innerText = "🔄 Retry";
    Object.assign(retryBtn.style, {
      flex: "1",
      padding: "7px",
      background: "#1976d2",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      fontWeight: "500"
    });

    footer.appendChild(copyBtn);
    footer.appendChild(retryBtn);

    header.appendChild(minBtn);
    panel.appendChild(header);
    panel.appendChild(statusBar);
    panel.appendChild(output);
    panel.appendChild(footer);

    document.documentElement.appendChild(panel);

    // ── Drag to move ──────────────────────────────────────
    let dragging = false, dragX = 0, dragY = 0;

    header.addEventListener("mousedown", e => {
      if (e.target === minBtn) return;
      dragging = true;
      dragX = e.clientX - panel.offsetLeft;
      dragY = e.clientY - panel.offsetTop;
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      panel.style.left = (e.clientX - dragX) + "px";
      panel.style.top = (e.clientY - dragY) + "px";
      panel.style.right = "auto";
    });
    document.addEventListener("mouseup", () => { dragging = false; });

    return { output, statusDot, statusText, retryBtn, panel };
  }

  // ─── STATUS HELPERS ──────────────────────────────────────

  function setStatus(dot, text, label, type) {
    const colors = { loading: "#ff9800", success: "#4caf50", error: "#e53935", info: "#1976d2" };
    dot.style.background = colors[type] || "#4caf50";
    if (type === "loading") {
      dot.classList.add("ra-loading");
    } else {
      dot.classList.remove("ra-loading");
    }
    text.innerText = label;
  }

  // ─── MARKDOWN → HTML RENDERER ──────────────────────────────

  function fmtInline(t) {
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    t = t.replace(/(?<!["=])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
    return t;
  }

  function fmtBody(text) {
    const lines = text.split("\n");
    let html = "", inList = false, lt = "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { if (inList) { html += `</${lt}>`; inList = false; } continue; }
      const ol = line.match(/^\d+[\.\)]\s+(.+)/);
      const ul = line.match(/^[-*]\s+(.+)/) || line.match(/^item:\s*(.+)/);
      if (ol) {
        if (!inList || lt !== "ol") { if (inList) html += `</${lt}>`; html += "<ol>"; inList = true; lt = "ol"; }
        html += `<li>${fmtInline(ol[1])}</li>`;
      } else if (ul) {
        if (!inList || lt !== "ul") { if (inList) html += `</${lt}>`; html += "<ul>"; inList = true; lt = "ul"; }
        html += `<li>${fmtInline(ul[1])}</li>`;
      } else {
        if (inList) { html += `</${lt}>`; inList = false; }
        html += `<p>${fmtInline(line)}</p>`;
      }
    }
    if (inList) html += `</${lt}>`;
    return html;
  }

  function renderMarkdown(md) {
    let text = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sections = [], re = /(?:^|\n)\s*(?:\*\*)?(\d+)\.\s+(.+?):?\s*(?:\*\*)?:?\s*(?=\n|$)/gm;
    let lastIdx = 0, match;

    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIdx) {
        const pre = text.slice(lastIdx, match.index).trim();
        if (pre) sections.push({ type: "text", content: pre });
      }
      sections.push({ type: "heading", num: match[1], title: match[2].replace(/:\s*$/, "").replace(/\*\*/g, "").trim() });
      lastIdx = re.lastIndex;
    }
    if (lastIdx < text.length) sections.push({ type: "text", content: text.slice(lastIdx).trim() });

    if (!sections.some(s => s.type === "heading")) {
      return `<div class="section-card">${fmtInline(text)}</div>`;
    }

    let html = "";
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.type === "text" && i === 0) { html += `<p>${fmtInline(s.content)}</p>`; continue; }
      if (s.type === "heading") {
        const body = (i + 1 < sections.length && sections[i + 1].type === "text") ? sections[++i].content : "";
        const cls = s.title.toLowerCase().includes("related") ? "related-works" : "section-card";
        html += `<div class="${cls}"><h2>${s.num}. ${fmtInline(s.title)}</h2>${body ? fmtBody(body) : ""}</div>`;
      }
    }
    return html;
  }

  // ─── WAIT FOR PAGE ELEMENTS ─────────────────────────────

  async function waitForArxivElements() {
    for (let i = 0; i < 20; i++) {
      const title = document.querySelector("h1.title");
      const abstract = document.querySelector("blockquote.abstract");
      if (title && abstract) return { title, abstract };
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }

  // ─── MAIN ANALYSIS ───────────────────────────────────────

  async function runAnalysis(ui) {
    const { output, statusDot, statusText } = ui;

    setStatus(statusDot, statusText, "Reading arxiv page...", "loading");
    output.innerText = "⏳ Detecting paper...";

    const elements = await waitForArxivElements();

    if (!elements) {
      setStatus(statusDot, statusText, "No paper detected", "error");
      output.innerText = "⚠️ No research paper detected on this page.\n\nMake sure you are on an arxiv.org/abs/ page.";
      return;
    }

    const title = elements.title.innerText.replace("Title:", "").trim();
    const abstract = elements.abstract.innerText.replace("Abstract:", "").trim();

    setStatus(statusDot, statusText, "Analyzing paper...", "loading");
    output.innerText = "⏳ Analyzing paper:\n\n" + title;

    try {
      const response = await fetch(`${BACKEND}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abstract })
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();

      setStatus(statusDot, statusText, "✅ Paper analyzed", "success");
      output.innerHTML = renderMarkdown(data.analysis);

    } catch (err) {
      console.error("Research Radar error:", err);
      setStatus(statusDot, statusText, "Backend not running", "error");
      output.innerText = "❌ Cannot connect to backend.\n\nStart your FastAPI server:\n\n  cd AI_Agent\n  uvicorn main:app --reload\n\nThen click 🔄 Retry.";
    }
  }

  // ─── INIT ────────────────────────────────────────────────

  const bubble = createBubble(() => {
    ui.panel.style.display = "flex";
    ui.panel.style.animation = "ra-panel-in 0.3s ease-out";
  });
  bubble.style.display = "none";

  const ui = createPanel(bubble);
  ui.retryBtn.onclick = () => runAnalysis(ui);

  runAnalysis(ui);

})();
