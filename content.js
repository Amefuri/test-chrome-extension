// Content script - injected into web pages for DOM automation
// Content script active - notify via AUTOMATION_STATUS if needed

// --- DOM Element Detection Utilities ---

/**
 * Wait for an element to appear in the DOM using MutationObserver.
 * @param {string} selector - CSS selector to watch for
 * @param {number} [timeout=10000] - Max wait time in ms
 * @returns {Promise<Element>} Resolves with the found element
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let resolved = false;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el && !resolved) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        reject(new Error(`Element "${selector}" not found within ${timeout}ms. The page layout may have changed.`));
      }
    }, timeout);
  });
}

/**
 * Retry querying for an element with polling.
 * @param {string} selector - CSS selector
 * @param {number} [maxAttempts=10] - Number of attempts
 * @param {number} [delay=500] - Delay between attempts in ms
 * @returns {Promise<Element>} Resolves with the found element
 */
function retryQuery(selector, maxAttempts = 10, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function poll() {
      attempts++;
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (attempts >= maxAttempts) {
        reject(new Error(`Element "${selector}" not found after ${maxAttempts} attempts (${maxAttempts * delay}ms total). The element may not exist on this page.`));
        return;
      }
      setTimeout(poll, delay);
    }

    poll();
  });
}

/**
 * Try multiple selector strategies in order: data attributes, aria labels, CSS classes.
 * @param {Array<string>} selectors - Ordered list of selectors to try
 * @returns {Element|null} First matching element or null
 */
function queryWithFallback(selectors) {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
      // Invalid selector syntax, skip
    }
  }
  return null;
}

// --- Google Flow UI Element Finders ---

const FLOW_SELECTORS = {
  promptInput: [
    '[data-testid="prompt-input"]',
    '[aria-label="Prompt input"]',
    'textarea.prompt-input',
    'textarea[placeholder*="prompt" i]',
    '.prompt-area textarea',
  ],
  generateButton: [
    '[data-testid="generate-button"]',
    '[aria-label="Generate"]',
    'button.generate-btn',
    'button[data-action="generate"]',
    'button[type="submit"]',
  ],
  modeSelector: [
    '[data-testid="mode-selector"]',
    '[aria-label="Mode selector"]',
    'select.mode-selector',
    '.mode-selector',
    '[role="listbox"]',
  ],
};

/**
 * Find the prompt input element using fallback strategies.
 * @returns {Element|null}
 */
function findPromptInput() {
  return queryWithFallback(FLOW_SELECTORS.promptInput);
}

/**
 * Find the generate button using fallback strategies.
 * @returns {Element|null}
 */
function findGenerateButton() {
  return queryWithFallback(FLOW_SELECTORS.generateButton);
}

/**
 * Find the mode selector using fallback strategies.
 * @returns {Element|null}
 */
function findModeSelector() {
  return queryWithFallback(FLOW_SELECTORS.modeSelector);
}

// --- Status Reporting ---

/**
 * Send an automation status update to the service worker (relayed to side panel).
 * @param {'running'|'success'|'error'} state
 * @param {string} message
 */
function sendStatus(state, message) {
  try {
    chrome.runtime.sendMessage({
      type: 'AUTOMATION_STATUS',
      payload: { state, message },
    });
  } catch {
    // Extension context may have been invalidated
  }
}

// --- Text Input Utility ---

/**
 * Set the value of an input/textarea element in a React-compatible way.
 * Assigns the value via the native setter, then dispatches input/change events
 * so that React's synthetic event system picks up the change.
 * @param {HTMLElement} element - The input or textarea element
 * @param {string} text - The text to enter
 */
