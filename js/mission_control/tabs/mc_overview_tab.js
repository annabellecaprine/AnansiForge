/**
 * js/mission_control/tabs/mc_overview_tab.js
 * Anansi Forge Mission Control - Overview Tab Dashboard
 */

(() => {
    const getS = () => window.MissionControlState;
    const getC = () => window.MissionControlCharts;

    async function renderOverview() {
        const S = getS();
        const C = getC();
        if (!S || !C) return '';

        const esc = S.esc;
        const universeBadge = S.universeBadge;
        const readinessBar = S.readinessBar;
        const calcReadinessForVault = S.calcReadinessForVault;
        const calcReadinessForRecord = S.calcReadinessForRecord;
        const isReleasePublished = S.isReleasePublished;
        const PIPELINE_STEPS = S.PIPELINE_STEPS;
        const CATEGORY_LABELS = S.CATEGORY_LABELS;
        const UNIVERSE_COLORS = S.UNIVERSE_COLORS;
        const ROLE_COLORS = S.ROLE_COLORS;
        const ROLE_ICONS = S.ROLE_ICONS;

        const comps = S.state.allComponents;
        const records = S.state.allTrackerRecords;

        const byCategory = (cat) => comps.filter(c => c.category === cat);
        const chars = byCategory('character');
        const scenarios = byCategory('scenario');
        const stubs = records.filter(r => r.assetType === 'concept_stub' && !r.promotedToVaultId);
        const stories = records.filter(r => r.assetType === 'story');
        const releases = records.filter(r => r.assetType === 'release' && r.status !== 'Archived');
        const publishedReleases = releases.filter(isReleasePublished);
        const readyToLaunch = releases.filter(r => {
            const steps = PIPELINE_STEPS.release;
            return steps.every(s => r.pipeline?.[s]) && !isReleasePublished(r);
        });

        const selectedUniCat = S.state.overviewFilters?.universeCat || 'all';
        const targetUniComps = selectedUniCat === 'all'
            ? comps
            : comps.filter(c => c.category === selectedUniCat);

        const universeCount = {};
        targetUniComps.forEach(c => {
            const u = c.tracker?.universe || c.universe || 'Other';
            universeCount[u] = (universeCount[u] || 0) + 1;
        });

        const selectedRoleMode = S.state.overviewFilters?.roleMode || 'role';
        const roleCount = { Hero: 0, Villain: 0, AntiHero: 0, Support: 0, Other: 0 };
        chars.forEach(c => {
            const r = c.tracker?.role || 'Other';
            roleCount[r] = (roleCount[r] || 0) + 1;
        });

        const factionCount = {};
        comps.forEach(c => {
            const f = (c.tracker?.faction || c.faction || '').trim();
            if (f) {
                factionCount[f] = (factionCount[f] || 0) + 1;
            }
        });

        const catCount = {};
        comps.forEach(c => {
            const catName = CATEGORY_LABELS[c.category] || c.category;
            catCount[catName] = (catCount[catName] || 0) + 1;
        });

        const p1VaultIncomplete = comps.filter(c => {
            const prio = c.tracker?.priority || c.priority;
            const isDone = c.tracker?.pipeline?.complete || c.tracker?.pipeline?.published;
            return prio === 'P1' && !isDone;
        }).map(c => ({
            id: c.id,
            name: c.name,
            universe: c.tracker?.universe || c.universe,
            isVault: true,
            comp: c
        }));

        const p1RecordIncomplete = records.filter(r => {
            const prio = r.priority || r.tracker?.priority;
            const isDone = r.pipeline?.complete || r.pipeline?.published || isReleasePublished(r);
            return prio === 'P1' && !isDone;
        }).map(r => ({
            id: r.id,
            name: r.name,
            universe: r.universe,
            isVault: false,
            rec: r
        }));

        const p1Incomplete = [...p1VaultIncomplete, ...p1RecordIncomplete];

        let activityLogs = [];
        if (window.ForgeDB?.getRecentActivity) {
            try { activityLogs = await window.ForgeDB.getRecentActivity(12); } catch (e) { console.error(e); }
        }

        let snapshots = [];
        if (window.ForgeDB?.getSnapshots) {
            try { snapshots = await window.ForgeDB.getSnapshots(6); } catch (e) { console.error(e); }
        }

        const kpiCard = (icon, label, value, sub = '', color = 'var(--accent)') =>
            `<div class="mc-kpi-card">
        <div class="mc-kpi-icon" style="color:${color}">${icon}</div>
        <div class="mc-kpi-body">
          <div class="mc-kpi-value">${value}</div>
          <div class="mc-kpi-label">${label}</div>
          ${sub ? `<div class="mc-kpi-sub">${sub}</div>` : ''}
        </div>
      </div>`;

        const totalVault = comps.length;
        const totalPublished = comps.filter(c => c.tracker?.pipeline?.published).length;
        const totalComplete = comps.filter(c => c.tracker?.pipeline?.complete).length;
        const totalInProgress = comps.filter(c => {
            const p = c.tracker?.pipeline || {};
            return Object.values(p).some(v => v) && !p.complete;
        }).length;

        const formatTimeAgo = (isoStr) => {
            if (!isoStr) return 'recently';
            const diffSec = Math.floor((new Date() - new Date(isoStr)) / 1000);
            if (diffSec < 60) return 'just now';
            if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
            if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
            return `${Math.floor(diffSec / 86400)}d ago`;
        };

        const actionIcons = {
            created: '🟢', updated: '🟡', tracker_updated: '🟡', edited: '🟡',
            scheduled: '🚀', metrics_updated: '📈', metrics: '📈', published: '✅',
            released: '✅', deleted: '🗑️', record_saved: '📝', project_compiled: '🤖'
        };

        const actionLabels = {
            created: 'created', updated: 'updated', tracker_updated: 'updated', edited: 'updated',
            scheduled: 'scheduled', metrics_updated: 'metrics updated', metrics: 'metrics updated',
            published: 'published', released: 'published', deleted: 'deleted', record_saved: 'saved', project_compiled: 'compiled'
        };

        return `<div class="mc-overview">
      <div class="mc-kpi-grid">
        ${kpiCard('🗄', 'Total Vault Items', totalVault, `${chars.length} chars · ${scenarios.length} scenarios`)}
        ${kpiCard('✅', 'Published', totalPublished, `${Math.round(totalPublished / Math.max(totalVault, 1) * 100)}% of vault`, 'var(--success)')}
        ${kpiCard('🔄', 'In Progress', totalInProgress, `${totalComplete} complete, pending publish`, 'var(--warning)')}
        ${kpiCard('💡', 'Concept Stubs', stubs.length, 'items queued to build', 'var(--text-muted)')}
        ${kpiCard('🚀', 'Ready to Launch', readyToLaunch.length, `${publishedReleases.length} launched · ${readyToLaunch.length} pending`, '#f59e0b')}
        ${kpiCard('📖', 'Stories', stories.length, `${stories.filter(s => s.pipeline?.published).length} published`)}
      </div>

      <div class="mc-overview-panel mc-burndown-panel" style="margin-bottom:1.25rem;">
        <h3 class="mc-panel-title">📈 Pipeline Burndown — Vault & Release Publication History</h3>
        <p class="card-desc" style="margin-bottom:10px; font-size:0.75rem; color:var(--text-muted);">
          Tracks daily publication progress across all Vault components and Bot Releases over time.
        </p>
        ${snapshots.length === 0
                ? '<p class="mc-empty-state">Snapshot history recording active. Returns snapshots on future visits!</p>'
                : `<div class="mc-burndown-chart">
              ${snapshots.map(s => {
                    const tot = s.totalItems || s.data?.totalItems || 1;
                    const pub = s.publishedCount ?? s.data?.publishedCount ?? 0;
                    const pct = Math.round(pub / Math.max(tot, 1) * 100);
                    return `<div class="mc-burndown-row">
                  <span class="mc-burndown-date">${s.date || 'Today'}</span>
                  <div class="mc-burndown-bar-wrap">
                    <div class="mc-burndown-bar" style="width:${pct}%"></div>
                  </div>
                  <span class="mc-burndown-pct">${pct}% (${pub}/${tot} published)</span>
                </div>`;
                }).join('')}
            </div>`
            }
      </div>

      <div class="mc-overview-grid">
        <div class="mc-overview-panel">
          <div class="mc-card-header-with-pills">
            <h3 class="mc-panel-title">🌌 Universe Split</h3>
            <div class="mc-pill-group">
              <button class="mc-overview-uni-pill${selectedUniCat === 'all' ? ' active' : ''}" data-cat="all">All</button>
              <button class="mc-overview-uni-pill${selectedUniCat === 'character' ? ' active' : ''}" data-cat="character">Chars</button>
              <button class="mc-overview-uni-pill${selectedUniCat === 'organization' ? ' active' : ''}" data-cat="organization">Orgs</button>
              <button class="mc-overview-uni-pill${selectedUniCat === 'scenario' ? ' active' : ''}" data-cat="scenario">Scenarios</button>
              <button class="mc-overview-uni-pill${selectedUniCat === 'initial_message' ? ' active' : ''}" data-cat="initial_message">Init</button>
            </div>
          </div>
          <div class="mc-universe-bars">
            ${Object.keys(universeCount).length === 0
                ? '<p class="mc-empty-state">No items in this category.</p>'
                : Object.entries(universeCount).sort((a, b) => b[1] - a[1]).map(([u, n]) => {
                    const pct = Math.round(n / Math.max(targetUniComps.length, 1) * 100);
                    const col = (S.state.universeColorMap && S.state.universeColorMap[u]) || UNIVERSE_COLORS[u] || '#6b7280';
                    return `<div class="mc-uni-row">
                  <span class="mc-uni-label" style="color:${col}">${esc(u)}</span>
                  <div class="mc-uni-bar-wrap">
                    <div class="mc-uni-bar" style="width:${pct}%;background:${col};"></div>
                  </div>
                  <span class="mc-uni-count">${n}</span>
                </div>`;
                }).join('')}
          </div>
        </div>

        <div class="mc-overview-panel">
          <div class="mc-card-header-with-pills">
            <h3 class="mc-panel-title">🎭 ${selectedRoleMode === 'faction' ? 'Faction Concentration' : 'Role Breakdown'}</h3>
            <div class="mc-pill-group">
              <button class="mc-overview-role-pill${selectedRoleMode === 'role' ? ' active' : ''}" data-mode="role">Roles</button>
              <button class="mc-overview-role-pill${selectedRoleMode === 'faction' ? ' active' : ''}" data-mode="faction">Factions</button>
            </div>
          </div>
          <div class="mc-universe-bars">
            ${selectedRoleMode === 'faction'
                ? (Object.keys(factionCount).length === 0
                    ? '<p class="mc-empty-state">No factions set on components yet.</p>'
                    : Object.entries(factionCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => {
                        const pct = Math.round(n / Math.max(comps.length, 1) * 100);
                        return `<div class="mc-uni-row">
                        <span class="mc-uni-label" style="color:var(--text-secondary); min-width:85px;">${esc(f)}</span>
                        <div class="mc-uni-bar-wrap">
                          <div class="mc-uni-bar" style="width:${pct}%;background:var(--accent);"></div>
                        </div>
                        <span class="mc-uni-count">${n}</span>
                      </div>`;
                    }).join(''))
                : Object.entries(roleCount).filter(([_, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([r, n]) => {
                    const pct = Math.round(n / Math.max(chars.length, 1) * 100);
                    const col = ROLE_COLORS[r] || '#6b7280';
                    const icon = ROLE_ICONS[r] || '❓';
                    return `<div class="mc-uni-row">
                    <span class="mc-uni-label" style="color:${col}">${icon} ${r}</span>
                    <div class="mc-uni-bar-wrap">
                      <div class="mc-uni-bar" style="width:${pct}%;background:${col};"></div>
                    </div>
                    <span class="mc-uni-count">${n}</span>
                  </div>`;
                }).join('')
            }
          </div>
        </div>

        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🗄️ Vault Composition — All Items</h3>
          <div class="mc-universe-bars">
            ${Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([cat, n]) => {
                const pct = Math.round(n / Math.max(comps.length, 1) * 100);
                return `<div class="mc-uni-row">
                <span class="mc-uni-label" style="color:var(--text-secondary); min-width:85px;">${cat}</span>
                <div class="mc-uni-bar-wrap">
                  <div class="mc-uni-bar" style="width:${pct}%;background:var(--accent);"></div>
                </div>
                <span class="mc-uni-count">${n}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">⚡ Priority Queue — P1 Incomplete</h3>
          ${p1Incomplete.length === 0
                ? '<p class="mc-empty-state">All P1 items complete! 🎉</p>'
                : `<div class="mc-priority-list">
                ${p1Incomplete.slice(0, 8).map(item => {
                    const score = item.isVault ? calcReadinessForVault(item.comp) : calcReadinessForRecord(item.rec);
                    return `
                    <div class="mc-priority-row">
                      <span class="mc-priority-name">${esc(item.name)}</span>
                      ${universeBadge(item.universe)}
                      <div class="mc-priority-bar">${readinessBar(score, true)}</div>
                    </div>`;
                }).join('')}
              </div>`
            }
        </div>

        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🚀 Ready to Launch</h3>
          ${readyToLaunch.length === 0
                ? '<p class="mc-empty-state">No releases fully pre-checked yet.</p>'
                : readyToLaunch.slice(0, 5).map(r => `
                <div class="mc-priority-row">
                  <span class="mc-priority-name">${esc(r.name)}</span>
                  ${universeBadge(r.universe)}
                  <span class="mc-badge" style="background:#10b98122;color:var(--success);border:1px solid #10b98144;">Ready ✓</span>
                </div>`).join('')
            }
        </div>

        ${(() => {
                const allCandidates = S.state.allTrackerRecords.filter(r => r.assetType === 'release' || r.assetType === 'story');

                const getReleasePublishTimestamp = (rec) => {
                    const dStr = rec.scheduledDate || rec.publishedDate || rec.privateLaunchDate || rec.metrics?.date || rec.createdAt;
                    if (dStr) {
                        const parsed = new Date(dStr).getTime();
                        if (!isNaN(parsed) && parsed > 0) return parsed;
                    }
                    return 0;
                };

                const releases = allCandidates.sort((a, b) => {
                    const aMsgs = a.metrics?.messages || 0;
                    const bMsgs = b.metrics?.messages || 0;
                    const aHasMetrics = aMsgs > 0 || (a.metrics?.uniqueChats || 0) > 0 || (a.metrics?.favorites || 0) > 0;
                    const bHasMetrics = bMsgs > 0 || (b.metrics?.uniqueChats || 0) > 0 || (b.metrics?.favorites || 0) > 0;

                    if (aHasMetrics && !bHasMetrics) return -1;
                    if (!aHasMetrics && bHasMetrics) return 1;

                    return getReleasePublishTimestamp(b) - getReleasePublishTimestamp(a);
                }).slice(0, 10);

                const items = releases.map(r => {
                    const pubDateStr = r.scheduledDate || r.publishedDate || r.privateLaunchDate || r.metrics?.date || r.createdAt;
                    const dateFormatted = pubDateStr ? new Date(pubDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '';
                    return {
                        id: r.id,
                        label: `${r.name}${dateFormatted ? ` (${dateFormatted})` : ''}`,
                        value: r.metrics?.messages || 0,
                        unit: 'msgs',
                        color: 'linear-gradient(90deg, #6366f1, #a855f7)',
                        badgeHtml: r.iterationLabel ? `<span class="mc-badge mc-iteration-badge">🏷️ ${esc(r.iterationLabel)}</span>` : ''
                    };
                });

                return C.renderHorizontalBarChart(items, '🚀 Rolling Release Performance', 'Last 10 Releases · Sorted by actual bot release dates');
            })()}

        ${(() => {
                const uniCounts = {};
                (S.state.allUniverses || []).forEach(u => { uniCounts[u.name] = { name: u.name, msgs: 0, color: u.color }; });

                S.state.allTrackerRecords.forEach(r => {
                    const uName = r.universe || 'Other';
                    if (!uniCounts[uName]) uniCounts[uName] = { name: uName, msgs: 0, color: '#6b7280' };
                    uniCounts[uName].msgs += (r.metrics?.messages || 0);
                });

                const items = Object.values(uniCounts)
                    .filter(u => u.msgs > 0)
                    .sort((a, b) => b.msgs - a.msgs)
                    .slice(0, 8)
                    .map(u => ({
                        label: u.name,
                        value: u.msgs,
                        unit: 'msgs',
                        color: u.color || '#6366f1'
                    }));

                return C.renderHorizontalBarChart(items, '🌌 Universe Health Distribution', 'Total Messages by Universe · Have you neglected a universe lately?');
            })()}

        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">📜 Activity Feed Timeline</h3>
          <div class="mc-activity-feed">
            ${activityLogs.length === 0
                ? '<p class="mc-empty-state">No recent activity logged yet.</p>'
                : activityLogs.map(log => `
                <div class="mc-activity-entry">
                  <span class="mc-activity-icon">${actionIcons[log.action] || '🟡'}</span>
                  <div class="mc-activity-details">
                    <span class="mc-activity-target">${esc(log.targetName || 'Item')}</span>
                    <span class="mc-activity-action">${actionLabels[log.action] || esc(log.action.replace('_', ' '))} ${log.details ? `(${esc(log.details)})` : ''}</span>
                  </div>
                  <span class="mc-activity-time">${formatTimeAgo(log.timestamp)}</span>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
    </div>`;
    }

    window.MissionControlTabs = window.MissionControlTabs || {};
    window.MissionControlTabs.renderOverview = renderOverview;
})();
