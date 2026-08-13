/**
 * universe_genre_modal.js - Anansi Forge Universe & Genre Manager Modal
 * Full CRUD for Universe assets including content editor with template support.
 */

(() => {
  'use strict';

  const UNIVERSE_TEMPLATE = `Universe Name: [Name]

Overview:
[Brief summary of what this universe IS — the core concept in 2-3 sentences.]

Core Assumptions:
[What is always true in this reality? List the foundational rules.]
- 
- 
- 

Continuity Decisions:
[Which canon events, timelines, or versions apply? What's been adjusted or merged?]
- 
- 

World Rules:
[How does the world WORK? Physics, magic, tech, powers, society norms.]
- 
- 
- 

Tone and Story Logic:
[What kind of stories belong here? What's the emotional texture?]
- 
- 

Presentation Guidance:
[How should the AI write within this universe? Style, vocabulary, pacing.]
- 
- 

Avoid / Do Not Assume:
[What should the AI never do or assume within this universe?]
- 
- 

Notes:
[Any additional context, exceptions, or reminders.]
`;

  let activeUniverseId = null;
  let universesList = [];

  // DOM refs
  const modalEl = () => document.getElementById('mc-universe-manager-modal');
  const listContainer = () => document.getElementById('universe-list-container');
  const editForm = () => document.getElementById('universe-edit-form');
  const editEmpty = () => document.getElementById('universe-edit-empty');

  const nameInput = () => document.getElementById('universe-edit-name');
  const genreInput = () => document.getElementById('universe-edit-genre');
  const colorInput = () => document.getElementById('universe-edit-color');
  const contentArea = () => document.getElementById('universe-edit-content');

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadUniverses() {
    if (window.ForgeDB?.getAllUniverses) {
      universesList = await window.ForgeDB.getAllUniverses();
    }
  }

  function renderList() {
    const container = listContainer();
    if (!container) return;
    container.innerHTML = '';

    // Group by genre
    const grouped = {};
    universesList.forEach(u => {
      const g = u.genre || 'General';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(u);
    });

    Object.keys(grouped).sort().forEach(genre => {
      const header = document.createElement('div');
      header.style.cssText = 'font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:12px 0 4px 0; padding-bottom:2px; border-bottom:1px solid rgba(255,255,255,0.06);';
      header.textContent = genre;
      container.appendChild(header);

      grouped[genre].forEach(u => {
        const item = document.createElement('div');
        item.className = 'universe-list-item' + (u.id === activeUniverseId ? ' active' : '');
        const hasContent = u.content && u.content.trim().length > 0;
        item.innerHTML = `
          <span class="universe-list-dot" style="background:${u.color || '#6b7280'};"></span>
          <span class="universe-list-name">${escapeHTML(u.name)}</span>
          ${hasContent ? '<span class="universe-content-badge" title="Has universe rules defined">📄</span>' : ''}
        `;
        item.addEventListener('click', () => selectUniverse(u.id));
        container.appendChild(item);
      });
    });
  }

  function selectUniverse(id) {
    activeUniverseId = id;
    const uni = universesList.find(u => u.id === id);
    if (!uni) return;

    editEmpty().style.display = 'none';
    editForm().style.display = 'block';

    nameInput().value = uni.name || '';
    genreInput().value = uni.genre || '';
    colorInput().value = uni.color || '#6b7280';
    contentArea().value = uni.content || '';

    // Show/hide delete button based on whether it's a custom universe
    const deleteBtn = document.getElementById('btn-universe-delete');
    if (deleteBtn) {
      deleteBtn.style.display = uni.isCustom ? 'inline-flex' : 'inline-flex'; // Allow deleting any
    }

    renderList(); // Update active highlight
  }

  async function saveUniverse() {
    const name = nameInput().value.trim();
    if (!name) {
      if (window.showToast) window.showToast('Universe name is required.', 'error');
      return;
    }

    const record = {
      id: activeUniverseId,
      name: name,
      genre: genreInput().value.trim() || 'General',
      color: colorInput().value || '#6b7280',
      content: contentArea().value,
      isCustom: true
    };

    if (window.ForgeDB?.saveUniverse) {
      const saved = await window.ForgeDB.saveUniverse(record);
      if (saved) {
        activeUniverseId = saved.id;
        await loadUniverses();
        renderList();
        if (window.showToast) window.showToast(`Universe "${name}" saved.`, 'success');
      }
    }
  }

  async function deleteUniverse() {
    if (!activeUniverseId) return;
    const uni = universesList.find(u => u.id === activeUniverseId);
    if (!uni) return;

    const confirmed = await showConfirmModal({
      title: '🗑️ Delete Universe',
      message: `Delete universe <strong>"${escapeHTML(uni.name)}"</strong>? This won't affect components already assigned to it.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!confirmed) return;

    if (window.ForgeDB?.deleteUniverse) {
      await window.ForgeDB.deleteUniverse(activeUniverseId);
      activeUniverseId = null;
      editForm().style.display = 'none';
      editEmpty().style.display = 'block';
      await loadUniverses();
      renderList();
      if (window.showToast) window.showToast(`Universe "${uni.name}" deleted.`, 'info');
    }
  }

  function addNewUniverse() {
    activeUniverseId = null;
    editEmpty().style.display = 'none';
    editForm().style.display = 'block';
    nameInput().value = '';
    genreInput().value = '';
    colorInput().value = '#6b7280';
    contentArea().value = '';
    nameInput().focus();
    renderList();
  }

  async function insertTemplate() {
    const area = contentArea();
    if (!area) return;
    const existing = area.value.trim();
    if (existing) {
      const confirmed = await showConfirmModal({
        title: '📋 Insert Template',
        message: 'This will replace the current content with the template. Continue?',
        okText: 'Replace',
        cancelText: 'Cancel'
      });
      if (!confirmed) return;
    }
    area.value = UNIVERSE_TEMPLATE;
    area.focus();
  }

  // --- Attach Events ---
  function bindEvents() {
    document.getElementById('btn-close-universe-modal')?.addEventListener('click', () => {
      modalEl()?.classList.add('hidden');
    });
    modalEl()?.addEventListener('click', (e) => {
      if (e.target === modalEl()) modalEl()?.classList.add('hidden');
    });

    document.getElementById('btn-universe-add-new')?.addEventListener('click', addNewUniverse);
    document.getElementById('btn-universe-save')?.addEventListener('click', saveUniverse);
    document.getElementById('btn-universe-delete')?.addEventListener('click', deleteUniverse);
    document.getElementById('btn-universe-insert-template')?.addEventListener('click', insertTemplate);
  }

  // Init on first open
  let initialized = false;

  const UniverseGenreModal = {
    openModal: async function () {
      if (!initialized) {
        bindEvents();
        initialized = true;
      }
      await loadUniverses();
      activeUniverseId = null;
      editForm().style.display = 'none';
      editEmpty().style.display = 'block';
      renderList();
      modalEl()?.classList.remove('hidden');
    },

    closeModal: function () {
      modalEl()?.classList.add('hidden');
    },

    // Expose for assembler to use
    getUniversesList: function () {
      return universesList;
    },

    refreshList: async function () {
      await loadUniverses();
      renderList();
    }
  };

  window.MissionControlUniverseModal = UniverseGenreModal;
})();
