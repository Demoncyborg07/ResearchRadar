// background.js — Auto-detects PDF tabs and triggers analysis
// Also provides file:// fetch support for content scripts

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const url = tab.url || "";
  const isPDF =
    url.toLowerCase().endsWith(".pdf") ||
    (url.startsWith("file://") && url.toLowerCase().endsWith(".pdf"));

  if (isPDF) {
    // Inject the PDF panel script into the tab automatically
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["pdf_panel.js"]
    }).catch(err => console.error("Auto-inject failed:", err));
  }
});

// ─── MESSAGE HANDLER ──────────────────────────────────────
// Content scripts cannot fetch file:// URLs due to browser security.
// The background service worker CAN access file:// URLs when the
// extension has the "file:///*" host permission, so we proxy the fetch.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_PDF") {
    fetch(message.url)
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then(buf => {
        // Convert ArrayBuffer to a plain array so it can be serialized
        sendResponse({ success: true, data: Array.from(new Uint8Array(buf)) });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    // Return true to indicate we will send a response asynchronously
    return true;
  }
});
