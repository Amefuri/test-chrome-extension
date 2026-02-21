'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const promptInput = document.getElementById('prompt-input');
  const charCount = document.getElementById('char-count');
  const workflowForm = document.getElementById('workflow-form');
  const runBtn = document.getElementById('run-btn');
  const statusSection = document.getElementById('status-section');
  const statusMessage = document.getElementById('status-message');

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
    showStatus('Starting automation...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_AUTOMATION',
        payload: config
      });

      if (response && response.success) {
        showStatus('Automation completed successfully.');
      } else {
        showStatus(`Automation failed: ${response?.error || 'Unknown error'}`);
      }
    } catch (err) {
      showStatus(`Error: ${err.message}`);
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
