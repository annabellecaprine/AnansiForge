/**
 * Global Omni-Search (Ctrl+K) for AnansiForge
 */
(function() {
    let overlayEl, inputEl, resultsEl;
    let isOpen = false;
    let dataCache = { components: [], projects: [], tracker: [] };
    let filteredResults = [];
    let selectedIndex = -1;

    function init() {
        // Create DOM
        const overlay = document.createElement('div');
        overlay.id = 'omni-overlay';
        overlay.className = 'omni-overlay hidden';
        overlay.innerHTML = `
            <div class="omni-backdrop"></div>
            <div class="omni-panel">
                <div class="omni-input-wrap">
                    <span class="omni-search-icon">🔍</span>
                    <input type="text" id="omni-input" class="omni-input" placeholder="Search components, projects, releases…" autocomplete="off">
                    <kbd class="omni-kbd">ESC</kbd>
                </div>
                <div id="omni-results" class="omni-results"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlayEl = document.getElementById('omni-overlay');
        inputEl = document.getElementById('omni-input');
        resultsEl = document.getElementById('omni-results');

        // Event listeners
        overlayEl.querySelector('.omni-backdrop').addEventListener('click', close);
        inputEl.addEventListener('input', handleInput);
        inputEl.addEventListener('keydown', handleKeydown);

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                toggle();
            }
        });
    }

    async function loadData() {
        if (!window.ForgeDB) return;
        try {
            const [components, projects, tracker] = await Promise.all([
                window.ForgeDB.getAllComponents ? window.ForgeDB.getAllComponents() : Promise.resolve([]),
                window.ForgeDB.getAllProjects ? window.ForgeDB.getAllProjects() : Promise.resolve([]),
                window.ForgeDB.getAllTrackerRecords ? window.ForgeDB.getAllTrackerRecords() : Promise.resolve([])
            ]);
            dataCache = { components, projects, tracker };
        } catch (error) {
            console.error('OmniSearch failed to load data', error);
        }
    }

    async function open() {
        if (isOpen) return;
        isOpen = true;
        overlayEl.classList.remove('hidden');
        inputEl.value = '';
        resultsEl.innerHTML = '';
        inputEl.focus();
        await loadData();
        renderResults();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        overlayEl.classList.add('hidden');
        inputEl.value = '';
        inputEl.blur();
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    function handleInput() {
        renderResults();
    }

    function searchData(query) {
        if (!query) {
            return [];
        }
        
        query = query.toLowerCase();
        
        const matchItem = (item) => {
            const tracker = item.tracker || {};
            const searchFields = [
                item.name,
                item.lineage,
                item.universe || tracker.universe,
                tracker.role || item.role,
                item.project || tracker.project,
                ...(item.tags || [])
            ];
            
            for (const field of searchFields) {
                if (typeof field === 'string') {
                    const fieldLower = field.toLowerCase();
                    if (fieldLower === query) return { item, score: 3 };
                    if (fieldLower.startsWith(query)) return { item, score: 2 };
                    if (fieldLower.includes(query)) return { item, score: 1 };
                }
            }
            return null;
        };

        const processList = (list, typeOverride = null) => {
            const results = [];
            for (const item of list) {
                const match = matchItem(item);
                if (match) {
                    const resItem = { ...match.item };
                    if (typeOverride) resItem._uiType = typeOverride;
                    results.push({ item: resItem, score: match.score });
                }
            }
            // Sort by score descending
            results.sort((a, b) => b.score - a.score);
            return results.map(r => r.item).slice(0, 6);
        };

        const releases = [];
        const stories = [];
        const concepts = [];

        dataCache.tracker.forEach(record => {
            // Flexible matching for concept stub based on the requirements
            const typeLower = (record.assetType || '').toLowerCase();
            if (typeLower === 'release') releases.push(record);
            else if (typeLower === 'story') stories.push(record);
            else if (typeLower.includes('concept')) concepts.push(record);
        });

        return [
            { category: 'Components', icon: '🧩', items: processList(dataCache.components, 'component') },
            { category: 'Projects', icon: '🤖', items: processList(dataCache.projects, 'project') },
            { category: 'Releases', icon: '🚀', items: processList(releases, 'release') },
            { category: 'Stories', icon: '📖', items: processList(stories, 'story') },
            { category: 'Concepts', icon: '💡', items: processList(concepts, 'concept') }
        ].filter(group => group.items.length > 0);
    }

    function renderResults() {
        const query = inputEl.value.trim();
        if (!query) {
            resultsEl.innerHTML = '';
            filteredResults = [];
            selectedIndex = -1;
            return;
        }

        const groups = searchData(query);
        
        if (groups.length === 0) {
            resultsEl.innerHTML = '';
            filteredResults = [];
            selectedIndex = -1;
            return;
        }

        filteredResults = [];
        let html = '';
        
        groups.forEach(group => {
            html += `<div class="omni-category-header">${group.icon} ${group.category}</div>`;
            group.items.forEach(item => {
                const globalIndex = filteredResults.length;
                filteredResults.push(item);
                
                let metaHtml = '';
                if (item._uiType === 'component') {
                    if (item.category) metaHtml += `<span class="omni-result-meta">${item.category}</span>`;
                    if (item.universe) metaHtml += `<span class="omni-result-meta">${item.universe}</span>`;
                } else if (item._uiType === 'project') {
                    if (item.componentCount !== undefined) {
                        metaHtml += `<span class="omni-result-meta">${item.componentCount} components</span>`;
                    }
                } else if (item._uiType === 'release') {
                    if (item.universe) metaHtml += `<span class="omni-result-meta">${item.universe}</span>`;
                } else if (item._uiType === 'concept') {
                    if (item.intendedCategory) metaHtml += `<span class="omni-result-meta">${item.intendedCategory}</span>`;
                }

                html += `
                    <div class="omni-result" data-index="${globalIndex}" data-type="${item._uiType}" data-id="${item.id}">
                        <div class="omni-result-name">${item.name || 'Unnamed'}</div>
                        ${metaHtml ? `<div>${metaHtml}</div>` : ''}
                    </div>
                `;
            });
        });

        resultsEl.innerHTML = html;
        selectedIndex = -1;
        updateSelection();
        
        // Add click listeners to results
        resultsEl.querySelectorAll('.omni-result').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                if (!isNaN(idx)) {
                    executeResult(filteredResults[idx]);
                }
            });
            el.addEventListener('mouseenter', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                if (!isNaN(idx)) {
                    selectedIndex = idx;
                    updateSelection();
                }
            });
        });
    }

    function updateSelection() {
        const items = resultsEl.querySelectorAll('.omni-result');
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('omni-result--selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('omni-result--selected');
            }
        });
    }

    function handleKeydown(e) {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredResults.length > 0) {
                selectedIndex = (selectedIndex + 1) % filteredResults.length;
                updateSelection();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredResults.length > 0) {
                selectedIndex = selectedIndex - 1;
                if (selectedIndex < 0) selectedIndex = filteredResults.length - 1;
                updateSelection();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < filteredResults.length) {
                executeResult(filteredResults[selectedIndex]);
            }
        }
    }

    function executeResult(item) {
        close();
        
        if (item._uiType === 'component') {
            if (window.ForgeAppBridge && window.ForgeAppBridge.openEditor) {
                window.ForgeAppBridge.openEditor(item.id);
            }
        } else if (item._uiType === 'project') {
            if (window.ProjectAssembler && window.ProjectAssembler.open) {
                window.ProjectAssembler.open(item.id);
            }
        } else if (['release', 'story', 'concept'].includes(item._uiType)) {
            const btnMC = document.getElementById('btn-mission-control');
            if (btnMC) btnMC.click();
            // Future tabs logic based on type could go here
        }
    }

    window.OmniSearch = {
        init,
        open,
        close,
        toggle
    };

})();
