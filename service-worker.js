/**
 * Service Worker (Background Script)
 * Coordinates messaging between side panel and content scripts.
 * Acts as a central message routing hub for all cross-component communication.
 */

const GOOGLE_FLOW_URL_PATTERN = 'https://labs.google/fx/tools/flow';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/**
 * Finds the active tab matching the Google Flow URL pattern.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
function findGoogleFlowTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs.find((t) => t.url && t.url.startsWith(GOOGLE_FLOW_URL_PATTERN));
      resolve(tab || null);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    case 'START_AUTOMATION':
      handleStartAutomation(message, sendResponse);
      break;

    case 'CHECK_CONNECTION':
      handleCheckConnection(sendResponse);
      break;

    case 'AUTOMATION_STATUS':
      handleAutomationStatus(message, sender, sendResponse);
      break;

    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      break;
  }

  return true;
});

/**
 * Forwards automation config from side panel to content script in the active Google Flow tab.
 */
function handleStartAutomation(message, sendResponse) {
  findGoogleFlowTab().then((tab) => {
    if (!tab) {
      sendResponse({
        success: false,
        error: 'No Google Flow tab found. Please navigate to Google Flow first.',
      });
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: `Content script not reachable: ${chrome.runtime.lastError.message}`,
        });
        return;
      }
      sendResponse(response);
    });
  });
}

/**
 * Checks whether a Google Flow tab is active and the content script is reachable.
 */
function handleCheckConnection(sendResponse) {
  findGoogleFlowTab().then((tab) => {
    if (!tab) {
      sendResponse({ success: true, connected: false });
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: true, connected: false });
        return;
      }
      sendResponse({ success: true, connected: true, tabId: tab.id });
    });
  });
}

/**
 * Relays automation status updates from the content script to the side panel.
 */
function handleAutomationStatus(message, sender, sendResponse) {
  chrome.runtime.sendMessage(message).catch(() => {
    /* Side panel may not be listening */
  });
  sendResponse({ success: true });
}
