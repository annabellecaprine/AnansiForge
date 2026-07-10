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
    
    chatHistory.forEach(msg => {
      addMessageBubble(msg.role, msg.content, false);
    });

    chatLog.scrollTop = chatLog.scrollHeight;
  }

  /**
   * Appends a chat bubble to the log.
   */
  function addMessageBubble(role, rawContent, animate = true) {
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

    bubble.innerHTML = `
      <div class="chat-bubble-name">${escapeHTML(nameLabel)}</div>
      <div class="chat-bubble-text">${formatMarkdown(substitutedDialogue)}</div>
    `;

    chatLog.appendChild(bubble);

    if (animate) {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  async function handleUserSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    
    // Add user message to log and history
    chatHistory.push({ role: 'user', content: text });
    addMessageBubble('user', text);
    
    await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);

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

    const mappedHistory = chatHistory.map(m => ({
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
      addMessageBubble('model', reply);

      await window.ForgeDB.saveChatHistory(activeProjectId, chatHistory);
      
      // Update prompt output with updated history
      const substitutedReply = replaceUserPlaceholders(reply, activePersona.name);
      promptOutput.textContent += `\nAssistant: ${substitutedReply}`;
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

  // Helper to replace standard User placeholders with the active persona name
  function replaceUserPlaceholders(text, personaName) {
    if (!text) return '';
    return text
      .replace(/\{\{user\}\}/g, personaName)
      .replace(/\{\{User\}\}/g, personaName)
      .replace(/\{user\}/g, personaName)
      .replace(/\{User\}/g, personaName);
  }

  function formatMarkdown(str) {
    if (!str) return '';
    let text = escapeHTML(str);
    text = text.replace(/\*([^*]+)\*/g, '<em style="color:var(--text-secondary); opacity:0.85;">$1</em>');
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
