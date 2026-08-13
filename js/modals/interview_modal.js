/**
 * interview_modal.js - Anansi Forge Character Voice Interview Rapid Tester
 */

(() => {
  'use strict';

  let modalEl = null;
  let activeComp = null;
  let testHistory = [];

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMarkdown(str) {
    if (!str) return '';
    let text = escapeHTML(str);
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function ensureModalDOM() {
    if (document.getElementById('interview-modal-overlay')) {
      modalEl = document.getElementById('interview-modal-overlay');
      return;
    }

    modalEl = document.createElement('div');
    modalEl.id = 'interview-modal-overlay';
    modalEl.className = 'modal-overlay hidden';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = `
      <div class="modal" style="max-width: 740px; width: 92%; max-height: 88vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color);">
          <div>
            <h3 id="interview-modal-title" style="margin: 0; font-size: 1.1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              🎙️ Character Voice Rapid Tester
            </h3>
            <span id="interview-modal-subtitle" style="font-size: 0.78rem; color: var(--text-muted);">Test character dialogue voice & response style via configured LLM API</span>
          </div>
          <button id="btn-close-interview-modal" class="btn btn-ghost btn-icon" style="font-size: 1.2rem; cursor: pointer;">&times;</button>
        </div>

        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
          <!-- Character Meta Badge Bar -->
          <div id="interview-char-meta" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.8rem;">
            <!-- Populated dynamically -->
          </div>

          <!-- Quick Presets -->
          <div>
            <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">
              Quick Voice Test Scenarios:
            </label>
            <div id="interview-presets" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button class="btn btn-secondary btn-sm interview-preset-btn" data-prompt="Introduce yourself and state your current goal.">👋 Introduce Yourself</button>
              <button class="btn btn-secondary btn-sm interview-preset-btn" data-prompt="How do you react when surprised by an unexpected threat?">💥 Surprise Threat</button>
              <button class="btn btn-secondary btn-sm interview-preset-btn" data-prompt="Someone just insulted your core beliefs. How do you respond?">⚡ Insult Reaction</button>
              <button class="btn btn-secondary btn-sm interview-preset-btn" data-prompt="Order your favorite drink at a crowded bar or tavern.">🍷 Order a Drink</button>
              <button class="btn btn-secondary btn-sm interview-preset-btn" data-prompt="Give a short, powerful pep talk to an anxious ally.">🛡️ Pep Talk Ally</button>
            </div>
          </div>

          <!-- Prompt Input Area -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="interview-prompt-input" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Custom Scenario / Interview Prompt:
            </label>
            <div style="display: flex; gap: 8px;">
              <textarea id="interview-prompt-input" class="mc-modal-input" placeholder="Type a prompt or question for the character..." style="flex: 1; min-height: 52px; max-height: 120px; resize: vertical; padding: 10px; font-family: inherit; font-size: 0.88rem;" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true"></textarea>
              <button id="btn-interview-send" class="btn btn-primary" style="padding: 0 16px; display: flex; align-items: center; gap: 6px; white-space: nowrap; height: 52px;">
                <span>Test Voice</span> 🎙️
              </button>
            </div>
          </div>

          <!-- Test Results Log -->
          <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
                Voice Test Responses:
              </label>
              <button id="btn-interview-clear-log" class="btn btn-ghost btn-sm" style="font-size: 0.75rem; color: var(--text-muted);">Clear Log</button>
            </div>
            <div id="interview-responses-log" style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; min-height: 180px; max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
              <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 40px 10px;">
                Select a quick scenario above or type a prompt to generate character voice responses.
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-color);">
          <button id="btn-interview-close" class="btn btn-secondary">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // Bind Close events
    const closeBtn = document.getElementById('btn-close-interview-modal');
    const closeFooterBtn = document.getElementById('btn-interview-close');
    const overlayClick = (e) => {
      if (e.target === modalEl) closeModal();
    };

    closeBtn.addEventListener('click', closeModal);
    closeFooterBtn.addEventListener('click', closeModal);
    modalEl.addEventListener('click', overlayClick);

    // Bind Send / Presets
    const sendBtn = document.getElementById('btn-interview-send');
    const inputEl = document.getElementById('interview-prompt-input');
    const clearBtn = document.getElementById('btn-interview-clear-log');

    sendBtn.addEventListener('click', handleSendPrompt);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendPrompt();
      }
    });

    clearBtn.addEventListener('click', () => {
      testHistory = [];
      renderLog();
    });

    // Preset button clicks
    const presetsContainer = document.getElementById('interview-presets');
    presetsContainer.addEventListener('click', (e) => {
      const presetBtn = e.target.closest('.interview-preset-btn');
      if (presetBtn) {
        const promptText = presetBtn.dataset.prompt;
        inputEl.value = promptText;
        handleSendPrompt();
      }
    });
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add('hidden');
    activeComp = null;
  }

  async function openModal(charIdOrName, fallbackName = '') {
    ensureModalDOM();
    testHistory = [];

    let comp = null;
    if (charIdOrName && window.ForgeDB?.getComponent) {
      comp = await window.ForgeDB.getComponent(charIdOrName);
    }

    if (!comp && (charIdOrName || fallbackName) && window.ForgeDB?.getAllComponents) {
      const all = await window.ForgeDB.getAllComponents();
      const searchTarget = (fallbackName || charIdOrName || '').toLowerCase();
      if (searchTarget) {
        comp = all.find(c => c.name.toLowerCase() === searchTarget) || all.find(c => c.name.toLowerCase().includes(searchTarget));
      }
    }

    activeComp = comp || {
      id: charIdOrName,
      name: fallbackName || charIdOrName || 'Character',
      category: 'character',
      content: ''
    };

    // Populate Modal Header & Meta
    const titleEl = document.getElementById('interview-modal-title');
    const metaEl = document.getElementById('interview-char-meta');

    titleEl.innerHTML = `🎙️ Voice Tester: <span style="color:var(--accent);">${escapeHTML(activeComp.name)}</span>`;

    const lineageBadge = activeComp.lineage ? `<span style="background:rgba(99,102,241,0.15); color:var(--accent); padding:2px 8px; border-radius:12px;">Lineage: ${escapeHTML(activeComp.lineage)}</span>` : '';
    const categoryBadge = `<span style="background:rgba(168,85,247,0.15); color:#c084fc; padding:2px 8px; border-radius:12px;">Category: ${escapeHTML(activeComp.category || 'character')}</span>`;
    const universeBadge = activeComp.tracker?.universe ? `<span style="background:rgba(56,189,248,0.15); color:#38bdf8; padding:2px 8px; border-radius:12px;">Universe: ${escapeHTML(activeComp.tracker.universe)}</span>` : '';
    const tokenCount = Math.round((activeComp.content || '').length / 4);

    metaEl.innerHTML = `
      ${categoryBadge}
      ${lineageBadge}
      ${universeBadge}
      <span style="color:var(--text-muted); margin-left:auto;">Context size: ~${tokenCount} tokens</span>
    `;

    renderLog();
    modalEl.classList.remove('hidden');

    const inputEl = document.getElementById('interview-prompt-input');
    inputEl.value = '';
    inputEl.focus();
  }

  function renderLog() {
    const logEl = document.getElementById('interview-responses-log');
    logEl.innerHTML = '';

    if (testHistory.length === 0) {
      logEl.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 40px 10px;">
          Select a quick scenario above or type a prompt to test <strong>${escapeHTML(activeComp?.name || 'character')}</strong>'s voice.
        </div>
      `;
      return;
    }

    testHistory.forEach((item, idx) => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(18, 20, 28, 0.5);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;

      let thinkHtml = '';
      let dialogueText = item.response;

      const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
      if (thinkRegex.test(dialogueText)) {
        const match = dialogueText.match(thinkRegex);
        const reasoning = match[1].trim();
        dialogueText = dialogueText.replace(thinkRegex, '').trim();
        thinkHtml = `<details style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;"><summary style="cursor:pointer; font-weight:600;">Reasoning Token Output</summary><pre style="white-space:pre-wrap; background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; margin-top:4px;">${escapeHTML(reasoning)}</pre></details>`;
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:4px;">
          <span style="font-size:0.78rem; font-weight:700; color:var(--accent);">Prompt: "${escapeHTML(item.prompt)}"</span>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-ghost btn-sm btn-copy-voice" data-idx="${idx}" title="Copy Response" style="padding:1px 6px; font-size:0.72rem;">📋 Copy</button>
            <button class="btn btn-ghost btn-sm btn-append-notes" data-idx="${idx}" title="Append to Component Notes" style="padding:1px 6px; font-size:0.72rem;">📌 Save to Notes</button>
          </div>
        </div>
        ${thinkHtml}
        <div style="font-size:0.9rem; line-height:1.5; color:var(--text-primary); margin-top:4px;">
          ${formatMarkdown(dialogueText)}
        </div>
      `;

      card.querySelector('.btn-copy-voice').addEventListener('click', () => {
        navigator.clipboard.writeText(dialogueText);
        if (window.showToast) window.showToast('Copied voice response to clipboard!', 'success');
      });

      card.querySelector('.btn-append-notes').addEventListener('click', async () => {
        if (!activeComp || !activeComp.id) {
          if (window.showToast) window.showToast('Cannot save to unpersisted component', 'error');
          return;
        }
        try {
          const freshComp = await window.ForgeDB.getComponent(activeComp.id);
          if (freshComp) {
            const noteSnippet = `\n\n### Voice Test Response (${new Date().toLocaleDateString()})\n**Prompt:** ${item.prompt}\n${dialogueText}`;
            freshComp.content = (freshComp.content || '') + noteSnippet;
            await window.ForgeDB.saveComponent(freshComp);
            if (window.showToast) window.showToast(`Saved voice sample to ${freshComp.name} notes!`, 'success');
          }
        } catch (e) {
          console.error(e);
          if (window.showToast) window.showToast('Failed to append notes: ' + e.message, 'error');
        }
      });

      logEl.appendChild(card);
    });

    logEl.scrollTop = logEl.scrollHeight;
  }

  async function handleSendPrompt() {
    const inputEl = document.getElementById('interview-prompt-input');
    const sendBtn = document.getElementById('btn-interview-send');
    const promptText = inputEl.value.trim();

    if (!promptText) return;
    if (!activeComp) return;

    const origText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = 'Generating... ⏳';

    // Build system prompt for character
    let systemPrompt = `You are roleplaying as ${activeComp.name}.\n`;
    if (activeComp.content) {
      systemPrompt += `\n[Character Background, Personality, and Rules]:\n${activeComp.content}\n`;
    }
    systemPrompt += `\nINSTRUCTIONS: Stay completely in character as ${activeComp.name}. Respond directly in character voice to the user's scenario/question. Use asterisks for physical actions (e.g. *crosses arms and scowls*). Keep responses focused and vivid.`;

    const history = [
      { role: 'user', content: promptText }
    ];

    try {
      const responseText = await window.ForgeLLM.generate(systemPrompt, history);

      testHistory.push({
        prompt: promptText,
        response: responseText,
        timestamp: new Date().toISOString()
      });

      inputEl.value = '';
      renderLog();
    } catch (err) {
      console.error(err);
      if (window.showToast) {
        window.showToast(`Failed to generate voice response: ${err.message}`, 'error');
      } else if (window.showAlertModal) {
        window.showAlertModal({
          title: '🚫 Generation Failed',
          message: `Failed to generate voice response: ${err.message}`
        });
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = origText;
    }
  }

  const InterviewModal = {
    openModal: openModal,
    closeModal: closeModal
  };

  window.MissionControlInterviewModal = InterviewModal;
})();
