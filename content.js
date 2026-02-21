// Content script - injected into web pages for DOM automation
console.log('[AutoClaude] Content script loaded');

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
        reject(new Error(`waitForElement: "${selector}" not found within ${timeout}ms`));
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
        reject(new Error(`retryQuery: "${selector}" not found after ${maxAttempts} attempts`));
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
    const el = document.querySelector(selector);
    if (el) return el;
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
    'button:has-text("Generate")',
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
