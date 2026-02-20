// Content script - injected into web pages for DOM automation
console.log('[AutoClaude] Content script loaded');

// Message listener for commands from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    // TODO: DOM automation commands will go here
    // Examples: click, type, select, scroll, extract text, etc.
    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
  }

  // Return true to indicate async sendResponse usage
  return true;
});
