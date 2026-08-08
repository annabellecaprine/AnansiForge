/**
 * js/mission_control/mc_charts.js
 * Anansi Forge Mission Control - Visual Performance & Analytics SVG Charts
 */

(() => {
    const esc = (str) => window.MissionControlState?.esc ? window.MissionControlState.esc(str) : String(str || '');

    function renderSVGLineChart(dataPoints, width = 500, height = 180, color = '#6366f1', events = []) {
        if (!dataPoints || dataPoints.length === 0) {
            return '<p class="mc-empty-state" style="padding:20px;">No historical snapshot data points available yet.</p>';
        }

        const hasEvents = events && events.length > 0;
        const markerZone = hasEvents ? 32 : 0;
        const totalHeight = height + markerZone;

        const padding = 30;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;

        const values = dataPoints.map(p => p.value);
        const minRaw = Math.min(...values);
        const maxRaw = Math.max(...values);
        const range = maxRaw - minRaw;

        let minVal = 0;
        if (minRaw > 100 && (range / Math.max(maxRaw, 1)) < 0.35) {
            const padVal = Math.max(range * 0.4, minRaw * 0.02);
            minVal = Math.max(0, Math.floor(minRaw - padVal));
        }
        const maxVal = Math.max(maxRaw, minVal + 10);

        const points = dataPoints.map((p, i) => {
            const x = padding + (dataPoints.length > 1 ? (i / (dataPoints.length - 1)) * chartW : chartW / 2);
            const y = height - padding - ((p.value - minVal) / Math.max(maxVal - minVal, 1)) * chartH;
            return { x, y, label: p.label, value: p.value, timestamp: p.timestamp };
        });

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

        let markersSvg = '';
        if (hasEvents) {
            const pointTimes = dataPoints.map(p => {
                if (!p.timestamp) return null;
                const d = new Date(p.timestamp);
                return isNaN(d.getTime()) ? null : d.getTime();
            }).filter(t => t !== null);

            const tMin = pointTimes.length > 0 ? Math.min(...pointTimes) : null;
            const tMax = pointTimes.length > 0 ? Math.max(...pointTimes) : null;
            const tRange = (tMin !== null && tMax !== null) ? (tMax - tMin) : 0;

            markersSvg = events.map((ev, idx) => {
                const evTime = ev.timestamp ? new Date(ev.timestamp).getTime() : NaN;
                let x = padding + chartW / 2;

                if (!isNaN(evTime) && tMin !== null && tMax !== null && tRange > 0) {
                    let frac = (evTime - tMin) / tRange;
                    frac = Math.max(0.02, Math.min(0.98, frac));
                    x = padding + frac * chartW;
                } else if (events.length > 1) {
                    x = padding + (idx / (events.length - 1)) * chartW;
                }

                const icon = ev.icon || (ev.type === 'private_testing' ? '🧪' : ev.type === 'public_release' ? '🚀' : ev.type === 'archived' ? '📦' : '📍');
                const label = ev.label || ev.type || 'Event';

                return `
          <g class="mc-timeline-marker">
            <line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}"
              stroke="rgba(148,163,184,0.45)" stroke-width="1.5" stroke-dasharray="3,3" />
            <text x="${x}" y="${height - padding + 16}" text-anchor="middle" font-size="12" class="mc-timeline-marker-icon">
              <title>${esc(label)}${ev.timestamp ? ' (' + new Date(ev.timestamp).toLocaleDateString() + ')' : ''}</title>${icon}
            </text>
            <text x="${x}" y="${height - padding + 27}" text-anchor="middle"
              font-size="8" font-weight="600" fill="var(--text-secondary)" letter-spacing="0.2">${esc(label.length > 12 ? label.slice(0, 12) + '…' : label)}</text>
          </g>`;
            }).join('');
        }

        return `
      <svg viewBox="0 0 ${width} ${totalHeight}" class="mc-svg-chart" style="width:100%; height:auto; overflow:visible;">
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.12)" />

        <path d="${areaD}" fill="${color}" fill-opacity="0.12" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        ${markersSvg}

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

    function parseDateTime(dateStr, timeStr) {
        if (!dateStr) return null;
        let iso = dateStr;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) iso = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        if (timeStr) {
            const dt = new Date(`${iso} ${timeStr}`);
            if (!isNaN(dt.getTime())) return dt;
        }
        const dt = new Date(iso);
        return isNaN(dt.getTime()) ? null : dt;
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

    // Export to Global Window Namespace
    window.MissionControlCharts = {
        renderSVGLineChart,
        parseDateTime,
        renderHorizontalBarChart
    };
})();
