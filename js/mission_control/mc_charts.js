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

    // Compute waypoint indices: always first + last + up to 3 evenly spaced between
    const totalPts = points.length;
    const waypointSet = new Set([0, totalPts - 1]);
    if (totalPts > 2) {
      const innerCount = Math.min(3, totalPts - 2);
      for (let w = 1; w <= innerCount; w++) {
        waypointSet.add(Math.round(w * (totalPts - 1) / (innerCount + 1)));
      }
    }
    const waypointIndices = Array.from(waypointSet).sort((a, b) => a - b);

    // Extra bottom padding for 45° rotated waypoint labels
    const labelZone = 36;

    return `
      <svg viewBox="0 0 ${width} ${totalHeight + labelZone}" class="mc-svg-chart" style="width:100%; height:auto; overflow:visible;">
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.12)" />

        <path d="${areaD}" fill="${color}" fill-opacity="0.12" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        ${markersSvg}

        ${points.map((p, i) => `
          <g class="mc-chart-point-group">
            <circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" stroke="var(--bg-secondary)" stroke-width="2" />
            <title>${esc(p.label)}: ${p.value.toLocaleString()}</title>
            <text x="${p.x}" y="${p.y - 8}" fill="var(--text-secondary)" font-size="10" font-weight="600" text-anchor="middle">${p.value.toLocaleString()}</text>
          </g>
        `).join('')}

        ${waypointIndices.map(i => {
      const p = points[i];
      const tickY = height - padding;
      return `<g>
              <line x1="${p.x}" y1="${tickY}" x2="${p.x}" y2="${tickY + 5}" stroke="rgba(148,163,184,0.4)" stroke-width="1.5"/>
              <text
                x="${p.x}" y="${tickY + 8}"
                fill="var(--text-muted)"
                font-size="9"
                font-weight="500"
                text-anchor="start"
                transform="rotate(-45 ${p.x} ${tickY + 8})"
              >${esc(p.label)}</text>
            </g>`;
    }).join('')}
      </svg>
    `;
  }

  function showChartLightbox(svgHtml, title) {
    let overlay = document.getElementById('mc-chart-lightbox');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mc-chart-lightbox';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:10000',
        'background:rgba(7,8,20,0.88)', 'backdrop-filter:blur(8px)',
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        'padding:32px 24px', 'box-sizing:border-box', 'cursor:zoom-out',
        'animation:mc-lb-in 0.15s ease'
      ].join(';');
      overlay.innerHTML = `
                <style>
                  @keyframes mc-lb-in { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
                  #mc-chart-lightbox .mc-lb-inner { background:var(--bg-secondary,#131e35); border:1px solid var(--border-color,rgba(255,255,255,0.08)); border-radius:16px; padding:28px 32px; box-shadow:0 32px 80px rgba(0,0,0,0.7); max-width:92vw; width:900px; box-sizing:border-box; cursor:default; }
                  #mc-chart-lightbox .mc-lb-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
                  #mc-chart-lightbox .mc-lb-title { font-size:1.1rem; font-weight:700; color:var(--text-primary,#e2e8f0); }
                  #mc-chart-lightbox .mc-lb-close { background:none; border:1px solid var(--border-color,rgba(255,255,255,0.12)); color:var(--text-secondary,#94a3b8); cursor:pointer; border-radius:8px; padding:4px 10px; font-size:1.1rem; line-height:1; transition:background 0.15s; }
                  #mc-chart-lightbox .mc-lb-close:hover { background:rgba(255,255,255,0.08); }
                  #mc-chart-lightbox svg.mc-svg-chart { width:100% !important; height:auto !important; }
                </style>
                <div class="mc-lb-inner" id="mc-lb-inner">
                    <div class="mc-lb-header">
                        <span class="mc-lb-title" id="mc-lb-title"></span>
                        <button class="mc-lb-close" id="mc-lb-close" title="Close (Esc)">✕</button>
                    </div>
                    <div id="mc-lb-body"></div>
                </div>`;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeLightbox();
      });
      document.getElementById('mc-lb-close').addEventListener('click', closeLightbox);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('mc-lb-hidden')) closeLightbox();
      });
    }

    document.getElementById('mc-lb-title').textContent = title || '';
    document.getElementById('mc-lb-body').innerHTML = svgHtml;
    overlay.classList.remove('mc-lb-hidden');
    overlay.style.display = 'flex';
  }

  function closeLightbox() {
    const lb = document.getElementById('mc-chart-lightbox');
    if (lb) lb.style.display = 'none';
  }

  function wrapChartClickable(svgHtml, title) {
    const safeTitle = (title || '').replace(/'/g, '&#39;');
    return `<div class="mc-chart-clickable" title="Click to enlarge" style="position:relative; cursor:zoom-in;" onclick="window.MissionControlCharts.showLightbox(this);" data-chart-title="${safeTitle}">
            ${svgHtml}
            <span style="position:absolute; bottom:10px; right:10px; font-size:0.72rem; color:var(--text-muted); background:rgba(0,0,0,0.45); border-radius:6px; padding:2px 7px; pointer-events:none; letter-spacing:0.02em;">🔍 click to enlarge</span>
        </div>`;
  }

  function showLightboxFromEl(el) {
    const title = el.dataset.chartTitle || '';
    const svgEl = el.querySelector('svg');
    if (svgEl) showChartLightbox(svgEl.outerHTML, title);
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
    renderHorizontalBarChart,
    wrapChart: wrapChartClickable,
    showLightbox: showLightboxFromEl
  };
})();
