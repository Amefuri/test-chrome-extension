'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const promptInput = document.getElementById('prompt-input');
  const charCount = document.getElementById('char-count');
  const workflowForm = document.getElementById('workflow-form');
  const runBtn = document.getElementById('run-btn');
  const statusSection = document.getElementById('status-section');
  const statusMessage = document.getElementById('status-message');
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const automationStatusDisplay = document.getElementById('automation-status-display');
  const automationStatusText = document.getElementById('automation-status-text');
  const automationStatusMessage = document.getElementById('automation-status-message');
  const presetNameInput = document.getElementById('preset-name-input');
  const savePresetBtn = document.getElementById('save-preset-btn');
  const presetList = document.getElementById('preset-list');

  /** Tracks whether we have a live connection to a Google Flow tab. */
  let isConnected = false;

  function setConnectionStatus(connected) {
    isConnected = connected;
    connectionDot.classList.toggle('connected', connected);
    connectionDot.classList.toggle('disconnected', !connected);
    connectionText.textContent = connected
      ? 'Google Flow tab connected'
      : 'No Google Flow tab detected';
  }

  function setAutomationStatus(state, message) {
    automationStatusDisplay.className = 'automation-status-display ' + state;
    const labels = { idle: 'Idle', running: 'Running', success: 'Success', error: 'Error' };
    automationStatusText.textContent = labels[state] || state;
    if (message) {
      automationStatusMessage.textContent = message;
      automationStatusMessage.classList.remove('hidden');
    } else {
      automationStatusMessage.classList.add('hidden');
    }
  }

  function getFormConfig() {
    return {
      prompt: promptInput.value,
      generationType: document.querySelector('input[name="generation-type"]:checked').value,
      aspectRatio: document.getElementById('aspect-ratio').value,
      quality: document.getElementById('quality').value
    };
  }

  function loadFormConfig(config) {
    promptInput.value = config.prompt || '';
    charCount.textContent = `${promptInput.value.length} / 2000`;
    const radio = document.querySelector(`input[name="generation-type"][value="${config.generationType}"]`);
    if (radio) radio.checked = true;
    if (config.aspectRatio) document.getElementById('aspect-ratio').value = config.aspectRatio;
    if (config.quality) document.getElementById('quality').value = config.quality;
  }

  function loadPresets() {
    try {
      chrome.storage.local.get({ presets: [] }, (result) => {
        if (chrome.runtime.lastError) return;
        renderPresetList(result.presets);
      });
    } catch {
      /* Storage API unavailable */
    }
  }

  function savePreset(name, config) {
    try {
      chrome.storage.local.get({ presets: [] }, (result) => {
        if (chrome.runtime.lastError) return;
        const existing = result.presets.filter((p) => p.name !== name);
        const presets = [...existing, { name, config }];
        chrome.storage.local.set({ presets });
      });
    } catch {
      showPresetError('Failed to save preset.');
    }
  }

  function loadPreset(name) {
    try {
      chrome.storage.local.get({ presets: [] }, (result) => {
        if (chrome.runtime.lastError) return;
        const preset = result.presets.find((p) => p.name === name);
        if (preset) loadFormConfig(preset.config);
      });
    } catch {
      /* Storage API unavailable */
    }
  }

  function deletePreset(name) {
    try {
      chrome.storage.local.get({ presets: [] }, (result) => {
        if (chrome.runtime.lastError) return;
        const presets = result.presets.filter((p) => p.name !== name);
        chrome.storage.local.set({ presets });
      });
    } catch {
      showPresetError('Failed to delete preset.');
    }
  }

  function renderPresetList(presets) {
    presetList.innerHTML = '';
    presets.forEach((preset) => {
      const li = document.createElement('li');
      li.className = 'preset-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'preset-item-name';
      nameSpan.textContent = preset.name;

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'preset-btn load-preset-btn';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => loadPreset(preset.name));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'preset-btn delete-preset-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete preset "${preset.name}"?`)) {
          deletePreset(preset.name);
        }
      });

      li.append(nameSpan, loadBtn, deleteBtn);
      presetList.appendChild(li);
    });
  }

  function showPresetError(msg) {
    let errorEl = document.getElementById('preset-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'preset-error';
      errorEl.className = 'preset-error';
      presetNameInput.parentElement.after(errorEl);
    }
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 3000);
  }

  savePresetBtn.addEventListener('click', () => {
    const name = presetNameInput.value.trim();
    if (!name) {
      showPresetError('Preset name cannot be empty.');
      return;
    }
    try {
      chrome.storage.local.get({ presets: [] }, (result) => {
        if (chrome.runtime.lastError) {
          showPresetError('Failed to check existing presets.');
          return;
        }
        if (result.presets.some((p) => p.name === name)) {
          showPresetError(`A preset named "${name}" already exists.`);
          return;
        }
        savePreset(name, getFormConfig());
        presetNameInput.value = '';
      });
    } catch {
      showPresetError('Failed to save preset.');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.presets) {
      renderPresetList(changes.presets.newValue || []);
    }
  });

  loadPresets();

  promptInput.addEventListener('input', () => {
    const len = promptInput.value.length;
    charCount.textContent = `${len} / 2000`;
  });

  /**
   * Validates form inputs before submission.
   * @returns {string|null} Error message or null if valid.
   */
  function validateForm() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      return 'Please enter a prompt before running automation.';
    }
    if (!isConnected) {
      return 'No Google Flow tab detected. Please open Google Flow first.';
    }
    return null;
  }

  /**
   * Safely sends a message to the service worker, handling disconnection errors.
   * @param {Object} message
   * @returns {Promise<Object>}
   */
  async function safeSendMessage(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
        return { success: false, error: 'Extension service worker is not available. Try reloading the extension.' };
      }
      return { success: false, error: errMsg || 'Failed to communicate with extension.' };
    }
  }

  workflowForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      showStatus(validationError);
      setAutomationStatus('error', validationError);
      return;
    }

    const config = getFormConfig();
    config.prompt = config.prompt.trim();

    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    setAutomationStatus('running', 'Starting automation...');

    const response = await safeSendMessage({
      type: 'START_AUTOMATION',
      payload: config
    });

    if (response && response.success) {
      setAutomationStatus('success', 'Automation completed successfully.');
    } else {
      setAutomationStatus('error', response?.error || 'Unknown error occurred.');
    }

    runBtn.disabled = false;
    runBtn.textContent = 'Run Automation';
  });

  function checkConnection() {
    try {
      chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' }, (response) => {
        if (chrome.runtime.lastError) {
          setConnectionStatus(false);
          return;
        }
        setConnectionStatus(response && response.connected);
      });
    } catch {
      setConnectionStatus(false);
    }
  }

  checkConnection();
  setInterval(checkConnection, 3000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'AUTOMATION_STATUS') {
      const { state, message: statusMsg } = message.payload || {};
      if (state) {
        setAutomationStatus(state, statusMsg);
      }
      if (state === 'success' || state === 'error') {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Automation';
      }
    }
  });

  function showStatus(text) {
    statusSection.classList.remove('hidden');
    statusMessage.textContent = text;
  }
});
