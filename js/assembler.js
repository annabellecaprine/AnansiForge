/**
 * assembler.js - Stage, map, and compile Vault components into a unified SillyTavern card.
 */

(() => {
  // Staged component IDs
  let stagedIds = [];
  
  // Custom mappings: componentId -> cardField Key
  let mappings = {};

  // Relationships: array of { sourceId, targetId, dynamic }
  let relationships = [];

  // Active project ID (if loading/editing an existing project)
  let activeProjectId = null;

  // Active cover image data URL
  let coverDataUrl = null;

  // DOM Elements
  const assemblerView = document.getElementById('assembler-view');
  const projNameInput = document.getElementById('proj-name');
  const stagedListCanvas = document.getElementById('assembler-staged-list');
  const mappingsContainer = document.getElementById('assembler-mappings-list');
  const relationsContainer = document.getElementById('assembler-relations-list');
  const btnAddRelation = document.getElementById('btn-assembler-add-relation');
  const stagedCountBadge = document.getElementById('assembler-staged-count');
  const totalTokensBadge = document.getElementById('assembler-total-tokens');

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
      
      // Auto-save Cover to the library using project name as key
      const projName = projNameInput.value.trim();
      if (projName) {
        await window.ForgeDB.saveCover(projName, coverDataUrl);
      }
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

  // --- Assembler Workspace View ---

  async function openAssemblerScreen(projectId = null) {
    coverDataUrl = null; // Reset state

    if (projectId && typeof projectId === 'string') {
      const project = await window.ForgeDB.getProject(projectId);
      if (project) {
        activeProjectId = project.id;
        stagedIds = [...project.componentIds];
        mappings = { ...project.mappings };
        relationships = [...project.relationships];
        projNameInput.value = project.name;
        
        // Fetch cover from library under project name
        const savedCover = await window.ForgeDB.getCover(project.name);
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
    let matchedCluster = null;
    for (const id of stagedIds) {
      const comp = await window.ForgeDB.getComponent(id);
      if (comp) {
        if (comp.cluster) matchedCluster = comp.cluster;
        if (comp.category === 'character') {
          const cleanName = comp.name.split(' - ')[0];
          if (!characterNames.includes(cleanName)) {
            characterNames.push(cleanName);
          }
        }
      }
    }
    
    projNameInput.value = characterNames.length > 0 ? characterNames.join(' & ') : 'New Assembled Bot';

    // Auto-fetch original cover artwork if saved under matched cluster
    if (matchedCluster) {
      const clusterCover = await window.ForgeDB.getCover(matchedCluster);
      if (clusterCover) {
        coverDataUrl = clusterCover;
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

      totalLength += (comp.content || '').length;

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

      mapRow.innerHTML = `
        <div class="assembler-mapping-name">
          ${getCategoryIcon(comp.category)} <strong>${escapeHTML(comp.name)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            Size: ${Math.round((comp.content || '').length / 4)} tokens
          </div>
        </div>
        <select class="assembler-mapping-select">
          ${optionsHtml}
        </select>
      `;

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
        <select class="relation-select src-select" title="Source Component">
          <option value="">-- Source --</option>
        </select>
        <span style="font-size: 0.8rem; color: var(--text-muted);">➡</span>
        <select class="relation-select tgt-select" title="Target Component">
          <option value="">-- Target --</option>
        </select>
        <input type="text" class="relation-text" placeholder="Describe relation (e.g. Rival, Loves)..." value="${escapeHTML(rel.dynamic || '')}">
        <button class="btn btn-danger btn-icon btn-sm btn-del-rel">&times;</button>
      `;

      row.querySelector('.src-select').addEventListener('change', (e) => {
        rel.sourceId = e.target.value;
      });
      row.querySelector('.tgt-select').addEventListener('change', (e) => {
        rel.targetId = e.target.value;
      });
      row.querySelector('.relation-text').addEventListener('input', (e) => {
        rel.dynamic = e.target.value;
      });
      row.querySelector('.btn-del-rel').addEventListener('click', () => {
        relationships = relationships.filter((_, i) => i !== idx);
        renderRelationships();
      });

      relationsContainer.appendChild(row);
    });
  }

  function addRelationRow() {
    relationships.push({ sourceId: '', targetId: '', dynamic: '' });
    renderRelationships();
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

  function updateTokensEstimate() {
    window.ForgeDB.getAllComponents().then(all => {
      let totalLength = 0;
      stagedIds.forEach(id => {
        if (mappings[id] !== 'ignore') {
          const comp = all.find(x => x.id === id);
          if (comp) {
            totalLength += (comp.content || '').length;
          }
        }
      });
      totalTokensBadge.textContent = `${Math.round(totalLength / 4)} tokens`;
    });
  }

  // --- Stitched Card Compilation ---

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

      const targetField = mappings[id];
      if (targetField && targetField !== 'ignore') {
        fields[targetField].push(comp);
      }

      if (Array.isArray(comp.tags)) {
        comp.tags.forEach(t => tagsSet.add(t));
      }
    }

    const descriptionText = fields.description.map(c => {
      return `### ${c.name.split(' - ')[0]}\n${c.content.trim()}`;
    }).join('\n\n');

    const personalityText = fields.personality.map(c => {
      const rawText = c.content.trim();
      const hasW22 = /\[character\(/i.test(rawText);
      const cleanName = c.name.split(' - ')[0];
      if (hasW22) {
        return rawText;
      } else {
        return `[character("${cleanName}")\n{\n${rawText}\n}]`;
      }
    }).join('\n\n');

    const scenarioText = fields.scenario.map(c => c.content.trim()).join('\n\n');
    const firstMesText = fields.first_mes.map(c => c.content.trim()).join('\n\n');

    let systemPromptText = fields.system_prompt.map(c => c.content.trim()).join('\n\n');

    const compiledRelations = [];
    for (const rel of relationships) {
      if (rel.sourceId && rel.targetId && rel.dynamic.trim()) {
        const srcComp = await window.ForgeDB.getComponent(rel.sourceId);
        const tgtComp = await window.ForgeDB.getComponent(rel.targetId);
        if (srcComp && tgtComp) {
          const srcName = srcComp.name.split(' - ')[0];
          const tgtName = tgtComp.name.split(' - ')[0];
          compiledRelations.push(`- ${srcName} -> ${tgtName}: ${rel.dynamic.trim()}`);
        }
      }
    }

    if (compiledRelations.length > 0) {
      const relationsBlock = `\n\n### Interpersonal Cast Relationships\nYou must adhere to these character dynamics and feelings during chat:\n${compiledRelations.join('\n')}`;
      systemPromptText += relationsBlock;
    }

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
        compiledCard: card
      };
      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;

      // Save cover to library if available
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(card.data.name, coverDataUrl);
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
        compiledCard: card
      };
      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;

      // Save cover to library if available
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(card.data.name, coverDataUrl);
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
        compiledCard: card
      };

      const savedProj = await window.ForgeDB.saveProject(projectRecord);
      activeProjectId = savedProj.id;
      
      if (coverDataUrl) {
        await window.ForgeDB.saveCover(card.data.name, coverDataUrl);
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
