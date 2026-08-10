/**
 * js/mission_control/mc_state.js
 * Anansi Forge Mission Control - Core State & Constants
 */

(() => {
    const PIPELINE_STEPS = (typeof window !== 'undefined' && window.MissionControlMath && window.MissionControlMath.PIPELINE_STEPS) || {
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

    const SHORT_STEP_LABELS = {
        generated: 'GEN', goldenTemplate: '⭐ TPL', test1: 'TST 1', trimmed: 'TRIM',
        test2: 'TST 2', complete: 'COMP', published: 'PUBL',
        concept: 'CNCPT', notesReady: 'NOTES', initialMessage: 'INIT', bio: 'BIO',
        otherMessages: 'MSGS', testing: 'TEST',
        staged: 'STAGED', scenario: 'SCEN', personalityLocked: 'PERS', thumbnail: 'THUMB',
        banner: 'BANR', tagsDone: 'TAGS', initialTest: 'TST 1', regressionTest: 'REGR', finalPolish: 'PLSH', ready: 'READY'
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

    const SERIES_OPTIONS = {
        standard: '📦 Standard Release',
        workshop: '🔧 Workshop Piece',
        experimental: '🧪 Experimental',
        event_bot: '🎪 Event Bot'
    };

    const SERIES_COLORS = {
        standard: '#6366f1',
        workshop: '#10b981',
        experimental: '#f59e0b',
        event_bot: '#ec4899'
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
        filters: { search: '', universe: 'all', priority: 'all', role: 'all', tag: '', series: 'all' },
        overviewFilters: { universeCat: 'all', roleMode: 'role' },
        leaderboardSort: 'messages',
        portfolioChartMetric: 'messages',
        isSpawningRelease: false,
        metricsSeriesFilter: 'all',
        includeArchived: false,
        includePrivate: false,
        includePreRelease: false,
        archivedExpanded: false,
        privateExpanded: false,
        preReleaseExpanded: false,
        activeTagFilter: '',
        editingRecord: null,           // modal state
        calendarWeekOffset: 0
    };

    // Readiness Calculations
    function calcReadiness(pipeline, category) {
        if (typeof window !== 'undefined' && window.MissionControlMath && window.MissionControlMath.calcReadiness) {
            return window.MissionControlMath.calcReadiness(pipeline, category);
        }
        const steps = PIPELINE_STEPS[category] || PIPELINE_STEPS.character;
        if (!steps || !steps.length) return 0;
        const checked = steps.filter(s => pipeline && pipeline[s]).length;
        return checked / steps.length;
    }

    function calcReadinessForVault(comp) {
        if (typeof window !== 'undefined' && window.MissionControlMath && window.MissionControlMath.calcReadinessForVault) {
            return window.MissionControlMath.calcReadinessForVault(comp);
        }
        return calcReadiness(comp.tracker?.pipeline, comp.category);
    }

    function calcReadinessForRecord(rec) {
        if (typeof window !== 'undefined' && window.MissionControlMath && window.MissionControlMath.calcReadinessForRecord) {
            return window.MissionControlMath.calcReadinessForRecord(rec);
        }
        return calcReadiness(rec.pipeline, rec.assetType);
    }

    function priorityBoost(priority) {
        if (typeof window !== 'undefined' && window.MissionControlMath && window.MissionControlMath.priorityBoost) {
            return window.MissionControlMath.priorityBoost(priority);
        }
        return priority === 'P1' ? 0.005 : priority === 'P2' ? 0.003 : priority === 'P3' ? 0.001 : 0;
    }

    function sortByReadiness(items, getScore, getPriority, dir) {
        return [...items].sort((a, b) => {
            const sa = getScore(a) + priorityBoost(getPriority(a));
            const sb = getScore(b) + priorityBoost(getPriority(b));
            return dir === 'desc' ? sb - sa : sa - sb;
        });
    }

    // Filter Logic
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
        if (state.filters.series !== 'all') items = items.filter(r => (r.series || 'standard') === state.filters.series);
        if (activeTag) items = items.filter(r => (r.tags || []).includes(activeTag));
        return items;
    }

    // Data Loaders
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

        const colorMap = {};
        (state.allUniverses || []).forEach(u => {
            if (u.name) colorMap[u.name] = u.color || '#6b7280';
            if (u.id) colorMap[u.id] = u.color || '#6b7280';
        });
        state.universeColorMap = colorMap;

        if (window.ForgeDB?.captureSnapshot) {
            window.ForgeDB.captureSnapshot().catch(err => console.error(err));
        }
    }

    // Formatting & Badge Helpers
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

    function roleSelectBadge(r, compId, storeType = 'vault') {
        const roleVal = r || 'Other';
        const c = ROLE_COLORS[roleVal] || '#6b7280';
        const roles = ['Hero', 'Villain', 'AntiHero', 'Support', 'Other'];
        return `<select class="mc-badge-select mc-role-select" data-id="${compId}" data-store="${storeType}"
      style="background:${c}22; color:${c}; border:1px solid ${c}44; border-radius:12px; padding:2px 8px; font-size:0.75rem; font-weight:600; cursor:pointer; outline:none; text-align:center;"
      title="Click to change Role in place">
      ${roles.map(role => `<option value="${role}" ${roleVal === role ? 'selected' : ''} style="background:var(--bg-secondary); color:var(--text-primary);">${ROLE_ICONS[role] || ''} ${role}</option>`).join('')}
    </select>`;
    }

    function universeSelectBadge(u, compId, storeType = 'vault') {
        const uniVal = u || '';
        const c = (state.universeColorMap && state.universeColorMap[uniVal]) || UNIVERSE_COLORS[uniVal] || '#6b7280';
        return `<select class="mc-badge-select mc-universe-select" data-id="${compId}" data-store="${storeType}"
      style="background:${c}22; color:${c}; border:1px solid ${c}44; border-radius:12px; padding:2px 8px; font-size:0.75rem; font-weight:600; cursor:pointer; outline:none; text-align:center;"
      title="Click to change Universe in place">
      ${universeSelectOptionsHTML(uniVal, 'Select Universe')}
    </select>`;
    }

    function releaseSourceBadge(source) {
        const src = source || 'manual';
        const label = RELEASE_SOURCES[src] || src;
        const c = RELEASE_SOURCE_COLORS[src] || '#6b7280';
        return `<span class="mc-badge mc-badge--source" style="background:${c}18; color:${c}; border:1px solid ${c}44;" title="Release Source: ${esc(label)}">${esc(label)}</span>`;
    }

    function seriesBadge(series) {
        const key = series || 'standard';
        const label = SERIES_OPTIONS[key] || key;
        const color = SERIES_COLORS[key] || '#6b7280';
        return `<span class="mc-badge" style="background:${color}22; color:${color}; border:1px solid ${color}44; font-size:0.72rem;">${label}</span>`;
    }

    function seriesSelectBadge(series, recordId, storeType = 'record') {
        const key = series || 'standard';
        const color = SERIES_COLORS[key] || '#6b7280';
        return `<select class="mc-badge-select mc-series-select" data-id="${recordId}" data-store="${storeType}"
      style="background:${color}22; color:${color}; border:1px solid ${color}44; border-radius:12px; padding:2px 8px; font-size:0.75rem; font-weight:600; cursor:pointer; outline:none; text-align:center;"
      title="Click to change Series in place">
      ${Object.keys(SERIES_OPTIONS).map(k => `<option value="${k}" ${key === k ? 'selected' : ''} style="background:var(--bg-secondary); color:var(--text-primary);">${SERIES_OPTIONS[k]}</option>`).join('')}
    </select>`;
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
                const isSel = isMatchingUniverse(selectedVal, u.name) || isMatchingUniverse(selectedVal, u.id);
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
                const isSel = isMatchingUniverse(selectedVal, u.name) || isMatchingUniverse(selectedVal, u.id);
                html += `<option value="${esc(u.name)}" ${isSel ? 'selected' : ''}>${esc(u.name)}</option>`;
            });
            html += `</optgroup>`;
        });
        return html;
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

        const catMap = {
            characters: { label: '+ Character', cat: 'character' },
            orgs: { label: '+ Org', cat: 'organization' },
            scenarios: { label: '+ Scenario', cat: 'scenario' },
            messages: { label: '+ Init Msg', cat: 'initial_message' },
            bios: { label: '+ Bio', cat: 'bio' }
        };
        const quickAsset = catMap[state.activeSubTab];

        return `<div class="mc-toolbar">
      <div class="mc-toolbar-left">
        <input type="search" id="mc-search" name="mc-search" class="mc-search" placeholder="Search…" value="${esc(state.filters.search)}" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
        <select id="mc-filter-universe" class="mc-filter-select">
          ${universeFilterOptionsHTML(state.filters.universe)}
        </select>
        <select id="mc-filter-role" class="mc-filter-select">
          <option value="all">All Roles</option>
          ${roles.map(r => `<option value="${r}" ${state.filters.role === r ? 'selected' : ''}>${ROLE_ICONS[r] || ''} ${r}</option>`).join('')}
        </select>
        <select id="mc-filter-priority" class="mc-filter-select">
          <option value="all">All Priorities</option>
          ${priorities.map(p => `<option value="${p}" ${state.filters.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        ${state.activeSubTab === 'launchpad' ? `
        <select id="mc-filter-series" class="mc-filter-select">
          <option value="all">All Series</option>
          ${Object.entries(SERIES_OPTIONS).map(([k, v]) => `<option value="${k}" ${state.filters.series === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>` : ''}
        ${state.activeTagFilter ? `<span class="mc-active-tag-badge">#${esc(state.activeTagFilter)} <button id="mc-clear-tag" class="mc-clear-tag-btn">&times;</button></span>` : ''}
      </div>
      <div class="mc-toolbar-right">
        <button id="mc-sort-toggle" class="mc-sort-btn" title="Toggle sorting order">
          ${state.sortDir === 'desc' ? '⬇ Most Ready' : '⬆ Least Ready'}
        </button>
        <button id="mc-group-priority-toggle" class="mc-sort-btn${state.groupByPriority ? ' active' : ''}" title="Group rows by priority level">
          📌 ${state.groupByPriority ? 'Grouped' : 'Group by Priority'}
        </button>
        ${quickAsset ? `<button id="mc-quick-add-asset" class="mc-btn mc-btn-primary" data-cat="${quickAsset.cat}">${quickAsset.label}</button>` : ''}
        ${showAddRecord ? `<button id="mc-add-record" class="mc-btn mc-btn-primary" data-type="${recordType}">+ ${recordType === 'story' ? 'Story' : recordType === 'release' ? 'Release' : 'Record'}</button>` : ''}
        ${showAddStub ? `
        <div class="mc-split-btn-group" style="position:relative; display:inline-flex;">
          <button id="mc-add-stub" class="mc-btn mc-btn-primary" data-mode="cast">+ Concept</button>
          <button id="mc-add-stub-caret" class="mc-btn mc-btn-primary" style="padding:0 6px; border-left:1px solid rgba(255,255,255,0.2);" title="More Options">▼</button>
          <div id="mc-stub-dropdown" class="mc-dropdown-menu" style="display:none; position:absolute; right:0; top:100%; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-sm); box-shadow:var(--shadow-md); z-index:100; min-width:160px;">
            <button class="mc-dropdown-item" id="mc-stub-opt-cast" style="width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:var(--text-primary); cursor:pointer; font-size:0.82rem;">👥 Bulk Concept Cast</button>
            <button class="mc-dropdown-item" id="mc-stub-opt-single" style="width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:var(--text-primary); cursor:pointer; font-size:0.82rem;">👤 Single Concept Stub</button>
          </div>
        </div>` : ''}
      </div>
    </div>`;
    }

    function subTabBar() {
        const tabs = [
            { id: 'overview', label: '📊 Overview' },
            { id: 'stories', label: '📖 Stories' },
            { id: 'characters', label: '👤 Characters' },
            { id: 'scenarios', label: '🎭 Scenarios' },
            { id: 'bios', label: '📋 Bios' },
            { id: 'messages', label: '💬 Init Msgs' },
            { id: 'orgs', label: '🏢 Orgs' },
            { id: 'launchpad', label: '🚀 Launch Pad' },
            { id: 'metrics', label: '📈 Metrics' },
            { id: 'import', label: '⚙ Import' }
        ];
        return `<div class="mc-subtab-bar">
        ${tabs.map(t => `<button class="mc-subtab${state.activeSubTab === t.id ? ' active' : ''}" data-subtab="${t.id}">${t.label}</button>`).join('')}
      </div>`;
    }

    // Export to Global Window Namespace
    window.MissionControlState = {
        PIPELINE_STEPS,
        STEP_LABELS,
        SHORT_STEP_LABELS,
        UNIVERSE_COLORS,
        PRIORITY_ORDER,
        CATEGORY_LABELS,
        RELEASE_SOURCES,
        RELEASE_SOURCE_COLORS,
        SERIES_OPTIONS,
        SERIES_COLORS,
        STORY_TO_RELEASE_STEP_MAP,
        STORY_STATUS_COLORS,
        ROLE_COLORS,
        ROLE_ICONS,
        state,
        calcReadiness,
        calcReadinessForVault,
        calcReadinessForRecord,
        priorityBoost,
        sortByReadiness,
        filterComponents,
        filterTrackerRecords,
        loadAll,
        esc,
        readinessBar,
        readinessPct,
        priorityBadge,
        roleBadge,
        universeBadge,
        roleSelectBadge,
        universeSelectBadge,
        releaseSourceBadge,
        seriesBadge,
        seriesSelectBadge,
        storyStatusBadge,
        isMatchingUniverse,
        getEffectiveUniversesList,
        universeSelectOptionsHTML,
        universeFilterOptionsHTML,
        formatDate,
        getTodayDateStr,
        isReleasePublished,
        pipelineCheckboxes,
        toolbarHTML,
        subTabBar
    };
})();
