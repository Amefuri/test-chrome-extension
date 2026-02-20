/**
 * Service Worker (Background Script)
 * Coordinates messaging between side panel and content scripts.
 */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      break;
  }

  return true;
});
