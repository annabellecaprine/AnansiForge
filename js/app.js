/**
 * app.js - Main orchestrator for Anansi Forge.
 */

(() => {
  // Global Toast System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 600);
    }, 3000);
  }
  window.showToast = showToast;

  // Active state
  let editingComponentId = null;
  let activeSidebarTab = 'vault'; // 'vault' or 'projects'
  let editorIsDirty = false;  // tracks unsaved editor changes
  let activeEditorTab = 'raw'; // 'raw' or 'form'

  // DOM References
  const mainCanvas = document.getElementById('main-canvas');
  const sidebarList = document.getElementById('vault-list');
  const searchInput = document.getElementById('vault-search');
  
  // Vault filters / actions rows
  const filterCat = document.getElementById('vault-category-filter');
  const filterLineage = document.getElementById('vault-lineage-filter');
  const filterScenario = document.getElementById('vault-scenario-filter');
  const btnTemplatesOnly = document.getElementById('btn-templates-only');
  const filterSort = document.getElementById('vault-sort-select');
  const sidebarFiltersRow = document.querySelector('.sidebar-filters-grid');
  const sidebarActionsRow = document.querySelector('.sidebar-actions');

  let showTemplatesOnly = false;

  // Sidebar Tab Buttons
  const tabVault = document.getElementById('tab-sidebar-vault');
  const tabProjects = document.getElementById('tab-sidebar-projects');

  // API Modal DOM
  const btnApiConfig = document.getElementById('btn-api-config');
  const modalOverlay = document.getElementById('modal-overlay');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnSaveApi = document.getElementById('btn-save-api');
  const apiProvider = document.getElementById('api-provider');
  const apiModel = document.getElementById('api-model');
  const apiKey = document.getElementById('api-key');
  const apiUrl = document.getElementById('api-url');
  const apiUrlGroup = document.getElementById('api-url-group');

  // File Import Inputs
  const btnImportCard = document.getElementById('btn-import-card');
  const fileImportInput = document.getElementById('file-import-input');
  const dropZone = document.getElementById('drop-zone');
  const vaultRestoreInput = document.getElementById('vault-restore-input');

  // Editor Form DOM
  const editorView = document.getElementById('editor-view');
  const compNameInput = document.getElementById('comp-name');
  const compContentInput = document.getElementById('comp-content');
  const compCategorySelect = document.getElementById('comp-category');
  const compLineageInput = document.getElementById('comp-lineage');
  const compScenariosInput = document.getElementById('comp-scenarios');
  const compIsTemplateCheck = document.getElementById('comp-is-template');
  const btnCreateVariant = document.getElementById('btn-create-variant');
  const compTagsInput = document.getElementById('comp-tags');
  const editorTokenCount = document.getElementById('editor-token-count');
  const btnSaveComponent = document.getElementById('btn-save-component');
  const btnDeleteComponent = document.getElementById('btn-delete-component');

  // Editor Tabs & Panes DOM
  const editorTabsContainer = document.getElementById('editor-tabs-container');
  const tabEditorForm = document.getElementById('tab-editor-form');
  const tabEditorRaw = document.getElementById('tab-editor-raw');
  const editorRawPane = document.getElementById('editor-raw-pane');
  const editorFormPane = document.getElementById('editor-form-pane');

  // Character Profile Fields
  const charOverview = document.getElementById('char-overview');
  const charPersonality = document.getElementById('char-personality');
  const charBackground = document.getElementById('char-background');
  const charAppearance = document.getElementById('char-appearance');
  const charAbilities = document.getElementById('char-abilities');
  const charStrengths = document.getElementById('char-strengths');
  const charWeaknesses = document.getElementById('char-weaknesses');
  const charLikes = document.getElementById('char-likes');
  const charDislikes = document.getElementById('char-dislikes');
  const charNotes = document.getElementById('char-notes');

  // Scenario Profile Fields
  const scenarioSetting = document.getElementById('scenario-setting');
  const scenarioUserRole = document.getElementById('scenario-user-role');
  const scenarioSituation = document.getElementById('scenario-situation');
  const scenarioDynamics = document.getElementById('scenario-dynamics');
  const scenarioExpectations = document.getElementById('scenario-expectations');
  const scenarioRelationships = document.getElementById('scenario-relationships');
  const scenarioRules = document.getElementById('scenario-rules');
  const scenarioTone = document.getElementById('scenario-tone');

  // Navigation Back Buttons
  const btnEditorBack = document.getElementById('btn-editor-back');
  const btnBreakoutBack = document.getElementById('btn-breakout-back');
  const btnAssemblerBack = document.getElementById('btn-assembler-back');
  const btnSandboxBack = document.getElementById('btn-sandbox-back');
  const btnParlorBack = document.getElementById('btn-parlor-back');

  // --- View Routing ---

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === viewId);
    });
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  // --- Sidebar Tab Routing ---

  function switchSidebarTab(tabName) {
    activeSidebarTab = tabName;
    
    // Toggle active classes on tab buttons
    tabVault.classList.toggle('active', tabName === 'vault');
    tabProjects.classList.toggle('active', tabName === 'projects');

    if (tabName === 'vault') {
      // Show filters and actions
      sidebarFiltersRow.style.display = 'grid';
      sidebarActionsRow.style.display = 'grid';
      searchInput.placeholder = 'Search Vault components...';
      refreshVaultList();
    } else {
      // Hide filters and actions (search box remains visible)
      sidebarFiltersRow.style.display = 'none';
      sidebarActionsRow.style.display = 'none';
      searchInput.placeholder = 'Search compiled projects...';
      refreshProjectsList();
    }
  }

  // --- Render Vault Components List ---

  async function refreshVaultList() {
    if (activeSidebarTab !== 'vault') return;
    try {
      const components = await window.ForgeDB.getAllComponents();
      
      // Update Lineage Filter dropdown options
      const activeLineageFilter = filterLineage.value;
      const activeCat = filterCat.value;
      const filteredForLineages = activeCat === 'all'
        ? components
        : components.filter(c => c.category === activeCat);
      const lineages = [...new Set(filteredForLineages.map(c => c.lineage).filter(Boolean))].sort();
      filterLineage.innerHTML = '<option value="all">All</option>';
      lineages.forEach(l => {
        const option = document.createElement('option');
        option.value = l;
        option.textContent = l;
        if (l === activeLineageFilter) option.selected = true;
        filterLineage.appendChild(option);
      });

      // Update Scenario Filter dropdown options
      const activeScenarioFilter = filterScenario.value;
      const scenarios = [...new Set(components.flatMap(c => c.scenarios || []).filter(Boolean))].sort();
      filterScenario.innerHTML = '<option value="all">All</option>';
      scenarios.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        if (s === activeScenarioFilter) option.selected = true;
        filterScenario.appendChild(option);
      });

      // Update Lineage Datalist Suggestions in Editor
      const suggestions = document.getElementById('lineage-suggestions');
      if (suggestions) {
        suggestions.innerHTML = '';
        lineages.forEach(l => {
          const opt = document.createElement('option');
          opt.value = l;
          suggestions.appendChild(opt);
        });
      }

      // Filter
      const search = searchInput.value.toLowerCase().trim();
      const cat = filterCat.value;
      const lineageVal = filterLineage.value;
      const scenarioVal = filterScenario.value;

      const filtered = components.filter(comp => {
        const matchesSearch = comp.name.toLowerCase().includes(search) || 
                              (comp.content || '').toLowerCase().includes(search) ||
                              (comp.tags || []).some(t => t.toLowerCase().includes(search));
        const matchesCat = cat === 'all' || comp.category === cat;
        const matchesLineage = lineageVal === 'all' || comp.lineage === lineageVal;
        const matchesScenario = scenarioVal === 'all' || (comp.scenarios || []).includes(scenarioVal);
        const matchesTemplate = !showTemplatesOnly || comp.isTemplate === true;

        return matchesSearch && matchesCat && matchesLineage && matchesScenario && matchesTemplate;
      });

      // Apply Sorting
      const sortBy = filterSort.value;
      filtered.sort((a, b) => {
        if (sortBy === 'name-asc') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'name-desc') {
          return b.name.localeCompare(a.name);
        } else {
          const dateA = a.modifiedAt || 0;
          const dateB = b.modifiedAt || 0;
          return dateB - dateA;
        }
      });

      // Update Stats Banner
      const statsBanner = document.getElementById('sidebar-stats-banner');
      if (statsBanner) {
        if (search || cat !== 'all' || lineageVal !== 'all' || scenarioVal !== 'all' || showTemplatesOnly) {
          statsBanner.textContent = `Vault: ${filtered.length} of ${components.length} matched`;
        } else {
          statsBanner.textContent = `Vault: ${components.length} items`;
        }
      }

      // Render
      sidebarList.innerHTML = '';
      
      if (filtered.length === 0) {
        sidebarList.innerHTML = `
          <div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:0.85rem;">
            No components found.
          </div>
        `;
        return;
      }

      filtered.forEach(comp => {
        const item = document.createElement('div');
        item.className = 'vault-item';
        
        const templateBadge = comp.isTemplate 
          ? `<span class="template-badge">⭐ Template</span>` 
          : '';

        const lineageLabel = comp.lineage 
          ? `<span class="vault-item-lineage">🔗 ${escapeHTML(comp.lineage)}</span>` 
          : '<span></span>';

        const scenarioPills = (comp.scenarios && comp.scenarios.length > 0)
          ? `<div class="vault-item-scenarios">${comp.scenarios.map(s => `<span class="scenario-pill">${escapeHTML(s)}</span>`).join('')}</div>`
          : '';

        item.innerHTML = `
          <div class="vault-item-header">
            <span class="vault-item-name" title="${escapeHTML(comp.name)}">${escapeHTML(comp.name)}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              ${templateBadge}
              <span class="vault-item-category ${comp.category}">${comp.category}</span>
            </div>
          </div>
          ${scenarioPills}
          <div class="vault-item-footer">
            ${lineageLabel}
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-icon btn-sm btn-edit" title="Edit Component" style="padding:2px 6px;">📝</button>
              <button class="btn btn-primary btn-icon btn-sm btn-stage" title="Stage for Assembly" style="padding:2px 6px;">＋</button>
            </div>
          </div>
        `;

        item.querySelector('.btn-edit').addEventListener('click', (e) => {
          e.stopPropagation();
          openComponentEditor(comp.id);
        });

        item.querySelector('.btn-stage').addEventListener('click', (e) => {
          e.stopPropagation();
          window.ProjectAssembler.stage(comp.id);
        });

        item.addEventListener('click', () => {
          openComponentEditor(comp.id);
        });

        sidebarList.appendChild(item);
      });

    } catch (err) {
      console.error('Failed to load components list:', err);
    }
  }
  window.refreshVaultList = refreshVaultList;

  // --- Render Compiled Projects List ---

  async function refreshProjectsList() {
    if (activeSidebarTab !== 'projects') return;
    try {
      const projects = await window.ForgeDB.getAllProjects();
      const search = searchInput.value.toLowerCase().trim();

      const filtered = projects.filter(proj => {
        return proj.name.toLowerCase().includes(search) ||
               proj.componentIds.some(id => id.toLowerCase().includes(search));
      });

      // Update Stats Banner
      const statsBanner = document.getElementById('sidebar-stats-banner');
      if (statsBanner) {
        if (search) {
          statsBanner.textContent = `Projects: ${filtered.length} of ${projects.length} matched`;
        } else {
          statsBanner.textContent = `Projects: ${projects.length} compiled`;
        }
      }

      sidebarList.innerHTML = '';

      if (filtered.length === 0) {
        sidebarList.innerHTML = `
          <div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:0.85rem;">
            No compiled projects found.
          </div>
        `;
        return;
      }

      filtered.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'vault-item';
        
        const count = proj.componentIds ? proj.componentIds.length : 0;
        const relCount = proj.relationships ? proj.relationships.length : 0;

        item.innerHTML = `
          <div class="vault-item-header">
            <span class="vault-item-name" style="max-width: 220px;" title="${escapeHTML(proj.name)}">🤖 ${escapeHTML(proj.name)}</span>
            <span class="vault-item-category" style="background:linear-gradient(135deg, #a855f7 0%, #6366f1 100%); color:#fff;">compiled</span>
          </div>
          <div class="vault-item-footer">
            <span style="font-size:0.75rem; color:var(--text-muted);">${count} staged, ${relCount} rels</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-icon btn-sm btn-sandbox-play" title="Playtest Sandbox" style="padding:2px 6px;">💬</button>
              <button class="btn btn-ghost btn-icon btn-sm btn-edit-proj" title="Edit Assembler" style="padding:2px 6px;">📝</button>
              <button class="btn btn-danger btn-icon btn-sm btn-del-proj" title="Delete Project" style="padding:2px 6px;">&times;</button>
            </div>
          </div>
        `;

        item.querySelector('.btn-sandbox-play').addEventListener('click', (e) => {
          e.stopPropagation();
          window.SandboxPlaytest.start(proj.id);
        });

        item.querySelector('.btn-edit-proj').addEventListener('click', (e) => {
          e.stopPropagation();
          window.ProjectAssembler.open(proj.id);
        });

        item.querySelector('.btn-del-proj').addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = confirm(`Delete compiled project "${proj.name}"? This cannot be undone.`);
          if (confirmed) {
            await window.ForgeDB.deleteProject(proj.id);
            await window.ForgeDB.clearChatHistory(proj.id);
            showToast('Project deleted', 'success');
            refreshProjectsList();
          }
        });

        item.addEventListener('click', () => {
          window.ProjectAssembler.open(proj.id);
        });

        sidebarList.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to load projects list:', err);
    }
  }
  window.refreshProjectsList = refreshProjectsList;

  // --- Component Editor ---

  function toggleFormFields(category) {
    const charFields = document.getElementById('char-form-fields');
    const scenarioFields = document.getElementById('scenario-form-fields');
    if (category === 'character') {
      if (charFields) charFields.style.display = 'grid';
      if (scenarioFields) scenarioFields.style.display = 'none';
    } else if (category === 'scenario') {
      if (charFields) charFields.style.display = 'none';
      if (scenarioFields) scenarioFields.style.display = 'grid';
    } else {
      if (charFields) charFields.style.display = 'none';
      if (scenarioFields) scenarioFields.style.display = 'none';
    }
  }

  // Helper to switch editor panes
  function switchEditorTab(tabName) {
    const category = compCategorySelect.value;
    toggleFormFields(category);

    if (tabName === 'form') {
      // Sync raw -> structured fields
      const content = compContentInput.value;
      if (category === 'character') {
        const parsed = parseCharacterMarkdown(content);
        charOverview.value = parsed.overview || '';
        charPersonality.value = parsed.personality || '';
        charBackground.value = parsed.background || '';
        charAppearance.value = parsed.appearance || '';
        charAbilities.value = parsed.abilities || '';
        charStrengths.value = parsed.strengths || '';
        charWeaknesses.value = parsed.weaknesses || '';
        charLikes.value = parsed.likes || '';
        charDislikes.value = parsed.dislikes || '';
        charNotes.value = parsed.notes || '';
      } else if (category === 'scenario') {
        const parsed = parseScenarioMarkdown(content);
        scenarioSetting.value = parsed.setting || '';
        scenarioUserRole.value = parsed.userRole || '';
        scenarioSituation.value = parsed.situation || '';
        scenarioDynamics.value = parsed.dynamics || '';
        scenarioExpectations.value = parsed.expectations || '';
        scenarioRelationships.value = parsed.relationships || '';
        scenarioRules.value = parsed.rules || '';
        scenarioTone.value = parsed.tone || '';
      }
      
      tabEditorRaw.classList.remove('active');
      tabEditorForm.classList.add('active');
      editorRawPane.style.display = 'none';
      editorFormPane.style.display = 'block';
      activeEditorTab = 'form';
    } else {
      // Sync structured fields -> raw content textarea
      if (category === 'character') {
        const sections = {
          overview: charOverview.value,
          personality: charPersonality.value,
          background: charBackground.value,
          appearance: charAppearance.value,
          abilities: charAbilities.value,
          strengths: charStrengths.value,
          weaknesses: charWeaknesses.value,
          likes: charLikes.value,
          dislikes: charDislikes.value,
          notes: charNotes.value
        };
        const hasFormContent = Object.values(sections).some(v => v.trim());
        if (hasFormContent) {
          compContentInput.value = stitchCharacterMarkdown(sections);
          updateTokenCount();
        }
      } else if (category === 'scenario') {
        const sections = {
          setting: scenarioSetting.value,
          userRole: scenarioUserRole.value,
          situation: scenarioSituation.value,
          dynamics: scenarioDynamics.value,
          expectations: scenarioExpectations.value,
          relationships: scenarioRelationships.value,
          rules: scenarioRules.value,
          tone: scenarioTone.value
        };
        const hasFormContent = Object.values(sections).some(v => v.trim());
        if (hasFormContent) {
          compContentInput.value = stitchScenarioMarkdown(sections);
          updateTokenCount();
        }
      }
      
      tabEditorForm.classList.remove('active');
      tabEditorRaw.classList.add('active');
      editorFormPane.style.display = 'none';
      editorRawPane.style.display = 'block';
      activeEditorTab = 'raw';
    }
  }

  async function openComponentEditor(id = null) {
    editingComponentId = id;
    
    compNameInput.value = '';
    compContentInput.value = '';
    compCategorySelect.value = 'character';
    compLineageInput.value = '';
    compScenariosInput.value = '';
    compIsTemplateCheck.checked = false;
    btnCreateVariant.style.display = 'none';
    compTagsInput.value = '';
    editorTokenCount.textContent = '0';
    btnDeleteComponent.style.display = id ? 'inline-flex' : 'none';
    document.getElementById('editor-title').textContent = id ? 'Edit Vault Component' : 'Create Vault Component';

    // Reset pane visibility
    activeEditorTab = 'raw';
    tabEditorForm.classList.remove('active');
    tabEditorRaw.classList.add('active');
    editorFormPane.style.display = 'none';
    editorRawPane.style.display = 'block';
    editorTabsContainer.style.display = 'none';

    // Clear form inputs
    const formFields = [
      charOverview, charPersonality, charBackground, charAppearance, charAbilities, charStrengths, charWeaknesses, charLikes, charDislikes, charNotes,
      scenarioSetting, scenarioUserRole, scenarioSituation, scenarioDynamics, scenarioExpectations, scenarioRelationships, scenarioRules, scenarioTone
    ];
    formFields.forEach(field => { if (field) field.value = ''; });

    if (id) {
      const comp = await window.ForgeDB.getComponent(id);
      if (comp) {
        compNameInput.value = comp.name;
        compContentInput.value = comp.content;
        compCategorySelect.value = comp.category;
        compLineageInput.value = comp.lineage || '';
        compScenariosInput.value = (comp.scenarios || []).join(', ');
        compIsTemplateCheck.checked = comp.isTemplate === true;
        btnCreateVariant.style.display = comp.isTemplate ? 'inline-flex' : 'none';
        compTagsInput.value = (comp.tags || []).join(', ');
        updateTokenCount();
      }
    }

    if (compCategorySelect.value === 'character' || compCategorySelect.value === 'scenario') {
      editorTabsContainer.style.display = 'flex';
      switchEditorTab('form');
    }

    showView('editor-view');
    editorIsDirty = false;  // fresh open — nothing changed yet
  }

  async function saveComponentForm() {
    // Sync structured tab fields to compContentInput if form is active
    if (activeEditorTab === 'form') {
      if (compCategorySelect.value === 'character') {
        const sections = {
          overview: charOverview.value,
          personality: charPersonality.value,
          background: charBackground.value,
          appearance: charAppearance.value,
          abilities: charAbilities.value,
          strengths: charStrengths.value,
          weaknesses: charWeaknesses.value,
          likes: charLikes.value,
          dislikes: charDislikes.value,
          notes: charNotes.value
        };
        const stitched = stitchCharacterMarkdown(sections);
        if (stitched.trim()) {
          compContentInput.value = stitched;
        }
      } else if (compCategorySelect.value === 'scenario') {
        const sections = {
          setting: scenarioSetting.value,
          userRole: scenarioUserRole.value,
          situation: scenarioSituation.value,
          dynamics: scenarioDynamics.value,
          expectations: scenarioExpectations.value,
          relationships: scenarioRelationships.value,
          rules: scenarioRules.value,
          tone: scenarioTone.value
        };
        const stitched = stitchScenarioMarkdown(sections);
        if (stitched.trim()) {
          compContentInput.value = stitched;
        }
      }
    }

    const name = compNameInput.value.trim();
    const content = compContentInput.value.trim();
    if (!name || !content) {
      showToast('Name and Content are required fields.', 'error');
      return;
    }

    const tags = compTagsInput.value.split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const scenarios = compScenariosInput.value.split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const record = {
      id: editingComponentId,
      name,
      content,
      category: compCategorySelect.value,
      lineage: compLineageInput.value.trim(),
      scenarios,
      isTemplate: compIsTemplateCheck.checked,
      tags
    };

    try {
      await window.ForgeDB.saveComponent(record);
      editorIsDirty = false;  // saved — clear dirty flag
      showToast(`Component "${name}" saved!`, 'success');
      showView('welcome-view');
      refreshVaultList();
    } catch (err) {
      console.error(err);
      showToast('Failed to save component', 'error');
    }
  }

  async function createComponentVariant() {
    if (!editingComponentId) return;

    // Get current template state from editor form
    const originalName = compNameInput.value.trim();
    let originalLineage = compLineageInput.value.trim();

    // Auto-fallback lineage to template name if blank
    if (!originalLineage) {
      originalLineage = originalName;
      compLineageInput.value = originalLineage;
      // Auto-save the template's lineage change silently
      const templateComp = await window.ForgeDB.getComponent(editingComponentId);
      if (templateComp) {
        templateComp.lineage = originalLineage;
        await window.ForgeDB.saveComponent(templateComp);
      }
    }

    // Prompts
    const variantName = prompt('Enter Variant Name:', `${originalName} (Scenario Variant)`);
    if (!variantName) return; // User cancelled

    const defaultScenarios = compScenariosInput.value.trim();
    const variantScenariosStr = prompt('Enter Scenarios (comma-separated):', defaultScenarios);
    if (variantScenariosStr === null) return; // User cancelled

    // Sync form content first
    const category = compCategorySelect.value;
    if (activeEditorTab === 'form') {
      if (category === 'character') {
        const sections = {
          overview: charOverview.value,
          personality: charPersonality.value,
          background: charBackground.value,
          appearance: charAppearance.value,
          abilities: charAbilities.value,
          strengths: charStrengths.value,
          weaknesses: charWeaknesses.value,
          likes: charLikes.value,
          dislikes: charDislikes.value,
          notes: charNotes.value
        };
        compContentInput.value = stitchCharacterMarkdown(sections);
      } else if (category === 'scenario') {
        const sections = {
          setting: scenarioSetting.value,
          userRole: scenarioUserRole.value,
          situation: scenarioSituation.value,
          dynamics: scenarioDynamics.value,
          expectations: scenarioExpectations.value,
          relationships: scenarioRelationships.value,
          rules: scenarioRules.value,
          tone: scenarioTone.value
        };
        compContentInput.value = stitchScenarioMarkdown(sections);
      }
    }

    const content = compContentInput.value.trim();
    const tags = compTagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    const scenarios = variantScenariosStr.split(',').map(s => s.trim()).filter(Boolean);

    const variantRecord = {
      name: variantName.trim(),
      content,
      category,
      lineage: originalLineage,
      scenarios,
      isTemplate: false,
      tags
    };

    try {
      const savedVariant = await window.ForgeDB.saveComponent(variantRecord);
      showToast(`Variant "${variantName}" created!`, 'success');
      
      // Open the new variant in editor
      await openComponentEditor(savedVariant.id);
      
      // Focus target field
      if (category === 'character') {
        if (charNotes) {
          charNotes.focus({ preventScroll: true });
          const grid = charNotes.closest('.form-grid');
          if (grid) grid.scrollTop = grid.scrollHeight;
        }
      } else if (category === 'scenario') {
        if (scenarioTone) {
          scenarioTone.focus({ preventScroll: true });
          const grid = scenarioTone.closest('.form-grid');
          if (grid) grid.scrollTop = grid.scrollHeight;
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to create variant component.', 'error');
    }
  }

  async function deleteComponentForm() {
    if (!editingComponentId) return;
    const confirmed = confirm('Are you sure you want to delete this component from the Vault?');
    if (!confirmed) return;

    try {
      await window.ForgeDB.deleteComponent(editingComponentId);
      showToast('Component deleted', 'success');
      showView('welcome-view');
      refreshVaultList();
    } catch (err) {
      console.error(err);
      showToast('Deletion failed', 'error');
    }
  }

  function updateTokenCount() {
    const text = compContentInput.value;
    const tokens = Math.round(text.length / 4);
    editorTokenCount.textContent = tokens;
  }

  // --- Drag & Drop Card Imports ---

  function initDragAndDrop() {
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      mainCanvas.addEventListener(evt, preventDefaults, false);
      dropZone.addEventListener(evt, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(evt => {
      mainCanvas.addEventListener(evt, () => dropZone.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(evt => {
      mainCanvas.addEventListener(evt, () => dropZone.classList.remove('drag-over'), false);
    });

    mainCanvas.addEventListener('drop', handleFileDrop, false);
  }

  function handleFileDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleImportFiles(files);
  }

  async function handleImportFiles(files) {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const extension = file.name.split('.').pop().toLowerCase();

    if (!['json', 'png'].includes(extension)) {
      showToast('Unsupported file type. Please upload a .json or .png card.', 'error');
      return;
    }

    showToast(`Parsing card: ${file.name}...`, 'info');

    try {
      let cardJSON = null;

      if (extension === 'json') {
        const text = await file.text();
        cardJSON = JSON.parse(text);
      } else {
        cardJSON = await window.PNGHandler.extract(file);
      }

      if (!cardJSON) {
        showToast('Failed to find character metadata in file. Is this a valid SillyTavern PNG Card?', 'error');
        return;
      }

      const data = cardJSON.data || cardJSON;
      if (!data.name && !data.description) {
        showToast('Card lacks standard character fields (name or description).', 'error');
        return;
      }

      // Start breakout wizard!
      window.BreakoutWizard.start(cardJSON, file.name, file);

    } catch (err) {
      console.error(err);
      showToast(`Parse failed: ${err.message}`, 'error');
    }
  }

  // --- API Configuration ---

  function openApiModal() {
    const config = window.ForgeLLM.getConfig();
    apiProvider.value = config.provider;
    apiModel.value = config.model;
    apiKey.value = config.apiKey || '';
    apiUrl.value = config.baseUrl || '';

    toggleApiUrlGroup();
    modalOverlay.classList.remove('hidden');
  }

  function toggleApiUrlGroup() {
    const provider = apiProvider.value;
    if (['chutes', 'lmstudio', 'custom'].includes(provider)) {
      apiUrlGroup.style.display = 'block';
      if (provider === 'chutes' && !apiUrl.value.trim()) {
        apiUrl.value = 'https://llm.chutes.ai/v1';
      }
    } else {
      apiUrlGroup.style.display = 'none';
    }
  }

  function saveApiConfig() {
    const config = {
      provider: apiProvider.value,
      model: apiModel.value.trim(),
      apiKey: apiKey.value.trim(),
      baseUrl: apiUrl.value.trim(),
      maxTokens: 2048
    };

    window.ForgeLLM.saveConfig(config);
    showToast('API Configuration saved!', 'success');
    modalOverlay.classList.add('hidden');
  }

  // --- Vault Backup & Restore ---

  async function handleExportVault() {
    try {
      const bundle = await window.ForgeDB.exportVault();
      const json   = JSON.stringify(bundle, null, 2);
      const blob   = new Blob([json], { type: 'application/json' });
      const url    = URL.createObjectURL(blob);
      const date   = new Date().toISOString().slice(0, 10);
      const a      = document.createElement('a');
      a.href       = url;
      a.download   = `anansi-forge-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const total = (bundle.components?.length || 0) + (bundle.projects?.length || 0) + (bundle.personas?.length || 0);
      showToast(`Vault exported — ${total} records saved.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  async function handleRestoreVault(file) {
    try {
      const text   = await file.text();
      const bundle = JSON.parse(text);
      const total  = (bundle.components?.length || 0) + (bundle.projects?.length || 0) + (bundle.personas?.length || 0);
      const ok = confirm(`This will merge ${total} records from "${file.name}" into your Vault. Existing items with the same ID will be overwritten. Continue?`);
      if (!ok) return;
      await window.ForgeDB.importVault(bundle);
      showToast(`Vault restored — ${total} records imported.`, 'success');
      refreshVaultList();
      refreshProjectsList();
    } catch (err) {
      console.error(err);
      showToast('Restore failed: ' + err.message, 'error');
    }
  }

  // --- API Test Connection ---

  async function testApiConnection() {
    const btn = document.getElementById('btn-test-api');
    const origText = btn.textContent;
    btn.textContent = 'Testing…';
    btn.disabled = true;

    const config = {
      provider: apiProvider.value,
      model:    apiModel.value.trim(),
      apiKey:   apiKey.value.trim(),
      baseUrl:  apiUrl.value.trim(),
      maxTokens: 16
    };

    // Save temporarily so ForgeLLM can use it
    window.ForgeLLM.saveConfig(config);

    try {
      const reply = await window.ForgeLLM.generate(
        'You are a test assistant.',
        [{ role: 'user', content: 'Reply with exactly the word "OK".' }]
      );
      showToast(`✅ Connection OK — model replied: "${reply.substring(0, 60)}"`, 'success');
    } catch (err) {
      showToast(`❌ Connection failed: ${err.message}`, 'error');
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  // --- Character Profile Parse / Stitch Helpers ---

  function parseCharacterMarkdown(markdown) {
    const sections = {
      overview: '',
      personality: '',
      background: '',
      appearance: '',
      abilities: '',
      strengths: '',
      weaknesses: '',
      likes: '',
      dislikes: '',
      notes: ''
    };

    if (!markdown) return sections;

    const lines = markdown.split('\n');
    let currentKey = 'overview';
    let buffer = [];

    const headerMap = {
      'overview': 'overview',
      'personality': 'personality',
      'core personality': 'personality',
      'interaction style': 'personality',
      'emotional core': 'personality',
      'normal behavior': 'personality',
      'background': 'background',
      'biography': 'background',
      'history': 'background',
      'appearance': 'appearance',
      'abilities': 'abilities',
      'abilities / equipment': 'abilities',
      'equipment': 'abilities',
      'fighting style': 'abilities',
      'strengths': 'strengths',
      'weaknesses': 'weaknesses',
      'likes': 'likes',
      'dislikes': 'dislikes',
      'notes': 'notes',
      'notes / system instructions': 'notes',
      'scenario notes': 'notes',
      'relationships': 'notes'
    };

    const sectionWords = ['overview', 'personality', 'background', 'appearance', 'abilities', 'strengths', 'weaknesses', 'likes', 'dislikes', 'notes'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const headerMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
      const boldMatch = trimmed.match(/^\*\*([^*:]+):?\*\*$/);
      const isPlainHeader = sectionWords.includes(trimmed.toLowerCase());

      let foundKey = null;

      if (headerMatch) {
        const title = headerMatch[1].toLowerCase().trim();
        foundKey = headerMap[title] || Object.keys(headerMap).find(k => title.includes(k) && headerMap[k]);
      } else if (boldMatch) {
        const title = boldMatch[1].toLowerCase().trim();
        foundKey = headerMap[title] || Object.keys(headerMap).find(k => title.includes(k) && headerMap[k]);
      } else if (isPlainHeader) {
        foundKey = trimmed.toLowerCase();
      }

      if (foundKey) {
        if (buffer.length > 0) {
          sections[currentKey] = (sections[currentKey] ? sections[currentKey] + '\n' : '') + buffer.join('\n').trim();
          buffer = [];
        }
        currentKey = headerMap[foundKey];
      } else {
        buffer.push(line);
      }
    }

    if (buffer.length > 0) {
      sections[currentKey] = (sections[currentKey] ? sections[currentKey] + '\n' : '') + buffer.join('\n').trim();
    }

    return sections;
  }

  function stitchCharacterMarkdown(sections) {
    const parts = [];
    
    if (sections.overview?.trim()) {
      parts.push(`## Overview\n\n${sections.overview.trim()}`);
    }
    if (sections.personality?.trim()) {
      parts.push(`## Personality\n\n${sections.personality.trim()}`);
    }
    if (sections.background?.trim()) {
      parts.push(`## Background\n\n${sections.background.trim()}`);
    }
    if (sections.appearance?.trim()) {
      parts.push(`## Appearance\n\n${sections.appearance.trim()}`);
    }
    if (sections.abilities?.trim()) {
      parts.push(`## Abilities\n\n${sections.abilities.trim()}`);
    }
    
    const listFields = [
      { key: 'strengths', label: 'Strengths' },
      { key: 'weaknesses', label: 'Weaknesses' },
      { key: 'likes', label: 'Likes' },
      { key: 'dislikes', label: 'Dislikes' },
      { key: 'notes', label: 'Notes' }
    ];

    listFields.forEach(f => {
      const val = sections[f.key]?.trim();
      if (val) {
        parts.push(`## ${f.label}\n\n${val}`);
      }
    });

    return parts.join('\n\n');
  }

  function parseScenarioMarkdown(markdown) {
    const sections = {
      setting: '',
      userRole: '',
      situation: '',
      dynamics: '',
      expectations: '',
      relationships: '',
      rules: '',
      tone: ''
    };

    if (!markdown) return sections;

    const lines = markdown.split('\n');
    let currentKey = 'setting';
    let buffer = [];

    const headerMap = {
      'setting': 'setting',
      'the world': 'setting',
      'user role': 'userRole',
      '{{user}} role': 'userRole',
      'player role': 'userRole',
      'opening situation': 'situation',
      'situation': 'situation',
      'group dynamic': 'dynamics',
      'group dynamics': 'dynamics',
      'team dynamics': 'dynamics',
      'story expectations': 'expectations',
      'expectations': 'expectations',
      'relationship progression': 'relationships',
      'relationships': 'relationships',
      'scenario rules': 'rules',
      'rules': 'rules',
      'tone': 'tone',
      'atmosphere': 'tone'
    };

    const sectionWords = ['setting', 'userRole', 'situation', 'dynamics', 'expectations', 'relationships', 'rules', 'tone'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const headerMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
      const boldMatch = trimmed.match(/^\*\*([^*:]+):?\*\*$/);
      const isPlainHeader = sectionWords.includes(trimmed.toLowerCase());

      let foundKey = null;

      if (headerMatch) {
        const title = headerMatch[1].toLowerCase().trim();
        foundKey = headerMap[title] || Object.keys(headerMap).find(k => title.includes(k) && headerMap[k]);
      } else if (boldMatch) {
        const title = boldMatch[1].toLowerCase().trim();
        foundKey = headerMap[title] || Object.keys(headerMap).find(k => title.includes(k) && headerMap[k]);
      } else if (isPlainHeader) {
        foundKey = trimmed.toLowerCase();
      }

      if (foundKey) {
        if (buffer.length > 0) {
          sections[currentKey] = (sections[currentKey] ? sections[currentKey] + '\n' : '') + buffer.join('\n').trim();
          buffer = [];
        }
        currentKey = headerMap[foundKey];
      } else {
        buffer.push(line);
      }
    }

    if (buffer.length > 0) {
      sections[currentKey] = (sections[currentKey] ? sections[currentKey] + '\n' : '') + buffer.join('\n').trim();
    }

    return sections;
  }

  function stitchScenarioMarkdown(sections) {
    const parts = [];
    const fields = [
      { key: 'setting', label: 'Setting' },
      { key: 'userRole', label: '{{User}} Role' },
      { key: 'situation', label: 'Opening Situation' },
      { key: 'dynamics', label: 'Group Dynamic' },
      { key: 'expectations', label: 'Story Expectations' },
      { key: 'relationships', label: 'Relationship Progression' },
      { key: 'rules', label: 'Scenario Rules' },
      { key: 'tone', label: 'Tone' }
    ];

    fields.forEach(f => {
      const val = sections[f.key]?.trim();
      if (val) {
        parts.push(`## ${f.label}\n\n${val}`);
      }
    });

    return parts.join('\n\n');
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

  // --- Boot ---

  async function init() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    await window.ForgeDB.initDB();

    window.BreakoutWizard.init();
    window.ProjectAssembler.init();
    window.ParlorWizard.init();
    window.SandboxPlaytest.init();

    // Main UI Events
    document.getElementById('btn-new-component').addEventListener('click', () => openComponentEditor(null));
    document.getElementById('btn-welcome-new').addEventListener('click', () => openComponentEditor(null));
    btnSaveComponent.addEventListener('click', saveComponentForm);
    btnDeleteComponent.addEventListener('click', deleteComponentForm);
    btnCreateVariant.addEventListener('click', createComponentVariant);
    compIsTemplateCheck.addEventListener('change', () => {
      btnCreateVariant.style.display = (compIsTemplateCheck.checked && editingComponentId) ? 'inline-flex' : 'none';
    });
    compContentInput.addEventListener('input', updateTokenCount);

    // Editor Tab Buttons events
    tabEditorForm.addEventListener('click', () => switchEditorTab('form'));
    tabEditorRaw.addEventListener('click', () => switchEditorTab('raw'));

    // Dynamic tabs toggle on Category dropdown change
    compCategorySelect.addEventListener('change', () => {
      editorIsDirty = true;
      const cat = compCategorySelect.value;
      if (cat === 'character' || cat === 'scenario') {
        editorTabsContainer.style.display = 'flex';
        switchEditorTab('form');
      } else {
        editorTabsContainer.style.display = 'none';
        switchEditorTab('raw');
      }
    });

    // Mark editor dirty on any field change
    const editorInputs = [
      compNameInput, compContentInput, compCategorySelect, compLineageInput, compScenariosInput, compIsTemplateCheck, compTagsInput,
      charOverview, charPersonality, charBackground, charAppearance, charAbilities,
      charStrengths, charWeaknesses, charLikes, charDislikes, charNotes,
      scenarioSetting, scenarioUserRole, scenarioSituation, scenarioDynamics, scenarioExpectations, scenarioRelationships, scenarioRules, scenarioTone
    ];
    editorInputs.forEach(el => {
      if (el) {
        el.addEventListener('input', () => { editorIsDirty = true; });
        el.addEventListener('change', () => { editorIsDirty = true; });
      }
    });

    // Sidebar tabs triggers
    tabVault.addEventListener('click', () => switchSidebarTab('vault'));
    tabProjects.addEventListener('click', () => switchSidebarTab('projects'));

    // Sidebar search and filters
    searchInput.addEventListener('input', () => {
      if (activeSidebarTab === 'vault') refreshVaultList();
      else refreshProjectsList();
    });
    filterCat.addEventListener('change', refreshVaultList);
    filterLineage.addEventListener('change', refreshVaultList);
    filterScenario.addEventListener('change', refreshVaultList);
    filterSort.addEventListener('change', refreshVaultList);
    btnTemplatesOnly.addEventListener('click', () => {
      showTemplatesOnly = !showTemplatesOnly;
      btnTemplatesOnly.classList.toggle('active', showTemplatesOnly);
      refreshVaultList();
    });

    // API Config events
    btnApiConfig.addEventListener('click', openApiModal);
    btnCloseModal.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    apiProvider.addEventListener('change', toggleApiUrlGroup);
    btnSaveApi.addEventListener('click', saveApiConfig);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
    });

    // Vault Backup / Restore
    document.getElementById('btn-export-vault').addEventListener('click', handleExportVault);
    document.getElementById('btn-import-vault').addEventListener('click', () => {
      vaultRestoreInput.value = '';
      vaultRestoreInput.click();
    });
    vaultRestoreInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleRestoreVault(e.target.files[0]);
    });

    // API Test Connection
    document.getElementById('btn-test-api').addEventListener('click', testApiConnection);

    // Import click browse
    btnImportCard.addEventListener('click', () => {
      fileImportInput.value = '';
      fileImportInput.click();
    });
    fileImportInput.addEventListener('change', (e) => {
      handleImportFiles(e.target.files);
    });

    // Drag-and-drop
    initDragAndDrop();

    // Welcome Parlor
    document.getElementById('btn-welcome-parlor').addEventListener('click', () => window.ParlorWizard.start());
    document.getElementById('btn-parlor-start').addEventListener('click', () => window.ParlorWizard.start());

    // Navigation Back buttons
    btnEditorBack.addEventListener('click', () => {
      if (editorIsDirty) {
        const leave = confirm('You have unsaved changes. Leave without saving?');
        if (!leave) return;
      }
      editorIsDirty = false;
      showView('welcome-view');
    });
    btnBreakoutBack.addEventListener('click', () => showView('welcome-view'));
    btnAssemblerBack.addEventListener('click', () => showView('welcome-view'));
    btnSandboxBack.addEventListener('click', () => {
      if (activeSidebarTab === 'projects') {
        showView('welcome-view');
        switchSidebarTab('projects');
      } else {
        showView('assembler-view');
      }
    });
    btnParlorBack.addEventListener('click', () => showView('welcome-view'));

    // Initial List Load
    await refreshVaultList();

    console.log('Anansi Forge fully initialized.');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
