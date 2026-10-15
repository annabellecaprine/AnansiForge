/**
 * delphi_modal.js - Delphi Character Design QA Diagnostic Modal
 *
 * Implements the Delphi QA inspection modal (Pre-run, Running, Report).
 * Persists verdicts onto comp.delphi and dispatches 'delphi:verdict-saved'.
 *
 * Usage:
 *   window.DelphiModal.open(compId);
 */

(() => {
  'use strict';

  let modalEl = null;
  let activeComp = null;
  let activeReportTab = 'synthesis';
  let isRunning = false;

  function getSecondaryConfig() {
    return window.ForgeLLM && window.ForgeLLM.getSecondaryConfig ? window.ForgeLLM.getSecondaryConfig() : null;
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMarkdown(str) {
    if (!str) return '';
    // Strip any residual thinking tags so they never leak into the formatted report
    const cleanStr = str
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<thought>[\s\S]*?(?:<\/thought>|$)/gi, '')
      .trim();
    if (!cleanStr) return '';
    const lines = cleanStr.split('\n');
    const out = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Headers
      if (line.startsWith('### ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h4 class="delphi-report-h4">${formatInline(line.slice(4))}</h4>`);
        continue;
      }
      if (line.startsWith('## ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h3 class="delphi-report-h3">${formatInline(line.slice(3))}</h3>`);
        continue;
      }
      if (line.startsWith('# ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h2 class="delphi-report-h2">${formatInline(line.slice(2))}</h2>`);
        continue;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<blockquote class="delphi-report-quote">${formatInline(line.slice(2))}</blockquote>`);
        continue;
      }

      // Unordered lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        if (!inList) { out.push('<ul class="delphi-report-list">'); inList = true; }
        const itemText = line.trim().replace(/^[-*]\s+/, '');
        out.push(`<li>${formatInline(itemText)}</li>`);
        continue;
      }

      // Numbered lists (e.g. 1. )
      if (/^\s*\d+\.\s+/.test(line)) {
        if (inList) { out.push('</ul>'); inList = false; }
        const itemText = line.trim().replace(/^\d+\.\s+/, '');
        out.push(`<div class="delphi-report-num-item"><span class="delphi-report-num">${line.match(/^\s*(\d+)\./)[1]}.</span><span>${formatInline(itemText)}</span></div>`);
        continue;
      }

      if (inList) { out.push('</ul>'); inList = false; }

      // Empty line
      if (!line.trim()) {
        out.push('<div class="delphi-report-spacer"></div>');
        continue;
      }

      out.push(`<p class="delphi-report-p">${formatInline(line)}</p>`);
    }

    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  function formatInline(str) {
    let text = escapeHTML(str);
    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Code
    text = text.replace(/`([^`]+)`/g, '<code class="delphi-inline-code">$1</code>');
    return text;
  }

  function ensureModalDOM() {
    if (document.getElementById('delphi-modal-overlay')) {
      modalEl = document.getElementById('delphi-modal-overlay');
      return;
    }

    modalEl = document.createElement('div');
    modalEl.id = 'delphi-modal-overlay';
    modalEl.className = 'modal-overlay hidden';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = `
      <div class="modal delphi-modal-content" style="max-width: 800px; width: 92%; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color);">
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              🔮 Delphi — Character Design QA Gate
            </h3>
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              Audits trait dominance, internal contradictions, and cross-model agreement before stamping ⭐ Golden Template
            </span>
          </div>
          <button id="btn-close-delphi-modal" class="btn btn-ghost btn-icon" style="font-size: 1.2rem; cursor: pointer;" title="Close">&times;</button>
        </div>

        <div id="delphi-modal-body" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
          <!-- Dynamically injected state views: pre-run, running, or report -->
        </div>

        <div id="delphi-modal-footer" class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
          <!-- Dynamically injected footer actions -->
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    const closeBtn = document.getElementById('btn-close-delphi-modal');
    closeBtn.addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('hidden') && !isRunning) {
        closeModal();
      }
    });
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add('hidden');
    isRunning = false;
  }

  function renderPreRun(comp) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    const cfg = window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {};
    const secCfg = getSecondaryConfig();
    const hasKey = !!cfg.apiKey || ['lmstudio', 'kobold', 'custom', 'chutes', 'local'].includes(cfg.provider);
    const hasSecondary = !!(secCfg && secCfg.provider && secCfg.provider !== 'none');
    const existing = comp.delphi || null;

    let historyHTML = '';
    if (existing && existing.verdict) {
      const dateStr = existing.timestamp ? new Date(existing.timestamp).toLocaleString() : 'Previous run';
      const modelDetail = existing.comparedModel
        ? `${escapeHTML(existing.model || cfg.model || 'primary')} vs ${escapeHTML(existing.comparedModel)}`
        : escapeHTML(existing.model || cfg.model || 'model');
      historyHTML = `
        <div class="delphi-prerun-history">
          <div>
            <strong>Last Diagnostic:</strong>
            <span class="mc-delphi-badge mc-delphi-${existing.verdict.toLowerCase().replace(/\s+/g, '-')}">🔮 ${escapeHTML(existing.verdict)}</span>
            <span style="font-size:0.78rem; color:var(--text-muted); margin-left:6px;">(${dateStr} via ${modelDetail})</span>
          </div>
          <button id="btn-delphi-view-last" class="btn btn-secondary btn-sm">View Last Report</button>
        </div>`;
    }

    body.innerHTML = `
      <div class="delphi-meta-bar" style="display:flex; flex-wrap:wrap; gap:12px; font-size:0.8rem; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
        <span class="delphi-meta-item"><strong>Component:</strong> ${escapeHTML(comp.name)}</span>
        <span class="delphi-meta-item"><strong>Category:</strong> ${escapeHTML(comp.category)}</span>
        <span class="delphi-meta-item"><strong>Primary Model:</strong> ${escapeHTML(cfg.provider || 'gemini')} / ${escapeHTML(cfg.model || 'default')}</span>
        <span class="delphi-meta-item"><strong>Secondary Model:</strong> ${hasSecondary ? `${escapeHTML(secCfg.provider)} / ${escapeHTML(secCfg.model || 'default')}` : '<span style="color:var(--text-muted);">Disabled (Single model mode)</span>'}</span>
      </div>

      <div class="delphi-explainer-box">
        <p style="margin: 0 0 8px 0; font-size: 0.88rem; line-height: 1.5; color: var(--text-primary);">
          Delphi evaluates whether this definition is structurally coherent enough for production use.
          The LLM operates as a character design analyst (never roleplaying) to check:
        </p>
        <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;">
          <li><strong>Dominance Hierarchy:</strong> Which traits shape behavior strongest vs. which get suppressed.</li>
          <li><strong>Contradictions:</strong> Conflicting traits and which trait wording wins in ambiguity.</li>
          <li><strong>Triggers:</strong> Sycophancy traps, instruction hierarchy risks, and persona drift.</li>
          <li><strong>Cross-Model Agreement:</strong> Audits cited wording across two models to catch architecture bias.</li>
        </ul>
      </div>

      ${!hasKey ? `
        <div class="delphi-warning-banner">
          ⚠️ <strong>API key is missing for ${escapeHTML(cfg.provider || 'configured provider')}.</strong>
          Configure your LLM settings before running Delphi.
          <button id="btn-delphi-open-settings" class="btn btn-secondary btn-sm" style="margin-left: 10px;">Open API Settings</button>
        </div>` : ''}

      ${historyHTML}
    `;

    footer.innerHTML = `
      <button id="btn-delphi-close" class="btn btn-ghost">Close</button>
      ${hasSecondary ? `
        <button id="btn-delphi-run-compare" class="btn btn-secondary" style="border-color: rgba(168,85,247,0.4); color: #d8b4fe;" ${!hasKey ? 'disabled' : ''}>
          ⇄ Run Cross-Model Comparison
        </button>` : ''}
      <button id="btn-delphi-run" class="btn btn-primary" ${!hasKey ? 'disabled' : ''}>
        ▶ Run Diagnostic
      </button>
    `;

    document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-run')?.addEventListener('click', () => runDiagnostic(comp.id));
    document.getElementById('btn-delphi-run-compare')?.addEventListener('click', () => runComparison(comp.id));
    document.getElementById('btn-delphi-view-last')?.addEventListener('click', () => {
      activeReportTab = existing && existing.secondaryReport ? 'synthesis' : 'primary';
      renderReport(comp.delphi, comp);
    });
    document.getElementById('btn-delphi-open-settings')?.addEventListener('click', () => {
      closeModal();
      document.getElementById('btn-api-config')?.click();
    });
  }

  function renderRunning(comp, mode = 'primary') {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    const isCompare = mode === 'cross-model';
    const cfg = window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {};
    const secCfg = getSecondaryConfig();

    body.innerHTML = `
      <div style="text-align: center; padding: 48px 20px;">
        <div class="delphi-spinner"></div>
        <h4 style="margin: 16px 0 6px 0; color: var(--text-primary); font-size: 1.05rem;">
          ${isCompare ? 'Consulting both oracles…' : 'Consulting the oracle…'}
        </h4>
        <p style="margin: 0 auto; color: var(--text-muted); font-size: 0.85rem; max-width: 540px; line-height: 1.5;">
          ${isCompare
            ? `Auditing <em>"${escapeHTML(comp.name)}"</em> across <strong>${escapeHTML(cfg.model || 'Primary')}</strong> and <strong>${escapeHTML(secCfg?.model || 'Secondary')}</strong> to synthesize behavioral interpretations and detect disputed wording.`
            : `Auditing <em>"${escapeHTML(comp.name)}"</em> for trait dominance, contradictions, and behavioral triggers via <strong>${escapeHTML(cfg.model || 'model')}</strong>.`}
        </p>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" disabled>Running…</button>
    `;
  }

  function renderReport(delphiData, comp, unreadableNotice = false) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    const secCfg = getSecondaryConfig();
    const hasSecondary = !!(secCfg && secCfg.provider && secCfg.provider !== 'none');
    const hasComparison = !!(delphiData.secondaryReport || delphiData.comparisonReport);

    if (hasComparison && !['synthesis', 'primary', 'secondary'].includes(activeReportTab)) {
      activeReportTab = 'synthesis';
    } else if (!hasComparison) {
      activeReportTab = 'primary';
    }

    const verdict = delphiData.verdict || 'UNREADABLE';
    const dims = delphiData.dimensions || null;
    const notes = delphiData.notes || {};

    let bannerCls = 'delphi-banner-ready';
    let bannerIcon = '✅';
    let bannerTitle = 'READY — Stamping ⭐ Golden Template Suggested';
    let flagCount = 0;

    if (dims) {
      if (dims.coherence === 'flag' || dims.coherence === 'fail') flagCount++;
      if (dims.dominance === 'flag' || dims.dominance === 'fail') flagCount++;
      if (dims.triggers === 'flag' || dims.triggers === 'fail') flagCount++;
      if (dims.crossModel === 'flag') flagCount++;
    }

    if (verdict === 'FAIL') {
      bannerCls = 'delphi-banner-fail';
      bannerIcon = '🛑';
      bannerTitle = `FAIL — Critical design defect identified (${flagCount} flag${flagCount === 1 ? '' : 's'})`;
    } else if (verdict === 'NEEDS WORK') {
      bannerCls = 'delphi-banner-warn';
      bannerIcon = '⚠️';
      bannerTitle = `NEEDS WORK — Behavioral pulls or ambiguities detected (${flagCount} flag${flagCount === 1 ? '' : 's'})`;
    } else if (verdict === 'READY') {
      bannerCls = 'delphi-banner-ready';
      bannerIcon = '🔮';
      bannerTitle = 'READY — Coherent and structurally sound for production';
    }

    // 2x2 Dimension Cards HTML
    let dimsHTML = '';
    if (dims) {
      const dimPill = (name, val, note) => {
        const v = String(val || 'unrun').toLowerCase();
        let cls = 'delphi-dim-unrun';
        let icon = '—';
        let label = 'UNRUN';
        if (v === 'pass') { cls = 'delphi-dim-pass'; icon = '✓'; label = 'PASS'; }
        if (v === 'flag') { cls = 'delphi-dim-flag'; icon = '⚑'; label = 'FLAG'; }
        if (v === 'fail') { cls = 'delphi-dim-fail'; icon = '✕'; label = 'FAIL'; }

        return `
          <div class="delphi-dim-card ${cls}">
            <div class="delphi-dim-header">
              <span class="delphi-dim-title">${name}</span>
              <span class="delphi-dim-badge">${icon} ${label}</span>
            </div>
            <div class="delphi-dim-note">${escapeHTML(note || '')}</div>
          </div>
        `;
      };

      const crossModelVal = dims.crossModel || 'unrun';
      let crossModelNote = notes.crossModel || '';
      if (!crossModelNote) {
        if (crossModelVal === 'pass') {
          crossModelNote = delphiData.comparedModel
            ? `Compatible interpretations between ${delphiData.model} and ${delphiData.comparedModel}`
            : 'Compatible interpretations across models';
        } else if (crossModelVal === 'flag') {
          crossModelNote = 'Material interpretation difference detected';
        } else {
          crossModelNote = hasSecondary
            ? 'Secondary model configured — click "Compare" to audit'
            : 'Configure secondary model in API Settings to enable';
        }
      }

      dimsHTML = `
        <div class="delphi-dim-grid">
          ${dimPill('1. Trait Coherence', dims.coherence, notes.coherence)}
          ${dimPill('2. Dominance Hierarchy', dims.dominance, notes.dominance)}
          ${dimPill('3. Behavioral Triggers', dims.triggers, notes.triggers)}
          ${dimPill('4. Cross-Model Agreement', crossModelVal, crossModelNote)}
        </div>
      `;
    }

    // Sub-Tabs for Cross-Model Reports
    let tabsHTML = '';
    if (hasComparison) {
      tabsHTML = `
        <div class="delphi-report-tabs">
          <button class="delphi-report-tab ${activeReportTab === 'synthesis' ? 'active' : ''}" data-tab="synthesis">
            🔮 Cross-Model Synthesis
          </button>
          <button class="delphi-report-tab ${activeReportTab === 'primary' ? 'active' : ''}" data-tab="primary">
            Primary: ${escapeHTML(delphiData.model || 'Model 1')}
          </button>
          <button class="delphi-report-tab ${activeReportTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
            Secondary: ${escapeHTML(delphiData.comparedModel || 'Model 2')}
          </button>
        </div>
      `;
    }

    // Report content according to active tab
    let reportBodyHTML = '';
    if (activeReportTab === 'synthesis' && hasComparison) {
      let disputedHTML = '';
      const compData = delphiData.comparisonData || {};
      const disputed = Array.isArray(compData.disputedWording) ? compData.disputedWording : [];
      if (disputed.length > 0 || (dims && dims.crossModel === 'flag')) {
        disputedHTML = `
          <div class="delphi-disputed-box">
            <div class="delphi-disputed-title">⚠️ Cross-Model Disputed Wording & Behavioral Consequences</div>
            ${disputed.length > 0 ? disputed.map(dw => {
              const quote = typeof dw === 'string' ? dw : (dw.wording || JSON.stringify(dw));
              const cons = typeof dw === 'object' && dw.consequence ? dw.consequence : (compData.consequence || null);
              return `
                <div class="delphi-disputed-item">
                  <div class="delphi-disputed-wording">"${escapeHTML(quote)}"</div>
                  ${cons ? `<div class="delphi-disputed-consequence"><strong>Likely Behavioral Consequence:</strong> ${escapeHTML(cons)}</div>` : ''}
                </div>
              `;
            }).join('') : `
              <div class="delphi-disputed-consequence">
                ${compData.consequence ? `<strong>Consequence:</strong> ${escapeHTML(compData.consequence)}` : 'Models arrived at materially divergent interpretations of the prompt definition.'}
              </div>
            `}
          </div>
        `;
      }
      reportBodyHTML = disputedHTML + formatMarkdown(delphiData.comparisonReport || delphiData.report || '');
    } else if (activeReportTab === 'secondary' && hasComparison) {
      let secMeta = '';
      if (delphiData.secondaryDimensions) {
        const s = delphiData.secondaryDimensions;
        secMeta = `
          <div style="margin-bottom: 12px; font-size: 0.78rem; color: var(--text-secondary); background: rgba(255,255,255,0.03); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <strong>${escapeHTML(delphiData.comparedModel || 'Secondary Model')} Dimensions:</strong>
            Coherence: <code class="delphi-inline-code">${escapeHTML(s.coherence || '—')}</code> ·
            Dominance: <code class="delphi-inline-code">${escapeHTML(s.dominance || '—')}</code> ·
            Triggers: <code class="delphi-inline-code">${escapeHTML(s.triggers || '—')}</code>
          </div>
        `;
      }
      reportBodyHTML = secMeta + formatMarkdown(delphiData.secondaryReport || 'No secondary report recorded.');
    } else {
      reportBodyHTML = formatMarkdown(delphiData.report || '');
    }

    const testSubtitle = delphiData.comparedModel
      ? `${escapeHTML(delphiData.model || 'primary')} vs ${escapeHTML(delphiData.comparedModel)} · Tested ${delphiData.timestamp ? new Date(delphiData.timestamp).toLocaleTimeString() : 'just now'}`
      : `Model: ${escapeHTML(delphiData.model || 'model')} · Tested ${delphiData.timestamp ? new Date(delphiData.timestamp).toLocaleTimeString() : 'just now'}`;

    const recoveryBadge = delphiData.repaired
      ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(168,85,247,0.25); color:#d8b4fe;">⚡ Auto-Repaired Format</span>`
      : (delphiData.recoveredFromPartialJson
        ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(245,158,11,0.25); color:#fbbf24;">⚡ Recovered from Partial JSON</span>`
        : (delphiData.inferredFromText
          ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(59,130,246,0.25); color:#93c5fd;">🔍 Extracted from Markdown</span>`
          : (delphiData.manual ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(34,197,94,0.25); color:#86efac;">✍️ Author Verified</span>` : '')));

    let thinkingHTML = '';
    let thinkingContent = delphiData.thinking || '';
    if (!thinkingContent && delphiData.report && (/<think>/i.test(delphiData.report) || /<thought>/i.test(delphiData.report))) {
      delphiData.report.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_, p1) => {
        if (p1 && p1.trim()) thinkingContent = (thinkingContent ? thinkingContent + '\n\n' : '') + p1.trim();
        return '';
      });
      delphiData.report.replace(/<thought>([\s\S]*?)(?:<\/thought>|$)/gi, (_, p1) => {
        if (p1 && p1.trim()) thinkingContent = (thinkingContent ? thinkingContent + '\n\n' : '') + p1.trim();
        return '';
      });
    }

    if (thinkingContent) {
      thinkingHTML = `
        <details class="delphi-thinking-details" style="margin-top: 16px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.78rem;">
          <summary style="padding: 8px 12px; cursor: pointer; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>💭</span> Model Reasoning &amp; Thinking Process
          </summary>
          <div style="padding: 10px 14px; border-top: 1px solid var(--border-color); max-height: 240px; overflow-y: auto; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap; font-family: var(--font-mono); font-size: 0.75rem;">
            ${escapeHTML(thinkingContent)}
          </div>
        </details>
      `;
    }

    body.innerHTML = `
      ${unreadableNotice ? `
        <div class="delphi-warning-banner" style="margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              ⚠️ <strong>Verdict unreadable:</strong> The LLM output omitted a standard JSON verdict block. Showing raw diagnostic text below.
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-delphi-autorepair" class="btn btn-secondary btn-sm" style="border-color: rgba(168,85,247,0.5); color: #d8b4fe;">
                🔧 Auto-Repair Verdict
              </button>
              <button id="btn-delphi-manual-toggle" class="btn btn-secondary btn-sm">
                ✏️ Set Manually
              </button>
            </div>
          </div>
          <div id="delphi-manual-panel" style="display: none; padding-top: 10px; border-top: 1px dashed rgba(245,158,11,0.3);">
            <div style="font-size: 0.8rem; margin-bottom: 8px; color: var(--text-secondary);">
              Based on the diagnostic findings in the report below, set the dimension ratings:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; font-size: 0.82rem;">
              <div>
                <label style="display:block; margin-bottom:3px; font-weight:600; color:var(--text-primary);">1. Coherence:</label>
                <select id="delphi-manual-coherence" class="form-control" style="padding: 3px 8px; font-size: 0.82rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                  <option value="pass">PASS</option>
                  <option value="flag">FLAG</option>
                  <option value="fail">FAIL</option>
                </select>
              </div>
              <div>
                <label style="display:block; margin-bottom:3px; font-weight:600; color:var(--text-primary);">2. Dominance:</label>
                <select id="delphi-manual-dominance" class="form-control" style="padding: 3px 8px; font-size: 0.82rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                  <option value="pass">PASS</option>
                  <option value="flag">FLAG</option>
                  <option value="fail">FAIL</option>
                </select>
              </div>
              <div>
                <label style="display:block; margin-bottom:3px; font-weight:600; color:var(--text-primary);">3. Triggers:</label>
                <select id="delphi-manual-triggers" class="form-control" style="padding: 3px 8px; font-size: 0.82rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
                  <option value="pass">PASS</option>
                  <option value="flag">FLAG</option>
                  <option value="fail">FAIL</option>
                </select>
              </div>
            </div>
            <button id="btn-delphi-save-manual" class="btn btn-primary btn-sm">Save Dimensions & Stamp Verdict</button>
          </div>
        </div>` : `
        <div class="delphi-verdict-banner ${bannerCls}">
          <div class="delphi-verdict-banner-header">
            <span style="font-size: 1.2rem;">${bannerIcon}</span>
            <strong>${escapeHTML(bannerTitle)}</strong>
            ${recoveryBadge}
          </div>
          <div style="font-size: 0.78rem; opacity: 0.85; margin-top: 4px;">
            ${testSubtitle}
          </div>
        </div>`}

      ${dimsHTML}
      ${tabsHTML}

      <div class="delphi-report-content">
        ${reportBodyHTML}
        ${thinkingHTML}
      </div>
    `;

    footer.innerHTML = `
      <button id="btn-delphi-copy" class="btn btn-secondary">📋 Copy Report</button>
      <button id="btn-delphi-rerun" class="btn btn-secondary">🔁 Re-run Primary</button>
      ${hasSecondary ? `
        <button id="btn-delphi-compare" class="btn btn-secondary" style="border-color: rgba(168,85,247,0.4); color: #d8b4fe;">
          ⇄ ${hasComparison ? 'Re-run Comparison' : `Compare with ${escapeHTML(secCfg.model || 'Second Model')}`}
        </button>` : ''}
      <button id="btn-delphi-close" class="btn btn-primary">Close</button>
    `;

    // Event listeners
    body.querySelectorAll('.delphi-report-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        if (tab) {
          activeReportTab = tab;
          renderReport(delphiData, comp, false);
        }
      });
    });

    document.getElementById('btn-delphi-autorepair')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const origText = btn.textContent;
      btn.textContent = 'Repairing…';
      btn.disabled = true;
      try {
        const repaired = await window.Delphi.repairComponentVerdict(comp.id, delphiData.report);
        renderReport(repaired, comp, false);
        if (typeof showToast === 'function') showToast('Verdict format repaired successfully!', 'success');
      } catch (err) {
        alert('Auto-repair could not extract structured dimensions: ' + err.message);
        btn.textContent = origText;
        btn.disabled = false;
      }
    });

    document.getElementById('btn-delphi-manual-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('delphi-manual-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });

    document.getElementById('btn-delphi-save-manual')?.addEventListener('click', async () => {
      const c = document.getElementById('delphi-manual-coherence')?.value || 'pass';
      const d = document.getElementById('delphi-manual-dominance')?.value || 'pass';
      const t = document.getElementById('delphi-manual-triggers')?.value || 'pass';

      const manualDelphi = await window.Delphi.setManualVerdict(comp.id, {
        coherence: c,
        dominance: d,
        triggers: t
      });
      renderReport(manualDelphi, comp, false);
      if (typeof showToast === 'function') showToast('Verdict saved manually.', 'success');
    });

    document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-rerun')?.addEventListener('click', () => runDiagnostic(comp.id));
    document.getElementById('btn-delphi-compare')?.addEventListener('click', () => runComparison(comp.id));
    document.getElementById('btn-delphi-copy')?.addEventListener('click', async (e) => {
      try {
        let textToCopy = '';
        if (activeReportTab === 'synthesis' && delphiData.comparisonReport) {
          textToCopy = `Delphi Cross-Model Comparison: ${comp.name}\nVerdict: ${verdict}\nDate: ${delphiData.timestamp || new Date().toISOString()}\nPrimary: ${delphiData.model} · Secondary: ${delphiData.comparedModel}\n\n${delphiData.comparisonReport}`;
        } else if (activeReportTab === 'secondary' && delphiData.secondaryReport) {
          textToCopy = `Delphi Secondary Diagnostic (${delphiData.comparedModel}): ${comp.name}\nDate: ${delphiData.timestamp || new Date().toISOString()}\n\n${delphiData.secondaryReport}`;
        } else {
          textToCopy = `Delphi Diagnostic Report: ${comp.name}\nVerdict: ${verdict}\nDate: ${delphiData.timestamp || new Date().toISOString()}\n\n${delphiData.report || ''}`;
        }
        await navigator.clipboard.writeText(textToCopy);
        const btn = e.currentTarget;
        const original = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      } catch (err) {
        console.error('Failed to copy report:', err);
      }
    });
  }

  async function runDiagnostic(compId) {
    if (isRunning) return;
    isRunning = true;

    try {
      const comp = await window.ForgeDB.getComponent(compId);
      if (!comp) throw new Error('Component not found in database.');
      activeComp = comp;

      renderRunning(comp, 'primary');

      const result = await window.Delphi.diagnoseComponent(compId);

      if (!result.dimensions) {
        // Unparseable JSON block — show raw text, do NOT update stored verdict
        renderReport({ report: result.report, verdict: null }, comp, true);
        isRunning = false;
        return;
      }

      // Valid run — persist into component record
      const prevDelphi = comp.delphi || {};
      const history = Array.isArray(prevDelphi.history) ? [...prevDelphi.history] : [];
      if (prevDelphi.verdict) {
        history.unshift({
          verdict: prevDelphi.verdict,
          timestamp: prevDelphi.timestamp || new Date().toISOString(),
          model: prevDelphi.model || result.model
        });
      }
      if (history.length > 10) history.length = 10;

      const delphiRecord = {
        verdict: result.verdict,
        dimensions: result.dimensions,
        notes: result.notes,
        model: result.model,
        provider: result.provider,
        timestamp: new Date().toISOString(),
        report: result.report,
        thinking: result.thinking || null,
        repaired: result.repaired,
        recoveredFromPartialJson: result.recoveredFromPartialJson,
        history
      };

      comp.delphi = delphiRecord;
      await window.ForgeDB.saveComponent(comp);

      // Notify Mission Control & other listeners
      window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
        detail: { id: comp.id, verdict: result.verdict }
      }));

      activeReportTab = 'primary';
      renderReport(delphiRecord, comp, false);
    } catch (err) {
      console.error('[DelphiModal] Diagnostic failed:', err);
      const body = document.getElementById('delphi-modal-body');
      const footer = document.getElementById('delphi-modal-footer');
      if (body) {
        body.innerHTML = `
          <div class="delphi-warning-banner">
            🛑 <strong>Diagnostic Failed:</strong> ${escapeHTML(err.message || 'An unexpected error occurred.')}
          </div>
        `;
      }
      if (footer) {
        footer.innerHTML = `
          <button id="btn-delphi-close" class="btn btn-secondary">Close</button>
          <button id="btn-delphi-retry" class="btn btn-primary">Try Again</button>
        `;
        document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
        document.getElementById('btn-delphi-retry')?.addEventListener('click', () => runDiagnostic(compId));
      }
    } finally {
      isRunning = false;
    }
  }

  async function runComparison(compId) {
    if (isRunning) return;
    isRunning = true;

    try {
      const comp = await window.ForgeDB.getComponent(compId);
      if (!comp) throw new Error('Component not found in database.');
      activeComp = comp;

      renderRunning(comp, 'cross-model');

      const result = await window.Delphi.runCrossModelComparison(compId);

      activeReportTab = 'synthesis';
      renderReport(result, comp, false);
    } catch (err) {
      console.error('[DelphiModal] Cross-model comparison failed:', err);
      const body = document.getElementById('delphi-modal-body');
      const footer = document.getElementById('delphi-modal-footer');
      if (body) {
        body.innerHTML = `
          <div class="delphi-warning-banner">
            🛑 <strong>Cross-Model Audit Failed:</strong> ${escapeHTML(err.message || 'An unexpected error occurred.')}
          </div>
        `;
      }
      if (footer) {
        footer.innerHTML = `
          <button id="btn-delphi-close" class="btn btn-secondary">Close</button>
          <button id="btn-delphi-retry-comp" class="btn btn-primary">Try Again</button>
        `;
        document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
        document.getElementById('btn-delphi-retry-comp')?.addEventListener('click', () => runComparison(compId));
      }
    } finally {
      isRunning = false;
    }
  }

  async function open(compId) {
    if (!compId) return;
    ensureModalDOM();

    try {
      const comp = await window.ForgeDB.getComponent(compId);
      if (!comp) {
        if (typeof showToast === 'function') showToast('Component not found', 'error');
        return;
      }
      activeComp = comp;
      modalEl.classList.remove('hidden');

      // If already has a valid verdict and report, jump to the report state directly;
      // otherwise, show pre-run state.
      if (comp.delphi && comp.delphi.verdict && comp.delphi.report) {
        activeReportTab = comp.delphi.secondaryReport || comp.delphi.comparisonReport ? 'synthesis' : 'primary';
        renderReport(comp.delphi, comp, false);
      } else {
        renderPreRun(comp);
      }
    } catch (err) {
      console.error('[DelphiModal] Failed to open component:', err);
    }
  }

  window.DelphiModal = {
    open,
    runDiagnostic,
    runComparison
  };
})();
