/**
 * js/mission_control/tabs/mc_metrics_tab.js
 * Anansi Forge Mission Control - Metrics Tab
 */

(() => {
  const getS = () => window.MissionControlState;
  const getCharts = () => window.MissionControlCharts;

  function renderMetrics() {
    const S = getS();
    const Charts = getCharts();
    if (!S || !Charts) return '';

    const esc = S.esc;
    const seriesFilter = S.state.metricsSeriesFilter || 'all';
    const allReleases = S.state.allTrackerRecords.filter(r => r.assetType === 'release');
    let filteredBySeriesAll = seriesFilter !== 'all' ? allReleases.filter(r => (r.series || 'standard') === seriesFilter) : allReleases;

    // Categorize into 3 distinct pools
    const isPrivate = r => r.visibility === 'Private' || r.status === 'Private';
    const publicReleases = filteredBySeriesAll.filter(r => r.status !== 'Archived' && !isPrivate(r));
    const privateReleases = filteredBySeriesAll.filter(r => r.status !== 'Archived' && isPrivate(r));
    const archivedReleases = filteredBySeriesAll.filter(r => r.status === 'Archived');

    // Calculation pool for top KPIs, charts, distribution buckets, and median strictly respects toggles
    const releases = [...publicReleases];
    if (S.state.includePrivate) releases.push(...privateReleases);
    if (S.state.includeArchived) releases.push(...archivedReleases);

    const hasMetrics = r => r.metrics?.messages > 0 || r.metrics?.uniqueChats > 0 || r.metrics?.favorites > 0;
    const withMetrics = releases.filter(hasMetrics);
    const noMetrics = publicReleases.filter(r => S.isReleasePublished(r) && !hasMetrics(r));

    const publicWithMetrics = publicReleases.filter(hasMetrics);
    const privateWithMetrics = privateReleases.filter(hasMetrics);
    const archivedWithMetrics = archivedReleases.filter(hasMetrics);

    const sortMode = S.state.leaderboardSort || 'messages';
    const getSortVal = (r) => {
      const m = r.metrics || {};
      if (sortMode === 'chats') return m.uniqueChats || 0;
      if (sortMode === 'mpc') return m.uniqueChats > 0 ? (m.messages / m.uniqueChats) : 0;
      if (sortMode === 'favorites') return m.favorites || 0;
      return m.messages || 0;
    };

    const sortItems = (items) => [...items].sort((a, b) => {
      const valA = getSortVal(a);
      const valB = getSortVal(b);
      if (valA !== valB) return valB - valA;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Main Leaderboard Pool (matches toggles or shows public releases by default)
    const mainLeaderboardPool = S.state.includePrivate && S.state.includeArchived
      ? [...publicWithMetrics, ...privateWithMetrics, ...archivedWithMetrics]
      : (S.state.includePrivate ? [...publicWithMetrics, ...privateWithMetrics] : (S.state.includeArchived ? [...publicWithMetrics, ...archivedWithMetrics] : publicWithMetrics));

    const sorted = sortItems(mainLeaderboardPool);
    const privateSorted = sortItems(privateReleases);
    const archivedSorted = sortItems(archivedReleases);
    const sortLabel = sortMode === 'chats' ? 'Unique Chats' : sortMode === 'mpc' ? 'Msg / Chat (MpC)' : sortMode === 'favorites' ? 'Favorites' : 'Messages';

    // Totals from calculation pool (strictly respecting includePrivate & includeArchived)
    const totalMsgs = withMetrics.reduce((s, r) => s + (r.metrics?.messages || 0), 0);
    const totalChats = withMetrics.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const totalFavs = withMetrics.reduce((s, r) => s + (r.metrics?.favorites || 0), 0);
    const avgMPC = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';
    const allSorted = [...withMetrics].sort((a, b) => getSortVal(b) - getSortVal(a));
    const topBot = allSorted[0];

    const kpiCard = (icon, val, label, color = 'var(--accent)') =>
      `<div class="mc-kpi-card">
        <div class="mc-kpi-icon" style="color:${color}">${icon}</div>
        <div class="mc-kpi-body">
          <div class="mc-kpi-value">${val}</div>
          <div class="mc-kpi-label">${label}</div>
        </div>
      </div>`;

    const metricRow = (rec, rank, rowType = 'public') => {
      const m = rec.metrics || {};
      const prev = rec.previousMetrics || null;
      const mpcNum = m.uniqueChats > 0 ? (m.messages / m.uniqueChats) : 0;
      const mpc = m.uniqueChats > 0 ? mpcNum.toFixed(2) : '—';
      const refList = rowType === 'private' ? privateSorted : rowType === 'archived' ? archivedSorted : sorted;
      const maxVal = refList.length > 0 ? getSortVal(refList[0]) : 1;
      const val = getSortVal(rec);
      const barPct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;

      let deltaMsgHtml = '', deltaChatsHtml = '', deltaFavsHtml = '', deltaMpcHtml = '';
      if (prev && (prev.messages !== undefined || prev.uniqueChats !== undefined || prev.favorites !== undefined)) {
        const dMsg = (m.messages || 0) - (prev.messages || 0);
        const dChats = (m.uniqueChats || 0) - (prev.uniqueChats || 0);
        const dFavs = (m.favorites || 0) - (prev.favorites || 0);
        const prevMpcNum = prev.uniqueChats > 0 ? (prev.messages / prev.uniqueChats) : 0;
        const dMpc = mpcNum - prevMpcNum;
        if (dMsg > 0) deltaMsgHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous: ${(prev.messages || 0).toLocaleString()}">▲ +${dMsg.toLocaleString()}</span>`;
        if (dChats > 0) deltaChatsHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous: ${(prev.uniqueChats || 0).toLocaleString()}">▲ +${dChats.toLocaleString()}</span>`;
        if (dFavs > 0) deltaFavsHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous: ${(prev.favorites || 0).toLocaleString()}">▲ +${dFavs.toLocaleString()}</span>`;
        if (dMpc > 0) deltaMpcHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous MpC: ${prevMpcNum.toFixed(2)}">▲ +${dMpc.toFixed(2)}</span>`;
      }

      const rowBadge = rowType === 'private' ? '<span class="mc-badge-private">🔒</span> ' : rowType === 'archived' ? '<span class="mc-badge-archived">📦</span> ' : '';
      return `<tr class="mc-row${rowType === 'archived' ? ' mc-row-archived' : rowType === 'private' ? ' mc-row-private' : ''}">
        <td class="mc-metrics-rank">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</td>
        <td class="mc-cell-name">${rowBadge}<button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button></td>
        <td>${S.seriesBadge(rec.series)}</td>
        <td>${S.universeBadge(rec.universe)}</td>
        <td class="mc-token-count-cell" data-record-id="${rec.id}">
          <span class="mc-token-display" title="Click to set token count" style="cursor:pointer; font-size:0.82rem; color:${rec.tokenCount ? 'var(--text-primary)' : 'var(--text-muted)'}; padding:2px 6px; border-radius:4px; display:inline-block; min-width:32px; text-align:center; border:1px dashed ${rec.tokenCount ? 'var(--border-color)' : 'rgba(148,163,184,0.3)'}; transition:border-color 0.15s;">${rec.tokenCount ? rec.tokenCount.toLocaleString() : '—'}</span>
        </td>
        <td class="mc-metrics-bar-cell">
          <div class="mc-metrics-bar-wrap"><div class="mc-metrics-bar" style="width:${barPct}%;"></div></div>
          <span class="mc-metrics-num">${(m.messages || 0).toLocaleString()}</span> ${deltaMsgHtml}
        </td>
        <td class="mc-metrics-num">${(m.uniqueChats || 0).toLocaleString()} ${deltaChatsHtml}</td>
        <td class="mc-metrics-num">${(m.favorites || 0).toLocaleString()} ${deltaFavsHtml}</td>
        <td class="mc-metrics-mpc${mpc !== '—' && parseFloat(mpc) >= 10 ? ' mc-metrics-mpc--high' : ''}">${mpc} ${deltaMpcHtml}</td>
        <td class="mc-metrics-date">${m.date ? `${m.date}${m.time ? ' ' + m.time : ''}` : '—'}</td>
        <td class="mc-cell-actions">
          <button class="mc-action-btn mc-open-bot-analytics" data-record-id="${rec.id}" title="View Performance & Trajectory Chart">📊</button>
          <button class="mc-action-btn mc-open-quick-metrics" data-record-id="${rec.id}" title="Record / Edit Metrics">✏️</button>
        </td>
      </tr>`;
    };

    const leaderboardTableHeaders = `<thead><tr>
      <th>#</th><th>Name</th><th>Series</th><th>Universe</th>
      <th title="Click a value to edit">Tokens</th><th>Messages</th>
      <th>Unique Chats</th><th>Favorites</th><th>Msg / Chat</th>
      <th>Snapshot</th><th></th>
    </tr></thead>`;

    const filterScopeLabel = (S.state.includePrivate && S.state.includeArchived)
      ? ' (all)'
      : S.state.includePrivate ? ' (public + private)' : S.state.includeArchived ? ' (public + archived)' : ' (public releases)';

    return `
      <!-- Toggles Bar -->
      <div class="mc-metrics-toggles-bar" style="display:flex; gap:16px; align-items:center; margin-bottom:14px; flex-wrap:wrap;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.82rem; color:var(--text-secondary); user-select:none;">
          <input type="checkbox" id="mc-include-private-cb" ${S.state.includePrivate ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;" />
          Include Private Bots
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.82rem; color:var(--text-secondary); user-select:none;">
          <input type="checkbox" id="mc-include-archived-cb" ${S.state.includeArchived ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;" />
          Include Archived Bots
        </label>
        ${(S.state.includePrivate || S.state.includeArchived) ? `<span style="font-size:0.75rem; color:var(--text-muted);">KPIs, charts, and distribution include ${filterScopeLabel.replace(/[\(\)]/g, '').trim()} data</span>` : ''}
      </div>

      <!-- Top KPI Cards -->
      <div class="mc-kpi-grid" style="margin-bottom:20px;">
        ${kpiCard('💬', totalMsgs.toLocaleString(), 'Total Messages' + filterScopeLabel)}
        ${kpiCard('👥', totalChats.toLocaleString(), 'Total Unique Chats' + filterScopeLabel, 'var(--success)')}
        ${kpiCard('⭐', totalFavs.toLocaleString(), 'Total Favorites' + filterScopeLabel, '#f59e0b')}
        ${kpiCard('📐', avgMPC, 'Avg Msg / Chat', 'var(--warning)')}
        ${kpiCard('💝', totalChats > 0 ? (totalFavs / totalChats).toFixed(3) : '—', 'Avg Fav / Chat', '#ec4899')}
        ${topBot ? kpiCard('🏆', esc(topBot.name), 'Top bot · ' + (topBot.metrics?.messages || 0).toLocaleString() + ' msgs', '#f59e0b') : ''}
      </div>

      <!-- Portfolio Growth Chart -->
      ${(() => {
        const metric = S.state.portfolioChartMetric || 'messages';
        const pubReleases = releases.filter(r => S.isReleasePublished(r));
        const pubBotCount = pubReleases.length || releases.length || 1;
        let chartTitle = '📈 Total Messages Growth', chartColor = '#10b981', targetMax = totalMsgs;
        if (metric === 'chats') { chartTitle = '👥 Total Unique Chats Growth'; chartColor = '#6366f1'; targetMax = totalChats; }
        else if (metric === 'favorites') { chartTitle = '⭐ Total Favorites Growth'; chartColor = '#f59e0b'; targetMax = totalFavs; }
        else if (metric === 'mpc') { chartTitle = '📐 Average MpC Trajectory'; chartColor = '#f59e0b'; targetMax = parseFloat(avgMPC) || 0; }
        else if (metric === 'bots') { chartTitle = '🤖 Published Bots Expansion'; chartColor = '#ec4899'; targetMax = pubBotCount; }

        const dataPoints = [];
        const datedReleases = releases.map(r => {
          const dStr = r.scheduledDate || r.publishedDate || r.metrics?.date || r.createdAt;
          const d = dStr ? new Date(dStr) : new Date();
          return { name: r.name, dStr, d, msgs: r.metrics?.messages || 0, chats: r.metrics?.uniqueChats || r.metrics?.chats || 0, favs: r.metrics?.favorites || 0 };
        }).filter(r => r.dStr && !isNaN(r.d)).sort((a, b) => a.d - b.d);

        const monthsMap = {};
        let cumMsgs = 0, cumChats = 0, cumFavs = 0, cumBots = 0;
        datedReleases.forEach(r => {
          cumBots++; cumMsgs += r.msgs; cumChats += r.chats; cumFavs += r.favs;
          const label = r.d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          const mpcVal = cumChats > 0 ? parseFloat((cumMsgs / cumChats).toFixed(2)) : 0;
          monthsMap[label] = { label, messages: cumMsgs, chats: cumChats, favorites: cumFavs, mpc: mpcVal, bots: cumBots };
        });
        Object.values(monthsMap).forEach(p => {
          let val = p.messages;
          if (metric === 'chats') val = p.chats;
          else if (metric === 'favorites') val = p.favorites;
          else if (metric === 'mpc') val = p.mpc;
          else if (metric === 'bots') val = p.bots;
          dataPoints.push({ label: p.label, value: val });
        });

        const pill = (mKey, label) => '<button type="button" class="mc-leaderboard-pill mc-portfolio-pill' + (metric === mKey ? ' active' : '') + '" data-metric="' + mKey + '">' + label + '</button>';
        return '<div class="mc-overview-panel" style="margin-bottom:20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;"><div><h3 class="mc-panel-title" style="margin-bottom:2px;">' + chartTitle + '</h3><span style="font-size:0.75rem; color:var(--text-muted);">Historical portfolio expansion across releases</span></div><div class="mc-pill-group">' + pill('messages', '💬 Messages') + pill('chats', '👥 Unique Chats') + pill('favorites', '⭐ Favorites') + pill('mpc', '📐 Avg MpC') + pill('bots', '🤖 Published Bots') + '</div></div>' + Charts.renderSVGLineChart(dataPoints, 750, 160, chartColor) + '</div>';
      })()}

      <!-- MpC Distribution -->
      ${(() => {
        const mpcBots = withMetrics.map(r => ({ name: r.name, mpc: r.metrics.uniqueChats > 0 ? parseFloat((r.metrics.messages / r.metrics.uniqueChats).toFixed(2)) : null })).filter(b => b.mpc !== null && b.mpc > 0);
        if (mpcBots.length === 0) return '';
        const buckets = [
          { label: '0 – 10', min: 0, max: 10, color: '#6366f1' },
          { label: '10 – 15', min: 10, max: 15, color: '#10b981' },
          { label: '15 – 20', min: 15, max: 20, color: '#f59e0b' },
          { label: '20 – 30', min: 20, max: 30, color: '#ec4899' },
          { label: '30+', min: 30, max: Infinity, color: '#ef4444' }
        ];
        const grouped = buckets.map(b => ({ ...b, bots: mpcBots.filter(b2 => b2.mpc >= b.min && b2.mpc < b.max) }));
        const maxCount = Math.max(...grouped.map(g => g.bots.length), 1);
        const barW = 90, gap = 24, padL = 36, padB = 40, padT = 28;
        const svgW = padL + grouped.length * (barW + gap) + 20;
        const chartH = 160, svgH = chartH + padT + padB;
        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(frac => {
          const val = Math.round(frac * maxCount);
          const y = padT + chartH - Math.round(frac * chartH);
          return '<line x1="' + (padL - 4) + '" y1="' + y + '" x2="' + (svgW - 10) + '" y2="' + y + '" stroke="rgba(148,163,184,0.12)" stroke-width="1"/><text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="9" fill="#64748b">' + val + '</text>';
        }).join('');
        const bars = grouped.map((g, i) => {
          const count = g.bots.length;
          const h = count > 0 ? Math.max(4, Math.round((count / maxCount) * chartH)) : 2;
          const x = padL + i * (barW + gap);
          const y = padT + chartH - h;
          const tipNames = [...g.bots].sort((a, b) => b.mpc - a.mpc).map(b => b.name + ' (' + b.mpc + ')').join('\\n');
          return '<g><title>' + g.label + ': ' + count + ' bot' + (count !== 1 ? 's' : '') + (tipNames ? '\\n' + tipNames : '') + '</title><rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="5" fill="' + g.color + '" opacity="0.85"/>' + (count > 0 ? '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#e2e8f0">' + count + '</text>' : '') + '<text x="' + (x + barW / 2) + '" y="' + (svgH - padB + 16) + '" text-anchor="middle" font-size="11" fill="#94a3b8">' + g.label + '</text><text x="' + (x + barW / 2) + '" y="' + (svgH - padB + 30) + '" text-anchor="middle" font-size="9" fill="#64748b">msg/chat</text></g>';
        }).join('');
        const medianMpc = [...mpcBots].sort((a, b) => a.mpc - b.mpc)[Math.floor(mpcBots.length / 2)]?.mpc;
        return '<div class="mc-overview-panel" style="margin-bottom:20px;"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap; gap:8px;"><div><h3 class="mc-panel-title" style="margin-bottom:2px;">📊 MpC Distribution — ' + filterScopeLabel.replace(/[\(\)]/g, '').trim() + '</h3><span style="font-size:0.75rem; color:var(--text-muted);">How consistently are your bots engaging? Hover a bar to see which bots fall there.' + (medianMpc !== undefined ? ' &middot; <strong style="color:var(--accent);">Median MpC: ' + medianMpc + '</strong>' : '') + '</span></div><span style="font-size:0.78rem; color:var(--text-secondary);">' + mpcBots.length + ' bot' + (mpcBots.length !== 1 ? 's' : '') + ' with data</span></div><svg width="100%" viewBox="0 0 ' + svgW + ' ' + svgH + '" style="overflow:visible; display:block; max-width:820px;">' + gridLines + bars + '</svg></div>';
      })()}

      <!-- 1. Public Release Leaderboard -->
      <div class="mc-metrics-section">
        <div class="mc-card-header-with-pills" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <h3 class="mc-section-title" style="margin-bottom:0;">📊 Leaderboard — by ${sortLabel}</h3>
            <button type="button" class="mc-btn mc-btn-primary mc-btn-sm mc-open-quick-metrics" title="Record Metric Snapshot for any release bot">⚡ Record Metric Snapshot</button>
          </div>
          <div class="mc-pill-group">
            <button class="mc-leaderboard-pill${sortMode === 'messages' ? ' active' : ''}" data-sort="messages">💬 By Messages</button>
            <button class="mc-leaderboard-pill${sortMode === 'chats' ? ' active' : ''}" data-sort="chats">👥 By Unique Chats</button>
            <button class="mc-leaderboard-pill${sortMode === 'favorites' ? ' active' : ''}" data-sort="favorites">⭐ By Favorites</button>
            <button class="mc-leaderboard-pill${sortMode === 'mpc' ? ' active' : ''}" data-sort="mpc">📐 By MpC</button>
          </div>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
          <span style="font-size:0.78rem; color:var(--text-muted); margin-right:4px;">Series:</span>
          <button class="mc-leaderboard-pill mc-series-filter-pill${seriesFilter === 'all' ? ' active' : ''}" data-series-filter="all">All</button>
          ${Object.entries(S.SERIES_OPTIONS).map(([k, v]) => `<button class="mc-leaderboard-pill mc-series-filter-pill${seriesFilter === k ? ' active' : ''}" data-series-filter="${k}">${v}</button>`).join('')}
        </div>
        ${sorted.length === 0
        ? '<p class="mc-empty-state">No metrics recorded yet. Edit a release record to add data.</p>'
        : `<div class="mc-table-wrap">
            <table class="mc-table">
              ${leaderboardTableHeaders}
              <tbody>${sorted.map((r, i) => metricRow(r, i + 1, r.status === 'Archived' ? 'archived' : (isPrivate(r) ? 'private' : 'public'))).join('')}</tbody>
            </table>
          </div>`}
      </div>

      <!-- 2. Private Bots Section -->
      ${privateReleases.length > 0 ? `
      <div class="mc-archived-section mc-private-section${S.state.privateExpanded ? '' : ' collapsed'}" style="margin-top:24px;">
        <div class="mc-archived-section-header" id="mc-private-toggle">
          <h3 class="mc-section-title" style="margin-bottom:0; cursor:pointer;">
            🔒 Private Bots
            <span class="mc-section-count">${privateReleases.length}</span>
            <span class="mc-archived-chevron">${S.state.privateExpanded ? '▼' : '▶'}</span>
          </h3>
        </div>
        <div class="mc-archived-section-body">
          ${privateSorted.length > 0 ? `
          <div class="mc-table-wrap" style="margin-top:12px;">
            <table class="mc-table">
              ${leaderboardTableHeaders}
              <tbody>${privateSorted.map((r, i) => metricRow(r, i + 1, 'private')).join('')}</tbody>
            </table>
          </div>` : '<p class="mc-empty-state" style="margin-top:8px;">No private bots with metrics.</p>'}
        </div>
      </div>` : ''}

      <!-- 3. Archived Bots Section -->
      ${archivedReleases.length > 0 ? `
      <div class="mc-archived-section${S.state.archivedExpanded ? '' : ' collapsed'}" style="margin-top:24px;">
        <div class="mc-archived-section-header" id="mc-archived-toggle">
          <h3 class="mc-section-title" style="margin-bottom:0; cursor:pointer;">
            📦 Archived Bots
            <span class="mc-section-count">${archivedReleases.length}</span>
            <span class="mc-archived-chevron">${S.state.archivedExpanded ? '▼' : '▶'}</span>
          </h3>
        </div>
        <div class="mc-archived-section-body">
          ${archivedSorted.length > 0 ? `
          <div class="mc-table-wrap" style="margin-top:12px;">
            <table class="mc-table">
              ${leaderboardTableHeaders}
              <tbody>${archivedSorted.map((r, i) => metricRow(r, i + 1, 'archived')).join('')}</tbody>
            </table>
          </div>` : '<p class="mc-empty-state" style="margin-top:8px;">No archived bots with metrics.</p>'}
        </div>
      </div>` : ''}

      <!-- 4. Released — No Metrics Yet -->
      ${noMetrics.length > 0 ? `
      <div class="mc-metrics-section" style="margin-top:24px;">
        <h3 class="mc-section-title">⏳ Released — No Metrics Yet
          <span class="mc-section-count">${noMetrics.length}</span>
        </h3>
        <div class="mc-table-wrap">
          <table class="mc-table">
            <thead><tr><th>Name</th><th>Universe</th><th>Scheduled</th><th></th></tr></thead>
            <tbody>
              ${noMetrics.map(r => `
                <tr class="mc-row" style="opacity:0.6;">
                  <td><button class="mc-name-link mc-edit-record" data-record-id="${r.id}">${esc(r.name)}</button></td>
                  <td>${S.universeBadge(r.universe)}</td>
                  <td>${S.formatDate(r.scheduledDate)}</td>
                  <td><button class="mc-action-btn mc-open-quick-metrics" data-record-id="${r.id}" title="Record / Edit Metrics">+ Add Metrics</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;
  }

  window.MissionControlTabs = window.MissionControlTabs || {};
  window.MissionControlTabs.renderMetrics = renderMetrics;
})();