function setInputValue(element, text) {
  const nativeInputValueSetter =
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, text);
  } else {
    element.value = text;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// --- Mode/Type Selection ---

/**
 * Attempt to select a generation type (e.g. "image" or "video") in the mode selector.
 * Handles both <select> elements and custom listbox/button-based selectors.
 * @param {string} generationType - The type to select
 * @returns {boolean} Whether selection was attempted
 */
function selectGenerationType(generationType) {
  const modeEl = findModeSelector();
  if (!modeEl) return false;

  try {
    if (modeEl.tagName === 'SELECT') {
      const option = Array.from(modeEl.options).find(
        (opt) => opt.value.toLowerCase() === generationType.toLowerCase() ||
                 opt.textContent.toLowerCase().includes(generationType.toLowerCase())
      );
      if (option) {
        modeEl.value = option.value;
        modeEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } else {
      // Custom selector: look for clickable options within or near the element
      const options = modeEl.querySelectorAll('[role="option"], button, [data-value]');
      for (const opt of options) {
        if (opt.textContent.toLowerCase().includes(generationType.toLowerCase())) {
          opt.click();
          return true;
        }
      }
    }
  } catch {
    // DOM interaction failure
  }

  return false;
}

// --- Core Automation ---

/**
 * Automate the Google Flow workflow: enter prompt, select type, click generate.
 * @param {Object} config - Workflow configuration
 * @param {string} config.prompt - The prompt text to enter
 * @param {string} [config.generationType] - Generation type (e.g. "image", "video")
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function automateGoogleFlow(config) {
  try {
    const { prompt, generationType } = config || {};

    if (!prompt || !prompt.trim()) {
      return { success: false, error: 'No prompt provided.' };
    }

    // Step 1: Find prompt input
    sendStatus('running', 'Finding prompt input...');
    let promptInput = findPromptInput();

    if (!promptInput) {
      sendStatus('running', 'Waiting for prompt input to appear...');
      try {
        promptInput = await waitForElement(FLOW_SELECTORS.promptInput[0], 5000)
          .catch(() => retryQuery(FLOW_SELECTORS.promptInput[0], 5, 500));
      } catch {
        // Try all selectors via polling
        for (const selector of FLOW_SELECTORS.promptInput) {
          try {
            promptInput = await retryQuery(selector, 3, 300);
            if (promptInput) break;
          } catch {
            // continue to next selector
          }
        }
      }
    }

    if (!promptInput) {
      const error = 'Could not find the prompt input on the page. Make sure you are on the Google Flow tool page.';
      sendStatus('error', error);
      return { success: false, error };
    }

    // Step 2: Enter prompt text
    sendStatus('running', 'Entering prompt text...');
    promptInput.focus();
    setInputValue(promptInput, prompt.trim());

    // Step 3: Select generation type if specified
    if (generationType) {
      sendStatus('running', `Selecting generation type: ${generationType}...`);
      const selected = selectGenerationType(generationType);
      if (!selected) {
        sendStatus('running', `Mode selector not found or type "${generationType}" unavailable. Continuing with default.`);
      }
    }

    // Step 4: Click generate button
    sendStatus('running', 'Clicking generate button...');
    let generateBtn = findGenerateButton();

    if (!generateBtn) {
      for (const selector of FLOW_SELECTORS.generateButton) {
        try {
          generateBtn = await retryQuery(selector, 3, 300);
          if (generateBtn) break;
        } catch {
          // continue to next selector
        }
      }
    }

    if (!generateBtn) {
      const error = 'Could not find the generate button on the page. The page layout may have changed.';
      sendStatus('error', error);
      return { success: false, error };
    }

    generateBtn.click();
    sendStatus('success', 'Automation completed. Generation triggered.');
    return { success: true };
  } catch (err) {
    const error = `Automation failed unexpectedly: ${err.message}`;
    sendStatus('error', error);
    return { success: false, error };
  }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ success: false, error: 'Invalid message received.' });
    return true;
  }

  const { type, payload } = message;

  switch (type) {
    case 'START_AUTOMATION':
      automateGoogleFlow(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: `Automation error: ${err.message}` }));
      break;

    case 'PING':
      sendResponse({ success: true, pong: true });
      break;

    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
  }

  return true;
});
