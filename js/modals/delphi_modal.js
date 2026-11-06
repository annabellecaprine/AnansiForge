/**
 * delphi_modal.js - Delphi Character Design QA Diagnostic Modal (v2)
 *
 * Implements:
 * - Phase 1: 9 Failure Mode Hypotheses, Multi-Passage Verified Evidence Linking & Source Highlighter
 * - Phase 2: Immutable Report History, Pinned Baselines, Zero-Token Visual Diff & Symmetric LLM Version Delta
 * - Phase 3: Batch Reporting Queue Runner & Batch Summary Digest Modal
 * - Phase 4: Holistic Ensemble & Project Reporting Modal with Coverage Manifest
 *
 * Usage:
 *   window.DelphiModal.open(compId);
 *   window.DelphiModal.openBatch(compIds, options);
 *   window.DelphiModal.openEnsemble(ensembleResult, rerunCallback);
 */

(() => {
  'use strict';

  let modalEl = null;
  let activeComp = null;
  let activeReportTab = 'primary'; // 'primary' | 'synthesis' | 'secondary' | 'compare'
  let viewedRunId = null;          // null = latest comp.delphi, or a runId in comp.delphi.history
  let activeFailureModeFilter = 'ALL';
  let compareRunAId = null;
  let compareRunBId = null;
  let isRunning = false;

  // Batch state
  let lastBatchDigest = null;
  let returnToBatchDigest = false;
  let batchPaused = false;
  let batchCancelled = false;
  let isBatchRunning = false;
  let bgPillEl = null;
  let latestBatchProgress = null;

  // Ensemble state
  let activeEnsembleResult = null;
  let activeEnsembleRerunFn = null;
  let activeEnsembleLensFilter = 'ALL';

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
    const cleanStr = str
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<thought>[\s\S]*?(?:<\/thought>|$)/gi, '')
      .trim();
    if (!cleanStr) return '';
    const lines = cleanStr.split('\n');
    const out = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

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

      if (line.startsWith('> ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<blockquote class="delphi-report-quote">${formatInline(line.slice(2))}</blockquote>`);
        continue;
      }

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        if (!inList) { out.push('<ul class="delphi-report-list">'); inList = true; }
        const itemText = line.trim().replace(/^[-*]\s+/, '');
        out.push(`<li>${formatInline(itemText)}</li>`);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        if (inList) { out.push('</ul>'); inList = false; }
        const itemText = line.trim().replace(/^\d+\.\s+/, '');
        out.push(`<div class="delphi-report-num-item"><span class="delphi-report-num">${line.match(/^\s*(\d+)\./)[1]}.</span><span>${formatInline(itemText)}</span></div>`);
        continue;
      }

      if (inList) { out.push('</ul>'); inList = false; }

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
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code class="delphi-inline-code">$1</code>');
    return text;
  }

  function renderFailureModeBadge(code, small = false) {
    const fmMap = window.Delphi?.FAILURE_MODES || {};
    const meta = fmMap[code] || { code, label: code, shortLabel: code, description: 'Interpretive risk hypothesis', color: '#a855f7' };
    const pad = small ? '1px 6px' : '2px 8px';
    const fs = small ? '0.68rem' : '0.72rem';
    return `<span class="delphi-fm-badge" title="${escapeHTML(meta.label + ' (Hypothesis): ' + meta.description)}" style="display:inline-flex; align-items:center; gap:4px; padding:${pad}; font-size:${fs}; font-weight:600; border-radius:999px; background:${meta.color}1f; color:${meta.color}; border:1px solid ${meta.color}55; white-space:nowrap;">⚑ ${escapeHTML(small ? meta.shortLabel : meta.label)}</span>`;
  }

  /**
   * Build annotated HTML for a source snapshot given verified quote spans.
   * Never highlights unverified quotes. Handles overlapping ranges cleanly.
   */
  function buildAnnotatedSourceHTML(contentSnapshot, verifiedRanges = []) {
    if (!contentSnapshot || typeof contentSnapshot !== 'string') return '';

    const validRanges = verifiedRanges
      .filter(r => r && r.verified && typeof r.start === 'number' && typeof r.end === 'number' && r.start >= 0 && r.end > r.start && r.end <= contentSnapshot.length)
      .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    if (validRanges.length === 0) {
      return `<pre class="delphi-source-pre">${escapeHTML(contentSnapshot)}</pre>`;
    }

    // Merge overlapping intervals while keeping metadata
    const merged = [];
    for (const r of validRanges) {
      if (merged.length === 0 || r.start >= merged[merged.length - 1].end) {
        merged.push({
          start: r.start,
          end: r.end,
          severity: r.severity || 'flag',
          findingIds: [r.findingId],
          labels: [r.label || 'Evidence']
        });
      } else {
        const prev = merged[merged.length - 1];
        prev.end = Math.max(prev.end, r.end);
        if (r.severity === 'fail') prev.severity = 'fail';
        if (r.findingId && !prev.findingIds.includes(r.findingId)) prev.findingIds.push(r.findingId);
        if (r.label && !prev.labels.includes(r.label)) prev.labels.push(r.label);
      }
    }

    let html = '';
    let cursor = 0;
    merged.forEach((seg, idx) => {
      if (seg.start > cursor) {
        html += escapeHTML(contentSnapshot.slice(cursor, seg.start));
      }
      const cls = seg.severity === 'fail' ? 'delphi-source-hl delphi-source-hl-fail' : 'delphi-source-hl delphi-source-hl-flag';
      const fIds = seg.findingIds.filter(Boolean).join(' ');
      const firstId = seg.findingIds[0] || `hl-${idx}`;
      const tooltip = seg.labels.join(' · ');
      html += `<mark id="delphi-hl-${escapeHTML(firstId)}" data-finding-ids="${escapeHTML(fIds)}" class="${cls}" title="${escapeHTML(tooltip)}">${escapeHTML(contentSnapshot.slice(seg.start, seg.end))}</mark>`;
      cursor = seg.end;
    });
    if (cursor < contentSnapshot.length) {
      html += escapeHTML(contentSnapshot.slice(cursor));
    }

    return `<pre class="delphi-source-pre">${html}</pre>`;
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
      <div class="modal delphi-modal-content" style="max-width: 920px; width: 94%; max-height: 92vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color);">
          <div>
            <h3 id="delphi-modal-title" style="margin: 0; font-size: 1.15rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              🔮 Delphi — Character Design QA Gate
            </h3>
            <span id="delphi-modal-subtitle" style="font-size: 0.78rem; color: var(--text-muted);">
              Surfaces interpretive risk hypotheses, verified evidence passages, and cross-model agreement
            </span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button id="btn-delphi-header-batch" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.76rem; border-color:rgba(168,85,247,0.45); color:#d8b4fe;" title="Open Batch Reporting & Ensemble QA Hub">
              📦 Batch &amp; Ensemble QA
            </button>
            <button id="btn-close-delphi-modal" class="btn btn-ghost btn-icon" style="font-size: 1.2rem; cursor: pointer;" title="Close">&times;</button>
          </div>
        </div>

        <div id="delphi-modal-body" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
        </div>

        <div id="delphi-modal-footer" class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    const closeBtn = document.getElementById('btn-close-delphi-modal');
    closeBtn.addEventListener('click', () => {
      if (isBatchRunning) {
        minimizeBatchToBackground();
      } else {
        closeModal();
      }
    });
    document.getElementById('btn-delphi-header-batch')?.addEventListener('click', () => {
      if (!isRunning) openBatchPicker();
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        if (isBatchRunning) minimizeBatchToBackground();
        else if (!isRunning) closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('hidden')) {
        if (isBatchRunning) minimizeBatchToBackground();
        else if (!isRunning) closeModal();
      }
    });
  }

  function ensureBgPillDOM() {
    if (document.getElementById('delphi-bg-pill')) {
      bgPillEl = document.getElementById('delphi-bg-pill');
      return;
    }
    bgPillEl = document.createElement('div');
    bgPillEl.id = 'delphi-bg-pill';
    bgPillEl.className = 'delphi-bg-pill hidden';
    document.body.appendChild(bgPillEl);
  }

  function minimizeBatchToBackground() {
    if (modalEl) modalEl.classList.add('hidden');
    ensureBgPillDOM();
    if (bgPillEl) bgPillEl.classList.remove('hidden');
    if (latestBatchProgress) renderBgPillProgress(latestBatchProgress);
    if (typeof window.showToast === 'function') {
      window.showToast('Batch Delphi is continuing in the background.', 'info');
    }
  }

  function renderBgPillProgress(prog) {
    ensureBgPillDOM();
    if (!bgPillEl) return;
    const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    bgPillEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div style="font-size:0.8rem; font-weight:700; color:#d8b4fe; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${batchPaused ? '⏸ Batch Paused' : `🔮 Auditing ${prog.completed + 1}/${prog.total}: ${escapeHTML(prog.currentName || '')}`}
        </div>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          <button type="button" id="btn-delphi-pill-pause" class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.72rem;">${batchPaused ? '▶' : '⏸'}</button>
          <button type="button" id="btn-delphi-pill-expand" class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:0.72rem;">↗ Open</button>
        </div>
      </div>
      <div style="height:5px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:#a855f7; transition:width 0.25s ease;"></div>
      </div>
      <div style="font-size:0.72rem; color:var(--text-muted); display:flex; justify-content:space-between;">
        <span>Running in background</span>
        <span>${prog.completed}/${prog.total} (${pct}%)</span>
      </div>
    `;
    document.getElementById('btn-delphi-pill-pause')?.addEventListener('click', () => {
      batchPaused = !batchPaused;
      renderBgPillProgress(prog);
    });
    document.getElementById('btn-delphi-pill-expand')?.addEventListener('click', () => {
      bgPillEl.classList.add('hidden');
      if (modalEl) modalEl.classList.remove('hidden');
    });
  }

  function renderBgPillFinished(digest) {
    ensureBgPillDOM();
    if (!bgPillEl) return;
    bgPillEl.classList.remove('hidden');
    bgPillEl.style.borderColor = 'rgba(34, 197, 94, 0.6)';
    bgPillEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div>
          <div style="font-size:0.82rem; font-weight:700; color:#4ade80;">✅ Batch Delphi Complete (${digest.completed}/${digest.total})</div>
          <div style="font-size:0.73rem; color:var(--text-secondary);">All component snapshots &amp; verdicts saved.</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" id="btn-delphi-pill-view-digest" class="btn btn-primary btn-sm" style="padding:3px 10px; font-size:0.75rem;">View Digest</button>
          <button type="button" id="btn-delphi-pill-dismiss" class="btn btn-ghost btn-sm" style="padding:2px 6px; font-size:0.85rem;">&times;</button>
        </div>
      </div>
    `;
    document.getElementById('btn-delphi-pill-view-digest')?.addEventListener('click', () => {
      bgPillEl.classList.add('hidden');
      bgPillEl.style.borderColor = 'rgba(168, 85, 247, 0.55)';
      if (modalEl) modalEl.classList.remove('hidden');
      renderBatchDigest(digest);
    });
    document.getElementById('btn-delphi-pill-dismiss')?.addEventListener('click', () => {
      bgPillEl.classList.add('hidden');
      bgPillEl.style.borderColor = 'rgba(168, 85, 247, 0.55)';
    });
  }

  function setModalHeader(titleText, subtitleText) {
    const titleEl = document.getElementById('delphi-modal-title');
    const subEl = document.getElementById('delphi-modal-subtitle');
    if (titleEl) titleEl.innerHTML = titleText;
    if (subEl) subEl.textContent = subtitleText;
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add('hidden');
    isRunning = false;
    returnToBatchDigest = false;
  }

  function getAllComponentRuns(comp) {
    if (!comp || !comp.delphi) return [];
    const norm = window.Delphi.normalizeDelphiRecord(comp.delphi, comp);
    const list = [norm, ...(norm.history || [])];
    // Deduplicate by runId
    const seen = new Set();
    return list.filter(r => {
      if (!r || !r.runId || seen.has(r.runId)) return false;
      seen.add(r.runId);
      return true;
    });
  }

  function renderPreRun(comp) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    setModalHeader(
      '🔮 Delphi — Character Design QA Gate',
      'Surfaces interpretive risk hypotheses, verified evidence passages, and cross-model agreement'
    );

    const cfg = window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {};
    const secCfg = getSecondaryConfig();
    const hasKey = !!cfg.apiKey || ['lmstudio', 'kobold', 'custom', 'chutes', 'local', 'ollama'].includes(cfg.provider);
    const hasSecondary = !!(secCfg && secCfg.provider && secCfg.provider !== 'none');
    const existing = comp.delphi ? window.Delphi.normalizeDelphiRecord(comp.delphi, comp) : null;

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
      <div class="delphi-meta-bar">
        <span class="delphi-meta-item"><strong>Component:</strong> ${escapeHTML(comp.name)}</span>
        <span class="delphi-meta-item"><strong>Category:</strong> ${escapeHTML(comp.category)}</span>
        <span class="delphi-meta-item"><strong>Primary Model:</strong> ${escapeHTML(cfg.provider || 'gemini')} / ${escapeHTML(cfg.model || 'default')}</span>
        <span class="delphi-meta-item"><strong>Secondary Model:</strong> ${hasSecondary ? `${escapeHTML(secCfg.provider)} / ${escapeHTML(secCfg.model || 'default')}` : '<span style="color:var(--text-muted);">Disabled (Single model mode)</span>'}</span>
      </div>

      <div class="delphi-explainer-box">
        <p style="margin: 0 0 8px 0; font-size: 0.88rem; line-height: 1.5; color: var(--text-primary);">
          Delphi examines this static definition for interpretive risks that warrant review or testing in <strong>AnansiWorkbench</strong>:
        </p>
        <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;">
          <li><strong>Trait Dominance Hierarchy:</strong> Ranks descriptors by signal strength (1–10) to spot potential Trait Eclipse.</li>
          <li><strong>9 Failure Mode Hypotheses:</strong> Classifies findings across Sycophancy Trap, Trait Eclipse, Unresolved Polarity, Instruction Leak, Scenario Lock, Passive Agency, Unsupported Inference, Relationship Distortion, and Capability Misinterpretation.</li>
          <li><strong>Verified Evidence Linking:</strong> Highlights exact verified passages in your definition snapshot.</li>
          <li><strong>Immutable Snapshots & Version Compare:</strong> Preserves baseline snapshots for zero-token diffs or symmetric LLM delta checks.</li>
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
      viewedRunId = null;
      activeReportTab = existing && existing.secondaryReport ? 'synthesis' : 'primary';
      renderReport(existing, comp);
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
            ? `Auditing <em>"${escapeHTML(comp.name)}"</em> across <strong>${escapeHTML(cfg.model || 'Primary')}</strong> and <strong>${escapeHTML(secCfg?.model || 'Secondary')}</strong> to synthesize interpretive risks and verify evidence passages.`
            : `Auditing <em>"${escapeHTML(comp.name)}"</em> for trait dominance, contradictions, failure mode hypotheses, and verified evidence passages via <strong>${escapeHTML(cfg.model || 'model')}</strong>.`}
        </p>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" disabled>Running…</button>
    `;
  }

  /**
   * Render Phase 2 Version Comparison Tab (Zero-Token Visual Diff + Optional Symmetric LLM Delta)
   */
  function renderCompareTabContent(comp, allRuns) {
    if (!allRuns || allRuns.length === 0) {
      return `
        <div class="delphi-explainer-box" style="text-align:center; padding:24px;">
          <p style="margin:0; color:var(--text-secondary);">
            Run a Delphi diagnostic first to capture an immutable baseline snapshot.
          </p>
        </div>`;
    }

    // If only 1 historical run exists, compare Snapshot A (Saved Run #1) against Live Component Draft so the tab is immediately useful
    let effectiveRuns = [...allRuns];
    let singleRunLiveNoticeHTML = '';
    if (allRuns.length === 1) {
      const liveSnap = window.Delphi.buildComponentContentSnapshot(comp);
      const liveRun = {
        runId: '__live_draft__',
        verdict: 'LIVE WORKING DRAFT',
        model: 'Unaudited Live Text',
        timestamp: comp.modifiedAt || new Date().toISOString(),
        contentSnapshot: liveSnap,
        contentHash: window.Delphi.computeContentHash(liveSnap),
        hasContentSnapshot: true,
        dimensions: {},
        findings: [],
        traitDominance: []
      };
      effectiveRuns = [liveRun, allRuns[0]];
      singleRunLiveNoticeHTML = `
        <div class="delphi-explainer-box" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
          <div style="font-size:0.8rem; color:var(--text-secondary);">
            <strong>1 diagnostic snapshot recorded so far.</strong> Below is a zero-token diff between your saved snapshot and your current live component text. Run a second diagnostic after editing to compare Failure Mode classifications, Trait Dominance, and Symmetric LLM Deltas across two complete reports.
          </div>
          <button id="btn-delphi-cmp-rerun-now" class="btn btn-primary btn-sm" style="white-space:nowrap;">
            🔄 Run New Snapshot Now
          </button>
        </div>`;
    }

    // Default Run B = Latest Run (effectiveRuns[0]), Run A = Pinned Baseline or second-most-recent (effectiveRuns[1])
    if (!compareRunBId || !effectiveRuns.some(r => r.runId === compareRunBId)) {
      compareRunBId = effectiveRuns[0].runId;
    }
    if (!compareRunAId || !effectiveRuns.some(r => r.runId === compareRunAId) || compareRunAId === compareRunBId) {
      const pinnedCandidate = effectiveRuns.find(r => r.pinned && r.runId !== compareRunBId);
      const fallbackCandidate = effectiveRuns.find(r => r.runId !== compareRunBId) || effectiveRuns[0];
      compareRunAId = (pinnedCandidate || fallbackCandidate).runId;
    }

    const runA = effectiveRuns.find(r => r.runId === compareRunAId) || effectiveRuns[1] || effectiveRuns[0];
    const runB = effectiveRuns.find(r => r.runId === compareRunBId) || effectiveRuns[0];
    const cmp = window.Delphi.compareDelphiRuns(runA, runB);

    const runLabel = (r, idx) => {
      const dateStr = r.timestamp ? new Date(r.timestamp).toLocaleString() : `Run #${idx + 1}`;
      const pinTag = r.pinned ? `📌 [${r.pinLabel || 'Baseline'}] ` : (idx === 0 ? '[Latest] ' : '');
      const legacyTag = r.isLegacyStub ? ' (v1 summary stub)' : (!r.contentSnapshot ? ' (v1 report)' : '');
      return `${pinTag}${r.verdict || '—'} · ${r.model || 'model'} · ${dateStr}${legacyTag}`;
    };

    // Dimension shift pills
    const dimShiftsHTML = (cmp.dimensionShifts || []).map(d => {
      const changedStyle = d.changed
        ? 'border-color: rgba(168,85,247,0.5); background: rgba(168,85,247,0.12);'
        : 'opacity: 0.8;';
      return `
        <div style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); ${changedStyle}">
          <div style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">${escapeHTML(d.dimension)}</div>
          <div style="font-size: 0.85rem; font-weight: 700; margin-top: 2px; color: var(--text-primary);">
            ${escapeHTML(String(d.from).toUpperCase())} <span style="color:var(--text-muted);">→</span> <span style="color:${d.changed ? '#d8b4fe' : 'inherit'};">${escapeHTML(String(d.to).toUpperCase())}</span>
          </div>
        </div>
      `;
    }).join('');

    // Text diff section
    let textDiffHTML = '';
    if (!cmp.hasBothSnapshots) {
      textDiffHTML = `
        <div class="delphi-warning-banner" style="margin-bottom: 10px;">
          <span>ℹ️ One or both selected runs are legacy <code>v1</code> records without an immutable <code>contentSnapshot</code>. Definition text diff requires two <code>v2</code> snapshots.</span>
        </div>`;
    } else if (!cmp.textDiff.changed) {
      textDiffHTML = `
        <div style="padding: 10px 14px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); border-radius: 6px; font-size: 0.82rem; color: #86efac;">
          ✓ Both runs evaluated the exact same component definition text (0 line differences).
        </div>`;
    } else {
      const diffLinesHTML = cmp.textDiff.lines.map(l => {
        if (l.type === 'added') {
          return `<div class="delphi-diff-line delphi-diff-add">+ ${escapeHTML(l.text)}</div>`;
        }
        if (l.type === 'removed') {
          return `<div class="delphi-diff-line delphi-diff-del">- ${escapeHTML(l.text)}</div>`;
        }
        return `<div class="delphi-diff-line delphi-diff-same">  ${escapeHTML(l.text)}</div>`;
      }).join('');

      textDiffHTML = `
        <details class="delphi-compare-details" open>
          <summary class="delphi-compare-summary">
            <span>📝 Definition Text Diff (Snapshot A ↔ Snapshot B)</span>
            <span style="font-size: 0.75rem;">
              <span style="color:#4ade80;">+${cmp.textDiff.addedCount} added</span> ·
              <span style="color:#f87171;">-${cmp.textDiff.removedCount} removed</span>
            </span>
          </summary>
          <div class="delphi-diff-box">${diffLinesHTML}</div>
        </details>`;
    }

    // Trait Dominance comparison
    let domCompHTML = '';
    if (cmp.dominanceComparison && cmp.dominanceComparison.length > 0) {
      domCompHTML = `
        <details class="delphi-compare-details" open>
          <summary class="delphi-compare-summary">
            <span>📊 Trait Dominance Signal Comparison (${cmp.dominanceComparison.length} traits)</span>
          </summary>
          <div style="overflow-x:auto; padding: 10px 12px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
                  <th style="padding:6px 8px;">Trait / Descriptor</th>
                  <th style="padding:6px 8px;">Snapshot A</th>
                  <th style="padding:6px 8px;">Snapshot B</th>
                  <th style="padding:6px 8px;">Shift</th>
                </tr>
              </thead>
              <tbody>
                ${cmp.dominanceComparison.map(row => {
                  const sA = row.strengthA !== null ? `${row.strengthA}/10` : '—';
                  const sB = row.strengthB !== null ? `${row.strengthB}/10` : '—';
                  let deltaStr = '—';
                  if (row.delta !== null) {
                    if (row.delta > 0) deltaStr = `<span style="color:#fbbf24;">+${row.delta}</span>`;
                    else if (row.delta < 0) deltaStr = `<span style="color:#38bdf8;">${row.delta}</span>`;
                    else deltaStr = `<span style="color:var(--text-muted);">0</span>`;
                  } else if (row.strengthA !== null && row.strengthB === null) {
                    deltaStr = `<span style="color:var(--text-muted);">No longer listed</span>`;
                  } else if (row.strengthA === null && row.strengthB !== null) {
                    deltaStr = `<span style="color:#c084fc;">Newly listed</span>`;
                  }
                  return `
                    <tr style="border-bottom:1px dashed rgba(255,255,255,0.06);">
                      <td style="padding:6px 8px; font-weight:600; color:var(--text-primary);">${escapeHTML(row.trait)}</td>
                      <td style="padding:6px 8px; color:var(--text-secondary);" title="${escapeHTML(row.noteA)}">${sA}</td>
                      <td style="padding:6px 8px; color:var(--text-secondary);" title="${escapeHTML(row.noteB)}">${sB}</td>
                      <td style="padding:6px 8px; font-weight:600;">${deltaStr}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </details>`;
    }

    // Failure Mode & Findings Comparison (Strictly uses "No longer reported" / "Newly reported")
    let fmCompHTML = '';
    if (cmp.failureModeComparison && cmp.failureModeComparison.length > 0) {
      fmCompHTML = `
        <div style="margin-bottom: 10px; display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:0.82rem; font-weight:700; color:var(--text-primary);">
            ⚑ Failure Mode Classification Shifts (Zero-Token Comparison)
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
            Note: Because diagnostic findings are interpretive, items absent in Snapshot B are labeled <em>"No longer reported"</em> rather than assumed resolved.
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:8px;">
            ${cmp.failureModeComparison.map(fc => {
              let statusBadgeColor = '#a855f7';
              if (fc.statusLabel === 'No longer reported') statusBadgeColor = '#38bdf8';
              else if (fc.statusLabel === 'Newly reported') statusBadgeColor = '#fbbf24';
              return `
                <div style="padding:10px 12px; border:1px solid var(--border-color); border-radius:6px; background:rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${renderFailureModeBadge(fc.code, true)}
                    <span style="font-size:0.7rem; font-weight:700; color:${statusBadgeColor}; padding:1px 6px; border-radius:4px; background:${statusBadgeColor}1a; border:1px solid ${statusBadgeColor}44;">
                      ${escapeHTML(fc.statusLabel)}
                    </span>
                  </div>
                  <div style="font-size:0.76rem; color:var(--text-secondary);">
                    Snapshot A: <strong>${fc.countA}</strong> finding${fc.countA === 1 ? '' : 's'} →
                    Snapshot B: <strong>${fc.countB}</strong> finding${fc.countB === 1 ? '' : 's'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>`;
    }

    // Side-by-side Findings lists
    const renderMiniFinding = (f) => `
      <div style="padding:8px 10px; border:1px solid var(--border-color); border-radius:6px; background:rgba(0,0,0,0.2); margin-bottom:8px;">
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
          <span class="delphi-dim-badge" style="font-size:0.65rem; background:rgba(255,255,255,0.08);">${escapeHTML(f.dimension.toUpperCase())} · ${escapeHTML(f.severity.toUpperCase())}</span>
          ${(f.failureModes || []).map(m => renderFailureModeBadge(m, true)).join('')}
        </div>
        <div style="font-size:0.78rem; color:var(--text-primary); line-height:1.4;">${escapeHTML(f.hypothesis)}</div>
        ${(f.quotes || []).length > 0 ? `<div style="margin-top:4px; font-size:0.73rem; color:#fde68a; font-style:italic;">"${escapeHTML(f.quotes[0])}"${f.quotes.length > 1 ? ` (+${f.quotes.length - 1} more)` : ''}</div>` : ''}
      </div>
    `;

    const sideBySideFindingsHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:6px;">
        <div>
          <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
            Snapshot A Findings (${cmp.findingsA.length})
          </div>
          ${cmp.findingsA.length > 0 ? cmp.findingsA.map(renderMiniFinding).join('') : `<div style="font-size:0.76rem; color:var(--text-muted); font-style:italic;">No structured findings in Snapshot A.</div>`}
        </div>
        <div>
          <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
            Snapshot B Findings (${cmp.findingsB.length})
          </div>
          ${cmp.findingsB.length > 0 ? cmp.findingsB.map(renderMiniFinding).join('') : `<div style="font-size:0.76rem; color:var(--text-muted); font-style:italic;">No structured findings in Snapshot B.</div>`}
        </div>
      </div>
    `;

    // Optional Symmetric LLM Semantic Delta section
    const canRunSymmetricDelta = Boolean(runA.contentSnapshot && runB.contentSnapshot && runA.report && runB.report && runA.runId !== runB.runId);
    const cachedDelta = cmp.cachedDelta;

    const symmetricDeltaHTML = `
      <div style="margin-top: 12px; padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(168,85,247,0.35); background: rgba(168,85,247,0.06);">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <div style="font-size:0.86rem; font-weight:700; color:#d8b4fe;">
              🔮 Symmetric LLM Semantic Delta — (Def A + Report A) ↔ (Def B + Report B)
            </div>
            <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">
              Evaluates both complete definitions and their independent reports to explain whether revisions meaningfully shifted interpretation.
            </div>
          </div>
          <button id="btn-delphi-run-version-delta" class="btn btn-secondary btn-sm" style="border-color:rgba(168,85,247,0.5); color:#d8b4fe;" ${!canRunSymmetricDelta ? 'disabled title="Requires two distinct v2 snapshots with full definitions and reports"' : ''}>
            ${cachedDelta ? '🔁 Re-run Semantic Delta (LLM)' : '▶ Compare Interpretations (LLM)'}
          </button>
        </div>

        ${cachedDelta ? `
          <div style="margin-top:12px; padding-top:12px; border-top:1px dashed rgba(168,85,247,0.3);">
            <div style="font-size:0.84rem; font-weight:600; color:var(--text-primary); margin-bottom:8px;">
              Summary: ${escapeHTML(cachedDelta.summary || '')}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-bottom:10px; font-size:0.76rem;">
              <div style="padding:8px 10px; border-radius:6px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25);">
                <strong style="color:#4ade80;">Appears Mitigated (${(cachedDelta.mitigatedRisks || []).length}):</strong>
                <ul style="margin:4px 0 0 0; padding-left:16px; color:var(--text-secondary);">
                  ${(cachedDelta.mitigatedRisks || []).map(x => `<li>${escapeHTML(x)}</li>`).join('') || '<li>None noted</li>'}
                </ul>
              </div>
              <div style="padding:8px 10px; border-radius:6px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25);">
                <strong style="color:#fbbf24;">Persisting Hypotheses (${(cachedDelta.persistingRisks || []).length}):</strong>
                <ul style="margin:4px 0 0 0; padding-left:16px; color:var(--text-secondary);">
                  ${(cachedDelta.persistingRisks || []).map(x => `<li>${escapeHTML(x)}</li>`).join('') || '<li>None noted</li>'}
                </ul>
              </div>
              <div style="padding:8px 10px; border-radius:6px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);">
                <strong style="color:#f87171;">New Trade-offs / Risks (${(cachedDelta.newRisks || []).length}):</strong>
                <ul style="margin:4px 0 0 0; padding-left:16px; color:var(--text-secondary);">
                  ${(cachedDelta.newRisks || []).map(x => `<li>${escapeHTML(x)}</li>`).join('') || '<li>None noted</li>'}
                </ul>
              </div>
            </div>
            <div class="delphi-report-content" style="padding:12px 14px;">
              ${formatMarkdown(cachedDelta.report || '')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    return `
      ${singleRunLiveNoticeHTML}
      <div class="delphi-compare-selectors" style="display:grid; grid-template-columns: 1fr auto 1fr; gap:10px; align-items:end; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:6px; border:1px solid var(--border-color);">
        <div>
          <label style="display:block; font-size:0.74rem; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Snapshot A (Baseline / Older)</label>
          <select id="delphi-cmp-select-a" class="form-control" style="width:100%; font-size:0.8rem; padding:5px 8px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;">
            ${effectiveRuns.map((r, i) => `<option value="${escapeHTML(r.runId)}" ${r.runId === runA.runId ? 'selected' : ''}>${escapeHTML(runLabel(r, i))}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:1.1rem; color:var(--text-muted); padding-bottom:4px;">↔</div>
        <div>
          <label style="display:block; font-size:0.74rem; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Snapshot B (Target / Newer)</label>
          <select id="delphi-cmp-select-b" class="form-control" style="width:100%; font-size:0.8rem; padding:5px 8px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;">
            ${effectiveRuns.map((r, i) => `<option value="${escapeHTML(r.runId)}" ${r.runId === runB.runId ? 'selected' : ''}>${escapeHTML(runLabel(r, i))}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:8px;">
        <div style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.03);">
          <div style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Overall Verdict</div>
          <div style="font-size: 0.85rem; font-weight: 700; margin-top: 2px; color: var(--text-primary);">
            ${escapeHTML(cmp.verdictShift.from)} <span style="color:var(--text-muted);">→</span> <span style="color:${cmp.verdictShift.changed ? '#d8b4fe' : 'inherit'};">${escapeHTML(cmp.verdictShift.to)}</span>
          </div>
        </div>
        ${dimShiftsHTML}
      </div>

      ${textDiffHTML}
      ${domCompHTML}
      ${fmCompHTML}
      ${sideBySideFindingsHTML}
      ${symmetricDeltaHTML}
    `;
  }

  function renderReport(rawDelphiData, comp, unreadableNotice = false) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    setModalHeader(
      `🔮 Delphi — ${escapeHTML(comp.name)}`,
      'Surfaces interpretive risk hypotheses, verified evidence passages, and cross-model agreement'
    );

    const allRuns = getAllComponentRuns(comp);
    let delphiData = window.Delphi.normalizeDelphiRecord(rawDelphiData, comp);
    if (viewedRunId && allRuns.length > 0) {
      const foundRun = allRuns.find(r => r.runId === viewedRunId);
      if (foundRun) {
        delphiData = window.Delphi.normalizeDelphiRecord(foundRun, comp);
      }
    } else if (delphiData) {
      viewedRunId = delphiData.runId;
    }

    const secCfg = getSecondaryConfig();
    const hasSecondary = !!(secCfg && secCfg.provider && secCfg.provider !== 'none');
    const hasComparison = !!(delphiData.secondaryReport || delphiData.comparisonReport);
    const canCompareRuns = allRuns.length >= 1;

    if (activeReportTab === 'compare' && !canCompareRuns) {
      activeReportTab = hasComparison ? 'synthesis' : 'primary';
    } else if (activeReportTab !== 'compare') {
      if (hasComparison && !['synthesis', 'primary', 'secondary'].includes(activeReportTab)) {
        activeReportTab = 'synthesis';
      } else if (!hasComparison) {
        activeReportTab = 'primary';
      }
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
      bannerTitle = `FAIL — Structural contradiction or defect identified (${flagCount} dimension flag${flagCount === 1 ? '' : 's'})`;
    } else if (verdict === 'NEEDS WORK') {
      bannerCls = 'delphi-banner-warn';
      bannerIcon = '⚠️';
      bannerTitle = `NEEDS WORK — Interpretive risk hypotheses detected (${flagCount} dimension flag${flagCount === 1 ? '' : 's'})`;
    } else if (verdict === 'READY') {
      bannerCls = 'delphi-banner-ready';
      bannerIcon = '🔮';
      bannerTitle = 'READY — Coherent and structurally sound for production';
    }

    // Top History / Baseline Toolbar
    let historyBarHTML = '';
    if (allRuns.length > 0 && !unreadableNotice) {
      const formatRunOption = (r, idx) => {
        const dStr = r.timestamp ? new Date(r.timestamp).toLocaleString() : `Run #${idx + 1}`;
        const prefix = r.pinned ? `📌 [${r.pinLabel || 'Baseline'}] ` : (idx === 0 ? '● Latest: ' : '');
        const v1Tag = r.isLegacyStub ? ' (v1 summary)' : (!r.contentSnapshot ? ' (v1)' : '');
        return `${prefix}${r.verdict || '—'} · ${r.model || 'model'} (${dStr})${v1Tag}`;
      };

      historyBarHTML = `
        <div class="delphi-history-bar" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm);">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1;">
            ${returnToBatchDigest && lastBatchDigest ? `
              <button id="btn-delphi-back-batch" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.76rem;">
                ← Back to Batch Digest
              </button>` : ''}
            <span style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">📜 Report Snapshot:</span>
            <select id="delphi-history-select" class="form-control" style="font-size:0.78rem; padding:3px 8px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; max-width:380px;">
              ${allRuns.map((r, i) => `<option value="${escapeHTML(r.runId)}" ${r.runId === delphiData.runId ? 'selected' : ''}>${escapeHTML(formatRunOption(r, i))}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button id="btn-delphi-pin-run" class="btn btn-secondary btn-sm" style="padding:3px 10px; font-size:0.76rem; ${delphiData.pinned ? 'border-color:rgba(245,158,11,0.6); color:#fbbf24; background:rgba(245,158,11,0.12);' : ''}" title="Pinned baselines are protected from the 10-run history rotation limit">
              ${delphiData.pinned ? `📌 ${escapeHTML(delphiData.pinLabel || 'Pinned Baseline')}` : '☆ Pin as Baseline'}
            </button>
            ${canCompareRuns ? `
              <button id="btn-delphi-open-compare-tab" class="btn btn-secondary btn-sm" style="padding:3px 10px; font-size:0.76rem; ${activeReportTab === 'compare' ? 'border-color:rgba(168,85,247,0.6); color:#d8b4fe; background:rgba(168,85,247,0.18);' : ''}">
                ⇄ Compare Versions (${allRuns.length})
              </button>` : ''}
          </div>
        </div>
      `;
    }

    // Stale definition notice when live component has been edited since the viewed snapshot
    let staleNoticeHTML = '';
    if (delphiData.isStaleDefinition && !unreadableNotice) {
      staleNoticeHTML = `
        <div class="delphi-warning-banner" style="padding:8px 12px; font-size:0.79rem;">
          <span>⚠️ <strong>Definition modified since this snapshot was generated.</strong> Evidence highlights below are bound to the immutable definition snapshot evaluated during this run.</span>
        </div>`;
    }

    // Legacy v1 stub notice
    if (delphiData.isLegacyStub) {
      body.innerHTML = `
        ${historyBarHTML}
        <div class="delphi-verdict-banner ${bannerCls}">
          <div class="delphi-verdict-banner-header">
            <span style="font-size: 1.2rem;">${bannerIcon}</span>
            <strong>${escapeHTML(delphiData.verdict || 'LEGACY RUN')}</strong>
            <span style="font-size:0.72rem; padding:1px 6px; border-radius:4px; background:rgba(255,255,255,0.1);">Legacy v1 History Summary</span>
          </div>
          <div style="font-size: 0.78rem; opacity: 0.85; margin-top: 4px;">
            Model: ${escapeHTML(delphiData.model || 'unknown')} · Tested ${delphiData.timestamp ? new Date(delphiData.timestamp).toLocaleString() : 'previously'}
          </div>
        </div>
        <div class="delphi-explainer-box">
          This historical entry was recorded by Delphi v1, which stored only summary verdict metadata (<code>verdict</code>, <code>model</code>, <code>timestamp</code>). Full immutable snapshots, verified quote highlights, and findings are automatically preserved on all new v2 runs.
        </div>
      `;
      wireReportCommonEvents(body, comp, delphiData, allRuns);
      return;
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

    // Sub-Tabs for Reports & Version Comparison
    let tabsHTML = '';
    if (hasComparison || canCompareRuns) {
      tabsHTML = `
        <div class="delphi-report-tabs">
          ${hasComparison ? `
            <button class="delphi-report-tab ${activeReportTab === 'synthesis' ? 'active' : ''}" data-tab="synthesis">
              🔮 Cross-Model Synthesis
            </button>` : ''}
          <button class="delphi-report-tab ${activeReportTab === 'primary' ? 'active' : ''}" data-tab="primary">
            ${hasComparison ? `Primary: ${escapeHTML(delphiData.model || 'Model 1')}` : '📋 Diagnostic Report & Evidence'}
          </button>
          ${hasComparison ? `
            <button class="delphi-report-tab ${activeReportTab === 'secondary' ? 'active' : ''}" data-tab="secondary">
              Secondary: ${escapeHTML(delphiData.comparedModel || 'Model 2')}
            </button>` : ''}
          ${canCompareRuns ? `
            <button class="delphi-report-tab ${activeReportTab === 'compare' ? 'active' : ''}" data-tab="compare">
              ⇄ Version Comparison (${allRuns.length})
            </button>` : ''}
        </div>
      `;
    }

    // Build Main Body Content for activeReportTab
    let mainTabContentHTML = '';

    if (activeReportTab === 'compare' && canCompareRuns) {
      mainTabContentHTML = renderCompareTabContent(comp, allRuns);
    } else {
      // Determine active findings & traitDominance for the current tab
      const activeFindings = (activeReportTab === 'secondary' && Array.isArray(delphiData.secondaryFindings) && delphiData.secondaryFindings.length > 0)
        ? delphiData.secondaryFindings
        : (delphiData.findings || []);
      const activeDominance = (activeReportTab === 'secondary' && Array.isArray(delphiData.secondaryTraitDominance) && delphiData.secondaryTraitDominance.length > 0)
        ? delphiData.secondaryTraitDominance
        : (delphiData.traitDominance || []);

      // Trait Dominance Strip
      let dominanceStripHTML = '';
      if (activeDominance.length > 0) {
        dominanceStripHTML = `
          <details class="delphi-compare-details" style="margin-bottom:8px;">
            <summary class="delphi-compare-summary">
              <span>📊 Trait Dominance Signal Hierarchy (${activeDominance.length} ranked descriptors)</span>
            </summary>
            <div style="padding:10px 12px; display:flex; flex-wrap:wrap; gap:8px;">
              ${activeDominance.map(td => {
                const s = td.strength;
                const col = s >= 8 ? '#c084fc' : s >= 5 ? '#38bdf8' : '#94a3b8';
                return `
                  <div style="padding:5px 10px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid ${col}44; font-size:0.76rem;" title="${escapeHTML(td.note || '')}">
                    <strong style="color:var(--text-primary);">${escapeHTML(td.trait)}</strong>
                    <span style="margin-left:6px; font-weight:700; color:${col};">${s}/10</span>
                    ${td.note ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${escapeHTML(td.note)}</div>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        `;
      }

      // Phase 1: Failure Mode Hypotheses Filter Bar + Structured Findings & Verified Evidence Linking
      let findingsSectionHTML = '';
      const verifiedHighlightRanges = [];

      if (activeFindings.length > 0) {
        // Count failure modes
        const fmCounts = {};
        activeFindings.forEach(f => {
          (f.failureModes || []).forEach(m => {
            fmCounts[m] = (fmCounts[m] || 0) + 1;
          });
        });
        const fmKeys = Object.keys(fmCounts);

        if (activeFailureModeFilter !== 'ALL' && !fmCounts[activeFailureModeFilter]) {
          activeFailureModeFilter = 'ALL';
        }

        const filteredFindings = activeFailureModeFilter === 'ALL'
          ? activeFindings
          : activeFindings.filter(f => (f.failureModes || []).includes(activeFailureModeFilter));

        const filterPillsHTML = fmKeys.length > 0 ? `
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Filter by Failure Mode Hypothesis:</span>
            <button class="delphi-fm-filter-btn ${activeFailureModeFilter === 'ALL' ? 'active' : ''}" data-fm="ALL" style="padding:2px 8px; font-size:0.72rem; border-radius:999px; cursor:pointer; border:1px solid var(--border-color); background:${activeFailureModeFilter === 'ALL' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)'}; color:var(--text-primary);">
              All (${activeFindings.length})
            </button>
            ${fmKeys.map(code => {
              const meta = window.Delphi?.FAILURE_MODES?.[code] || { label: code, color: '#a855f7' };
              const isAct = activeFailureModeFilter === code;
              return `
                <button class="delphi-fm-filter-btn ${isAct ? 'active' : ''}" data-fm="${escapeHTML(code)}" style="padding:2px 8px; font-size:0.72rem; border-radius:999px; cursor:pointer; border:1px solid ${meta.color}${isAct ? 'aa' : '44'}; background:${meta.color}${isAct ? '33' : '12'}; color:${meta.color}; font-weight:600;">
                  ${escapeHTML(meta.label)} (${fmCounts[code]})
                </button>`;
            }).join('')}
          </div>
        ` : '';

        const findingCardsHTML = filteredFindings.map((f, fIdx) => {
          const findingId = `f_${fIdx}`;
          const sevCls = f.severity === 'fail' ? 'border-left: 3px solid #ef4444;' : 'border-left: 3px solid #f59e0b;';
          const vQuotes = Array.isArray(f.verifiedQuotes) ? f.verifiedQuotes : [];

          vQuotes.forEach(vq => {
            if (vq.verified) {
              verifiedHighlightRanges.push({
                start: vq.start,
                end: vq.end,
                severity: f.severity,
                findingId,
                label: `${f.dimension.toUpperCase()} (${(f.failureModes || []).join(', ') || f.severity}): ${f.hypothesis}`
              });
            }
          });

          const quotesHTML = vQuotes.map(vq => {
            if (vq.verified) {
              return `
                <div class="delphi-evidence-quote verified" data-scroll-hl="delphi-hl-${findingId}" title="Verified in definition snapshot (${vq.matchType} match) — click to scroll & highlight in source">
                  <span style="font-size:0.7rem; color:#4ade80; font-weight:700; margin-right:6px;">🔍 Verified Passage:</span>
                  <span style="font-style:italic; color:#fde68a;">"${escapeHTML(vq.quote)}"</span>
                </div>`;
            }
            return `
              <div class="delphi-evidence-quote unverified" title="Quote could not be matched verbatim in the snapshot (paraphrased or legacy report) — source highlight omitted">
                <span style="font-size:0.68rem; color:var(--text-muted); margin-right:6px;">⚪ Unlinked Quote:</span>
                <span style="font-style:italic; color:var(--text-secondary);">"${escapeHTML(vq.quote)}"</span>
              </div>`;
          }).join('');

          return `
            <div class="delphi-finding-card" style="padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); ${sevCls} background:rgba(255,255,255,0.02); margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; padding:1px 6px; border-radius:4px; background:rgba(255,255,255,0.08); color:var(--text-primary);">
                    ${escapeHTML(f.dimension)} · ${escapeHTML(f.severity)}
                  </span>
                  ${(f.failureModes || []).map(code => renderFailureModeBadge(code)).join('')}
                </div>
              </div>
              <div style="font-size:0.83rem; color:var(--text-primary); line-height:1.45; margin-bottom:6px;">
                <strong>Interpretive Risk Hypothesis:</strong> ${escapeHTML(f.hypothesis)}
              </div>
              ${quotesHTML ? `<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">${quotesHTML}</div>` : ''}
              ${f.suggestion ? `<div style="font-size:0.78rem; color:#86efac; background:rgba(34,197,94,0.07); padding:5px 8px; border-radius:4px; border:1px solid rgba(34,197,94,0.2);"><strong>Suggested Adjustment:</strong> ${escapeHTML(f.suggestion)}</div>` : ''}
            </div>
          `;
        }).join('');

        findingsSectionHTML = `
          <div class="delphi-findings-section" style="margin-bottom:10px;">
            ${filterPillsHTML}
            ${findingCardsHTML}
          </div>
        `;
      }

      //Also add verified cross-model disputed wording ranges if in synthesis tab
      if (activeReportTab === 'synthesis' && delphiData.comparisonData?.verifiedDisputedWording) {
        delphiData.comparisonData.verifiedDisputedWording.forEach((vq, idx) => {
          if (vq.verified) {
            verifiedHighlightRanges.push({
              start: vq.start,
              end: vq.end,
              severity: 'flag',
              findingId: `disputed_${idx}`,
              label: `Cross-Model Disputed Wording: ${delphiData.comparisonData.consequence || ''}`
            });
          }
        });
      }

      // Source Evidence Drawer (Phase 1 & 2)
      let sourceEvidenceDrawerHTML = '';
      if (delphiData.hasContentSnapshot && delphiData.contentSnapshot) {
        const hlCount = verifiedHighlightRanges.length;
        sourceEvidenceDrawerHTML = `
          <details id="delphi-source-evidence-details" class="delphi-compare-details" ${hlCount > 0 ? 'open' : ''} style="margin-bottom:10px;">
            <summary class="delphi-compare-summary">
              <span>📖 Audited Definition Snapshot & Verified Evidence Highlights</span>
              <span style="font-size:0.74rem; color:${hlCount > 0 ? '#fde68a' : 'var(--text-muted)'};">
                ${hlCount} verified passage${hlCount === 1 ? '' : 's'} highlighted
              </span>
            </summary>
            <div id="delphi-source-evidence-container" class="delphi-source-container">
              ${buildAnnotatedSourceHTML(delphiData.contentSnapshot, verifiedHighlightRanges)}
            </div>
          </details>
        `;
      } else if (!unreadableNotice) {
        sourceEvidenceDrawerHTML = `
          <div style="padding:10px 14px; border-radius:6px; border:1px solid rgba(168,85,247,0.4); background:rgba(168,85,247,0.08); font-size:0.8rem; color:var(--text-primary); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <div>
              ✨ <strong>Delphi v2 Upgrade Available for this Component:</strong> This report was recorded with Delphi v1 (which did not store Failure Mode Hypothesis tags, Verified Evidence Quotes, or an Immutable Snapshot). Re-run to generate full v2 diagnostics.
            </div>
            <button id="btn-delphi-upgrade-v2-rerun" class="btn btn-primary btn-sm" style="white-space:nowrap;">
              🔄 Re-Run with Delphi v2
            </button>
          </div>
        `;
      }

      // Report markdown prose according to active tab
      let reportBodyHTML = '';
      if (activeReportTab === 'synthesis' && hasComparison) {
        let disputedHTML = '';
        const compData = delphiData.comparisonData || {};
        const disputed = Array.isArray(compData.disputedWording) ? compData.disputedWording : [];
        if (disputed.length > 0 || (dims && dims.crossModel === 'flag')) {
          disputedHTML = `
            <div class="delphi-disputed-box">
              <div class="delphi-disputed-title">⚠️ Cross-Model Disputed Wording & Behavioral Consequences</div>
              ${disputed.length > 0 ? disputed.map((dw, idx) => {
                const quote = typeof dw === 'string' ? dw : (dw.wording || JSON.stringify(dw));
                const cons = typeof dw === 'object' && dw.consequence ? dw.consequence : (compData.consequence || null);
                const vq = compData.verifiedDisputedWording && compData.verifiedDisputedWording[idx];
                const isVer = vq && vq.verified;
                return `
                  <div class="delphi-disputed-item">
                    <div class="delphi-disputed-wording" ${isVer ? `data-scroll-hl="delphi-hl-disputed_${idx}" style="cursor:pointer;" title="Verified in snapshot — click to highlight"` : ''}>
                      ${isVer ? '🔍 ' : ''}"${escapeHTML(quote)}"
                    </div>
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

      let thinkingHTML = '';
      let thinkingContent = delphiData.thinking || '';
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

      mainTabContentHTML = `
        ${dominanceStripHTML}
        ${findingsSectionHTML}
        ${sourceEvidenceDrawerHTML}
        <div class="delphi-report-content">
          ${reportBodyHTML}
          ${thinkingHTML}
        </div>
      `;
    }

    const testSubtitle = delphiData.comparedModel
      ? `${escapeHTML(delphiData.model || 'primary')} vs ${escapeHTML(delphiData.comparedModel)} · Tested ${delphiData.timestamp ? new Date(delphiData.timestamp).toLocaleString() : 'just now'}`
      : `Model: ${escapeHTML(delphiData.model || 'model')} · Tested ${delphiData.timestamp ? new Date(delphiData.timestamp).toLocaleString() : 'just now'}`;

    const recoveryBadge = delphiData.repaired
      ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(168,85,247,0.25); color:#d8b4fe;">⚡ Auto-Repaired Format</span>`
      : (delphiData.recoveredFromPartialJson
        ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(245,158,11,0.25); color:#fbbf24;">⚡ Recovered from Partial JSON</span>`
        : (delphiData.inferredFromText
          ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(59,130,246,0.25); color:#93c5fd;">🔍 Extracted from Markdown</span>`
          : (delphiData.manual ? `<span style="display:inline-block; margin-left:8px; padding:1px 6px; font-size:0.7rem; border-radius:4px; background:rgba(34,197,94,0.25); color:#86efac;">✍️ Author Verified</span>` : '')));

    body.innerHTML = `
      ${historyBarHTML}
      ${staleNoticeHTML}
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
      ${mainTabContentHTML}
    `;

    footer.innerHTML = `
      <button id="btn-delphi-copy" class="btn btn-secondary">📋 Copy Report</button>
      <button id="btn-delphi-rerun" class="btn btn-secondary">🔁 Re-run Primary</button>
      ${hasSecondary ? `
        <button id="btn-delphi-compare" class="btn btn-secondary" style="border-color: rgba(168,85,247,0.4); color: #d8b4fe;">
          ⇄ ${hasComparison ? 'Re-run Cross-Model' : `Compare with ${escapeHTML(secCfg.model || 'Second Model')}`}
        </button>` : ''}
      <button id="btn-delphi-close" class="btn btn-primary">Close</button>
    `;

    wireReportCommonEvents(body, comp, delphiData, allRuns);
  }

  function wireReportCommonEvents(body, comp, delphiData, allRuns) {
    // Sub-tabs
    body.querySelectorAll('.delphi-report-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        if (tab) {
          activeReportTab = tab;
          renderReport(delphiData, comp, false);
        }
      });
    });

    // Back to batch digest
    document.getElementById('btn-delphi-back-batch')?.addEventListener('click', () => {
      if (lastBatchDigest) {
        renderBatchDigest(lastBatchDigest);
      }
    });

    // History snapshot dropdown
    document.getElementById('delphi-history-select')?.addEventListener('change', (e) => {
      viewedRunId = e.target.value;
      const selectedRun = allRuns.find(r => r.runId === viewedRunId) || comp.delphi;
      if (activeReportTab === 'compare') activeReportTab = 'primary';
      renderReport(selectedRun, comp, false);
    });

    // Pin / Unpin baseline
    document.getElementById('btn-delphi-pin-run')?.addEventListener('click', async () => {
      let label = '';
      if (!delphiData.pinned) {
        const defaultLabel = comp.isTemplate ? 'Golden Template Baseline' : 'Pinned Baseline';
        const input = window.prompt('Optional label for this pinned baseline snapshot:', defaultLabel);
        if (input === null) return;
        label = input.trim() || defaultLabel;
      }
      const updated = await window.Delphi.togglePinDelphiRun(comp.id, delphiData.runId, label);
      const freshComp = await window.ForgeDB.getComponent(comp.id);
      activeComp = freshComp || comp;
      renderReport(updated, activeComp, false);
    });

    // Quick switch to Compare tab
    document.getElementById('btn-delphi-open-compare-tab')?.addEventListener('click', () => {
      activeReportTab = activeReportTab === 'compare' ? 'primary' : 'compare';
      renderReport(delphiData, comp, false);
    });

    // Failure Mode filter buttons
    body.querySelectorAll('.delphi-fm-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeFailureModeFilter = e.currentTarget.getAttribute('data-fm') || 'ALL';
        renderReport(delphiData, comp, false);
      });
    });

    // Click verified quote to scroll & pulse highlight in Source Evidence Drawer
    body.querySelectorAll('[data-scroll-hl]').forEach(el => {
      el.addEventListener('click', () => {
        const targetId = el.getAttribute('data-scroll-hl');
        const detailsEl = document.getElementById('delphi-source-evidence-details');
        if (detailsEl && !detailsEl.open) detailsEl.open = true;
        const markEl = document.getElementById(targetId);
        if (markEl) {
          markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          markEl.classList.remove('delphi-hl-pulse');
          void markEl.offsetWidth;
          markEl.classList.add('delphi-hl-pulse');
        }
      });
    });

    // Version comparison selectors
    document.getElementById('delphi-cmp-select-a')?.addEventListener('change', (e) => {
      compareRunAId = e.target.value;
      renderReport(delphiData, comp, false);
    });
    document.getElementById('delphi-cmp-select-b')?.addEventListener('change', (e) => {
      compareRunBId = e.target.value;
      renderReport(delphiData, comp, false);
    });
    document.getElementById('btn-delphi-cmp-rerun-now')?.addEventListener('click', () => {
      runDiagnostic(comp.id);
    });
    document.getElementById('btn-delphi-upgrade-v2-rerun')?.addEventListener('click', () => {
      runDiagnostic(comp.id);
    });

    // Run Symmetric LLM Semantic Delta
    document.getElementById('btn-delphi-run-version-delta')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const origText = btn.textContent;
      btn.textContent = 'Analyzing symmetric delta…';
      btn.disabled = true;
      try {
        await window.Delphi.runSymmetricVersionDelta(comp.id, compareRunAId, compareRunBId);
        const freshComp = await window.ForgeDB.getComponent(comp.id);
        activeComp = freshComp || comp;
        renderReport(activeComp.delphi, activeComp, false);
      } catch (err) {
        alert('Symmetric version comparison failed: ' + (err.message || err));
        btn.textContent = origText;
        btn.disabled = false;
      }
    });

    // Auto-repair & manual override handlers
    document.getElementById('btn-delphi-autorepair')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const origText = btn.textContent;
      btn.textContent = 'Repairing…';
      btn.disabled = true;
      try {
        const repaired = await window.Delphi.repairComponentVerdict(comp.id, delphiData.report);
        const freshComp = await window.ForgeDB.getComponent(comp.id);
        activeComp = freshComp || comp;
        renderReport(repaired, activeComp, false);
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
      const freshComp = await window.ForgeDB.getComponent(comp.id);
      activeComp = freshComp || comp;
      renderReport(manualDelphi, activeComp, false);
      if (typeof showToast === 'function') showToast('Verdict saved manually.', 'success');
    });

    document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-rerun')?.addEventListener('click', () => runDiagnostic(comp.id));
    document.getElementById('btn-delphi-compare')?.addEventListener('click', () => runComparison(comp.id));
    document.getElementById('btn-delphi-copy')?.addEventListener('click', async (e) => {
      try {
        let textToCopy = '';
        if (activeReportTab === 'synthesis' && delphiData.comparisonReport) {
          textToCopy = `Delphi Cross-Model Comparison: ${comp.name}\nVerdict: ${delphiData.verdict}\nDate: ${delphiData.timestamp || new Date().toISOString()}\nPrimary: ${delphiData.model} · Secondary: ${delphiData.comparedModel}\n\n${delphiData.comparisonReport}`;
        } else if (activeReportTab === 'secondary' && delphiData.secondaryReport) {
          textToCopy = `Delphi Secondary Diagnostic (${delphiData.comparedModel}): ${comp.name}\nDate: ${delphiData.timestamp || new Date().toISOString()}\n\n${delphiData.secondaryReport}`;
        } else {
          textToCopy = `Delphi Diagnostic Report: ${comp.name}\nVerdict: ${delphiData.verdict}\nDate: ${delphiData.timestamp || new Date().toISOString()}\n\n${delphiData.report || ''}`;
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
        renderReport({ report: result.report, verdict: null, contentSnapshot: result.contentSnapshot }, comp, true);
        isRunning = false;
        return;
      }

      const savedRecord = await window.Delphi.saveComponentDiagnosticResult(comp, result);
      const freshComp = await window.ForgeDB.getComponent(compId);
      activeComp = freshComp || comp;
      viewedRunId = savedRecord.runId;
      activeReportTab = 'primary';
      activeFailureModeFilter = 'ALL';
      renderReport(savedRecord, activeComp, false);
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
      const freshComp = await window.ForgeDB.getComponent(compId);
      activeComp = freshComp || comp;
      viewedRunId = result.runId;
      activeReportTab = 'synthesis';
      activeFailureModeFilter = 'ALL';
      renderReport(result, activeComp, false);
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

  // ============================================================================
  // PHASE 3: BATCH REPORTING MODAL (Queue Runner + Batch Summary Digest)
  // ============================================================================

  async function openBatch(compIds = [], options = {}) {
    if (!Array.isArray(compIds) || compIds.length === 0) {
      if (typeof window.showToast === 'function') window.showToast('No components selected for Batch Delphi.', 'info');
      return;
    }

    ensureModalDOM();
    modalEl.classList.remove('hidden');
    returnToBatchDigest = false;

    const opts = typeof options === 'string' ? { title: options } : (options || {});
    const comps = (await Promise.all(compIds.map(id => window.ForgeDB.getComponent(id)))).filter(Boolean);
    const presetTitle = opts.title || `Batch Delphi Audit (${comps.length} component${comps.length === 1 ? '' : 's'})`;

    renderBatchPreRun(comps, presetTitle);
  }

  function renderBatchPreRun(comps, title) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    setModalHeader(
      `🔮 ${escapeHTML(title)}`,
      'Runs independent single-component diagnostics and saves each report to its component'
    );

    const cfg = window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {};
    const secCfg = getSecondaryConfig();
    const hasSecondary = !!(secCfg && secCfg.provider && secCfg.provider !== 'none');

    body.innerHTML = `
      <div class="delphi-explainer-box">
        <p style="margin:0 0 8px 0; font-size:0.86rem; color:var(--text-primary);">
          <strong>Batch Reporting</strong> runs ${comps.length} separate component diagnostics sequentially to respect API rate limits. Each component receives its own updated report and immutable snapshot in history.
        </p>
        <div style="font-size:0.78rem; color:var(--text-secondary);">
          <em>Note:</em> To evaluate how multiple characters, organizations, and scenarios interact together in a shared cast, use <strong>Ensemble Reporting</strong> in the Assembler or Mission Control.
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px;">
        <label style="font-size:0.82rem; font-weight:600; color:var(--text-primary);">Audit Mode:</label>
        <select id="delphi-batch-mode" class="form-control" style="font-size:0.82rem; padding:4px 10px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;">
          <option value="primary">Primary Model Only (${escapeHTML(cfg.model || 'Default')})</option>
          ${hasSecondary ? `<option value="cross-model">Cross-Model Comparison (${escapeHTML(cfg.model || 'Primary')} vs ${escapeHTML(secCfg.model || 'Secondary')})</option>` : ''}
        </select>
      </div>

      <div style="max-height:280px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:8px 12px; background:rgba(0,0,0,0.2);">
        <div style="font-size:0.76rem; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">
          Queued Components (${comps.length})
        </div>
        ${comps.map((c, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed rgba(255,255,255,0.06); font-size:0.82rem;">
            <div>
              <span style="color:var(--text-muted); margin-right:6px;">${idx + 1}.</span>
              <strong style="color:var(--text-primary);">${escapeHTML(c.name)}</strong>
              ${c.isTemplate ? '<span title="Golden Template">⭐</span>' : ''}
              <span style="font-size:0.72rem; color:var(--text-muted); margin-left:6px;">(${escapeHTML(c.category || 'character')})</span>
            </div>
            <span style="font-size:0.75rem; color:var(--text-secondary);">
              ${c.delphi?.verdict ? `Current: ${escapeHTML(c.delphi.verdict)}` : 'Unrun'}
            </span>
          </div>
        `).join('')}
      </div>
    `;

    footer.innerHTML = `
      <button id="btn-delphi-batch-cancel-pre" class="btn btn-ghost">Cancel</button>
      <button id="btn-delphi-batch-start" class="btn btn-primary">▶ Start Batch Audit (${comps.length})</button>
    `;

    document.getElementById('btn-delphi-batch-cancel-pre')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-batch-start')?.addEventListener('click', () => {
      const mode = document.getElementById('delphi-batch-mode')?.value || 'primary';
      executeBatchRun(comps.map(c => c.id), mode, title);
    });
  }

  async function executeBatchRun(compIds, mode, title) {
    if (isRunning) return;
    isRunning = true;
    isBatchRunning = true;
    batchPaused = false;
    batchCancelled = false;

    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');

    const updateProgressUI = (prog) => {
      latestBatchProgress = prog;
      if (bgPillEl && !bgPillEl.classList.contains('hidden')) {
        renderBgPillProgress(prog);
      }
      if (!body || !footer) return;
      const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
      body.innerHTML = `
        <div style="padding:24px 16px; text-align:center;">
          <div class="delphi-spinner" style="${batchPaused ? 'animation-play-state:paused; opacity:0.5;' : ''}"></div>
          <h4 style="margin:14px 0 6px 0; color:var(--text-primary);">
            ${batchPaused ? '⏸ Batch Audit Paused' : `Auditing ${prog.completed + 1} of ${prog.total}: "${escapeHTML(prog.currentName || '')}"…`}
          </h4>
          <div style="max-width:480px; margin:12px auto; height:8px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:#a855f7; transition:width 0.25s ease;"></div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted);">
            ${prog.completed} / ${prog.total} completed (${pct}%) · You can minimize this window and keep working while the batch runs
          </div>
        </div>
      `;

      footer.innerHTML = `
        <button id="btn-delphi-batch-minimize" class="btn btn-secondary" style="margin-right:auto; border-color:rgba(168,85,247,0.45); color:#d8b4fe;">🗕 Minimize (Run in Background)</button>
        <button id="btn-delphi-batch-pause" class="btn btn-secondary">${batchPaused ? '▶ Resume' : '⏸ Pause'}</button>
        <button id="btn-delphi-batch-abort" class="btn btn-danger">✕ Stop & View Completed</button>
      `;

      document.getElementById('btn-delphi-batch-minimize')?.addEventListener('click', minimizeBatchToBackground);
      document.getElementById('btn-delphi-batch-pause')?.addEventListener('click', () => {
        batchPaused = !batchPaused;
        updateProgressUI(prog);
      });
      document.getElementById('btn-delphi-batch-abort')?.addEventListener('click', () => {
        batchCancelled = true;
        batchPaused = false;
      });
    };

    try {
      const digest = await window.Delphi.runBatch(compIds, {
        mode,
        onProgress: updateProgressUI,
        isPaused: () => batchPaused,
        isCancelled: () => batchCancelled
      });
      digest.title = title;
      lastBatchDigest = digest;
      isRunning = false;
      isBatchRunning = false;
      const wasMinimized = modalEl && modalEl.classList.contains('hidden');
      renderBatchDigest(digest);
      if (wasMinimized) {
        renderBgPillFinished(digest);
        if (typeof window.showToast === 'function') {
          window.showToast(`Batch Delphi complete (${digest.completed}/${digest.total} audited)!`, 'success');
        }
      } else if (bgPillEl) {
        bgPillEl.classList.add('hidden');
      }
    } catch (err) {
      isRunning = false;
      isBatchRunning = false;
      if (bgPillEl) bgPillEl.classList.add('hidden');
      if (modalEl) modalEl.classList.remove('hidden');
      if (body) {
        body.innerHTML = `<div class="delphi-warning-banner">🛑 Batch run encountered an unexpected error: ${escapeHTML(err.message || err)}</div>`;
      }
    }
  }

  function renderBatchDigest(digest, filterStatus = 'ALL') {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    setModalHeader(
      `🔮 ${escapeHTML(digest.title || 'Batch Diagnostic Digest')}`,
      `${digest.completed} of ${digest.total} components audited${digest.cancelled ? ' (Stopped early)' : ''}`
    );

    const results = digest.results || [];
    const readyCount = results.filter(r => r.verdict === 'READY').length;
    const warnCount = results.filter(r => r.verdict === 'NEEDS WORK').length;
    const failCount = results.filter(r => r.verdict === 'FAIL').length;
    const errCount = results.filter(r => r.status === 'error').length;

    const filtered = results.filter(r => {
      if (filterStatus === 'FLAGGED') return r.verdict === 'NEEDS WORK' || r.verdict === 'FAIL' || r.status === 'error';
      if (filterStatus === 'READY') return r.verdict === 'READY';
      return true;
    });

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px;">
        <div style="padding:10px 14px; border-radius:6px; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); color:#4ade80;">
          <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700;">🔮 READY</div>
          <div style="font-size:1.3rem; font-weight:700;">${readyCount}</div>
        </div>
        <div style="padding:10px 14px; border-radius:6px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#fbbf24;">
          <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700;">⚠️ NEEDS WORK</div>
          <div style="font-size:1.3rem; font-weight:700;">${warnCount}</div>
        </div>
        <div style="padding:10px 14px; border-radius:6px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171;">
          <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700;">🛑 FAIL</div>
          <div style="font-size:1.3rem; font-weight:700;">${failCount}</div>
        </div>
        ${errCount > 0 ? `
          <div style="padding:10px 14px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-muted);">
            <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700;">Errors</div>
            <div style="font-size:1.3rem; font-weight:700;">${errCount}</div>
          </div>` : ''}
      </div>

      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <button class="delphi-batch-filter btn btn-secondary btn-sm ${filterStatus === 'ALL' ? 'active' : ''}" data-bfilter="ALL">All (${results.length})</button>
        <button class="delphi-batch-filter btn btn-secondary btn-sm ${filterStatus === 'FLAGGED' ? 'active' : ''}" data-bfilter="FLAGGED">Needs Review / Flagged (${warnCount + failCount + errCount})</button>
        <button class="delphi-batch-filter btn btn-secondary btn-sm ${filterStatus === 'READY' ? 'active' : ''}" data-bfilter="READY">Ready (${readyCount})</button>
      </div>

      <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:6px; background:rgba(0,0,0,0.2);">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
              <th style="padding:8px 10px;">Component</th>
              <th style="padding:8px 10px;">Verdict</th>
              <th style="padding:8px 10px;">Dimensions</th>
              <th style="padding:8px 10px;">Failure Mode Hypotheses</th>
              <th style="padding:8px 10px; text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r => {
              if (r.status === 'error') {
                return `
                  <tr style="border-bottom:1px dashed rgba(255,255,255,0.06);">
                    <td style="padding:8px 10px; font-weight:600; color:var(--text-primary);">${escapeHTML(r.name)}</td>
                    <td style="padding:8px 10px; color:#f87171;">Error</td>
                    <td colspan="2" style="padding:8px 10px; color:var(--text-muted); font-size:0.76rem;">${escapeHTML(r.error || 'Failed')}</td>
                    <td style="padding:8px 10px; text-align:right;">
                      <button class="btn btn-secondary btn-sm delphi-batch-open-item" data-id="${escapeHTML(r.id)}">Open</button>
                    </td>
                  </tr>`;
              }
              const d = r.dimensions || {};
              const vCls = r.verdict === 'READY' ? 'mc-delphi-ready' : (r.verdict === 'FAIL' ? 'mc-delphi-fail' : 'mc-delphi-flag');
              return `
                <tr style="border-bottom:1px dashed rgba(255,255,255,0.06);">
                  <td style="padding:8px 10px; font-weight:600; color:var(--text-primary);">
                    ${escapeHTML(r.name)} ${r.isTemplate ? '⭐' : ''}
                  </td>
                  <td style="padding:8px 10px;">
                    <span class="mc-delphi-badge ${vCls}">🔮 ${escapeHTML(r.verdict)}</span>
                  </td>
                  <td style="padding:8px 10px; font-size:0.75rem; color:var(--text-secondary);">
                    C: <code>${escapeHTML(d.coherence || '—')}</code> ·
                    D: <code>${escapeHTML(d.dominance || '—')}</code> ·
                    T: <code>${escapeHTML(d.triggers || '—')}</code>
                  </td>
                  <td style="padding:8px 10px;">
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                      ${(r.failureModes || []).length > 0 ? r.failureModes.map(m => renderFailureModeBadge(m, true)).join('') : '<span style="color:var(--text-muted); font-size:0.74rem;">—</span>'}
                    </div>
                  </td>
                  <td style="padding:8px 10px; text-align:right;">
                    <button class="btn btn-secondary btn-sm delphi-batch-open-item" data-id="${escapeHTML(r.id)}">🔮 View Report</button>
                  </td>
                </tr>
              `;
            }).join('') || `<tr><td colspan="5" style="padding:16px; text-align:center; color:var(--text-muted);">No items match this filter.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    footer.innerHTML = `
      <button id="btn-delphi-close" class="btn btn-primary">Done</button>
    `;

    document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
    body.querySelectorAll('.delphi-batch-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        renderBatchDigest(digest, e.currentTarget.getAttribute('data-bfilter') || 'ALL');
      });
    });
    body.querySelectorAll('.delphi-batch-open-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const compId = e.currentTarget.getAttribute('data-id');
        if (!compId) return;
        returnToBatchDigest = true;
        const comp = await window.ForgeDB.getComponent(compId);
        if (comp && comp.delphi) {
          activeComp = comp;
          viewedRunId = null;
          activeReportTab = 'primary';
          renderReport(comp.delphi, comp, false);
        } else {
          open(compId);
        }
      });
    });
  }

  // ============================================================================
  // PHASE 4: ENSEMBLE & PROJECT REPORTING MODAL (With Coverage Manifest)
  // ============================================================================

  async function openEnsemble(ensembleOrConfig, rerunCallback = null) {
    if (!ensembleOrConfig) return;
    ensureModalDOM();
    modalEl.classList.remove('hidden');

    // If passed a launch configuration ({ componentIds, components, relationships, title, scopeLabel }) without an existing report, open Pre-Run & Coverage Preview
    if (!ensembleOrConfig.report && (Array.isArray(ensembleOrConfig.componentIds) || Array.isArray(ensembleOrConfig.components))) {
      let comps = ensembleOrConfig.components;
      if (!Array.isArray(comps) && Array.isArray(ensembleOrConfig.componentIds)) {
        comps = (await Promise.all(ensembleOrConfig.componentIds.map(id => window.ForgeDB.getComponent(id)))).filter(Boolean);
      }
      renderEnsemblePreRun({
        components: comps || [],
        relationships: ensembleOrConfig.relationships || [],
        title: ensembleOrConfig.title || ensembleOrConfig.ensembleName || 'Ensemble Audit',
        scopeLabel: ensembleOrConfig.scopeLabel || 'Ensemble'
      });
      return;
    }

    activeEnsembleResult = ensembleOrConfig;
    activeEnsembleRerunFn = typeof rerunCallback === 'function' ? rerunCallback : null;
    activeEnsembleLensFilter = 'ALL';

    renderEnsembleReport(ensembleOrConfig);
  }

  function renderEnsemblePreRun(cfg) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    const comps = cfg.components || [];
    const cov = window.Delphi.computeEnsembleCoverage(comps, cfg.relationships || []);
    const isPartial = cov.status === 'partial';

    setModalHeader(
      `🎭 ${escapeHTML(cfg.title || 'Holistic Ensemble Audit')}`,
      'Evaluates cross-character voice overlap, spotlight competition risk, relationship consistency, and shared Org/Scenario context'
    );

    body.innerHTML = `
      <div class="delphi-explainer-box">
        <p style="margin:0 0 6px 0; font-size:0.86rem; color:var(--text-primary);">
          <strong>Ensemble Reporting</strong> examines all ${comps.length} selected definitions together in a single holistic pass (distinct from Batch Reporting, which audits each component separately).
        </p>
        <div style="font-size:0.78rem; color:var(--text-secondary);">
          <strong>Coverage Preview:</strong> ${isPartial
            ? `<span style="color:#fbbf24; font-weight:600;">⚠️ Partial Coverage (${cov.included.length} full, ${cov.truncated.length} truncated, ${cov.omitted.length} omitted — ${cov.estimatedInputTokens} / ${cov.effectiveInputBudgetTokens} tokens)</span>`
            : `<span style="color:#4ade80; font-weight:600;">✓ Full Coverage (${cov.included.length} components fit in full — ~${cov.estimatedInputTokens} tokens)</span>`}
        </div>
      </div>

      <div style="max-height:280px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:8px 12px; background:rgba(0,0,0,0.2);">
        <div style="font-size:0.76rem; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">
          Ensemble Components (${comps.length})
        </div>
        ${[...cov.included.map(x => ({ ...x, covTag: '✓ Full', covColor: '#4ade80' })),
           ...cov.truncated.map(x => ({ ...x, covTag: `⚠ Truncated (${x.includedTokens}/${x.originalTokens}t)`, covColor: '#fbbf24' })),
           ...cov.omitted.map(x => ({ ...x, covTag: `✕ Omitted (${x.originalTokens}t)`, covColor: '#f87171' }))
          ].map((c, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed rgba(255,255,255,0.06); font-size:0.82rem;">
            <div>
              <span style="color:var(--text-muted); margin-right:6px;">${idx + 1}.</span>
              <strong style="color:var(--text-primary);">${escapeHTML(c.name)}</strong>
              <span style="font-size:0.72rem; color:var(--text-muted); margin-left:6px;">(${escapeHTML(c.category || 'character')})</span>
            </div>
            <span style="font-size:0.75rem; font-weight:600; color:${c.covColor};">${escapeHTML(c.covTag)}</span>
          </div>
        `).join('')}
      </div>
    `;

    footer.innerHTML = `
      <button id="btn-delphi-ens-prerun-cancel" class="btn btn-ghost">Cancel</button>
      <button id="btn-delphi-ens-prerun-start" class="btn btn-primary" ${comps.length === 0 ? 'disabled' : ''}>▶ Run Holistic Ensemble Audit (${comps.length})</button>
    `;

    document.getElementById('btn-delphi-ens-prerun-cancel')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-ens-prerun-start')?.addEventListener('click', async () => {
      const executeEns = async () => {
        isRunning = true;
        body.innerHTML = `
          <div style="text-align:center; padding:48px 20px;">
            <div class="delphi-spinner"></div>
            <h4 style="margin:16px 0 8px 0; color:var(--text-primary);">Running Holistic Ensemble Diagnostic (${comps.length} items)…</h4>
            <p style="margin:0; font-size:0.84rem; color:var(--text-muted);">
              Evaluating cross-character voice overlap, spotlight competition risks, relationship consistency, and shared Org/Scenario context.
            </p>
          </div>
        `;
        footer.innerHTML = '';
        try {
          const res = await window.Delphi.diagnoseEnsemble({
            components: comps,
            relationships: cfg.relationships || [],
            ensembleName: cfg.title || 'Ensemble Audit',
            mode: 'faction'
          });
          isRunning = false;
          activeEnsembleResult = res;
          activeEnsembleRerunFn = executeEns;
          activeEnsembleLensFilter = 'ALL';
          renderEnsembleReport(res);
        } catch (err) {
          isRunning = false;
          body.innerHTML = `<div class="delphi-warning-banner">🛑 Ensemble Audit Failed: ${escapeHTML(err.message || err)}</div>`;
          footer.innerHTML = `<button id="btn-delphi-ens-err-close" class="btn btn-secondary">Close</button>`;
          document.getElementById('btn-delphi-ens-err-close')?.addEventListener('click', closeModal);
        }
      };
      await executeEns();
    });
  }

  function renderEnsembleReport(ens) {
    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    const scopeLabel = ens.mode === 'faction' ? 'Universe / Faction Ensemble Audit' : 'Assembled Bot Card Ensemble Audit';
    setModalHeader(
      `🔮 Delphi Ensemble — ${escapeHTML(ens.ensembleName || 'Assembled Cast')}`,
      `${scopeLabel} · Evaluates spotlight competition risk, voice overlap, relationship consistency, and shared Org/Scenario context`
    );

    const cov = ens.coverage || { status: 'full', included: ens.perComponent || [], truncated: [], omitted: [] };
    const isPartial = cov.status === 'partial';
    const flags = Array.isArray(ens.flags) ? ens.flags : [];
    const spotlightRisks = Array.isArray(ens.spotlightRisks) ? ens.spotlightRisks : [];
    const voiceOverlaps = Array.isArray(ens.voiceOverlaps) ? ens.voiceOverlaps : [];

    // Coverage Banner (Honest reporting of diagnostic coverage)
    const covBannerStyle = isPartial
      ? 'background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#fbbf24;'
      : 'background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.35); color:#4ade80;';

    const coverageBannerHTML = `
      <div style="padding:12px 16px; border-radius:8px; ${covBannerStyle}">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-size:0.92rem; font-weight:700;">
            ${isPartial
              ? `⚠️ Partial Ensemble Audit — ${(cov.included || []).length} full · ${(cov.truncated || []).length} truncated · ${(cov.omitted || []).length} omitted`
              : `🔮 Full Ensemble Coverage — All ${(cov.included || []).length} active components examined in full`}
          </div>
          <span style="font-size:0.75rem; opacity:0.9;">
            Model: ${escapeHTML(ens.model || 'model')} · Est. Input: ${cov.estimatedInputTokens || '—'} / ${cov.effectiveInputBudgetTokens || 16000} tokens
          </span>
        </div>
        ${isPartial ? `
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
            <strong>Coverage Limitation:</strong> Source material exceeded the context budget. Truncated or omitted components are listed in the Coverage Manifest below so partial coverage is never mistaken for a complete audit.
          </div>` : ''}
      </div>

      <details class="delphi-compare-details" ${isPartial ? 'open' : ''}>
        <summary class="delphi-compare-summary">
          <span>📋 Ensemble Diagnostic Coverage Manifest (${(cov.included || []).length} Full, ${(cov.truncated || []).length} Truncated, ${(cov.omitted || []).length} Omitted)</span>
        </summary>
        <div style="padding:10px 12px; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
                <th style="padding:5px 8px;">Component</th>
                <th style="padding:5px 8px;">Category</th>
                <th style="padding:5px 8px;">Coverage Status</th>
                <th style="padding:5px 8px;">Tokens Examined</th>
              </tr>
            </thead>
            <tbody>
              ${(cov.included || []).map(c => `
                <tr style="border-bottom:1px dashed rgba(255,255,255,0.06);">
                  <td style="padding:5px 8px; font-weight:600; color:var(--text-primary);">${escapeHTML(c.name)}</td>
                  <td style="padding:5px 8px; color:var(--text-secondary);">${escapeHTML(c.category || 'character')}</td>
                  <td style="padding:5px 8px; color:#4ade80; font-weight:600;">✓ Full</td>
                  <td style="padding:5px 8px; color:var(--text-secondary);">${c.tokens || '—'} tokens</td>
                </tr>`).join('')}
              ${(cov.truncated || []).map(c => `
                <tr style="border-bottom:1px dashed rgba(255,255,255,0.06); background:rgba(245,158,11,0.05);">
                  <td style="padding:5px 8px; font-weight:600; color:var(--text-primary);">${escapeHTML(c.name)}</td>
                  <td style="padding:5px 8px; color:var(--text-secondary);">${escapeHTML(c.category || 'character')}</td>
                  <td style="padding:5px 8px; color:#fbbf24; font-weight:600;">⚠️ Truncated (${escapeHTML(c.reason || 'Context limit')})</td>
                  <td style="padding:5px 8px; color:#fbbf24;">${c.includedTokens} / ${c.totalTokens} tokens</td>
                </tr>`).join('')}
              ${(cov.omitted || []).map(c => `
                <tr style="border-bottom:1px dashed rgba(255,255,255,0.06); background:rgba(239,68,68,0.05);">
                  <td style="padding:5px 8px; font-weight:600; color:var(--text-primary);">${escapeHTML(c.name)}</td>
                  <td style="padding:5px 8px; color:var(--text-secondary);">${escapeHTML(c.category || 'character')}</td>
                  <td style="padding:5px 8px; color:#f87171; font-weight:600;">✕ Omitted (${escapeHTML(c.reason || 'Context limit')})</td>
                  <td style="padding:5px 8px; color:var(--text-muted);">0${c.totalTokens ? ` / ${c.totalTokens}` : ''} tokens</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;

    // Spotlight Competition Risks & Voice Overlaps Summary Cards
    let ensembleSpecialCardsHTML = '';
    if (spotlightRisks.length > 0 || voiceOverlaps.length > 0) {
      ensembleSpecialCardsHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:10px;">
          ${spotlightRisks.length > 0 ? `
            <div style="padding:10px 14px; border-radius:6px; border:1px solid rgba(251,146,60,0.4); background:rgba(251,146,60,0.07);">
              <div style="font-size:0.8rem; font-weight:700; color:#fb923c; margin-bottom:6px;">
                🎭 Spotlight Competition Risk Hypotheses (${spotlightRisks.length})
              </div>
              ${spotlightRisks.map(sr => `
                <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed rgba(251,146,60,0.2); font-size:0.78rem;">
                  <div style="font-weight:600; color:var(--text-primary);">${escapeHTML((sr.characters || []).join(' ↔ '))}</div>
                  ${sr.overlappingTriggers ? `<div style="color:#fde68a; margin-top:2px;"><strong>Overlapping Triggers:</strong> ${escapeHTML(sr.overlappingTriggers)}</div>` : ''}
                  <div style="color:var(--text-secondary); margin-top:2px;">${escapeHTML(sr.hypothesis)}</div>
                </div>
              `).join('')}
            </div>` : ''}
          ${voiceOverlaps.length > 0 ? `
            <div style="padding:10px 14px; border-radius:6px; border:1px solid rgba(56,189,248,0.4); background:rgba(56,189,248,0.07);">
              <div style="font-size:0.8rem; font-weight:700; color:#38bdf8; margin-bottom:6px;">
                🗣️ Voice & Characterization Overlap (${voiceOverlaps.length})
              </div>
              ${voiceOverlaps.map(vo => `
                <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed rgba(56,189,248,0.2); font-size:0.78rem;">
                  <div style="font-weight:600; color:var(--text-primary);">${escapeHTML((vo.characters || []).join(' ↔ '))}</div>
                  <div style="color:var(--text-secondary); margin-top:2px;"><strong>Shared Hooks:</strong> ${escapeHTML(vo.sharedTraits)}</div>
                  ${vo.suggestion ? `<div style="color:#86efac; margin-top:2px;"><strong>Differentiation:</strong> ${escapeHTML(vo.suggestion)}</div>` : ''}
                </div>
              `).join('')}
            </div>` : ''}
        </div>
      `;
    }

    // Filterable Ensemble Flags
    const filteredFlags = activeEnsembleLensFilter === 'ALL'
      ? flags
      : flags.filter(f => f.lens === activeEnsembleLensFilter);

    const flagsHTML = flags.length > 0 ? `
      <div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Ensemble Lens:</span>
          ${[
            { id: 'ALL', label: `All Findings (${flags.length})` },
            { id: 'spotlight', label: 'Spotlight Risk' },
            { id: 'voice', label: 'Voice Overlap' },
            { id: 'relationship', label: 'Relationship & Canon' },
            { id: 'instruction', label: 'Instruction & Scenario' }
          ].map(tab => `
            <button class="delphi-ens-lens-btn btn btn-secondary btn-sm" data-lens="${tab.id}" style="padding:2px 8px; font-size:0.72rem; ${activeEnsembleLensFilter === tab.id ? 'border-color:#a855f7; color:#d8b4fe;' : ''}">
              ${escapeHTML(tab.label)}
            </button>
          `).join('')}
        </div>
        ${filteredFlags.map(f => {
          const isCrit = f.severity === 'critical';
          const borderCol = isCrit ? '#ef4444' : '#f59e0b';
          const evList = Array.isArray(f.evidence) ? f.evidence : [];
          return `
            <div style="padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); border-left:3px solid ${borderCol}; background:rgba(255,255,255,0.02); margin-bottom:8px;">
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; padding:1px 6px; border-radius:4px; background:rgba(255,255,255,0.08); color:${borderCol};">
                  ${isCrit ? '🛑 CRITICAL' : '⚠️ WARNING'} · ${escapeHTML((f.lens || 'ensemble').toUpperCase())}
                </span>
                ${(f.components || []).map(c => `<span style="font-size:0.72rem; padding:1px 7px; border-radius:4px; background:rgba(168,85,247,0.15); color:#d8b4fe;">${escapeHTML(c)}</span>`).join('')}
                ${(f.failureModes || []).map(m => renderFailureModeBadge(m, true)).join('')}
              </div>
              <div style="font-size:0.84rem; color:var(--text-primary); font-weight:600; margin-bottom:4px;">
                ${escapeHTML(f.summary)}
              </div>
              ${evList.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:4px; margin:6px 0;">
                  ${evList.map(ev => `
                    <div class="delphi-evidence-quote ${ev.verified ? 'verified' : 'unverified'}">
                      <strong style="font-size:0.72rem; color:${ev.verified ? '#4ade80' : 'var(--text-muted)'}; margin-right:6px;">
                        ${ev.verified ? '🔍 Verified' : '⚪ Unlinked'} [${escapeHTML(ev.component || 'Component')}]:
                      </strong>
                      <span style="font-style:italic; color:${ev.verified ? '#fde68a' : 'var(--text-secondary)'};">"${escapeHTML(ev.quote)}"</span>
                    </div>
                  `).join('')}
                </div>` : ''}
              ${f.suggestion ? `<div style="font-size:0.78rem; color:#86efac; margin-top:4px;"><strong>Harmonization Suggestion:</strong> ${escapeHTML(f.suggestion)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <div style="padding:12px 14px; border-radius:6px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); color:#86efac; font-size:0.84rem;">
        🔮 No cross-component contradictions or spotlight competition flags reported across the examined ensemble.
      </div>
    `;

    body.innerHTML = `
      ${coverageBannerHTML}
      ${ensembleSpecialCardsHTML}
      ${flagsHTML}
      <div class="delphi-report-content">
        ${formatMarkdown(ens.report || 'No narrative report returned.')}
      </div>
    `;

    footer.innerHTML = `
      <button id="btn-delphi-ens-copy" class="btn btn-secondary">📋 Copy Ensemble Report</button>
      ${activeEnsembleRerunFn ? `<button id="btn-delphi-ens-rerun" class="btn btn-secondary">🔁 Re-run Ensemble Audit</button>` : ''}
      <button id="btn-delphi-close" class="btn btn-primary">Close</button>
    `;

    document.getElementById('btn-delphi-close')?.addEventListener('click', closeModal);
    body.querySelectorAll('.delphi-ens-lens-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeEnsembleLensFilter = e.currentTarget.getAttribute('data-lens') || 'ALL';
        renderEnsembleReport(ens);
      });
    });
    document.getElementById('btn-delphi-ens-rerun')?.addEventListener('click', async () => {
      if (!activeEnsembleRerunFn) return;
      body.innerHTML = `
        <div style="text-align:center; padding:48px 20px;">
          <div class="delphi-spinner"></div>
          <h4 style="margin:16px 0 6px 0; color:var(--text-primary);">Running Holistic Ensemble Audit…</h4>
        </div>`;
      try {
        const updated = await activeEnsembleRerunFn();
        if (updated) {
          activeEnsembleResult = updated;
          renderEnsembleReport(updated);
        }
      } catch (err) {
        body.innerHTML = `<div class="delphi-warning-banner">🛑 Ensemble audit failed: ${escapeHTML(err.message || err)}</div>`;
      }
    });
    document.getElementById('btn-delphi-ens-copy')?.addEventListener('click', async (e) => {
      const covNote = `Coverage: ${cov.status.toUpperCase()} (${(cov.included || []).length} full, ${(cov.truncated || []).length} truncated, ${(cov.omitted || []).length} omitted)`;
      const text = `Delphi Ensemble Diagnostic: ${ens.ensembleName || 'Ensemble'}\n${covNote}\nModel: ${ens.model}\nDate: ${ens.timestamp}\n\n${ens.report || ''}`;
      await navigator.clipboard.writeText(text);
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  }

  async function open(compId) {
    if (!compId) return;
    ensureModalDOM();
    returnToBatchDigest = false;

    try {
      const comp = await window.ForgeDB.getComponent(compId);
      if (!comp) {
        if (typeof showToast === 'function') showToast('Component not found', 'error');
        return;
      }
      activeComp = comp;
      viewedRunId = null;
      activeFailureModeFilter = 'ALL';
      modalEl.classList.remove('hidden');

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

  /**
   * Interactive Batch & Ensemble QA Hub — accessible from anywhere in the app
   */
  async function openBatchPicker() {
    ensureModalDOM();
    modalEl.classList.remove('hidden');

    const body = document.getElementById('delphi-modal-body');
    const footer = document.getElementById('delphi-modal-footer');
    if (!body || !footer) return;

    setModalHeader(
      '📦 Delphi v2 — Batch Reporting & Ensemble QA Hub',
      'Audit Golden Templates in batch or evaluate cross-character coherence & spotlight competition'
    );

    const allComps = await window.ForgeDB.getAllComponents();
    const auditable = allComps.filter(c => ['character', 'scenario', 'organization'].includes(c.category));
    const goldenComps = auditable.filter(c => c.isTemplate === true || c.tracker?.pipeline?.goldenTemplate === true);
    const modifiedComps = auditable.filter(c => {
      if (!c.delphi || !c.delphi.verdict) return false;
      if (c.delphi.contentHash && window.Delphi?.computeContentHash) {
        const liveHash = window.Delphi.computeContentHash(window.Delphi.buildComponentContentSnapshot(c));
        return liveHash !== c.delphi.contentHash;
      }
      const modTime = c.modifiedAt ? new Date(c.modifiedAt).getTime() : 0;
      const delphiTime = c.delphi.timestamp ? new Date(c.delphi.timestamp).getTime() : 0;
      return modTime > delphiTime;
    });
    const unrunComps = auditable.filter(c => !c.delphi || !c.delphi.verdict);
    const filteredSet = new Set(window._currentVaultFilteredIds || []);
    const filteredAuditable = auditable.filter(c => filteredSet.has(c.id));

    // Extract distinct Universes and Factions for Ensemble Audit
    const universes = [...new Set(allComps.map(c => (c.tracker?.universe || c.universe || '').trim()).filter(Boolean))].sort();
    const factions = [...new Set(allComps.map(c => (c.tracker?.faction || c.faction || '').trim()).filter(Boolean))].sort();
    const lineages = [...new Set(allComps.map(c => (c.lineage || '').trim()).filter(Boolean))].sort();

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:16px;">
        <!-- Phase 3: Batch Reporting Card -->
        <div style="padding:16px; border:1px solid rgba(168,85,247,0.4); border-radius:8px; background:rgba(168,85,247,0.05); display:flex; flex-direction:column; gap:12px;">
          <div>
            <h4 style="margin:0 0 4px 0; font-size:0.98rem; color:#d8b4fe;">📦 Batch Delphi Reporting (Independent Component Audits)</h4>
            <p style="margin:0; font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">
              Runs sequential, rate-safe Delphi diagnostics on each component independently, saving immutable v2 snapshots and failure mode classifications to each item and generating a Batch Summary Digest.
            </p>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn btn-secondary delphi-hub-batch-btn" data-preset="golden" style="justify-content:space-between; width:100%; padding:10px 14px;" ${goldenComps.length === 0 ? 'disabled' : ''}>
              <span>⭐ Audit All Golden Templates</span>
              <span class="mc-delphi-badge mc-delphi-ready">${goldenComps.length} item${goldenComps.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" class="btn btn-secondary delphi-hub-batch-btn" data-preset="modified" style="justify-content:space-between; width:100%; padding:10px 14px;" ${modifiedComps.length === 0 ? 'disabled' : ''}>
              <span>🔄 Audit Modified Since Last Delphi Run</span>
              <span class="mc-delphi-badge mc-delphi-warn">${modifiedComps.length} item${modifiedComps.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" class="btn btn-secondary delphi-hub-batch-btn" data-preset="unrun" style="justify-content:space-between; width:100%; padding:10px 14px;" ${unrunComps.length === 0 ? 'disabled' : ''}>
              <span>🔮 Audit All Unrun Components</span>
              <span class="mc-delphi-badge mc-delphi-none">${unrunComps.length} item${unrunComps.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" class="btn btn-secondary delphi-hub-batch-btn" data-preset="filtered" style="justify-content:space-between; width:100%; padding:10px 14px;" ${filteredAuditable.length === 0 ? 'disabled' : ''}>
              <span>📋 Audit Current Filtered Vault View</span>
              <span class="mc-delphi-badge mc-delphi-none">${filteredAuditable.length} item${filteredAuditable.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" class="btn btn-secondary delphi-hub-batch-btn" data-preset="all" style="justify-content:space-between; width:100%; padding:10px 14px;" ${auditable.length === 0 ? 'disabled' : ''}>
              <span>🗄️ Audit Entire Vault (Characters, Scenarios &amp; Orgs)</span>
              <span class="mc-delphi-badge mc-delphi-none">${auditable.length} item${auditable.length === 1 ? '' : 's'}</span>
            </button>
          </div>
        </div>

        <!-- Phase 4: Holistic Ensemble & Project Reporting Card -->
        <div style="padding:16px; border:1px solid rgba(56,189,248,0.4); border-radius:8px; background:rgba(56,189,248,0.05); display:flex; flex-direction:column; gap:12px;">
          <div>
            <h4 style="margin:0 0 4px 0; font-size:0.98rem; color:#38bdf8;">🎭 Holistic Ensemble &amp; Universe Audit</h4>
            <p style="margin:0; font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">
              Evaluates multiple characters, organizations, and scenarios <strong>together</strong> in a single holistic pass for Voice Overlap, Spotlight Competition Risk, Relationship Distortion, and Canon Coherence—with an explicit Coverage Manifest.
            </p>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; margin-top:4px;">
            <div>
              <label style="display:block; font-size:0.76rem; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Select Ensemble Scope:</label>
              <select id="delphi-hub-ensemble-scope" class="form-control" style="width:100%; font-size:0.82rem; padding:7px 10px; background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px;">
                <option value="filtered">📋 Current Filtered Vault View (${filteredAuditable.length} items)</option>
                <option value="golden">⭐ All Golden Templates (${goldenComps.length} items)</option>
                ${factions.map(f => {
                  const cnt = allComps.filter(c => (c.tracker?.faction || c.faction || '').trim() === f).length;
                  return `<option value="faction:${escapeHTML(f)}">🛡️ Faction: ${escapeHTML(f)} (${cnt} items)</option>`;
                }).join('')}
                ${universes.map(u => {
                  const cnt = allComps.filter(c => (c.tracker?.universe || c.universe || '').trim() === u).length;
                  return `<option value="universe:${escapeHTML(u)}">🌌 Universe: ${escapeHTML(u)} (${cnt} items)</option>`;
                }).join('')}
                ${lineages.map(l => {
                  const cnt = allComps.filter(c => (c.lineage || '').trim() === l).length;
                  return `<option value="lineage:${escapeHTML(l)}">🔗 Lineage: ${escapeHTML(l)} (${cnt} items)</option>`;
                }).join('')}
              </select>
            </div>
            <button type="button" id="btn-delphi-hub-run-ensemble" class="btn btn-primary" style="justify-content:center; width:100%; padding:10px 14px; background:linear-gradient(135deg, #0284c7, #7c3aed); border:none;">
              🎭 Run Holistic Ensemble Audit
            </button>
          </div>
        </div>
      </div>
    `;

    footer.innerHTML = `
      ${activeComp ? `<button id="btn-delphi-hub-back-comp" class="btn btn-secondary">← Back to ${escapeHTML(activeComp.name)}</button>` : ''}
      <button id="btn-delphi-hub-close" class="btn btn-ghost">Close</button>
    `;

    document.getElementById('btn-delphi-hub-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-delphi-hub-back-comp')?.addEventListener('click', () => {
      if (activeComp) open(activeComp.id);
    });

    body.querySelectorAll('.delphi-hub-batch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (preset === 'golden') openBatch(goldenComps.map(c => c.id), '⭐ Golden Templates Audit');
        else if (preset === 'modified') openBatch(modifiedComps.map(c => c.id), '🔄 Modified Since Last Delphi Run');
        else if (preset === 'unrun') openBatch(unrunComps.map(c => c.id), '🔮 Unrun Components Audit');
        else if (preset === 'filtered') openBatch(filteredAuditable.map(c => c.id), `📋 Filtered Vault List (${filteredAuditable.length})`);
        else if (preset === 'all') openBatch(auditable.map(c => c.id), `🗄️ Full Vault Batch Audit (${auditable.length})`);
      });
    });

    document.getElementById('btn-delphi-hub-run-ensemble')?.addEventListener('click', () => {
      const val = document.getElementById('delphi-hub-ensemble-scope')?.value || 'filtered';
      let targetComps = [];
      let title = 'Ensemble Audit';
      let scopeLabel = 'Ensemble';

      if (val === 'filtered') {
        targetComps = allComps.filter(c => filteredSet.has(c.id));
        title = `Filtered Vault Ensemble (${targetComps.length})`;
        scopeLabel = 'Filtered Vault Ensemble';
      } else if (val === 'golden') {
        targetComps = goldenComps;
        title = `Golden Templates Ensemble (${targetComps.length})`;
        scopeLabel = 'Golden Templates Ensemble';
      } else if (val.startsWith('faction:')) {
        const f = val.slice('faction:'.length);
        targetComps = allComps.filter(c => (c.tracker?.faction || c.faction || '').trim() === f);
        title = `Faction Ensemble: ${f}`;
        scopeLabel = `Faction: ${f}`;
      } else if (val.startsWith('universe:')) {
        const u = val.slice('universe:'.length);
        targetComps = allComps.filter(c => (c.tracker?.universe || c.universe || '').trim() === u);
        title = `Universe Ensemble: ${u}`;
        scopeLabel = `Universe: ${u}`;
      } else if (val.startsWith('lineage:')) {
        const l = val.slice('lineage:'.length);
        targetComps = allComps.filter(c => (c.lineage || '').trim() === l);
        title = `Lineage Ensemble: ${l}`;
        scopeLabel = `Lineage: ${l}`;
      }

      if (targetComps.length === 0) {
        alert('No components found in the selected scope.');
        return;
      }

      openEnsemble({
        componentIds: targetComps.map(c => c.id),
        title,
        scopeLabel
      });
    });
  }

  window.DelphiModal = {
    open,
    openBatch,
    openBatchPicker,
    openEnsemble,
    runDiagnostic,
    runComparison
  };
})();
