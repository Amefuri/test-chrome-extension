/**
 * Service Worker (Background Script)
 * Coordinates messaging between side panel and content scripts.
 * Acts as a central message routing hub for all cross-component communication.
 */

const GOOGLE_FLOW_URL_PATTERN = 'https://labs.google/fx/tools/flow';

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch {
  // Side panel API may not be available in all contexts
}

/**
 * Finds the active tab matching the Google Flow URL pattern.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
function findGoogleFlowTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        const tab = (tabs || []).find((t) => t.url && t.url.startsWith(GOOGLE_FLOW_URL_PATTERN));
        resolve(tab || null);
      });
    } catch {
      resolve(null);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ success: false, error: 'Invalid message: missing type.' });
    return true;
  }

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
  findGoogleFlowTab()
    .then((tab) => {
      if (!tab) {
        sendResponse({
          success: false,
          error: 'No Google Flow tab found. Please navigate to Google Flow first.',
        });
        return;
      }

      try {
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
              sendResponse({
                success: false,
                error: 'Content script not loaded. Try refreshing the Google Flow page.',
              });
            } else {
              sendResponse({
                success: false,
                error: `Content script not reachable: ${errMsg}`,
              });
            }
            return;
          }
          sendResponse(response || { success: false, error: 'No response from content script.' });
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: `Failed to send message to tab: ${err.message}`,
        });
      }
    })
    .catch((err) => {
      sendResponse({
        success: false,
        error: `Failed to find Google Flow tab: ${err.message}`,
      });
    });
}

/**
 * Checks whether a Google Flow tab is active and the content script is reachable.
 */
function handleCheckConnection(sendResponse) {
  findGoogleFlowTab()
    .then((tab) => {
      if (!tab) {
        sendResponse({ success: true, connected: false });
        return;
      }

      try {
        chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: true, connected: false });
            return;
          }
          sendResponse({ success: true, connected: true, tabId: tab.id });
        });
      } catch {
        sendResponse({ success: true, connected: false });
      }
    })
    .catch(() => {
      sendResponse({ success: true, connected: false });
    });
}

/**
 * Relays automation status updates from the content script to the side panel.
 */
function handleAutomationStatus(message, sender, sendResponse) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {
      /* Side panel may not be listening */
    });
  } catch {
    /* Side panel may not be listening */
  }
  sendResponse({ success: true });
}
