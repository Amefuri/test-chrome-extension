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

  function setConnectionStatus(connected) {
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
    chrome.storage.local.get({ presets: [] }, (result) => {
      renderPresetList(result.presets);
    });
  }

  function savePreset(name, config) {
    chrome.storage.local.get({ presets: [] }, (result) => {
      const existing = result.presets.filter((p) => p.name !== name);
      const presets = [...existing, { name, config }];
      chrome.storage.local.set({ presets });
    });
  }

  function loadPreset(name) {
    chrome.storage.local.get({ presets: [] }, (result) => {
      const preset = result.presets.find((p) => p.name === name);
      if (preset) loadFormConfig(preset.config);
    });
  }

  function deletePreset(name) {
    chrome.storage.local.get({ presets: [] }, (result) => {
      const presets = result.presets.filter((p) => p.name !== name);
      chrome.storage.local.set({ presets });
    });
  }

  function renderPresetList(presets) {
    presetList.innerHTML = '';
    presets.forEach((preset, index) => {
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
    chrome.storage.local.get({ presets: [] }, (result) => {
      if (result.presets.some((p) => p.name === name)) {
        showPresetError(`A preset named "${name}" already exists.`);
        return;
      }
      savePreset(name, getFormConfig());
      presetNameInput.value = '';
    });
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

  workflowForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const prompt = promptInput.value.trim();
    if (!prompt) {
      showStatus('Please enter a prompt.');
      return;
    }

    const generationType = document.querySelector('input[name="generation-type"]:checked').value;
    const aspectRatio = document.getElementById('aspect-ratio').value;
    const quality = document.getElementById('quality').value;

    const config = {
      prompt,
      generationType,
      aspectRatio,
      quality
    };

    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    setAutomationStatus('running', 'Starting automation...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_AUTOMATION',
        payload: config
      });

      if (response && response.success) {
        setAutomationStatus('success', 'Automation completed successfully.');
      } else {
        setAutomationStatus('error', response?.error || 'Unknown error');
      }
    } catch (err) {
      setAutomationStatus('error', err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Automation';
    }
  });

  function checkConnection() {
    chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' }, (response) => {
      if (chrome.runtime.lastError) {
        setConnectionStatus(false);
        return;
      }
      setConnectionStatus(response && response.connected);
    });
  }

  checkConnection();
  setInterval(checkConnection, 3000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTOMATION_STATUS') {
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
