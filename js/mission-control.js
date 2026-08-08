/**
 * mission-control.js - Anansi Forge Mission Control Dashboard
 *
 * Lightweight orchestrator delegating state, charts, modals, and tab rendering
 * to specialized sub-modules in js/mission_control/.
 */

(() => {
  const getS = () => window.MissionControlState;
  const getModals = () => window.MissionControlModals;
  const getTabs = () => window.MissionControlTabs;

  // ─── Data Loaders ─────────────────────────────────────────────────────────────

  async function loadAll() {
    if (getS()) {
      await getS().loadAll();
    }
  }

  // ─── Import Tool Handlers ─────────────────────────────────────────────────────

  let importData = null;

  async function handleImportFile(file) {
    const S = getS();
    if (!S) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importData = data;

      const chars = data.characters || [];
      const scenarios = data.scenarios || [];
      const stories = data.stories || [];

      const allComps = S.state.allComponents;
      const compByName = {};
      allComps.forEach(c => { compByName[c.name.toLowerCase()] = c; });

      let matched = 0, stubs = 0;
      chars.forEach(row => { compByName[row.name?.toLowerCase()] ? matched++ : stubs++; });
      scenarios.forEach(row => { compByName[row.name?.toLowerCase()] ? matched++ : stubs++; });

      const preview = document.getElementById('mc-import-preview');
      const confirmBtn = document.getElementById('mc-import-confirm');
      preview.style.display = 'block';
      preview.innerHTML = `<div class="mc-import-summary">
        <div class="mc-import-stat"><strong>${chars.length + scenarios.length + stories.length}</strong> total rows found</div>
        <div class="mc-import-stat mc-import-stat--match"><strong>${matched}</strong> matched to existing vault items → will update tracking data</div>
        <div class="mc-import-stat mc-import-stat--stub"><strong>${stubs}</strong> unmatched → will become Concept Stubs</div>
      </div>`;
      confirmBtn.style.display = 'block';
      confirmBtn.textContent = `✓ Import ${chars.length + scenarios.length + stories.length} Records`;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Failed to parse JSON file: ' + e.message, 'error');
    }
  }

  async function executeImport() {
    const S = getS();
    if (!importData || !S) return;

    const allComps = S.state.allComponents;
    const compByName = {};
    allComps.forEach(c => { compByName[c.name.toLowerCase()] = c; });

    const mapPipeline = (row, category) => {
      if (category === 'character' || category === 'scenario' || category === 'organization') {
        return {
          generated: !!row.generated, goldenTemplate: !!row.goldenTemplate,
          test1: !!row.test1, trimmed: !!row.trimmed, test2: !!row.test2,
          complete: !!row.complete, published: !!row.published
        };
      }
      return window.ForgeDB.defaultTrackerPipeline(category);
    };

    let updated = 0, created = 0;

    const processRows = async (rows, category) => {
      for (const row of rows) {
        if (!row.name) continue;
        const existing = compByName[row.name.toLowerCase()];
        if (existing) {
          await window.ForgeDB.updateVaultTracker(existing.id, {
            universe: row.universe || existing.tracker?.universe || '',
            project: row.project || existing.tracker?.project || '',
            priority: row.priority || existing.tracker?.priority || null,
            pipeline: mapPipeline(row, category)
          });
          updated++;
        } else {
          await window.ForgeDB.saveTrackerRecord({
            assetType: 'concept_stub',
            name: row.name,
            universe: row.universe || '',
            project: row.project || '',
            priority: row.priority || null,
            intendedCategory: category,
            pipeline: window.ForgeDB.defaultTrackerPipeline(category),
            tags: []
          });
          created++;
        }
      }
    };

    await processRows(importData.characters || [], 'character');
    await processRows(importData.scenarios || [], 'scenario');
    await processRows(importData.stories || [], 'story');

    await loadAll();
    renderCurrentTab();
    if (typeof showToast === 'function') showToast(`Import complete: ${updated} vault items updated, ${created} concept stubs created.`, 'success');
    importData = null;
    document.getElementById('mc-import-preview').style.display = 'none';
    document.getElementById('mc-import-confirm').style.display = 'none';
  }

  // ─── Event Delegation ─────────────────────────────────────────────────────────

  function bindEvents(container) {
    if (container._mcEventsBound) return;
    container._mcEventsBound = true;
    const S = getS();
    const M = getModals();

    container.addEventListener('click', async (e) => {
      const t = e.target;
      const state = S ? S.state : {};

      // Manage Universes
      if (t.id === 'btn-mc-manage-universes' || t.closest('#btn-mc-manage-universes')) {
        M?.openUniverseManagerModal();
        return;
      }

      // Story Status filter pill
      const statusPill = t.closest('.mc-story-status-pill');
      if (statusPill) {
        state.storyStatusFilter = statusPill.dataset.status;
        await renderCurrentTab();
        return;
      }

      // Spawn release from story
      const spawnBtn = t.closest('.mc-spawn-release');
      if (spawnBtn) {
        const storyId = spawnBtn.dataset.storyId;
        await M?.spawnReleaseFromStory(storyId);
        return;
      }

      // Create Project from story
      const createProjBtn = t.closest('.mc-create-project-from-story');
      if (createProjBtn) {
        const storyId = createProjBtn.dataset.storyId;
        if (storyId && window.ProjectAssembler?.createFromStory) {
          window.ProjectAssembler.createFromStory(storyId);
        }
        return;
      }

      // Open Bot Performance Analytics Modal
      const analyticsBtn = t.closest('.mc-open-bot-analytics');
      if (analyticsBtn) {
        const recordId = analyticsBtn.dataset.recordId;
        if (recordId) M?.openBotAnalyticsModal(recordId);
        return;
      }

      // Export Story Brief
      const exportBriefBtn = t.closest('.mc-export-story-brief');
      if (exportBriefBtn) {
        M?.exportStoryBrief(exportBriefBtn.dataset.storyId);
        return;
      }

      // Close Modal helper
      const closeModalBtn = t.closest('.mc-close-modal');
      if (closeModalBtn) {
        M?.closeModal();
        return;
      }

      // Open Story Hub Modal
      const hubBtn = t.closest('.mc-open-story-hub');
      if (hubBtn) {
        const storyId = hubBtn.dataset.storyId;
        M?.openStoryHubModal(storyId);
        return;
      }

      // Open Link Vault Modal
      const linkModalBtn = t.closest('.mc-open-link-vault-modal');
      if (linkModalBtn) {
        const storyId = linkModalBtn.dataset.storyId;
        M?.openLinkVaultModal(storyId);
        return;
      }

      // Link item in Link Vault Modal
      const linkItemBtn = t.closest('.mc-link-vault-item');
      if (linkItemBtn) {
        const storyId = linkItemBtn.dataset.storyId;
        const compId = linkItemBtn.dataset.compId;
        const story = state.allTrackerRecords.find(r => r.id === storyId);
        if (story) {
          const updatedIds = Array.from(new Set([...(story.linkedVaultIds || []), compId]));
          await window.ForgeDB.saveTrackerRecord({ ...story, linkedVaultIds: updatedIds });
          await loadAll();
          M?.openLinkVaultModal(storyId);
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast('Vault asset linked to Story!', 'success');
        }
        return;
      }

      // Unlink item in Link Vault Modal
      const unlinkItemBtn = t.closest('.mc-unlink-vault-item');
      if (unlinkItemBtn) {
        const storyId = unlinkItemBtn.dataset.storyId;
        const compId = unlinkItemBtn.dataset.compId;
        const story = state.allTrackerRecords.find(r => r.id === storyId);
        if (story) {
          const updatedIds = (story.linkedVaultIds || []).filter(id => id !== compId);
          await window.ForgeDB.saveTrackerRecord({ ...story, linkedVaultIds: updatedIds });
          await loadAll();
          M?.openLinkVaultModal(storyId);
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast('Vault asset unlinked.', 'info');
        }
        return;
      }

      // Open Character Voice Rapid Interview Tester
      const interviewBtn = t.closest('.mc-open-interview');
      if (interviewBtn) {
        const charId = interviewBtn.dataset.charId;
        const charName = interviewBtn.dataset.name;
        if (window.MissionControlInterviewModal) {
          window.MissionControlInterviewModal.openModal(charId, charName);
        }
        return;
      }

      // Open Quick Asset Creator Modal
      const quickAssetBtn = t.closest('.mc-quick-add-asset');
      if (quickAssetBtn) {
        const cat = quickAssetBtn.dataset.cat || 'character';
        M?.openQuickAssetModal(cat);
        return;
      }

      // Submit Quick Asset
      if (t.id === 'mc-btn-submit-quick-asset' || t.closest('#mc-btn-submit-quick-asset')) {
        const btn = t.id === 'mc-btn-submit-quick-asset' ? t : t.closest('#mc-btn-submit-quick-asset');
        const cat = btn.dataset.cat || 'character';
        await M?.submitQuickAsset(cat);
        return;
      }

      // Promote stub to story
      if (t.matches('.mc-promote-stub-story')) {
        await M?.promoteStubToStory(t.dataset.stubId);
        return;
      }

      // Archive / Reactivate story toggle
      if (t.matches('.mc-toggle-story-archive')) {
        const storyId = t.dataset.storyId;
        const story = state.allTrackerRecords.find(r => r.id === storyId);
        if (story) {
          const newStatus = story.status === 'Archived' ? 'Active' : 'Archived';
          await window.ForgeDB.saveTrackerRecord({ ...story, status: newStatus });
          await loadAll();
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast(`Story status set to ${newStatus}.`, 'info');
        }
        return;
      }

      // Archive / Reactivate release toggle
      if (t.matches('.mc-toggle-release-archive')) {
        const releaseId = t.dataset.releaseId;
        const release = state.allTrackerRecords.find(r => r.id === releaseId);
        if (release) {
          const newStatus = release.status === 'Archived' ? 'Active' : 'Archived';
          await window.ForgeDB.saveTrackerRecord({ ...release, status: newStatus });
          await loadAll();
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast(`Release status set to ${newStatus}.`, 'info');
        }
        return;
      }

      // Unlink asset in Story Hub Modal
      if (t.matches('.mc-hub-unlink-asset')) {
        const storyId = t.dataset.storyId;
        const compId = t.dataset.compId;
        const story = state.allTrackerRecords.find(r => r.id === storyId);
        if (story) {
          const updatedIds = (story.linkedVaultIds || []).filter(id => id !== compId);
          await window.ForgeDB.saveTrackerRecord({ ...story, linkedVaultIds: updatedIds });
          await loadAll();
          M?.openStoryHubModal(storyId);
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast('Vault asset unlinked from Story.', 'info');
        }
        return;
      }

      // Open Quick Metrics Snapshot Modal
      const quickMetricsBtn = t.closest('.mc-open-quick-metrics');
      if (quickMetricsBtn) {
        const recordId = quickMetricsBtn.dataset.recordId || null;
        M?.openQuickMetricsModal(recordId);
        return;
      }

      // Submit Metric Snapshot
      if (t.id === 'mc-btn-submit-snapshot' || t.closest('#mc-btn-submit-snapshot')) {
        const btn = t.id === 'mc-btn-submit-snapshot' ? t : t.closest('#mc-btn-submit-snapshot');
        const botId = btn.dataset.botId;
        if (botId) await M?.submitMetricSnapshot(botId);
        return;
      }

      // Sub-tab switching
      const subtabBtn = t.closest('.mc-subtab');
      if (subtabBtn) {
        state.activeSubTab = subtabBtn.dataset.subtab;
        state.activeTagFilter = '';
        state.selectedIds.clear();
        state.currentPage = 1;
        await renderCurrentTab();
        return;
      }

      // Overview Universe Category filter pill
      const uniPill = t.closest('.mc-overview-uni-pill');
      if (uniPill) {
        if (!state.overviewFilters) state.overviewFilters = {};
        state.overviewFilters.universeCat = uniPill.dataset.cat;
        await renderCurrentTab();
        return;
      }

      // Clickable Tag Chip filter
      const tagChip = t.closest('.mc-tag-chip');
      if (tagChip && tagChip.dataset.tag) {
        state.filters.tag = tagChip.dataset.tag;
        state.currentPage = 1;
        await renderCurrentTab();
        if (typeof showToast === 'function') showToast(`Filtering by tag #${tagChip.dataset.tag}`, 'info');
        return;
      }

      // Clear Tag Filter
      if (t.matches('.mc-clear-tag-filter')) {
        state.filters.tag = '';
        state.currentPage = 1;
        await renderCurrentTab();
        if (typeof showToast === 'function') showToast('Tag filter cleared.', 'info');
        return;
      }

      // Portfolio cumulative chart metric pill
      const portPill = t.closest('.mc-portfolio-pill');
      if (portPill) {
        state.portfolioChartMetric = portPill.dataset.metric;
        await renderCurrentTab();
        return;
      }

      // Series filter pill (Metrics tab)
      const seriesPill = t.closest('.mc-series-filter-pill');
      if (seriesPill) {
        state.metricsSeriesFilter = seriesPill.dataset.seriesFilter || 'all';
        await renderCurrentTab();
        return;
      }

      // Leaderboard sort pill
      const lbPill = t.closest('.mc-leaderboard-pill');
      if (lbPill) {
        state.leaderboardSort = lbPill.dataset.sort;
        await renderCurrentTab();
        return;
      }

      // Token Count inline edit — click on the dashed span
      const tokenCell = t.closest('.mc-token-count-cell');
      if (tokenCell && t.classList.contains('mc-token-display')) {
        const recId = tokenCell.dataset.recordId;
        const rec = state.allTrackerRecords.find(r => r.id === recId);
        if (!rec) return;
        const currentVal = rec.tokenCount || '';
        tokenCell.innerHTML = `<input type="number" class="mc-token-input" value="${currentVal}"
          min="0" step="1" style="width:72px; font-size:0.82rem; text-align:center;
          background:var(--bg-tertiary); border:1px solid var(--accent); border-radius:4px;
          color:var(--text-primary); padding:2px 4px;" autocomplete="off"
          data-1p-ignore="true" data-lpignore="true" data-bwignore="true">`;
        const inp = tokenCell.querySelector('.mc-token-input');
        inp.focus();
        inp.select();

        const save = async () => {
          const v = parseInt(inp.value, 10);
          const newVal = isNaN(v) || v <= 0 ? null : v;
          rec.tokenCount = newVal;
          await window.ForgeDB.saveTrackerRecord(rec);
          tokenCell.innerHTML = `<span class="mc-token-display" title="Click to set token count"
            style="cursor:pointer; font-size:0.82rem; color:${newVal ? 'var(--text-primary)' : 'var(--text-muted)'};
            padding:2px 6px; border-radius:4px; display:inline-block; min-width:32px; text-align:center;
            border:1px dashed ${newVal ? 'var(--border-color)' : 'rgba(148,163,184,0.3)'}; transition:border-color 0.15s;">
            ${newVal ? newVal.toLocaleString() : '—'}</span>`;
        };

        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
          if (ev.key === 'Escape') {
            tokenCell.innerHTML = `<span class="mc-token-display" title="Click to set token count"
              style="cursor:pointer; font-size:0.82rem; color:${currentVal ? 'var(--text-primary)' : 'var(--text-muted)'};
              padding:2px 6px; border-radius:4px; display:inline-block; min-width:32px; text-align:center;
              border:1px dashed ${currentVal ? 'var(--border-color)' : 'rgba(148,163,184,0.3)'}; transition:border-color 0.15s;">
              ${currentVal ? parseInt(currentVal).toLocaleString() : '—'}</span>`;
          }
        });
        return;
      }

      // Overview Role / Faction mode pill
      const rolePill = t.closest('.mc-overview-role-pill');
      if (rolePill) {
        if (!state.overviewFilters) state.overviewFilters = {};
        state.overviewFilters.roleMode = rolePill.dataset.mode;
        await renderCurrentTab();
        return;
      }

      // Bulk checkbox toggle
      if (t.matches('.mc-bulk-check')) {
        const id = t.dataset.id;
        if (t.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        await renderCurrentTab();
        return;
      }

      // Select All on page
      if (t.id === 'mc-bulk-select-all') {
        const checks = container.querySelectorAll('.mc-bulk-check');
        checks.forEach(chk => {
          if (t.checked) state.selectedIds.add(chk.dataset.id);
          else state.selectedIds.delete(chk.dataset.id);
        });
        await renderCurrentTab();
        return;
      }

      // Bulk deselect
      if (t.id === 'mc-bulk-deselect') {
        state.selectedIds.clear();
        await renderCurrentTab();
        return;
      }

      // Bulk pin / unpin
      if (t.id === 'mc-bulk-pin' || t.id === 'mc-bulk-unpin') {
        const pinVal = t.id === 'mc-bulk-pin';
        const promises = [];
        for (const id of state.selectedIds) {
          const comp = state.compMap.get(id);
          if (comp) {
            if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
            comp.tracker.pinned = pinVal;
            promises.push(window.ForgeDB.updateVaultTracker(id, { pinned: pinVal }, false));
          }
        }
        await Promise.all(promises);
        state.selectedIds.clear();
        if (typeof showToast === 'function') showToast(`${promises.length} items ${pinVal ? 'pinned' : 'unpinned'}`, 'success');
        await renderCurrentTab();
        return;
      }

      // Pin toggle (single item)
      if (t.matches('.mc-pin-toggle')) {
        const id = t.dataset.id;
        const comp = state.compMap.get(id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          const newVal = !comp.tracker.pinned;
          comp.tracker.pinned = newVal;
          await window.ForgeDB.updateVaultTracker(id, { pinned: newVal }, false);
          await renderCurrentTab();
        }
        return;
      }

      // Sort toggle
      if (t.closest('#mc-sort-toggle')) {
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        await renderCurrentTab();
        return;
      }

      // Priority group toggle
      if (t.closest('#mc-group-priority')) {
        state.groupByPriority = !state.groupByPriority;
        await renderCurrentTab();
        return;
      }

      // Tag chip filter
      if (t.matches('.mc-tag-chip') && !t.id === 'mc-clear-tag') {
        state.activeTagFilter = t.dataset.tag === state.activeTagFilter ? '' : t.dataset.tag;
        await renderCurrentTab();
        return;
      }
      if (t.id === 'mc-clear-tag') {
        state.activeTagFilter = '';
        await renderCurrentTab();
        return;
      }

      // Pipeline checkbox toggle (vault)
      if (t.matches('.mc-pipe-btn') && !t.disabled) {
        const id = t.dataset.id;
        const step = t.dataset.step;
        const store = t.dataset.store;
        if (store === 'vault') {
          const comp = state.allComponents.find(c => c.id === id);
          if (!comp) return;
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          if (!comp.tracker.pipeline) comp.tracker.pipeline = window.ForgeDB.defaultTrackerPipeline(comp.category);

          comp.tracker.pipeline[step] = !comp.tracker.pipeline[step];

          t.classList.toggle('checked', comp.tracker.pipeline[step]);
          t.textContent = comp.tracker.pipeline[step] ? '✓' : '';

          const row = t.closest('.mc-row');
          if (row) {
            const readinessEl = row.querySelector('.mc-cell-readiness');
            if (readinessEl) readinessEl.innerHTML = S.readinessPct(S.calcReadinessForVault(comp));
          }

          window.ForgeDB.updateVaultTracker(id, { pipeline: comp.tracker.pipeline });
        } else {
          const rec = state.allTrackerRecords.find(r => r.id === id);
          if (!rec) return;
          if (!rec.pipeline) rec.pipeline = {};

          rec.pipeline[step] = !rec.pipeline[step];

          t.classList.toggle('checked', rec.pipeline[step]);
          t.textContent = rec.pipeline[step] ? '✓' : '';

          const row = t.closest('.mc-row');
          if (row) {
            const readinessEl = row.querySelector('.mc-cell-readiness');
            if (readinessEl) readinessEl.innerHTML = S.readinessPct(S.calcReadinessForRecord(rec));
          }

          window.ForgeDB.saveTrackerRecord({ ...rec });
        }
        return;
      }

      // Open in Vault
      if (t.matches('.mc-name-link[data-vault-id]') || t.matches('.mc-action-btn[data-vault-id]')) {
        const id = t.dataset.vaultId;
        if (window.ForgeAppBridge?.openEditor) window.ForgeAppBridge.openEditor(id);
        return;
      }

      // Inline editable text field (e.g. Project)
      if (t.matches('.mc-editable')) {
        const id = t.dataset.id;
        const field = t.dataset.field;
        const store = t.dataset.store;
        const currentVal = t.textContent === '—' ? '' : t.textContent.trim();

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mc-modal-input';
        input.style.cssText = 'padding:2px 6px; font-size:0.8rem; height:24px; width:110px; display:inline-block;';
        input.value = currentVal;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('data-1p-ignore', 'true');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-bwignore', 'true');

        t.replaceWith(input);
        input.focus();
        input.select();

        let saved = false;
        const commitEdit = async () => {
          if (saved) return;
          saved = true;
          const newVal = input.value.trim();

          const span = document.createElement('span');
          span.className = 'mc-editable';
          span.dataset.field = field;
          span.dataset.id = id;
          span.dataset.store = store;
          span.title = 'Click to edit';
          span.textContent = newVal || '—';

          input.replaceWith(span);

          if (store === 'vault') {
            const comp = state.allComponents.find(c => c.id === id);
            if (comp) {
              if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
              comp.tracker[field] = newVal;
            }
            window.ForgeDB.updateVaultTracker(id, { [field]: newVal });
          } else {
            const rec = state.allTrackerRecords.find(r => r.id === id);
            if (rec) {
              rec[field] = newVal;
              window.ForgeDB.saveTrackerRecord(rec);
            }
          }
        };

        input.addEventListener('blur', commitEdit);
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') { input.blur(); }
          if (ke.key === 'Escape') {
            saved = true;
            const span = document.createElement('span');
            span.className = 'mc-editable';
            span.dataset.field = field;
            span.dataset.id = id;
            span.dataset.store = store;
            span.title = 'Click to edit';
            span.textContent = currentVal || '—';
            input.replaceWith(span);
          }
        });
        return;
      }

      // Open in Assembler
      if (t.closest('.mc-open-assembler')) {
        const projId = t.closest('[data-project-id]')?.dataset.projectId || t.dataset.projectId;
        if (projId && window.ProjectAssembler?.open) window.ProjectAssembler.open(projId);
        return;
      }

      // Playtest in Sandbox
      if (t.closest('.mc-open-sandbox')) {
        const projId = t.closest('[data-project-id]')?.dataset.projectId || t.dataset.projectId;
        if (projId && window.SandboxPlaytest?.start) window.SandboxPlaytest.start(projId);
        return;
      }

      // Edit tracker record
      if (t.closest('.mc-edit-record')) {
        const id = t.closest('[data-record-id]')?.dataset.recordId || t.dataset.recordId;
        const rec = state.allTrackerRecords.find(r => r.id === id);
        if (rec) M?.openRecordModal(rec, rec.assetType);
        return;
      }

      // Delete tracker record
      if (t.matches('.mc-delete-record')) {
        const id = t.dataset.recordId;
        if (confirm('Delete this record?')) {
          await window.ForgeDB.deleteTrackerRecord(id);
          await loadAll();
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast('Record deleted.', 'info');
        }
        return;
      }

      // Pagination buttons
      if (t.id === 'mc-pag-prev' && state.currentPage > 1) {
        state.currentPage--;
        await renderCurrentTab();
        return;
      }
      if (t.id === 'mc-pag-next') {
        state.currentPage++;
        await renderCurrentTab();
        return;
      }

      // Add concept stub — single
      if (t.id === 'mc-add-stub' || t.id === 'mc-add-stub-single') {
        document.getElementById('mc-stub-dropdown')?.setAttribute('style', 'display:none; position:absolute; top:calc(100% + 4px); right:0; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md); min-width:160px; z-index:500; box-shadow:0 8px 24px rgba(0,0,0,0.4); overflow:hidden;');
        M?.openStubModal();
        return;
      }

      // Add concept stub — caret dropdown toggle
      if (t.id === 'mc-add-stub-caret') {
        const dd = document.getElementById('mc-stub-dropdown');
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        return;
      }

      // Add concept stubs — cast (bulk)
      if (t.id === 'mc-add-stub-cast') {
        document.getElementById('mc-stub-dropdown')?.setAttribute('style', 'display:none; position:absolute; top:calc(100% + 4px); right:0; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md); min-width:160px; z-index:500; box-shadow:0 8px 24px rgba(0,0,0,0.4); overflow:hidden;');
        M?.openCastModal();
        return;
      }

      // Add tracker record
      if (t.id === 'mc-add-record') { M?.openRecordModal(null, t.dataset.type); return; }

      // Build stub → vault
      if (t.matches('.mc-build-btn')) {
        M?.promoteStub(t.dataset.stubId);
        return;
      }

      // Delete stub
      if (t.matches('.mc-delete-stub-btn')) {
        if (confirm('Remove this concept stub?')) {
          await window.ForgeDB.deleteTrackerRecord(t.dataset.stubId);
          await loadAll();
          await renderCurrentTab();
        }
        return;
      }

      // Modal save
      if (t.id === 'mc-modal-save') { await M?.saveModalRecord(); return; }
      if (t.id === 'mc-modal-cancel') { M?.closeModal(); return; }

      // Calendar nav
      if (t.id === 'mc-cal-prev') { state.calendarWeekOffset--; await renderCurrentTab(); return; }
      if (t.id === 'mc-cal-next') { state.calendarWeekOffset++; await renderCurrentTab(); return; }

      // Import browse
      if (t.id === 'mc-import-browse') {
        document.getElementById('mc-import-file-input')?.click();
        return;
      }
      if (t.id === 'mc-import-confirm') { await executeImport(); return; }

      // Import dropzone click
      if (t.closest('#mc-import-dropzone') && !t.id) {
        document.getElementById('mc-import-file-input')?.click();
        return;
      }
    });

    // Filter inputs + live derived field
    let searchDebounceTimer = null;
    container.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'mc-search') {
        state.filters.search = t.value;
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          renderCurrentTab();
        }, 120);
      }
      if (t.id === 'mc-rec-unique-chats' || t.id === 'mc-rec-messages') {
        const msgs = parseInt(document.getElementById('mc-rec-messages')?.value) || 0;
        const chats = parseInt(document.getElementById('mc-rec-unique-chats')?.value) || 0;
        const el = document.getElementById('mc-derived-mpc');
        if (el) el.textContent = chats > 0 ? (msgs / chats).toFixed(2) : '—';
      }
    });

    container.addEventListener('change', async (e) => {
      const t = e.target;

      if (t.matches('.mc-hub-add-vault')) {
        const storyId = t.dataset.storyId;
        const compId = t.value;
        if (storyId && compId) {
          const story = state.allTrackerRecords.find(r => r.id === storyId);
          if (story) {
            const updatedIds = Array.from(new Set([...(story.linkedVaultIds || []), compId]));
            await window.ForgeDB.saveTrackerRecord({ ...story, linkedVaultIds: updatedIds });
            await loadAll();
            M?.openStoryHubModal(storyId);
            await renderCurrentTab();
            if (typeof showToast === 'function') showToast('Vault asset linked to Story!', 'success');
          }
        }
        return;
      }

      if (t.id === 'mc-pag-size-select') {
        state.pageSize = t.value === 'all' ? 'all' : parseInt(t.value, 10);
        state.currentPage = 1;
        await renderCurrentTab();
        return;
      }

      if (t.id === 'mc-bulk-universe') {
        const uniVal = t.value;
        if (!uniVal) return;
        const promises = [];
        for (const id of state.selectedIds) {
          const comp = state.compMap.get(id);
          if (comp) {
            if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
            comp.tracker.universe = uniVal;
            promises.push(window.ForgeDB.updateVaultTracker(id, { universe: uniVal }));
          }
        }
        await Promise.all(promises);
        state.selectedIds.clear();
        if (typeof showToast === 'function') showToast(`Universe set to ${uniVal} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      if (t.id === 'mc-bulk-priority') {
        const prioVal = t.value === '__clear__' ? null : t.value;
        if (t.value === '') return;
        const promises = [];
        for (const id of state.selectedIds) {
          const comp = state.compMap.get(id);
          if (comp) {
            if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
            comp.tracker.priority = prioVal;
            promises.push(window.ForgeDB.updateVaultTracker(id, { priority: prioVal }));
          }
        }
        await Promise.all(promises);
        state.selectedIds.clear();
        if (typeof showToast === 'function') showToast(`Priority ${prioVal ? 'set to ' + prioVal : 'cleared'} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      const uniSelect = t.id === 'mc-filter-universe' ? t : t.closest('#mc-filter-universe');
      if (uniSelect) { state.filters.universe = uniSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      const prioSelect = t.id === 'mc-filter-priority' ? t : t.closest('#mc-filter-priority');
      if (prioSelect) { state.filters.priority = prioSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      const roleSelect = t.id === 'mc-filter-role' ? t : t.closest('#mc-filter-role');
      if (roleSelect) { state.filters.role = roleSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      const seriesSelect = t.id === 'mc-filter-series' ? t : t.closest('#mc-filter-series');
      if (seriesSelect) { state.filters.series = seriesSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      if (t.id === 'mc-bulk-role') {
        const roleVal = t.value;
        if (!roleVal) return;
        const promises = [];
        for (const id of state.selectedIds) {
          const comp = state.compMap.get(id);
          if (comp) {
            if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
            comp.tracker.role = roleVal;
            promises.push(window.ForgeDB.updateVaultTracker(id, { role: roleVal }));
          }
        }
        await Promise.all(promises);
        state.selectedIds.clear();
        if (typeof showToast === 'function') showToast(`Role set to ${roleVal} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      if (t.matches('.mc-role-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.role = t.value || '';

          const row = t.closest('.mc-row');
          if (row) {
            const roleTd = row.children[3];
            if (roleTd) roleTd.innerHTML = S.roleBadge(t.value);
          }

          window.ForgeDB.updateVaultTracker(t.dataset.id, { role: t.value });
        }
        return;
      }

      if (t.matches('.mc-priority-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.priority = t.value || null;
          window.ForgeDB.updateVaultTracker(t.dataset.id, { priority: t.value || null });
        }
        return;
      }

      if (t.matches('.mc-universe-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.universe = t.value || '';

          const row = t.closest('.mc-row');
          if (row) {
            const uniTd = row.children[2];
            if (uniTd) uniTd.innerHTML = S.universeBadge(t.value);
            row.dataset.universe = S.esc(t.value || '');
          }

          window.ForgeDB.updateVaultTracker(t.dataset.id, { universe: t.value });
        }
        return;
      }

      if (t.matches('.mc-vis-select')) {
        const rec = state.allTrackerRecords.find(r => r.id === t.dataset.id);
        if (rec) {
          const newVis = t.value || null;
          const updated = { ...rec, visibility: newVis };
          if (newVis === 'Private' && !updated.privateLaunchDate) {
            updated.privateLaunchDate = new Date().toISOString();
          }
          await window.ForgeDB.saveTrackerRecord(updated);
          await loadAll();
          await renderCurrentTab();
          if (typeof showToast === 'function') showToast(`Visibility set to ${newVis || 'None'}${newVis === 'Private' ? ' (Private Build Test stamped)' : ''}`, 'info');
        }
        return;
      }

      if (t.matches('.mc-date-input')) {
        const rec = state.allTrackerRecords.find(r => r.id === t.dataset.id);
        if (rec) {
          await window.ForgeDB.saveTrackerRecord({ ...rec, scheduledDate: t.value || null });
          if (window.ForgeDB?.logActivity) {
            const isPub = S.isReleasePublished({ ...rec, scheduledDate: t.value || null });
            window.ForgeDB.logActivity({
              action: isPub ? 'published' : 'scheduled',
              targetType: 'release',
              targetId: rec.id,
              targetName: rec.name,
              details: t.value || 'cleared'
            }).catch(e => console.error(e));
          }
          await loadAll();
        }
        return;
      }

      if (t.id === 'mc-import-file-input' && t.files[0]) {
        await handleImportFile(t.files[0]);
        return;
      }
    });

    const dzEl = () => container.querySelector('#mc-import-dropzone');
    container.addEventListener('dragover', (e) => { if (dzEl() && dzEl().contains(e.target)) { e.preventDefault(); dzEl().classList.add('drag-over'); } });
    container.addEventListener('dragleave', () => { dzEl()?.classList.remove('drag-over'); });
    container.addEventListener('drop', async (e) => {
      const dz = dzEl();
      if (!dz || !dz.contains(e.target)) return;
      e.preventDefault();
      dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.json')) await handleImportFile(file);
    });
  }

  // ─── Main Render ──────────────────────────────────────────────────────────────

  const CAT_FOR_TAB = {
    characters: 'character', scenarios: 'scenario',
    bios: 'bio', messages: 'initial_message', orgs: 'organization'
  };

  async function renderCurrentTab() {
    const view = document.getElementById('mission-control-view');
    if (!view) return;

    let contentEl = document.getElementById('mc-content');
    if (!contentEl) {
      await init();
      return;
    }

    const S = getS();
    const Tabs = getTabs();

    // Re-render subtab bar
    const subtabEl = document.getElementById('mc-subtab-bar');
    if (subtabEl && S) subtabEl.innerHTML = S.subTabBar().replace('<div class="mc-subtab-bar">', '').replace('</div>', '');

    const tab = S ? S.state.activeSubTab : 'overview';
    let html = '';

    try {
      if (tab === 'overview' && Tabs?.renderOverview) {
        html = await Tabs.renderOverview();
      } else if (CAT_FOR_TAB[tab] && Tabs?.renderAssetTab) {
        html = Tabs.renderAssetTab(CAT_FOR_TAB[tab]);
      } else if (tab === 'stories' && Tabs?.renderStoriesTab) {
        html = Tabs.renderStoriesTab();
      } else if (tab === 'launchpad' && Tabs?.renderLaunchPad) {
        html = Tabs.renderLaunchPad();
      } else if (tab === 'metrics' && Tabs?.renderMetrics) {
        html = Tabs.renderMetrics();
      } else if (tab === 'import' && Tabs?.renderImportTab) {
        html = Tabs.renderImportTab();
      }
    } catch (err) {
      console.error('Error rendering Mission Control tab:', err);
      html = `<div style="padding:30px; text-align:center; color:var(--danger);">
        <h4>Error loading tab "${tab}"</h4>
        <p style="font-size:0.8rem; color:var(--text-muted);">${S ? S.esc(err.message) : err.message}</p>
      </div>`;
    }

    const activeEl = document.activeElement;
    const isSearchFocused = activeEl && activeEl.id === 'mc-search';
    const selectionStart = isSearchFocused ? activeEl.selectionStart : 0;
    const selectionEnd = isSearchFocused ? activeEl.selectionEnd : 0;

    contentEl.innerHTML = html;

    if (isSearchFocused) {
      const searchEl = document.getElementById('mc-search');
      if (searchEl) {
        searchEl.focus();
        try { searchEl.setSelectionRange(selectionStart, selectionEnd); } catch (e) { }
      }
    }

    view.querySelectorAll('.mc-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subtab === tab);
    });
  }

  function bindGlobalListeners() {
    if (window._mcEscapeBound) return;
    window._mcEscapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('mc-modal-overlay');
        if (modal && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
        }
        const dd = document.getElementById('mc-stub-dropdown');
        if (dd) dd.style.display = 'none';
      }
    });

    document.addEventListener('click', (e) => {
      const dd = document.getElementById('mc-stub-dropdown');
      if (dd && !e.target.closest('#mc-add-stub-caret') && !e.target.closest('#mc-stub-dropdown')) {
        dd.style.display = 'none';
      }
      if (e.target && e.target.closest('#mc-archived-toggle')) {
        const S = getS();
        if (S) S.state.archivedExpanded = !S.state.archivedExpanded;
        renderCurrentTab();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'mc-include-archived-cb') {
        const S = getS();
        if (S) S.state.includeArchived = e.target.checked;
        renderCurrentTab();
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    await loadAll();

    const view = document.getElementById('mission-control-view');
    if (!view) return;

    const S = getS();

    view.innerHTML = `
      <div class="mc-layout">
        <div id="mc-subtab-bar" class="mc-subtab-bar">
          ${S ? S.subTabBar().replace('<div class="mc-subtab-bar">', '').replace('</div>', '') : ''}
        </div>
        <div id="mc-content" class="mc-content"></div>
      </div>

      <!--Record Edit Modal-->
      <div id="mc-modal-overlay" class="modal-overlay hidden">
        <div class="modal" style="max-width:520px; width:92%;">
          <div class="modal-header">
            <h3 id="mc-modal-title">Edit Record</h3>
            <button id="mc-modal-cancel" class="btn btn-ghost btn-icon">&times;</button>
          </div>
          <div class="modal-body" id="mc-modal-body"></div>
          <div class="modal-footer">
            <button id="mc-modal-cancel2" class="btn btn-secondary">Cancel</button>
            <button id="mc-modal-save" class="btn btn-primary">Save</button>
          </div>
        </div>
      </div>`;

    view.addEventListener('click', (e) => {
      if (e.target.id === 'mc-modal-cancel2') getModals()?.closeModal();
    });

    bindGlobalListeners();
    bindEvents(view);
    await renderCurrentTab();
  }

  async function openNewReleaseForProject(proj) {
    if (!proj) return;
    const S = getS();
    const M = getModals();
    if (S) S.state.activeSubTab = 'launchpad';
    await renderCurrentTab();

    const pipeline = window.ForgeDB.defaultTrackerPipeline('release');
    const compIds = proj.componentIds || [];
    if (compIds.length > 0 && S) {
      const comps = S.state.allComponents.filter(c => compIds.includes(c.id));
      if (comps.some(c => c.category === 'bio')) pipeline.bio = true;
      if (comps.some(c => c.category === 'scenario')) pipeline.scenario = true;
      if (comps.some(c => c.category === 'initial_message')) pipeline.initialMessage = true;
    }

    const rec = {
      assetType: 'release',
      name: proj.name || 'New Release',
      projectId: proj.id,
      universe: '',
      project: proj.name || '',
      priority: null,
      tags: [],
      notes: '',
      pipeline
    };

    M?.openRecordModal(rec, 'release');
  }

  function exportCompleteBackup() {
    return getModals()?.exportCompleteBackup ? getModals().exportCompleteBackup() : Promise.resolve();
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  window.MissionControl = {
    init,
    renderCurrentTab,
    loadAll,
    openNewReleaseForProject,
    openUniverseManagerModal: () => getModals()?.openUniverseManagerModal(),
    openStoryHubModal: (id) => getModals()?.openStoryHubModal(id),
    openLinkVaultModal: (id) => getModals()?.openLinkVaultModal(id),
    openQuickMetricsModal: (id) => getModals()?.openQuickMetricsModal(id),
    submitMetricSnapshot: (id) => getModals()?.submitMetricSnapshot(id),
    exportCompleteBackup
  };

})();
