/**
 * breakout.js - Wizard to break out legacy monolithic character cards into modular components.
 * 
 * Supports parsing standard card fields and dynamically detecting individual W++ / Pseudo-JSON / 
 * Bracketed / HTML / Markdown character blocks to break out multi-character bots.
 */

(() => {
  let activeCard = null;
  let activeFilename = '';
  let activeFields = [];
  let currentSelectionIdx = -1;
  let savedCount = 0;

  // DOM elements
  const breakoutView = document.getElementById('breakout-view');
  const breakoutFilename = document.getElementById('breakout-filename');
  const fieldsListContainer = document.getElementById('breakout-fields-list');
  const btnSaveCurrent = document.getElementById('btn-breakout-save-current');
  const statusText = document.getElementById('breakout-status-text');
  const btnFinish = document.getElementById('btn-breakout-finish');
  
  // Preview Form
  const previewNameInput = document.getElementById('breakout-comp-name');
  const previewCategorySelect = document.getElementById('breakout-comp-category');
  const previewLineageInput = document.getElementById('breakout-comp-lineage');
  const previewContentPre = document.getElementById('breakout-comp-content-preview');

  // --- HTML Stripping Utility (for JanitorAI / HTML-formatted cards) ---

  function stripHTML(htmlString) {
    if (typeof htmlString !== 'string' || !htmlString) return '';
    let text = htmlString;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n\n');
    text = text.replace(/<p\b[^>]*>/gi, '\n');
    text = text.replace(/<div\b[^>]*>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<h[1-6]\b[^>]*>/gi, '\n');
    text = text.replace(/<\/[uo]l>/gi, '\n');
    text = text.replace(/<[uo]l\b[^>]*>/gi, '\n');
    text = text.replace(/<li\b[^>]*>/gi, '\n- ');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<blockquote\b[^>]*>/gi, '\n');
    text = text.replace(/<\/blockquote>/gi, '\n');
    text = text.replace(/<[^>]*>/g, '');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&ndash;/gi, '–');
    text = text.replace(/&mdash;/gi, '—');
    text = text.replace(/&hellip;/gi, '…');
    text = text.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    // Clean up whitespace
    text = text.replace(/[^\S\n]+/g, ' ');
    text = text.replace(/ +$/gm, '');
    text = text.replace(/^ +/gm, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  function hasHTMLTags(text) {
    return /<[a-zA-Z][^>]*>/.test(text);
  }

  // --- Character Block Detection Heuristics ---

  function cleanName(nameStr) {
    if (!nameStr) return 'Unknown Character';
    let cleaned = nameStr.replace(/[*_`#]/g, '');
    cleaned = cleaned.replace(/["']/g, '');
    const parts = cleaned.split(/[\/|+]|(?:\s+or\s+)/i);
    let primary = parts[0].trim();
    primary = primary.replace(/^[\s\-•*+]+/, '');
    return primary.trim() || 'Unknown Character';
  }

  function detectW22(text) {
    const blocks = [];
    const blockRegex = /\[\s*character\(([^)]+)\)\s*\{([\s\S]*?)\}\s*\]/gi;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const nameSpec = match[1];
      const bodyText = match[2];
      
      let name = '';
      const quoteRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let qm = quoteRegex.exec(nameSpec);
      if (qm) {
        name = qm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      } else {
        const nameFieldMatch = bodyText.match(/Name\("([^"\\]*(?:\\.[^"\\]*)*)"\)/i);
        if (nameFieldMatch) {
          name = nameFieldMatch[1].replace(/\\"/g, '"');
        } else {
          name = nameSpec.replace(/["'+]/g, '');
        }
      }
      
      blocks.push({
        name: cleanName(name),
        blockText: fullMatch
      });
    }
    return blocks;
  }

  function detectPseudoJSON(text) {
    const blocks = [];
    const bracketRegex = /\[\s*\{\s*Name\s*:\s*\(([^)]+)\)([\s\S]*?)\}\s*\]/gi;
    let match;
    while ((match = bracketRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const nameSpec = match[1];
      let name = nameSpec.split(',')[0].replace(/["']/g, '').trim();
      
      blocks.push({
        name: cleanName(name),
        blockText: fullMatch
      });
    }
    return blocks;
  }

  function detectRoleDivides(text) {
    const blocks = [];
    const lines = text.split('\n');
    const roleIndices = [];
    const roleRegex = /^\s*(?:Family\s+)?Role\s*[:=]\s*(.+)$/i;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (roleRegex.test(line)) {
        const nameLine = lines[i-1].trim();
        if (nameLine && nameLine.length < 50 && !nameLine.includes(':')) {
          roleIndices.push({
            roleLineIndex: i,
            name: nameLine
          });
        }
      }
    }
    
    if (roleIndices.length === 0) return [];
    
    let currentPos = 0;
    const linePositions = lines.map(line => {
      const start = currentPos;
      currentPos += line.length + 1;
      return start;
    });
    
    for (let i = 0; i < roleIndices.length; i++) {
      const curr = roleIndices[i];
      const next = roleIndices[i + 1];
      const startIndex = linePositions[curr.roleLineIndex - 1];
      const endIndex = next ? linePositions[next.roleLineIndex - 1] : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();
      
      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  function detectBracketedNames(text) {
    const blocks = [];
    // Matches names inside brackets alone on a line: e.g. [Hudson Cromwell]
    const bracketRegex = /(?:\n|^)\s*\[([^\]\n]+)\]\s*(?:\n|$)/gi;
    const matches = [];
    let match;
    while ((match = bracketRegex.exec(text)) !== null) {
      const nameVal = match[1].trim();
      const nameLower = nameVal.toLowerCase();
      const excludeWords = ['char', 'user', 'system', 'instructions', 'rules', 'setting', 'scenario', 'cast', 'registry', 'profile', 'overview', 'info', 'metadata'];
      const isGeneric = excludeWords.some(g => nameLower.includes(g));
      
      if (!isGeneric && nameVal.length > 1 && nameVal.length < 50) {
        matches.push({
          name: nameVal,
          matchIndex: match.index
        });
      }
    }
    
    if (matches.length === 0) return [];
    
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const startIndex = curr.matchIndex;
      const endIndex = next ? next.matchIndex : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();
      
      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  function detectHtmlHeaders(text) {
    const blocks = [];
    // Matches HTML tags like <h3>Hudson Cromwell (62)</h3>
    const headerRegex = /<h([1-6])(?:\s+[^>]*)?>([^<]+)<\/h\1>/gi;
    const matches = [];
    let match;
    while ((match = headerRegex.exec(text)) !== null) {
      const nameVal = match[2].trim();
      const nameLower = nameVal.toLowerCase();
      const cleanNameStr = nameVal.replace(/\(\d+\)/g, '').replace(/\b\d+\b/g, '').trim();
      const excludeWords = ['meet', 'about', 'rules', 'select', 'welcome', 'world', 'intro', 'family', 'cast', 'registry', 'profile', 'information', 'instructions', 'first message', 'details', 'metadata'];
      const isGeneric = ['setting', 'scenario', 'notes', 'instructions', 'rules', 'appearance', 
        'personality', 'relationships', 'overview', 'info', 'summary', 
        'background', 'biography', 'history', 'traits', 'likes', 'dislikes', 
        'dialogue', 'example', 'greeting', 'prompt', 'world', 'lore', 'credits', 
        'author', 'user', 'about'].some(g => nameLower.includes(g)) || excludeWords.some(w => nameLower.includes(w));
        
      if (!isGeneric && cleanNameStr.length > 1 && cleanNameStr.length < 50) {
        matches.push({
          name: cleanNameStr,
          matchIndex: match.index
        });
      }
    }
    
    if (matches.length === 0) return [];
    
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const startIndex = curr.matchIndex;
      const endIndex = next ? next.matchIndex : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();
      
      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  function detectMarkdownHeaders(text) {
    const blocks = [];
    const lines = text.split('\n');
    const headingIndices = [];
    const headingRegex = /^\s*(#{2,4})\s+(.+)$/;
    
    const excludeWords = ['meet', 'about', 'rules', 'select', 'welcome', 'world', 'intro', 'family', 'cast', 'registry', 'profile', 'information', 'instructions', 'first message', 'details', 'metadata'];
    const genericTerms = [
      'setting', 'scenario', 'notes', 'instructions', 'rules', 'appearance', 
      'personality', 'relationships', 'overview', 'info', 'summary', 
      'background', 'biography', 'history', 'traits', 'likes', 'dislikes', 
      'dialogue', 'example', 'greeting', 'prompt', 'world', 'lore', 'credits', 
      'author', 'instructions', 'first message', 'details', 'metadata'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(headingRegex);
      if (m) {
        const headingText = m[2].trim().toLowerCase();
        const isGeneric = genericTerms.some(g => headingText.includes(g)) || excludeWords.some(w => headingText.includes(w));
        if (!isGeneric && m[2].length < 60) {
          headingIndices.push({
            index: i,
            name: m[2].trim()
          });
        }
      }
    }
    
    if (headingIndices.length === 0) return [];
    
    let currentPos = 0;
    const linePositions = lines.map(line => {
      const start = currentPos;
      currentPos += line.length + 1;
      return start;
    });
    
    for (let i = 0; i < headingIndices.length; i++) {
      const curr = headingIndices[i];
      const next = headingIndices[i + 1];
      const startIndex = linePositions[curr.index];
      const endIndex = next ? linePositions[next.index] : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();
      
      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  function detectNameFields(text) {
    const blocks = [];
    const nameRegex = /(?:\n|^)\s*(?:\*\*)?(?:Character\s+)?(?:Name|NAME)(?:\*\*)?\s*[:=-]\s*([^\n]+)/gi;
    const matches = [];
    let match;
    while ((match = nameRegex.exec(text)) !== null) {
      const nameVal = match[1].replace(/[*_`#]/g, '').trim();
      const nameLower = nameVal.toLowerCase();
      const isGeneric = ['{{char}}', '{{user}}', 'character', 'unknown', 'your name'].some(g => nameLower.includes(g));
      if (!isGeneric && nameVal.length < 60) {
        matches.push({
          name: nameVal,
          matchIndex: match.index
        });
      }
    }
    
    if (matches.length === 0) return [];
    
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const startIndex = curr.matchIndex;
      const endIndex = next ? next.matchIndex : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();
      
      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  /**
   * Detect the ## Character Name / **Bold Name** pattern.
   * Used in cards where each character block starts with a repeating heading like
   * "## Character Name" followed by the actual name in bold on the next line.
   */
  function detectCharacterNameBold(text) {
    const blocks = [];
    const lines = text.split('\n');
    const characterStarts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match a heading like "## Character Name" (case-insensitive)
      if (/^#{1,4}\s+Character\s+Name$/i.test(line)) {
        // Scan forward for the bold name on the next non-empty line
        let actualName = '';
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (!nextLine || nextLine === '---') continue;
          const boldMatch = nextLine.match(/^\*\*([^*]+)\*\*$/);
          if (boldMatch) {
            actualName = boldMatch[1].trim();
          }
          break;
        }
        if (actualName) {
          characterStarts.push({ lineIndex: i, name: actualName });
        }
      }
    }

    if (characterStarts.length < 2) return [];

    // Build block text ranges
    let currentPos = 0;
    const linePositions = lines.map(line => {
      const start = currentPos;
      currentPos += line.length + 1;
      return start;
    });

    for (let i = 0; i < characterStarts.length; i++) {
      const curr = characterStarts[i];
      const next = characterStarts[i + 1];
      const startIndex = linePositions[curr.lineIndex];
      const endIndex = next ? linePositions[next.lineIndex] : text.length;
      const blockText = text.substring(startIndex, endIndex).trim();

      blocks.push({
        name: cleanName(curr.name),
        blockText: blockText
      });
    }
    return blocks;
  }

  function detectCharacterBlocks(text) {
    if (!text || typeof text !== 'string') return [];
    
    let blocks = detectW22(text);
    if (blocks.length > 0) return blocks;

    blocks = detectPseudoJSON(text);
    if (blocks.length > 0) return blocks;

    blocks = detectRoleDivides(text);
    if (blocks.length > 0) return blocks;

    blocks = detectBracketedNames(text);
    if (blocks.length > 0) return blocks;

    blocks = detectHtmlHeaders(text);
    if (blocks.length > 0) return blocks;

    // Try Character Name + Bold Name pattern BEFORE general markdown headers
    blocks = detectCharacterNameBold(text);
    if (blocks.length > 0) return blocks;

    blocks = detectMarkdownHeaders(text);
    if (blocks.length > 0) return blocks;

    blocks = detectNameFields(text);
    if (blocks.length > 0) return blocks;

    return [];
  }

  // --- Breakout Logic ---

  function initBreakout() {
    btnSaveCurrent.addEventListener('click', saveCurrentSelection);
    btnFinish.addEventListener('click', finishBreakout);
  }

  function startBreakoutWizard(cardData, filename, fileBlob = null) {
    activeCard = cardData.data || cardData;
    activeFilename = filename;
    savedCount = 0;
    activeFields = [];
    
    const charName = activeCard.name || 'Unnamed';

    // If a cover image file is present, extract it as a data URL and save it
    if (fileBlob instanceof Blob) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          await window.ForgeDB.saveCover(charName, e.target.result);
          console.log(`Saved original card cover artwork for lineage: "${charName}"`);
        } catch (err) {
          console.error('Failed to save cover artwork:', err);
        }
      };
      reader.readAsDataURL(fileBlob);
    }

    // Strip HTML from all card fields if they contain HTML tags (JanitorAI-style cards)
    const fieldsToClean = ['description', 'personality', 'scenario', 'first_mes', 'system_prompt', 'post_history_instructions', 'mes_example'];
    fieldsToClean.forEach(key => {
      if (activeCard[key] && typeof activeCard[key] === 'string' && hasHTMLTags(activeCard[key])) {
        activeCard[key] = stripHTML(activeCard[key]);
      }
    });
    if (activeCard.alternate_greetings && Array.isArray(activeCard.alternate_greetings)) {
      activeCard.alternate_greetings = activeCard.alternate_greetings.map(g =>
        (typeof g === 'string' && hasHTMLTags(g)) ? stripHTML(g) : g
      );
    }

    // Scan for multiple character blocks in Personality & Description fields
    const personalityText = activeCard.personality || '';
    const descriptionText = activeCard.description || '';
    const detectedBlocks = [
      ...detectCharacterBlocks(personalityText),
      ...detectCharacterBlocks(descriptionText)
    ];

    // Deduplicate detected blocks by clean name (keeping first/longer block details)
    const uniqueBlocks = [];
    const seenNames = new Set();
    detectedBlocks.forEach(block => {
      const normName = block.name.toLowerCase().trim();
      if (!seenNames.has(normName)) {
        seenNames.add(normName);
        uniqueBlocks.push(block);
      }
    });

    // If multiple character blocks are found across the fields, insert them as primary split candidates!
    if (uniqueBlocks.length >= 2) {
      uniqueBlocks.forEach((block, index) => {
        activeFields.push({
          key: `extracted_char_${index}`,
          label: `Character: ${block.name} (Extracted)`,
          defaultCat: 'character',
          content: block.blockText,
          saved: false,
          customName: block.name
        });
      });
    }

    // Standard card fields mapping
    const mappings = [
      { key: 'description', label: 'Character Bio', defaultCat: 'bio' },
      { key: 'personality', label: 'Full Personality Traits', defaultCat: 'character' },
      { key: 'scenario', label: 'Scenario Context', defaultCat: 'setting' },
      { key: 'first_mes', label: 'Initial Message', defaultCat: 'initial_message' },
      { key: 'system_prompt', label: 'System Instructions', defaultCat: 'rules' },
      { key: 'post_history_instructions', label: 'Post-History Prompt', defaultCat: 'rules' },
      { key: 'mes_example', label: 'Example Dialogues', defaultCat: 'character' }
    ];

    mappings.forEach(map => {
      const content = activeCard[map.key];
      if (content && typeof content === 'string' && content.trim().length > 0) {
        activeFields.push({
          key: map.key,
          label: map.label,
          defaultCat: map.defaultCat,
          content: content.trim(),
          saved: false
        });
      }
    });

    // Support alternate greetings extraction
    if (activeCard.alternate_greetings && Array.isArray(activeCard.alternate_greetings)) {
      activeCard.alternate_greetings.forEach((greet, idx) => {
        if (greet && typeof greet === 'string' && greet.trim().length > 0) {
          activeFields.push({
            key: `alternate_greeting_${idx}`,
            label: `Alternate Greeting ${idx + 1}`,
            defaultCat: 'rules',
            content: greet.trim(),
            saved: false
          });
        }
      });
    }

    if (activeFields.length === 0) {
      if (window.showToast) window.showToast('No extractable text fields found in this card.', 'error');
      return;
    }

    breakoutFilename.textContent = filename;
    renderFieldsList();
    selectField(0);
    updateStatus();

    // Show Breakout View
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    breakoutView.classList.add('active');
  }

  function renderFieldsList() {
    fieldsListContainer.innerHTML = '';
    
    activeFields.forEach((field, idx) => {
      const card = document.createElement('div');
      card.className = `breakout-field-card ${idx === currentSelectionIdx ? 'selected' : ''}`;
      card.dataset.index = idx;
      
      const savedBadge = field.saved 
        ? `<span style="font-size:0.7rem; color:var(--success); font-weight:700;">✓ Saved</span>` 
        : `<span style="font-size:0.7rem; color:var(--text-muted);">Unsaved</span>`;

      card.innerHTML = `
        <div class="breakout-field-card-header">
          <span class="breakout-field-name">${field.label}</span>
          ${savedBadge}
        </div>
        <div class="breakout-field-text">${escapeHTML(field.content.substring(0, 100))}${field.content.length > 100 ? '...' : ''}</div>
      `;
      
      card.addEventListener('click', () => selectField(idx));
      fieldsListContainer.appendChild(card);
    });
  }

  function selectField(idx) {
    currentSelectionIdx = idx;
    
    const cards = fieldsListContainer.querySelectorAll('.breakout-field-card');
    cards.forEach((c, i) => {
      c.classList.toggle('selected', i === idx);
    });

    const field = activeFields[idx];
    const charName = activeCard.name || 'Unnamed';

    // Populate preview panel form
    if (field.customName) {
      previewNameInput.value = field.customName;
    } else {
      previewNameInput.value = `${charName} - ${field.label.split(' / ')[0]}`;
    }

    previewCategorySelect.value = field.defaultCat;
    previewLineageInput.value = charName;
    previewContentPre.textContent = field.content;

    if (field.saved) {
      btnSaveCurrent.textContent = 'Already Saved to Vault';
      btnSaveCurrent.disabled = true;
    } else {
      btnSaveCurrent.textContent = 'Save Component to Vault';
      btnSaveCurrent.disabled = false;
    }
  }

  async function saveCurrentSelection() {
    if (currentSelectionIdx === -1) return;
    
    const field = activeFields[currentSelectionIdx];
    if (field.saved) return;

    const comp = {
      name: previewNameInput.value.trim(),
      category: previewCategorySelect.value,
      lineage: previewLineageInput.value.trim(),
      content: previewContentPre.textContent,
      tags: [activeCard.name || 'imported']
    };

    try {
      await window.ForgeDB.saveComponent(comp);
      
      field.saved = true;
      savedCount++;
      
      if (window.showToast) {
        window.showToast(`Saved "${comp.name}" to Vault`, 'success');
      }

      renderFieldsList();
      
      const nextUnsavedIdx = activeFields.findIndex((f, idx) => !f.saved && idx > currentSelectionIdx);
      const fallbackUnsavedIdx = activeFields.findIndex(f => !f.saved);
      
      if (nextUnsavedIdx !== -1) {
        selectField(nextUnsavedIdx);
      } else if (fallbackUnsavedIdx !== -1) {
        selectField(fallbackUnsavedIdx);
      } else {
        selectField(currentSelectionIdx);
      }

      updateStatus();
      
      if (window.refreshVaultList) {
        await window.refreshVaultList();
      }
    } catch (err) {
      console.error('Failed to save breakout component:', err);
      if (window.showToast) window.showToast('Save failed — see console', 'error');
    }
  }

  function updateStatus() {
    statusText.textContent = `${savedCount}/${activeFields.length} components saved to Vault.`;
    btnFinish.disabled = savedCount === 0;
  }

  function finishBreakout() {
    activeCard = null;
    activeFilename = '';
    activeFields = [];
    currentSelectionIdx = -1;
    savedCount = 0;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('welcome-view').classList.add('active');
    
    if (window.refreshVaultList) {
      window.refreshVaultList();
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

  // Expose
  window.BreakoutWizard = {
    init: initBreakout,
    start: startBreakoutWizard
  };
})();
