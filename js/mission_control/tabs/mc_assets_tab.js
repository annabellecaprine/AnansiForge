/**
 * js/mission_control/tabs/mc_assets_tab.js
 * Anansi Forge Mission Control - Asset Pipeline Tab (vault_components)
 */

(() => {
  const getS = () => window.MissionControlState;

  function paginationHTML(totalItems) {
    const S = getS();
    if (!S) return '';
    if (S.state.pageSize === 'all' && totalItems <= 50) return '';
    const pageSize = S.state.pageSize === 'all' ? totalItems : S.state.pageSize;
    const totalPages = Math.ceil(totalItems / Math.max(pageSize, 1)) || 1;
    const curPage = Math.min(S.state.currentPage, totalPages);
    const startItem = totalItems === 0 ? 0 : (curPage - 1) * pageSize + 1;
    const endItem = Math.min(curPage * pageSize, totalItems);

    return `<div class="mc-pagination">
      <div class="mc-pag-info">Showing ${startItem}–${endItem} of ${totalItems} items</div>
      <div class="mc-pag-controls">
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-pag-prev" ${curPage <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="mc-pag-page">Page ${curPage} of ${totalPages}</span>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-pag-next" ${curPage >= totalPages ? 'disabled' : ''}>Next →</button>
        <select id="mc-pag-size-select" class="mc-filter-select" style="padding:3px 6px; font-size:0.75rem;">
          <option value="50" ${S.state.pageSize === 50 ? 'selected' : ''}>50 per page</option>
          <option value="100" ${S.state.pageSize === 100 ? 'selected' : ''}>100 per page</option>
          <option value="250" ${S.state.pageSize === 250 ? 'selected' : ''}>250 per page</option>
          <option value="all" ${S.state.pageSize === 'all' ? 'selected' : ''}>Show All</option>
        </select>
      </div>
    </div>`;
  }

  function assetRow(comp, steps) {
    const S = getS();
    const esc = S.esc;
    const tracker = comp.tracker || {};
    const score = S.calcReadinessForVault(comp);
    const tags = [...(comp.tags || []), ...(tracker.trackerTags || [])].filter(Boolean);

    const isPinned = tracker.pinned;
    const depCount = S.state.allProjects.filter(p => (p.componentIds || []).includes(comp.id)).length;
    const isSelected = S.state.selectedIds.has(comp.id);

    return `<tr class="mc-row${isPinned ? ' mc-row--pinned' : ''}${isSelected ? ' mc-row--selected' : ''}" data-id="${comp.id}" data-universe="${esc(tracker.universe || '')}">
      <td class="mc-cell-check"><input type="checkbox" class="mc-bulk-check" data-id="${comp.id}" ${isSelected ? 'checked' : ''}></td>
      <td class="mc-cell-name">
        <button class="mc-name-link" data-vault-id="${comp.id}" title="Edit in Vault">${esc(comp.name)}</button>
        ${comp.isTemplate ? '<span class="mc-template-star" title="Golden Template">⭐</span>' : ''}
        ${isPinned ? '<span class="mc-pin-icon" title="Pinned">📌</span>' : ''}
        ${depCount > 0 ? `<span class="mc-dep-badge" title="Used in ${depCount} project${depCount > 1 ? 's' : ''}">📦 ${depCount}</span>` : ''}
      </td>
      <td>${S.universeSelectBadge(tracker.universe, comp.id, 'vault')}</td>
      <td>${comp.category === 'character' || comp.category === 'organization' ? S.roleSelectBadge(tracker.role, comp.id, 'vault') : '—'}</td>
      <td class="mc-cell-project">
        <span class="mc-editable" data-field="project" data-id="${comp.id}" data-store="vault" title="Click to edit">${esc(tracker.project || '—')}</span>
      </td>
      <td>
        <select class="mc-priority-select" data-id="${comp.id}" data-store="vault">
          <option value="">—</option>
          ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}" ${tracker.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </td>
      ${S.pipelineCheckboxes(tracker.pipeline, steps, comp.id, true)}
      <td class="mc-cell-tags">${tags.slice(0, 3).map(t => S.tagChip ? S.tagChip(t, t === S.state.activeTagFilter) : `<span class="mc-tag-chip">#${esc(t)}</span>`).join('')}${tags.length > 3 ? `<span class="mc-more-tags">+${tags.length - 3}</span>` : ''}</td>
      <td class="mc-cell-readiness">${S.readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-pin-toggle" data-id="${comp.id}" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📌' : '☆'}</button>
        <button class="mc-action-btn" data-vault-id="${comp.id}" title="Open in Vault">✏️</button>
        ${comp.category === 'character' ? `<button class="mc-action-btn mc-open-interview" data-char-id="${comp.id}" data-name="${esc(comp.name)}" title="Character Voice Rapid Interview Tester">🎙️</button>` : ''}
      </td>
    </tr>`;
  }

  function stubRow(stub, steps) {
    const S = getS();
    const esc = S.esc;
    return `<tr class="mc-row mc-row--stub" data-stub-id="${stub.id}">
      <td class="mc-cell-name" colspan="2">
        <span class="mc-stub-icon">💡</span>
        <span class="mc-stub-name">${esc(stub.name)}</span>
        <span class="mc-stub-badge">Concept</span>
      </td>
      <td>${esc(stub.project || '—')}</td>
      <td>${S.priorityBadge(stub.priority)}</td>
      ${steps.map(() => '<td class="mc-pipe-cell"><button class="mc-pipe-btn" disabled title="Build first">—</button></td>').join('')}
      <td>${(stub.tags || []).map(t => S.tagChip ? S.tagChip(t) : `<span class="mc-tag-chip">#${esc(t)}</span>`).join('')}</td>
      <td>0%</td>
      <td class="mc-cell-actions">
        <button class="mc-btn mc-btn-accent mc-btn-sm mc-promote-stub-story" data-stub-id="${stub.id}" title="Promote to Story">📖 → Story</button>
        <button class="mc-btn mc-btn-secondary mc-btn-sm mc-build-btn" data-stub-id="${stub.id}" title="Build component in Vault">🗄️ → Vault</button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm mc-delete-stub-btn" data-stub-id="${stub.id}" title="Remove stub">✕</button>
      </td>
    </tr>`;
  }

  function renderAssetTab(category) {
    const S = getS();
    if (!S) return '';

    S.state.activeCategory = category;
    const steps = S.PIPELINE_STEPS[category] || S.PIPELINE_STEPS.character;

    let items = S.filterComponents(S.state.allComponents.filter(c => c.category === category));
    const stubs = S.filterTrackerRecords(
      S.state.allTrackerRecords.filter(r => r.assetType === 'concept_stub' && r.intendedCategory === category && !r.promotedToVaultId)
    );

    items = S.sortByReadiness(items, S.calcReadinessForVault, c => c.tracker?.priority, S.state.sortDir);

    const total = items.length;
    const stageCounts = {};
    steps.forEach(s => {
      stageCounts[s] = items.filter(c => c.tracker?.pipeline?.[s]).length;
    });
    const lastStep = steps[steps.length - 1];
    const publishedPct = total ? Math.round((stageCounts[lastStep] || 0) / total * 100) : 0;

    const pageSize = S.state.pageSize === 'all' ? total : S.state.pageSize;
    const totalPages = Math.ceil(total / Math.max(pageSize, 1)) || 1;
    if (S.state.currentPage > totalPages) S.state.currentPage = totalPages;
    if (S.state.currentPage < 1) S.state.currentPage = 1;

    const displayItems = S.state.pageSize === 'all' ? items : items.slice((S.state.currentPage - 1) * pageSize, S.state.currentPage * pageSize);

    let rows = '';
    if (S.state.groupByPriority) {
      ['P1', 'P2', 'P3', 'P4', null].forEach(prio => {
        const group = displayItems.filter(c => (c.tracker?.priority || null) === prio);
        if (!group.length) return;
        rows += `<tr class="mc-group-header"><td colspan="${steps.length + 7}">
          ${prio ? S.priorityBadge(prio) : '<span class="mc-badge" style="background:#6b728022;color:var(--text-muted);border:1px solid #6b728044;">No Priority</span>'}
          <span style="color:var(--text-muted); font-size:0.8rem; margin-left:6px;">${group.length} items</span>
        </td></tr>`;
        rows += group.map(c => assetRow(c, steps)).join('');
      });
    } else {
      rows = displayItems.map(c => assetRow(c, steps)).join('');
    }

    const stubRows = stubs.map(stub => stubRow(stub, steps)).join('');
    const pagHTML = paginationHTML(total);

    return `
      <div class="mc-stage-summary">
        ${steps.map(s => {
      const n = stageCounts[s] || 0;
      return `<div class="mc-stage-chip" title="${n}/${total} items at ${S.STEP_LABELS[s] || s}">
            <span>${S.STEP_LABELS[s] || s}</span><strong>${n}</strong>
          </div>`;
    }).join('')}
        <div class="mc-stage-chip mc-stage-chip--published" title="${publishedPct}% published">
          <span>Published %</span><strong>${publishedPct}%</strong>
        </div>
      </div>

      ${S.toolbarHTML(true, false)}

      <div class="mc-table-wrap">
        <table class="mc-table">
          <thead>
            <tr>
              <th class="mc-th-check"><input type="checkbox" id="mc-bulk-select-all" title="Select all on page"></th>
              <th>Name</th>
              <th>Universe</th>
              <th>Role</th>
              <th>Project</th>
              <th>Priority</th>
              ${steps.map(s => `<th class="mc-pipe-th" title="${S.STEP_LABELS[s] || s}">${S.SHORT_STEP_LABELS?.[s] || S.STEP_LABELS[s] || s}</th>`).join('')}
              <th>Tags</th>
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${stubRows}
            ${rows || `<tr><td colspan="${steps.length + 10}" class="mc-empty-state">No ${S.CATEGORY_LABELS[category] || category} tracked yet. Add a Concept to start.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pagHTML}`;
  }

  window.MissionControlTabs = window.MissionControlTabs || {};
  window.MissionControlTabs.renderAssetTab = renderAssetTab;
})();
