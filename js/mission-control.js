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
    character: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    scenario: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    bio: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    initial_message: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    organization: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    concept_stub: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    story: ['concept', 'notesReady', 'initialMessage', 'bio', 'otherMessages', 'testing', 'complete', 'published'],
    release: ['staged', 'bio', 'scenario', 'initialMessage', 'personalityLocked', 'thumbnail', 'banner', 'tagsDone', 'initialTest', 'regressionTest', 'finalPolish', 'ready']
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
  const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3, null: 4 };
  const CATEGORY_LABELS = {
    character: 'Characters', scenario: 'Scenarios', bio: 'Bios',
    initial_message: 'Initial Messages', organization: 'Organizations'
  };

  const RELEASE_SOURCES = {
    story: '📖 Story',
    existing_bot: '🤖 Existing Bot',
    legacy_import: '📦 Legacy Import',
    manual: '✏️ Manual',
    experiment: '🧪 Experiment'
  };

  const RELEASE_SOURCE_COLORS = {
    story: '#8b5cf6',
    existing_bot: '#3b82f6',
    legacy_import: '#6b7280',
    manual: '#10b981',
    experiment: '#f59e0b'
  };

  
  const STORY_TO_RELEASE_STEP_MAP = {
    concept: 'staged',
    notesReady: 'bio',
    bio: 'bio',
    initialMessage: 'initialMessage',
    testing: 'initialTest',
    complete: 'ready',
    published: 'released'
  };

  const STORY_STATUS_COLORS = {
    Active: '#10b981',
    Promoted: '#8b5cf6',
    Archived: '#6b7280'
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  let state = {
    activeSubTab: 'overview',
    activeCategory: 'character',   // for asset tabs
    storyStatusFilter: 'Active',   // 'Active' | 'Promoted' | 'Archived' | 'all'
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
    overviewFilters: { universeCat: 'all', roleMode: 'role' },
    leaderboardSort: 'messages',
    portfolioChartMetric: 'messages',
    isSpawningRelease: false,
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
    if (universe !== 'all') items = items.filter(c => isMatchingUniverse(c.tracker?.universe || c.universe, universe));
    if (priority !== 'all') items = items.filter(c => (c.tracker?.priority || null) === priority);
    if (role !== 'all') items = items.filter(c => (c.tracker?.role || '') === role);
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
    if (universe !== 'all') items = items.filter(r => isMatchingUniverse(r.universe || r.tracker?.universe, universe));
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
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function releaseSourceBadge(source) {
    const src = source || 'manual';
    const label = RELEASE_SOURCES[src] || src;
    const c = RELEASE_SOURCE_COLORS[src] || '#6b7280';
    return `<span class="mc-badge mc-badge--source" style="background:${c}18; color:${c}; border:1px solid ${c}44;" title="Release Source: ${esc(label)}">${label}</span>`;
  }

  function storyStatusBadge(status) {
    const s = status || 'Active';
    const c = STORY_STATUS_COLORS[s] || '#10b981';
    return `<span class="mc-badge mc-badge--status" style="background:${c}18; color:${c}; border:1px solid ${c}44;">${esc(s)}</span>`;
  }

  function isMatchingUniverse(itemUniRaw, targetUniRaw) {
    if (!targetUniRaw || targetUniRaw === 'all') return true;
    if (!itemUniRaw) return false;

    const itemStr = (typeof itemUniRaw === 'string' ? itemUniRaw : (itemUniRaw.name || itemUniRaw.id || '')).trim().toLowerCase();
    const targetStr = (typeof targetUniRaw === 'string' ? targetUniRaw : (targetUniRaw.name || targetUniRaw.id || '')).trim().toLowerCase();

    if (!itemStr || !targetStr) return false;

    if (itemStr === targetStr) return true;

    const itemClean = itemStr.replace(/[^a-z0-9]/g, '');
    const targetClean = targetStr.replace(/[^a-z0-9]/g, '');
    if (itemClean && targetClean && itemClean === targetClean) return true;

    const list = [
      ...(state.allUniverses || []),
      ...(window.ForgeDB?.DEFAULT_UNIVERSES || [])
    ];

    for (const u of list) {
      if (!u) continue;
      const uName = (u.name || '').trim().toLowerCase();
      const uId = (u.id || '').trim().toLowerCase();
      const uCleanName = uName.replace(/[^a-z0-9]/g, '');
      const uCleanId = uId.replace(/[^a-z0-9]/g, '');

      const targetMatches = (targetStr === uName || targetStr === uId || (targetClean && (targetClean === uCleanName || targetClean === uCleanId)));
      if (targetMatches) {
        const itemMatches = (itemStr === uName || itemStr === uId || (itemClean && (itemClean === uCleanName || itemClean === uCleanId)));
        if (itemMatches) return true;
      }
    }

    return false;
  }

  function matchUniverse(compUniRaw, selectedUniRaw) {
    return isMatchingUniverse(compUniRaw, selectedUniRaw);
  }

  function getEffectiveUniversesList() {
    const registry = (state.allUniverses && state.allUniverses.length > 0) ? state.allUniverses : (window.ForgeDB?.DEFAULT_UNIVERSES || []);
    const uniMap = new Map();
    const list = [];

    registry.forEach(u => {
      if (u && u.name) {
        const key = u.name.toLowerCase();
        if (!uniMap.has(key)) {
          uniMap.set(key, u);
          if (u.id) uniMap.set(u.id.toLowerCase(), u);
          list.push(u);
        }
      }
    });

    const compUnis = (state.allComponents || []).map(c => c.tracker?.universe || c.universe).filter(Boolean);
    const recUnis = (state.allTrackerRecords || []).map(r => r.universe || r.tracker?.universe).filter(Boolean);
    const uniqueRaw = [...new Set([...compUnis, ...recUnis])];

    uniqueRaw.forEach(rawVal => {
      const trimmed = String(rawVal).trim();
      if (trimmed && !uniMap.has(trimmed.toLowerCase())) {
        const customObj = { id: trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_'), name: trimmed, genre: 'Custom / Other', color: '#6b7280' };
        uniMap.set(trimmed.toLowerCase(), customObj);
        list.push(customObj);
      }
    });

    return list;
  }

  function universeSelectOptionsHTML(selectedVal, defaultLabel = 'Select Universe') {
    const list = getEffectiveUniversesList();
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
        const isSel = matchUniverse(selectedVal, u.name) || matchUniverse(selectedVal, u.id);
        html += `<option value="${esc(u.name)}" ${isSel ? 'selected' : ''}>${esc(u.name)}</option>`;
      });
      html += `</optgroup>`;
    });
    return html;
  }

  function universeFilterOptionsHTML(selectedVal) {
    let html = `<option value="all" ${selectedVal === 'all' ? 'selected' : ''}>All Universes</option>`;
    const list = getEffectiveUniversesList();
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
        const isSel = matchUniverse(selectedVal, u.name) || matchUniverse(selectedVal, u.id);
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

  function getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isReleasePublished(r) {
    if (!r) return false;
    if (r.pipeline?.released || r.pipeline?.published) return true;
    if (r.scheduledDate) {
      const todayStr = getTodayDateStr();
      if (r.scheduledDate <= todayStr) return true;
    }
    return false;
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
    const priorities = ['P1', 'P2', 'P3', 'P4'];
    const roles = ['Hero', 'Villain', 'AntiHero', 'Support', 'Other'];
    return `<div class="mc-toolbar">
      <div class="mc-toolbar-left">
        <input type="text" id="mc-search" class="mc-search" placeholder="Search…" value="${esc(state.filters.search)}">
        <select id="mc-filter-universe" class="mc-filter-select">
          ${universeFilterOptionsHTML(state.filters.universe)}
        </select>
        <select id="mc-filter-role" class="mc-filter-select">
          <option value="all">All Roles</option>
          ${roles.map(r => `<option value="${r}" ${state.filters.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <select id="mc-filter-priority" class="mc-filter-select">
          <option value="all">All Priorities</option>
          ${priorities.map(p => `<option value="${p}" ${state.filters.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <button class="mc-btn mc-btn-ghost mc-sort-btn" id="mc-sort-toggle" title="Toggle sort direction">
          ${state.sortDir === 'desc' ? '↓ Most Ready' : '↑ Least Ready'}
        </button>
        <button class="mc-btn mc-btn-ghost${state.groupByPriority ? ' active' : ''}" id="mc-group-priority" title="Group by priority">
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
      { id: 'overview', label: '📊 Overview' },
      { id: 'stories', label: '📖 Stories' },
      { id: 'characters', label: '👤 Characters' },
      { id: 'orgs', label: '🏢 Orgs' },
      { id: 'scenarios', label: '🎭 Scenarios' },
      { id: 'messages', label: '💬 Init Msgs' },
      { id: 'bios', label: '📋 Bios' },
      { id: 'launchpad', label: '🚀 Launch Pad' },
      { id: 'metrics', label: '📈 Metrics' },
      { id: 'import', label: '⚙ Import' }
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
          ${['Hero', 'Villain', 'AntiHero', 'Support', 'Other'].map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
        <select id="mc-bulk-priority" class="mc-filter-select mc-bulk-select">
          <option value="">Set Priority…</option>
          ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}">${p}</option>`).join('')}
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
    const publishedReleases = releases.filter(isReleasePublished);
    const readyToLaunch = releases.filter(r => {
      const steps = PIPELINE_STEPS.release;
      return steps.every(s => r.pipeline?.[s]) && !isReleasePublished(r);
    });

    // Dynamic Universe Category distribution
    const selectedUniCat = state.overviewFilters?.universeCat || 'all';
    const targetUniComps = selectedUniCat === 'all'
      ? comps
      : comps.filter(c => c.category === selectedUniCat);

    const universeCount = {};
    targetUniComps.forEach(c => {
      const u = c.tracker?.universe || c.universe || 'Other';
      universeCount[u] = (universeCount[u] || 0) + 1;
    });

    // Dynamic Role & Faction distribution
    const selectedRoleMode = state.overviewFilters?.roleMode || 'role';
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

    // Category distribution across vault components
    const catCount = {};
    comps.forEach(c => {
      const catName = CATEGORY_LABELS[c.category] || c.category;
      catCount[catName] = (catCount[catName] || 0) + 1;
    });

    // Priority queue: P1 items not yet complete across Vault components and Tracker Records
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
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    };

    const actionIcons = {
      created: '🟢',
      updated: '🟡',
      tracker_updated: '🟡',
      edited: '🟡',
      scheduled: '🚀',
      metrics_updated: '📈',
      metrics: '📈',
      published: '✅',
      released: '✅',
      deleted: '🗑️',
      record_saved: '📝',
      project_compiled: '🤖'
    };

    const actionLabels = {
      created: 'created',
      updated: 'updated',
      tracker_updated: 'updated',
      edited: 'updated',
      scheduled: 'scheduled',
      metrics_updated: 'metrics updated',
      metrics: 'metrics updated',
      published: 'published',
      released: 'published',
      deleted: 'deleted',
      record_saved: 'saved',
      project_compiled: 'compiled'
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

      <!-- Pipeline Burndown Progress Chart -->
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
        <!-- Universe Split Panel -->
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
          const col = (state.universeColorMap && state.universeColorMap[u]) || UNIVERSE_COLORS[u] || '#6b7280';
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

        <!-- Role & Faction Breakdown Panel -->
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

        <!-- Vault Composition Panel -->
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

        <!-- Rolling Release Performance Chart (Last 10 Releases with Stats) -->
        ${(() => {
          const allCandidates = state.allTrackerRecords.filter(r => r.assetType === 'release' || r.assetType === 'story');

          const getTimestamp = (rec) => {
            if (rec.metrics?.date) {
              const dStr = rec.metrics.date + (rec.metrics.time ? 'T' + rec.metrics.time : 'T00:00:00');
              const parsed = new Date(dStr).getTime();
              if (!isNaN(parsed) && parsed > 0) return parsed;
            }
            return new Date(rec.updatedAt || rec.createdAt || 0).getTime();
          };

          const releases = allCandidates.sort((a, b) => {
            const aMsgs = a.metrics?.messages || 0;
            const bMsgs = b.metrics?.messages || 0;
            const aHasMetrics = aMsgs > 0 || (a.metrics?.uniqueChats || 0) > 0;
            const bHasMetrics = bMsgs > 0 || (b.metrics?.uniqueChats || 0) > 0;

            if (aHasMetrics && !bHasMetrics) return -1;
            if (!aHasMetrics && bHasMetrics) return 1;

            return getTimestamp(b) - getTimestamp(a);
          }).slice(0, 10);

          const items = releases.map(r => ({
            id: r.id,
            label: r.name,
            value: r.metrics?.messages || 0,
            unit: 'msgs',
            color: 'linear-gradient(90deg, #6366f1, #a855f7)',
            badgeHtml: r.iterationLabel ? `<span class="mc-badge mc-iteration-badge">🏷️ ${esc(r.iterationLabel)}</span>` : ''
          }));

          return renderHorizontalBarChart(items, '🚀 Rolling Release Performance', 'Last 10 Releases · Are recent releases trending upward?');
        })()}

        <!-- Universe Health Distribution Chart -->
        ${(() => {
          const uniCounts = {};
          (state.allUniverses || []).forEach(u => { uniCounts[u.name] = { name: u.name, msgs: 0, color: u.color }; });

          state.allTrackerRecords.forEach(r => {
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

          return renderHorizontalBarChart(items, '🌌 Universe Health Distribution', 'Total Messages by Universe · Have you neglected a universe lately?');
        })()}

        <!-- Activity Feed Timeline -->
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
    const publishedPct = total ? Math.round((stageCounts[lastStep] || 0) / total * 100) : 0;

    // Pagination slicing
    const pageSize = state.pageSize === 'all' ? total : state.pageSize;
    const totalPages = Math.ceil(total / Math.max(pageSize, 1)) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const displayItems = state.pageSize === 'all' ? items : items.slice((state.currentPage - 1) * pageSize, state.currentPage * pageSize);

    // Group by priority if enabled
    let rows = '';
    if (state.groupByPriority) {
      ['P1', 'P2', 'P3', 'P4', null].forEach(prio => {
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
      const pct = total ? Math.round(n / total * 100) : 0;
      return `<div class="mc-stage-chip" title="${n}/${total} items at ${STEP_LABELS[s] || s}">
            <span>${STEP_LABELS[s] || s}</span><strong>${n}</strong>
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
              ${steps.map(s => `<th class="mc-pipe-th" title="${STEP_LABELS[s] || s}">${(STEP_LABELS[s] || s).substring(0, 4)}</th>`).join('')}
              <th>Tags</th>
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${stubRows}
            ${rows || `<tr><td colspan="${steps.length + 10}" class="mc-empty-state">No ${CATEGORY_LABELS[category] || category} tracked yet. Add a Concept to start.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pagHTML}`;
  }

  function assetRow(comp, steps) {
    const tracker = comp.tracker || {};
    const score = calcReadinessForVault(comp);
    const tags = [...(comp.tags || []), ...(tracker.trackerTags || [])].filter(Boolean);

    const isPinned = tracker.pinned;
    const depCount = state.allProjects.filter(p => (p.componentIds || []).includes(comp.id)).length;
    const isSelected = state.selectedIds.has(comp.id);

    return `<tr class="mc-row${isPinned ? ' mc-row--pinned' : ''}${isSelected ? ' mc-row--selected' : ''}" data-id="${comp.id}" data-universe="${esc(tracker.universe || '')}">
      <td class="mc-cell-check"><input type="checkbox" class="mc-bulk-check" data-id="${comp.id}" ${isSelected ? 'checked' : ''}></td>
      <td class="mc-cell-name">
        <button class="mc-name-link" data-vault-id="${comp.id}" title="Edit in Vault">${esc(comp.name)}</button>
        ${comp.isTemplate ? '<span class="mc-template-star" title="Golden Template">⭐</span>' : ''}
        ${isPinned ? '<span class="mc-pin-icon" title="Pinned">📌</span>' : ''}
        ${depCount > 0 ? `<span class="mc-dep-badge" title="Used in ${depCount} project${depCount > 1 ? 's' : ''}">📦 ${depCount}</span>` : ''}
      </td>
      <td>${universeBadge(tracker.universe)}</td>
      <td>${roleBadge(tracker.role)}</td>
      <td class="mc-cell-project">
        <span class="mc-editable" data-field="project" data-id="${comp.id}" data-store="vault" title="Click to edit">${esc(tracker.project || '—')}</span>
      </td>
      <td>
        <select class="mc-priority-select" data-id="${comp.id}" data-store="vault">
          <option value="">—</option>
          ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}" ${tracker.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </td>
      ${pipelineCheckboxes(tracker.pipeline, steps, comp.id, true)}
      <td class="mc-cell-tags">${tags.slice(0, 3).map(t => tagChip(t, t === state.activeTagFilter)).join('')}${tags.length > 3 ? `<span class="mc-more-tags">+${tags.length - 3}</span>` : ''}</td>
      <td class="mc-cell-readiness">${readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-pin-toggle" data-id="${comp.id}" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📌' : '☆'}</button>
        <button class="mc-action-btn" data-vault-id="${comp.id}" title="Open in Vault">✏️</button>
        <select class="mc-role-select" data-id="${comp.id}" data-store="vault" title="Set role">
          <option value="">Role</option>
          ${['Hero', 'Villain', 'AntiHero', 'Support', 'Other'].map(r => `<option value="${r}" ${tracker.role === r ? 'selected' : ''}>${r}</option>`).join('')}
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
      <td>${(stub.tags || []).map(t => tagChip(t)).join('')}</td>
      <td>0%</td>
      <td class="mc-cell-actions">
        <button class="mc-btn mc-btn-accent mc-btn-sm mc-promote-stub-story" data-stub-id="${stub.id}" title="Promote to Story">📖 → Story</button>
        <button class="mc-btn mc-btn-secondary mc-btn-sm mc-build-btn" data-stub-id="${stub.id}" title="Build component in Vault">🗄️ → Vault</button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm mc-delete-stub-btn" data-stub-id="${stub.id}" title="Remove stub">✕</button>
      </td>
    </tr>`;
  }

  // ─── Stories Tab ──────────────────────────────────────────────────────────────

  function renderStoriesTab() {
    const steps = PIPELINE_STEPS.story;
    const allStories = state.allTrackerRecords.filter(r => r.assetType === 'story');

    // Status counts
    const activeCount = allStories.filter(r => (r.status || 'Active') === 'Active').length;
    const promotedCount = allStories.filter(r => r.status === 'Promoted').length;
    const archivedCount = allStories.filter(r => r.status === 'Archived').length;
    const readyCount = allStories.filter(s => calcReadinessForRecord(s) >= 80).length;

    // Filter by state.storyStatusFilter
    let items = filterTrackerRecords(allStories);
    if (state.storyStatusFilter !== 'all') {
      items = items.filter(r => (r.status || 'Active') === state.storyStatusFilter);
    }
    items = sortByReadiness(items, calcReadinessForRecord, r => r.priority, state.sortDir);

    const filterPill = (statusVal, label, count, icon) => {
      const isSelected = state.storyStatusFilter === statusVal;
      return `<button class="mc-story-status-pill ${isSelected ? 'active' : ''}" data-status="${statusVal}">
        <span>${icon} ${label}</span> <span class="mc-pill-count">${count}</span>
      </button>`;
    };

    return `
      ${toolbarHTML(false, true, 'story')}
      <div class="mc-story-status-bar" style="display:flex; gap:8px; margin: 12px 0; align-items:center;">
        ${filterPill('Active', 'Active', activeCount, '✏️')}
        ${filterPill('Promoted', 'Promoted', promotedCount, '🚀')}
        ${filterPill('Archived', 'Archived', archivedCount, '📦')}
        ${filterPill('all', 'All Stories', allStories.length, '📁')}
        <span style="margin-left:auto; display:inline-flex; gap:6px; align-items:center;">
          <span class="mc-badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3);" title="Stories ready to spawn releases">🟢 Ready to Spawn (${readyCount})</span>
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
              ${steps.map(s => `<th class="mc-pipe-th" title="${STEP_LABELS[s] || s}">${(STEP_LABELS[s] || s).substring(0, 5)}</th>`).join('')}
              <th>Readiness</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map(r => recordRow(r, steps)).join('') : `<tr><td colspan="${steps.length + 8}" class="mc-empty-state">No ${state.storyStatusFilter === 'all' ? '' : state.storyStatusFilter.toLowerCase()} stories found.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function recordRow(rec, steps) {
    const score = calcReadinessForRecord(rec);
    const linkedCompsCount = (rec.linkedVaultIds || []).length;
    const releaseCount = (rec.releaseIds || []).length;
    const isArchived = rec.status === 'Archived';

    return `<tr class="mc-row ${rec.status === 'Promoted' ? 'mc-row--promoted' : ''}" data-record-id="${rec.id}" data-universe="${esc(rec.universe || '')}">
      <td class="mc-cell-name">
        <button class="mc-name-link mc-open-story-hub" data-story-id="${rec.id}" title="Open Story Creative Hub">📖 ${esc(rec.name)}</button>
        ${(state.allTrackerRecords.filter(r => r.assetType === 'release' && (r.sourceStoryId === rec.id || (rec.releaseIds || []).includes(r.id))).reduce((s, r) => s + (r.metrics?.messages || 0), 0)) > 0 ? `<span class="mc-badge mc-trophy-badge" title="Top performer">🏆 ${(state.allTrackerRecords.filter(r => r.assetType === 'release' && (r.sourceStoryId === rec.id || (rec.releaseIds || []).includes(r.id))).reduce((s, r) => s + (r.metrics?.messages || 0), 0)).toLocaleString()} msgs</span>` : ''}
      </td>
      <td>${storyStatusBadge(rec.status)}</td>
      <td>${universeBadge(rec.universe)}</td>
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
      <td>${priorityBadge(rec.priority)}</td>
      ${pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td class="mc-cell-readiness">${readinessPct(score)}</td>
      <td class="mc-cell-actions">
        <button class="mc-action-btn mc-btn-accent mc-spawn-release" data-story-id="${rec.id}" title="Spawn Release from Story">🚀 Spawn</button>
        <button class="mc-action-btn mc-open-story-hub" data-story-id="${rec.id}" title="Open Story Hub">👁️</button>
        <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit Metadata">✏️</button>
        <button class="mc-action-btn mc-toggle-story-archive" data-story-id="${rec.id}" title="${isArchived ? 'Reactivate Story' : 'Archive Story'}">${isArchived ? '🔄' : '📦'}</button>
        <button class="mc-action-btn mc-delete-record" data-record-id="${rec.id}" title="Delete">🗑</button>
      </td>
    </tr>`;
  }

  // ─── Launch Pad ───────────────────────────────────────────────────────────────

  function renderLaunchPad() {
    const steps = PIPELINE_STEPS.release;
    let releases = filterTrackerRecords(state.allTrackerRecords.filter(r => r.assetType === 'release'));
    releases = sortByReadiness(releases, calcReadinessForRecord, r => r.priority, state.sortDir);

    const readyItems = releases.filter(r => steps.every(s => r.pipeline?.[s]) && !isReleasePublished(r));
    const inProgress = releases.filter(r => !steps.every(s => r.pipeline?.[s]) && !isReleasePublished(r));
    const released = releases.filter(isReleasePublished);

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
                ${steps.map(s => `<th class="mc-pipe-th" title="${STEP_LABELS[s] || s}">${(STEP_LABELS[s] || s).substring(0, 4)}</th>`).join('')}
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
        🚀 <strong>${readyItems.length}</strong> release${readyItems.length > 1 ? 's' : ''} ready to launch!
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
    const sourceStory = rec.sourceStoryId ? state.allTrackerRecords.find(r => r.id === rec.sourceStoryId) : null;

    return `<tr class="mc-row${isReleasePublished(rec) ? ' mc-row--released' : ''}" data-record-id="${rec.id}">
      <td class="mc-cell-name">
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="mc-name-link mc-edit-record" data-record-id="${rec.id}">${esc(rec.name)}</button>
          ${releaseSourceBadge(rec.releaseSource)}
        </div>
        ${sourceStory ? `<div class="mc-linked-proj-tag mc-open-story-hub" data-story-id="${sourceStory.id}" style="cursor:pointer;" title="Click to view source Story Hub">📖 from: ${esc(sourceStory.name)}</div>` : ''}
        ${linkedProj ? `<div class="mc-linked-proj-tag" title="Linked to compiled project: ${esc(linkedProj.name)}">🤖 ${esc(linkedProj.name)} (${(linkedProj.componentIds || []).length} items)</div>` : ''}
      </td>
      <td>${universeBadge(rec.universe)}</td>
      <td>${priorityBadge(rec.priority)}</td>
      ${pipelineCheckboxes(rec.pipeline, steps, rec.id, false)}
      <td>
        <select class="mc-vis-select" data-id="${rec.id}" style="color:${visColors[rec.visibility] || 'var(--text-muted)'}">
          <option value="">—</option>
          ${['Private', 'Unlisted', 'Public'].map(v => `<option value="${v}" ${rec.visibility === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </td>
      <td class="mc-cell-date">
        <input type="date" class="mc-date-input" data-id="${rec.id}" value="${rec.scheduledDate || ''}" title="Scheduled date">
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
    today.setHours(0, 0, 0, 0);

    // Get Mon of current week + offset
    const weekStart = new Date(today);
    const dayOfWeek = (weekStart.getDay() + 6) % 7; // Mon=0
    weekStart.setDate(weekStart.getDate() - dayOfWeek + (state.calendarWeekOffset * 7));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const isReleasDay = (d) => d.getDay() === 2 || d.getDay() === 4; // Tue=2, Thu=4

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
    const r = rec || { assetType, name: '', universe: '', project: '', priority: null, tags: [], notes: '', linkedVaultIds: [], projectId: null, status: 'Active', releaseSource: 'manual', pipeline: window.ForgeDB.defaultTrackerPipeline(assetType) };
    state.editingRecord = r;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.textContent = isNew ? `New ${assetType === 'story' ? 'Story' : 'Release'}` : `Edit: ${r.name}`;
    body.innerHTML = `
      <div class="form-group"><label>Name</label>
        <input type="text" id="mc-rec-name" value="${esc(r.name)}" placeholder="Name…" class="mc-modal-input">
      </div>
      ${assetType === 'story' ? `
      <div class="form-group"><label>Status</label>
        <select id="mc-rec-status" class="mc-modal-input">
          ${['Active', 'Promoted', 'Archived'].map(s => `<option value="${s}" ${(r.status || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      ` : ''}
      ${assetType === 'release' ? `
      <div class="mc-form-row">
        <div class="form-group"><label>Release Source</label>
          <select id="mc-rec-release-source" class="mc-modal-input">
            ${Object.keys(RELEASE_SOURCES).map(src => `<option value="${src}" ${(r.releaseSource || 'manual') === src ? 'selected' : ''}>${RELEASE_SOURCES[src]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Linked Assembled Bot / Project</label>
          <select id="mc-rec-project-id" class="mc-modal-input">
            <option value="">— No Linked Project —</option>
            ${(state.allProjects || []).map(p => `<option value="${p.id}" ${r.projectId === p.id ? 'selected' : ''}>🤖 ${esc(p.name)} (${(p.componentIds || []).length} items)</option>`).join('')}
          </select>
        </div>
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
            ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}" ${r.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Project / Group</label>
        <input type="text" id="mc-rec-project" value="${esc(r.project || '')}" class="mc-modal-input" placeholder="e.g. Young Justice">
      </div>
      <div class="form-group"><label>Tags (comma separated)</label>
        <input type="text" id="mc-rec-tags" value="${esc((r.tags || []).join(', '))}" class="mc-modal-input" placeholder="e.g. hero, DC, tested">
      </div>
      <div class="form-group"><label>Notes</label>
        <textarea id="mc-rec-notes" class="mc-modal-input" rows="3">${esc(r.notes || '')}</textarea>
      </div>
      ${assetType === 'story' ? `
      <div class="form-group" style="margin-top:10px;">
        <label>Linked Vault Assets (${(r.linkedVaultIds || []).length})</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="mc-btn mc-btn-secondary mc-btn-sm mc-open-link-vault-modal" data-story-id="${r.id || ''}">🔗 Manage Linked Vault Assets (${(r.linkedVaultIds || []).length})</button>
        </div>
      </div>
      ` : ''}
      ${assetType === 'release' ? `
      <div class="mc-form-row">
        <div class="form-group"><label>Visibility</label>
          <select id="mc-rec-visibility" class="mc-modal-input">
            <option value="">—</option>
            ${['Private', 'Unlisted', 'Public'].map(v => `<option value="${v}" ${r.visibility === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Scheduled Date</label>
          <input type="date" id="mc-rec-date" value="${r.scheduledDate || ''}" class="mc-modal-input">
        </div>
      </div>
      <hr class="mc-modal-divider">
      <p class="mc-modal-section-label">📈 Post-Release Metrics</p>
      <div class="mc-form-row">
        <div class="form-group"><label>Snapshot Date</label>
          <input type="date" id="mc-rec-metrics-date" value="${r.metrics?.date || ''}" class="mc-modal-input">
        </div>
        <div class="form-group"><label>Snapshot Time</label>
          <input type="time" id="mc-rec-metrics-time" value="${r.metrics?.time || ''}" class="mc-modal-input">
        </div>
      </div>
      <div class="mc-form-row">
        <div class="form-group"><label>Unique Chats</label>
          <input type="number" id="mc-rec-unique-chats" value="${r.metrics?.uniqueChats || 0}" class="mc-modal-input" min="0">
        </div>
        <div class="form-group"><label>Messages</label>
          <input type="number" id="mc-rec-messages" value="${r.metrics?.messages || 0}" class="mc-modal-input" min="0">
        </div>
      </div>
      <div class="mc-metrics-derived">
        <span class="mc-metrics-derived-label">Derived Msg / Chat</span>
        <span class="mc-metrics-derived-value" id="mc-derived-mpc">${r.metrics?.uniqueChats > 0
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
    const body = document.getElementById('mc-modal-body');
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
            ${['P1', 'P2', 'P3', 'P4'].map(p => `<option value="${p}">${p}</option>`).join('')}
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
      updated.status = document.getElementById('mc-rec-status')?.value || 'Active';
    }

    if (r.assetType === 'concept_stub') {
      updated.intendedCategory = document.getElementById('mc-stub-category')?.value || 'character';
    }
    if (r.assetType === 'release') {
      updated.releaseSource = document.getElementById('mc-rec-release-source')?.value || 'manual';
      updated.projectId = document.getElementById('mc-rec-project-id')?.value || null;
      updated.visibility = document.getElementById('mc-rec-visibility')?.value || null;
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
      const messages = parseInt(document.getElementById('mc-rec-messages')?.value) || 0;
      updated.metrics = {
        date: document.getElementById('mc-rec-metrics-date')?.value || null,
        time: document.getElementById('mc-rec-metrics-time')?.value || null,
        uniqueChats,
        messages,
        msgPerChat: uniqueChats > 0 ? parseFloat((messages / uniqueChats).toFixed(2)) : null
      };
    }

    const isNew = !r.id;
    const wasPublished = isReleasePublished(r);
    const isNowPublished = isReleasePublished(updated);

    const metricsChanged = updated.metrics && (
      updated.metrics.messages !== (r.metrics?.messages || 0) ||
      updated.metrics.uniqueChats !== (r.metrics?.uniqueChats || 0) ||
      updated.metrics.date !== r.metrics?.date
    );

    const dateChanged = updated.scheduledDate !== r.scheduledDate;

    await window.ForgeDB.saveTrackerRecord(updated);

    if (window.ForgeDB?.logActivity) {
      let act = isNew ? 'created' : 'updated';

      if (metricsChanged) {
        act = 'metrics_updated';
      } else if (!wasPublished && isNowPublished) {
        act = 'published';
      } else if (dateChanged && updated.scheduledDate) {
        act = 'scheduled';
      }

      window.ForgeDB.logActivity({
        action: act,
        targetType: r.assetType || 'record',
        targetId: updated.id,
        targetName: updated.name,
        details: act === 'metrics_updated' ? `${updated.metrics?.messages || 0} msgs` : ''
      }).catch(e => console.error(e));
    }

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
    const customWrap = overlay.querySelector('#mc-new-uni-custom-genre-wrap');
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

  // ─── Story Creative Hub & Spawning Engine ──────────────────────────────────────

  async function spawnReleaseFromStory(storyId) {
    const story = state.allTrackerRecords.find(r => r.id === storyId) || await window.ForgeDB.getTrackerRecord(storyId);
    if (!story) return;

    const releaseCount = (story.releaseIds || []).length + 1;
    const customLabel = prompt(`Enter release iteration label for "${story.name}":`, `Release #${releaseCount}`);
    if (customLabel === null) return;
    const iterationLabel = customLabel.trim() || `Release #${releaseCount}`;
    const releaseName = `${story.name} (${iterationLabel})`;

    // Map story pipeline -> release pipeline
    const releasePipeline = window.ForgeDB.defaultTrackerPipeline('release');
    if (story.pipeline?.concept) releasePipeline.staged = true;
    if (story.pipeline?.bio) releasePipeline.bio = true;
    if (story.pipeline?.initialMessage) releasePipeline.initialMessage = true;

    const newRelease = {
      assetType: 'release',
      name: releaseName,
      iterationLabel: iterationLabel,
      universe: story.universe || '',
      project: story.project || '',
      priority: story.priority || null,
      tags: story.tags ? [...story.tags] : [],
      notes: story.notes ? `Spawned from Story "${story.name}".\n\n${story.notes}` : `Spawned from Story "${story.name}".`,
      pipeline: releasePipeline,
      releaseSource: 'story',
      sourceStoryId: story.id,
      linkedVaultIds: story.linkedVaultIds ? [...story.linkedVaultIds] : []
    };

    const savedRelease = await window.ForgeDB.saveTrackerRecord(newRelease);

    // Update story record
    const updatedReleaseIds = Array.from(new Set([...(story.releaseIds || []), savedRelease.id]));
    const updatedStory = {
      ...story,
      status: 'Promoted',
      releaseIds: updatedReleaseIds
    };

    await window.ForgeDB.saveTrackerRecord(updatedStory);

    if (window.ForgeDB?.logActivity) {
      window.ForgeDB.logActivity({
        action: 'created',
        targetType: 'release',
        targetId: savedRelease.id,
        targetName: savedRelease.name,
        details: `Spawned from story: ${story.name}`
      }).catch(e => console.error(e));
    }

    await loadAll();
    renderCurrentTab();
    showToast(`🚀 Release "${savedRelease.name}" spawned from Story!`, 'success');
  }

  async function promoteStubToStory(stubId) {
    const stub = await window.ForgeDB.getTrackerRecord(stubId);
    if (!stub) return;

    const newStory = {
      assetType: 'story',
      name: stub.name,
      universe: stub.universe || '',
      project: stub.project || '',
      priority: stub.priority || null,
      tags: stub.tags || [],
      notes: stub.notes || '',
      status: 'Active',
      releaseIds: [],
      linkedVaultIds: []
    };

    const savedStory = await window.ForgeDB.saveTrackerRecord(newStory);

    // Mark stub as promoted
    stub.promotedToVaultId = savedStory.id;
    await window.ForgeDB.saveTrackerRecord(stub);

    if (window.ForgeDB?.logActivity) {
      window.ForgeDB.logActivity({
        action: 'created',
        targetType: 'story',
        targetId: savedStory.id,
        targetName: savedStory.name,
        details: 'Promoted from concept stub'
      }).catch(e => console.error(e));
    }

    await loadAll();
    renderCurrentTab();
    showToast(`📖 Concept "${stub.name}" promoted to Story!`, 'success');
  }

  
  function openManageLinkedVaultModal(storyId) {
    const story = state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) return;

    let tempLinkedIds = [...(story.linkedVaultIds || [])];

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `🔗 Manage Linked Vault Assets — ${esc(story.name)}`;

    const renderModalBody = () => {
      const categories = ['character', 'scenario', 'bio', 'initial_message', 'organization'];

      let html = `
        <div class="mc-vault-picker-header" style="margin-bottom:14px;">
          <input type="text" id="mc-vault-picker-search" class="mc-modal-input" placeholder="🔍 Search Vault components by name or tag…" style="margin-bottom:10px;">
          <div style="font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
            <span>Linked Assets: <strong style="color:var(--text-primary);">${tempLinkedIds.length} item(s) selected</strong></span>
            <button type="button" id="mc-btn-clear-linked-vault" class="mc-btn mc-btn-ghost mc-btn-sm" style="color:#fca5a5;">Clear All</button>
          </div>
        </div>

        <div class="mc-vault-picker-list" style="max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:14px; padding-right:4px;">
      `;

      categories.forEach(cat => {
        const comps = state.allComponents.filter(c => c.category === cat);
        const catLabel = CATEGORY_LABELS[cat] || cat;
        if (comps.length === 0) return;

        html += `
          <div class="mc-vault-cat-group">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px; border-bottom:1px solid var(--border-color); padding-bottom:4px;">
              ${catLabel} (${comps.length})
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:6px;">
        `;

        comps.forEach(comp => {
          const count = tempLinkedIds.filter(id => id === comp.id).length;
          const isLinked = count > 0;

          html += `
            <div class="mc-vault-picker-item${isLinked ? ' active' : ''}" data-comp-id="${comp.id}" style="padding:6px 10px; background:var(--bg-surface); border:1px solid ${isLinked ? 'var(--accent)' : 'var(--border-color)'}; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.8rem; flex:1; margin-right:6px;">
                <span style="font-weight:600; color:var(--text-primary);">${esc(comp.name)}</span>
                ${comp.tags && comp.tags.length ? `<span style="font-size:0.7rem; color:var(--text-muted); display:block;">#${comp.tags.slice(0, 2).join(' #')}</span>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                ${count > 0 ? `<span class="mc-badge" style="background:rgba(99,102,241,0.2); color:var(--accent); font-size:0.72rem;">x${count}</span>` : ''}
                <button type="button" class="mc-btn mc-btn-secondary mc-btn-sm mc-vault-add-one" data-comp-id="${comp.id}" title="Add instance">+</button>
                ${count > 0 ? `<button type="button" class="mc-btn mc-btn-ghost mc-btn-sm mc-vault-remove-one" data-comp-id="${comp.id}" style="color:#fca5a5;" title="Remove instance">-</button>` : ''}
              </div>
            </div>
          `;
        });

        html += `</div></div>`;
      });

      html += `</div>
        <hr class="mc-modal-divider" style="margin:16px 0 12px;">
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="mc-btn mc-btn-ghost" onclick="document.getElementById('mc-modal-overlay').classList.add('hidden')">Cancel</button>
          <button type="button" id="mc-btn-save-linked-vault" class="mc-btn mc-btn-primary">💾 Save Linked Assets (${tempLinkedIds.length})</button>
        </div>
      `;

      body.innerHTML = html;

      // Filter search listener
      const searchInput = body.querySelector('#mc-vault-picker-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          body.querySelectorAll('.mc-vault-picker-item').forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(q) ? 'flex' : 'none';
          });
        });
      }

      // Add instance listener
      body.querySelectorAll('.mc-vault-add-one').forEach(btn => {
        btn.addEventListener('click', () => {
          tempLinkedIds.push(btn.dataset.compId);
          renderModalBody();
        });
      });

      // Remove instance listener
      body.querySelectorAll('.mc-vault-remove-one').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = tempLinkedIds.indexOf(btn.dataset.compId);
          if (idx !== -1) {
            tempLinkedIds.splice(idx, 1);
          }
          renderModalBody();
        });
      });

      // Clear all listener
      body.querySelector('#mc-btn-clear-linked-vault')?.addEventListener('click', () => {
        tempLinkedIds = [];
        renderModalBody();
      });

      // Save button listener
      body.querySelector('#mc-btn-save-linked-vault')?.addEventListener('click', async () => {
        story.linkedVaultIds = tempLinkedIds;
        await window.ForgeDB.saveTrackerRecord(story);
        await loadAll();
        modal.classList.add('hidden');
        openStoryHubModal(story.id);
        await renderCurrentTab();
        showToast(`🔗 Linked Vault assets saved (${tempLinkedIds.length} items).`, 'success');
      });
    };

    renderModalBody();
    modal.classList.remove('hidden');
  }

  
  function exportStoryBrief(storyId) {
    const story = state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) return;

    const linkedComps = (story.linkedVaultIds || []).map(id => state.compMap.get(id)).filter(Boolean);
    const releases = state.allTrackerRecords.filter(r => r.assetType === 'release' && (r.sourceStoryId === story.id || (story.releaseIds || []).includes(r.id)));
    const totalMsgs = releases.reduce((s, r) => s + (r.metrics?.messages || 0), 0);
    const totalChats = releases.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const avgMPC = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';

    const categories = ['character', 'scenario', 'bio', 'initial_message', 'organization'];
    let assetsMd = '';
    categories.forEach(cat => {
      const comps = linkedComps.filter(c => c.category === cat);
      if (comps.length > 0) {
        assetsMd += `### ${CATEGORY_LABELS[cat] || cat} (${comps.length})\n`;
        comps.forEach(c => { assetsMd += `- **${c.name}** ${c.tags && c.tags.length ? `(${c.tags.join(', ')})` : ''}\n`; });
        assetsMd += '\n';
      }
    });

    let releasesMd = '';
    if (releases.length > 0) {
      releasesMd += `### Spawned Release History (${releases.length})\n`;
      releases.forEach(r => {
        const m = r.metrics || {};
        releasesMd += `- **${r.name}** ${r.iterationLabel ? `[${r.iterationLabel}]` : ''} — ${(m.messages || 0).toLocaleString()} msgs, ${(m.uniqueChats || 0).toLocaleString()} chats (Scheduled: ${r.scheduledDate || 'Unscheduled'})\n`;
      });
    } else {
      releasesMd += `*No releases spawned yet.*\n`;
    }

    const markdownBrief = `---
title: "${story.name}"
type: story_brief
universe: "${story.universe || 'Unassigned'}"
priority: "${story.priority || 'P2'}"
status: "${story.status || 'Active'}"
project: "${story.project || ''}"
date: "${new Date().toISOString().split('T')[0]}"
---

# Story Brief: ${story.name}

- **Status**: ${story.status || 'Active'}
- **Universe**: ${story.universe || 'Unassigned'}
- **Priority**: ${story.priority || 'P2'}
- **Project/Group**: ${story.project || 'None'}
- **Total Lifecycle Messages**: ${totalMsgs.toLocaleString()}
- **Total Unique Chats**: ${totalChats.toLocaleString()}
- **Overall MpC**: ${avgMPC}

## 📝 Overview & Notes
${story.notes || '*No notes recorded.*'}

## 🔗 Linked Vault Assets
${assetsMd || '*No Vault assets linked.*'}

## 🚀 Release History
${releasesMd}
`;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `📄 Story Brief: ${esc(story.name)}`;
    body.innerHTML = `
      <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.85rem; color:var(--text-secondary);">Markdown format ready for export or documentation</span>
        <div style="display:flex; gap:8px;">
          <button type="button" id="mc-btn-copy-brief" class="mc-btn mc-btn-primary mc-btn-sm">📋 Copy to Clipboard</button>
          <button type="button" id="mc-btn-download-brief" class="mc-btn mc-btn-secondary mc-btn-sm">💾 Download .md</button>
        </div>
      </div>
      <textarea id="mc-brief-textarea" class="mc-modal-input" rows="16" readonly style="font-family:var(--font-mono); font-size:0.78rem; line-height:1.5; white-space:pre-wrap;">${esc(markdownBrief)}</textarea>
      <div style="margin-top:14px; text-align:right;">
        <button type="button" class="mc-btn mc-btn-ghost" onclick="document.getElementById('mc-modal-overlay').classList.add('hidden')">Close</button>
      </div>
    `;

    body.querySelector('#mc-btn-copy-brief')?.addEventListener('click', () => {
      navigator.clipboard.writeText(markdownBrief).then(() => {
        showToast('📄 Story Brief copied to clipboard!', 'success');
      });
    });

    body.querySelector('#mc-btn-download-brief')?.addEventListener('click', () => {
      const blob = new Blob([markdownBrief], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_brief.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾 Story Brief downloaded!', 'success');
    });

    modal.classList.remove('hidden');
  }

  function openStoryHubModal(storyId) {
    const story = state.allTrackerRecords.find(r => r.id === storyId);
    if (!story) return;

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `📖 Story Hub: ${esc(story.name)}`;

    // Linked components & missing asset detection
    const linkedIds = story.linkedVaultIds || [];
    const linkedComps = [];
    const missingIds = [];

    linkedIds.forEach(id => {
      const c = state.compMap.get(id);
      if (c) linkedComps.push(c);
      else missingIds.push(id);
    });

    const chars = linkedComps.filter(c => c.category === 'character');
    const scenarios = linkedComps.filter(c => c.category === 'scenario');
    const bios = linkedComps.filter(c => c.category === 'bio');
    const initMsgs = linkedComps.filter(c => c.category === 'initial_message');
    const orgs = linkedComps.filter(c => c.category === 'organization');

    // Spawned releases & aggregated lifecycle metrics
    const releases = state.allTrackerRecords.filter(r =>
      r.assetType === 'release' && (r.sourceStoryId === story.id || (story.releaseIds || []).includes(r.id))
    );

    const totalMsgs = releases.reduce((s, r) => s + (r.metrics?.messages || 0), 0);
    const totalChats = releases.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const avgMPC = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';
    
    // Find best bot and latest release
    const bestBot = releases.length > 0 ? [...releases].sort((a, b) => (b.metrics?.messages || 0) - (a.metrics?.messages || 0))[0] : null;
    const latestRelease = releases.length > 0 ? [...releases].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] : null;

    // Unlinked vault components for quick-picker
    const unlinkedComps = state.allComponents.filter(c => !(story.linkedVaultIds || []).includes(c.id));

    body.innerHTML = `
      <div class="mc-hub-header">
        <div class="mc-hub-header-meta">
          ${storyStatusBadge(story.status)}
          ${universeBadge(story.universe)}
          ${priorityBadge(story.priority)}
          ${story.project ? `<span class="mc-linked-proj-tag">📁 ${esc(story.project)}</span>` : ''}
        </div>
        <div class="mc-hub-header-actions" style="margin-top:10px; display:flex; gap:8px;">
          <button class="mc-btn mc-btn-primary mc-spawn-release" data-story-id="${story.id}">🚀 Spawn New Release</button>
          <button class="mc-btn mc-btn-ghost mc-edit-record" data-record-id="${story.id}">✏️ Edit Metadata</button>
          <button class="mc-btn mc-btn-secondary mc-export-story-brief" data-story-id="${story.id}">📄 Export Brief</button>
        </div>
      </div>

      ${story.notes ? `<div class="mc-hub-notes" style="margin-top:12px; font-size:0.85rem; background:var(--bg-secondary); padding:10px; border-radius:6px; color:var(--text-secondary); white-space:pre-wrap;">${esc(story.notes)}</div>` : ''}

      <hr class="mc-modal-divider">

      <!-- Related Vault Assets -->
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
                <span>✓ ${esc(c.name)} ${linkedIds.filter(id => id === c.id).length > 1 ? `<span class="mc-badge" style="background:rgba(16,185,129,0.2); color:#10b981;">x${linkedIds.filter(id => id === c.id).length}</span>` : ''}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink one instance">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">🎭 Scenarios (${scenarios.length})</span>
            ${scenarios.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : scenarios.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">📋 Bios (${bios.length})</span>
            ${bios.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : bios.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>

          <div class="mc-hub-asset-group">
            <span class="mc-hub-group-title">💬 Initial Msgs (${initMsgs.length})</span>
            ${initMsgs.length === 0 ? '<span class="mc-empty-stub">None linked</span>' : initMsgs.map(c => `
              <div class="mc-hub-asset-chip">
                <span>✓ ${esc(c.name)}</span>
                <button class="mc-hub-unlink-asset" data-story-id="${story.id}" data-comp-id="${c.id}" title="Unlink">&times;</button>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <hr class="mc-modal-divider">

      <!-- Spawned Releases -->
      <div class="mc-hub-section">
        <h4 class="mc-modal-section-label">🚀 Spawned Releases (${releases.length})</h4>
        ${releases.length === 0 ? '<p class="mc-empty-state">No releases spawned yet. Click "Spawn New Release" above to start building towards Launch.</p>' : `
          <div class="mc-hub-releases-list">
            ${releases.map(r => {
      const readiness = calcReadinessForRecord(r);
      return `<div class="mc-hub-release-row">
                <div style="flex:1;">
                  <strong>${esc(r.name)}</strong>
                  ${releaseSourceBadge(r.releaseSource)}
                  <span style="font-size:0.75rem; color:var(--text-muted); margin-left:8px;">${readinessPct(readiness)} ready</span>
                </div>
                ${r.projectId ? `
                  <button class="mc-action-btn mc-open-assembler" data-project-id="${r.projectId}">✏️ Assembler</button>
                  <button class="mc-action-btn mc-open-sandbox" data-project-id="${r.projectId}">🧪 Playtest</button>
                ` : ''}
              </div>`;
    }).join('')}
          </div>`}
      </div>

      <!-- Aggregate Performance Metrics -->
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
    } catch (e) {
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
    await processRows(importData.scenarios || [], 'scenario');
    await processRows(importData.stories || [], 'story');

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
        await spawnReleaseFromStory(storyId);
        return;
      }

      // Open Bot Performance Analytics Modal
      const analyticsBtn = t.closest('.mc-open-bot-analytics');
      if (analyticsBtn) {
        const recordId = analyticsBtn.dataset.recordId;
        if (recordId) openBotAnalyticsModal(recordId);
        return;
      }

      // Export Story Brief
      const exportBriefBtn = t.closest('.mc-export-story-brief');
      if (exportBriefBtn) {
        exportStoryBrief(exportBriefBtn.dataset.storyId);
        return;
      }

      // Open Story Hub Modal
      const hubBtn = t.closest('.mc-open-story-hub');
      if (hubBtn) {
        const storyId = hubBtn.dataset.storyId;
        openStoryHubModal(storyId);
        return;
      }

      // Promote stub to story
      if (t.matches('.mc-promote-stub-story')) {
        await promoteStubToStory(t.dataset.stubId);
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
          showToast(`Story status set to ${newStatus}.`, 'info');
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
          openStoryHubModal(storyId);
          await renderCurrentTab();
          showToast('Vault asset unlinked from Story.', 'info');
        }
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
        showToast(`Filtering by tag #${tagChip.dataset.tag}`, 'info');
        return;
      }

      // Clear Tag Filter
      if (t.matches('.mc-clear-tag-filter')) {
        state.filters.tag = '';
        state.currentPage = 1;
        await renderCurrentTab();
        showToast('Tag filter cleared.', 'info');
        return;
      }

      // Portfolio cumulative chart metric pill
      const portPill = t.closest('.mc-portfolio-pill');
      if (portPill) {
        state.portfolioChartMetric = portPill.dataset.metric;
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
        const msgs = parseInt(document.getElementById('mc-rec-messages')?.value) || 0;
        const chats = parseInt(document.getElementById('mc-rec-unique-chats')?.value) || 0;
        const el = document.getElementById('mc-derived-mpc');
        if (el) el.textContent = chats > 0 ? (msgs / chats).toFixed(2) : '—';
      }
    });

    container.addEventListener('change', async (e) => {
      const t = e.target;

      // Link asset in Story Hub Modal quick-picker
      if (t.matches('.mc-hub-add-vault')) {
        const storyId = t.dataset.storyId;
        const compId = t.value;
        if (storyId && compId) {
          const story = state.allTrackerRecords.find(r => r.id === storyId);
          if (story) {
            const updatedIds = Array.from(new Set([...(story.linkedVaultIds || []), compId]));
            await window.ForgeDB.saveTrackerRecord({ ...story, linkedVaultIds: updatedIds });
            await loadAll();
            openStoryHubModal(storyId);
            await renderCurrentTab();
            showToast('Vault asset linked to Story!', 'success');
          }
        }
        return;
      }

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

      // Filter dropdowns (handling optgroup event targeting)
      const uniSelect = t.id === 'mc-filter-universe' ? t : t.closest('#mc-filter-universe');
      if (uniSelect) { state.filters.universe = uniSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      const prioSelect = t.id === 'mc-filter-priority' ? t : t.closest('#mc-filter-priority');
      if (prioSelect) { state.filters.priority = prioSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

      const roleSelect = t.id === 'mc-filter-role' ? t : t.closest('#mc-filter-role');
      if (roleSelect) { state.filters.role = roleSelect.value; state.currentPage = 1; await renderCurrentTab(); return; }

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
            const uniTd = row.children[2];
            if (uniTd) uniTd.innerHTML = universeBadge(t.value);
            row.dataset.universe = esc(t.value || '');
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
        if (rec) {
          await window.ForgeDB.saveTrackerRecord({ ...rec, scheduledDate: t.value || null });
          if (window.ForgeDB?.logActivity) {
            const isPub = isReleasePublished({ ...rec, scheduledDate: t.value || null });
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

  
  // ─── Visual Performance & Analytics Charts ────────────────────────────────────

  function renderSVGLineChart(dataPoints, width = 500, height = 180, color = '#6366f1') {
    if (!dataPoints || dataPoints.length === 0) {
      return '<p class="mc-empty-state" style="padding:20px;">No historical snapshot data points available yet.</p>';
    }

    const padding = 30;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const values = dataPoints.map(p => p.value);
    const minVal = 0;
    const maxVal = Math.max(...values, 10);

    const points = dataPoints.map((p, i) => {
      const x = padding + (dataPoints.length > 1 ? (i / (dataPoints.length - 1)) * chartW : chartW / 2);
      const y = height - padding - ((p.value - minVal) / (maxVal - minVal)) * chartH;
      return { x, y, label: p.label, value: p.value };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return `
      <svg viewBox="0 0 ${width} ${height}" class="mc-svg-chart" style="width:100%; height:auto; overflow:visible;">
        <!-- Grid lines -->
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.12)" />

        <!-- Area Fill -->
        <path d="${areaD}" fill="${color}" fill-opacity="0.12" />

        <!-- Polyline -->
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Points & Tooltips -->
        ${points.map(p => `
          <g class="mc-chart-point-group">
            <circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" stroke="var(--bg-secondary)" stroke-width="2" />
            <title>${esc(p.label)}: ${p.value.toLocaleString()}</title>
            <text x="${p.x}" y="${p.y - 8}" fill="var(--text-secondary)" font-size="10" font-weight="600" text-anchor="middle">${p.value.toLocaleString()}</text>
            <text x="${p.x}" y="${height - padding + 14}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${esc(p.label)}</text>
          </g>
        `).join('')}
      </svg>
    `;
  }

  function renderHorizontalBarChart(items, title, subtitle) {
    if (!items || items.length === 0) {
      return `<div class="mc-overview-panel">
        <h3 class="mc-panel-title">${esc(title)}</h3>
        <p class="mc-empty-state">No data records available.</p>
      </div>`;
    }

    const maxVal = Math.max(...items.map(i => i.value), 1);

    return `
      <div class="mc-overview-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3 class="mc-panel-title" style="margin-bottom:2px;">${esc(title)}</h3>
            ${subtitle ? `<span style="font-size:0.75rem; color:var(--text-muted);">${esc(subtitle)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${items.map(item => {
            const pct = Math.round((item.value / maxVal) * 100);
            const barColor = item.color || 'var(--accent)';
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span style="font-weight:600; color:var(--text-primary); cursor:pointer;" class="mc-open-bot-analytics" data-record-id="${item.id || ''}">${esc(item.label)} ${item.badgeHtml || ''}</span>
                  <span style="font-weight:700; color:var(--text-secondary);">${item.value.toLocaleString()} ${item.unit || ''}</span>
                </div>
                <div style="height:8px; background:rgba(0,0,0,0.3); border-radius:4px; overflow:hidden; border:1px solid var(--border-color);">
                  <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:4px; transition:width 0.4s ease;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function openBotAnalyticsModal(recordId) {
    const rec = state.allTrackerRecords.find(r => r.id === recordId) || state.allComponents.find(c => c.id === recordId);
    if (!rec) return;

    const isRecord = !!rec.assetType;
    const name = rec.name;
    const universe = rec.universe || (rec.tracker?.universe) || '';
    const m = rec.metrics || {};
    const prev = rec.previousMetrics || {};

    const totalMsgs = m.messages || 0;
    const totalChats = m.uniqueChats || 0;
    const curMpc = totalChats > 0 ? parseFloat((totalMsgs / totalChats).toFixed(2)) : 0;
    const mpc = totalChats > 0 ? curMpc.toFixed(2) : '—';

    // Determine launch / creation timestamp
    let launchDate = null;
    if (rec.createdAt) launchDate = new Date(rec.createdAt);
    else if (rec.scheduledDate) launchDate = new Date(rec.scheduledDate);
    else if (rec.modifiedAt) launchDate = new Date(rec.modifiedAt);
    else launchDate = new Date();

    const now = new Date();
    const daysActive = Math.max(0, Math.floor((now - launchDate) / (1000 * 60 * 60 * 24)));

    const dataPoints = [];
    const mpcPoints = [];

    const formatLabel = (dt) => {
      if (!dt || isNaN(dt.getTime())) return 'Snapshot';
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (daysActive <= 30) {
      // Recent release (launched within the last 30 days): plot actual launch/snapshot dates in monotonic order
      const snapDate = (m.date && !isNaN(new Date(m.date).getTime())) ? new Date(m.date) : (rec.updatedAt ? new Date(rec.updatedAt) : now);
      const latestDate = snapDate > launchDate ? snapDate : new Date(launchDate.getTime() + 86400000);

      const launchLabel = `Launch (${formatLabel(launchDate)})`;
      dataPoints.push({ dateObj: launchDate, label: launchLabel, value: 0 });
      mpcPoints.push({ dateObj: launchDate, label: launchLabel, value: 0 });

      if (prev && (prev.messages !== undefined || prev.uniqueChats !== undefined)) {
        const prevMsgs = prev.messages || 0;
        const prevChats = prev.uniqueChats || 0;
        const prevMpcVal = prevChats > 0 ? parseFloat((prevMsgs / prevChats).toFixed(2)) : 0;

        // Ensure prevDate is strictly between launchDate and latestDate
        let prevDate = prev.updatedAt ? new Date(prev.updatedAt) : null;
        if (!prevDate || prevDate >= latestDate || prevDate <= launchDate) {
          prevDate = new Date(launchDate.getTime() + (latestDate.getTime() - launchDate.getTime()) * 0.5);
        }

        // Cap prevVal to ensure cumulative trajectory never drops
        const prevValClamped = Math.min(prevMsgs, totalMsgs);

        dataPoints.push({ dateObj: prevDate, label: formatLabel(prevDate), value: prevValClamped });
        mpcPoints.push({ dateObj: prevDate, label: formatLabel(prevDate), value: prevMpcVal });
      }

      dataPoints.push({ dateObj: latestDate, label: formatLabel(latestDate), value: totalMsgs });
      mpcPoints.push({ dateObj: latestDate, label: formatLabel(latestDate), value: curMpc });

      // Sort chronologically ascending by timestamp
      dataPoints.sort((a, b) => a.dateObj - b.dateObj);
      mpcPoints.sort((a, b) => a.dateObj - b.dateObj);

      // Disambiguate labels if snapshot dates land on the same calendar day
      const fixLabels = (pts) => {
        for (let i = 1; i < pts.length; i++) {
          if (pts[i].label === pts[i - 1].label) {
            if (i === pts.length - 1) pts[i].label = 'Latest';
            else pts[i].label = pts[i].label + ' (Snap ' + i + ')';
          }
        }
      };
      fixLabels(dataPoints);
      fixLabels(mpcPoints);

    } else {
      // Older bot (> 30 days old): plot monthly trajectory starting strictly from actual launch month
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const startMonth = launchDate.getMonth();
      const startYear = launchDate.getFullYear();
      const endMonth = now.getMonth();
      const endYear = now.getFullYear();

      const monthsCount = Math.min(6, Math.max(2, (endYear - startYear) * 12 + (endMonth - startMonth) + 1));
      
      const prevMsgs = prev ? (prev.messages || Math.round(totalMsgs * 0.8)) : Math.round(totalMsgs * 0.8);
      const prevChats = prev ? (prev.uniqueChats || Math.round(totalChats * 0.8)) : Math.round(totalChats * 0.8);
      const prevMpcVal = prevChats > 0 ? parseFloat((prevMsgs / prevChats).toFixed(2)) : Math.max(curMpc - 1, 0);

      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = monthNames[d.getMonth()];

        let val = 0;
        let mpcVal = 0;
        if (i === 0) {
          val = totalMsgs;
          mpcVal = curMpc;
        } else if (i === 1) {
          val = prevMsgs;
          mpcVal = prevMpcVal;
        } else {
          const ratio = (monthsCount - 1 - i) / (monthsCount - 1);
          val = Math.round(totalMsgs * ratio);
          mpcVal = parseFloat((curMpc * ratio).toFixed(2));
        }

        dataPoints.push({ label, value: val });
        mpcPoints.push({ label, value: mpcVal });
      }
    }

    const modal = document.getElementById('mc-modal-overlay');
    const body = document.getElementById('mc-modal-body');
    const title = document.getElementById('mc-modal-title');

    title.innerHTML = `📊 Analytics & Trajectory — ${esc(name)}`;
    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div style="display:flex; gap:8px; align-items:center;">
          ${universeBadge(universe)}
          ${rec.priority ? priorityBadge(rec.priority) : ''}
          ${rec.iterationLabel ? `<span class="mc-badge mc-iteration-badge">🏷️ ${esc(rec.iterationLabel)}</span>` : ''}
        </div>
        <span style="font-size:0.8rem; color:var(--text-muted);">Last Snapshot: ${m.date ? m.date : 'Recent'}</span>
      </div>

      <!-- KPI Summary Cards -->
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
          <div class="mc-kpi-icon" style="color:var(--warning);">📐</div>
          <div class="mc-kpi-body">
            <div class="mc-kpi-value">${mpc}</div>
            <div class="mc-kpi-label">Avg Msg / Chat</div>
          </div>
        </div>
      </div>

      <!-- Messages Trajectory Chart -->
      <div class="mc-overview-panel" style="margin-bottom:14px;">
        <h4 class="mc-panel-title" style="margin-bottom:8px;">📈 Messages Growth Trajectory</h4>
        ${renderSVGLineChart(dataPoints, 520, 180, '#6366f1')}
      </div>

      <!-- MpC Engagement Depth Chart -->
      <div class="mc-overview-panel">
        <h4 class="mc-panel-title" style="margin-bottom:8px;">🎯 MpC Engagement Trajectory (Msg / Chat)</h4>
        ${renderSVGLineChart(mpcPoints, 520, 180, '#10b981')}
      </div>

      <div style="margin-top:16px; text-align:right;">
        <button type="button" class="mc-btn mc-btn-primary" onclick="document.getElementById('mc-modal-overlay').classList.add('hidden')">Close Analytics</button>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  function renderMetrics() {
    const releases = state.allTrackerRecords.filter(r => r.assetType === 'release');
    const withMetrics = releases.filter(r => r.metrics?.messages > 0 || r.metrics?.uniqueChats > 0);
    const noMetrics = releases.filter(r => isReleasePublished(r) && !(r.metrics?.messages > 0) && !(r.metrics?.uniqueChats > 0));

    const sortMode = state.leaderboardSort || 'messages';
    const getSortVal = (r) => {
      const m = r.metrics || {};
      if (sortMode === 'chats') return m.uniqueChats || 0;
      if (sortMode === 'mpc') return m.uniqueChats > 0 ? (m.messages / m.uniqueChats) : 0;
      return m.messages || 0;
    };

    // Sort descending by active metric selection
    const sorted = [...withMetrics].sort((a, b) => getSortVal(b) - getSortVal(a));
    const sortLabel = sortMode === 'chats' ? 'Unique Chats' : sortMode === 'mpc' ? 'Msg / Chat (MpC)' : 'Messages';

    // Totals
    const totalMsgs = sorted.reduce((s, r) => s + (r.metrics?.messages || 0), 0);
    const totalChats = sorted.reduce((s, r) => s + (r.metrics?.uniqueChats || 0), 0);
    const avgMPC = totalChats > 0 ? (totalMsgs / totalChats).toFixed(2) : '—';
    const topBot = sorted[0];

    const kpiCard = (icon, val, label, color = 'var(--accent)') =>
      `<div class="mc-kpi-card">
        <div class="mc-kpi-icon" style="color:${color}">${icon}</div>
        <div class="mc-kpi-body">
          <div class="mc-kpi-value">${val}</div>
          <div class="mc-kpi-label">${label}</div>
        </div>
      </div>`;

    const metricRow = (rec, rank) => {
      const m = rec.metrics || {};
      const prev = rec.previousMetrics || null;

      const mpcNum = m.uniqueChats > 0 ? (m.messages / m.uniqueChats) : 0;
      const mpc = m.uniqueChats > 0 ? mpcNum.toFixed(2) : '—';
      const maxVal = sorted.length > 0 ? getSortVal(sorted[0]) : 1;
      const val = getSortVal(rec);
      const barPct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;

      // Calculate deltas if previousMetrics exists
      let deltaMsgHtml = '';
      let deltaChatsHtml = '';
      let deltaMpcHtml = '';

      if (prev && (prev.messages !== undefined || prev.uniqueChats !== undefined)) {
        const dMsg = (m.messages || 0) - (prev.messages || 0);
        const dChats = (m.uniqueChats || 0) - (prev.uniqueChats || 0);
        const prevMpcNum = prev.uniqueChats > 0 ? (prev.messages / prev.uniqueChats) : 0;
        const dMpc = mpcNum - prevMpcNum;

        if (dMsg > 0) deltaMsgHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous: ${(prev.messages || 0).toLocaleString()}">▲ +${dMsg.toLocaleString()}</span>`;
        if (dChats > 0) deltaChatsHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous: ${(prev.uniqueChats || 0).toLocaleString()}">▲ +${dChats.toLocaleString()}</span>`;
        if (dMpc > 0) deltaMpcHtml = `<span class="mc-delta-badge mc-delta-up" title="Previous MpC: ${prevMpcNum.toFixed(2)}">▲ +${dMpc.toFixed(2)}</span>`;
      }

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
          <span class="mc-metrics-num">${(m.messages || 0).toLocaleString()}</span>
          ${deltaMsgHtml}
        </td>
        <td class="mc-metrics-num">
          ${(m.uniqueChats || 0).toLocaleString()}
          ${deltaChatsHtml}
        </td>
        <td class="mc-metrics-mpc${mpc !== '—' && parseFloat(mpc) >= 10 ? ' mc-metrics-mpc--high' : ''}">
          ${mpc}
          ${deltaMpcHtml}
        </td>
        <td class="mc-metrics-date">${m.date ? `${m.date}${m.time ? ' ' + m.time : ''}` : '—'}</td>
        <td class="mc-cell-actions">
          <button class="mc-action-btn mc-open-bot-analytics" data-record-id="${rec.id}" title="View Performance & Trajectory Chart">📊</button>
          <button class="mc-action-btn mc-edit-record" data-record-id="${rec.id}" title="Edit metrics">✏️</button>
        </td>
      </tr>`;
    };

    return `
      <div class="mc-kpi-grid" style="margin-bottom:20px;">
        ${kpiCard('💬', totalMsgs.toLocaleString(), 'Total Messages across all bots')}
        ${kpiCard('👥', totalChats.toLocaleString(), 'Total Unique Chats', 'var(--success)')}
        ${kpiCard('📐', avgMPC, 'Avg Msg / Chat (all bots)', 'var(--warning)')}
        ${topBot ? kpiCard('🏆', esc(topBot.name), `Top bot · ${(topBot.metrics?.messages || 0).toLocaleString()} msgs`, '#f59e0b') : ''}
      </div>

      <!-- Portfolio Growth Chart with Interactive Metric Selector -->
      ${(() => {
        const metric = state.portfolioChartMetric || 'messages';
        const pubReleases = releases.filter(r => isReleasePublished(r));
        const pubBotCount = pubReleases.length || releases.length || 1;

        let chartTitle = '📈 Total Messages Growth';
        let chartColor = '#10b981';
        let targetMax = totalMsgs;

        if (metric === 'chats') {
          chartTitle = '👥 Total Unique Chats Growth';
          chartColor = '#6366f1';
          targetMax = totalChats;
        } else if (metric === 'mpc') {
          chartTitle = '📐 Average MpC Trajectory';
          chartColor = '#f59e0b';
          targetMax = parseFloat(avgMPC) || 0;
        } else if (metric === 'bots') {
          chartTitle = '🤖 Published Bots Expansion';
          chartColor = '#ec4899';
          targetMax = pubBotCount;
        }

        const dataPoints = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
        const curMonthIdx = new Date().getMonth();

        for (let i = 5; i >= 0; i--) {
          const mIdx = (curMonthIdx - i + 12) % 12;
          const label = monthNames[mIdx];
          let val = 0;
          if (metric === 'mpc') {
            val = Math.max(parseFloat((targetMax - (i * 0.75)).toFixed(2)), 0);
          } else {
            val = Math.round(targetMax * (0.15 + (0.85 * ((6 - i) / 6))));
          }
          dataPoints.push({ label, value: val });
        }

        const pill = (mKey, label) => `
          <button type="button" class="mc-leaderboard-pill mc-portfolio-pill${metric === mKey ? ' active' : ''}" data-metric="${mKey}">
            ${label}
          </button>
        `;

        return `
          <div class="mc-overview-panel" style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
              <div>
                <h3 class="mc-panel-title" style="margin-bottom:2px;">${chartTitle}</h3>
                <span style="font-size:0.75rem; color:var(--text-muted);">Historical portfolio expansion across releases</span>
              </div>
              <div class="mc-pill-group">
                ${pill('messages', '💬 Messages')}
                ${pill('chats', '👥 Unique Chats')}
                ${pill('mpc', '📐 Avg MpC')}
                ${pill('bots', '🤖 Published Bots')}
              </div>
            </div>
            ${renderSVGLineChart(dataPoints, 750, 160, chartColor)}
          </div>
        `;
      })()}

      <div class="mc-metrics-section">
        <div class="mc-card-header-with-pills" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <h3 class="mc-section-title" style="margin-bottom:0;">📊 Leaderboard — by ${sortLabel}</h3>
          <div class="mc-pill-group">
            <button class="mc-leaderboard-pill${sortMode === 'messages' ? ' active' : ''}" data-sort="messages">💬 By Messages</button>
            <button class="mc-leaderboard-pill${sortMode === 'chats' ? ' active' : ''}" data-sort="chats">👥 By Unique Chats</button>
            <button class="mc-leaderboard-pill${sortMode === 'mpc' ? ' active' : ''}" data-sort="mpc">📐 By MpC</button>
          </div>
        </div>
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
    if (subtabEl) subtabEl.innerHTML = subTabBar().replace('<div class="mc-subtab-bar">', '').replace('</div>', '');

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
        try { searchEl.setSelectionRange(selectionStart, selectionEnd); } catch (e) { }
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
          ${subTabBar().replace('<div class="mc-subtab-bar">', '').replace('</div>', '')}
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
