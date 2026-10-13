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
    "coherence": "<one line>",
    "dominance": "<one line>",
    "triggers": "<one line>"
  }
}`;

  const SYSTEM_PROMPT_ASSEMBLED = `You are auditing an assembled chatbot card for production coherence across its staged components.
Do not roleplay as any character. You are evaluating the complete assembled card definition.

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
      "summary": "<one line description>",
      "suggestion": "<actionable fix>"
    }
  ]
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
      const { coherence, dominance, triggers } = parsed.dimensions;
      if (coherence === 'fail' || dominance === 'fail' || triggers === 'fail') {
        verdict = 'FAIL';
      } else if (coherence === 'flag' || dominance === 'flag' || triggers === 'flag') {
        verdict = 'NEEDS WORK';
      } else {
        verdict = 'READY';
      }
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
    parseVerdict,
    parseAssembledVerdict
  };
})();
