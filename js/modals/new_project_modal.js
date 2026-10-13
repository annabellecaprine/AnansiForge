/**
 * new_project_modal.js - Anansi Forge Ad-hoc Project Creation from Mission Control
 *
 * Opened from the vault bulk-action bar ("🤖 New Project (N)"). Shows the
 * selected cast grouped by category (with field mapping and optional Delphi
 * verdict chips), lets the user name the project, then delegates creation to
 * window.ProjectAssembler.createFromSelection(ids, name).
 *
 * Usage:
 *   window.NewProjectModal.open(['id1', 'id2', ...]);
 */

(() => {
  'use strict';

  let modalEl = null;
  let currentIds = [];
  let busy = false;

  // Category presentation: display label (cast section) + MC tab label (subtitle).
  const CATEGORY_META = {
    character:       { icon: '👤', label: 'Characters', tab: 'Characters' },
    organization:    { icon: '🏢', label: 'Organizations', tab: 'Orgs' },
    scenario:        { icon: '🎭', label: 'Scenarios', tab: 'Scenarios' },
    bio:             { icon: '📋', label: 'Bios', tab: 'Bios' },
    initial_message: { icon: '💬', label: 'Init Msgs', tab: 'Init Msgs' },
    setting:         { icon: '🌍', label: 'Settings', tab: 'Settings' },
    rules:           { icon: '📜', label: 'Rules', tab: 'Rules' }
  };

  // Categories that show an informational "none selected" gap row when empty.
  const GAP_CATEGORIES = ['character', 'scenario', 'bio', 'initial_message'];

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function metaFor(category) {
    return CATEGORY_META[category] || { icon: '📄', label: String(category || 'Other'), tab: String(category || 'Other') };
  }

  function mappingFor(category) {
    if (window.ProjectAssembler?.mappingForCategory) return window.ProjectAssembler.mappingForCategory(category);
    return 'personality';
  }

  function orderComps(comps) {
    if (window.ProjectAssembler?.orderComponentsForProject) return window.ProjectAssembler.orderComponentsForProject(comps);
    return comps;
  }

  // Resolve selected ids to component records, preferring MC state, falling
  // back to the DB for any id not found there.
  async function resolveComponents(ids) {
    const map = window.MissionControlState?.state?.compMap;
    const found = new Map();
    for (const id of ids) {
      const c = map?.get(id);
      if (c) found.set(id, c);
    }
    if (found.size < ids.length && window.ForgeDB?.getAllComponents) {
      try {
        const all = await window.ForgeDB.getAllComponents();
        for (const c of all) {
          if (ids.includes(c.id) && !found.has(c.id)) found.set(c.id, c);
        }
      } catch (err) {
        console.warn('[NewProjectModal] DB fallback lookup failed', err);
      }
    }
    return ids.map(id => found.get(id)).filter(Boolean);
  }

  function delphiVerdict(comp) {
    const v = comp && comp.delphi && comp.delphi.verdict;
    return typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null;
  }

  function delphiChipHTML(comp) {
    const verdict = delphiVerdict(comp);
    if (!verdict) return '<span class="np-delphi-chip np-delphi-none" title="No Delphi verdict yet">🔮 —</span>';
    let cls = 'np-delphi-none';
    if (verdict === 'READY') cls = 'np-delphi-ready';
    else if (verdict === 'NEEDS WORK') cls = 'np-delphi-warn';
    else if (verdict === 'FAIL') cls = 'np-delphi-fail';
    return `<span class="np-delphi-chip ${cls}" title="Delphi verdict">🔮 ${escapeHTML(verdict)}</span>`;
  }

  function mostCommonProject(comps) {
    const counts = new Map();
    for (const c of comps) {
      const p = c.tracker && typeof c.tracker.project === 'string' ? c.tracker.project.trim() : '';
      if (p) counts.set(p, (counts.get(p) || 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [p, n] of counts) {
      if (n > bestCount) { best = p; bestCount = n; }
    }
    return best;
  }

  function ensureModalDOM() {
    if (document.getElementById('new-project-modal-overlay')) {
      modalEl = document.getElementById('new-project-modal-overlay');
      return;
    }

    modalEl = document.createElement('div');
    modalEl.id = 'new-project-modal-overlay';
    modalEl.className = 'modal-overlay hidden';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = `
      <div class="modal" style="max-width: 640px; width: 92%; max-height: 88vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color);">
          <div>
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              🤖 New Project from Selection
            </h3>
            <span id="new-project-modal-subtitle" style="font-size: 0.78rem; color: var(--text-muted);"></span>
          </div>
          <button id="btn-close-new-project-modal" class="btn btn-ghost btn-icon" style="font-size: 1.2rem; cursor: pointer;" title="Close">&times;</button>
        </div>

        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label for="new-project-name-input" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">Project name</label>
            <input type="text" id="new-project-name-input" class="mc-modal-input" style="width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 8px 12px;" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
          </div>
          <div id="new-project-cast" class="np-cast"></div>
          <div id="new-project-delphi-warning" class="np-delphi-warning" style="display: none;"></div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-color);">
          <button id="btn-new-project-cancel" class="btn btn-ghost">Cancel</button>
          <button id="btn-new-project-create" class="btn btn-primary">🤖 Create &amp; Open in Assembler</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    modalEl.querySelector('#btn-close-new-project-modal').addEventListener('click', closeModal);
    modalEl.querySelector('#btn-new-project-cancel').addEventListener('click', closeModal);
    modalEl.querySelector('#btn-new-project-create').addEventListener('click', handleCreate);
    modalEl.querySelector('#new-project-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('hidden')) closeModal();
    });
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add('hidden');
  }

  function renderCast(ordered) {
    const byCat = new Map();
    for (const c of ordered) {
      const key = c.category || 'other';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(c);
    }

    // Rank order: known categories in spec order, then any others alphabetically.
    const knownOrder = ['character', 'organization', 'scenario', 'bio', 'initial_message', 'setting', 'rules'];
    const otherCats = [...byCat.keys()].filter(k => !knownOrder.includes(k)).sort();
    const sections = [];

    for (const cat of [...knownOrder, ...otherCats]) {
      const rows = byCat.get(cat);
      const meta = metaFor(cat);
      if (!rows) {
        if (GAP_CATEGORIES.includes(cat)) {
          sections.push(`
            <div class="np-cast-group">
              <div class="np-cast-group-title">${meta.icon} ${escapeHTML(meta.label)} (0)</div>
              <div class="np-cast-gap">none selected</div>
            </div>`);
        }
        continue;
      }
      const rowsHTML = rows.map(c => `
        <div class="np-cast-row">
          <span class="np-cast-name" title="${escapeHTML(c.name)}">${escapeHTML(c.name || 'Untitled')}</span>
          ${delphiChipHTML(c)}
          <span class="np-cast-map">→ ${escapeHTML(mappingFor(c.category))}</span>
        </div>`).join('');
      sections.push(`
        <div class="np-cast-group">
          <div class="np-cast-group-title">${meta.icon} ${escapeHTML(meta.label)} (${rows.length})</div>
          ${rowsHTML}
        </div>`);
    }
    return sections.join('');
  }

  async function open(ids) {
    const uniqueIds = [...new Set(ids || [])];
    if (!uniqueIds.length) return;

    const comps = await resolveComponents(uniqueIds);
    if (!comps.length) {
      if (typeof showToast === 'function') showToast('Selected components could not be found in the Vault.', 'error');
      return;
    }

    ensureModalDOM();
    busy = false;

    const ordered = orderComps(comps);
    currentIds = ordered.map(c => c.id);

    // Subtitle: N components across distinct tab labels (in rank order).
    const tabs = [];
    for (const c of ordered) {
      const t = metaFor(c.category).tab;
      if (!tabs.includes(t)) tabs.push(t);
    }
    modalEl.querySelector('#new-project-modal-subtitle').textContent =
      `${ordered.length} component${ordered.length === 1 ? '' : 's'} selected across ${tabs.join(', ')}`;

    modalEl.querySelector('#new-project-name-input').value = mostCommonProject(ordered) || 'New Project';
    modalEl.querySelector('#new-project-cast').innerHTML = renderCast(ordered);

    const flagged = ordered.filter(c => {
      const v = delphiVerdict(c);
      return v === 'NEEDS WORK' || v === 'FAIL';
    }).length;
    const warnEl = modalEl.querySelector('#new-project-delphi-warning');
    if (flagged > 0) {
      warnEl.textContent = `⚠️ ${flagged} selected component${flagged === 1 ? '' : 's'} carry Delphi flags — they'll show in the assembler's Delphi block.`;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }

    const createBtn = modalEl.querySelector('#btn-new-project-create');
    createBtn.disabled = false;

    modalEl.classList.remove('hidden');
    const nameInput = modalEl.querySelector('#new-project-name-input');
    nameInput.focus();
    nameInput.select();
  }

  async function handleCreate() {
    if (busy || !currentIds.length) return;
    busy = true;
    const createBtn = modalEl.querySelector('#btn-new-project-create');
    createBtn.disabled = true;

    const name = modalEl.querySelector('#new-project-name-input').value.trim();
    try {
      // Close first so the modal never lingers over the Assembler; the
      // selection is only cleared once the project has actually been created.
      closeModal();
      const record = await window.ProjectAssembler.createFromSelection(currentIds, name);
      if (record) {
        window.MissionControlState?.state?.selectedIds?.clear();
      }
    } catch (err) {
      console.error('[NewProjectModal] Create failed', err);
      if (typeof showToast === 'function') showToast('Failed to create project: ' + err.message, 'error');
    } finally {
      busy = false;
      createBtn.disabled = false;
    }
  }

  window.NewProjectModal = { open };
})();
