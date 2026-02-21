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

  function savePresets(presets, callback) {
    chrome.storage.local.set({ presets }, callback);
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
      loadBtn.addEventListener('click', () => loadFormConfig(preset.config));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'preset-btn delete-preset-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        chrome.storage.local.get({ presets: [] }, (result) => {
          const updated = result.presets.filter((_, i) => i !== index);
          savePresets(updated, () => renderPresetList(updated));
        });
      });

      li.append(nameSpan, loadBtn, deleteBtn);
      presetList.appendChild(li);
    });
  }

  savePresetBtn.addEventListener('click', () => {
    const name = presetNameInput.value.trim();
    if (!name) return;
    const config = getFormConfig();
    chrome.storage.local.get({ presets: [] }, (result) => {
      const presets = [...result.presets, { name, config }];
      savePresets(presets, () => {
        presetNameInput.value = '';
        renderPresetList(presets);
      });
    });
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

  function showStatus(text) {
    statusSection.classList.remove('hidden');
    statusMessage.textContent = text;
  }
});
