/**
 * assembler.js - Stage, map, and compile Vault components into a unified SillyTavern card.
 */

(() => {
  // Staged component IDs
  let stagedIds = [];
  
  // Custom mappings: componentId -> cardField Key
  let mappings = {};

  // Custom content overrides: componentId -> customText
  let contentOverrides = {};

  // Relationships: array of { sourceId, targetId, dynamic }
  let relationships = [];

  // Active project ID (if loading/editing an existing project)
  let activeProjectId = null;

  // Active cover image data URL
  let coverDataUrl = null;

  // Tweak Modal elements
  let tweakModalOverlay;
  let tweakModalTitle;
  let tweakContentArea;
  let btnCloseTweakModal;
  let btnRevertTweak;
  let btnSaveTweak;
  let btnPromoteTweak;
  let currentTweakId = null;

  // DOM Elements
  const assemblerView = document.getElementById('assembler-view');
  const projNameInput = document.getElementById('proj-name');
  const stagedListCanvas = document.getElementById('assembler-staged-list');
  const mappingsContainer = document.getElementById('assembler-mappings-list');
  const relationsContainer = document.getElementById('assembler-relations-list');
  const btnAddRelation = document.getElementById('btn-assembler-add-relation');
  const stagedCountBadge = document.getElementById('assembler-staged-count');
  const totalTokensBadge = document.getElementById('assembler-total-tokens');
  const warningThresholdInput = document.getElementById('warning-threshold-input');

  // Cover Image DOM
  const coverEmpty = document.getElementById('assembler-cover-empty');
  const coverImage = document.getElementById('assembler-cover-image');
  const coverFileInput = document.getElementById('assembler-cover-file-input');

  // Drawer Elements
  const drawerCount = document.getElementById('drawer-count');
  const drawerItemsContainer = document.getElementById('drawer-items');
  const btnStageAssemble = document.getElementById('btn-stage-assemble');

  const TARGET_FIELDS = [
    { key: 'description', label: 'Character Bio' },
    { key: 'personality', label: 'Personality (Traits / W++)' },
    { key: 'scenario', label: 'Scenario Context (Starting setting)' },
    { key: 'first_mes', label: 'Initial Message' },
    { key: 'system_prompt', label: 'System Instructions' },
    { key: 'post_history_instructions', label: 'Post-History Prompt' },
    { key: 'mes_example', label: 'Example Dialogues' },
    { key: 'ignore', label: '❌ Ignore (Do not compile)' }
  ];

  function initAssembler() {
    btnAddRelation.addEventListener('click', addRelationRow);

    // Load warning threshold preference from localStorage (default: 4000)
    const storedThreshold = localStorage.getItem('anansi_warning_threshold');
    if (storedThreshold) {
      warningThresholdInput.value = storedThreshold;
    }
    warningThresholdInput.addEventListener('input', () => {
      localStorage.setItem('anansi_warning_threshold', warningThresholdInput.value);
      updateTokensEstimate();
    });
    
    // Wire assembly exports
    document.getElementById('btn-assembler-export-json').addEventListener('click', exportAsJSON);
    document.getElementById('btn-assembler-export-png').addEventListener('click', exportAsPNG);
    document.getElementById('btn-assembler-playtest').addEventListener('click', launchSandbox);

    // Sidebar staged count click triggers drawer toggle
    document.getElementById('project-drawer-header').addEventListener('click', toggleDrawer);
    document.getElementById('btn-clear-drawer').addEventListener('click', clearDrawer);
    btnStageAssemble.addEventListener('click', () => openAssemblerScreen(null));

    // Cover Image selector events
    document.getElementById('btn-assembler-change-cover').addEventListener('click', () => coverFileInput.click());
    coverFileInput.addEventListener('change', handleCoverFileSelect);

    // Tweak Modal DOM references
    tweakModalOverlay = document.getElementById('tweak-modal-overlay');
    tweakModalTitle = document.getElementById('tweak-modal-title');
    tweakContentArea = document.getElementById('tweak-content');
    btnCloseTweakModal = document.getElementById('btn-close-tweak-modal');
    btnRevertTweak = document.getElementById('btn-revert-tweak');
    btnSaveTweak = document.getElementById('btn-save-tweak');
    btnPromoteTweak = document.getElementById('btn-promote-tweak');

    // Tweak Modal events
    btnCloseTweakModal.addEventListener('click', closeTweakModal);
    tweakModalOverlay.addEventListener('click', (e) => {
      if (e.target === tweakModalOverlay) closeTweakModal();
    });

    btnSaveTweak.addEventListener('click', async () => {
      if (!currentTweakId) return;
      const text = tweakContentArea.value.trim();
      contentOverrides[currentTweakId] = text;
      
      closeTweakModal();
      renderAssemblerScreen();
      updateTokensEstimate();
      if (window.showToast) window.showToast('Project tweak saved!', 'success');
      
      await autoSaveProjectRecord();
    });

    btnRevertTweak.addEventListener('click', async () => {
      if (!currentTweakId) return;
      delete contentOverrides[currentTweakId];
      
      closeTweakModal();
      renderAssemblerScreen();
      updateTokensEstimate();
      if (window.showToast) window.showToast('Reverted to default component content.', 'info');
      
      await autoSaveProjectRecord();
    });

    btnPromoteTweak.addEventListener('click', async () => {
      if (!currentTweakId) return;
      const text = tweakContentArea.value.trim();
      if (!text) return;

      try {
        const comp = await window.ForgeDB.getComponent(currentTweakId);
        const defaultName = comp ? `${comp.name.split(' - ')[0]} (Scenario Tweak)` : 'Tweaked Component';
        
        const newName = prompt('Enter a name to save this tweaked version to your Vault:', defaultName);
        if (!newName || !newName.trim()) return;

        const newComp = {
          name: newName.trim(),
          content: text,
          category: comp ? comp.category : 'character',
          lineage: comp ? comp.lineage : '',
          scenarios: comp ? [...(comp.scenarios || [])] : [],
          tags: comp ? [...comp.tags] : []
        };

        const savedComp = await window.ForgeDB.saveComponent(newComp);
        if (window.refreshVaultList) window.refreshVaultList();
        if (window.showToast) window.showToast(`Saved "${newComp.name}" to Vault!`, 'success');

        const swap = confirm(`Would you like to stage the new Vault component "${newComp.name}" in this project, replacing the tweaked version?`);
        if (swap) {
          // Store old mapping value
          const oldMapValue = mappings[currentTweakId];
          
          // Unstage old
          unstageComponent(currentTweakId);
          
          // Stage new
          stageComponent(savedComp.id);
          
          // Apply mapping to new
          mappings[savedComp.id] = oldMapValue || 'personality';
          
          // Clean up the override
          delete contentOverrides[currentTweakId];
          
          closeTweakModal();
          renderAssemblerScreen();
          updateTokensEstimate();
          await autoSaveProjectRecord();
          if (window.showToast) window.showToast(`Staged "${newComp.name}" in place of the tweak!`, 'success');
        } else {
          closeTweakModal();
        }
      } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast('Failed to save component to Vault: ' + err.message, 'error');
      }
    });

    // Auto-save project name when field loses focus
    projNameInput.addEventListener('blur', async () => {
      const newName = projNameInput.value.trim();
      if (!newName || !activeProjectId) return;
      try {
        const proj = await window.ForgeDB.getProject(activeProjectId);
        if (proj && proj.name !== newName) {
          proj.name = newName;
          // Also update the compiled card name if present
          if (proj.compiledCard?.data) proj.compiledCard.data.name = newName;
          await window.ForgeDB.saveProject(proj);
          if (window.refreshProjectsList) window.refreshProjectsList();
          if (window.showToast) window.showToast(`Project renamed to "${newName}"`, 'success');
        }
      } catch (err) {
        console.error('Failed to save project name:', err);
      }
    });

    renderDrawer();
  }

  // --- Staging Area / Drawer Functions ---

  function stageComponent(id) {
    if (stagedIds.includes(id)) {
      if (window.showToast) window.showToast('Item is already staged.', 'info');
      return;
    }
    stagedIds.push(id);
    
    // Auto-map based on category
    window.ForgeDB.getComponent(id).then(comp => {
      if (comp) {
        if (comp.category === 'character') mappings[id] = 'personality';
        else if (comp.category === 'bio') mappings[id] = 'description';
        else if (comp.category === 'initial_message') mappings[id] = 'first_mes';
        else if (comp.category === 'setting') mappings[id] = 'scenario';
        else if (comp.category === 'rules') mappings[id] = 'system_prompt';
        else mappings[id] = 'description';
        
        renderDrawer();
        if (window.showToast) window.showToast(`Staged "${comp.name}"`, 'success');
      }
    });
  }

  function unstageComponent(id) {
    stagedIds = stagedIds.filter(x => x !== id);
    delete mappings[id];
    relationships = relationships.filter(r => r.sourceId !== id && r.targetId !== id);
    
    renderDrawer();
    if (assemblerView.classList.contains('active')) {
      renderAssemblerScreen();
    }
  }

  function clearDrawer() {
    stagedIds = [];
    mappings = {};
    relationships = [];
    activeProjectId = null;
    coverDataUrl = null;
    renderDrawer();
    if (assemblerView.classList.contains('active')) {
      renderAssemblerScreen();
    }
  }

  function toggleDrawer() {
    const drawer = document.getElementById('project-drawer');
    drawer.classList.toggle('collapsed');
    drawer.classList.toggle('expanded');
  }

  async function renderDrawer() {
    drawerCount.textContent = stagedIds.length;
    drawerItemsContainer.innerHTML = '';

    if (stagedIds.length === 0) {
      btnStageAssemble.disabled = true;
      return;
    }

    btnStageAssemble.disabled = false;

    for (const id of stagedIds) {
      const comp = await window.ForgeDB.getComponent(id);
      if (!comp) continue;

      const pill = document.createElement('div');
      pill.className = 'drawer-item-pill';
      
      const categoryIcon = getCategoryIcon(comp.category);
      pill.innerHTML = `
        <span>${categoryIcon} ${escapeHTML(comp.name)}</span>
        <button class="btn-remove-drawer-item" title="Unstage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      pill.querySelector('.btn-remove-drawer-item').addEventListener('click', (e) => {
        e.stopPropagation();
        unstageComponent(id);
      });

      drawerItemsContainer.appendChild(pill);
    }
  }

  // --- Cover Image Handlers ---

  function handleCoverFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      coverDataUrl = event.target.result;
      updateCoverPreview();
      
      // Auto-save Cover using project ID as key
      if (!activeProjectId) {
        activeProjectId = window.ForgeDB.generateId();
      }
      await window.ForgeDB.saveCover(activeProjectId, coverDataUrl);
    };
    reader.readAsDataURL(file);
  }

  function updateCoverPreview() {
    if (coverDataUrl) {
      coverEmpty.style.display = 'none';
      coverImage.src = coverDataUrl;
      coverImage.style.display = 'block';
    } else {
      coverEmpty.style.display = 'flex';
      coverImage.style.display = 'none';
      coverImage.src = '';
    }
  }

  // --- Staged Component Overrides (Tweaks) ---

  function openTweakModal(id, name, defaultContent) {
    currentTweakId = id;
    tweakModalTitle.textContent = `Tweak "${name.split(' - ')[0]}" for Project`;
    
    if (contentOverrides[id] !== undefined) {
      tweakContentArea.value = contentOverrides[id];
      btnRevertTweak.style.display = 'inline-flex';
    } else {
      tweakContentArea.value = defaultContent;
      btnRevertTweak.style.display = 'none';
    }
    
    tweakModalOverlay.classList.remove('hidden');
  }

  function closeTweakModal() {
    tweakModalOverlay.classList.add('hidden');
    currentTweakId = null;
  }

  async function autoSaveProjectRecord() {
    if (!activeProjectId) return;
    try {
      const proj = await window.ForgeDB.getProject(activeProjectId);
      if (proj) {
        proj.contentOverrides = contentOverrides;
        // Re-compile project data structure to keep compiledCard up-to-date!
        const card = await compileCardData();
        proj.compiledCard = card;
        await window.ForgeDB.saveProject(proj);
      }
    } catch (err) {
      console.error('Failed to auto-save project overrides:', err);
    }
  }

  // --- Assembler Workspace View ---

  async function openAssemblerScreen(projectId = null) {
    coverDataUrl = null; // Reset state
    contentOverrides = {}; // Reset overrides

    if (projectId && typeof projectId === 'string') {
      const project = await window.ForgeDB.getProject(projectId);
      if (project) {
        activeProjectId = project.id;
        stagedIds = [...project.componentIds];
        mappings = { ...project.mappings };
        relationships = [...project.relationships];
        contentOverrides = { ...(project.contentOverrides || {}) };
        projNameInput.value = project.name;
        
        // Fetch cover from library under project ID
        const savedCover = await window.ForgeDB.getCover(project.id);
        if (savedCover) {
          coverDataUrl = savedCover;
        }

        await renderAssemblerScreen();
        updateCoverPreview();
        renderDrawer();

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        assemblerView.classList.add('active');
        return;
      }
    }

    // Default open from Bottom Drawer staging
    activeProjectId = null;
    if (stagedIds.length === 0) return;

    // Default project name based on character components
    const characterNames = [];
    let matchedLineage = null;
    for (const id of stagedIds) {
      const comp = await window.ForgeDB.getComponent(id);
      if (comp) {
        if (comp.lineage) matchedLineage = comp.lineage;
        if (comp.category === 'character') {
          const cleanName = comp.name.split(' - ')[0];
          if (!characterNames.includes(cleanName)) {
            characterNames.push(cleanName);
          }
        }
      }
    }
    
    projNameInput.value = characterNames.length > 0 ? characterNames.join(' & ') : 'New Assembled Bot';

    // Auto-fetch original cover artwork if saved under matched lineage
    if (matchedLineage) {
      const lineageCover = await window.ForgeDB.getCover(matchedLineage);
      if (lineageCover) {
        coverDataUrl = lineageCover;
      }
    }

    renderAssemblerScreen();
    updateCoverPreview();

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    assemblerView.classList.add('active');
  }

  async function renderAssemblerScreen() {
    stagedCountBadge.textContent = stagedIds.length;
    stagedListCanvas.innerHTML = '';
    mappingsContainer.innerHTML = '';

    let totalLength = 0;

    for (const id of stagedIds) {
      const comp = await window.ForgeDB.getComponent(id);
      if (!comp) continue;

      const finalContent = contentOverrides[id] !== undefined ? contentOverrides[id] : (comp.content || '');
      totalLength += finalContent.length;

      const sideItem = document.createElement('div');
      sideItem.className = 'assembler-staged-item';
      sideItem.innerHTML = `
        <span>${getCategoryIcon(comp.category)} ${escapeHTML(comp.name)}</span>
        <button class="btn btn-ghost btn-icon btn-sm" title="Remove">&times;</button>
      `;
      sideItem.querySelector('button').addEventListener('click', () => unstageComponent(id));
      stagedListCanvas.appendChild(sideItem);

      const mapRow = document.createElement('div');
      mapRow.className = 'assembler-mapping-row';
      
      let optionsHtml = '';
      TARGET_FIELDS.forEach(field => {
        const isSelected = mappings[id] === field.key;
        optionsHtml += `<option value="${field.key}" ${isSelected ? 'selected' : ''}>${field.label}</option>`;
      });

      const isCustomized = contentOverrides[id] !== undefined;
      const badgeHtml = isCustomized ? `<span class="badge badge-tweak" style="margin-left: 8px; font-size: 0.65rem; background: var(--accent); color: white; padding: 2px 6px; border-radius: var(--radius-sm);">tweaked</span>` : '';

      mapRow.innerHTML = `
        <div class="assembler-mapping-name">
          <div style="display:flex; align-items:center;">
            ${getCategoryIcon(comp.category)} <strong style="margin-left:4px;">${escapeHTML(comp.name)}</strong>
            ${badgeHtml}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            Size: ${Math.round(finalContent.length / 4)} tokens
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn btn-ghost btn-icon btn-sm btn-tweak-comp" title="Tweak text for project">📝</button>
          <select class="assembler-mapping-select">
            ${optionsHtml}
          </select>
        </div>
      `;

      mapRow.querySelector('.btn-tweak-comp').addEventListener('click', () => {
        openTweakModal(id, comp.name, comp.content);
      });

      mapRow.querySelector('select').addEventListener('change', (e) => {
        mappings[id] = e.target.value;
        updateTokensEstimate();
      });

      mappingsContainer.appendChild(mapRow);
    }

    totalTokensBadge.textContent = `${Math.round(totalLength / 4)} tokens`;
    renderRelationships();
  }

  function renderRelationships() {
    relationsContainer.innerHTML = '';
    
    relationships.forEach((rel, idx) => {
      const row = document.createElement('div');
      row.className = 'relation-row';

      let sourceOptions = '';
      let targetOptions = '';
      
      stagedIds.forEach(id => {
        window.ForgeDB.getComponent(id).then(comp => {
          if (comp && ['character', 'organization'].includes(comp.category)) {
            const cleanName = comp.name.split(' - ')[0];
            const isSrcSelected = rel.sourceId === id;
            const isTgtSelected = rel.targetId === id;
            
            const srcOpt = `<option value="${id}" ${isSrcSelected ? 'selected' : ''}>${escapeHTML(cleanName)}</option>`;
            const tgtOpt = `<option value="${id}" ${isTgtSelected ? 'selected' : ''}>${escapeHTML(cleanName)}</option>`;
            
            row.querySelector('.src-select').innerHTML += srcOpt;
            row.querySelector('.tgt-select').innerHTML += tgtOpt;
          }
        });
      });

      row.innerHTML = `
        <div class="relation-row-inner">
          <div class="relation-who-group">
            <label class="relation-label">Who</label>
            <select class="relation-select src-select">
              <option value="">-- character --</option>
            </select>
          </div>
          <span class="relation-arrow">feels/acts toward</span>
          <div class="relation-who-group">
            <label class="relation-label">Whom</label>
            <select class="relation-select tgt-select">
              <option value="">-- character --</option>
              <option value="{{User}}" ${rel.targetId === '{{User}}' ? 'selected' : ''}>{{User}}</option>
            </select>
          </div>
          <div class="relation-dynamic-group">
            <label class="relation-label">Dynamic</label>
            <input type="text" class="relation-text" placeholder='e.g. "rivals but secretly respects", "protective older sister"' value="${escapeHTML(rel.dynamic || '')}">
          </div>
          <button class="btn btn-danger btn-icon btn-sm btn-del-rel" title="Remove">&times;</button>
        </div>
      `;

      row.querySelector('.src-select').addEventListener('change', (e) => {
        rel.sourceId = e.target.value;
        updateTokensEstimate();
      });
      row.querySelector('.tgt-select').addEventListener('change', (e) => {
        rel.targetId = e.target.value;
        updateTokensEstimate();
      });
      row.querySelector('.relation-text').addEventListener('input', (e) => {
        rel.dynamic = e.target.value;
        updateTokensEstimate();
      });
      row.querySelector('.btn-del-rel').addEventListener('click', () => {
        relationships = relationships.filter((_, i) => i !== idx);
        renderRelationships();
        updateTokensEstimate();
      });

      relationsContainer.appendChild(row);
    });
  }

  function addRelationRow() {
    relationships.push({ sourceId: '', targetId: '', dynamic: '' });
    renderRelationships();
    updateTokensEstimate();
  }

  function getCategoryIcon(cat) {
    if (cat === 'character') return '🎭';
    if (cat === 'bio') return '📝';
    if (cat === 'initial_message') return '💬';
    if (cat === 'organization') return '🤝';
    if (cat === 'setting') return '🌍';
    if (cat === 'rules') return '📜';
    return '📦';
  }

  function runHealthCheck(allComponents) {
    const healthContainer = document.getElementById('assembler-health-status');
    if (!healthContainer) return;
    healthContainer.innerHTML = '';

    const checks = [];
    
    // Count mappings
    const counts = {
      description: 0,
      personality: 0,
      scenario: 0,
      first_mes: 0,
      system_prompt: 0,
      post_history_instructions: 0,
      mes_example: 0
    };

    let totalLength = 0;
    stagedIds.forEach(id => {
      const comp = allComponents.find(c => c.id === id);
      if (comp) {
        const mapVal = mappings[id];
        if (mapVal && mapVal !== 'ignore') {
          counts[mapVal]++;
          const finalContent = contentOverrides[id] !== undefined ? contentOverrides[id] : (comp.content || '');
          totalLength += finalContent.length;
        }
      }
    });

    const estTokens = Math.round(totalLength / 4);

    // 1. Critical Check: No Description/Personality (missing character core)
    if (counts.description === 0 && counts.personality === 0) {
      checks.push({
        type: 'critical',
        icon: '⚠️',
        text: 'No component is mapped to Description or Personality. Your bot will compile empty traits.'
      });
    }

    // 2. Warning Check: Missing greeting
    if (counts.first_mes === 0) {
      checks.push({
        type: 'warning',
        icon: '💬',
        text: 'Missing Initial Message. The bot will have no greeting when a new chat starts.'
      });
    }

    // 3. Warning Check: Multiple greetings
    if (counts.first_mes > 1) {
      checks.push({
        type: 'warning',
        icon: '💡',
        text: `${counts.first_mes} components mapped to Initial Message. They will concatenate, creating a disjointed double-greeting.`
      });
    }

    // 4. Warning Check: Multiple Post-History instructions
    if (counts.post_history_instructions > 1) {
      checks.push({
        type: 'warning',
        icon: '💡',
        text: `${counts.post_history_instructions} components mapped to Post-History. This may lead to conflicting LLM guidelines.`
      });
    }

    // 5. Warning Check: Broken Relationship links
    let brokenRelsCount = 0;
    relationships.forEach(rel => {
      const sourceStaged = stagedIds.includes(rel.sourceId);
      const targetStaged = rel.targetId === '{{User}}' || stagedIds.includes(rel.targetId);
      if (rel.dynamic && (!sourceStaged || !targetStaged)) {
        brokenRelsCount++;
      }
    });
    if (brokenRelsCount > 0) {
      checks.push({
        type: 'warning',
        icon: '🔗',
        text: `${brokenRelsCount} relationship links refer to components that are no longer staged in this project.`
      });
    }

    // 6. Token Budget warning
    const thresholdVal = parseInt(warningThresholdInput.value, 10) || 4000;
    if (estTokens > thresholdVal) {
      checks.push({
        type: 'info',
        icon: '⚡',
        text: `Compiled card size is ${estTokens} tokens (exceeds warning threshold of ${thresholdVal} tokens).`
      });
    }

    // Render checks
    if (checks.length === 0) {
      const successDiv = document.createElement('div');
      successDiv.className = 'health-item success';
      successDiv.innerHTML = `
        <span class="health-item-icon">✅</span>
        <span class="health-item-text">All checks passed! Bot compiles successfully.</span>
      `;
      healthContainer.appendChild(successDiv);
    } else {
      checks.forEach(chk => {
        const div = document.createElement('div');
        div.className = `health-item ${chk.type}`;
        div.innerHTML = `
          <span class="health-item-icon">${chk.icon}</span>
          <span class="health-item-text">${chk.text}</span>
        `;
        healthContainer.appendChild(div);
      });
    }
  }

  function updateTokensEstimate() {
    window.ForgeDB.getAllComponents().then(all => {
      let totalLength = 0;
      stagedIds.forEach(id => {
        if (mappings[id] !== 'ignore') {
          const comp = all.find(x => x.id === id);
          if (comp) {
            const finalContent = contentOverrides[id] !== undefined ? contentOverrides[id] : (comp.content || '');
            totalLength += finalContent.length;
          }
        }
      });
      totalTokensBadge.textContent = `${Math.round(totalLength / 4)} tokens`;
      runHealthCheck(all);
    });
  }

  // --- Stitched Card Compilation ---

  function injectComponentRelationships(comp, rels) {
    if (!rels || rels.length === 0) return comp.content.trim();
    let rawText = comp.content.trim();
    const hasW22 = /\[character\(/i.test(rawText);
    const isW22 = hasW22 || rawText.startsWith('[') || rawText.includes('(');

    if (isW22) {
      const relationsLines = rels.map(r => `Relationship("${r.target}"="${r.description}")`).join('\n');
      if (rawText.endsWith('}]')) {
        return rawText.slice(0, -2).trim() + '\n' + relationsLines + '\n}]';
      } else if (rawText.endsWith(']')) {
        return rawText.slice(0, -1).trim() + '\n' + relationsLines + '\n]';
      } else {
        return rawText + '\n' + relationsLines;
      }
    } else {
      const relationsText = '\n\nRelationships:\n' + rels.map(r => `- Toward ${r.target}: ${r.description}`).join('\n');
      return rawText + relationsText;
    }
  }

  async function compileCardData() {
    const projName = projNameInput.value.trim() || 'Compiled Bot';
    
    const fields = {
      description: [],
      personality: [],
      scenario: [],
      first_mes: [],
      system_prompt: [],
      post_history_instructions: [],
      mes_example: []
    };

    const tagsSet = new Set();

    for (const id of stagedIds) {
      const comp = await window.ForgeDB.getComponent(id);
      if (!comp) continue;

      const finalComp = { ...comp };
      if (contentOverrides[id] !== undefined) {
        finalComp.content = contentOverrides[id];
      }

      const targetField = mappings[id];
      if (targetField && targetField !== 'ignore') {
        fields[targetField].push(finalComp);
      }

      if (Array.isArray(comp.tags)) {
        comp.tags.forEach(t => tagsSet.add(t));
      }
    }

    // Process relationships
    const relsBySource = {};
    for (const rel of relationships) {
      if (rel.sourceId && rel.targetId && rel.dynamic.trim()) {
        let tgtName = '';
        if (rel.targetId === '{{User}}') {
          tgtName = '{{User}}';
        } else {
          const tgtComp = await window.ForgeDB.getComponent(rel.targetId);
          if (tgtComp) {
            tgtName = tgtComp.name.split(' - ')[0];
          }
        }

        if (tgtName) {
          if (!relsBySource[rel.sourceId]) {
            relsBySource[rel.sourceId] = [];
          }
          relsBySource[rel.sourceId].push({ target: tgtName, description: rel.dynamic.trim() });
        }
      }
    }

    const descriptionText = fields.description.map(c => {
      const cleanContent = injectComponentRelationships(c, relsBySource[c.id]);
      return `### ${c.name.split(' - ')[0]}\n${cleanContent}`;
    }).join('\n\n');

    const personalityText = fields.personality.map(c => {
      const cleanContent = injectComponentRelationships(c, relsBySource[c.id]);
      const hasW22 = /\[character\(/i.test(cleanContent);
      const cleanName = c.name.split(' - ')[0];
      if (hasW22) {
        return cleanContent;
      } else {
        return `[character("${cleanName}")\n{\n${cleanContent}\n}]`;
      }
    }).join('\n\n');

    const scenarioText = fields.scenario.map(c => c.content.trim()).join('\n\n');
    const firstMesText = fields.first_mes.map(c => c.content.trim()).join('\n\n');

    let systemPromptText = fields.system_prompt.map(c => c.content.trim()).join('\n\n');

    const postHistoryText = fields.post_history_instructions.map(c => c.content.trim()).join('\n\n');
    const examplesText = fields.mes_example.map(c => c.content.trim()).join('\n\n');

    return {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: projName,
        description: descriptionText,
        personality: personalityText,
        scenario: scenarioText,
        first_mes: firstMesText,
        mes_example: examplesText,
        creator_notes: 'Assembled inside Anansi Forge',
        system_prompt: systemPromptText,
        post_history_instructions: postHistoryText,
        alternate_greetings: [],
        tags: Array.from(tagsSet),
        creator: 'Anansi Forge',
        character_version: '1.0',
        extensions: {
          anansi_forge: {
            stagedComponentIds: stagedIds,
            mappings: mappings,
            relationships: relationships
          }
        }
      }
    };
  }

  // --- Actions / Exports ---

  async function exportAsJSON() {
    try {
      const card = await compileCardData();
      
      const projectRecord = {
        id: activeProjectId || window.ForgeDB.generateId(),
        name: card.data.name,
        componentIds: stagedIds,
        mappings: mappings,
        relationships: relationships,
        contentOverrides: contentOverrides,
        compiledCard: card
      };
      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;

      // Save cover to library if available
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(projectRecord.id, coverDataUrl);
      }

      if (window.refreshProjectsList) window.refreshProjectsList();

      const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.data.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_card.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (window.showToast) window.showToast('JSON character card downloaded and project saved.', 'success');
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to compile card JSON', 'error');
    }
  }

  async function exportAsPNG() {
    try {
      const card = await compileCardData();

      const projectRecord = {
        id: activeProjectId || window.ForgeDB.generateId(),
        name: card.data.name,
        componentIds: stagedIds,
        mappings: mappings,
        relationships: relationships,
        contentOverrides: contentOverrides,
        compiledCard: card
      };
      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;

      // Save cover to library if available
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(projectRecord.id, coverDataUrl);
      }

      if (window.refreshProjectsList) window.refreshProjectsList();
      
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      const drawCanvasContent = (ctx, callback) => {
        if (coverDataUrl) {
          const img = new Image();
          img.src = coverDataUrl;
          img.onload = () => {
            // Draw custom cover scaled to cover canvas (object-fit: cover)
            const scale = Math.max(400 / img.width, 600 / img.height);
            const x = (400 - img.width * scale) / 2;
            const y = (600 - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            callback();
          };
          img.onerror = () => {
            drawFallbackGrid(ctx);
            callback();
          };
        } else {
          drawFallbackGrid(ctx);
          callback();
        }
      };

      const drawFallbackGrid = (ctx) => {
        const grad = ctx.createLinearGradient(0, 0, 0, 600);
        grad.addColorStop(0, '#111827');
        grad.addColorStop(0.5, '#4f46e5');
        grad.addColorStop(1, '#030712');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 400, 600);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 400; i += 40) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 600); ctx.stroke();
        }
        for (let j = 0; j < 600; j += 40) {
          ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(400, j); ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const angle = (k * Math.PI) / 4;
          ctx.moveTo(200, 240);
          ctx.lineTo(200 + Math.cos(angle) * 160, 240 + Math.sin(angle) * 160);
        }
        ctx.stroke();

        for (let r = 30; r <= 150; r += 30) {
          ctx.beginPath(); ctx.arc(200, 240, r, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(card.data.name, 200, 470);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '14px "Outfit", sans-serif';
        ctx.fillText('ANANSI FORGE CHARACTER CARD', 200, 500);
      };

      drawCanvasContent(ctx, () => {
        canvas.toBlob(async (blob) => {
          const embeddedPngBlob = await window.PNGHandler.embed(blob, card);
          const url = URL.createObjectURL(embeddedPngBlob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `${card.data.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_card.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          if (window.showToast) window.showToast('PNG Character Card exported and project saved.', 'success');
        }, 'image/png');
      });

    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('PNG export failed', 'error');
    }
  }

  async function launchSandbox() {
    try {
      const card = await compileCardData();
      
      const projectRecord = {
        id: activeProjectId || window.ForgeDB.generateId(),
        name: card.data.name,
        componentIds: stagedIds,
        mappings: mappings,
        relationships: relationships,
        contentOverrides: contentOverrides,
        compiledCard: card
      };

      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;
      
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(projectRecord.id, coverDataUrl);
      }

      if (window.refreshProjectsList) window.refreshProjectsList();

      if (window.showToast) window.showToast(`Project compiled! Launching sandbox...`, 'info');

      if (window.SandboxPlaytest) {
        window.SandboxPlaytest.start(savedProj.id);
      }
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Playtest launch failed', 'error');
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

  // Expose APIs
  window.ProjectAssembler = {
    init: initAssembler,
    stage: stageComponent,
    unstage: unstageComponent,
    clear: clearDrawer,
    compile: compileCardData,
    open: openAssemblerScreen
  };
})();
