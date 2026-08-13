/**
 * js/mission_control/tabs/mc_stories_tab.js
 * Anansi Forge Mission Control - Stories Tab
 */

(() => {
  const getS = () => window.MissionControlState;

  function recordRow(rec, steps) {
    const S = getS();
    const esc = S.esc;
    const score = S.calcReadinessForRecord(rec);
    const linkedCompsCount = (rec.linkedVaultIds || []).length;
    const releaseCount = (rec.releaseIds || []).length;
    const isArchived = rec.status === 'Archived';

    const storyReleases = S.state.allTrackerRecords.filter(r =>
      r.assetType === 'release' && r.status !== 'Archived' && (r.sourceStoryId === rec.id || (rec.releaseIds || []).includes(r.id))
    );
    const totalMsgs = storyReleases.reduce((s, r) => s + (r.metrics?.messages || 0), 0);

    return `<tr class="mc-row ${rec.status === 'Promoted' ? 'mc-row--promoted' : ''}" data-record-id="${rec.id}" data-universe="${esc(rec.universe || '')}">
      <td class="mc-cell-name">
        <button class="mc-name-link mc-open-story-hub" data-story-id="${rec.id}" title="Open Story Creative Hub">📖 ${esc(rec.name)}</button>
        ${totalMsgs > 0 ? `<span class="mc-badge mc-trophy-badge" title="Top performer">🏆 ${totalMsgs.toLocaleString()} msgs</span>` : ''}
      </td>
      <td>${S.storyStatusSelectBadge ? S.storyStatusSelectBadge(rec.status, rec.id) : S.storyStatusBadge(rec.status)}</td>
      <td>${S.universeSelectBadge ? S.universeSelectBadge(rec.universe, rec.id, 'record') : S.universeBadge(rec.universe)}</td>
      <td>
        <button class="mc-badge-btn mc-open-story-hub" data-story-id="${rec.id}" title="View linked vault assets">
          🔗 ${linkedCompsCount} asset${linkedCompsCount === 1 ? '' : 's'}
        </button>
      </td>
      <td>
        <button class="mc-badge-btn mc-open-story-hub" data-story-id="${rec.id}" title="View spawned releases">
          🚀 ${releaseCount} release${releaseCount === 1 ? '' : 's'}
        </button>
      </td>
      <td>${S.priorityBadge(rec.priority)}</td>
      ${S.pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td class="mc-cell-readiness">${S.readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-btn-accent mc-spawn-release" data-story-id="${rec.id}" title="Spawn Release from Story">🚀 Spawn</button>
        <button class="mc-action-btn mc-btn-secondary mc-create-project-from-story" data-story-id="${rec.id}" title="Create Project in Assembler from Story">🤖 Create Project</button>
        <button class="mc-action-btn mc-open-story-hub" data-story-id="${rec.id}" title="Open Story Hub">👁️</button>
        <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit Metadata">✏️</button>
        <button class="mc-action-btn mc-toggle-story-archive" data-story-id="${rec.id}" title="${isArchived ? 'Reactivate Story' : 'Archive Story'}">${isArchived ? '🔄' : '📦'}</button>
        <button class="mc-action-btn mc-delete-record" data-record-id="${rec.id}" title="Delete">🗑</button>
      </td>
    </tr>`;
  }

  function renderStoriesTab() {
    const S = getS();
    if (!S) return '';

    const steps = S.PIPELINE_STEPS.story;
    const allStories = S.state.allTrackerRecords.filter(r => r.assetType === 'story');

    const activeCount = allStories.filter(r => (r.status || 'Active') === 'Active').length;
    const promotedCount = allStories.filter(r => r.status === 'Promoted').length;
    const archivedCount = allStories.filter(r => r.status === 'Archived').length;

    const isStoryReadyToSpawn = (s) => {
      const score = S.calcReadinessForRecord(s);
      if (score >= 0.75) return true;
      const linkedIds = s.linkedVaultIds || [];
      if (linkedIds.length >= 2) return true;
      if (s.pipeline && s.pipeline.concept && s.pipeline.initialMessage) return true;
      return false;
    };
    const readyCount = allStories.filter(isStoryReadyToSpawn).length;

    let items = S.filterTrackerRecords(allStories);
    if (S.state.storyStatusFilter !== 'all') {
      items = items.filter(r => (r.status || 'Active') === S.state.storyStatusFilter);
    }
    items = S.sortByReadiness(items, S.calcReadinessForRecord, r => r.priority, S.state.sortDir);

    const filterPill = (statusVal, label, count, icon) => {
      const isSelected = S.state.storyStatusFilter === statusVal;
      return `<button class="mc-story-status-pill ${isSelected ? 'active' : ''}" data-status="${statusVal}">
        <span>${icon} ${label}</span> <span class="mc-pill-count">${count}</span>
      </button>`;
    };

    return `
      ${S.toolbarHTML(false, true, 'story')}
      <div class="mc-story-status-bar" style="display:flex; gap:8px; margin: 12px 0; align-items:center;">
        ${filterPill('Active', 'Active', activeCount, '✏️')}
        ${filterPill('Promoted', 'Promoted', promotedCount, '🚀')}
        ${filterPill('Archived', 'Archived', archivedCount, '📦')}
        ${filterPill('all', 'All Stories', allStories.length, '📁')}
        <span style="margin-left:auto; display:inline-flex; gap:6px; align-items:center;">
          <span class="mc-badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3);" title="Ready to Spawn Criteria: Pipeline readiness >= 75%, linked Vault assets, or completed Concept & Init Msg steps.">🟢 Ready to Spawn (${readyCount})</span>
        </span>
      </div>
      <div class="mc-table-wrap">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Story / Hub</th>
              <th>Status</th>
              <th>Universe</th>
              <th>Vault Assets</th>
              <th>Releases</th>
              <th>Priority</th>
              ${steps.map(s => `<th class="mc-pipe-th" title="${S.STEP_LABELS[s] || s}">${(S.STEP_LABELS[s] || s).substring(0, 5)}</th>`).join('')}
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map(r => recordRow(r, steps)).join('') : `<tr><td colspan="${steps.length + 8}" class="mc-empty-state">No ${S.state.storyStatusFilter === 'all' ? '' : S.state.storyStatusFilter.toLowerCase()} stories found.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  window.MissionControlTabs = window.MissionControlTabs || {};
  window.MissionControlTabs.renderStoriesTab = renderStoriesTab;
})();
