/**
 * js/mission_control/tabs/mc_universes_tab.js
 * Anansi Forge Mission Control - Universes Tab Component
 */

(() => {
    const getS = () => window.MissionControlState;

    function renderUniversesTab() {
        const S = getS();
        if (!S) return '';

        const esc = S.esc;
        const universes = S.getEffectiveUniversesList();
        const activeSearch = (S.state.filters.search || '').toLowerCase();

        let filtered = universes;
        if (activeSearch) {
            filtered = universes.filter(u =>
                (u.name || '').toLowerCase().includes(activeSearch) ||
                (u.genre || '').toLowerCase().includes(activeSearch) ||
                (u.content || '').toLowerCase().includes(activeSearch)
            );
        }

        const cardsHTML = filtered.map(u => {
            const color = u.color || S.UNIVERSE_COLORS[u.name] || '#6b7280';
            const content = u.content || '';

            // Parse structured sections if formatted with ##
            const settingMatch = content.match(/## Setting\s*\n([\s\S]*?)(?=\n## |$)/i);
            const cultureMatch = content.match(/## Culture\s*\n([\s\S]*?)(?=\n## |$)/i);
            const techMatch = content.match(/## Technology\s*\n([\s\S]*?)(?=\n## |$)/i);
            const toneMatch = content.match(/## Tone\s*\n([\s\S]*?)(?=\n## |$)/i);
            const otherMatch = content.match(/## Other Rules\s*\n([\s\S]*?)(?=\n## |$)/i);

            const setting = settingMatch ? settingMatch[1].trim() : '';
            const culture = cultureMatch ? cultureMatch[1].trim() : '';
            const tech = techMatch ? techMatch[1].trim() : '';
            const tone = toneMatch ? toneMatch[1].trim() : '';
            const other = otherMatch ? otherMatch[1].trim() : '';

            const isStructured = setting || culture || tech || tone || other;

            return `
        <div class="mc-card mc-universe-card" style="border-left: 4px solid ${color};">
          <div class="mc-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="mc-badge" style="background:${color}22; color:${color}; border:1px solid ${color}44; font-size:0.85rem; padding:4px 10px; font-weight:700;">
                🌐 ${esc(u.name)}
              </span>
              <span class="mc-badge" style="background:var(--bg-tertiary); color:var(--text-muted); font-size:0.75rem;">
                ${esc(u.genre || 'General')}
              </span>
            </div>
            <button class="mc-btn mc-btn-secondary mc-btn-sm btn-edit-universe" data-name="${esc(u.name)}">
              ✏️ Edit Rules
            </button>
          </div>

          <div class="mc-universe-content-preview" style="font-size:0.82rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:8px;">
            ${isStructured ? `
              ${setting ? `<div><strong style="color:var(--text-primary);">Setting:</strong> ${esc(setting.slice(0, 150))}${setting.length > 150 ? '…' : ''}</div>` : ''}
              ${culture ? `<div><strong style="color:var(--text-primary);">Culture:</strong> ${esc(culture.slice(0, 150))}${culture.length > 150 ? '…' : ''}</div>` : ''}
              ${tech ? `<div><strong style="color:var(--text-primary);">Technology:</strong> ${esc(tech.slice(0, 150))}${tech.length > 150 ? '…' : ''}</div>` : ''}
              ${tone ? `<div><strong style="color:var(--text-primary);">Tone:</strong> ${esc(tone.slice(0, 150))}${tone.length > 150 ? '…' : ''}</div>` : ''}
              ${other ? `<div><strong style="color:var(--text-primary);">Other Rules:</strong> ${esc(other.slice(0, 150))}${other.length > 150 ? '…' : ''}</div>` : ''}
            ` : `
              <div style="font-style:${content ? 'normal' : 'italic'}; color:${content ? 'var(--text-secondary)' : 'var(--text-muted)'};">
                ${content ? esc(content.slice(0, 300)) + (content.length > 300 ? '…' : '') : 'No rules defined yet. Click "Edit Rules" to populate world-building rules.'}
              </div>
            `}
          </div>
        </div>
      `;
        }).join('');

        return `
      <div class="mc-toolbar">
        <div class="mc-toolbar-left">
          <input type="search" id="mc-search" class="mc-search" placeholder="Search universes..." value="${esc(S.state.filters.search)}">
        </div>
        <div class="mc-toolbar-right">
          <button id="btn-mc-manage-universes" class="mc-btn mc-btn-primary">
            🌐 Manage Universes Modal
          </button>
        </div>
      </div>

      <div class="mc-universes-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:16px; margin-top:16px;">
        ${cardsHTML || `<div class="mc-empty-state" style="grid-column: 1 / -1;">No universes match your search.</div>`}
      </div>
    `;
    }

    window.MissionControlTabs = window.MissionControlTabs || {};
    window.MissionControlTabs.renderUniversesTab = renderUniversesTab;
})();
