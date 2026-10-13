/**
 * delphi.js - Delphi QA Diagnostic Engine for Anansi Forge
 *
 * Provides structured character design & prompt coherence audits.
 * Operates as a QA gate in the Forge pipeline (never a roleplayer).
 *
 * Exposes window.Delphi = {
 *   diagnoseComponent,
 *   diagnoseAssembled,
 *   parseVerdict
 * };
 */

(() => {
  'use strict';

  const SYSTEM_PROMPT_COMPONENT = `You are a character design analyst auditing a chatbot component for production use.
Do not roleplay as the character. You are evaluating the definition below — not performing it.

SEVERITY CALIBRATION RULES:
- PASS: No material defect identified.
- FLAG: A plausible risk, ambiguous interpretation, or concern that requires author judgment or behavioral testing.
- FAIL: A clear defect supported by specific quoted wording and an explained consequence that directly undermines the component's stated purpose.

IMPORTANT EVALUATION PRINCIPLES:
- Contrasting traits, situational behavior, intentional tension, and room for character development are NOT inherently defects. Assess whether the definition explains how they coexist.
- If authorial intent is inferred rather than explicitly stated, label that inference. Uncertainty about intent must NOT by itself produce FAIL.
- For every FLAG or FAIL, you MUST cite the relevant wording and explain the likely behavioral consequence.
- When evidence is insufficient, use FLAG rather than FAIL.

Analyze the definition and return TWO parts.

PART 1 — a markdown diagnostic with these sections:

1. DOMINANCE — Rank the traits and descriptors by how strongly they shape behavior,
   strongest first, with a 1–10 signal strength for each. Flag any trait that dominates
   contrary to apparent authorial intent, and note WHY it dominates (wording, placement,
   repetition, emotional weight).

2. CONTRADICTIONS — List competing trait pairs. For each: which wins in ambiguous
   situations, and what evidence in the wording decides it?

3. TRIGGERS — Flag phrases likely to cause unintended behavioral pulls with current LLMs:
   sycophantic positivity, instruction-hierarchy confusion (persona instructions fighting
   system-style instructions), persona drift risks over multi-turn conversation, over-literal
   readings of figurative traits. For each: the mechanism and an alternative phrasing.

4. REWORDINGS — BEFORE/AFTER for each fix, with a one-line rationale per pair.

PART 2 — after the markdown, a \`\`\`json block with EXACTLY this shape and nothing else outside it:
{
  "coherence": "pass|flag|fail",
  "dominance": "pass|flag|fail",
  "triggers": "pass|flag|fail",
  "notes": {
    "coherence": "<one line citing reason/evidence>",
    "dominance": "<one line citing reason/evidence>",
    "triggers": "<one line citing reason/evidence>"
  }
}`;

  const SYSTEM_PROMPT_ASSEMBLED = `You are auditing an assembled chatbot card for production coherence across its staged components.
Do not roleplay as any character. You are evaluating the complete assembled card definition.

SEVERITY CALIBRATION RULES:
- PASS: No material defect identified across assembled components.
- WARNING: A plausible risk, ambiguous interpretation, or concern that requires author judgment or behavioral testing.
- CRITICAL: A clear defect supported by specific quoted wording and an explained consequence that directly undermines the assembled card's purpose.

IMPORTANT EVALUATION PRINCIPLES:
- Contrasting dynamics, situational tension, and complex relationships are NOT inherently defects. If authorial intent is inferred, label that inference.
- For every WARNING or CRITICAL flag, cite the relevant wording and explain the likely behavioral consequence. When evidence is insufficient, use WARNING rather than CRITICAL.

Analyze the assembled components, mappings, and relationships. Return TWO parts:

PART 1 — a markdown diagnostic evaluating:
1. CROSS-COMPONENT CONTRADICTIONS — traits in different components that fight (which wins, what wording decides it).
2. SCENARIO/PERSONALITY TENSION — does the scenario's pull fight any character's dominant traits?
3. RELATIONSHIP TENSION — do declared dynamics contradict any component's traits?
4. REWORDINGS & HARMONIZATIONS — specific text edits to harmonize the prompt.

PART 2 — after the markdown, a \`\`\`json block with EXACTLY this shape:
{
  "flags": [
    {
      "severity": "warning|critical",
      "components": ["<name>", "..."],
      "summary": "<one line description citing wording>",
      "suggestion": "<actionable fix>"
    }
  ]
}`;

  const SYSTEM_PROMPT_CROSS_MODEL_COMPARISON = `You are an expert character prompt analyst comparing two independent diagnostic audits produced by two different LLMs for the same chatbot component.

Compare the models' findings and cited wording, not only their dimension labels.

CRITERIA:
- "pass": Both models identify substantially compatible behavioral interpretations. Minor differences in emphasis or verdict labels do not affect the intended characterization.
- "flag": The models identify materially different interpretations, disagree about a defect, or provide insufficient evidence to resolve the difference. Report the disputed wording, each interpretation, and its potential behavioral consequence.

RULES:
- Cross-model disagreement alone must NEVER produce "fail". The verdict for crossModel can ONLY be "pass" or "flag". A substantive defect remains recorded under coherence, dominance, or triggers.
- If flagging, you MUST report:
  1. The disputed wording from the component definition.
  2. Each model's interpretation.
  3. The potential behavioral consequence in roleplay / LLM execution.
- If passing, explain why differences are minor, compatible, or variations in emphasis.

Return TWO parts:

PART 1 — a markdown comparative analysis:
### Cross-Model Comparison & Synthesis
[Compare the models' findings, cited wording, and behavioral consequences]

[If divergent interpretations exist, include this section:]
#### Disputed Wording & Divergent Interpretations
- **Disputed Wording**: "[exact quoted text from component]"
  - **Model 1 Interpretation**: [how model 1 read it]
  - **Model 2 Interpretation**: [how model 2 read it]
  - **Behavioral Consequence**: [how this alters character behavior in roleplay]

PART 2 — after the markdown, a \`\`\`json block with EXACTLY this shape and nothing else:
{
  "crossModel": "pass|flag",
  "summary": "<one line summary of agreement or divergence>",
  "disputedWording": ["<quote 1>", ...],
  "consequence": "<behavioral consequence if flagged, or null>"
}`;

  /**
   * Parse the structured JSON verdict block from the LLM output.
   * Returns { report: string, dimensions: object|null, notes: object|null }
   */
  function parseVerdict(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { report: '', dimensions: null, notes: null };
    }

    // Match the last ```json ... ``` block or ``` ... ``` containing json
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match;
    let lastMatch = null;
    while ((match = jsonBlockRegex.exec(raw)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) {
      return { report: raw, dimensions: null, notes: null };
    }

    const jsonText = lastMatch[1].trim();
    const beforeBlock = raw.substring(0, lastMatch.index).trim();
    const afterBlock = raw.substring(lastMatch.index + lastMatch[0].length).trim();
    const reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();

    try {
      const data = JSON.parse(jsonText);
      const validValues = ['pass', 'flag', 'fail'];
      const c = String(data.coherence || '').toLowerCase().trim();
      const d = String(data.dominance || '').toLowerCase().trim();
      const t = String(data.triggers || '').toLowerCase().trim();

      if (!validValues.includes(c) || !validValues.includes(d) || !validValues.includes(t)) {
        return { report: raw, dimensions: null, notes: null };
      }

      const notes = {
        coherence: typeof data.notes?.coherence === 'string' ? data.notes.coherence.trim() : '',
        dominance: typeof data.notes?.dominance === 'string' ? data.notes.dominance.trim() : '',
        triggers: typeof data.notes?.triggers === 'string' ? data.notes.triggers.trim() : ''
      };

      return {
        report: reportText,
        dimensions: {
          coherence: c,
          dominance: d,
          triggers: t
        },
        notes
      };
    } catch (_) {
      return { report: raw, dimensions: null, notes: null };
    }
  }

  /**
   * Parse assembled coherence flags from assembled card diagnostic.
   */
  function parseAssembledVerdict(raw) {
    if (typeof raw !== 'string') return { report: '', flags: [] };

    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match;
    let lastMatch = null;
    while ((match = jsonBlockRegex.exec(raw)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) return { report: raw, flags: [] };

    const jsonText = lastMatch[1].trim();
    const beforeBlock = raw.substring(0, lastMatch.index).trim();
    const afterBlock = raw.substring(lastMatch.index + lastMatch[0].length).trim();
    const reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();

    try {
      const data = JSON.parse(jsonText);
      const flags = Array.isArray(data.flags) ? data.flags.map(f => ({
        severity: f.severity === 'critical' ? 'critical' : 'warning',
        components: Array.isArray(f.components) ? f.components.map(String) : [],
        summary: String(f.summary || '').trim(),
        suggestion: String(f.suggestion || '').trim()
      })) : [];

      return { report: reportText, flags };
    } catch (_) {
      return { report: raw, flags: [] };
    }
  }

  /**
   * Run Delphi diagnostic on a single component.
   * Returns { report, dimensions, notes, verdict, model, provider, raw }
   */
  async function diagnoseComponent(compId, overrideConfig = null) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp) {
      throw new Error(`Component with ID "${compId}" was not found.`);
    }

    // Build tagged blocks
    let userMsg = `[COMPONENT]\nname: ${comp.name || 'Untitled'}\ncategory: ${comp.category || 'character'}\n\n`;

    if (comp.category === 'character') {
      userMsg += `[PERSONALITY]\n${comp.content || ''}\n\n`;
      if (Array.isArray(comp.scenarios) && comp.scenarios.length > 0) {
        userMsg += `[SCENARIO]\n${comp.scenarios.join('\n\n')}\n\n`;
      }
    } else if (comp.category === 'scenario') {
      userMsg += `[SCENARIO]\n${comp.content || ''}\n\n`;
    } else if (comp.category === 'bio') {
      userMsg += `[BIO]\n${comp.content || ''}\n\n`;
    } else if (comp.category === 'initial_message') {
      userMsg += `[INITIAL MESSAGE]\n${comp.content || ''}\n\n`;
    } else {
      userMsg += `[CONTENT]\n${comp.content || ''}\n\n`;
    }

    const baseConfig = overrideConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const execConfig = { ...baseConfig, temperature: 0.3 };

    if (!window.ForgeLLM || typeof window.ForgeLLM.generate !== 'function') {
      throw new Error('ForgeLLM service is not available.');
    }

    const raw = await window.ForgeLLM.generate(
      SYSTEM_PROMPT_COMPONENT,
      [{ role: 'user', content: userMsg.trim() }],
      execConfig
    );

    const parsed = parseVerdict(raw);
    let verdict = null;

    if (parsed.dimensions) {
      verdict = computeOverallVerdict(parsed.dimensions, 'unrun');
    }

    return {
      report: parsed.report,
      dimensions: parsed.dimensions ? { ...parsed.dimensions, crossModel: 'unrun' } : null,
      notes: parsed.notes || {},
      verdict,
      model: execConfig.model || 'unknown',
      provider: execConfig.provider || 'unknown',
      raw
    };
  }

  /**
   * Parse comparison synthesis output.
   */
  function parseComparison(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { report: '', crossModel: 'flag', summary: 'No output received.', disputedWording: [], consequence: null };
    }

    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match;
    let lastMatch = null;
    while ((match = jsonBlockRegex.exec(raw)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) {
      return { report: raw, crossModel: 'flag', summary: 'Cross-model comparison returned unstructured analysis.', disputedWording: [], consequence: null };
    }

    const jsonText = lastMatch[1].trim();
    const beforeBlock = raw.substring(0, lastMatch.index).trim();
    const afterBlock = raw.substring(lastMatch.index + lastMatch[0].length).trim();
    const reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();

    try {
      const data = JSON.parse(jsonText);
      const rawC = String(data.crossModel || '').toLowerCase().trim();
      // Bradley/User rule: Cross-model disagreement alone must never produce 'fail'.
      // Only 'pass' or 'flag' are permitted.
      const crossModel = rawC === 'pass' ? 'pass' : 'flag';
      const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
      const disputedWording = Array.isArray(data.disputedWording) ? data.disputedWording.map(String) : [];
      const consequence = typeof data.consequence === 'string' && data.consequence.trim() ? data.consequence.trim() : null;

      return {
        report: reportText,
        crossModel,
        summary,
        disputedWording,
        consequence
      };
    } catch (_) {
      return { report: raw, crossModel: 'flag', summary: 'Could not parse JSON verdict block.', disputedWording: [], consequence: null };
    }
  }

  /**
   * Compute overall verdict following the exact amended spec:
   * - FAIL if a primary diagnostic dimension is fail.
   * - Otherwise NEEDS WORK if a primary dimension or crossModel is flag.
   * - Otherwise READY.
   */
  function computeOverallVerdict(primaryDimensions, crossModel = 'unrun') {
    if (!primaryDimensions) return 'NEEDS WORK';
    const { coherence, dominance, triggers } = primaryDimensions;
    // FAIL if a primary diagnostic dimension is fail
    if (coherence === 'fail' || dominance === 'fail' || triggers === 'fail') {
      return 'FAIL';
    }
    // Otherwise NEEDS WORK if a primary dimension or crossModel is flag
    if (coherence === 'flag' || dominance === 'flag' || triggers === 'flag' || crossModel === 'flag') {
      return 'NEEDS WORK';
    }
    // Otherwise READY
    return 'READY';
  }

  /**
   * Run cross-model comparison for a component.
   */
  async function runCrossModelComparison(compId, options = {}) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp) {
      throw new Error(`Component "${compId}" was not found.`);
    }

    const primaryConfig = options.primaryConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const secondaryConfig = options.secondaryConfig || (window.ForgeLLM && window.ForgeLLM.getSecondaryConfig ? window.ForgeLLM.getSecondaryConfig() : null);

    if (!secondaryConfig || !secondaryConfig.provider) {
      throw new Error('No secondary model is configured in API settings.');
    }

    // 1. Ensure primary diagnostic exists or run it
    let primaryResult = options.primaryResult || null;
    if (!primaryResult) {
      if (comp.delphi && comp.delphi.dimensions && comp.delphi.report) {
        primaryResult = comp.delphi;
      } else {
        primaryResult = await diagnoseComponent(compId, primaryConfig);
      }
    }

    // 2. Run diagnostic with secondary model
    const secondaryResult = await diagnoseComponent(compId, secondaryConfig);

    // 3. Run cross-model comparison analysis
    const model1Name = `${primaryResult.provider || primaryConfig.provider || 'primary'} / ${primaryResult.model || primaryConfig.model || 'model'}`;
    const model2Name = `${secondaryResult.provider || secondaryConfig.provider || 'secondary'} / ${secondaryResult.model || secondaryConfig.model || 'model'}`;

    let comparisonPromptUser = `[COMPONENT DEFINITION]\nname: ${comp.name}\ncategory: ${comp.category}\ncontent:\n${comp.content || ''}\n\n`;
    comparisonPromptUser += `=== MODEL 1 (${model1Name}) DIAGNOSTIC ===\n${primaryResult.report || ''}\n\n`;
    comparisonPromptUser += `Dimensions: coherence=${primaryResult.dimensions?.coherence}, dominance=${primaryResult.dimensions?.dominance}, triggers=${primaryResult.dimensions?.triggers}\n\n`;
    comparisonPromptUser += `=== MODEL 2 (${model2Name}) DIAGNOSTIC ===\n${secondaryResult.report || ''}\n\n`;
    comparisonPromptUser += `Dimensions: coherence=${secondaryResult.dimensions?.coherence}, dominance=${secondaryResult.dimensions?.dominance}, triggers=${secondaryResult.dimensions?.triggers}\n\n`;

    let comparisonRaw = '';
    let comparisonParsed = null;

    try {
      comparisonRaw = await window.ForgeLLM.generate(
        SYSTEM_PROMPT_CROSS_MODEL_COMPARISON,
        [{ role: 'user', content: comparisonPromptUser }],
        { ...primaryConfig, temperature: 0.3 }
      );
      comparisonParsed = parseComparison(comparisonRaw);
    } catch (cmpErr) {
      console.warn('[Delphi] Comparison synthesis LLM call failed, falling back to heuristic:', cmpErr);
      const pDims = primaryResult.dimensions || {};
      const sDims = secondaryResult.dimensions || {};
      const dimsAgree = pDims.coherence === sDims.coherence && pDims.dominance === sDims.dominance && pDims.triggers === sDims.triggers;
      comparisonParsed = {
        crossModel: dimsAgree ? 'pass' : 'flag',
        summary: dimsAgree
          ? `Both ${model1Name} and ${model2Name} returned compatible dimension ratings.`
          : `Material difference between ${model1Name} and ${model2Name} findings.`,
        disputedWording: [],
        consequence: null,
        report: `### Cross-Model Comparison\n\n- **${model1Name}**: Coherence=${pDims.coherence}, Dominance=${pDims.dominance}, Triggers=${pDims.triggers}\n- **${model2Name}**: Coherence=${sDims.coherence}, Dominance=${sDims.dominance}, Triggers=${sDims.triggers}`
      };
    }

    const crossModelDim = comparisonParsed.crossModel === 'pass' ? 'pass' : 'flag';
    const overallVerdict = computeOverallVerdict(primaryResult.dimensions, crossModelDim);

    const prevDelphi = comp.delphi || {};
    const history = Array.isArray(prevDelphi.history) ? [...prevDelphi.history] : [];
    if (prevDelphi.verdict) {
      history.unshift({
        verdict: prevDelphi.verdict,
        timestamp: prevDelphi.timestamp || new Date().toISOString(),
        model: prevDelphi.model || primaryResult.model
      });
      if (history.length > 10) history.length = 10;
    }

    const delphiRecord = {
      verdict: overallVerdict,
      dimensions: {
        coherence: primaryResult.dimensions.coherence,
        dominance: primaryResult.dimensions.dominance,
        triggers: primaryResult.dimensions.triggers,
        crossModel: crossModelDim
      },
      notes: {
        ...(primaryResult.notes || {}),
        crossModel: comparisonParsed.summary || `${model1Name} vs ${model2Name}`
      },
      model: primaryResult.model || primaryConfig.model || 'primary',
      provider: primaryResult.provider || primaryConfig.provider || 'primary',
      comparedModel: secondaryResult.model || secondaryConfig.model || 'secondary',
      comparedProvider: secondaryResult.provider || secondaryConfig.provider || 'secondary',
      timestamp: new Date().toISOString(),
      report: primaryResult.report,
      secondaryReport: secondaryResult.report,
      secondaryDimensions: secondaryResult.dimensions,
      secondaryNotes: secondaryResult.notes,
      comparisonReport: comparisonParsed.report,
      comparisonData: {
        summary: comparisonParsed.summary,
        disputedWording: comparisonParsed.disputedWording || [],
        consequence: comparisonParsed.consequence || null
      },
      history
    };

    comp.delphi = delphiRecord;
    await window.ForgeDB.saveComponent(comp);

    window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
      detail: { id: comp.id, verdict: overallVerdict }
    }));

    return delphiRecord;
  }

  /**
   * Run Delphi diagnostic on an assembled card payload.
   * payload: { stagedComponents: Array, mappings: Object, relationships: Array, contentOverrides: Object }
   */
  async function diagnoseAssembled(payload = {}, overrideConfig = null) {
    const {
      stagedComponents = [],
      mappings = {},
      relationships = [],
      contentOverrides = {}
    } = payload;

    if (stagedComponents.length === 0) {
      throw new Error('Please stage at least one component before running assembled coherence.');
    }

    let userMsg = `[ASSEMBLED CARD SPECIFICATION]\nTotal Staged Components: ${stagedComponents.length}\n\n`;

    stagedComponents.forEach((comp, idx) => {
      const field = mappings[comp.id] || 'personality';
      const content = contentOverrides[comp.id] !== undefined ? contentOverrides[comp.id] : (comp.content || '');
      userMsg += `--- [COMPONENT ${idx + 1}: ${comp.name} (${comp.category || 'character'})] ---\n`;
      userMsg += `Mapped Character Card Field: ${field}\n`;
      userMsg += `Content:\n${content.trim()}\n\n`;
    });

    if (relationships && relationships.length > 0) {
      userMsg += `[CAST RELATIONSHIPS]\n`;
      relationships.forEach(rel => {
        const source = stagedComponents.find(c => c.id === rel.sourceId)?.name || 'Source';
        const target = rel.targetId === '{{User}}' ? '{{User}}' : (stagedComponents.find(c => c.id === rel.targetId)?.name || 'Target');
        userMsg += `- ${source} → ${target}: ${rel.dynamic || 'Unspecified dynamic'}\n`;
      });
      userMsg += `\n`;
    }

    const baseConfig = overrideConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const execConfig = { ...baseConfig, temperature: 0.3 };

    if (!window.ForgeLLM || typeof window.ForgeLLM.generate !== 'function') {
      throw new Error('ForgeLLM service is not available.');
    }

    const raw = await window.ForgeLLM.generate(
      SYSTEM_PROMPT_ASSEMBLED,
      [{ role: 'user', content: userMsg.trim() }],
      execConfig
    );

    const parsed = parseAssembledVerdict(raw);
    const perComponent = stagedComponents.map(c => ({
      id: c.id,
      name: c.name,
      verdict: c.delphi?.verdict || null
    }));

    return {
      report: parsed.report,
      flags: parsed.flags,
      perComponent,
      timestamp: new Date().toISOString(),
      model: execConfig.model || 'unknown',
      provider: execConfig.provider || 'unknown',
      raw
    };
  }

  window.Delphi = {
    diagnoseComponent,
    diagnoseAssembled,
    runCrossModelComparison,
    parseVerdict,
    parseAssembledVerdict,
    parseComparison,
    computeOverallVerdict
  };
})();
