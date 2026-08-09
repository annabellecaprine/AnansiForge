/**
 * js/mission_control/tabs/mc_launchpad_tab.js
 * Anansi Forge Mission Control - Launch Pad Tab (Releases)
 */

(() => {
  const getS = () => window.MissionControlState;

  function renderCalendar(releases) {
    const S = getS();
    if (!S) return '';
    const esc = S.esc;
    const universeBadge = S.universeBadge;

    const scheduled = releases.filter(r => r.scheduledDate && !r.pipeline?.released);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    const dayOfWeek = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - dayOfWeek + (S.state.calendarWeekOffset * 7));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const isReleasDay = (d) => d.getDay() === 2 || d.getDay() === 4;

    return `<div class="mc-calendar-section">
      <div class="mc-calendar-header">
        <h3 class="mc-section-title">📅 Release Calendar</h3>
        <div class="mc-calendar-nav">
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-cal-prev">← Prev</button>
          <span class="mc-cal-range">${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-cal-next">Next →</button>
        </div>
      </div>
      <div class="mc-calendar-grid">
        ${days.map((d, i) => {
      const dateStr = d.toISOString().split('T')[0];
      const isToday = d.getTime() === today.getTime();
      const isSlot = isReleasDay(d);
      const dayReleases = scheduled.filter(r => r.scheduledDate === dateStr);

      return `<div class="mc-cal-day${isToday ? ' mc-cal-today' : ''}${isSlot ? ' mc-cal-slot' : ''}">
            <div class="mc-cal-day-header">
              <span class="mc-cal-day-name">${dayNames[i]}</span>
              <span class="mc-cal-day-num${isToday ? ' mc-cal-today-num' : ''}">${d.getDate()}</span>
              ${isSlot ? '<span class="mc-cal-slot-badge">📡</span>' : ''}
            </div>
            <div class="mc-cal-events">
              ${dayReleases.map(r => `
                <div class="mc-cal-event" title="${esc(r.name)}">
                  ${universeBadge(r.universe)}
                  <span class="mc-cal-event-name">${esc(r.name)}</span>
                </div>`).join('')}
            </div>
          </div>`;
    }).join('')}
      </div>
    </div>`;
  }

  function releaseRow(rec, steps) {
    const S = getS();
    const esc = S.esc;
    const score = S.calcReadinessForRecord(rec);
    const visColors = { Public: 'var(--success)', Unlisted: 'var(--warning)', Private: 'var(--text-muted)' };
    const linkedProj = S.state.allProjects.find(p => p.id === rec.projectId);
    const sourceStory = rec.sourceStoryId ? S.state.allTrackerRecords.find(r => r.id === rec.sourceStoryId) : null;

    return `<tr class="mc-row${S.isReleasePublished(rec) ? ' mc-row--released' : ''}" data-record-id="${rec.id}">
      <td class="mc-cell-name">
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button>
          ${S.releaseSourceBadge(rec.releaseSource)}
        </div>
        ${sourceStory ? `<div class="mc-linked-proj-tag mc-open-story-hub" data-story-id="${sourceStory.id}" style="cursor:pointer;" title="Click to view source Story Hub">📖 from: ${esc(sourceStory.name)}</div>` : ''}
        ${linkedProj ? `<div class="mc-linked-proj-tag" title="Linked to compiled project: ${esc(linkedProj.name)}">🤖 ${esc(linkedProj.name)} (${(linkedProj.componentIds || []).length} items)</div>` : ''}
      </td>
      <td>${S.seriesSelectBadge ? S.seriesSelectBadge(rec.series, rec.id, 'record') : S.seriesBadge(rec.series)}</td>
      <td>${S.universeSelectBadge ? S.universeSelectBadge(rec.universe, rec.id, 'record') : S.universeBadge(rec.universe)}</td>
      <td>${S.priorityBadge(rec.priority)}</td>
      ${S.pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td>
        <select class="mc-vis-select" data-id="${rec.id}" style="color:${visColors[rec.visibility] || 'var(--text-muted)'}">
          <option value="">—</option>
          ${['Private', 'Unlisted', 'Public'].map(v => `<option value="${v}" ${rec.visibility === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </td>
      <td class="mc-cell-date" style="font-size:0.75rem; color:var(--text-secondary);">
        ${rec.createdAt ? new Date(rec.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
      </td>
      <td class="mc-cell-date" style="font-size:0.75rem; color:var(--text-secondary);">
        ${rec.privateLaunchDate ? new Date(rec.privateLaunchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : (rec.visibility === 'Private' ? 'Auto-stamped' : '—')}
      </td>
      <td class="mc-cell-date">
        <input type="date" class="mc-date-input" data-id="${rec.id}" value="${rec.scheduledDate || ''}" title="Scheduled Public Launch (manual entry)">
      </td>
      <td class="mc-cell-readiness">${S.readinessPct(score)}</td>
      <td class="mc-cell-actions">
        ${rec.projectId ? `
          <button class="mc-action-btn mc-open-assembler" data-project-id="${rec.projectId}" title="Open in Assembler">✏️ Assembler</button>
          <button class="mc-action-btn mc-open-sandbox" data-project-id="${rec.projectId}" title="Playtest in Sandbox">🧪 Playtest</button>
        ` : ''}
        <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit">✏️</button>
        <button class="mc-action-btn mc-toggle-release-archive" data-release-id="${rec.id}" title="${rec.status === 'Archived' ? 'Reactivate Bot' : 'Archive/Retire Bot'}">${rec.status === 'Archived' ? '🔄' : '📦'}</button>
        <button class="mc-action-btn mc-delete-record" data-record-id="${rec.id}" title="Delete">🗑</button>
      </td>
    </tr>`;
  }

  function renderLaunchPad() {
    const S = getS();
    if (!S) return '';

    const steps = S.PIPELINE_STEPS.release;
    let releases = S.filterTrackerRecords(S.state.allTrackerRecords.filter(r => r.assetType === 'release'));
    releases = S.sortByReadiness(releases, S.calcReadinessForRecord, r => r.priority, S.state.sortDir);

    const activeReleases = releases.filter(r => r.status !== 'Archived');
    const archivedReleases = releases.filter(r => r.status === 'Archived');

    const readyItems = activeReleases.filter(r => steps.every(s => r.pipeline?.[s]) && !S.isReleasePublished(r) && r.visibility !== 'Private');
    const inTesting = activeReleases.filter(r => r.visibility === 'Private' && !S.isReleasePublished(r));
    const inProgress = activeReleases.filter(r => !steps.every(s => r.pipeline?.[s]) && !S.isReleasePublished(r) && r.visibility !== 'Private');
    const released = activeReleases.filter(S.isReleasePublished);

    const releaseSection = (title, items, showReady = false) => {
      if (!items.length && !showReady) return '';
      return `<div class="mc-launch-section">
        <h3 class="mc-section-title">${title} <span class="mc-section-count">${items.length}</span></h3>
        ${items.length === 0 ? '<p class="mc-empty-state">None yet.</p>' : `
        <div class="mc-table-wrap">
          <table class="mc-table mc-table--release">
            <thead>
              <tr>
                <th>Name</th>
                <th>Series</th>
                <th>Universe</th>
                <th>Priority</th>
                ${steps.map(s => `<th class="mc-pipe-th" title="${S.STEP_LABELS[s] || s}">${(S.STEP_LABELS[s] || s).substring(0, 4)}</th>`).join('')}
                <th>Visibility</th>
                <th>Created</th>
                <th>Private Launch</th>
                <th>Public Launch</th>
                <th>Readiness</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(r => releaseRow(r, steps)).join('')}
            </tbody>
          </table>
        </div>`}
      </div>`;
    };

    const calendarHTML = renderCalendar(activeReleases);

    return `
      ${S.toolbarHTML(false, true, 'release')}
      ${readyItems.length > 0 ? `<div class="mc-ready-banner">
        🚀 <strong>${readyItems.length}</strong> release${readyItems.length > 1 ? 's' : ''} ready for public launch!
      </div>` : ''}
      ${releaseSection('🟢 Ready for Public Launch', readyItems, true)}
      ${releaseSection('🧪 In Testing (Private Build)', inTesting)}
      ${releaseSection('🔄 In Progress', inProgress)}
      ${releaseSection('✅ Released', released)}
      ${releaseSection('📦 Archived / Retired', archivedReleases)}
      ${calendarHTML}`;
  }

  window.MissionControlTabs = window.MissionControlTabs || {};
  window.MissionControlTabs.renderLaunchPad = renderLaunchPad;
})();
