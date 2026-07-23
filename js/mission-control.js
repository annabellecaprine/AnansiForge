/**
 * mission-control.js - Anansi Forge Mission Control Dashboard
 *
 * Adds a production-tracking layer on top of existing vault components.
 * - Vault components (chars, scenarios, orgs etc.) get inline pipeline tracking
 * - tracker_records store holds Stories, Releases, and Concept Stubs
 */

(() => {

  // ─── Constants ───────────────────────────────────────────────────────────────

  const PIPELINE_STEPS = {
    character:      ['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    scenario:       ['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    bio:            ['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    initial_message:['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    organization:   ['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    concept_stub:   ['generated','goldenTemplate','test1','trimmed','test2','complete','published'],
    story:          ['concept','notesReady','initialMessage','bio','otherMessages','testing','complete','published'],
    release:        ['staged','bio','scenario','initialMessage','personalityLocked','thumbnail','banner','tagsDone','initialTest','regressionTest','finalPolish','ready']
  };

  const STEP_LABELS = {
    generated: 'Generated', goldenTemplate: '⭐ Template', test1: 'Test 1', trimmed: 'Trimmed',
    test2: 'Test 2', complete: 'Complete', published: 'Published',
    concept: 'Concept', notesReady: 'Notes', initialMessage: 'Init Msg', bio: 'Bio',
    otherMessages: 'Other Msgs', testing: 'Testing',
    staged: 'Staged', scenario: 'Scenario', personalityLocked: 'Personality', thumbnail: 'Thumbnail',
    banner: 'Banner', tagsDone: 'Tags', initialTest: 'Test 1', regressionTest: 'Regression', finalPolish: 'Polish', ready: 'Ready'
  };

  const UNIVERSE_COLORS = { DC: '#2563eb', Marvel: '#dc2626', OC: '#7c3aed', Mixed: '#d97706', Other: '#6b7280' };
  const PRIORITY_ORDER  = { P1: 0, P2: 1, P3: 2, P4: 3, null: 4 };
  const CATEGORY_LABELS = {
    character: 'Characters', scenario: 'Scenarios', bio: 'Bios',
    initial_message: 'Initial Messages', organization: 'Organizations'
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  let state = {
    activeSubTab: 'overview',
    activeCategory: 'character',   // for asset tabs
    allComponents: [],             // vault_components cache
    allTrackerRecords: [],         // tracker_records cache
    allProjects: [],               // projects cache
    compMap: new Map(),            // O(1) id lookup
    recordMap: new Map(),          // O(1) id lookup
    pageSize: 50,                  // 50, 100, 250, or 'all'
    currentPage: 1,
    selectedIds: new Set(),        // bulk operations selection
    focusedRowIndex: -1,           // keyboard nav focused row
    sortDir: 'desc',               // 'desc' = most ready first
    groupByPriority: false,
    filters: { search: '', universe: 'all', priority: 'all', role: 'all', tag: '' },
    activeTagFilter: '',
    editingRecord: null,           // modal state
    calendarWeekOffset: 0
  };

  // ─── Readiness Scoring ────────────────────────────────────────────────────────

  function calcReadiness(pipeline, category) {
    const steps = PIPELINE_STEPS[category] || PIPELINE_STEPS.character;
    if (!steps.length) return 0;
    const checked = steps.filter(s => pipeline && pipeline[s]).length;
    return checked / steps.length;
  }

  function calcReadinessForVault(comp) {
    return calcReadiness(comp.tracker?.pipeline, comp.category);
  }

  function calcReadinessForRecord(rec) {
    return calcReadiness(rec.pipeline, rec.assetType);
  }

  function priorityBoost(priority) {
    return priority === 'P1' ? 0.005 : priority === 'P2' ? 0.003 : priority === 'P3' ? 0.001 : 0;
  }

  function sortByReadiness(items, getScore, getPriority, dir) {
    return [...items].sort((a, b) => {
      const sa = getScore(a) + priorityBoost(getPriority(a));
      const sb = getScore(b) + priorityBoost(getPriority(b));
      return dir === 'desc' ? sb - sa : sa - sb;
    });
  }

  // ─── Filter Logic ─────────────────────────────────────────────────────────────

  function filterComponents(components) {
    let items = components;
    const { search, universe, priority, role } = state.filters;
    const activeTag = state.activeTagFilter;

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.lineage || '').toLowerCase().includes(q) ||
        (c.tracker?.project || '').toLowerCase().includes(q)
      );
    }
    if (universe !== 'all') items = items.filter(c => (c.tracker?.universe || '') === universe);
    if (priority !== 'all') items = items.filter(c => (c.tracker?.priority || null) === priority);
    if (role !== 'all')     items = items.filter(c => (c.tracker?.role || '') === role);
    if (activeTag) {
      items = items.filter(c =>
        (c.tags || []).includes(activeTag) ||
        (c.tracker?.trackerTags || []).includes(activeTag)
      );
    }
    return items;
  }

  function filterTrackerRecords(records) {
    let items = records;
    const { search, universe, priority, role } = state.filters;
    const activeTag = state.activeTagFilter;

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(r => r.name.toLowerCase().includes(q) || (r.project || '').toLowerCase().includes(q));
    }
    if (universe !== 'all') items = items.filter(r => (r.universe || '') === universe);
    if (priority !== 'all') items = items.filter(r => (r.priority || null) === priority);
    if (activeTag) items = items.filter(r => (r.tags || []).includes(activeTag));
    return items;
  }

  // ─── Data Loaders ─────────────────────────────────────────────────────────────

  async function loadAll() {
    const [comps, records, projects, universes] = await Promise.all([
      window.ForgeDB.getAllComponents(),
      window.ForgeDB.getAllTrackerRecords(),
      window.ForgeDB.getAllProjects(),
      window.ForgeDB.getAllUniverses ? window.ForgeDB.getAllUniverses() : Promise.resolve([])
    ]);
    state.allComponents = comps;
    state.allTrackerRecords = records;
    state.allProjects = projects || [];
    state.allUniverses = universes || [];
    state.compMap = new Map(comps.map(c => [c.id, c]));
    state.recordMap = new Map(records.map(r => [r.id, r]));

    // Build color map
    const colorMap = {};
    (state.allUniverses || []).forEach(u => {
      if (u.name) colorMap[u.name] = u.color || '#6b7280';
      if (u.id) colorMap[u.id] = u.color || '#6b7280';
    });
    state.universeColorMap = colorMap;

    // Auto-capture daily burndown snapshot when Mission Control is loaded
    if (window.ForgeDB?.captureSnapshot) {
      window.ForgeDB.captureSnapshot().catch(err => console.error(err));
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function readinessBar(score, small = false) {
    const pct = Math.round(score * 100);
    const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : pct >= 30 ? 'var(--warning)' : 'var(--text-muted)';
    const h = small ? '4px' : '6px';
    return `<div class="mc-readiness-bar" style="height:${h}; background:var(--border-color); border-radius:3px; overflow:hidden; min-width:60px;">
      <div style="width:${pct}%; height:100%; background:${color}; transition:width 0.3s ease;"></div>
    </div><span class="mc-readiness-pct" style="font-size:0.7rem; color:var(--text-muted);">${pct}%</span>`;
  }

  // Compact percentage badge for table rows (no bar — saves horizontal space)
  function readinessPct(score) {
    const pct = Math.round(score * 100);
    const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : pct >= 30 ? 'var(--warning)' : 'var(--text-muted)';
    return `<span class="mc-readiness-pct-badge" style="color:${color};">${pct}%</span>`;
  }

  function priorityBadge(p) {
    if (!p) return '';
    const colors = { P1: '#ef4444', P2: '#f59e0b', P3: '#3b82f6', P4: '#6b7280' };
    return `<span class="mc-badge" style="background:${colors[p]}22; color:${colors[p]}; border:1px solid ${colors[p]}44;">${p}</span>`;
  }

  const ROLE_COLORS = {
    Hero: '#10b981',      // Emerald Green
    Villain: '#ef4444',   // Crimson Red
    AntiHero: '#f59e0b',  // Amber
    Support: '#06b6d4',   // Cyan
    Other: '#6b7280'      // Gray
  };

  const ROLE_ICONS = {
    Hero: '🦸',
    Villain: '🦹',
    AntiHero: '⚡',
    Support: '🤝',
    Other: '❓'
  };

  function roleBadge(r) {
    if (!r) return '';
    const c = ROLE_COLORS[r] || '#6b7280';
    const icon = ROLE_ICONS[r] || '';
    return `<span class="mc-badge" style="background:${c}22; color:${c}; border:1px solid ${c}44;">${icon} ${esc(r)}</span>`;
  }

  function universeBadge(u) {
    if (!u) return '';
    const c = (state.universeColorMap && state.universeColorMap[u]) || UNIVERSE_COLORS[u] || '#6b7280';
    return `<span class="mc-badge" style="background:${c}22; color:${c}; border:1px solid ${c}44;">${esc(u)}</span>`;
  }

  function universeSelectOptionsHTML(selectedVal, defaultLabel = 'Select Universe') {
    const list = (state.allUniverses && state.allUniverses.length > 0) ? state.allUniverses : (window.ForgeDB?.DEFAULT_UNIVERSES || []);
    const groups = {};
    list.forEach(u => {
      const g = u.genre || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(u);
    });

    let html = defaultLabel ? `<option value="">${esc(defaultLabel)}</option>` : '';
    const sortedGenres = Object.keys(groups).sort();
    sortedGenres.forEach(g => {
      html += `<optgroup label="${esc(g)}">`;
      groups[g].forEach(u => {
        const isSel = (selectedVal === u.name || selectedVal === u.id);
        html += `<option value="${esc(u.name)}" ${isSel ? 'selected' : ''}>${esc(u.name)}</option>`;
      });
      html += `</optgroup>`;
    });
    return html;
  }

  function universeFilterOptionsHTML(selectedVal) {
    let html = `<option value="all" ${selectedVal === 'all' ? 'selected' : ''}>All Universes</option>`;
    const list = (state.allUniverses && state.allUniverses.length > 0) ? state.allUniverses : (window.ForgeDB?.DEFAULT_UNIVERSES || []);
    const groups = {};
    list.forEach(u => {
      const g = u.genre || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(u);
    });

    const sortedGenres = Object.keys(groups).sort();
    sortedGenres.forEach(g => {
      html += `<optgroup label="${esc(g)}">`;
      groups[g].forEach(u => {
        const isSel = (selectedVal === u.name || selectedVal === u.id);
        html += `<option value="${esc(u.name)}" ${isSel ? 'selected' : ''}>${esc(u.name)}</option>`;
      });
      html += `</optgroup>`;
    });
    return html;
  }

  function tagChip(tag, active = false) {
    return `<button class="mc-tag-chip${active ? ' active' : ''}" data-tag="${esc(tag)}">#${esc(tag)}</button>`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ─── Pipeline Checkbox Cell ───────────────────────────────────────────────────

  function pipelineCheckboxes(pipeline, steps, recordId, isVault) {
    return steps.map(step => {
      const checked = pipeline && pipeline[step];
      const storeType = isVault ? 'vault' : 'record';
      return `<td class="mc-pipe-cell">
        <button class="mc-pipe-btn${checked ? ' checked' : ''}"
          title="${STEP_LABELS[step] || step}"
          data-id="${recordId}" data-step="${step}" data-store="${storeType}"
          aria-label="${STEP_LABELS[step] || step}: ${checked ? 'checked' : 'unchecked'}">
          ${checked ? '✓' : ''}
        </button>
      </td>`;
    }).join('');
  }

  function toolbarHTML(showAddStub = true, showAddRecord = false, recordType = '') {
    const priorities = ['P1','P2','P3','P4'];
    const roles = ['Hero','Villain','AntiHero','Support','Other'];
    return `<div class="mc-toolbar">
      <div class="mc-toolbar-left">
        <input type="text" id="mc-search" class="mc-search" placeholder="Search…" value="${esc(state.filters.search)}">
        <select id="mc-filter-universe" class="mc-filter-select">
          ${universeFilterOptionsHTML(state.filters.universe)}
        </select>
        <select id="mc-filter-role" class="mc-filter-select">
          <option value="all">All Roles</option>
          ${roles.map(r => `<option value="${r}" ${state.filters.role===r?'selected':''}>${r}</option>`).join('')}
        </select>
        <select id="mc-filter-priority" class="mc-filter-select">
          <option value="all">All Priorities</option>
          ${priorities.map(p => `<option value="${p}" ${state.filters.priority===p?'selected':''}>${p}</option>`).join('')}
        </select>
        <button class="mc-btn mc-btn-ghost mc-sort-btn" id="mc-sort-toggle" title="Toggle sort direction">
          ${state.sortDir === 'desc' ? '↓ Most Ready' : '↑ Least Ready'}
        </button>
        <button class="mc-btn mc-btn-ghost${state.groupByPriority?' active':''}" id="mc-group-priority" title="Group by priority">
          🏷 Priority Groups
        </button>
      </div>
      <div class="mc-toolbar-right">
        ${state.activeTagFilter ? `<button class="mc-tag-chip active" id="mc-clear-tag">✕ #${esc(state.activeTagFilter)}</button>` : ''}
        ${showAddStub ? `<button class="mc-btn mc-btn-primary" id="mc-add-stub">+ Concept</button>` : ''}
        ${showAddRecord ? `<button class="mc-btn mc-btn-primary" id="mc-add-record" data-type="${recordType}">+ Add ${recordType === 'story' ? 'Story' : 'Release'}</button>` : ''}
        <button class="mc-btn mc-btn-ghost" id="btn-mc-manage-universes" onclick="if(window.MissionControl && window.MissionControl.openUniverseManagerModal) window.MissionControl.openUniverseManagerModal();" title="Manage Universes & Genres">⚙️ Universes</button>
      </div>
    </div>`;
  }

  // ─── Sub-tab bar ─────────────────────────────────────────────────────────────

  function subTabBar() {
    const tabs = [
      { id: 'overview',    label: '📊 Overview' },
      { id: 'stories',     label: '📖 Stories' },
      { id: 'characters',  label: '👤 Characters' },
      { id: 'orgs',        label: '🏢 Orgs' },
      { id: 'scenarios',   label: '🎭 Scenarios' },
      { id: 'messages',    label: '💬 Init Msgs' },
      { id: 'bios',        label: '📋 Bios' },
      { id: 'launchpad',   label: '🚀 Launch Pad' },
      { id: 'metrics',     label: '📈 Metrics' },
      { id: 'import',      label: '⚙ Import' }
    ];
    return `<div class="mc-subtab-bar">
      ${tabs.map(t => `<button class="mc-subtab${state.activeSubTab === t.id ? ' active' : ''}" data-subtab="${t.id}">${t.label}</button>`).join('')}
    </div>`;
  }

  // ─── Bulk Operations Toolbar ──────────────────────────────────────────────────

  function bulkToolbarHTML() {
    const count = state.selectedIds.size;
    if (count === 0) return '';
    return `<div class="mc-bulk-toolbar">
      <div class="mc-bulk-info">✓ <strong>${count}</strong> selected</div>
      <div class="mc-bulk-actions">
        <select id="mc-bulk-universe" class="mc-filter-select mc-bulk-select">
          <option value="">Set Universe…</option>
          ${universeSelectOptionsHTML(tracker ? tracker.universe : '', 'Universe')}
        </select>
        <select id="mc-bulk-role" class="mc-filter-select mc-bulk-select">
          <option value="">Set Role…</option>
          ${['Hero','Villain','AntiHero','Support','Other'].map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
        <select id="mc-bulk-priority" class="mc-filter-select mc-bulk-select">
          <option value="">Set Priority…</option>
          ${['P1','P2','P3','P4'].map(p => `<option value="${p}">${p}</option>`).join('')}
          <option value="__clear__">Clear Priority</option>
        </select>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-bulk-pin">📌 Pin All</button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-bulk-unpin">Unpin All</button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-bulk-deselect">✕ Deselect</button>
      </div>
    </div>`;
  }

  // ─── Overview View ────────────────────────────────────────────────────────────

  async function renderOverview() {
    const comps = state.allComponents;
    const records = state.allTrackerRecords;

    const byCategory = (cat) => comps.filter(c => c.category === cat);
    const chars = byCategory('character');
    const scenarios = byCategory('scenario');
    const stubs = records.filter(r => r.assetType === 'concept_stub' && !r.promotedToVaultId);
    const stories = records.filter(r => r.assetType === 'story');
    const releases = records.filter(r => r.assetType === 'release');
    const readyToLaunch = releases.filter(r => {
      const steps = PIPELINE_STEPS.release;
      return steps.every(s => r.pipeline?.[s]) && !r.pipeline?.released;
    });

    // Universe distribution across characters
    const universeCount = {};
    chars.forEach(c => {
      const u = c.tracker?.universe || 'Other';
      universeCount[u] = (universeCount[u] || 0) + 1;
    });

    // Role distribution across characters
    const roleCount = { Hero: 0, Villain: 0, AntiHero: 0, Support: 0, Other: 0 };
    chars.forEach(c => {
      const r = c.tracker?.role || 'Other';
      roleCount[r] = (roleCount[r] || 0) + 1;
    });

    // Category distribution across vault components
    const catCount = {};
    comps.forEach(c => {
      const catName = CATEGORY_LABELS[c.category] || c.category;
      catCount[catName] = (catCount[catName] || 0) + 1;
    });

    // Priority queue: P1 items not yet complete
    const p1Incomplete = comps.filter(c => c.tracker?.priority === 'P1' && !c.tracker?.pipeline?.complete);

    // Fetch real activity log from IndexedDB
    let activityLogs = [];
    if (window.ForgeDB?.getRecentActivity) {
      try { activityLogs = await window.ForgeDB.getRecentActivity(12); } catch (e) { console.error(e); }
    }

    // Fetch burndown snapshots
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
      if (diffSec < 3600) return `${Math.floor(diffSec/60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec/3600)}h ago`;
      return `${Math.floor(diffSec/86400)}d ago`;
    };

    const actionIcons = { created: '✨', edited: '✏️', deleted: '🗑️', tracker_updated: '🔧', record_saved: '📝', project_compiled: '🤖' };

    return `<div class="mc-overview">
      <div class="mc-kpi-grid">
        ${kpiCard('🗄', 'Total Vault Items', totalVault, `${chars.length} chars · ${scenarios.length} scenarios`)}
        ${kpiCard('✅', 'Published', totalPublished, `${Math.round(totalPublished/Math.max(totalVault,1)*100)}% of vault`, 'var(--success)')}
        ${kpiCard('🔄', 'In Progress', totalInProgress, `${totalComplete} complete, pending publish`, 'var(--warning)')}
        ${kpiCard('💡', 'Concept Stubs', stubs.length, 'items queued to build', 'var(--text-muted)')}
        ${kpiCard('🚀', 'Ready to Launch', readyToLaunch.length, 'releases fully pre-checked', '#f59e0b')}
        ${kpiCard('📖', 'Stories', stories.length, `${stories.filter(s=>s.pipeline?.published).length} published`)}
      </div>

      <!-- Pipeline Burndown Progress Chart -->
      <div class="mc-overview-panel mc-burndown-panel" style="margin-bottom:1.25rem;">
        <h3 class="mc-panel-title">📈 Pipeline Burndown — Progress History</h3>
        ${snapshots.length === 0
          ? '<p class="mc-empty-state">Snapshot history recording active. Returns snapshots on future visits!</p>'
          : `<div class="mc-burndown-chart">
              ${snapshots.map(s => {
                const tot = s.data?.totalItems || 1;
                const pub = s.data?.publishedCount || 0;
                const pct = Math.round(pub / tot * 100);
                return `<div class="mc-burndown-row">
                  <span class="mc-burndown-date">${s.date || 'Today'}</span>
                  <div class="mc-burndown-bar-wrap">
                    <div class="mc-burndown-bar" style="width:${pct}%"></div>
                  </div>
                  <span class="mc-burndown-pct">${pct}% (${pub}/${tot})</span>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>

      <div class="mc-overview-grid">
        <!-- Universe Split Panel -->
        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🌌 Universe Split — Characters</h3>
          <div class="mc-universe-bars">
            ${Object.entries(universeCount).sort((a,b)=>b[1]-a[1]).map(([u,n])=>{
              const pct = Math.round(n/Math.max(chars.length,1)*100);
              const col = UNIVERSE_COLORS[u] || '#6b7280';
              return `<div class="mc-uni-row">
                <span class="mc-uni-label" style="color:${col}">${u}</span>
                <div class="mc-uni-bar-wrap">
                  <div class="mc-uni-bar" style="width:${pct}%;background:${col};"></div>
                </div>
                <span class="mc-uni-count">${n}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Role Split Panel -->
        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🎭 Role Breakdown — Characters</h3>
          <div class="mc-universe-bars">
            ${Object.entries(roleCount).filter(([_, n]) => n > 0).sort((a,b)=>b[1]-a[1]).map(([r,n])=>{
              const pct = Math.round(n/Math.max(chars.length,1)*100);
              const col = ROLE_COLORS[r] || '#6b7280';
              const icon = ROLE_ICONS[r] || '❓';
              return `<div class="mc-uni-row">
                <span class="mc-uni-label" style="color:${col}">${icon} ${r}</span>
                <div class="mc-uni-bar-wrap">
                  <div class="mc-uni-bar" style="width:${pct}%;background:${col};"></div>
                </div>
                <span class="mc-uni-count">${n}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Vault Composition Panel -->
        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🗄️ Vault Composition — All Items</h3>
          <div class="mc-universe-bars">
            ${Object.entries(catCount).sort((a,b)=>b[1]-a[1]).map(([cat,n])=>{
              const pct = Math.round(n/Math.max(comps.length,1)*100);
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
                ${p1Incomplete.slice(0,8).map(c => `
                  <div class="mc-priority-row">
                    <span class="mc-priority-name">${esc(c.name)}</span>
                    ${universeBadge(c.tracker?.universe)}
                    <div class="mc-priority-bar">${readinessBar(calcReadinessForVault(c), true)}</div>
                  </div>`).join('')}
              </div>`
          }
        </div>

        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">🚀 Ready to Launch</h3>
          ${readyToLaunch.length === 0
            ? '<p class="mc-empty-state">No releases fully pre-checked yet.</p>'
            : readyToLaunch.slice(0,5).map(r => `
                <div class="mc-priority-row">
                  <span class="mc-priority-name">${esc(r.name)}</span>
                  ${universeBadge(r.universe)}
                  <span class="mc-badge" style="background:#10b98122;color:var(--success);border:1px solid #10b98144;">Ready ✓</span>
                </div>`).join('')
          }
        </div>

        <!-- Activity Feed Timeline -->
        <div class="mc-overview-panel">
          <h3 class="mc-panel-title">📜 Activity Feed Timeline</h3>
          <div class="mc-activity-feed">
            ${activityLogs.length === 0
              ? '<p class="mc-empty-state">No recent activity logged yet.</p>'
              : activityLogs.map(log => `
                <div class="mc-activity-entry">
                  <span class="mc-activity-icon">${actionIcons[log.action] || '📌'}</span>
                  <div class="mc-activity-details">
                    <span class="mc-activity-target">${esc(log.targetName || 'Item')}</span>
                    <span class="mc-activity-action">${esc(log.action.replace('_', ' '))} ${log.details ? `(${esc(log.details)})` : ''}</span>
                  </div>
                  <span class="mc-activity-time">${formatTimeAgo(log.timestamp)}</span>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── Pagination ───────────────────────────────────────────────────────────────

  function paginationHTML(totalItems) {
    if (state.pageSize === 'all' && totalItems <= 50) return '';
    const pageSize = state.pageSize === 'all' ? totalItems : state.pageSize;
    const totalPages = Math.ceil(totalItems / Math.max(pageSize, 1)) || 1;
    const curPage = Math.min(state.currentPage, totalPages);
    const startItem = totalItems === 0 ? 0 : (curPage - 1) * pageSize + 1;
    const endItem = Math.min(curPage * pageSize, totalItems);

    return `<div class="mc-pagination">
      <div class="mc-pag-info">Showing ${startItem}–${endItem} of ${totalItems} items</div>
      <div class="mc-pag-controls">
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-pag-prev" ${curPage <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="mc-pag-page">Page ${curPage} of ${totalPages}</span>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-pag-next" ${curPage >= totalPages ? 'disabled' : ''}>Next →</button>
        <select id="mc-pag-size-select" class="mc-filter-select" style="padding:3px 6px; font-size:0.75rem;">
          <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>50 per page</option>
          <option value="100" ${state.pageSize === 100 ? 'selected' : ''}>100 per page</option>
          <option value="250" ${state.pageSize === 250 ? 'selected' : ''}>250 per page</option>
          <option value="all" ${state.pageSize === 'all' ? 'selected' : ''}>Show All</option>
        </select>
      </div>
    </div>`;
  }

  // ─── Asset Tab (vault_components) ────────────────────────────────────────────

  function renderAssetTab(category) {
    state.activeCategory = category;
    const steps = PIPELINE_STEPS[category] || PIPELINE_STEPS.character;

    let items = filterComponents(state.allComponents.filter(c => c.category === category));
    const stubs = filterTrackerRecords(
      state.allTrackerRecords.filter(r => r.assetType === 'concept_stub' && r.intendedCategory === category && !r.promotedToVaultId)
    );

    items = sortByReadiness(items, calcReadinessForVault, c => c.tracker?.priority, state.sortDir);

    // Pipeline stage distribution bar
    const total = items.length;
    const stageCounts = {};
    steps.forEach(s => {
      stageCounts[s] = items.filter(c => c.tracker?.pipeline?.[s]).length;
    });
    const lastStep = steps[steps.length - 1];
    const publishedPct = total ? Math.round((stageCounts[lastStep]||0)/total*100) : 0;

    // Pagination slicing
    const pageSize = state.pageSize === 'all' ? total : state.pageSize;
    const totalPages = Math.ceil(total / Math.max(pageSize, 1)) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const displayItems = state.pageSize === 'all' ? items : items.slice((state.currentPage - 1) * pageSize, state.currentPage * pageSize);

    // Group by priority if enabled
    let rows = '';
    if (state.groupByPriority) {
      ['P1','P2','P3','P4', null].forEach(prio => {
        const group = displayItems.filter(c => (c.tracker?.priority || null) === prio);
        if (!group.length) return;
        rows += `<tr class="mc-group-header"><td colspan="${steps.length + 7}">
          ${prio ? priorityBadge(prio) : '<span class="mc-badge" style="background:#6b728022;color:var(--text-muted);border:1px solid #6b728044;">No Priority</span>'}
          <span style="color:var(--text-muted); font-size:0.8rem; margin-left:6px;">${group.length} items</span>
        </td></tr>`;
        rows += group.map(c => assetRow(c, steps)).join('');
      });
    } else {
      rows = displayItems.map(c => assetRow(c, steps)).join('');
    }

    // Concept stub rows at top (greyed)
    const stubRows = stubs.map(stub => stubRow(stub, steps)).join('');
    const pagHTML = paginationHTML(total);

    return `
      <div class="mc-stage-summary">
        ${steps.map(s => {
          const n = stageCounts[s] || 0;
          const pct = total ? Math.round(n/total*100) : 0;
          return `<div class="mc-stage-chip" title="${n}/${total} items at ${STEP_LABELS[s]||s}">
            <span>${STEP_LABELS[s]||s}</span><strong>${n}</strong>
          </div>`;
        }).join('')}
        <div class="mc-stage-chip mc-stage-chip--published" title="${publishedPct}% published">
          <span>Published %</span><strong>${publishedPct}%</strong>
        </div>
      </div>

      ${toolbarHTML(true, false)}

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
              ${steps.map(s => `<th class="mc-pipe-th" title="${STEP_LABELS[s]||s}">${(STEP_LABELS[s]||s).substring(0,4)}</th>`).join('')}
              <th>Tags</th>
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${stubRows}
            ${rows || `<tr><td colspan="${steps.length+10}" class="mc-empty-state">No ${CATEGORY_LABELS[category]||category} tracked yet. Add a Concept to start.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pagHTML}`;
  }

  function assetRow(comp, steps) {
    const tracker = comp.tracker || {};
    const score = calcReadinessForVault(comp);
    const tags = [...(comp.tags||[]), ...(tracker.trackerTags||[])].filter(Boolean);

    const isPinned = tracker.pinned;
    const depCount = state.allProjects.filter(p => (p.componentIds || []).includes(comp.id)).length;
    const isSelected = state.selectedIds.has(comp.id);

    return `<tr class="mc-row${isPinned ? ' mc-row--pinned' : ''}${isSelected ? ' mc-row--selected' : ''}" data-id="${comp.id}" data-universe="${esc(tracker.universe || '')}">
      <td class="mc-cell-check"><input type="checkbox" class="mc-bulk-check" data-id="${comp.id}" ${isSelected ? 'checked' : ''}></td>
      <td class="mc-cell-name">
        <button class="mc-name-link" data-vault-id="${comp.id}" title="Edit in Vault">${esc(comp.name)}</button>
        ${comp.isTemplate ? '<span class="mc-template-star" title="Golden Template">⭐</span>' : ''}
        ${isPinned ? '<span class="mc-pin-icon" title="Pinned">📌</span>' : ''}
        ${depCount > 0 ? `<span class="mc-dep-badge" title="Used in ${depCount} project${depCount>1?'s':''}">📦 ${depCount}</span>` : ''}
      </td>
      <td>${universeBadge(tracker.universe)}</td>
      <td>${roleBadge(tracker.role)}</td>
      <td class="mc-cell-project">
        <span class="mc-editable" data-field="project" data-id="${comp.id}" data-store="vault" title="Click to edit">${esc(tracker.project || '—')}</span>
      </td>
      <td>
        <select class="mc-priority-select" data-id="${comp.id}" data-store="vault">
          <option value="">—</option>
          ${['P1','P2','P3','P4'].map(p=>`<option value="${p}" ${tracker.priority===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </td>
      ${pipelineCheckboxes(tracker.pipeline, steps, comp.id, true)}
      <td class="mc-cell-tags">${tags.slice(0,3).map(t=>tagChip(t, t===state.activeTagFilter)).join('')}${tags.length>3?`<span class="mc-more-tags">+${tags.length-3}</span>`:''}</td>
      <td class="mc-cell-readiness">${readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-pin-toggle" data-id="${comp.id}" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📌' : '☆'}</button>
        <button class="mc-action-btn" data-vault-id="${comp.id}" title="Open in Vault">✏️</button>
        <select class="mc-role-select" data-id="${comp.id}" data-store="vault" title="Set role">
          <option value="">Role</option>
          ${['Hero','Villain','AntiHero','Support','Other'].map(r=>`<option value="${r}" ${tracker.role===r?'selected':''}>${r}</option>`).join('')}
        </select>
        <select class="mc-universe-select" data-id="${comp.id}" data-store="vault" title="Set universe">
          <option value="">Universe</option>
          ${universeSelectOptionsHTML(tracker ? tracker.universe : '', 'Universe')}
        </select>
      </td>
    </tr>`;
  }

  function stubRow(stub, steps) {
    return `<tr class="mc-row mc-row--stub" data-stub-id="${stub.id}">
      <td class="mc-cell-name" colspan="2">
        <span class="mc-stub-icon">💡</span>
        <span class="mc-stub-name">${esc(stub.name)}</span>
        <span class="mc-stub-badge">Concept</span>
      </td>
      <td>${esc(stub.project || '—')}</td>
      <td>${priorityBadge(stub.priority)}</td>
      ${steps.map(() => '<td class="mc-pipe-cell"><button class="mc-pipe-btn" disabled title="Build first">—</button></td>').join('')}
      <td>${(stub.tags||[]).map(t=>tagChip(t)).join('')}</td>
      <td>0%</td>
      <td class="mc-cell-actions">
        <button class="mc-btn mc-btn-accent mc-btn-sm mc-build-btn" data-stub-id="${stub.id}" title="Build this in Vault">🔨 Build</button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm mc-delete-stub-btn" data-stub-id="${stub.id}" title="Remove stub">✕</button>
      </td>
    </tr>`;
  }

  // ─── Stories Tab ──────────────────────────────────────────────────────────────

  function renderStoriesTab() {
    const steps = PIPELINE_STEPS.story;
    let items = filterTrackerRecords(state.allTrackerRecords.filter(r => r.assetType === 'story'));
    items = sortByReadiness(items, calcReadinessForRecord, r => r.priority, state.sortDir);

    return `
      ${toolbarHTML(false, true, 'story')}
      <div class="mc-table-wrap">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Universe</th>
              <th>Project</th>
              <th>Priority</th>
              ${steps.map(s=>`<th class="mc-pipe-th" title="${STEP_LABELS[s]||s}">${(STEP_LABELS[s]||s).substring(0,5)}</th>`).join('')}
              <th>Tags</th>
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map(r => recordRow(r, steps)).join('') : `<tr><td colspan="${steps.length+8}" class="mc-empty-state">No stories yet. Add one to track your narrative pipeline.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function recordRow(rec, steps) {
    const score = calcReadinessForRecord(rec);
    return `<tr class="mc-row" data-record-id="${rec.id}" data-universe="${esc(rec.universe || '')}">
      <td class="mc-cell-name">
        <button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button>
      </td>
      <td>${universeBadge(rec.universe)}</td>
      <td class="mc-cell-project">${esc(rec.project || '—')}</td>
      <td>${priorityBadge(rec.priority)}</td>
      ${pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td class="mc-cell-tags">${(rec.tags||[]).slice(0,3).map(t=>tagChip(t,t===state.activeTagFilter)).join('')}</td>
      <td class="mc-cell-readiness">${readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit">✏️</button>
        <button class="mc-action-btn mc-delete-record" data-record-id="${rec.id}" title="Delete">🗑</button>
      </td>
    </tr>`;
  }

  // ─── Launch Pad ───────────────────────────────────────────────────────────────

  function renderLaunchPad() {
    const steps = PIPELINE_STEPS.release;
    let releases = filterTrackerRecords(state.allTrackerRecords.filter(r => r.assetType === 'release'));
    releases = sortByReadiness(releases, calcReadinessForRecord, r => r.priority, state.sortDir);

    const readyItems = releases.filter(r => steps.every(s => r.pipeline?.[s]) && !r.pipeline?.released);
    const inProgress = releases.filter(r => !steps.every(s => r.pipeline?.[s]));
    const released   = releases.filter(r => r.pipeline?.released);

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
                <th>Universe</th>
                <th>Priority</th>
                ${steps.map(s=>`<th class="mc-pipe-th" title="${STEP_LABELS[s]||s}">${(STEP_LABELS[s]||s).substring(0,4)}</th>`).join('')}
                <th>Visibility</th>
                <th>Scheduled</th>
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

    const calendarHTML = renderCalendar(releases);

    return `
      ${toolbarHTML(false, true, 'release')}
      ${readyItems.length > 0 ? `<div class="mc-ready-banner">
        🚀 <strong>${readyItems.length}</strong> release${readyItems.length>1?'s':''} ready to launch!
      </div>` : ''}
      ${releaseSection('🟢 Ready to Launch', readyItems, true)}
      ${releaseSection('🔄 In Progress', inProgress)}
      ${releaseSection('✅ Released', released)}
      ${calendarHTML}`;
  }

  function releaseRow(rec, steps) {
    const score = calcReadinessForRecord(rec);
    const visColors = { Public: 'var(--success)', Unlisted: 'var(--warning)', Private: 'var(--text-muted)' };
    const linkedProj = state.allProjects.find(p => p.id === rec.projectId);

    return `<tr class="mc-row${rec.pipeline?.released?' mc-row--released':''}" data-record-id="${rec.id}">
      <td class="mc-cell-name">
        <button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button>
        ${linkedProj ? `<div class="mc-linked-proj-tag" title="Linked to compiled project: ${esc(linkedProj.name)}">🤖 ${esc(linkedProj.name)} (${(linkedProj.componentIds||[]).length} items)</div>` : ''}
      </td>
      <td>${universeBadge(rec.universe)}</td>
      <td>${priorityBadge(rec.priority)}</td>
      ${pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td>
        <select class="mc-vis-select" data-id="${rec.id}" style="color:${visColors[rec.visibility]||'var(--text-muted)'}">
          <option value="">—</option>
          ${['Private','Unlisted','Public'].map(v=>`<option value="${v}" ${rec.visibility===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </td>
      <td class="mc-cell-date">
        <input type="date" class="mc-date-input" data-id="${rec.id}" value="${rec.scheduledDate||''}" title="Scheduled date">
      </td>
      <td class="mc-cell-readiness">${readinessPct(score)}</td>
      <td class="mc-cell-actions">
        ${rec.projectId ? `
          <button class="mc-action-btn mc-open-assembler" data-project-id="${rec.projectId}" title="Open in Assembler">✏️ Assembler</button>
          <button class="mc-action-btn mc-open-sandbox" data-project-id="${rec.projectId}" title="Playtest in Sandbox">🧪 Playtest</button>
        ` : ''}
        <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit">✏️</button>
        <button class="mc-action-btn mc-delete-record" data-record-id="${rec.id}" title="Delete">🗑</button>
      </td>
    </tr>`;
  }

  // ─── Release Calendar ─────────────────────────────────────────────────────────

  function renderCalendar(releases) {
    const scheduled = releases.filter(r => r.scheduledDate && !r.pipeline?.released);
    const today = new Date();
    today.setHours(0,0,0,0);

    // Get Mon of current week + offset
    const weekStart = new Date(today);
    const dayOfWeek = (weekStart.getDay() + 6) % 7; // Mon=0
    weekStart.setDate(weekStart.getDate() - dayOfWeek + (state.calendarWeekOffset * 7));

    const days = Array.from({length: 7}, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const isReleasDay = (d) => d.getDay() === 2 || d.getDay() === 4; // Tue=2, Thu=4

    return `<div class="mc-calendar-section">
      <div class="mc-calendar-header">
        <h3 class="mc-section-title">📅 Release Calendar</h3>
        <div class="mc-calendar-nav">
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-cal-prev">← Prev</button>
          <span class="mc-cal-range">${days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-cal-next">Next →</button>
        </div>
      </div>
      <div class="mc-calendar-grid">
        ${days.map((d, i) => {
          const dateStr = d.toISOString().split('T')[0];
          const isToday = d.getTime() === today.getTime();
          const isSlot = isReleasDay(d);
          const dayReleases = scheduled.filter(r => r.scheduledDate === dateStr);

          return `<div class="mc-cal-day${isToday?' mc-cal-today':''}${isSlot?' mc-cal-slot':''}">
            <div class="mc-cal-day-header">
              <span class="mc-cal-day-name">${dayNames[i]}</span>
              <span class="mc-cal-day-num${isToday?' mc-cal-today-num':''}">${d.getDate()}</span>
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

  // ─── Import Tool ──────────────────────────────────────────────────────────────

  function renderImportTab() {
    return `<div class="mc-import-panel">
      <h3 class="mc-section-title">📥 Import Tracker Data</h3>
      <p class="mc-import-desc">Import tracking metadata from your Excel spreadsheets. Export your Excel file to JSON first using the PowerShell script below, then upload it here.</p>

      <div class="mc-import-instructions">
        <h4>Step 1: Export your Excel to JSON</h4>
        <p>Run this script in PowerShell, pointed at your Excel file:</p>
        <pre class="mc-code-block">$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open("C:\\path\\to\\Anansi_Forge_Master_Production_Tracker_V2.xlsx")

$result = @{ characters = @(); scenarios = @(); stories = @() }

$ws = $wb.Sheets["Characters"]
for ($r = 2; $r -le $ws.UsedRange.Rows.Count; $r++) {
  $name = $ws.Cells.Item($r,1).Text
  if ($name -eq "") { continue }
  $result.characters += @{
    name=$name; universe=$ws.Cells.Item($r,2).Text
    project=$ws.Cells.Item($r,3).Text; priority=$ws.Cells.Item($r,5).Text
    status=$ws.Cells.Item($r,6).Text
    generated=($ws.Cells.Item($r,7).Text -ne "")
    goldenTemplate=($ws.Cells.Item($r,8).Text -ne "")
    test1=($ws.Cells.Item($r,9).Text -ne "")
    trimmed=($ws.Cells.Item($r,10).Text -ne "")
    test2=($ws.Cells.Item($r,11).Text -ne "")
    complete=($ws.Cells.Item($r,12).Text -ne "")
    published=($ws.Cells.Item($r,13).Text -ne "")
  }
}

$wb.Close($false)
$excel.Quit()
$result | ConvertTo-Json -Depth 5 | Out-File "tracker-import.json" -Encoding utf8
Write-Host "Done! tracker-import.json created."</pre>
      </div>

      <div class="mc-import-upload">
        <h4>Step 2: Upload JSON</h4>
        <div class="mc-import-dropzone" id="mc-import-dropzone">
          <div class="mc-import-drop-content">
            <span class="mc-import-icon">📂</span>
            <p>Drop your <code>tracker-import.json</code> here, or click to browse</p>
            <button class="mc-btn mc-btn-primary" id="mc-import-browse">Browse File</button>
          </div>
        </div>
        <input type="file" id="mc-import-file-input" accept=".json" hidden>
        <div id="mc-import-preview" class="mc-import-preview" style="display:none;"></div>
        <button class="mc-btn mc-btn-primary" id="mc-import-confirm" style="display:none; margin-top:12px;">✓ Import ${''} Records</button>
      </div>
    </div>`;
  }

  // ─── Record Edit Modal ────────────────────────────────────────────────────────

  function openRecordModal(rec, assetType) {
    const isNew = !rec;
    const r = rec || { assetType, name: '', universe: '', project: '', priority: null, tags: [], notes: '', linkedVaultIds: [], projectId: null, pipeline: window.ForgeDB.defaultTrackerPipeline(assetType) };
    state.editingRecord = r;

    const modal = document.getElementById('mc-modal-overlay');
    const body  = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.textContent = isNew ? `New ${assetType === 'story' ? 'Story' : 'Release'}` : `Edit: ${r.name}`;
    body.innerHTML = `
      <div class="form-group"><label>Name</label>
        <input type="text" id="mc-rec-name" value="${esc(r.name)}" placeholder="Name…" class="mc-modal-input">
      </div>
      ${assetType === 'release' ? `
      <div class="form-group"><label>Linked Assembled Bot / Project</label>
        <select id="mc-rec-project-id" class="mc-modal-input">
          <option value="">— No Linked Project —</option>
          ${(state.allProjects || []).map(p => `<option value="${p.id}" ${r.projectId === p.id ? 'selected' : ''}>🤖 ${esc(p.name)} (${(p.componentIds||[]).length} items)</option>`).join('')}
        </select>
      </div>
      ` : ''}
      <div class="mc-form-row">
        <div class="form-group"><label>Universe</label>
          <select id="mc-rec-universe" class="mc-modal-input">
            ${universeSelectOptionsHTML(r.universe, 'Select Universe')}
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="mc-rec-priority" class="mc-modal-input">
            <option value="">—</option>
            ${['P1','P2','P3','P4'].map(p=>`<option value="${p}" ${r.priority===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Project / Group</label>
        <input type="text" id="mc-rec-project" value="${esc(r.project||'')}" class="mc-modal-input" placeholder="e.g. Young Justice">
      </div>
      <div class="form-group"><label>Tags (comma separated)</label>
        <input type="text" id="mc-rec-tags" value="${esc((r.tags||[]).join(', '))}" class="mc-modal-input" placeholder="e.g. hero, DC, tested">
      </div>
      <div class="form-group"><label>Notes</label>
        <textarea id="mc-rec-notes" class="mc-modal-input" rows="3">${esc(r.notes||'')}</textarea>
      </div>
      ${assetType === 'release' ? `
      <div class="mc-form-row">
        <div class="form-group"><label>Visibility</label>
          <select id="mc-rec-visibility" class="mc-modal-input">
            <option value="">—</option>
            ${['Private','Unlisted','Public'].map(v=>`<option value="${v}" ${r.visibility===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Scheduled Date</label>
          <input type="date" id="mc-rec-date" value="${r.scheduledDate||''}" class="mc-modal-input">
        </div>
      </div>
      <hr class="mc-modal-divider">
      <p class="mc-modal-section-label">📈 Post-Release Metrics</p>
      <div class="mc-form-row">
        <div class="form-group"><label>Snapshot Date</label>
          <input type="date" id="mc-rec-metrics-date" value="${r.metrics?.date||''}" class="mc-modal-input">
        </div>
        <div class="form-group"><label>Snapshot Time</label>
          <input type="time" id="mc-rec-metrics-time" value="${r.metrics?.time||''}" class="mc-modal-input">
        </div>
      </div>
      <div class="mc-form-row">
        <div class="form-group"><label>Unique Chats</label>
          <input type="number" id="mc-rec-unique-chats" value="${r.metrics?.uniqueChats||0}" class="mc-modal-input" min="0">
        </div>
        <div class="form-group"><label>Messages</label>
          <input type="number" id="mc-rec-messages" value="${r.metrics?.messages||0}" class="mc-modal-input" min="0">
        </div>
      </div>
      <div class="mc-metrics-derived">
        <span class="mc-metrics-derived-label">Derived Msg / Chat</span>
        <span class="mc-metrics-derived-value" id="mc-derived-mpc">${
          r.metrics?.uniqueChats > 0
            ? (r.metrics.messages / r.metrics.uniqueChats).toFixed(2)
            : '—'
        }</span>
      </div>` : ''}
    `;

    modal.classList.remove('hidden');
    document.getElementById('mc-rec-name').focus();
  }

  function openStubModal() {
    const modal = document.getElementById('mc-modal-overlay');
    const body  = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');
    state.editingRecord = { assetType: 'concept_stub' };
    title.textContent = 'New Concept Stub';
    body.innerHTML = `
      <div class="form-group"><label>Name</label>
        <input type="text" id="mc-rec-name" class="mc-modal-input" placeholder="e.g. Kamala Khan">
      </div>
      <div class="mc-form-row">
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
            ${universeSelectOptionsHTML('', 'Select Universe')}
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="mc-rec-priority" class="mc-modal-input">
            <option value="">—</option>
            ${['P1','P2','P3','P4'].map(p=>`<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Project / Group</label>
        <input type="text" id="mc-rec-project" class="mc-modal-input" placeholder="e.g. Ant-Man">
      </div>
      <div class="form-group"><label>Tags (comma separated)</label>
        <input type="text" id="mc-rec-tags" class="mc-modal-input" placeholder="e.g. hero, Marvel">
      </div>
      <div class="form-group"><label>Notes</label>
        <textarea id="mc-rec-notes" class="mc-modal-input" rows="2"></textarea>
      </div>`;

    modal.classList.remove('hidden');
    document.getElementById('mc-rec-name').focus();
  }

  async function saveModalRecord() {
    const r = state.editingRecord;
    if (!r) return;

    const name = document.getElementById('mc-rec-name')?.value?.trim();
    if (!name) { showToast('Name is required.', 'error'); return; }

    const universe  = document.getElementById('mc-rec-universe')?.value || '';
    const priority  = document.getElementById('mc-rec-priority')?.value || null;
    const project   = document.getElementById('mc-rec-project')?.value?.trim() || '';
    const tags      = (document.getElementById('mc-rec-tags')?.value||'').split(',').map(t=>t.trim()).filter(Boolean);
    const notes     = document.getElementById('mc-rec-notes')?.value || '';

    const updated = {
      ...r, name, universe, priority, project, tags, notes,
      pipeline: r.pipeline || window.ForgeDB.defaultTrackerPipeline(r.assetType)
    };

    if (r.assetType === 'concept_stub') {
      updated.intendedCategory = document.getElementById('mc-stub-category')?.value || 'character';
    }
    if (r.assetType === 'release') {
      updated.projectId    = document.getElementById('mc-rec-project-id')?.value || null;
      updated.visibility   = document.getElementById('mc-rec-visibility')?.value || null;
      updated.scheduledDate = document.getElementById('mc-rec-date')?.value || null;

      // Auto-check pipeline steps if an assembled project is linked
      if (updated.projectId) {
        const proj = state.allProjects.find(p => p.id === updated.projectId);
        if (proj && proj.componentIds && proj.componentIds.length) {
          const comps = state.allComponents.filter(c => proj.componentIds.includes(c.id));
          if (comps.some(c => c.category === 'bio')) updated.pipeline.bio = true;
          if (comps.some(c => c.category === 'scenario')) updated.pipeline.scenario = true;
          if (comps.some(c => c.category === 'initial_message')) updated.pipeline.initialMessage = true;
        }
      }

      const uniqueChats = parseInt(document.getElementById('mc-rec-unique-chats')?.value) || 0;
      const messages    = parseInt(document.getElementById('mc-rec-messages')?.value)    || 0;
      updated.metrics = {
        date:        document.getElementById('mc-rec-metrics-date')?.value || null,
        time:        document.getElementById('mc-rec-metrics-time')?.value || null,
        uniqueChats,
        messages,
        msgPerChat:  uniqueChats > 0 ? parseFloat((messages / uniqueChats).toFixed(2)) : null
      };
    }

    await window.ForgeDB.saveTrackerRecord(updated);
    await loadAll();
    closeModal();
    renderCurrentTab();
    showToast(`${updated.name} saved.`, 'success');
  }

  function closeModal() {
    document.getElementById('mc-modal-overlay')?.classList.add('hidden');
    state.editingRecord = null;
  }

  // ─── Universe & Genre Manager Modal ───────────────────────────────────────

  async function openUniverseManagerModal() {
    try {
      if (window.ForgeDB && window.ForgeDB.getAllUniverses) {
        state.allUniverses = (await window.ForgeDB.getAllUniverses()) || [];
      }
      renderUniverseManagerModal();
    } catch (err) {
      console.error('Failed to open Universe Manager Modal:', err);
      alert('Error opening Universe Manager: ' + (err.message || err));
    }
  }

  function renderUniverseManagerModal() {
    let overlay = document.getElementById('mc-uni-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mc-uni-modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.zIndex = '10000';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0, 0, 0, 0.8)';
    overlay.style.backdropFilter = 'blur(6px)';

    const list = (state.allUniverses && state.allUniverses.length > 0) ? state.allUniverses : (window.ForgeDB?.DEFAULT_UNIVERSES || []);
    const groups = {};
    list.forEach(u => {
      const g = u.genre || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(u);
    });

    const genreOptions = ['Comics', 'Sci-Fi & Space Opera', 'Urban Fantasy', 'Fantasy', 'Adventure / Pulp', 'Detective', 'General', 'Custom...'];

    overlay.innerHTML = `
      <div class="modal" style="max-width:680px; width:94%; max-height:90vh; display:flex; flex-direction:column;">
        <div class="modal-header">
          <h3>⚙️ Manage Universes & Genres</h3>
          <button id="mc-uni-modal-close" class="btn btn-ghost btn-icon">&times;</button>
        </div>
        <div class="modal-body" style="flex:1; overflow-y:auto; padding:16px;">
          <div class="mc-uni-add-card" style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.2); border-radius:var(--radius-md); padding:14px; margin-bottom:20px;">
            <h4 style="font-size:0.85rem; font-weight:600; color:var(--accent); margin-bottom:10px;">➕ Add New Universe</h4>
            <div class="mc-form-row" style="grid-template-columns: 1.2fr 1fr 60px auto; gap:8px; align-items:center;">
              <input type="text" id="mc-new-uni-name" class="mc-modal-input" placeholder="Universe Name (e.g. Invincible)">
              <select id="mc-new-uni-genre" class="mc-modal-input">
                ${genreOptions.map(g => `<option value="${g}">${g}</option>`).join('')}
              </select>
              <input type="color" id="mc-new-uni-color" value="#6366f1" style="height:34px; width:100%; border:1px solid var(--border-color); border-radius:var(--radius-sm); cursor:pointer; background:none; padding:2px;">
              <button id="mc-btn-add-universe" class="mc-btn mc-btn-primary mc-btn-sm">Add</button>
            </div>
            <div id="mc-new-uni-custom-genre-wrap" style="display:none; margin-top:8px;">
              <input type="text" id="mc-new-uni-custom-genre" class="mc-modal-input" placeholder="Type custom genre name...">
            </div>
          </div>

          <div class="mc-uni-list-container">
            ${Object.keys(groups).sort().map(genre => `
              <div class="mc-genre-section" style="margin-bottom:16px;">
                <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-color); padding-bottom:4px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                  <span>📁 ${esc(genre)}</span>
                  <span style="font-size:0.7rem; color:var(--text-muted);">${groups[genre].length} items</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
                  ${groups[genre].map(u => `
                    <div class="mc-uni-item-card" style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                      <input type="color" class="mc-uni-edit-color" data-id="${u.id}" value="${u.color || '#6b7280'}" style="width:24px; height:24px; border:none; background:none; cursor:pointer; padding:0;" title="Change badge color">
                      <span style="font-size:0.82rem; font-weight:500; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(u.name)}">${esc(u.name)}</span>
                      <button class="mc-action-btn mc-uni-delete-btn" data-id="${u.id}" data-name="${esc(u.name)}" title="Delete Universe" style="padding:2px 6px; font-size:0.75rem;">🗑</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button id="mc-uni-modal-done" class="btn btn-primary">Done</button>
        </div>
      </div>
    `;

    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';

    // Bind event listeners for Universe Modal
    const selectGenre = overlay.querySelector('#mc-new-uni-genre');
    const customWrap  = overlay.querySelector('#mc-new-uni-custom-genre-wrap');
    if (selectGenre) {
      selectGenre.addEventListener('change', () => {
        customWrap.style.display = selectGenre.value === 'Custom...' ? 'block' : 'none';
      });
    }

    overlay.querySelector('#mc-btn-add-universe')?.addEventListener('click', async () => {
      const nameInput = overlay.querySelector('#mc-new-uni-name');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) return alert('Please enter a universe name.');

      let genre = selectGenre ? selectGenre.value : 'General';
      if (genre === 'Custom...') {
        const customInput = overlay.querySelector('#mc-new-uni-custom-genre');
        genre = customInput ? customInput.value.trim() : 'General';
      }

      const colorInput = overlay.querySelector('#mc-new-uni-color');
      const color = colorInput ? colorInput.value : '#6366f1';

      const saved = await window.ForgeDB.saveUniverse({ name, genre, color, isCustom: true });
      await loadAll();
      renderUniverseManagerModal();
      await renderCurrentTab();
      if (typeof showToast === 'function') showToast(`Universe "${name}" saved under ${genre}.`, 'success');
    });

    overlay.querySelectorAll('.mc-uni-edit-color').forEach(input => {
      input.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const color = e.target.value;
        const uni = state.allUniverses.find(u => u.id === id);
        if (uni) {
          uni.color = color;
          await window.ForgeDB.saveUniverse(uni);
          await loadAll();
          await renderCurrentTab();
        }
      });
    });

    overlay.querySelectorAll('.mc-uni-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (confirm(`Delete universe "${name}"? Existing items set to this universe will keep their text value.`)) {
          await window.ForgeDB.deleteUniverse(id);
          await loadAll();
          renderUniverseManagerModal();
          await renderCurrentTab();
        }
      });
    });

    const closeHandler = () => {
      overlay.style.display = 'none';
      overlay.classList.add('hidden');
    };
    overlay.querySelector('#mc-uni-modal-close')?.addEventListener('click', closeHandler);
    overlay.querySelector('#mc-uni-modal-done')?.addEventListener('click', closeHandler);
  }

  // ─── Promote Stub → Vault ─────────────────────────────────────────────────────

  async function promoteStub(stubId) {
    const stub = await window.ForgeDB.getTrackerRecord(stubId);
    if (!stub) return;

    // Pre-fill the component editor and switch to it
    if (window.ForgeAppBridge && window.ForgeAppBridge.openEditorNew) {
      window.ForgeAppBridge.openEditorNew({
        name: stub.name,
        category: stub.intendedCategory || 'character',
        tags: stub.tags || [],
        _stubId: stub.id
      });
    } else {
      // Fallback: switch to editor view via existing app routing
      document.getElementById('btn-new-component')?.click();
      showToast(`Building "${stub.name}" — fill out the editor and save to Vault.`, 'info');
    }
  }

  // ─── Import Handler ───────────────────────────────────────────────────────────

  let importData = null;

  async function handleImportFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importData = data;

      const chars = data.characters || [];
      const scenarios = data.scenarios || [];
      const stories = data.stories || [];

      const allComps = state.allComponents;
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
    } catch(e) {
      showToast('Failed to parse JSON file: ' + e.message, 'error');
    }
  }

  async function executeImport() {
    if (!importData) return;
    const allComps = state.allComponents;
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
    await processRows(importData.scenarios  || [], 'scenario');
    await processRows(importData.stories    || [], 'story');

    await loadAll();
    renderCurrentTab();
    showToast(`Import complete: ${updated} vault items updated, ${created} concept stubs created.`, 'success');
    importData = null;
    document.getElementById('mc-import-preview').style.display = 'none';
    document.getElementById('mc-import-confirm').style.display = 'none';
  }

  // ─── Event Delegation ─────────────────────────────────────────────────────────

  function bindEvents(container) {
    container.addEventListener('click', async (e) => {
      const t = e.target;

      // Manage Universes
      if (t.id === 'btn-mc-manage-universes' || t.closest('#btn-mc-manage-universes')) {
        openUniverseManagerModal();
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
            promises.push(window.ForgeDB.updateVaultTracker(id, { pinned: pinVal }));
          }
        }
        await Promise.all(promises);
        state.selectedIds.clear();
        showToast(`${promises.length} items ${pinVal ? 'pinned' : 'unpinned'}`, 'success');
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
          window.ForgeDB.updateVaultTracker(id, { pinned: newVal });
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
        const id    = t.dataset.id;
        const step  = t.dataset.step;
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
            if (readinessEl) readinessEl.innerHTML = readinessPct(calcReadinessForVault(comp));
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
            if (readinessEl) readinessEl.innerHTML = readinessPct(calcReadinessForRecord(rec));
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
        if (rec) openRecordModal(rec, rec.assetType);
        return;
      }

      // Delete tracker record
      if (t.matches('.mc-delete-record')) {
        const id = t.dataset.recordId;
        if (confirm('Delete this record?')) {
          await window.ForgeDB.deleteTrackerRecord(id);
          await loadAll();
          await renderCurrentTab();
          showToast('Record deleted.', 'info');
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

      // Add concept stub
      if (t.id === 'mc-add-stub') { openStubModal(); return; }

      // Add tracker record
      if (t.id === 'mc-add-record') { openRecordModal(null, t.dataset.type); return; }

      // Build stub → vault
      if (t.matches('.mc-build-btn')) {
        promoteStub(t.dataset.stubId);
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
      if (t.id === 'mc-modal-save') { await saveModalRecord(); return; }
      if (t.id === 'mc-modal-cancel') { closeModal(); return; }

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
      // Live Msg/Chat derivation in release modal
      if (t.id === 'mc-rec-unique-chats' || t.id === 'mc-rec-messages') {
        const msgs  = parseInt(document.getElementById('mc-rec-messages')?.value)     || 0;
        const chats = parseInt(document.getElementById('mc-rec-unique-chats')?.value) || 0;
        const el = document.getElementById('mc-derived-mpc');
        if (el) el.textContent = chats > 0 ? (msgs / chats).toFixed(2) : '—';
      }
    });

    container.addEventListener('change', async (e) => {
      const t = e.target;

      // Pagination size select
      if (t.id === 'mc-pag-size-select') {
        state.pageSize = t.value === 'all' ? 'all' : parseInt(t.value, 10);
        state.currentPage = 1;
        await renderCurrentTab();
        return;
      }

      // Bulk universe set
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
        showToast(`Universe set to ${uniVal} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      // Bulk priority set
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
        showToast(`Priority ${prioVal ? 'set to ' + prioVal : 'cleared'} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      // Filter dropdowns
      if (t.id === 'mc-filter-role') { state.filters.role = t.value; await renderCurrentTab(); return; }

      // Bulk role set
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
        showToast(`Role set to ${roleVal} for ${promises.length} items`, 'success');
        await renderCurrentTab();
        return;
      }

      // Inline role select
      if (t.matches('.mc-role-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.role = t.value || '';
          
          const row = t.closest('.mc-row');
          if (row) {
            const roleTd = row.children[3];
            if (roleTd) roleTd.innerHTML = roleBadge(t.value);
          }

          window.ForgeDB.updateVaultTracker(t.dataset.id, { role: t.value });
        }
        return;
      }

      // Priority select inline
      if (t.matches('.mc-priority-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.priority = t.value || null;
          window.ForgeDB.updateVaultTracker(t.dataset.id, { priority: t.value || null });
        }
        return;
      }

      // Universe select inline
      if (t.matches('.mc-universe-select') && t.dataset.store === 'vault') {
        const comp = state.allComponents.find(c => c.id === t.dataset.id);
        if (comp) {
          if (!comp.tracker) comp.tracker = window.ForgeDB.defaultTracker();
          comp.tracker.universe = t.value || '';
          
          const row = t.closest('.mc-row');
          if (row) {
            const uniTd = row.children[1];
            if (uniTd) uniTd.innerHTML = universeBadge(t.value);
          }

          window.ForgeDB.updateVaultTracker(t.dataset.id, { universe: t.value });
        }
        return;
      }

      // Visibility select
      if (t.matches('.mc-vis-select')) {
        const rec = state.allTrackerRecords.find(r => r.id === t.dataset.id);
        if (rec) { await window.ForgeDB.saveTrackerRecord({ ...rec, visibility: t.value || null }); await loadAll(); }
        return;
      }

      // Date input
      if (t.matches('.mc-date-input')) {
        const rec = state.allTrackerRecords.find(r => r.id === t.dataset.id);
        if (rec) { await window.ForgeDB.saveTrackerRecord({ ...rec, scheduledDate: t.value || null }); await loadAll(); }
        return;
      }

      // Import file
      if (t.id === 'mc-import-file-input' && t.files[0]) {
        await handleImportFile(t.files[0]);
        return;
      }
    });

    // Import drag-and-drop
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

  // ─── Metrics Tab ──────────────────────────────────────────────────────────────

  function renderMetrics() {
    const releases = state.allTrackerRecords.filter(r => r.assetType === 'release');
    const withMetrics = releases.filter(r => r.metrics?.messages > 0 || r.metrics?.uniqueChats > 0);
    const noMetrics   = releases.filter(r => !(r.metrics?.messages > 0) && !(r.metrics?.uniqueChats > 0));

    // Sort by messages descending by default
    const sorted = [...withMetrics].sort((a, b) => (b.metrics?.messages || 0) - (a.metrics?.messages || 0));

    // Totals
    const totalMsgs   = sorted.reduce((s, r) => s + (r.metrics?.messages    || 0), 0);
    const totalChats  = sorted.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const avgMPC      = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';
    const topBot      = sorted[0];

    const kpiCard = (icon, val, label, color = 'var(--accent)') =>
      `<div class="mc-kpi-card">
        <div class="mc-kpi-icon" style="color:${color}">${icon}</div>
        <div class="mc-kpi-body">
          <div class="mc-kpi-value">${val}</div>
          <div class="mc-kpi-label">${label}</div>
        </div>
      </div>`;

    const metricRow = (rec, rank) => {
      const m   = rec.metrics || {};
      const mpc = m.uniqueChats > 0 ? (m.messages / m.uniqueChats).toFixed(2) : '—';
      const maxMsgs = sorted[0]?.metrics?.messages || 1;
      const barPct  = Math.round((m.messages || 0) / maxMsgs * 100);
      return `<tr class="mc-row">
        <td class="mc-metrics-rank">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</td>
        <td class="mc-cell-name">
          <button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button>
        </td>
        <td>${universeBadge(rec.universe)}</td>
        <td>${priorityBadge(rec.priority)}</td>
        <td class="mc-metrics-bar-cell">
          <div class="mc-metrics-bar-wrap">
            <div class="mc-metrics-bar" style="width:${barPct}%;"></div>
          </div>
          <span class="mc-metrics-num">${(m.messages||0).toLocaleString()}</span>
        </td>
        <td class="mc-metrics-num">${(m.uniqueChats||0).toLocaleString()}</td>
        <td class="mc-metrics-mpc${mpc !== '—' && parseFloat(mpc) >= 10 ? ' mc-metrics-mpc--high' : ''}">${mpc}</td>
        <td class="mc-metrics-date">${m.date ? `${m.date}${m.time ? ' ' + m.time : ''}` : '—'}</td>
        <td class="mc-cell-actions">
          <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit metrics">✏️</button>
        </td>
      </tr>`;
    };

    return `
      <div class="mc-kpi-grid" style="margin-bottom:20px;">
        ${kpiCard('💬', totalMsgs.toLocaleString(), 'Total Messages across all bots')}
        ${kpiCard('👥', totalChats.toLocaleString(), 'Total Unique Chats', 'var(--success)')}
        ${kpiCard('📐', avgMPC, 'Avg Msg / Chat (all bots)', 'var(--warning)')}
        ${topBot ? kpiCard('🏆', esc(topBot.name), `Top bot · ${(topBot.metrics?.messages||0).toLocaleString()} msgs`, '#f59e0b') : ''}
      </div>

      <div class="mc-metrics-section">
        <h3 class="mc-section-title">📊 Leaderboard — by Messages</h3>
        ${sorted.length === 0
          ? '<p class="mc-empty-state">No metrics recorded yet. Edit a release record to add data.</p>'
          : `<div class="mc-table-wrap">
            <table class="mc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Universe</th>
                  <th>Priority</th>
                  <th>Messages</th>
                  <th>Unique Chats</th>
                  <th>Msg / Chat</th>
                  <th>Snapshot</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map((r, i) => metricRow(r, i + 1)).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>

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
                  <td>${universeBadge(r.universe)}</td>
                  <td>${formatDate(r.scheduledDate)}</td>
                  <td><button class="mc-action-btn mc-edit-record" data-record-id="${r.id}" title="Add metrics">+ Add Metrics</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;
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

    // Re-render subtab bar
    const subtabEl = document.getElementById('mc-subtab-bar');
    if (subtabEl) subtabEl.innerHTML = subTabBar().replace('<div class="mc-subtab-bar">','').replace('</div>','');

    const tab = state.activeSubTab;
    let html = '';

    try {
      if (tab === 'overview') {
        html = await renderOverview();
      } else if (CAT_FOR_TAB[tab]) {
        html = renderAssetTab(CAT_FOR_TAB[tab]);
      } else if (tab === 'stories') {
        html = renderStoriesTab();
      } else if (tab === 'launchpad') {
        html = renderLaunchPad();
      } else if (tab === 'metrics') {
        html = renderMetrics();
      } else if (tab === 'import') {
        html = renderImportTab();
      }
    } catch (err) {
      console.error('Error rendering Mission Control tab:', err);
      html = `<div style="padding:30px; text-align:center; color:var(--danger);">
        <h4>Error loading tab "${tab}"</h4>
        <p style="font-size:0.8rem; color:var(--text-muted);">${esc(err.message)}</p>
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
        try { searchEl.setSelectionRange(selectionStart, selectionEnd); } catch (e) {}
      }
    }

    // Update subtab active class
    view.querySelectorAll('.mc-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subtab === tab);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    await loadAll();

    const view = document.getElementById('mission-control-view');
    if (!view) return;

    view.innerHTML = `
      <div class="mc-layout">
        <div id="mc-subtab-bar" class="mc-subtab-bar">
          ${subTabBar().replace('<div class="mc-subtab-bar">','').replace('</div>','')}
        </div>
        <div id="mc-content" class="mc-content"></div>
      </div>

      <!-- Record Edit Modal -->
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

    // Bind second cancel button
    view.addEventListener('click', (e) => {
      if (e.target.id === 'mc-modal-cancel2') closeModal();
    });

    bindEvents(view);
    await renderCurrentTab();
  }

  async function openNewReleaseForProject(proj) {
    if (!proj) return;
    state.activeSubTab = 'launchpad';
    await renderCurrentTab();
    
    const pipeline = window.ForgeDB.defaultTrackerPipeline('release');
    const compIds = proj.componentIds || [];
    if (compIds.length > 0) {
      const comps = state.allComponents.filter(c => compIds.includes(c.id));
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

    openRecordModal(rec, 'release');
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  window.MissionControl = { init, renderCurrentTab, loadAll, openNewReleaseForProject, openUniverseManagerModal };

})();
