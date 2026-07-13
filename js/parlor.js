/**
 * parlor.js - The Interactive AI Forge guided creative assistant.
 */

(() => {
  // System Prompts per Category based on Design Philosophy
  const CATEGORY_GUIDANCE = {
    character: `When developing characters, move beyond lists of adjectives or physical descriptions.
Discover their core motivations, fears, emotional wounds, defense mechanisms, contradictions, growth potential, and behavioral patterns.
Encourage the creator to think about: Why does this character behave this way? What emotional need drives them? What makes them interesting in scenes?

FORMAT REQUIREMENT:
You MUST compile the "draft.content" string using the following exact markdown headers (empty sections can be omitted):
## Overview
(A summary or introductory paragraph)

## Personality
(Details of core motivations, traits, behavior)

## Background
(Backstory and history)

## Appearance
(Physical description)

## Abilities
(Powers, equipment, and special skills)

## Strengths
(Bullet list of strengths)

## Weaknesses
(Bullet list of weaknesses)

## Likes
(Bullet list of likes)

## Dislikes
(Bullet list of dislikes)

## Notes
(Any relationships, special rules, or scenario instructions)`,
    
    bio: `Focus on the character's physical appearance, history, and background details. 
Keep details narrative-focused and sensory. Help structure their past events so they explain their current state without becoming an exhaustive encyclopedia.`,
    
    initial_message: `Help design the greeting / initial message. 
It should establish immediate scene hook, sensory context, character voice, and invite user interaction. Avoid long narrative setups that give the user nothing to reply to.`,
    
    setting: `Focus on assumptions, atmosphere, and constraints rather than encyclopedic details.
Identify: What makes the setting unique? What does everyone in the world already know? What rules shape everyday life? What themes emerge? What conflicts drive stories?`,
    
    organization: `Focus on organizations as living entities.
Explore: Purpose, leadership, culture, internal conflicts, public reputation, resources, and relationships with other factions. Ensure they actively influence stories.`,
    
    rules: `Scenario Rules define the framework of tone, genre, AI expectations, narrative constraints, and canon flexibility.
Avoid describing individual characters or setting histories here. Focus purely on prompts, rules, formatting directives, or system instructions.`,
    
    lore: `Focus on species, locations, historical events, or world terminology.
Ensure it is structured clearly, emphasizing how it interacts with characters and narrative themes in active play.`
  };

  // State Variables
  let assetCategory = 'character';
  let chatHistory = [];
  let currentDraft = { name: '', content: '' };
  let isGenerating = false;

  // DOM Elements
  const parlorView = document.getElementById('parlor-view');
  const chatLog = document.getElementById('parlor-chat-log');
  const optionsContainer = document.getElementById('parlor-options-container');
  const inputContainer = document.getElementById('parlor-input-container');
  const textInput = document.getElementById('parlor-input');
  const btnSend = document.getElementById('btn-parlor-send');

  // Preview elements
  const outputName = document.getElementById('forge-output-name');
  const outputCategory = document.getElementById('forge-output-category');
  const outputCluster = document.getElementById('forge-output-cluster');
  const outputContent = document.getElementById('forge-output-content');
  const btnSaveAll = document.getElementById('btn-parlor-save-all');

  // Audit elements
  const auditPanel = document.getElementById('forge-audit-panel');
  const auditInconsistencies = document.getElementById('forge-audit-inconsistencies');
  const auditInconsistenciesText = document.getElementById('forge-audit-inconsistencies-text');
  const auditSuggestions = document.getElementById('forge-audit-suggestions');
  const auditSuggestionsList = document.getElementById('forge-audit-suggestions-list');

  function initParlor() {
    btnSend.addEventListener('click', handleUserTextSubmit);
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserTextSubmit();
      }
    });
    btnSaveAll.addEventListener('click', saveAssetToVault);
  }

  function startParlorWizard() {
    chatHistory = [];
    currentDraft = { name: '', content: '' };
    isGenerating = false;
    
    // Clear preview inputs
    outputName.value = '';
    outputCategory.value = 'character';
    outputCluster.value = '';
    outputContent.value = '';
    btnSaveAll.disabled = true;

    // Hide audit panel
    auditPanel.style.display = 'none';
    auditInconsistencies.style.display = 'none';
    auditSuggestions.style.display = 'none';

    // Show Forge screen
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    parlorView.classList.add('active');

    // Show initial Setup Form
    renderSetupForm();
  }

  function renderSetupForm() {
    chatLog.innerHTML = '';
    optionsContainer.innerHTML = '';
    inputContainer.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'forge-setup-card';
    card.innerHTML = `
      <h3>Forge a New Asset</h3>
      <div class="form-group">
        <label for="setup-category">What asset type shall we spin?</label>
        <select id="setup-category">
          <option value="character">🎭 Character (Personality / traits)</option>
          <option value="bio">📝 Character Bio (Appearance / Background)</option>
          <option value="initial_message">💬 Initial Message (Greeting hook)</option>
          <option value="setting">🌍 Setting (Location / Worldbuilding)</option>
          <option value="organization">🤝 Organization (Faction / Group)</option>
          <option value="rules">📜 Scenario Rules (Directives / Guidelines)</option>
          <option value="lore">📚 Lore Entry (Species / History / Trivia)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="setup-seed">Whisper your seed concept (Optional)</label>
        <textarea id="setup-seed" placeholder="e.g., A cyborg detective who regrets her cybernetics, or a corporate black-market smuggling group..."></textarea>
      </div>
      <button id="btn-forge-start" class="btn btn-accent btn-block">🕸️ Wake the Forge</button>
    `;

    chatLog.appendChild(card);

    card.querySelector('#btn-forge-start').addEventListener('click', () => {
      const category = card.querySelector('#setup-category').value;
      const seed = card.querySelector('#setup-seed').value.trim();
      startForgeSession(category, seed);
    });
  }

  function startForgeSession(category, seed) {
    assetCategory = category;
    outputCategory.value = category;
    
    // Clear chat log and show user seed
    chatLog.innerHTML = '';
    inputContainer.style.display = 'flex';
    textInput.placeholder = 'Discuss the design with the Forge...';
    textInput.focus();

    if (seed) {
      addUserBubble(`Seed Concept: "${seed}"`);
      chatHistory.push({ role: 'user', content: `Seed Concept: ${seed}` });
      executeForgeTurn();
    } else {
      executeForgeTurn("Hello. I am the Interactive AI Forge. What kind of concept or seed idea do you have in mind for this new asset?");
    }
  }

  function parseForgeResponse(responseText) {
    let cleanText = responseText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }

    // Try normal JSON parse first
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Try parsing just the brace block
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const candidate = cleanText.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch (e2) {
          // If candidate parse fails, try to escape literal newlines inside strings in the candidate
          try {
            const repaired = candidate.replace(/"([^"\\]|\\.)*"/g, (match) => {
              return match.replace(/\r?\n/g, '\\n');
            });
            return JSON.parse(repaired);
          } catch (e3) {
            // Repair failed, fall through to regex extraction
          }
        }
      }
    }

    // Regex extraction fallback
    console.warn("AI Forge: standard JSON parsing failed. Using regex extraction fallback.", responseText);

    const unescapeStr = (str) => {
      if (!str) return '';
      return str
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    };

    // Extract question
    const qMatch = cleanText.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    const question = qMatch ? unescapeStr(qMatch[1]) : "I've compiled the draft so far. What would you like to refine next?";

    // Extract draft name
    const nameMatch = cleanText.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    const name = nameMatch ? unescapeStr(nameMatch[1]) : "";

    // Extract draft content
    const contentMatch = cleanText.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    const content = contentMatch ? unescapeStr(contentMatch[1]) : "";

    // Extract inconsistencies
    const incMatch = cleanText.match(/"inconsistencies"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    const inconsistencies = incMatch ? unescapeStr(incMatch[1]) : "";

    // Extract suggestions
    const suggestions = [];
    const sugBlockMatch = cleanText.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/i);
    if (sugBlockMatch) {
      const itemsRaw = sugBlockMatch[1];
      const itemRegex = /"((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = itemRegex.exec(itemsRaw)) !== null) {
        suggestions.push(unescapeStr(m[1]));
      }
    }

    // Extract readyToSave
    const rtsMatch = cleanText.match(/"readyToSave"\s*:\s*(true|false)/i);
    const readyToSave = rtsMatch ? rtsMatch[1].toLowerCase() === 'true' : false;

    return {
      thought: "Regex parse fallback.",
      question,
      suggestions,
      inconsistencies,
      draft: { name, content },
      readyToSave
    };
  }

  async function executeForgeTurn(preMessage = null) {
    if (isGenerating) return;
    isGenerating = true;

    // Show spinner in chat
    const spinner = document.createElement('div');
    spinner.className = 'parlor-chat-bubble bot spinner-bubble';
    spinner.innerHTML = `<strong>Forge:</strong> <span class="spinner-web">🕸️ Weaving thoughts...</span>`;
    chatLog.appendChild(spinner);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Build LLM System Prompt
    const systemPrompt = `You are the Interactive AI Forge, Anansi Forge's guided creative assistant.
Your purpose is to help creators develop structured, reusable creative assets through conversation.
You act as an experienced editor and creative architect. You must never make major creative decisions without user approval. Suggestions remain suggestions.

Primary Instructions:
1. Guide creators through building a complete asset of category: "${assetCategory}".
2. Category-Specific Guidance:
${CATEGORY_GUIDANCE[assetCategory] || ''}
3. INTERVIEW STYLE: Ask exactly ONE meaningful, focused question at a time. Avoid long questionnaires. Let the asset build organically from previous answers.
4. AUDIT: Identify any vague concepts, contradictions, or weaknesses. List them in your response.
5. FORMAT: You MUST respond ONLY with a valid JSON block structured exactly as follows:
{
  "thought": "Internal critical analysis about what details are missing, weak, or conflicting...",
  "question": "The next focused question to ask the creator.",
  "suggestions": ["Optional bullet point suggestions or expansions for the draft"],
  "inconsistencies": "Optional alert describing any logical conflict or weakness identified",
  "draft": {
    "name": "The proposed asset name",
    "content": "The compiled, structured, markdown content for the asset developed so far."
  },
  "readyToSave": false
}

Always keep the "draft" object up-to-date. Ensure "draft.content" is detailed and well-formatted markdown. Do not include markdown codeblock tags (\`\`\`json) in your raw output.`;

    try {
      let responseText = "";
      
      if (preMessage) {
        // Mock prompt generation if starting fresh without seed
        responseText = JSON.stringify({
          thought: "Starting conversation.",
          question: preMessage,
          suggestions: [],
          draft: { name: "", content: "" },
          readyToSave: false
        });
      } else {
        responseText = await window.ForgeLLM.generate(systemPrompt, chatHistory);
      }

      // Remove spinner
      spinner.remove();

      // Parse JSON from response using robust extraction pipeline
      let parsed = parseForgeResponse(responseText);

      // Add bot bubble
      addBotBubble(parsed.question);
      chatHistory.push({ role: 'model', content: responseText });

      // Update draft preview
      if (parsed.draft) {
        currentDraft = parsed.draft;
        outputName.value = parsed.draft.name || '';
        outputContent.value = parsed.draft.content || '';
        btnSaveAll.disabled = false;
      }

      // Render Audits (suggestions / contradictions)
      renderAuditPanel(parsed.inconsistencies, parsed.suggestions);

    } catch (err) {
      console.error('Forge Turn failed:', err);
      spinner.remove();
      addBotBubble(`The Forge encountered a processing error: "${err.message}". This usually happens if the model output is malformed or cut off. Try sending your last message again.`);
    } finally {
      isGenerating = false;
    }
  }

  function renderAuditPanel(inconsistencies, suggestions) {
    let hasAlert = false;
    let hasTips = false;

    if (inconsistencies && typeof inconsistencies === 'string' && inconsistencies.trim()) {
      auditInconsistenciesText.textContent = inconsistencies;
      auditInconsistencies.style.display = 'block';
      hasAlert = true;
    } else {
      auditInconsistencies.style.display = 'none';
    }

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      auditSuggestionsList.innerHTML = '';
      suggestions.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        auditSuggestionsList.appendChild(li);
      });
      auditSuggestions.style.display = 'block';
      hasTips = true;
    } else {
      auditSuggestions.style.display = 'none';
    }

    if (hasAlert || hasTips) {
      auditPanel.style.display = 'flex';
    } else {
      auditPanel.style.display = 'none';
    }
  }

  function handleUserTextSubmit() {
    const text = textInput.value.trim();
    if (!text || isGenerating) return;

    addUserBubble(text);
    chatHistory.push({ role: 'user', content: text });
    textInput.value = '';

    executeForgeTurn();
  }

  function addBotBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'parlor-chat-bubble bot';
    bubble.innerHTML = `<strong>Forge:</strong> ${escapeHTML(text)}`;
    chatLog.appendChild(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'parlor-chat-bubble user';
    bubble.textContent = text;
    chatLog.appendChild(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function saveAssetToVault() {
    const name = outputName.value.trim();
    const content = outputContent.value.trim();
    const category = outputCategory.value;
    const cluster = outputCluster.value.trim();

    if (!name || !content) {
      if (window.showToast) window.showToast('Asset Name and Content cannot be empty.', 'error');
      return;
    }

    const component = {
      name,
      category,
      cluster,
      content,
      tags: ['forge', category]
    };

    try {
      await window.ForgeDB.saveComponent(component);
      if (window.showToast) {
        window.showToast(`Saved "${name}" to Vault successfully!`, 'success');
      }

      // Exit back to library
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('welcome-view').classList.add('active');

      if (window.refreshVaultList) {
        window.refreshVaultList();
      }
    } catch (err) {
      console.error('Failed to save Forge asset:', err);
      if (window.showToast) window.showToast('Failed to save asset.', 'error');
    }
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

  // Expose Globally
  window.ParlorWizard = {
    init: initParlor,
    start: startParlorWizard
  };
})();
