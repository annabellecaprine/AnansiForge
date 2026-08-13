/**
 * js/mission_control/mc_modals.js
 * Anansi Forge Mission Control - Modal Dialog Renderers & Handlers
 */

(() => {
  const getS = () => window.MissionControlState;
  const getC = () => window.MissionControlCharts;

  async function openBotAnalyticsModal(recordId) {
    const S = getS();
    const C = getC();
    if (!S || !C) return;

    const rec = S.state.allTrackerRecords.find(r => r.id === recordId) || S.state.allComponents.find(c => c.id === recordId);
    if (!rec) return;

    const name = rec.name;
    const universe = rec.universe || (rec.tracker?.universe) || '';
    const m = rec.metrics || {};
    const prev = rec.previousMetrics || {};

    const totalMsgs = m.messages || 0;
    const totalChats = m.uniqueChats || 0;
    const mpc = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';

    const botEvents = [...(rec.lifecycleEvents || [])];
    if (!botEvents.some(e => e.type === 'private_testing' || (e.label && e.label.includes('Private')))) {
      const createTime = rec.createdAt || (rec.tracker && rec.tracker.createdAt);
      if (createTime) {
        botEvents.push({ type: 'private_testing', label: 'Private Testing', icon: '🧪', timestamp: createTime });
      }
    }
    if ((rec.visibility === 'Pre-Release' || rec.scheduledDate) && !botEvents.some(e => e.type === 'pre_release' || e.type === 'scheduled_release')) {
      const scheduledTime = rec.lifecycleEvents?.find(e => e.type === 'pre_release' || e.type === 'scheduled_release')?.timestamp || rec.createdAt || (rec.tracker && rec.tracker.createdAt);
      if (scheduledTime) {
        botEvents.push({ type: 'pre_release', label: 'Scheduled', icon: '⏰', timestamp: scheduledTime });
      }
    }
    if (!botEvents.some(e => e.type === 'public_release' || (e.label && (e.label.includes('Release') || e.label.includes('Launch'))))) {
      const releaseTime = rec.publishedDate || rec.scheduledDate;
      if (releaseTime) {
        botEvents.push({ type: 'public_release', label: 'Public Release', icon: '🚀', timestamp: releaseTime });
      }
    }
    if (rec.status === 'Archived' && !botEvents.some(e => e.type === 'archived' || (e.label && e.label.includes('Archive')))) {
      botEvents.push({ type: 'archived', label: 'Archived', icon: '📦', timestamp: rec.archivedAt || rec.updatedAt || new Date().toISOString() });
    }
    botEvents.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

    const dataPoints = [];
    const mpcPoints = [];
    const allSnaps = [];

    if (rec.metricSnapshots && rec.metricSnapshots.length > 0) {
      rec.metricSnapshots.forEach(s => {
        const d = new Date(s.timestamp || Date.now());
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        allSnaps.push({ label, messages: s.messages || 0, mpc: s.mpc || 0, timestamp: s.timestamp || d.toISOString() });
      });
    } else {
      if (prev && (prev.messages > 0 || prev.uniqueChats > 0)) {
        const prevMpc = prev.uniqueChats > 0 ? parseFloat((prev.messages / prev.uniqueChats).toFixed(2)) : 0;
        const prevDate = prev.updatedAt ? new Date(prev.updatedAt) : null;
        const prevLabel = (prevDate && !isNaN(prevDate)) ? prevDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Previous';
        allSnaps.push({ label: prevLabel, messages: prev.messages || 0, mpc: prevMpc, timestamp: prev.updatedAt || new Date().toISOString() });
      }
      if (m && (m.messages > 0 || m.uniqueChats > 0)) {
        const curMpc = totalChats > 0 ? parseFloat((totalMsgs / totalChats).toFixed(2)) : 0;
        const curDateStr = m.date ? (m.time ? `${m.date} ${m.time}` : m.date) : 'Current';
        const curDate = new Date(curDateStr);
        const curLabel = (curDate && !isNaN(curDate)) ? curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : (m.date || 'Current');
        allSnaps.push({ label: curLabel, messages: totalMsgs, mpc: curMpc, timestamp: m.lastUpdated || (curDate && !isNaN(curDate) ? curDate.toISOString() : new Date().toISOString()) });
      }
    }

    allSnaps.forEach(s => {
      dataPoints.push({ label: s.label, value: s.messages, timestamp: s.timestamp });
      mpcPoints.push({ label: s.label, value: s.mpc, timestamp: s.timestamp });
    });

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    const noLaunchDate = rec.assetType === 'release' && !rec.scheduledDate && !rec.publishedDate;
    const limitedData = allSnaps.length < 2;

    title.innerHTML = `📊 Analytics &amp; Trajectory — ${S.esc(name)}`;
    body.innerHTML = `
      <div style="display:flex; justify-space-between; align-items:center; margin-bottom:14px;">
        <div style="display:flex; gap:8px; align-items:center;">
          ${S.universeBadge(universe)}
          ${rec.priority ? S.priorityBadge(rec.priority) : ''}
          ${rec.iterationLabel ? `<span class="mc-badge mc-iteration-badge">🏷️ ${S.esc(rec.iterationLabel)}</span>` : ''}
        </div>
        <span style="font-size:0.8rem; color:var(--text-muted);">Last Snapshot: ${m.date ? m.date : 'No date set'}</span>
      </div>

      <div class="mc-kpi-grid" style="margin-bottom:18px;">
        <div class="mc-kpi-card">
          <div class="mc-kpi-icon" style="color:var(--accent);">💬</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${totalMsgs.toLocaleString()}</div>
            <div class="mc-kpi-label">Total Messages</div>
          </div>
        </div>
        <div class="mc-kpi-card">
          <div class="mc-kpi-icon" style="color:var(--success);">👥</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${totalChats.toLocaleString()}</div>
            <div class="mc-kpi-label">Unique Chats</div>
          </div>
        </div>
        <div class="mc-kpi-card">
          <div class="mc-kpi-icon" style="color:#f59e0b;">⭐</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${(m.favorites || 0).toLocaleString()}</div>
            <div class="mc-kpi-label">Total Favorites</div>
          </div>
        </div>
        <div class="mc-kpi-card">
          <div class="mc-kpi-icon" style="color:var(--warning);">📐</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${mpc}</div>
            <div class="mc-kpi-label">Avg Msg / Chat</div>
          </div>
        </div>
        <div class="mc-kpi-card">
          <div class="mc-kpi-icon" style="color:#ec4899;">💝</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${totalChats > 0 ? ((m.favorites || 0) / totalChats).toFixed(3) : '—'}</div>
            <div class="mc-kpi-label">Fav / Chat</div>
          </div>
        </div>
      </div>

      ${(() => {
        const snaps = rec.metricSnapshots && rec.metricSnapshots.length > 0
          ? rec.metricSnapshots
          : (rec.previousMetrics && rec.previousMetrics.uniqueChats > 0
            ? [rec.previousMetrics, m]
            : (m.uniqueChats > 0 ? [m] : []));

        const mpcValues = snaps
          .map(s => s.uniqueChats > 0 ? parseFloat((s.messages / s.uniqueChats).toFixed(2)) : null)
          .filter(v => v !== null && v > 0);

        if (totalChats > 0 && mpcValues.length === 0) mpcValues.push(parseFloat(mpc));

        const buckets = [
          { label: '0 – 10', min: 0, max: 10, color: '#6366f1' },
          { label: '10 – 15', min: 10, max: 15, color: '#10b981' },
          { label: '15 – 20', min: 15, max: 20, color: '#f59e0b' },
          { label: '20 – 30', min: 20, max: 30, color: '#ec4899' },
          { label: '30+', min: 30, max: Infinity, color: '#ef4444' }
        ];

        const counts = buckets.map(b => mpcValues.filter(v => v >= b.min && v < b.max).length);
        const maxCount = Math.max(...counts, 1);
        const barW = 60, gap = 18, svgW = buckets.length * (barW + gap) + 20;
        const svgH = 120;
        const labelH = 20;
        const chartH = svgH - labelH - 24;

        const bars = buckets.map((b, i) => {
          const h = counts[i] > 0 ? Math.max(4, Math.round((counts[i] / maxCount) * chartH)) : 2;
          const x = 10 + i * (barW + gap);
          const y = svgH - labelH - h;
          return `
            <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${b.color}" opacity="0.85"/>
            ${counts[i] > 0 ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="#e2e8f0">${counts[i]}</text>` : ''}
            <text x="${x + barW / 2}" y="${svgH - 4}" text-anchor="middle" font-size="10" fill="#94a3b8">${b.label}</text>
          `;
        }).join('');

        return mpcValues.length > 0 ? `
        <div class="mc-overview-panel" style="margin-bottom:14px;">
          <h4 class="mc-panel-title" style="margin-bottom:8px;">📊 MpC Distribution by Snapshot</h4>
          <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 10px;">How often this bot's Msg/Chat ratio fell into each range across recorded snapshots.</p>
          <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="overflow:visible; max-width:520px; display:block; margin:0 auto;">
            ${bars}
          </svg>
          ${mpcValues.length < 3 ? '<p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">⚠️ Record more snapshots over time for a meaningful distribution.</p>' : ''}
        </div>` : '';
      })()}

      ${noLaunchDate ? `
      <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:12px 16px; margin-bottom:14px; color:var(--warning); font-size:0.85rem;">
        📅 <strong>No Live / Launch Date set.</strong> Open the edit modal and set a <em>Live / Launch Date</em> to anchor the growth timeline.
      </div>` : ''}

      <div class="mc-overview-panel" style="margin-bottom:14px;">
        <h4 class="mc-panel-title" style="margin-bottom:8px;">📈 Messages Growth Trajectory</h4>
        ${C.renderSVGLineChart(dataPoints, 520, 180, '#6366f1', botEvents)}
        ${limitedData ? `<p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:6px;">⚠️ Limited Data Available — update snapshots over time to build the trajectory</p>` : ''}
      </div>

      <div class="mc-overview-panel">
        <h4 class="mc-panel-title" style="margin-bottom:8px;">🎯 MpC Engagement Trajectory (Msg / Chat)</h4>
        ${C.renderSVGLineChart(mpcPoints, 520, 180, '#10b981', botEvents)}
        ${limitedData ? `<p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:6px;">⚠️ Limited Data Available — update snapshots over time to build the trajectory</p>` : ''}
      </div>

      <div style="margin-top:16px; text-align:right;">
        <button type="button" class="mc-btn mc-btn-primary" onclick="document.getElementById('mc-modal-overlay').classList.add('hidden')">Close Analytics</button>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  function openQuickMetricsModal(botId) {
    const S = getS();
    if (!S) return;

    const releases = S.state.allTrackerRecords.filter(r => r.assetType === 'release');
    if (releases.length === 0) {
      if (typeof showToast === 'function') showToast('No release bots found to record metrics for.', 'warning');
      return;
    }

    let bot = releases.find(r => r.id === botId) || releases.find(r => r.status !== 'Archived') || releases[0];

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `⚡ Record Metric Snapshot`;

    const renderModalBody = (targetBot) => {
      bot = targetBot;
      const last = bot.metrics || {};

      body.innerHTML = `
        <div class="form-group" style="margin-bottom:14px;">
          <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Select Bot / Release</label>
          <select id="mc-snap-bot-select" class="mc-modal-input" style="width:100%;">
            ${releases.map(r => `<option value="${r.id}" ${r.id === bot.id ? 'selected' : ''}>${S.esc(r.name)}${r.status === 'Archived' ? ' [Archived]' : ''}${r.universe ? ` (${S.esc(r.universe)})` : ''}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:12px; font-size:0.85rem; color:var(--text-secondary);">
          Metric updates create an immutable, append-only performance snapshot with an automatic timestamp.
        </div>
        <div class="mc-form-row" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
          <div class="form-group"><label>Messages</label>
            <input type="number" id="mc-snap-msgs" value="${last.messages || 0}" class="mc-modal-input" min="0">
          </div>
          <div class="form-group"><label>Unique Chats</label>
            <input type="number" id="mc-snap-chats" value="${last.uniqueChats || 0}" class="mc-modal-input" min="0">
          </div>
          <div class="form-group"><label>Favorites</label>
            <input type="number" id="mc-snap-favs" value="${last.favorites || 0}" class="mc-modal-input" min="0">
          </div>
        </div>
        <div style="padding:10px; background:var(--bg-secondary); border-radius:6px; font-size:0.8rem; margin-bottom:16px;">
          <div><strong>Live Derived Preview:</strong></div>
          <div id="mc-snap-preview" style="display:flex; gap:16px; margin-top:6px; color:var(--accent);">
            <span>MpC: <strong id="mc-prev-mpc">—</strong></span>
            <span>Fav / Chat: <strong id="mc-prev-favchat">—</strong></span>
            <span>Fav / 100 Msg: <strong id="mc-prev-favmsg">—</strong></span>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="mc-btn mc-btn-secondary" onclick="document.getElementById('mc-modal-overlay').classList.add('hidden')">Cancel</button>
          <button class="mc-btn mc-btn-primary" id="mc-btn-submit-snapshot" data-bot-id="${bot.id}">📈 Record Snapshot</button>
        </div>
      `;

      const updatePreview = () => {
        const msgs = parseInt(document.getElementById('mc-snap-msgs')?.value) || 0;
        const chats = parseInt(document.getElementById('mc-snap-chats')?.value) || 0;
        const favs = parseInt(document.getElementById('mc-snap-favs')?.value) || 0;

        const calc = window.MissionControlMath ? window.MissionControlMath.calculateSnapshotMetrics(msgs, chats, favs) : null;
        if (calc) {
          document.getElementById('mc-prev-mpc').textContent = calc.mpc;
          document.getElementById('mc-prev-favchat').textContent = calc.favPerChat;
          document.getElementById('mc-prev-favmsg').textContent = calc.favPer100Msg;
        }
      };

      document.getElementById('mc-snap-bot-select')?.addEventListener('change', (e) => {
        const selected = releases.find(r => r.id === e.target.value);
        if (selected) renderModalBody(selected);
      });

      document.getElementById('mc-snap-msgs')?.addEventListener('input', updatePreview);
      document.getElementById('mc-snap-chats')?.addEventListener('input', updatePreview);
      document.getElementById('mc-snap-favs')?.addEventListener('input', updatePreview);
      updatePreview();
    };

    renderModalBody(bot);
    modal.classList.remove('hidden');
  }

  async function submitMetricSnapshot(botId) {
    const S = getS();
    if (!S) return;

    const bot = S.state.allTrackerRecords.find(r => r.id === botId);
    if (!bot) return;

    const msgs = parseInt(document.getElementById('mc-snap-msgs')?.value) || 0;
    const chats = parseInt(document.getElementById('mc-snap-chats')?.value) || 0;
    const favs = parseInt(document.getElementById('mc-snap-favs')?.value) || 0;

    const prevSnap = (bot.metricSnapshots && bot.metricSnapshots.length > 0)
      ? bot.metricSnapshots[bot.metricSnapshots.length - 1]
      : null;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const calc = window.MissionControlMath ? window.MissionControlMath.calculateSnapshotMetrics(msgs, chats, favs, prevSnap) : {
      messages: msgs, chats, favorites: favs, mpc: chats > 0 ? parseFloat((msgs / chats).toFixed(2)) : 0, timestamp: now.toISOString()
    };
    calc.date = dateStr;
    calc.time = timeStr;

    bot.metricSnapshots = bot.metricSnapshots || [];
    bot.metricSnapshots.push(calc);

    bot.previousMetrics = bot.metrics ? { ...bot.metrics } : null;
    bot.metrics = {
      messages: msgs,
      uniqueChats: chats,
      favorites: favs,
      msgPerChat: calc.mpc,
      date: dateStr,
      time: timeStr,
      lastUpdated: now.toISOString()
    };
    bot.latestSnapshotReference = now.toISOString();

    await window.ForgeDB.saveTrackerRecord(bot);

    if (window.AnansiEvents) {
      await window.AnansiEvents.logActivity('Metrics Updated', 'bot', bot.id, `Recorded snapshot: ${msgs} msgs, ${chats} chats, ${favs} favs`);
    }

    await S.loadAll();
    if (window.MissionControl && window.MissionControl.renderCurrentTab) {
      await window.MissionControl.renderCurrentTab();
    }
    document.getElementById('mc-modal-overlay')?.classList.add('hidden');
    if (typeof showToast === 'function') showToast(`Metric snapshot recorded for ${bot.name}!`, 'success');
  }

  function openStoryHubModal(storyId) {
    const S = getS();
    if (!S) return;

    const story = S.state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) return;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `📖 Story Hub: ${S.esc(story.name)}`;

    const linkedIds = story.linkedVaultIds || [];
    const linkedComps = [];
    const missingIds = [];

    linkedIds.forEach(id => {
      const c = S.state.compMap.get(id);
      if (c) linkedComps.push(c);
      else missingIds.push(id);
    });

    const chars = linkedComps.filter(c => c.category === 'character');
    const scenarios = linkedComps.filter(c => c.category === 'scenario');
    const bios = linkedComps.filter(c => c.category === 'bio');
    const initMsgs = linkedComps.filter(c => c.category === 'initial_message');

    const releases = S.state.allTrackerRecords.filter(r =>
      r.assetType === 'release' && r.status !== 'Archived' && (r.sourceStoryId === story.id || (story.releaseIds || []).includes(r.id))
    );

    const totalMsgs = releases.reduce((s, r) => s + (r.metrics?.messages || 0), 0);
    const totalChats = releases.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const avgMPC = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';

    body.innerHTML = `
      <div class="mc-hub-header">
        <div class="mc-hub-header-meta">
          ${S.storyStatusBadge(story.status)}
          ${S.universeBadge(story.universe)}
          ${S.priorityBadge(story.priority)}
          ${story.project ? `<span class="mc-linked-proj-tag">📁 ${S.esc(story.project)}</span>` : ''}
        </div>
        <div class="mc-hub-header-actions" style="margin-top:10px; display:flex; gap:8px;">
          <button class="mc-btn mc-btn-primary mc-spawn-release" data-story-id="${story.id}">🚀 Spawn New Release</button>
          <button class="mc-btn mc-btn-accent mc-create-project-from-story" data-story-id="${story.id}">🤖 Create Project</button>
          <button class="mc-btn mc-btn-ghost mc-edit-record" data-record-id="${story.id}">✏️ Edit Metadata</button>
          <button class="mc-btn mc-btn-secondary mc-export-story-brief" data-story-id="${story.id}">📄 Export Brief</button>
        </div>
      </div>

      ${story.notes ? `<div class="mc-hub-notes" style="margin-top:12px; font-size:0.85rem; background:var(--bg-secondary); padding:10px; border-radius:6px; color:var(--text-secondary); white-space:pre-wrap;">${S.esc(story.notes)}</div>` : ''}

      <hr class="mc-modal-divider">

      <div class="mc-hub-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 class="mc-modal-section-label" style="margin:0;">🔗 Related Vault Assets (${linkedIds.length})</h4>
          <button type="button" class="mc-btn mc-btn-secondary mc-btn-sm mc-open-link-vault-modal" data-story-id="${story.id}">🔗 Manage Linked Vault Assets</button>
        </div>

        ${missingIds.length > 0 ? `
        <div class="mc-hub-missing-banner" style="margin-bottom:10px; padding:8px 12px; background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.35); border-radius:6px; color:#fca5a5; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
          <span>⚠️ Warning: ${missingIds.length} linked Vault asset(s) no longer exist in the vault.</span>
          <button class="mc-hub-clean-missing mc-btn mc-btn-ghost mc-btn-sm" data-story-id="${story.id}" style="color:#fca5a5; border-color:rgba(239,68,68,0.4);">Clean References</button>
        </div>` : ''}
        <div class="mc-hub-assets-grid">
          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">👤 Characters (${chars.length})</span>
            ${chars.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : chars.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${S.esc(c.name)} ${linkedIds.filter(id => id === c.id).length > 1 ? `<span class="mc-badge" style="background:rgba(16,185,129,0.2); color:#10b981;">x${linkedIds.filter(id => id === c.id).length}</span>` : ''}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink one instance">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">🎭 Scenarios (${scenarios.length})</span>
            ${scenarios.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : scenarios.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${S.esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">📋 Bios (${bios.length})</span>
            ${bios.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : bios.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${S.esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">💬 Initial Msgs (${initMsgs.length})</span>
            ${initMsgs.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : initMsgs.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${S.esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <hr class="mc-modal-divider">

      <div class="mc-hub-section">
        <h4 class="mc-modal-section-label">🚀 Spawned Releases (${releases.length})</h4>
        ${releases.length === 0 ? '<p class="mc-empty-state">No releases spawned yet. Click "Spawn New Release" above to start building towards Launch.</p>' : `
          <div class="mc-hub-releases-list">
            ${releases.map(r => {
      const readiness = S.calcReadinessForRecord(r);
      return `<div class="mc-hub-release-row">
                <div style="flex:1;">
                  <strong>${S.esc(r.name)}</strong>
                  ${S.releaseSourceBadge(r.releaseSource)}
                  <span style="font-size:0.75rem; color:var(--text-muted); margin-left:8px;">${S.readinessPct(readiness)} ready</span>
                </div>
                ${r.projectId ? `
                  <button class="mc-action-btn mc-open-assembler" data-project-id="${r.projectId}">✏️ Assembler</button>
                  <button class="mc-action-btn mc-open-sandbox" data-project-id="${r.projectId}">🧪 Playtest</button>
                ` : ''}
              </div>`;
    }).join('')}
          </div>`}
      </div>

      ${totalMsgs > 0 || totalChats > 0 ? `
      <hr class="mc-modal-divider">
      <div class="mc-hub-section">
        <h4 class="mc-modal-section-label">📈 Aggregated Performance Metrics</h4>
        <div style="display:flex; gap:16px; margin-top:8px;">
          <div class="mc-kpi-subcard"><strong>${totalChats}</strong> unique chats</div>
          <div class="mc-kpi-subcard"><strong>${totalMsgs}</strong> messages</div>
          <div class="mc-kpi-subcard"><strong>${avgMPC}</strong> msg/chat avg</div>
        </div>
      </div>` : ''}
    `;

    modal.classList.remove('hidden');
  }

  function openLinkVaultModal(storyId) {
    const S = getS();
    if (!S) return;

    const story = S.state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) return;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `🔗 Manage Linked Vault Assets: ${S.esc(story.name)}`;

    const linkedIds = new Set(story.linkedVaultIds || []);
    const comps = S.state.allComponents || [];

    const categoryGroups = {
      character: { label: '👤 Characters', items: [] },
      scenario: { label: '🎭 Scenarios', items: [] },
      bio: { label: '📋 Bios', items: [] },
      initial_message: { label: '💬 Initial Messages', items: [] },
      organization: { label: '🏢 Organizations', items: [] }
    };

    comps.forEach(c => {
      const cat = c.category || 'character';
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = { label: cat, items: [] };
      }
      categoryGroups[cat].items.push(c);
    });

    body.innerHTML = `
      <div style="margin-bottom:12px;">
        <input type="search" id="mc-link-vault-search" name="link-vault-search" class="mc-search" placeholder="Search Vault components to link..." style="width:100%;" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div id="mc-link-vault-list" style="max-height:420px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
        ${Object.keys(categoryGroups).map(catKey => {
      const group = categoryGroups[catKey];
      if (!group.items.length) return '';
      return `
            <div class="mc-vault-link-group">
              <h4 style="margin:0 0 8px 0; font-size:0.9rem; color:var(--accent);">${group.label} (${group.items.length})</h4>
              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:8px;">
                ${group.items.map(c => {
        const isLinked = linkedIds.has(c.id);
        return `
                    <div class="mc-vault-link-card" data-name="${S.esc(c.name).toLowerCase()}" style="padding:8px 12px; background:var(--bg-secondary); border:1px solid ${isLinked ? 'var(--accent)' : 'var(--border-color)'}; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-size:0.85rem; font-weight:500; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:140px;" title="${S.esc(c.name)}">${S.esc(c.name)}</span>
                      <button class="mc-btn mc-btn-sm ${isLinked ? 'mc-btn-danger mc-unlink-vault-item' : 'mc-btn-primary mc-link-vault-item'}" data-story-id="${story.id}" data-comp-id="${c.id}">
                        ${isLinked ? '✓ Unlink' : '+ Link'}
                      </button>
                    </div>
                  `;
      }).join('')}
              </div>
            </div>
          `;
    }).join('')}
      </div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end;">
        <button class="mc-btn mc-btn-secondary" onclick="if(window.MissionControlModals) window.MissionControlModals.openStoryHubModal('${story.id}')">← Return to Story Hub</button>
      </div>
    `;

    modal.classList.remove('hidden');

    const searchInput = document.getElementById('mc-link-vault-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.mc-vault-link-card');
        cards.forEach(card => {
          const name = card.dataset.name || '';
          card.style.display = name.includes(q) ? 'flex' : 'none';
        });
      });
    }
  }

  function openRecordModal(rec, assetType) {
    const S = getS();
    if (!S) return;
    const isNew = !rec;
    const r = rec || { assetType, name: '', universe: '', project: '', priority: null, tags: [], notes: '', linkedVaultIds: [], pipeline: window.ForgeDB.defaultTrackerPipeline(assetType) };
    S.state.editingRecord = r;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.textContent = isNew ? `New ${assetType === 'story' ? 'Story' : 'Release'}` : `Edit: ${r.name}`;
    body.innerHTML = `
      <div class="form-group"><label>Name</label>
        <input type="text" id="mc-rec-name" value="${S.esc(r.name)}" placeholder="Name…" class="mc-modal-input" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Universe</label>
          <select id="mc-rec-universe" class="mc-modal-input">
            ${S.universeSelectOptionsHTML(r.universe, '—')}
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="mc-rec-priority" class="mc-modal-input">
            <option value="">—</option>
            ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}" ${r.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Project / Group</label>
        <input type="text" id="mc-rec-project" value="${S.esc(r.project || '')}" class="mc-modal-input" placeholder="e.g. Young Justice" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="form-group"><label>Tags (comma separated)</label>
        <input type="text" id="mc-rec-tags" value="${S.esc((r.tags || []).join(', '))}" class="mc-modal-input" placeholder="e.g. hero, DC, tested" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="form-group"><label>Notes</label>
        <textarea id="mc-rec-notes" class="mc-modal-input" rows="3">${S.esc(r.notes || '')}</textarea>
      </div>
      ${assetType === 'story' ? `
      <div class="form-group"><label>Status</label>
        <select id="mc-rec-status" class="mc-modal-input">
          ${['Active', 'Promoted', 'Archived'].map(s => `<option value="${s}" ${(r.status || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>` : ''}
      ${assetType === 'release' ? `
      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Visibility</label>
          <select id="mc-rec-visibility" class="mc-modal-input">
            <option value="">—</option>
            ${['Private', 'Pre-Release', 'Unlisted', 'Public'].map(v => `<option value="${v}" ${r.visibility === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Scheduled Date</label>
          <input type="date" id="mc-rec-date" value="${r.scheduledDate || ''}" class="mc-modal-input">
        </div>
      </div>
      <hr class="mc-modal-divider">
      <p class="mc-modal-section-label" style="font-weight:600; margin:10px 0 6px;">📈 Post-Release Metrics</p>
      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Snapshot Date</label>
          <input type="date" id="mc-rec-metrics-date" value="${r.metrics?.date || ''}" class="mc-modal-input">
        </div>
        <div class="form-group"><label>Snapshot Time</label>
          <input type="time" id="mc-rec-metrics-time" value="${r.metrics?.time || ''}" class="mc-modal-input">
        </div>
      </div>
      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Unique Chats</label>
          <input type="number" id="mc-rec-unique-chats" value="${r.metrics?.uniqueChats || 0}" class="mc-modal-input" min="0">
        </div>
        <div class="form-group"><label>Messages</label>
          <input type="number" id="mc-rec-messages" value="${r.metrics?.messages || 0}" class="mc-modal-input" min="0">
        </div>
      </div>
      <div class="mc-metrics-derived" style="margin-top:8px; font-size:0.82rem; color:var(--accent);">
        <span class="mc-metrics-derived-label">Derived Msg / Chat: </span>
        <span class="mc-metrics-derived-value" id="mc-derived-mpc">${r.metrics?.uniqueChats > 0 ? (r.metrics.messages / r.metrics.uniqueChats).toFixed(2) : '—'}</span>
      </div>` : ''}
      <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
        <button class="mc-btn mc-btn-secondary" id="mc-modal-cancel">Cancel</button>
        <button class="mc-btn mc-btn-primary" id="mc-modal-save">Save Record</button>
      </div>
    `;

    modal.classList.remove('hidden');
    document.getElementById('mc-rec-name')?.focus();
  }

  function openStubModal() {
    const S = getS();
    if (!S) return;
    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');
    S.state.editingRecord = { assetType: 'concept_stub' };
    title.textContent = '💡 New Concept Stub';
    body.innerHTML = `
      <div class="form-group"><label>Name</label>
        <input type="text" id="mc-rec-name" class="mc-modal-input" placeholder="e.g. Kamala Khan" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
        <div class="form-group"><label>Category</label>
          <select id="mc-stub-category" class="mc-modal-input">
            <option value="character">Character</option>
            <option value="scenario">Scenario</option>
            <option value="bio">Bio</option>
            <option value="initial_message">Initial Message</option>
            <option value="organization">Organization</option>
          </select>
        </div>
        <div class="form-group"><label>Universe</label>
          <select id="mc-rec-universe" class="mc-modal-input">
            ${S.universeSelectOptionsHTML('', '—')}
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="mc-rec-priority" class="mc-modal-input">
            <option value="">—</option>
            ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Project / Group</label>
        <input type="text" id="mc-rec-project" class="mc-modal-input" placeholder="e.g. Ant-Man" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="form-group"><label>Tags (comma separated)</label>
        <input type="text" id="mc-rec-tags" class="mc-modal-input" placeholder="e.g. hero, Marvel" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>
      <div class="form-group"><label>Notes</label>
        <textarea id="mc-rec-notes" class="mc-modal-input" rows="2"></textarea>
      </div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
        <button class="mc-btn mc-btn-secondary" id="mc-modal-cancel">Cancel</button>
        <button class="mc-btn mc-btn-primary" id="mc-modal-save">Save Stub</button>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('mc-rec-name')?.focus();
  }

  function openCastModal() {
    const S = getS();
    if (!S) return;
    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.textContent = '🎬 Cast — Bulk Concept Stubs';
    S.state.editingRecord = { assetType: 'concept_cast_bulk' };

    body.innerHTML = `
      <p style="font-size:0.82rem; color:var(--text-muted); margin:0 0 14px;">
        Set shared metadata once, then list every character name below — one per line (or comma-separated).
        Each name becomes its own Concept Stub.
      </p>

      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Universe</label>
          <select id="mc-cast-universe" class="mc-modal-input">
            ${S.universeSelectOptionsHTML('', 'No Universe')}
          </select>
        </div>
        <div class="form-group"><label>Category</label>
          <select id="mc-cast-category" class="mc-modal-input">
            <option value="character" selected>Character</option>
            <option value="organization">Organization</option>
            <option value="scenario">Scenario</option>
            <option value="bio">Bio</option>
            <option value="initial_message">Initial Message</option>
          </select>
        </div>
      </div>

      <div class="mc-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group"><label>Group / Project</label>
          <input type="text" id="mc-cast-project" class="mc-modal-input" placeholder="e.g. Young Justice" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="mc-cast-priority" class="mc-modal-input">
            <option value="">—</option>
            ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group"><label>Tags (shared, comma separated)</label>
        <input type="text" id="mc-cast-tags" class="mc-modal-input" placeholder="e.g. hero, DC, tested" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
      </div>

      <div class="form-group"><label>Character Names (one per line or comma-separated)</label>
        <textarea id="mc-cast-names" class="mc-modal-input" rows="6" placeholder="Robin&#10;Superboy&#10;Aqualad&#10;Kid Flash&#10;Artemis"></textarea>
      </div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
        <button class="mc-btn mc-btn-secondary" id="mc-modal-cancel">Cancel</button>
        <button class="mc-btn mc-btn-primary" id="mc-modal-save">Create Cast Stubs</button>
      </div>`;

    modal.classList.remove('hidden');
    document.getElementById('mc-cast-names')?.focus();
  }

  async function saveModalRecord() {
    const S = getS();
    if (!S) return;
    const r = S.state.editingRecord;

    if (r && r.assetType === 'concept_cast_bulk') {
      const category = document.getElementById('mc-cast-category')?.value || 'character';
      const universe = document.getElementById('mc-cast-universe')?.value || '';
      const project = document.getElementById('mc-cast-project')?.value?.trim() || '';
      const priority = document.getElementById('mc-cast-priority')?.value || null;
      const tags = (document.getElementById('mc-cast-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
      const namesRaw = document.getElementById('mc-cast-names')?.value || '';

      const names = namesRaw.split(/[\n,]/).map(n => n.trim()).filter(Boolean);
      if (names.length === 0) {
        if (typeof showToast === 'function') showToast('Please enter at least one character name.', 'error');
        return;
      }

      const promises = names.map(name => window.ForgeDB.saveTrackerRecord({
        assetType: 'concept_stub',
        name,
        universe,
        project,
        priority,
        intendedCategory: category,
        tags,
        createdAt: new Date().toISOString()
      }));

      await Promise.all(promises);
      await S.loadAll();
      closeModal();
      if (window.MissionControl && window.MissionControl.renderCurrentTab) {
        await window.MissionControl.renderCurrentTab();
      }
      if (typeof showToast === 'function') showToast(`Cast saved: ${names.length} Concept Stubs created!`, 'success');
      return;
    }

    if (!r) return;

    const name = document.getElementById('mc-rec-name')?.value?.trim();
    if (!name) {
      if (typeof showToast === 'function') showToast('Name is required.', 'error');
      return;
    }

    const universe = document.getElementById('mc-rec-universe')?.value || '';
    const priority = document.getElementById('mc-rec-priority')?.value || null;
    const project = document.getElementById('mc-rec-project')?.value?.trim() || '';
    const tags = (document.getElementById('mc-rec-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    const notes = document.getElementById('mc-rec-notes')?.value || '';

    const updated = {
      ...r, name, universe, priority, project, tags, notes,
      pipeline: r.pipeline || window.ForgeDB.defaultTrackerPipeline(r.assetType)
    };

    if (r.assetType === 'story') {
      const statusEl = document.getElementById('mc-rec-status');
      if (statusEl) updated.status = statusEl.value;
    }
    if (r.assetType === 'concept_stub') {
      updated.intendedCategory = document.getElementById('mc-stub-category')?.value || 'character';
    }
    if (r.assetType === 'release') {
      updated.visibility = document.getElementById('mc-rec-visibility')?.value || null;
      updated.scheduledDate = document.getElementById('mc-rec-date')?.value || null;
      const uniqueChats = parseInt(document.getElementById('mc-rec-unique-chats')?.value) || 0;
      const messages = parseInt(document.getElementById('mc-rec-messages')?.value) || 0;
      updated.metrics = {
        date: document.getElementById('mc-rec-metrics-date')?.value || null,
        time: document.getElementById('mc-rec-metrics-time')?.value || null,
        uniqueChats,
        messages,
        msgPerChat: uniqueChats > 0 ? parseFloat((messages / uniqueChats).toFixed(2)) : null
      };
    }

    await window.ForgeDB.saveTrackerRecord(updated);
    await S.loadAll();
    closeModal();
    if (window.MissionControl && window.MissionControl.renderCurrentTab) {
      await window.MissionControl.renderCurrentTab();
    }
    if (typeof showToast === 'function') showToast(`${updated.name} saved.`, 'success');
  }

  function closeModal() {
    const S = getS();
    document.getElementById('mc-modal-overlay')?.classList.add('hidden');
    if (S) S.state.editingRecord = null;
  }

  async function promoteStub(stubId) {
    const S = getS();
    if (!S) return;
    const stub = S.state.allTrackerRecords.find(r => r.id === stubId);
    if (!stub) return;

    if (window.ForgeAppBridge && window.ForgeAppBridge.openEditorNew) {
      window.ForgeAppBridge.openEditorNew({
        name: stub.name,
        category: stub.intendedCategory || 'character',
        tags: stub.tags || [],
        _stubId: stub.id
      });
    } else {
      document.getElementById('btn-new-component')?.click();
      if (typeof showToast === 'function') showToast(`Building "${stub.name}" — fill out the editor and save to Vault.`, 'info');
    }
  }

  async function promoteStubToStory(stubId) {
    const S = getS();
    if (!S) return;
    const stub = S.state.allTrackerRecords.find(r => r.id === stubId);
    if (!stub) return;

    const storyRecord = {
      assetType: 'story',
      name: stub.name,
      universe: stub.universe || '',
      project: stub.project || '',
      priority: stub.priority || null,
      status: 'Idea',
      notes: stub.notes || '',
      linkedVaultIds: [],
      createdAt: new Date().toISOString()
    };

    await window.ForgeDB.saveTrackerRecord(storyRecord);
    await window.ForgeDB.deleteTrackerRecord(stubId);
    await S.loadAll();
    if (window.MissionControl && window.MissionControl.renderCurrentTab) {
      await window.MissionControl.renderCurrentTab();
    }
    if (typeof showToast === 'function') showToast(`Promoted concept "${stub.name}" to a Story!`, 'success');
  }

  function exportStoryBrief(storyId) {
    const S = getS();
    if (!S) return;

    const story = S.state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) {
      if (typeof showToast === 'function') showToast('Story not found.', 'error');
      return;
    }

    const linkedIds = story.linkedVaultIds || [];
    const linkedComps = linkedIds.map(id => S.state.compMap.get(id)).filter(Boolean);

    const chars = linkedComps.filter(c => c.category === 'character');
    const scenarios = linkedComps.filter(c => c.category === 'scenario');
    const bios = linkedComps.filter(c => c.category === 'bio');
    const initMsgs = linkedComps.filter(c => c.category === 'initial_message');
    const orgs = linkedComps.filter(c => c.category === 'organization');

    const releases = S.state.allTrackerRecords.filter(r =>
      r.assetType === 'release' && r.status !== 'Archived' && (r.sourceStoryId === story.id || (story.releaseIds || []).includes(r.id))
    );

    const score = S.calcReadinessForRecord(story);
    const readinessText = S.readinessPct(score);

    let md = `# 📖 Story Brief: ${story.name}\n\n`;
    md += `**Universe:** ${story.universe || 'None'}\n`;
    md += `**Status:** ${story.status || 'Active'}\n`;
    md += `**Priority:** ${story.priority || 'Unassigned'}\n`;
    if (story.project) md += `**Project / Group:** ${story.project}\n`;
    if (story.tags && story.tags.length) md += `**Tags:** ${story.tags.join(', ')}\n`;
    md += `**Readiness Score:** ${readinessText}\n`;
    if (story.createdAt) md += `**Created:** ${new Date(story.createdAt).toLocaleDateString()}\n`;
    md += `\n---\n\n`;

    if (story.notes) {
      md += `## 📝 Premise & Notes\n\n${story.notes}\n\n---\n\n`;
    }

    md += `## 🔗 Linked Vault Assets (${linkedComps.length})\n\n`;

    const formatCompGroup = (title, items) => {
      if (!items.length) return '';
      let section = `### ${title} (${items.length})\n\n`;
      items.forEach(c => {
        section += `#### ${c.name}\n`;
        if (c.tags && c.tags.length) section += `*Tags: ${c.tags.join(', ')}*\n\n`;
        if (c.content) section += `${c.content.trim()}\n\n`;
        section += `---\n\n`;
      });
      return section;
    };

    md += formatCompGroup('👤 Characters', chars);
    md += formatCompGroup('🎭 Scenarios', scenarios);
    md += formatCompGroup('📋 Bios', bios);
    md += formatCompGroup('💬 Initial Messages', initMsgs);
    md += formatCompGroup('🏢 Organizations', orgs);

    if (releases.length > 0) {
      md += `## 🚀 Spawned Releases (${releases.length})\n\n`;
      releases.forEach(r => {
        const m = r.metrics || {};
        md += `- **${r.name}** [${r.status || 'Active'}]\n`;
        if (r.releaseSource) md += `  - Source: ${r.releaseSource}\n`;
        if (m.messages || m.uniqueChats) {
          md += `  - Messages: ${m.messages || 0} | Unique Chats: ${m.uniqueChats || 0} | MpC: ${m.msgPerChat || '—'}\n`;
        }
      });
      md += `\n`;
    }

    md += `*Exported from AnansiForge Mission Control on ${new Date().toLocaleDateString()}*\n`;

    const fileName = `${(story.name || 'story').toLowerCase().replace(/[^a-z0-9]/g, '_')}_brief.md`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast(`Exported Story Brief for "${story.name}"!`, 'success');
  }

  // Export to Global Window Namespace
  window.MissionControlModals = {
    openBotAnalyticsModal,
    openQuickMetricsModal,
    submitMetricSnapshot,
    openStoryHubModal,
    openLinkVaultModal,
    openRecordModal,
    openStubModal,
    openCastModal,
    saveModalRecord,
    closeModal,
    promoteStub,
    promoteStubToStory,
    exportStoryBrief
  };
})();
