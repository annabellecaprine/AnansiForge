/**
 * sandbox.js - Playtest Arena (Spindle Chat Sandbox) with Reasoning Inspector & User Personas.
 */

(() => {
  let activeProjectId = '';
  let activeProject = null;
  let chatHistory = [];
  
  // Personas State
  let personasList = [];
  let activePersonaId = '';

  // DOM Elements
  const sandboxView = document.getElementById('sandbox-view');
  const botNameHeader = document.getElementById('sandbox-bot-name');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-chat-send');
  
  // Persona Selector DOM
  const personaSelect = document.getElementById('sandbox-persona-select');
  const btnManagePersonas = document.getElementById('btn-sandbox-manage-personas');

  // Persona Modal DOM
  const personaModalOverlay = document.getElementById('persona-modal-overlay');
  const btnClosePersonaModal = document.getElementById('btn-close-persona-modal');
  const personaListSelect = document.getElementById('persona-list-select');
  const personaNameInput = document.getElementById('persona-name');
  const personaDescInput = document.getElementById('persona-description');
  const btnSavePersona = document.getElementById('btn-save-persona');
  const btnDeletePersona = document.getElementById('btn-delete-persona');

  // Inspector DOM
  const inspectorPanel = document.getElementById('sandbox-inspector');
  const btnInspectToggle = document.getElementById('btn-sandbox-inspect');
  const reasoningOutput = document.getElementById('reasoning-output');
  const promptOutput = document.getElementById('prompt-output');
  const playtestNotes = document.getElementById('playtest-notes');

  function initSandbox() {
    btnSend.addEventListener('click', handleUserSendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserSendMessage();
      }
    });

    document.getElementById('btn-sandbox-reset').addEventListener('click', resetChat);
    btnInspectToggle.addEventListener('click', toggleInspector);
    document.getElementById('btn-sandbox-export').addEventListener('click', exportChatLog);

    // Auto-save notes to the active project
    if (playtestNotes) {
      playtestNotes.addEventListener('input', async (e) => {
        if (!activeProject) return;
        activeProject.notes = e.target.value;
        await window.ForgeDB.saveProject(activeProject);
      });
    }

    // Inspector Tabs
    inspectorPanel.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        inspectorPanel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        inspectorPanel.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const panelId = `tab-${btn.dataset.tab}`;
        document.getElementById(panelId).classList.add('active');
      });
    });

    // Persona Selector Event
    personaSelect.addEventListener('change', (e) => {
      activePersonaId = e.target.value;
      localStorage.setItem('anansi_active_persona_id', activePersonaId);
      renderChatLog();
      updatePromptInspector();
    });

    // Persona Modal Events
    btnManagePersonas.addEventListener('click', openPersonaModal);
    btnClosePersonaModal.addEventListener('click', () => personaModalOverlay.classList.add('hidden'));
    personaModalOverlay.addEventListener('click', (e) => {
      if (e.target === personaModalOverlay) personaModalOverlay.classList.add('hidden');
    });
    personaListSelect.addEventListener('change', handlePersonaModalListSelect);
    btnSavePersona.addEventListener('click', savePersonaForm);
    btnDeletePersona.addEventListener('click', deletePersonaForm);

    // Resize Handler for reasoning/context panel
    const resizeHandle = document.getElementById('sandbox-inspector-resize');
    if (resizeHandle) {
      const savedWidth = localStorage.getItem('sandbox-inspector-width');
      if (savedWidth) {
        inspectorPanel.style.width = `${savedWidth}px`;
      }

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        inspectorPanel.classList.add('resizing');
        resizeHandle.classList.add('dragging');

        const doDrag = (moveEvent) => {
          const newWidth = window.innerWidth - moveEvent.clientX;
          // Constrain width between 250px and 800px
          const constrainedWidth = Math.max(250, Math.min(800, newWidth));
          inspectorPanel.style.width = `${constrainedWidth}px`;
        };

        const stopDrag = () => {
          inspectorPanel.classList.remove('resizing');
          resizeHandle.classList.remove('dragging');

          const finalWidth = parseInt(inspectorPanel.style.width, 10);
          if (!isNaN(finalWidth)) {
            localStorage.setItem('sandbox-inspector-width', finalWidth);
          }

          document.removeEventListener('mousemove', doDrag);
          document.removeEventListener('mouseup', stopDrag);
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
      });
    }
  }

  // --- Persona Management & Seeding ---

  async function loadAndSeedPersonas() {
    try {
      personasList = await window.ForgeDB.getAllPersonas();
      
      // Seed default persona if none exist
      if (personasList.length === 0) {
        const defaultPersona = {
          name: 'User',
          description: 'The protagonist of the story.'
        };
        const record = await window.ForgeDB.savePersona(defaultPersona);
        personasList.push(record);
      }

      // Restore active persona from localStorage or default to first
      const savedActiveId = localStorage.getItem('anansi_active_persona_id');
      const matches = personasList.find(p => p.id === savedActiveId);
      activePersonaId = matches ? matches.id : personasList[0].id;
      localStorage.setItem('anansi_active_persona_id', activePersonaId);

      hydratePersonaDropdowns();
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  }

  function hydratePersonaDropdowns() {
    // 1. Sandbox Selector Header
    personaSelect.innerHTML = '';
    personasList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === activePersonaId) opt.selected = true;
      personaSelect.appendChild(opt);
    });

    // 2. Modal Selector
    personaListSelect.innerHTML = '<option value="new">+ Create New Persona</option>';
    personasList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      personaListSelect.appendChild(opt);
    });
  }

  function openPersonaModal() {
    personaListSelect.value = activePersonaId;
    handlePersonaModalListSelect();
    personaModalOverlay.classList.remove('hidden');
  }

  function handlePersonaModalListSelect() {
    const val = personaListSelect.value;
    if (val === 'new') {
      personaNameInput.value = '';
      personaDescInput.value = '';
      btnDeletePersona.style.display = 'none';
    } else {
      const p = personasList.find(x => x.id === val);
      if (p) {
        personaNameInput.value = p.name;
        personaDescInput.value = p.description;
        btnDeletePersona.style.display = personasList.length > 1 ? 'inline-block' : 'none'; // Keep at least one
      }
    }
  }

  async function savePersonaForm() {
    const name = personaNameInput.value.trim();
    const description = personaDescInput.value.trim();

    if (!name) {
      if (window.showToast) window.showToast('Persona Name is required.', 'error');
      return;
    }

    const val = personaListSelect.value;
    const record = {
      id: val === 'new' ? null : val,
      name,
      description
    };

    try {
      const saved = await window.ForgeDB.savePersona(record);
      if (val === 'new') {
        personasList.push(saved);
        activePersonaId = saved.id;
        localStorage.setItem('anansi_active_persona_id', activePersonaId);
      } else {
        personasList = personasList.map(x => x.id === saved.id ? saved : x);
      }

      hydratePersonaDropdowns();
      personaModalOverlay.classList.add('hidden');
      renderChatLog();
      updatePromptInspector();

      if (window.showToast) window.showToast(`Saved persona "${name}"`, 'success');
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to save persona', 'error');
    }
  }

  async function deletePersonaForm() {
    const val = personaListSelect.value;
    if (val === 'new') return;

    if (personasList.length <= 1) {
      if (window.showToast) window.showToast('Cannot delete the last persona.', 'error');
      return;
    }

    const confirmed = confirm('Are you sure you want to delete this user persona?');
    if (!confirmed) return;

    try {
      await window.ForgeDB.deletePersona(val);
      personasList = personasList.filter(x => x.id !== val);
      
      if (activePersonaId === val) {
        activePersonaId = personasList[0].id;
        localStorage.setItem('anansi_active_persona_id', activePersonaId);
      }

      hydratePersonaDropdowns();
      personaModalOverlay.classList.add('hidden');
      renderChatLog();
      updatePromptInspector();

      if (window.showToast) window.showToast('Persona deleted', 'info');
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to delete persona', 'error');
    }
  }

  // --- Playtest Sandbox Controller ---

  async function startPlaytest(projectId) {
    activeProjectId = projectId;
    activeProject = await window.ForgeDB.getProject(projectId);
    if (!activeProject) {
      if (window.showToast) window.showToast('Could not load playtest project.', 'error');
      return;
    }

    // Hydrate personas
    await loadAndSeedPersonas();

    botNameHeader.textContent = `Playtest: ${activeProject.name}`;
    
    // Load history
    chatHistory = await window.ForgeDB.getChatHistory(projectId);
    
    // Clear inspector panels
    reasoningOutput.textContent = 'No reasoning tokens output by model yet.';
    promptOutput.textContent = '';

    // Load project notes
    if (playtestNotes) {
      playtestNotes.value = activeProject.notes || '';
    }
    
    // If history is empty, seed with compiled greeting
    if (chatHistory.length === 0) {
      const compiled = activeProject.compiledCard?.data || {};
      const greeting = compiled.first_mes || `Hello! I am ${activeProject.name}. How can I assist you today?`;
      
      chatHistory.push({
        role: 'model',
        content: greeting
      });
      await window.ForgeDB.saveChatHistory(projectId, chatHistory);
    }

    renderChatLog();
    updatePromptInspector();

    // Show View
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    sandboxView.classList.add('active');
  }

  function renderChatLog() {
    chatLog.innerHTML = '';
    
    chatHistory.forEach((msg, idx) => {
      addMessageBubble(msg.role, msg.content, idx, false);
    });

    chatLog.scrollTop = chatLog.scrollHeight;
  }

  /**
   * Appends a chat bubble to the log.
   */
  function addMessageBubble(role, rawContent, index, animate = true) {
    const bubble = document.createElement('div');
    
    // Reasoning Separation
    const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
    let dialogue = rawContent;
    let reasoningText = '';

    if (thinkRegex.test(rawContent)) {
      const match = rawContent.match(thinkRegex);
      reasoningText = match[1].trim();
      dialogue = rawContent.replace(thinkRegex, '').trim();

      if (role === 'model') {
        reasoningOutput.textContent = reasoningText;
      }
    }

    bubble.className = `chat-bubble ${role === 'user' ? 'user' : 'character'}`;
    
    // Retrieve Persona details
    const activePersona = personasList.find(p => p.id === activePersonaId) || { name: 'User' };
    const nameLabel = role === 'user' ? activePersona.name : (activeProject?.name || 'Bot');

    // Run placeholder replacements on dialogue
    const substitutedDialogue = replaceUserPlaceholders(dialogue, activePersona.name);

    let actionsHtml = '';
    if (role === 'user') {
      actionsHtml = `<button class="bubble-action-btn btn-edit-msg" title="Edit message">✏️ Edit</button>`;
    } else if (role === 'model' && index > 0) {
      actionsHtml = `<button class="bubble-action-btn btn-reroll-msg" title="Re-roll response">🔄 Re-roll</button>`;
    }

    bubble.innerHTML = `
      <div class="chat-bubble-name">${escapeHTML(nameLabel)}</div>
      <div class="chat-bubble-text">${formatMarkdown(substitutedDialogue)}</div>
      ${actionsHtml ? `<div class="chat-bubble-actions">${actionsHtml}</div>` : ''}
    `;

    // Listeners
    if (role === 'user') {
      const editBtn = bubble.querySelector('.btn-edit-msg');
      if (editBtn) {
        editBtn.addEventListener('click', () => editUserMessage(index, bubble));
      }
    } else if (role === 'model' && index > 0) {
      const rerollBtn = bubble.querySelector('.btn-reroll-msg');
      if (rerollBtn) {
        rerollBtn.addEventListener('click', () => rerollResponse(index));
      }
    }

    chatLog.appendChild(bubble);

    if (animate) {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  // --- Chat History Utilities ---

  // Max messages to keep in the sliding window sent to the LLM.
  // Pairs of (user + model) count as 2. First message (greeting) is always preserved.
  const MAX_HISTORY_MESSAGES = 30;

  function trimHistoryToWindow(history) {
    if (history.length <= MAX_HISTORY_MESSAGES) return history;
    // Always keep the very first message (the character greeting / first_mes)
    const first = history[0];
    const rest  = history.slice(1);
    const kept  = rest.slice(rest.length - (MAX_HISTORY_MESSAGES - 1));
    return [first, ...kept];
  }

  async function triggerBotResponse() {
    // Show bot thinking loading bubble
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble character loading-bubble';
    loadingBubble.innerHTML = `
      <div class="chat-bubble-name">${escapeHTML(activeProject?.name || 'Bot')}</div>
      <div class="chat-bubble-text"><span style="color:var(--text-muted);">Thinking...</span></div>
    `;
    chatLog.appendChild(loadingBubble);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Get active persona
    const activePersona = personasList.find(p => p.id === activePersonaId) || { name: 'User', description: '' };

    // Compile Context Prompt
    const compiled = activeProject.compiledCard?.data || {};
    
    // 1. Build Persona description block
    let systemPrompt = `[User Persona Details:\n- Name: ${activePersona.name}\n- Description: ${activePersona.description}]\n\n`;

    // 2. Add compiled card instructions
    if (compiled.system_prompt) systemPrompt += compiled.system_prompt + '\n\n';
    if (compiled.description) systemPrompt += `[Character Description:\n${compiled.description}]\n\n`;
    if (compiled.personality) systemPrompt += `[Character Personality & Rules:\n${compiled.personality}]\n\n`;
    if (compiled.scenario) systemPrompt += `[Scenario Context:\n${compiled.scenario}]\n\n`;
    if (compiled.post_history_instructions) {
      systemPrompt += `\n[System Post-Instructions:\n${compiled.post_history_instructions}]\n`;
    }

    // 3. Replace all user placeholders in systemPrompt and history messages
    systemPrompt = replaceUserPlaceholders(systemPrompt, activePersona.name);

    // 4. Trim history to sliding window before sending to LLM
    const windowedHistory = trimHistoryToWindow(chatHistory);
    const mappedHistory = windowedHistory.map(m => ({
      role: m.role,
      content: replaceUserPlaceholders(m.content, activePersona.name)
    }));

    // Update inspector view
    promptOutput.textContent = `=== SYSTEM CONTEXT ===\n${systemPrompt}\n\n=== MESSAGES HISTORY ===\n` + 
      mappedHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

    try {
      // Call LLM
      const reply = await window.ForgeLLM.generate(systemPrompt, mappedHistory);
      
      loadingBubble.remove();

      chatHistory.push({ role: 'model', content: reply });
      addMessageBubble('model', reply, chatHistory.length - 1);

      await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);
      updatePromptInspector();

    } catch (err) {
      loadingBubble.remove();
      console.error(err);
      
      const errBubble = document.createElement('div');
      errBubble.className = 'chat-bubble character error';
      errBubble.innerHTML = `
        <div class="chat-bubble-name">System Error</div>
        <div style="color:#fca5a5;">Failed to generate response: "${err.message}". Verify your API configuration.</div>
      `;
      chatLog.appendChild(errBubble);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  async function handleUserSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    
    // Add user message to log and history
    chatHistory.push({ role: 'user', content: text });
    addMessageBubble('user', text, chatHistory.length - 1);
    
    await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);

    await triggerBotResponse();
  }

  async function rerollResponse(index) {
    if (index === undefined || index < 1) return;

    // Slice to remove the response we want to re-roll and any subsequent messages
    chatHistory = chatHistory.slice(0, index);
    
    await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);
    renderChatLog();
    
    await triggerBotResponse();
  }

  function editUserMessage(index, bubbleElement) {
    const textContainer = bubbleElement.querySelector('.chat-bubble-text');
    const actionsContainer = bubbleElement.querySelector('.chat-bubble-actions');
    const originalText = chatHistory[index].content;
    
    textContainer.style.display = 'none';
    if (actionsContainer) actionsContainer.style.display = 'none';
    
    const editForm = document.createElement('div');
    editForm.className = 'bubble-edit-form';
    editForm.style.marginTop = '6px';
    editForm.innerHTML = `
      <textarea class="edit-msg-textarea" style="width:100%; min-height:85px; font-family:inherit; font-size:0.9rem; padding:8px; border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.25); background-color:rgba(0,0,0,0.2); color:white; outline:none; resize:vertical;">${escapeHTML(originalText)}</textarea>
      <div style="display:flex; gap:6px; margin-top:6px; justify-content:flex-end;">
        <button class="btn btn-secondary btn-sm btn-cancel-edit" style="padding:4px 8px; font-size:0.75rem; background:rgba(255,255,255,0.1); border:none; color:white; cursor:pointer;">Cancel</button>
        <button class="btn btn-primary btn-sm btn-save-edit" style="padding:4px 8px; font-size:0.75rem; background:white; color:var(--accent); border:none; cursor:pointer;">Save</button>
      </div>
    `;
    
    bubbleElement.appendChild(editForm);
    
    const textarea = editForm.querySelector('.edit-msg-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    editForm.querySelector('.btn-cancel-edit').addEventListener('click', () => {
      editForm.remove();
      textContainer.style.display = 'block';
      if (actionsContainer) actionsContainer.style.display = 'flex';
    });
    
    editForm.querySelector('.btn-save-edit').addEventListener('click', async () => {
      const updatedText = textarea.value.trim();
      if (!updatedText) return;
      
      // Update text in history
      chatHistory[index].content = updatedText;
      
      // Slice history to remove all subsequent messages
      chatHistory = chatHistory.slice(0, index + 1);
      
      await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);
      renderChatLog();
      
      await triggerBotResponse();
    });
  }

  function exportChatLog() {
    if (chatHistory.length === 0) {
      if (window.showToast) window.showToast('No chat history to export.', 'info');
      return;
    }
    
    const charName = (activeProject && (activeProject.name || activeProject.compiledCard?.data?.name)) || 'Character';
    const activePersona = personasList.find(p => p.id === activePersonaId) || { name: 'User' };
    
    const transcript = chatHistory.map(msg => {
      const sender = msg.role === 'user' ? activePersona.name : charName;
      return `${sender}: ${msg.content}\n`;
    }).join('\n');

    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_chat.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (window.showToast) window.showToast('Chat history exported!', 'success');
  }

  function updatePromptInspector() {
    if (!activeProject) return;
    const activePersona = personasList.find(p => p.id === activePersonaId) || { name: 'User', description: '' };
    const compiled = activeProject.compiledCard?.data || {};
    
    let systemPrompt = `[User Persona Details:\n- Name: ${activePersona.name}\n- Description: ${activePersona.description}]\n\n`;
    if (compiled.system_prompt) systemPrompt += compiled.system_prompt + '\n\n';
    if (compiled.description) systemPrompt += `[Character Description:\n${compiled.description}]\n\n`;
    if (compiled.personality) systemPrompt += `[Character Personality & Rules:\n${compiled.personality}]\n\n`;
    if (compiled.scenario) systemPrompt += `[Scenario Context:\n${compiled.scenario}]\n\n`;
    if (compiled.post_history_instructions) {
      systemPrompt += `\n[System Post-Instructions:\n${compiled.post_history_instructions}]\n`;
    }

    systemPrompt = replaceUserPlaceholders(systemPrompt, activePersona.name);
    
    const mappedHistory = chatHistory.map(m => ({
      role: m.role,
      content: replaceUserPlaceholders(m.content, activePersona.name)
    }));

    promptOutput.textContent = `=== SYSTEM CONTEXT ===\n${systemPrompt}\n\n=== MESSAGES HISTORY ===\n` + 
      mappedHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  }

  async function resetChat() {
    if (!activeProjectId) return;
    const confirmed = confirm('Are you sure you want to reset this chat session?');
    if (!confirmed) return;

    await window.ForgeDB.clearChatHistory(activeProjectId);
    chatHistory = [];
    
    const compiled = activeProject.compiledCard?.data || {};
    const greeting = compiled.first_mes || `Hello! I am ${activeProject.name}. How can I assist you today?`;
    
    chatHistory.push({
      role: 'model',
      content: greeting
    });
    await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);

    renderChatLog();
    reasoningOutput.textContent = 'No reasoning tokens output by model yet.';
    updatePromptInspector();
    
    if (window.showToast) window.showToast('Chat history reset', 'info');
  }

  function toggleInspector() {
    inspectorPanel.classList.toggle('collapsed');
  }

  // Helper to replace standard User and Char placeholders
  function replaceUserPlaceholders(text, personaName) {
    if (!text) return '';
    const charName = (activeProject && (activeProject.name || activeProject.compiledCard?.data?.name)) || 'Character';
    return text
      .replace(/\{\{user\}\}/gi, personaName)
      .replace(/\{user\}/gi, personaName)
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{char\}/gi, charName);
  }

  function formatMarkdown(str) {
    if (!str) return '';
    let text = escapeHTML(str);
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Expose
  window.SandboxPlaytest = {
    init: initSandbox,
    start: startPlaytest
  };
})();
