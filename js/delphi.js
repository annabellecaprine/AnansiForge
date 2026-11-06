/**
 * delphi.js - Delphi QA Diagnostic Engine for Anansi Forge (v2)
 *
 * Provides structured character design & prompt coherence audits.
 * Operates as an interpretive QA gate in the Forge pipeline (never a roleplayer).
 *
 * Epistemic Principle:
 * Delphi examines static definitions and surfaces interpretive risk hypotheses
 * (what warrants investigation or testing in AnansiWorkbench), not deterministic
 * behavioral predictions.
 */

(() => {
  'use strict';

  /**
   * 9 Interpretive Failure Mode Hypotheses
   */
  const FAILURE_MODES = {
    SYCOPHANCY_TRAP: {
      code: 'SYCOPHANCY_TRAP',
      label: 'Sycophancy Trap',
      shortLabel: 'Sycophancy',
      description: 'Wording that may incline a model toward over-compliance, validation-seeking, or losing spine toward {{User}}.',
      color: '#f472b6'
    },
    TRAIT_ECLIPSE: {
      code: 'TRAIT_ECLIPSE',
      label: 'Trait Eclipse',
      shortLabel: 'Trait Eclipse',
      description: 'High-salience descriptors that risk overshadowing quieter, conditional, or nuanced secondary traits.',
      color: '#c084fc'
    },
    UNRESOLVED_POLARITY: {
      code: 'UNRESOLVED_POLARITY',
      label: 'Unresolved Polarity',
      shortLabel: 'Polarity',
      description: 'Competing traits (e.g., ruthless vs. tender) that lack situational triggers explaining when each applies.',
      color: '#fbbf24'
    },
    INSTRUCTION_LEAK: {
      code: 'INSTRUCTION_LEAK',
      label: 'Instruction Leak',
      shortLabel: 'Instruction Leak',
      description: 'Meta-instructions, formatting rules, or narrator directives that risk contaminating in-character voice or behavior.',
      color: '#f87171'
    },
    SCENARIO_LOCK: {
      code: 'SCENARIO_LOCK',
      label: 'Scenario Lock',
      shortLabel: 'Scenario Lock',
      description: 'Core characterization tied so tightly to an opening scene that behavior may stall or drift once the scene advances.',
      color: '#fb923c'
    },
    PASSIVE_AGENCY: {
      code: 'PASSIVE_AGENCY',
      label: 'Passive Agency',
      shortLabel: 'Passive Agency',
      description: 'Reactive-only phrasing that risks leaving the character waiting on {{User}} to initiate action.',
      color: '#94a3b8'
    },
    UNSUPPORTED_INFERENCE: {
      code: 'UNSUPPORTED_INFERENCE',
      label: 'Unsupported Inference',
      shortLabel: 'Unsupported Inference',
      description: 'Phrasing that encourages inventing unestablished observations, physical cues, emotions, or motivations during play.',
      color: '#38bdf8'
    },
    RELATIONSHIP_DISTORTION: {
      code: 'RELATIONSHIP_DISTORTION',
      label: 'Relationship Distortion',
      shortLabel: 'Relationship Distortion',
      description: 'Wording that risks misreading, flattening, or exaggerating interpersonal dynamics.',
      color: '#f43f5e'
    },
    CAPABILITY_MISINTERPRETATION: {
      code: 'CAPABILITY_MISINTERPRETATION',
      label: 'Capability Misinterpretation',
      shortLabel: 'Capability Scope',
      description: 'Ambiguous scope, limits, or application of skills, powers, authority, or knowledge.',
      color: '#34d399'
    }
  };

  const SYSTEM_PROMPT_COMPONENT = `You are a character design analyst auditing a chatbot component definition for interpretive risks.
Do not roleplay as the character. You are evaluating the static definition below — not performing it.

SEVERITY CALIBRATION RULES:
- PASS: No material interpretive defect identified.
- FLAG: A plausible interpretive risk, ambiguity, or behavioral pull hypothesis that warrants author review or testing in AnansiWorkbench.
- FAIL: A clear structural contradiction or defect supported by verbatim quoted wording that directly undermines the component's apparent purpose.

IMPORTANT EVALUATION PRINCIPLES:
- Findings are interpretive risk hypotheses, not guaranteed runtime outcomes. Frame consequences as likely model tendencies rather than certainties.
- Contrasting traits, situational behavior, intentional tension, and room for character development are NOT inherently defects. Assess whether the definition explains how they coexist.
- If authorial intent is inferred rather than explicitly stated, label that inference. Uncertainty about intent must NOT by itself produce FAIL.
- For every FLAG or FAIL finding, you MUST provide verbatim substring quotes copied directly from the definition (do not paraphrase or use "..." inside a quote; if a contradiction spans two separate statements, include both as separate strings in the "quotes" array).
- Classify each finding using one or more of these 9 Failure Mode codes:
  * SYCOPHANCY_TRAP (over-compliance or losing spine toward {{User}})
  * TRAIT_ECLIPSE (intense descriptors overshadowing nuanced secondary traits)
  * UNRESOLVED_POLARITY (competing traits lacking situational triggers for when each applies)
  * INSTRUCTION_LEAK (meta-instructions or narrator rules contaminating character voice/behavior)
  * SCENARIO_LOCK (characterization over-fitted to an initial scene, risking drift when plot advances)
  * PASSIVE_AGENCY (reactive-only traits leaving character waiting on {{User}})
  * UNSUPPORTED_INFERENCE (encouraging invention of unestablished observations, physical cues, emotions, or hidden motives)
  * RELATIONSHIP_DISTORTION (misreading, flattening, or exaggerating interpersonal dynamics)
  * CAPABILITY_MISINTERPRETATION (ambiguous scope, limits, or application of skills, powers, or knowledge)

Analyze the definition and return TWO parts:

PART 1 — a \`\`\`json block with the structured verdict ratings FIRST:
\`\`\`json
{
  "coherence": "pass|flag|fail",
  "dominance": "pass|flag|fail",
  "triggers": "pass|flag|fail",
  "notes": {
    "coherence": "<one line citing reason/evidence>",
    "dominance": "<one line citing reason/evidence>",
    "triggers": "<one line citing reason/evidence>"
  },
  "traitDominance": [
    { "trait": "<trait or descriptor>", "strength": 8, "note": "<brief interpretive signal note>" }
  ],
  "findings": [
    {
      "dimension": "coherence|dominance|triggers",
      "severity": "flag|fail",
      "failureModes": ["UNRESOLVED_POLARITY"],
      "quotes": ["<exact verbatim substring 1>", "<exact verbatim substring 2 if multi-passage>"],
      "hypothesis": "<how an LLM may interpret these passages and why it warrants review>",
      "suggestion": "<optional concrete wording adjustment>"
    }
  ]
}
\`\`\`

PART 2 — a focused markdown diagnostic explaining the findings:

1. DOMINANCE — Rank traits and descriptors by behavioral signal strength (1–10). Note any trait that risks overshadowing others contrary to apparent authorial intent and why.
2. CONTRADICTIONS & POLARITIES — List competing trait pairs, which is likely to dominate in ambiguous situations, and cited verbatim wording evidence.
3. INTERPRETIVE TRIGGERS & RISKS — Flag phrases that may cause unintended behavioral pulls (sycophancy, unsupported inference, relationship distortion, capability misinterpretation, instruction leak, scenario lock, passive agency) with mechanisms and alternative phrasings.
4. REWORDINGS — Specific BEFORE/AFTER improvements with a one-line rationale per pair.

Keep markdown explanations concise, direct, and grounded in exact quoted wording.`;

  const SYSTEM_PROMPT_ASSEMBLED = `You are auditing an assembled multi-component chatbot card or character ensemble for interpretive coherence across its components.
Do not roleplay as any character. You are evaluating the static definitions and shared context together.

SEVERITY CALIBRATION RULES:
- PASS: No material cross-component defect identified.
- WARNING: A plausible interpretive risk, voice overlap, or spotlight competition risk that warrants author review or testing.
- CRITICAL: A direct contradiction across components, relationship definitions, or shared rules supported by verbatim quoted wording.

IMPORTANT EVALUATION PRINCIPLES:
- Findings are interpretive hypotheses, not deterministic runtime predictions.
- SHARED CONTEXT RULE: Evaluate individual characters in light of any supplied [ORGANIZATION] or [SCENARIO] components. Do NOT flag a character for omitting world rules, faction hierarchy, or setting assumptions that are already supplied in a shared Organization or Scenario component.
- SPOTLIGHT COMPETITION RISK: Do not assume a character with high trait intensity automatically silences a quieter character. Instead, identify specific overlapping behavioral triggers (e.g., multiple characters defined to always speak first, interrupt, dominate dialogue, or seize scene control) that create spotlight competition risk.
- For every WARNING or CRITICAL finding, provide exact verbatim substring quotes from the relevant component(s) without paraphrasing or eliding with "...".
- Tag each finding with one or more Failure Mode codes where applicable:
  SYCOPHANCY_TRAP, TRAIT_ECLIPSE, UNRESOLVED_POLARITY, INSTRUCTION_LEAK, SCENARIO_LOCK, PASSIVE_AGENCY, UNSUPPORTED_INFERENCE, RELATIONSHIP_DISTORTION, CAPABILITY_MISINTERPRETATION.

Return TWO parts:

PART 1 — a \`\`\`json block with the structured ensemble analysis FIRST:
\`\`\`json
{
  "flags": [
    {
      "severity": "warning|critical",
      "lens": "spotlight|voice|relationship|instruction",
      "failureModes": ["RELATIONSHIP_DISTORTION"],
      "components": ["<Component Name 1>", "<Component Name 2>"],
      "evidence": [
        { "component": "<Component Name 1>", "quote": "<exact verbatim substring from Component 1>" },
        { "component": "<Component Name 2>", "quote": "<exact verbatim substring from Component 2>" }
      ],
      "summary": "<one line description of the cross-component interpretive risk>",
      "suggestion": "<actionable harmonization edit>"
    }
  ],
  "spotlightRisks": [
    {
      "characters": ["<Char A>", "<Char B>"],
      "overlappingTriggers": "<specific overlapping triggers or conversational pulls>",
      "hypothesis": "<how these triggers may compete for scene spotlight>"
    }
  ],
  "voiceOverlaps": [
    {
      "characters": ["<Char A>", "<Char B>"],
      "sharedTraits": "<shared speech cadences, vocabulary crutches, or attitudes>",
      "suggestion": "<how to differentiate their voices>"
    }
  ]
}
\`\`\`

PART 2 — a focused markdown diagnostic evaluating:
1. SPOTLIGHT COMPETITION RISKS — Overlapping conversational or agency triggers across cast members.
2. VOICE & CHARACTERIZATION OVERLAP — Indistinct cadences, attitudes, or hooks that risk blending characters together.
3. RELATIONSHIP & CANON CONSISTENCY — Alignment across declared relationships, character definitions, and shared Organization/Scenario lore.
4. INSTRUCTION & SCENARIO HARMONIZATION — Specific text edits to resolve cross-component friction.

Keep markdown concise, direct, and grounded in verbatim quoted wording.`;

  const SYSTEM_PROMPT_CROSS_MODEL_COMPARISON = `You are an expert character prompt analyst comparing two independent diagnostic audits produced by two different LLMs for the same chatbot component.

Compare the models' findings and cited wording, not only their dimension labels.

CRITERIA:
- "pass": Both models identify substantially compatible behavioral interpretations. Minor differences in emphasis or verdict labels do not affect the intended characterization.
- "flag": The models identify materially different interpretations, disagree about a defect, or provide insufficient evidence to resolve the difference. Report the disputed wording, each interpretation, and its potential behavioral consequence.

RULES:
- Cross-model disagreement alone must NEVER produce "fail". The verdict for crossModel can ONLY be "pass" or "flag". A substantive defect remains recorded under coherence, dominance, or triggers.
- If flagging, you MUST report:
  1. The exact disputed wording from the component definition.
  2. Each model's interpretation.
  3. The potential behavioral consequence in roleplay / LLM execution.
- If passing, explain why differences are minor, compatible, or variations in emphasis.

Return TWO parts:

PART 1 — a \`\`\`json block with the comparison verdict ratings FIRST:
\`\`\`json
{
  "crossModel": "pass|flag",
  "summary": "<one line summary of agreement or divergence>",
  "disputedWording": ["<exact quote 1>"],
  "consequence": "<behavioral consequence if flagged, or null>"
}
\`\`\`

PART 2 — a focused markdown comparative analysis:
### Cross-Model Comparison & Synthesis
[Compare the models' findings, cited wording, and behavioral consequences]

[If divergent interpretations exist, include this section:]
#### Disputed Wording & Divergent Interpretations
- **Disputed Wording**: "[exact quoted text from component]"
  - **Model 1 Interpretation**: [how model 1 read it]
  - **Model 2 Interpretation**: [how model 2 read it]
  - **Behavioral Consequence**: [how this alters character behavior in roleplay]

Keep markdown concise and focused on cited evidence.`;

  const SYSTEM_PROMPT_VERSION_DELTA = `You are a character prompt analyst performing a symmetric comparison between two complete versions of a component definition and their respective independent Delphi diagnostic reports:
(Snapshot A: Definition A + Report A) <-> (Snapshot B: Definition B + Report B).

IMPORTANT PRINCIPLES:
- Both definitions have already been independently audited. Compare how the text revisions between A and B shifted the diagnostic interpretation.
- Do NOT assume that a warning disappearing in Report B automatically proves the underlying risk was resolved; assess whether the wording change genuinely addressed the interpretive mechanism or merely phrased it differently.
- Frame all observations as interpretive hypotheses, not guaranteed runtime outcomes.

Return TWO parts:

PART 1 — a \`\`\`json block FIRST:
\`\`\`json
{
  "summary": "<one line summary of how the revision shifted interpretation>",
  "mitigatedRisks": ["<risk hypothesis from A that appears addressed by wording changes in B>"],
  "persistingRisks": ["<risk hypothesis that remains active across both versions>"],
  "newRisks": ["<new interpretive risk or trade-off introduced in B>"]
}
\`\`\`

PART 2 — a concise markdown analysis:
1. INTERPRETIVE SHIFT — How the specific wording edits between Snapshot A and Snapshot B alter likely model interpretation.
2. PRIOR HYPOTHESES REVIEW — Which risks from Report A appear mitigated by the edits vs. which were merely expressed differently.
3. NEW TRADE-OFFS OR RISKS — Whether compression or rewording in Snapshot B introduced new pulls (e.g., Trait Eclipse, Unresolved Polarity, or lost stabilizing context).`;

  /**
   * Fast deterministic 32-bit FNV-1a hash for contentSnapshot comparison.
   */
  function computeContentHash(str) {
    const s = String(str || '').replace(/\r\n/g, '\n').trim();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return 'fnv1a_' + (h >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Build the canonical tagged definition string for a component.
   * This exact string is sent to the LLM and stored as the immutable contentSnapshot.
   */
  function buildComponentContentSnapshot(comp) {
    if (!comp) return '';
    let snap = `[COMPONENT]\nname: ${comp.name || 'Untitled'}\ncategory: ${comp.category || 'character'}\n\n`;

    if (comp.category === 'character') {
      snap += `[PERSONALITY]\n${comp.content || ''}\n\n`;
      if (Array.isArray(comp.scenarios) && comp.scenarios.length > 0) {
        snap += `[SCENARIO]\n${comp.scenarios.join('\n\n')}\n\n`;
      }
    } else if (comp.category === 'scenario') {
      snap += `[SCENARIO]\n${comp.content || ''}\n\n`;
    } else if (comp.category === 'bio') {
      snap += `[BIO]\n${comp.content || ''}\n\n`;
    } else if (comp.category === 'initial_message') {
      snap += `[INITIAL MESSAGE]\n${comp.content || ''}\n\n`;
    } else if (comp.category === 'organization') {
      snap += `[ORGANIZATION]\n${comp.content || ''}\n\n`;
    } else {
      snap += `[CONTENT]\n${comp.content || ''}\n\n`;
    }
    return snap.trim();
  }

  /**
   * Extract the raw component content body from a canonical Delphi contentSnapshot.
   */
  function extractRawContentFromSnapshot(contentSnapshot) {
    if (!contentSnapshot || typeof contentSnapshot !== 'string') return '';
    const s = contentSnapshot.trim();
    const headerMatch = s.match(/^\[COMPONENT\]\r?\nname:\s*(.*?)\r?\ncategory:\s*(.*?)\r?\n\r?\n\[(PERSONALITY|SCENARIO|BIO|INITIAL MESSAGE|ORGANIZATION|CONTENT)\]\r?\n([\s\S]*)$/);
    if (!headerMatch) return s;
    const cat = (headerMatch[2] || '').trim();
    let body = headerMatch[4] || '';
    if (cat === 'character') {
      const scenIdx = body.lastIndexOf('\n\n[SCENARIO]\n');
      if (scenIdx !== -1) {
        body = body.slice(0, scenIdx);
      }
    }
    return body.trim();
  }

  /**
   * Build a normalized string with an exact character-offset mapping array back to the original text.
   * Only normalizes consecutive whitespace (\s+ -> ' ') and curly/straight quotes.
   */
  function buildNormalizedIndexMap(sourceText) {
    const chars = [];
    const mapToOrig = [];
    let prevWasSpace = false;

    for (let i = 0; i < sourceText.length; i++) {
      let ch = sourceText[i];
      if (/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/.test(ch)) ch = '"';
      else if (/[\u2018\u2019\u201A\u201B]/.test(ch)) ch = "'";

      if (/\s/.test(ch)) {
        if (!prevWasSpace && chars.length > 0) {
          chars.push(' ');
          mapToOrig.push(i);
        }
        prevWasSpace = true;
      } else {
        chars.push(ch.toLowerCase());
        mapToOrig.push(i);
        prevWasSpace = false;
      }
    }

    // Trim trailing space
    if (chars.length > 0 && chars[chars.length - 1] === ' ') {
      chars.pop();
      mapToOrig.pop();
    }

    return {
      normText: chars.join(''),
      mapToOrig
    };
  }

  /**
   * Deterministically verify a single quoted substring against an immutable contentSnapshot.
   * Never guesses or fuzzy-matches paraphrased text or "..." elisions.
   */
  function verifyEvidenceQuote(quote, contentSnapshot) {
    const rawQuote = typeof quote === 'string' ? quote.trim() : '';
    if (!rawQuote || typeof contentSnapshot !== 'string' || !contentSnapshot.trim()) {
      return {
        quote: rawQuote,
        verified: false,
        matchType: 'unverified',
        start: -1,
        end: -1,
        matchedText: null
      };
    }

    // Reject quotes containing ellipsis splices ("..." or "…") unless the ellipsis literally exists in the source
    const hasEllipsis = rawQuote.includes('...') || rawQuote.includes('…');

    // Tier 1: Exact verbatim substring match (requires >= 4 chars)
    if (rawQuote.length >= 4) {
      const exactIdx = contentSnapshot.indexOf(rawQuote);
      if (exactIdx !== -1) {
        return {
          quote: rawQuote,
          verified: true,
          matchType: 'exact',
          start: exactIdx,
          end: exactIdx + rawQuote.length,
          matchedText: contentSnapshot.slice(exactIdx, exactIdx + rawQuote.length)
        };
      }
    }

    // If quote has an ellipsis that wasn't literally in the source, it is a spliced quote -> do not highlight
    if (hasEllipsis) {
      return {
        quote: rawQuote,
        verified: false,
        matchType: 'unverified',
        start: -1,
        end: -1,
        matchedText: null
      };
    }

    // Tier 2: Whitespace & quote-character normalized match (requires >= 12 chars to prevent generic word false positives)
    const { normText: normQuery } = buildNormalizedIndexMap(rawQuote);
    if (normQuery.length >= 12) {
      const { normText: normSource, mapToOrig } = buildNormalizedIndexMap(contentSnapshot);
      const normIdx = normSource.indexOf(normQuery);
      if (normIdx !== -1) {
        const origStart = mapToOrig[normIdx];
        const lastNormIdx = normIdx + normQuery.length - 1;
        const origEnd = (mapToOrig[lastNormIdx] !== undefined ? mapToOrig[lastNormIdx] : origStart) + 1;
        return {
          quote: rawQuote,
          verified: true,
          matchType: 'normalized',
          start: origStart,
          end: origEnd,
          matchedText: contentSnapshot.slice(origStart, origEnd)
        };
      }
    }

    return {
      quote: rawQuote,
      verified: false,
      matchType: 'unverified',
      start: -1,
      end: -1,
      matchedText: null
    };
  }

  /**
   * Verify an array of quotes against a contentSnapshot.
   */
  function verifyEvidenceQuotes(quotes, contentSnapshot) {
    if (!Array.isArray(quotes)) return [];
    return quotes
      .map(q => (typeof q === 'string' ? q.trim() : ''))
      .filter(Boolean)
      .map(q => verifyEvidenceQuote(q, contentSnapshot));
  }

  /**
   * Normalize failure mode strings/codes into valid FAILURE_MODES keys.
   * Supports multiple classifications per finding.
   */
  function normalizeFailureModes(rawModes) {
    if (!rawModes) return [];
    const list = Array.isArray(rawModes) ? rawModes : [rawModes];
    const result = [];
    const seen = new Set();

    for (const item of list) {
      if (!item) continue;
      const upper = String(item).toUpperCase().trim().replace(/[\s\-]+/g, '_');
      let matchedCode = null;

      if (FAILURE_MODES[upper]) {
        matchedCode = upper;
      } else if (upper.includes('SYCOPHAN')) {
        matchedCode = 'SYCOPHANCY_TRAP';
      } else if (upper.includes('ECLIPSE') || upper.includes('DOMINANCE_ECLIPSE')) {
        matchedCode = 'TRAIT_ECLIPSE';
      } else if (upper.includes('POLARITY') || upper.includes('CONTRADICT')) {
        matchedCode = 'UNRESOLVED_POLARITY';
      } else if (upper.includes('INSTRUCTION') || upper.includes('LEAK')) {
        matchedCode = 'INSTRUCTION_LEAK';
      } else if (upper.includes('SCENARIO_LOCK') || upper.includes('SCENE_LOCK')) {
        matchedCode = 'SCENARIO_LOCK';
      } else if (upper.includes('PASSIVE') || upper.includes('AGENCY')) {
        matchedCode = 'PASSIVE_AGENCY';
      } else if (upper.includes('UNSUPPORTED') || upper.includes('INFERENCE') || upper.includes('MIND_READ')) {
        matchedCode = 'UNSUPPORTED_INFERENCE';
      } else if (upper.includes('RELATIONSHIP') || upper.includes('DISTORTION')) {
        matchedCode = 'RELATIONSHIP_DISTORTION';
      } else if (upper.includes('CAPABILITY') || upper.includes('SKILL') || upper.includes('POWER')) {
        matchedCode = 'CAPABILITY_MISINTERPRETATION';
      }

      if (matchedCode && !seen.has(matchedCode)) {
        seen.add(matchedCode);
        result.push(matchedCode);
      }
    }

    return result;
  }

  /**
   * Normalize structured findings array and attach verified quote metadata.
   */
  function normalizeFindings(rawFindings, contentSnapshot = null) {
    if (!Array.isArray(rawFindings)) return [];
    return rawFindings
      .filter(f => f && typeof f === 'object')
      .map(f => {
        const rawQuotes = Array.isArray(f.quotes)
          ? f.quotes.map(String).filter(Boolean)
          : (typeof f.quote === 'string' && f.quote.trim() ? [f.quote.trim()] : []);
        const dim = ['coherence', 'dominance', 'triggers'].includes(String(f.dimension || '').toLowerCase())
          ? String(f.dimension).toLowerCase()
          : 'coherence';
        const sev = String(f.severity || '').toLowerCase() === 'fail' ? 'fail' : 'flag';
        const failureModes = normalizeFailureModes(f.failureModes || f.failureMode || f.classification);
        const hypothesis = String(f.hypothesis || f.consequence || f.summary || '').trim();
        const suggestion = String(f.suggestion || '').trim();
        const verifiedQuotes = contentSnapshot ? verifyEvidenceQuotes(rawQuotes, contentSnapshot) : rawQuotes.map(q => ({
          quote: q,
          verified: false,
          matchType: 'unverified',
          start: -1,
          end: -1,
          matchedText: null
        }));

        return {
          dimension: dim,
          severity: sev,
          failureModes,
          quotes: rawQuotes,
          verifiedQuotes,
          hypothesis,
          suggestion
        };
      })
      .filter(f => f.hypothesis || f.quotes.length > 0);
  }

  /**
   * Normalize traitDominance array.
   */
  function normalizeTraitDominance(rawDom) {
    if (!Array.isArray(rawDom)) return [];
    return rawDom
      .filter(item => item && typeof item === 'object' && item.trait)
      .map(item => ({
        trait: String(item.trait).trim(),
        strength: Math.max(1, Math.min(10, Number(item.strength || item.score || 5) || 5)),
        note: String(item.note || item.effect || '').trim()
      }));
  }

  /**
   * Read-time normalizer for backward compatibility with legacy v1 Delphi data and history stubs.
   * Never mutates or discards existing v1 reports, and never fabricates source highlights when contentSnapshot is absent.
   */
  function normalizeDelphiRecord(delphiData, currentComp = null) {
    if (!delphiData || typeof delphiData !== 'object') return null;

    const hasSnapshot = typeof delphiData.contentSnapshot === 'string' && delphiData.contentSnapshot.trim().length > 0;
    const contentSnapshot = hasSnapshot ? delphiData.contentSnapshot : null;
    const contentHash = delphiData.contentHash || (contentSnapshot ? computeContentHash(contentSnapshot) : null);

    let isStaleDefinition = false;
    if (currentComp && contentHash) {
      const liveSnap = buildComponentContentSnapshot(currentComp);
      const liveHash = computeContentHash(liveSnap);
      isStaleDefinition = liveHash !== contentHash;
    }

    const findings = normalizeFindings(delphiData.findings, contentSnapshot);
    const traitDominance = normalizeTraitDominance(delphiData.traitDominance);

    // Collect unique failure modes across all findings for quick badge display
    const allFailureModes = [];
    const fmSeen = new Set();
    findings.forEach(f => {
      (f.failureModes || []).forEach(code => {
        if (!fmSeen.has(code)) {
          fmSeen.add(code);
          allFailureModes.push(code);
        }
      });
    });

    const rawHistory = Array.isArray(delphiData.history) ? delphiData.history : [];
    const history = rawHistory.map((h, idx) => {
      if (!h || typeof h !== 'object') return null;
      const isLegacyStub = !h.report && !h.contentSnapshot && !h.dimensions;
      const hSnap = typeof h.contentSnapshot === 'string' && h.contentSnapshot.trim() ? h.contentSnapshot : null;
      const hHash = h.contentHash || (hSnap ? computeContentHash(hSnap) : null);
      return {
        ...h,
        runId: h.runId || `hist_${h.timestamp || idx}`,
        schemaVersion: h.schemaVersion || (hSnap ? 2 : 1),
        isLegacyStub,
        pinned: Boolean(h.pinned),
        pinLabel: h.pinLabel || '',
        contentSnapshot: hSnap,
        contentHash: hHash,
        traitDominance: normalizeTraitDominance(h.traitDominance),
        findings: normalizeFindings(h.findings, hSnap)
      };
    }).filter(Boolean);

    return {
      ...delphiData,
      schemaVersion: delphiData.schemaVersion || (hasSnapshot ? 2 : 1),
      runId: delphiData.runId || `run_${delphiData.timestamp || 'current'}`,
      pinned: Boolean(delphiData.pinned),
      pinLabel: delphiData.pinLabel || '',
      contentSnapshot,
      contentHash,
      hasContentSnapshot: hasSnapshot,
      isStaleDefinition,
      traitDominance,
      findings,
      failureModes: allFailureModes,
      versionDeltas: delphiData.versionDeltas || {},
      history
    };
  }

  /**
   * Build a self-contained snapshot entry from a delphi record (excluding nested history).
   */
  function toHistorySnapshot(delphiRecord) {
    if (!delphiRecord || !delphiRecord.verdict) return null;
    const copy = { ...delphiRecord };
    delete copy.history;
    copy.runId = copy.runId || `run_${copy.timestamp || Date.now()}`;
    copy.pinned = Boolean(copy.pinned);
    copy.pinLabel = copy.pinLabel || '';
    return copy;
  }

  /**
   * Append previous delphi record into history while protecting all pinned baselines
   * and capping unpinned entries at 10.
   */
  function mergeDelphiHistory(prevDelphi, maxUnpinned = 10) {
    const rawHistory = Array.isArray(prevDelphi?.history) ? [...prevDelphi.history] : [];
    const snap = toHistorySnapshot(prevDelphi);

    if (snap) {
      const existingIdx = rawHistory.findIndex(h => {
        if (h.runId && snap.runId && !String(h.runId).startsWith('hist_')) {
          return h.runId === snap.runId;
        }
        return Boolean(h.timestamp && h.timestamp === snap.timestamp && h.model === snap.model);
      });
      if (existingIdx !== -1) {
        // Preserve pinned flag if already pinned in history
        snap.pinned = Boolean(rawHistory[existingIdx].pinned || snap.pinned);
        snap.pinLabel = rawHistory[existingIdx].pinLabel || snap.pinLabel || '';
        rawHistory[existingIdx] = snap;
      } else {
        rawHistory.unshift(snap);
      }
    }

    const pinnedEntries = rawHistory.filter(h => h && h.pinned);
    const unpinnedEntries = rawHistory.filter(h => h && !h.pinned).slice(0, maxUnpinned);

    const combined = [...pinnedEntries, ...unpinnedEntries];
    combined.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    return combined;
  }

  /**
   * Sanitize JSON text to handle common LLM output defects:
   * - Strips line and block comments (outside quoted strings)
   * - Normalizes smart / curly quotes
   * - Removes trailing commas before } or ]
   */
  function cleanJsonString(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/^\s*\/\/[^\n]*/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1')
      .trim();
  }

  /**
   * Extract thinking/reasoning blocks (<think>...</think> or <thought>...</thought>)
   * so they do not pollute user-facing forms, markdown reports, or JSON extraction.
   */
  function extractThinking(raw) {
    if (typeof raw !== 'string') return { clean: '', thinking: '' };

    let thinking = '';
    let clean = raw;

    // 1. <think>...</think> (DeepSeek, OpenRouter, Qwen, etc.)
    clean = clean.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_, p1) => {
      if (p1 && p1.trim()) {
        thinking = (thinking ? thinking + '\n\n' : '') + p1.trim();
      }
      return '';
    }).trim();

    // 2. <thought>...</thought> (Gemini thinking tags)
    clean = clean.replace(/<thought>([\s\S]*?)(?:<\/thought>|$)/gi, (_, p1) => {
      if (p1 && p1.trim()) {
        thinking = (thinking ? thinking + '\n\n' : '') + p1.trim();
      }
      return '';
    }).trim();

    return { clean, thinking };
  }

  /**
   * Failover recovery for incomplete/truncated JSON blocks caused by token limits.
   * Extracts available dimension ratings and any completed finding objects even if closing braces were cut off.
   */
  function parsePartialJsonVerdict(str, contentSnapshot = null) {
    if (!str || typeof str !== 'string') return null;

    const cMatch = str.match(/"coherence"\s*:\s*"([^"]+)"/i);
    const dMatch = str.match(/"dominance"\s*:\s*"([^"]+)"/i);
    const tMatch = str.match(/"triggers"\s*:\s*"([^"]+)"/i);

    const c = normalizeDimension(cMatch ? cMatch[1] : null);
    const d = normalizeDimension(dMatch ? dMatch[1] : null);
    const t = normalizeDimension(tMatch ? tMatch[1] : null);

    if (c || d || t) {
      const noteC = (str.match(/"notes"\s*:\s*\{[\s\S]*?"coherence"\s*:\s*"([^"]*)"/i) || [])[1] || '';
      const noteD = (str.match(/"notes"\s*:\s*\{[\s\S]*?"dominance"\s*:\s*"([^"]*)"/i) || [])[1] || '';
      const noteT = (str.match(/"notes"\s*:\s*\{[\s\S]*?"triggers"\s*:\s*"([^"]*)"/i) || [])[1] || '';

      // Attempt to recover any complete finding objects inside "findings": [ ... ]
      const recoveredFindings = [];
      const findingsBlockMatch = str.match(/"findings"\s*:\s*\[([\s\S]*)/i);
      if (findingsBlockMatch) {
        const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
        let m;
        while ((m = objRegex.exec(findingsBlockMatch[1])) !== null) {
          try {
            const parsedObj = JSON.parse(cleanJsonString(m[0]));
            if (parsedObj && (parsedObj.hypothesis || parsedObj.quotes || parsedObj.failureModes)) {
              recoveredFindings.push(parsedObj);
            }
          } catch (_) { }
        }
      }

      return {
        dimensions: {
          coherence: c || null,
          dominance: d || null,
          triggers: t || null
        },
        notes: {
          coherence: noteC.trim() || (c ? 'Recovered from structured ratings' : 'Inferred from findings'),
          dominance: noteD.trim() || (d ? 'Recovered from structured ratings' : 'Inferred from findings'),
          triggers: noteT.trim() || (t ? 'Recovered from structured ratings' : 'Inferred from findings')
        },
        traitDominance: [],
        findings: normalizeFindings(recoveredFindings, contentSnapshot),
        recoveredFromPartialJson: true
      };
    }
    return null;
  }

  /**
   * Find candidate JSON substring from fenced blocks, unclosed fences, or bare JSON objects.
   */
  function extractCandidateJson(raw, keyPatterns = ['coherence', 'crossModel', 'dominance', 'flags', 'summary']) {
    if (typeof raw !== 'string') return null;

    // 1. Check all fenced blocks (```json ... ``` or ``` ... ```) and find the one containing target keys
    const fencedRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match;
    const candidates = [];
    while ((match = fencedRegex.exec(raw)) !== null) {
      candidates.push({ content: match[1], start: match.index, end: match.index + match[0].length });
    }

    const patternStr = keyPatterns.map(k => `"${k}"`).join('|');
    const keyRegex = new RegExp(patternStr, 'i');

    for (const cand of candidates) {
      if (keyRegex.test(cand.content)) {
        return cand;
      }
    }
    if (candidates.length > 0) {
      return candidates[0];
    }

    // 2. Unclosed fence at end of string: ```(?:json)?\s*({[\s\S]*)$
    const unclosedMatch = raw.match(/```(?:json)?\s*({[\s\S]*)$/i);
    if (unclosedMatch) {
      return { content: unclosedMatch[1], start: unclosedMatch.index, end: raw.length };
    }

    // 3. Bare JSON object containing expected dimension keys
    const bareRegex = new RegExp(`(\\{[\\s\\S]*?(?:${patternStr})[\\s\\S]*\\})`, 'i');
    const bareMatch = raw.match(bareRegex);
    if (bareMatch) {
      return { content: bareMatch[1], start: bareMatch.index, end: bareMatch.index + bareMatch[0].length };
    }

    return null;
  }

  /**
   * Normalizes fuzzy dimension value strings to strict 'pass' | 'flag' | 'fail'.
   */
  function normalizeDimension(val) {
    if (!val) return null;
    const s = String(val).toLowerCase().trim();
    if (/\b(?:fail|failed)\b/.test(s)) return 'fail';
    if (/\b(?:flag|flagged|warn|warning|needs work)\b/.test(s)) return 'flag';
    if (/\b(?:pass|passed|ready|clean|ok)\b/.test(s)) return 'pass';
    return null;
  }

  /**
   * Tier 2 Fallback: Extract verdict dimensions directly from markdown headings and bullet points.
   */
  function extractFromTextHeuristic(text) {
    if (!text || typeof text !== 'string') return null;
    const cMatch = text.match(/(?:coherence|trait coherence)[\s*:\-—]+(pass|flag|fail|passed|failed|flagged)/i);
    const dMatch = text.match(/(?:dominance|dominance hierarchy)[\s*:\-—]+(pass|flag|fail|passed|failed|flagged)/i);
    const tMatch = text.match(/(?:triggers|behavioral triggers)[\s*:\-—]+(pass|flag|fail|passed|failed|flagged)/i);

    if (cMatch || dMatch || tMatch) {
      const c = normalizeDimension(cMatch ? cMatch[1] : null) || null;
      const d = normalizeDimension(dMatch ? dMatch[1] : null) || null;
      const t = normalizeDimension(tMatch ? tMatch[1] : null) || null;
      return {
        coherence: c,
        dominance: d,
        triggers: t,
        notes: {
          coherence: cMatch ? `Extracted from text: "${cMatch[0].trim()}"` : 'Inferred from analysis findings',
          dominance: dMatch ? `Extracted from text: "${dMatch[0].trim()}"` : 'Inferred from analysis findings',
          triggers: tMatch ? `Extracted from text: "${tMatch[0].trim()}"` : 'Inferred from analysis findings'
        },
        inferredFromText: true
      };
    }
    return null;
  }

  /**
   * Parse the structured JSON verdict block from the LLM output.
   * Multi-tier failover: Sanitized JSON -> Partial JSON Recovery -> Text Heuristics -> Returns null for Tier 3 repair.
   */
  function parseVerdict(raw, contentSnapshot = null) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { report: '', dimensions: null, notes: null, traitDominance: [], findings: [], thinking: '' };
    }

    const { clean: cleanRaw, thinking } = extractThinking(raw);

    const candidate = extractCandidateJson(cleanRaw, ['coherence', 'dominance', 'triggers']);
    if (candidate) {
      const beforeBlock = cleanRaw.substring(0, candidate.start).trim();
      const afterBlock = cleanRaw.substring(candidate.end).trim();
      const reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();

      const cleaned = cleanJsonString(candidate.content);
      try {
        const data = JSON.parse(cleaned);
        const c = normalizeDimension(data.coherence);
        const d = normalizeDimension(data.dominance);
        const t = normalizeDimension(data.triggers);

        if (c && d && t) {
          const notes = {
            coherence: typeof data.notes?.coherence === 'string' ? data.notes.coherence.trim() : '',
            dominance: typeof data.notes?.dominance === 'string' ? data.notes.dominance.trim() : '',
            triggers: typeof data.notes?.triggers === 'string' ? data.notes.triggers.trim() : ''
          };
          const traitDominance = normalizeTraitDominance(data.traitDominance);
          const findings = normalizeFindings(data.findings, contentSnapshot);

          return {
            report: reportText,
            dimensions: { coherence: c, dominance: d, triggers: t },
            notes,
            traitDominance,
            findings,
            thinking
          };
        }
      } catch (jsonErr) {
        console.warn('[Delphi] JSON parse error on candidate block, attempting partial recovery:', jsonErr);
        const recovered = parsePartialJsonVerdict(candidate.content, contentSnapshot);
        if (recovered && recovered.dimensions) {
          console.info('[Delphi] Successfully recovered dimensions from truncated JSON block:', recovered.dimensions);
          return {
            report: reportText,
            dimensions: recovered.dimensions,
            notes: recovered.notes,
            traitDominance: recovered.traitDominance || [],
            findings: recovered.findings || [],
            recoveredFromPartialJson: true,
            thinking
          };
        }
      }
    }

    // Also check if any partial JSON exists in cleanRaw text
    const partialMatch = parsePartialJsonVerdict(cleanRaw, contentSnapshot);
    if (partialMatch && partialMatch.dimensions) {
      const cleanReport = cleanRaw.replace(/```(?:json)?[\s\S]*$/i, '').trim();
      console.info('[Delphi] Recovered dimensions from partial JSON in cleanRaw:', partialMatch.dimensions);
      return {
        report: cleanReport || cleanRaw,
        dimensions: partialMatch.dimensions,
        notes: partialMatch.notes,
        traitDominance: partialMatch.traitDominance || [],
        findings: partialMatch.findings || [],
        recoveredFromPartialJson: true,
        thinking
      };
    }

    // Tier 2 Fallback: Scan the markdown prose for explicit dimension verdicts
    const heuristic = extractFromTextHeuristic(cleanRaw);
    if (heuristic) {
      console.info('[Delphi] Recovered verdict dimensions via markdown text heuristics:', heuristic);
      return {
        report: cleanRaw,
        dimensions: {
          coherence: heuristic.coherence,
          dominance: heuristic.dominance,
          triggers: heuristic.triggers
        },
        notes: heuristic.notes,
        traitDominance: [],
        findings: [],
        inferredFromText: true,
        thinking
      };
    }

    return { report: cleanRaw, dimensions: null, notes: null, traitDominance: [], findings: [], thinking };
  }

  /**
   * Parse assembled / ensemble coherence flags and verify component quotes against component snapshots.
   */
  function parseAssembledVerdict(raw, componentSnapshotsMap = null, stagedComponents = null) {
    if (typeof raw !== 'string') {
      return { report: '', flags: [], spotlightRisks: [], voiceOverlaps: [], thinking: '' };
    }

    const { clean: cleanRaw, thinking } = extractThinking(raw);

    const candidate = extractCandidateJson(cleanRaw, ['flags', 'spotlightRisks', 'voiceOverlaps']);
    if (!candidate) {
      return { report: cleanRaw, flags: [], spotlightRisks: [], voiceOverlaps: [], thinking };
    }

    const beforeBlock = cleanRaw.substring(0, candidate.start).trim();
    const afterBlock = cleanRaw.substring(candidate.end).trim();
    const reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();
    const cleaned = cleanJsonString(candidate.content);

    const verifyEnsembleEvidence = (evidenceArr) => {
      if (!Array.isArray(evidenceArr)) return [];
      return evidenceArr
        .filter(e => e && typeof e === 'object' && e.quote)
        .map(e => {
          const compName = String(e.component || '').trim();
          const quoteStr = String(e.quote || '').trim();
          let verification = {
            quote: quoteStr,
            verified: false,
            matchType: 'unverified',
            start: -1,
            end: -1,
            matchedText: null
          };

          if (componentSnapshotsMap && componentSnapshotsMap instanceof Map) {
            // Snapshots are keyed by component id, but LLM evidence cites
            // components by name — resolve the cited name to an id first.
            // Direct lookup is kept for backward compatibility with any
            // name-keyed map passed by an external caller.
            let targetSnap = componentSnapshotsMap.get(compName);
            if (!targetSnap && Array.isArray(stagedComponents)) {
              const nameLower = compName.toLowerCase();
              const match = stagedComponents.find(c => c && c.name === compName)
                || stagedComponents.find(c => c && c.name && c.name.toLowerCase() === nameLower)
                || stagedComponents.find(c => c && c.name && (c.name.toLowerCase().startsWith(nameLower) || nameLower.startsWith(c.name.toLowerCase())));
              if (match && match.id) targetSnap = componentSnapshotsMap.get(match.id);
            }
            if (targetSnap) {
              verification = verifyEvidenceQuote(quoteStr, targetSnap);
            }
          }

          return {
            component: compName,
            quote: quoteStr,
            ...verification
          };
        });
    };

    try {
      const data = JSON.parse(cleaned);
      const flags = Array.isArray(data.flags) ? data.flags.map(f => ({
        severity: f.severity === 'critical' ? 'critical' : 'warning',
        lens: ['spotlight', 'voice', 'relationship', 'instruction'].includes(String(f.lens || '').toLowerCase())
          ? String(f.lens).toLowerCase()
          : 'instruction',
        failureModes: normalizeFailureModes(f.failureModes || f.failureMode),
        components: Array.isArray(f.components) ? f.components.map(String) : [],
        evidence: verifyEnsembleEvidence(f.evidence),
        summary: String(f.summary || '').trim(),
        suggestion: String(f.suggestion || '').trim()
      })) : [];

      const spotlightRisks = Array.isArray(data.spotlightRisks) ? data.spotlightRisks.map(s => ({
        characters: Array.isArray(s.characters) ? s.characters.map(String) : [],
        overlappingTriggers: String(s.overlappingTriggers || '').trim(),
        hypothesis: String(s.hypothesis || '').trim()
      })) : [];

      const voiceOverlaps = Array.isArray(data.voiceOverlaps) ? data.voiceOverlaps.map(v => ({
        characters: Array.isArray(v.characters) ? v.characters.map(String) : [],
        sharedTraits: String(v.sharedTraits || '').trim(),
        suggestion: String(v.suggestion || '').trim()
      })) : [];

      return { report: reportText, flags, spotlightRisks, voiceOverlaps, thinking };
    } catch (_) {
      // Partial recovery for incomplete JSON array
      const flags = [];
      const flagRegex = /\{\s*"severity"\s*:\s*"(warning|critical)"[\s\S]*?"summary"\s*:\s*"([^"]+)"[\s\S]*?"suggestion"\s*:\s*"([^"]+)"\s*\}/gi;
      let fMatch;
      while ((fMatch = flagRegex.exec(candidate.content)) !== null) {
        flags.push({
          severity: fMatch[1].toLowerCase(),
          lens: 'instruction',
          failureModes: [],
          components: [],
          evidence: [],
          summary: fMatch[2].trim(),
          suggestion: fMatch[3].trim()
        });
      }
      return { report: reportText, flags, spotlightRisks: [], voiceOverlaps: [], thinking };
    }
  }

  /**
   * Run Delphi diagnostic on a single component.
   * Captures immutable contentSnapshot & contentHash, verifies multi-passage evidence quotes,
   * and returns structured v2 diagnostic result.
   */
  async function diagnoseComponent(compId, overrideConfig = null) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp) {
      throw new Error(`Component with ID "${compId}" was not found.`);
    }

    const contentSnapshot = buildComponentContentSnapshot(comp);
    const contentHash = computeContentHash(contentSnapshot);

    const baseConfig = overrideConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const delphiMaxTokens = Math.max(Number(baseConfig.maxTokens) || 8192, 8192);
    const execConfig = { ...baseConfig, temperature: 0.3, maxTokens: delphiMaxTokens };

    if (!window.ForgeLLM || typeof window.ForgeLLM.generate !== 'function') {
      throw new Error('ForgeLLM service is not available.');
    }

    const raw = await window.ForgeLLM.generate(
      SYSTEM_PROMPT_COMPONENT,
      [{ role: 'user', content: contentSnapshot }],
      execConfig
    );

    const { clean: cleanRaw, thinking } = extractThinking(raw);

    let parsed = parseVerdict(cleanRaw, contentSnapshot);

    // Tier 3: Automated Self-Healing LLM Extraction Pass if raw output lacked valid format
    if (!parsed.dimensions && window.ForgeLLM && typeof window.ForgeLLM.generate === 'function') {
      try {
        console.warn('[Delphi] Diagnostic output lacked structured verdict block, initiating Tier 3 self-healing repair...');
        const repairPrompt = `You are a character QA formatting assistant. Extract the structured verdict and any cited findings from this character QA diagnostic analysis into strict JSON.

Do not include thinking, reasoning, or markdown. Output ONLY this JSON block:
\`\`\`json
{
  "coherence": "pass|flag|fail",
  "dominance": "pass|flag|fail",
  "triggers": "pass|flag|fail",
  "notes": {
    "coherence": "<short summary from text>",
    "dominance": "<short summary from text>",
    "triggers": "<short summary from text>"
  },
  "traitDominance": [],
  "findings": []
}
\`\`\``;

        const repairRaw = await window.ForgeLLM.generate(
          repairPrompt,
          [{ role: 'user', content: cleanRaw.substring(0, 4000) }],
          { ...execConfig, temperature: 0.0, maxTokens: 1024 }
        );

        const { clean: cleanRepair } = extractThinking(repairRaw);
        const repaired = parseVerdict(cleanRepair, contentSnapshot);
        if (repaired.dimensions) {
          console.info('[Delphi] Tier 3 self-healing repair succeeded!', repaired.dimensions);
          parsed = {
            report: cleanRaw,
            dimensions: repaired.dimensions,
            notes: repaired.notes || {},
            traitDominance: repaired.traitDominance || [],
            findings: repaired.findings || [],
            repaired: true
          };
        }
      } catch (repairErr) {
        console.warn('[Delphi] Tier 3 self-healing repair pass failed:', repairErr);
      }
    }

    let verdict = null;
    if (parsed.dimensions) {
      verdict = computeOverallVerdict(parsed.dimensions, 'unrun');
    }

    const now = new Date().toISOString();
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const findings = parsed.findings || [];
    const failureModes = [];
    const fmSet = new Set();
    findings.forEach(f => (f.failureModes || []).forEach(m => {
      if (!fmSet.has(m)) { fmSet.add(m); failureModes.push(m); }
    }));

    return {
      schemaVersion: 2,
      runId,
      pinned: false,
      pinLabel: '',
      contentSnapshot,
      contentHash,
      report: parsed.report,
      dimensions: parsed.dimensions ? { ...parsed.dimensions, crossModel: 'unrun' } : null,
      notes: parsed.notes || {},
      traitDominance: parsed.traitDominance || [],
      findings,
      failureModes,
      verdict,
      model: execConfig.model || 'unknown',
      provider: execConfig.provider || 'unknown',
      timestamp: now,
      repaired: !!parsed.repaired,
      inferredFromText: !!parsed.inferredFromText,
      recoveredFromPartialJson: !!parsed.recoveredFromPartialJson,
      thinking: thinking || null,
      raw
    };
  }

  /**
   * Persist a completed single-component diagnostic result onto the component,
   * preserving immutable snapshots and pinned baselines in comp.delphi.history.
   */
  async function saveComponentDiagnosticResult(comp, result) {
    const prevDelphi = comp.delphi ? normalizeDelphiRecord(comp.delphi, comp) : null;
    const history = mergeDelphiHistory(prevDelphi, 10);

    const delphiRecord = normalizeDelphiRecord({
      schemaVersion: 2,
      runId: result.runId || `run_${Date.now()}`,
      pinned: false,
      pinLabel: '',
      contentSnapshot: result.contentSnapshot,
      contentHash: result.contentHash,
      verdict: result.verdict,
      dimensions: result.dimensions,
      notes: result.notes,
      traitDominance: result.traitDominance || [],
      findings: result.findings || [],
      failureModes: result.failureModes || [],
      model: result.model,
      provider: result.provider,
      timestamp: result.timestamp || new Date().toISOString(),
      report: result.report,
      thinking: result.thinking || null,
      repaired: result.repaired,
      inferredFromText: result.inferredFromText,
      recoveredFromPartialJson: result.recoveredFromPartialJson,
      versionDeltas: {},
      history
    }, comp);

    comp.delphi = delphiRecord;
    await window.ForgeDB.saveComponent(comp);

    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
        detail: { id: comp.id, verdict: delphiRecord.verdict }
      }));
    }

    return delphiRecord;
  }

  /**
   * Parse comparison synthesis output.
   */
  function parseComparison(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { report: '', crossModel: 'flag', summary: 'No output received.', disputedWording: [], consequence: null, thinking: '' };
    }

    const { clean: cleanRaw, thinking } = extractThinking(raw);

    const candidate = extractCandidateJson(cleanRaw, ['crossModel']);
    let reportText = cleanRaw;
    let data = null;

    if (candidate) {
      const beforeBlock = cleanRaw.substring(0, candidate.start).trim();
      const afterBlock = cleanRaw.substring(candidate.end).trim();
      reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();
      const cleaned = cleanJsonString(candidate.content);
      try {
        data = JSON.parse(cleaned);
      } catch (e) {
        console.warn('[Delphi] parseComparison JSON error, attempting recovery:', e);
        const crossModelMatch = candidate.content.match(/"crossModel"\s*:\s*"([^"]+)"/i);
        if (crossModelMatch) {
          const rawC = crossModelMatch[1].toLowerCase().trim();
          const crossModel = rawC === 'pass' ? 'pass' : 'flag';
          const summaryMatch = candidate.content.match(/"summary"\s*:\s*"([^"]+)"/i);
          return {
            report: reportText,
            crossModel,
            summary: summaryMatch ? summaryMatch[1].trim() : 'Recovered from cross-model verdict',
            disputedWording: [],
            consequence: null,
            recoveredFromPartialJson: true,
            thinking
          };
        }
      }
    }

    if (data) {
      const rawC = String(data.crossModel || '').toLowerCase().trim();
      // Cross-model disagreement alone must never produce 'fail'. Only 'pass' or 'flag' are permitted.
      const crossModel = rawC === 'pass' ? 'pass' : 'flag';
      const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
      const disputedWording = Array.isArray(data.disputedWording) ? data.disputedWording.map(String) : [];
      const consequence = typeof data.consequence === 'string' && data.consequence.trim() ? data.consequence.trim() : null;

      return {
        report: reportText,
        crossModel,
        summary,
        disputedWording,
        consequence,
        thinking
      };
    }

    const passMatch = /cross[- ]?model[:\s*-]+pass/i.test(cleanRaw);
    return {
      report: reportText,
      crossModel: passMatch ? 'pass' : 'flag',
      summary: passMatch ? 'Both models returned compatible interpretations.' : 'Cross-model comparison returned unstructured analysis.',
      disputedWording: [],
      consequence: null,
      thinking
    };
  }

  /**
   * Compute overall verdict:
   * - FAIL if a primary diagnostic dimension is fail.
   * - Otherwise NEEDS WORK if a primary dimension or crossModel is flag.
   * - Otherwise READY.
   * - null (unknown) if there are no dimensions at all, or every dimension is
   *   unknown (null) — an unrecovered dimension must never read as READY.
   */
  function computeOverallVerdict(primaryDimensions, crossModel = 'unrun') {
    if (!primaryDimensions) return null;
    const { coherence, dominance, triggers } = primaryDimensions;
    if (coherence == null && dominance == null && triggers == null) return null;
    if (coherence === 'fail' || dominance === 'fail' || triggers === 'fail') {
      return 'FAIL';
    }
    if (coherence === 'flag' || dominance === 'flag' || triggers === 'flag' || crossModel === 'flag') {
      return 'NEEDS WORK';
    }
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

    const liveSnapshot = buildComponentContentSnapshot(comp);
    const liveHash = computeContentHash(liveSnapshot);

    // 1. Ensure primary diagnostic exists for the current contentHash or run it
    let primaryResult = options.primaryResult || null;
    if (!primaryResult) {
      const existing = comp.delphi ? normalizeDelphiRecord(comp.delphi, comp) : null;
      if (existing && existing.dimensions && existing.report && existing.contentHash === liveHash) {
        primaryResult = existing;
      } else {
        primaryResult = await diagnoseComponent(compId, primaryConfig);
      }
    }

    // 2. Run diagnostic with secondary model
    const secondaryResult = await diagnoseComponent(compId, secondaryConfig);

    // 3. Run cross-model comparison analysis
    const model1Name = `${primaryResult.provider || primaryConfig.provider || 'primary'} / ${primaryResult.model || primaryConfig.model || 'model'}`;
    const model2Name = `${secondaryResult.provider || secondaryConfig.provider || 'secondary'} / ${secondaryResult.model || secondaryConfig.model || 'model'}`;

    const contentSnapshot = primaryResult.contentSnapshot || liveSnapshot;
    const contentHash = primaryResult.contentHash || liveHash;

    let comparisonPromptUser = `[COMPONENT DEFINITION]\n${contentSnapshot}\n\n`;
    comparisonPromptUser += `=== MODEL 1 (${model1Name}) DIAGNOSTIC ===\n${primaryResult.report || ''}\n\n`;
    comparisonPromptUser += `Dimensions: coherence=${primaryResult.dimensions?.coherence}, dominance=${primaryResult.dimensions?.dominance}, triggers=${primaryResult.dimensions?.triggers}\n\n`;
    comparisonPromptUser += `=== MODEL 2 (${model2Name}) DIAGNOSTIC ===\n${secondaryResult.report || ''}\n\n`;
    comparisonPromptUser += `Dimensions: coherence=${secondaryResult.dimensions?.coherence}, dominance=${secondaryResult.dimensions?.dominance}, triggers=${secondaryResult.dimensions?.triggers}\n\n`;

    let comparisonRaw = '';
    let comparisonParsed = null;

    try {
      const cmpMaxTokens = Math.max(Number(primaryConfig.maxTokens) || 8192, 8192);
      comparisonRaw = await window.ForgeLLM.generate(
        SYSTEM_PROMPT_CROSS_MODEL_COMPARISON,
        [{ role: 'user', content: comparisonPromptUser }],
        { ...primaryConfig, temperature: 0.3, maxTokens: cmpMaxTokens }
      );
      const { clean: cleanCmp, thinking: cmpThinking } = extractThinking(comparisonRaw);
      comparisonParsed = parseComparison(cleanCmp);
      comparisonParsed.thinking = cmpThinking || null;
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

    const prevDelphi = comp.delphi ? normalizeDelphiRecord(comp.delphi, comp) : null;
    const history = mergeDelphiHistory(prevDelphi, 10);

    const verifiedDisputed = verifyEvidenceQuotes(comparisonParsed.disputedWording || [], contentSnapshot);

    const delphiRecord = normalizeDelphiRecord({
      schemaVersion: 2,
      runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pinned: false,
      pinLabel: '',
      contentSnapshot,
      contentHash,
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
      traitDominance: primaryResult.traitDominance || [],
      findings: primaryResult.findings || [],
      model: primaryResult.model || primaryConfig.model || 'primary',
      provider: primaryResult.provider || primaryConfig.provider || 'primary',
      comparedModel: secondaryResult.model || secondaryConfig.model || 'secondary',
      comparedProvider: secondaryResult.provider || secondaryConfig.provider || 'secondary',
      timestamp: new Date().toISOString(),
      report: primaryResult.report,
      secondaryReport: secondaryResult.report,
      secondaryDimensions: secondaryResult.dimensions,
      secondaryNotes: secondaryResult.notes,
      secondaryTraitDominance: secondaryResult.traitDominance || [],
      secondaryFindings: secondaryResult.findings || [],
      comparisonReport: comparisonParsed.report,
      comparisonData: {
        summary: comparisonParsed.summary,
        disputedWording: comparisonParsed.disputedWording || [],
        verifiedDisputedWording: verifiedDisputed,
        consequence: comparisonParsed.consequence || null
      },
      versionDeltas: {},
      history
    }, comp);

    comp.delphi = delphiRecord;
    await window.ForgeDB.saveComponent(comp);

    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
        detail: { id: comp.id, verdict: overallVerdict }
      }));
    }

    return delphiRecord;
  }

  /**
   * Toggle pinned baseline status on either current comp.delphi or a history entry.
   */
  async function togglePinDelphiRun(compId, runId, pinLabel = '') {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp || !comp.delphi) {
      throw new Error('Component or Delphi record not found.');
    }

    const delphi = normalizeDelphiRecord(comp.delphi, comp);
    if (!runId || delphi.runId === runId) {
      delphi.pinned = !delphi.pinned;
      delphi.pinLabel = delphi.pinned ? (pinLabel || 'Pinned Baseline') : '';
    } else if (Array.isArray(delphi.history)) {
      const target = delphi.history.find(h => h.runId === runId);
      if (target) {
        target.pinned = !target.pinned;
        target.pinLabel = target.pinned ? (pinLabel || 'Pinned Baseline') : '';
      }
    }

    comp.delphi = delphi;
    await window.ForgeDB.saveComponent(comp);
    return normalizeDelphiRecord(comp.delphi, comp);
  }

  /**
   * Compute a clean line-by-line diff between two definition snapshots.
   * Uses Longest Common Subsequence (LCS) on lines.
   */
  function computeLineDiff(oldText, newText) {
    const aLines = String(oldText || '').replace(/\r\n/g, '\n').split('\n');
    const bLines = String(newText || '').replace(/\r\n/g, '\n').split('\n');

    const m = aLines.length;
    const n = bLines.length;

    // Guard against huge line counts in LCS matrix
    if (m * n > 250000) {
      return {
        lines: [
          { type: 'removed', text: String(oldText || '') },
          { type: 'added', text: String(newText || '') }
        ],
        addedCount: n,
        removedCount: m,
        unchangedCount: 0,
        changed: oldText !== newText
      };
    }

    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (aLines[i] === bLines[j]) {
          dp[i][j] = 1 + dp[i + 1][j + 1];
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const diff = [];
    let i = 0;
    let j = 0;
    let addedCount = 0;
    let removedCount = 0;
    let unchangedCount = 0;

    while (i < m && j < n) {
      if (aLines[i] === bLines[j]) {
        diff.push({ type: 'unchanged', text: aLines[i] });
        unchangedCount++;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        diff.push({ type: 'removed', text: aLines[i] });
        removedCount++;
        i++;
      } else {
        diff.push({ type: 'added', text: bLines[j] });
        addedCount++;
        j++;
      }
    }
    while (i < m) {
      diff.push({ type: 'removed', text: aLines[i++] });
      removedCount++;
    }
    while (j < n) {
      diff.push({ type: 'added', text: bLines[j++] });
      addedCount++;
    }

    return {
      lines: diff,
      addedCount,
      removedCount,
      unchangedCount,
      changed: addedCount > 0 || removedCount > 0
    };
  }

  /**
   * Fast, zero-token deterministic comparison between two complete report snapshots (Run A = Baseline/Older, Run B = Target/Newer).
   * Uses "No longer reported" and "Newly reported" rather than assuming resolution.
   */
  function compareDelphiRuns(runA, runB) {
    if (!runA || !runB) return null;

    const normA = normalizeDelphiRecord(runA);
    const normB = normalizeDelphiRecord(runB);

    const dimsA = normA.dimensions || {};
    const dimsB = normB.dimensions || {};
    const dimKeys = ['coherence', 'dominance', 'triggers', 'crossModel'];
    const dimensionShifts = dimKeys.map(k => ({
      dimension: k,
      from: dimsA[k] || 'unrun',
      to: dimsB[k] || 'unrun',
      changed: (dimsA[k] || 'unrun') !== (dimsB[k] || 'unrun')
    }));

    const hasBothSnapshots = Boolean(normA.contentSnapshot && normB.contentSnapshot);
    const textDiff = hasBothSnapshots
      ? computeLineDiff(normA.contentSnapshot, normB.contentSnapshot)
      : null;

    // Trait dominance comparison
    const domA = normA.traitDominance || [];
    const domB = normB.traitDominance || [];
    const traitMap = new Map();
    domA.forEach(item => {
      const key = item.trait.toLowerCase().trim();
      traitMap.set(key, { trait: item.trait, strengthA: item.strength, noteA: item.note, strengthB: null, noteB: '' });
    });
    domB.forEach(item => {
      const key = item.trait.toLowerCase().trim();
      if (traitMap.has(key)) {
        const entry = traitMap.get(key);
        entry.strengthB = item.strength;
        entry.noteB = item.note;
      } else {
        traitMap.set(key, { trait: item.trait, strengthA: null, noteA: '', strengthB: item.strength, noteB: item.note });
      }
    });
    const dominanceComparison = Array.from(traitMap.values()).map(entry => ({
      ...entry,
      delta: (entry.strengthA !== null && entry.strengthB !== null) ? (entry.strengthB - entry.strengthA) : null
    }));

    // Findings & Failure Mode comparison (never claims "Resolved")
    const findingsA = normA.findings || [];
    const findingsB = normB.findings || [];

    const allModes = new Set([...(normA.failureModes || []), ...(normB.failureModes || [])]);
    const failureModeComparison = Array.from(allModes).map(code => {
      const inA = findingsA.filter(f => (f.failureModes || []).includes(code));
      const inB = findingsB.filter(f => (f.failureModes || []).includes(code));
      let statusLabel = 'Present in both reports';
      if (inA.length > 0 && inB.length === 0) statusLabel = 'No longer reported';
      else if (inA.length === 0 && inB.length > 0) statusLabel = 'Newly reported';

      return {
        code,
        meta: FAILURE_MODES[code] || { code, label: code, shortLabel: code },
        countA: inA.length,
        countB: inB.length,
        statusLabel,
        findingsA: inA,
        findingsB: inB
      };
    });

    const cachedDelta = (normB.versionDeltas && normB.versionDeltas[normA.runId]) || null;

    return {
      runA: normA,
      runB: normB,
      isLegacyComparison: Boolean(normA.isLegacyStub || normB.isLegacyStub || !hasBothSnapshots),
      verdictShift: {
        from: normA.verdict || '—',
        to: normB.verdict || '—',
        changed: normA.verdict !== normB.verdict
      },
      dimensionShifts,
      hasBothSnapshots,
      textDiff,
      dominanceComparison,
      failureModeComparison,
      findingsA,
      findingsB,
      cachedDelta
    };
  }

  /**
   * Optional Symmetric LLM Semantic Delta Analysis:
   * Compares (Snapshot A: Definition A + Report A) <-> (Snapshot B: Definition B + Report B).
   */
  async function runSymmetricVersionDelta(compId, runAId, runBId, overrideConfig = null) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp || !comp.delphi) {
      throw new Error('Component or Delphi record not found.');
    }

    const currentDelphi = normalizeDelphiRecord(comp.delphi, comp);
    const allRuns = [currentDelphi, ...(currentDelphi.history || [])];
    const runA = allRuns.find(r => r.runId === runAId);
    const runB = allRuns.find(r => r.runId === runBId) || currentDelphi;

    if (!runA || !runB) {
      throw new Error('Could not locate both selected diagnostic snapshots.');
    }
    if (!runA.contentSnapshot || !runB.contentSnapshot || !runA.report || !runB.report) {
      throw new Error('Symmetric LLM comparison requires two complete v2 snapshots (each with a definition snapshot and diagnostic report).');
    }

    const baseConfig = overrideConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const execConfig = { ...baseConfig, temperature: 0.3, maxTokens: Math.max(Number(baseConfig.maxTokens) || 8192, 8192) };

    const promptUser = [
      `=== SNAPSHOT A (Baseline / Older Run: ${runA.timestamp || 'Run A'}, Verdict: ${runA.verdict}) ===`,
      `--- DEFINITION A ---`,
      runA.contentSnapshot,
      `--- REPORT A ---`,
      `Dimensions: ${JSON.stringify(runA.dimensions || {})}`,
      `Findings: ${JSON.stringify((runA.findings || []).map(f => ({ failureModes: f.failureModes, quotes: f.quotes, hypothesis: f.hypothesis })))}`,
      runA.report,
      ``,
      `=== SNAPSHOT B (Target / Newer Run: ${runB.timestamp || 'Run B'}, Verdict: ${runB.verdict}) ===`,
      `--- DEFINITION B ---`,
      runB.contentSnapshot,
      `--- REPORT B ---`,
      `Dimensions: ${JSON.stringify(runB.dimensions || {})}`,
      `Findings: ${JSON.stringify((runB.findings || []).map(f => ({ failureModes: f.failureModes, quotes: f.quotes, hypothesis: f.hypothesis })))}`,
      runB.report
    ].join('\n\n');

    const raw = await window.ForgeLLM.generate(
      SYSTEM_PROMPT_VERSION_DELTA,
      [{ role: 'user', content: promptUser }],
      execConfig
    );

    const { clean: cleanRaw, thinking } = extractThinking(raw);
    const candidate = extractCandidateJson(cleanRaw, ['summary', 'mitigatedRisks', 'persistingRisks', 'newRisks']);
    let reportText = cleanRaw;
    let parsedData = {
      summary: 'Symmetric semantic delta analysis complete.',
      mitigatedRisks: [],
      persistingRisks: [],
      newRisks: []
    };

    if (candidate) {
      const beforeBlock = cleanRaw.substring(0, candidate.start).trim();
      const afterBlock = cleanRaw.substring(candidate.end).trim();
      reportText = (beforeBlock + (afterBlock ? '\n\n' + afterBlock : '')).trim();
      try {
        const d = JSON.parse(cleanJsonString(candidate.content));
        parsedData = {
          summary: String(d.summary || parsedData.summary).trim(),
          mitigatedRisks: Array.isArray(d.mitigatedRisks) ? d.mitigatedRisks.map(String) : [],
          persistingRisks: Array.isArray(d.persistingRisks) ? d.persistingRisks.map(String) : [],
          newRisks: Array.isArray(d.newRisks) ? d.newRisks.map(String) : []
        };
      } catch (_) { }
    }

    const deltaRecord = {
      fromRunId: runA.runId,
      toRunId: runB.runId,
      timestamp: new Date().toISOString(),
      model: execConfig.model || 'unknown',
      ...parsedData,
      report: reportText,
      thinking: thinking || null
    };

    // Persist onto the matching run in comp.delphi
    if (currentDelphi.runId === runB.runId) {
      currentDelphi.versionDeltas = currentDelphi.versionDeltas || {};
      currentDelphi.versionDeltas[runA.runId] = deltaRecord;
    } else if (Array.isArray(currentDelphi.history)) {
      const targetHist = currentDelphi.history.find(h => h.runId === runB.runId);
      if (targetHist) {
        targetHist.versionDeltas = targetHist.versionDeltas || {};
        targetHist.versionDeltas[runA.runId] = deltaRecord;
      }
    }

    comp.delphi = currentDelphi;
    await window.ForgeDB.saveComponent(comp);

    return deltaRecord;
  }

  /**
   * Phase 3: Batch Reporting Queue (`Delphi.runBatch`)
   * Runs N independent single-component diagnostics (never conflated with Ensemble Reporting).
   * Persists each report onto its respective component in ForgeDB and returns a digest summary.
   */
  async function runBatch(compIds = [], options = {}) {
    if (!Array.isArray(compIds) || compIds.length === 0) {
      return { total: 0, completed: 0, cancelled: false, results: [] };
    }

    const mode = options.mode === 'cross-model' ? 'cross-model' : 'primary';
    const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 350;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
    const isPaused = typeof options.isPaused === 'function' ? options.isPaused : () => false;

    const results = [];
    const total = compIds.length;
    let completed = 0;

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    for (let i = 0; i < total; i++) {
      // Wait while paused
      while (isPaused() && !isCancelled()) {
        await sleep(200);
      }
      if (isCancelled()) {
        break;
      }

      const compId = compIds[i];
      let comp = null;
      try {
        comp = await window.ForgeDB.getComponent(compId);
      } catch (_) { }

      const compName = comp ? comp.name : compId;
      if (onProgress) {
        onProgress({
          index: i,
          completed,
          total,
          currentId: compId,
          currentName: compName,
          results: [...results]
        });
      }

      if (!comp) {
        results.push({
          id: compId,
          name: compName,
          category: 'unknown',
          isTemplate: false,
          status: 'error',
          error: 'Component not found'
        });
        completed++;
        continue;
      }

      let attempt = 0;
      let maxAttempts = 3;
      let savedRecord = null;
      let lastErr = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          if (mode === 'cross-model') {
            savedRecord = await runCrossModelComparison(compId);
          } else {
            const diagResult = await diagnoseComponent(compId);
            if (!diagResult.dimensions) {
              throw new Error('LLM output omitted a readable verdict block.');
            }
            savedRecord = await saveComponentDiagnosticResult(comp, diagResult);
          }
          break;
        } catch (err) {
          lastErr = err;
          const isRateLimit = /429|rate limit|quota|too many requests/i.test(String(err.message || err));
          if (isRateLimit && attempt < maxAttempts && !isCancelled()) {
            await sleep(1500 * attempt);
            continue;
          }
          break;
        }
      }

      if (savedRecord) {
        results.push({
          id: comp.id,
          name: comp.name,
          category: comp.category || 'character',
          isTemplate: Boolean(comp.isTemplate || comp.tracker?.pipeline?.goldenTemplate),
          status: 'ok',
          verdict: savedRecord.verdict,
          dimensions: savedRecord.dimensions,
          failureModes: savedRecord.failureModes || [],
          findingsCount: (savedRecord.findings || []).length,
          delphi: savedRecord
        });
      } else {
        results.push({
          id: comp.id,
          name: comp.name,
          category: comp.category || 'character',
          isTemplate: Boolean(comp.isTemplate || comp.tracker?.pipeline?.goldenTemplate),
          status: 'error',
          error: lastErr ? (lastErr.message || String(lastErr)) : 'Diagnostic failed'
        });
      }

      completed++;
      if (onProgress) {
        onProgress({
          index: i + 1,
          completed,
          total,
          currentId: compId,
          currentName: compName,
          results: [...results]
        });
      }

      if (i < total - 1 && delayMs > 0 && !isCancelled()) {
        await sleep(delayMs);
      }
    }

    return {
      total,
      completed,
      cancelled: isCancelled(),
      results
    };
  }

  /**
   * Phase 4: Compute explicit Ensemble Coverage Manifest before running an Ensemble / Project diagnostic.
   * Ensures definitions are NEVER silently truncated while claiming a complete audit.
   */
  function computeEnsembleCoverage(payload = {}, effectiveInputBudgetTokens = 16000) {
    // Defensive: accept the legacy `components` key (and a bare array) so a
    // caller can never silently audit zero components again.
    const rawPayload = Array.isArray(payload) ? { stagedComponents: payload } : payload;
    const {
      stagedComponents: stagedRaw = [],
      components: legacyComponents = [],
      mappings = {},
      relationships = [],
      contentOverrides = {}
    } = rawPayload;
    const stagedComponents = stagedRaw.length ? stagedRaw : legacyComponents;

    const categoryPriority = {
      organization: 1,
      character: 2,
      scenario: 3,
      bio: 4,
      initial_message: 5
    };

    const included = [];
    const truncated = [];
    const omitted = [];

    // Separate ignored components upfront
    const activeComponents = [];
    stagedComponents.forEach(comp => {
      if (!comp) return;
      const mappedField = mappings[comp.id];
      if (mappedField === 'ignore') {
        omitted.push({
          id: comp.id,
          name: comp.name || 'Untitled',
          category: comp.category || 'character',
          reason: 'Mapped to ignore in Assembler'
        });
      } else {
        const rawContent = contentOverrides[comp.id] !== undefined
          ? contentOverrides[comp.id]
          : (comp.content || '');
        const fullText = String(rawContent).trim();
        const tokens = Math.max(1, Math.ceil(fullText.length / 4));
        activeComponents.push({
          comp,
          mappedField: mappedField || (comp.category === 'organization' ? 'organization' : 'personality'),
          fullText,
          tokens,
          priority: categoryPriority[comp.category] || 6
        });
      }
    });

    // Sort by analytical priority so shared Organization rules and core Characters are preserved first if budget is tight
    const prioritized = [...activeComponents].sort((a, b) => a.priority - b.priority);

    // Reserve ~250 tokens for relationships & prompt framing
    const relsOverheadTokens = relationships && relationships.length > 0 ? Math.ceil(relationships.length * 25) : 0;
    let remainingTokens = Math.max(1000, effectiveInputBudgetTokens - 250 - relsOverheadTokens);
    let estimatedInputTokens = 250 + relsOverheadTokens;

    const preparedBlocks = [];

    for (const item of prioritized) {
      const { comp, mappedField, fullText, tokens } = item;
      if (tokens <= remainingTokens) {
        remainingTokens -= tokens;
        estimatedInputTokens += tokens;
        included.push({
          id: comp.id,
          name: comp.name || 'Untitled',
          category: comp.category || 'character',
          mappedField,
          coverage: 'full',
          tokens
        });
        preparedBlocks.push({
          comp,
          mappedField,
          coverage: 'full',
          textToInclude: fullText
        });
      } else if (remainingTokens >= 200) {
        // Partial inclusion with explicit truncation marker
        const charLimit = remainingTokens * 4;
        const slicedText = fullText.slice(0, charLimit);
        const includedTokens = remainingTokens;
        estimatedInputTokens += includedTokens;
        remainingTokens = 0;

        truncated.push({
          id: comp.id,
          name: comp.name || 'Untitled',
          category: comp.category || 'character',
          mappedField,
          coverage: 'truncated',
          includedTokens,
          totalTokens: tokens,
          reason: 'Exceeded context budget limit'
        });
        preparedBlocks.push({
          comp,
          mappedField,
          coverage: 'truncated',
          textToInclude: `${slicedText}\n[...TRUNCATED AT CONTEXT BUDGET LIMIT (${includedTokens}/${tokens} est. tokens included)...]`
        });
      } else {
        omitted.push({
          id: comp.id,
          name: comp.name || 'Untitled',
          category: comp.category || 'character',
          mappedField,
          totalTokens: tokens,
          reason: 'Exceeded context budget limit'
        });
      }
    }

    const isPartial = truncated.length > 0 || omitted.some(o => o.reason === 'Exceeded context budget limit');

    return {
      status: isPartial ? 'partial' : 'full',
      totalStagedCount: stagedComponents.length,
      activeComponentCount: activeComponents.length,
      estimatedInputTokens,
      effectiveInputBudgetTokens,
      included,
      truncated,
      omitted,
      preparedBlocks
    };
  }

  /**
   * Phase 4: Holistic Ensemble & Assembled Card Diagnostic (`diagnoseEnsemble` / `diagnoseAssembled`).
   * Evaluates characters, organizations, scenarios, bios, initial messages, and relationships together.
   */
  async function diagnoseEnsemble(payload = {}, overrideConfig = null) {
    // Defensive: accept the legacy `components` key (and a bare array) so a
    // caller can never silently hit the empty-components guard again.
    const rawPayload = Array.isArray(payload) ? { stagedComponents: payload } : payload;
    const {
      stagedComponents: stagedRaw = [],
      components: legacyComponents = [],
      mappings = {},
      relationships = [],
      contentOverrides = {},
      mode = 'assembled',
      ensembleName = '',
      universeName = '',
      contextBudgetTokens = 16000
    } = rawPayload;
    const stagedComponents = stagedRaw.length ? stagedRaw : legacyComponents;

    if (stagedComponents.length === 0) {
      throw new Error('Please provide at least one component before running an ensemble diagnostic.');
    }

    const coverageInfo = computeEnsembleCoverage(
      { stagedComponents, mappings, relationships, contentOverrides },
      contextBudgetTokens
    );

    const componentSnapshotsMap = new Map();
    let userMsg = `[ENSEMBLE DIAGNOSTIC SPECIFICATION]\n`;
    userMsg += `Scope Mode: ${mode === 'faction' ? 'Universe / Faction Ensemble Audit' : 'Assembled Bot Card Audit'}\n`;
    if (ensembleName) userMsg += `Ensemble / Project Name: ${ensembleName}\n`;
    if (universeName) userMsg += `Universe / Faction: ${universeName}\n`;
    userMsg += `Diagnostic Coverage Status: ${coverageInfo.status.toUpperCase()} (${coverageInfo.included.length} full, ${coverageInfo.truncated.length} truncated, ${coverageInfo.omitted.length} omitted)\n\n`;

    if (coverageInfo.status === 'partial') {
      userMsg += `[COVERAGE LIMITATION NOTICE]\n`;
      if (coverageInfo.truncated.length > 0) {
        userMsg += `Truncated due to context budget: ${coverageInfo.truncated.map(t => `${t.name} (${t.category}: ${t.includedTokens}/${t.totalTokens} tokens)`).join(', ')}\n`;
      }
      if (coverageInfo.omitted.length > 0) {
        userMsg += `Omitted: ${coverageInfo.omitted.map(o => `${o.name} (${o.category}: ${o.reason})`).join(', ')}\n`;
      }
      userMsg += `Account for these coverage limits and do not assume omitted material is missing from the author's design.\n\n`;
    }

    coverageInfo.preparedBlocks.forEach((blk, idx) => {
      const comp = blk.comp;
      const catUpper = String(comp.category || 'character').toUpperCase();
      componentSnapshotsMap.set(comp.id || comp.name || `Component ${idx + 1}`, blk.textToInclude);

      userMsg += `--- [${catUpper} ${idx + 1}: ${comp.name} (Category: ${comp.category || 'character'}, Coverage: ${blk.coverage.toUpperCase()})] ---\n`;
      userMsg += `Mapped Card Field: ${blk.mappedField}\n`;
      userMsg += `Content:\n${blk.textToInclude}\n\n`;
    });

    if (relationships && relationships.length > 0) {
      userMsg += `[DECLARED CAST RELATIONSHIPS]\n`;
      relationships.forEach(rel => {
        const source = stagedComponents.find(c => c.id === rel.sourceId)?.name || 'Source';
        const target = rel.targetId === '{{User}}' ? '{{User}}' : (stagedComponents.find(c => c.id === rel.targetId)?.name || 'Target');
        userMsg += `- ${source} → ${target}: ${rel.dynamic || 'Unspecified dynamic'}\n`;
      });
      userMsg += `\n`;
    }

    const baseConfig = overrideConfig || (window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {});
    const assembledMaxTokens = Math.max(Number(baseConfig.maxTokens) || 8192, 8192);
    const execConfig = { ...baseConfig, temperature: 0.3, maxTokens: assembledMaxTokens };

    if (!window.ForgeLLM || typeof window.ForgeLLM.generate !== 'function') {
      throw new Error('ForgeLLM service is not available.');
    }

    const raw = await window.ForgeLLM.generate(
      SYSTEM_PROMPT_ASSEMBLED,
      [{ role: 'user', content: userMsg.trim() }],
      execConfig
    );

    const { clean: cleanRaw, thinking } = extractThinking(raw);
    const parsed = parseAssembledVerdict(cleanRaw, componentSnapshotsMap, stagedComponents);
    const perComponent = stagedComponents.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category || 'character',
      verdict: c.delphi?.verdict || null
    }));

    const coverage = {
      status: coverageInfo.status,
      totalStagedCount: coverageInfo.totalStagedCount,
      activeComponentCount: coverageInfo.activeComponentCount,
      estimatedInputTokens: coverageInfo.estimatedInputTokens,
      effectiveInputBudgetTokens: coverageInfo.effectiveInputBudgetTokens,
      included: coverageInfo.included,
      truncated: coverageInfo.truncated,
      omitted: coverageInfo.omitted
    };

    const componentSnapshots = {};
    for (const [k, v] of componentSnapshotsMap.entries()) {
      componentSnapshots[k] = v;
    }

    return {
      schemaVersion: 2,
      runId: `ens_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mode,
      ensembleName: ensembleName || 'Assembled Ensemble',
      universeName: universeName || '',
      report: parsed.report,
      flags: parsed.flags,
      spotlightRisks: parsed.spotlightRisks || [],
      voiceOverlaps: parsed.voiceOverlaps || [],
      coverage,
      componentSnapshots,
      perComponent,
      thinking: thinking || null,
      timestamp: new Date().toISOString(),
      model: execConfig.model || 'unknown',
      provider: execConfig.provider || 'unknown',
      raw
    };
  }

  /**
   * Backward-compatible alias for diagnoseEnsemble.
   */
  async function diagnoseAssembled(payload = {}, overrideConfig = null) {
    return diagnoseEnsemble({ ...payload, mode: payload.mode || 'assembled' }, overrideConfig);
  }

  /**
   * Failover helper: Run targeted LLM extraction repair on an unreadable raw report.
   */
  async function repairComponentVerdict(compId, rawText = null) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp) throw new Error(`Component "${compId}" was not found.`);

    const textToRepair = rawText || comp.delphi?.report || comp.delphi?.raw || '';
    const { clean: cleanTextToRepair } = extractThinking(textToRepair);
    if (!cleanTextToRepair.trim()) {
      throw new Error('No diagnostic report text found to repair.');
    }

    const contentSnapshot = comp.delphi?.contentSnapshot || buildComponentContentSnapshot(comp);
    const contentHash = comp.delphi?.contentHash || computeContentHash(contentSnapshot);

    const config = window.ForgeLLM && window.ForgeLLM.getConfig ? window.ForgeLLM.getConfig() : {};
    const repairPrompt = `You are a character QA formatting assistant. Extract the structured verdict from this character QA diagnostic analysis into strict JSON.

Do not include thinking, reasoning, or markdown. Output ONLY this JSON block:
\`\`\`json
{
  "coherence": "pass|flag|fail",
  "dominance": "pass|flag|fail",
  "triggers": "pass|flag|fail",
  "notes": {
    "coherence": "<short summary from text>",
    "dominance": "<short summary from text>",
    "triggers": "<short summary from text>"
  },
  "traitDominance": [],
  "findings": []
}
\`\`\``;

    const repairRaw = await window.ForgeLLM.generate(
      repairPrompt,
      [{ role: 'user', content: cleanTextToRepair.substring(0, 4000) }],
      { ...config, temperature: 0.0, maxTokens: 1024 }
    );

    const { clean: cleanRepairRaw } = extractThinking(repairRaw);
    const parsed = parseVerdict(cleanRepairRaw, contentSnapshot);
    if (!parsed.dimensions) {
      throw new Error('Could not extract dimensions from the report text.');
    }

    const overallVerdict = computeOverallVerdict(parsed.dimensions, comp.delphi?.dimensions?.crossModel || 'unrun');
    const prevDelphi = comp.delphi ? normalizeDelphiRecord(comp.delphi, comp) : {};

    const updatedDelphi = normalizeDelphiRecord({
      ...prevDelphi,
      schemaVersion: 2,
      contentSnapshot,
      contentHash,
      verdict: overallVerdict,
      dimensions: {
        ...parsed.dimensions,
        crossModel: prevDelphi.dimensions?.crossModel || 'unrun'
      },
      notes: {
        ...(prevDelphi.notes || {}),
        ...(parsed.notes || {})
      },
      traitDominance: parsed.traitDominance?.length ? parsed.traitDominance : (prevDelphi.traitDominance || []),
      findings: parsed.findings?.length ? parsed.findings : (prevDelphi.findings || []),
      repaired: true,
      timestamp: new Date().toISOString()
    }, comp);

    comp.delphi = updatedDelphi;
    await window.ForgeDB.saveComponent(comp);

    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
        detail: { id: comp.id, verdict: overallVerdict }
      }));
    }

    return updatedDelphi;
  }

  /**
   * Failover helper: Author manual override of dimensions.
   */
  async function setManualVerdict(compId, dimensions = {}, notes = {}) {
    if (!window.ForgeDB || !window.ForgeDB.getComponent) {
      throw new Error('Database is not initialized.');
    }
    const comp = await window.ForgeDB.getComponent(compId);
    if (!comp) throw new Error(`Component "${compId}" was not found.`);

    const c = normalizeDimension(dimensions.coherence) || 'pass';
    const d = normalizeDimension(dimensions.dominance) || 'pass';
    const t = normalizeDimension(dimensions.triggers) || 'pass';
    const cm = normalizeDimension(dimensions.crossModel) || comp.delphi?.dimensions?.crossModel || 'unrun';

    const dims = { coherence: c, dominance: d, triggers: t, crossModel: cm };
    const overallVerdict = computeOverallVerdict(dims, cm);
    const prevDelphi = comp.delphi ? normalizeDelphiRecord(comp.delphi, comp) : {};
    const contentSnapshot = prevDelphi.contentSnapshot || buildComponentContentSnapshot(comp);
    const contentHash = prevDelphi.contentHash || computeContentHash(contentSnapshot);

    const updatedDelphi = normalizeDelphiRecord({
      ...prevDelphi,
      schemaVersion: 2,
      contentSnapshot,
      contentHash,
      verdict: overallVerdict,
      dimensions: dims,
      notes: {
        ...(prevDelphi.notes || {}),
        coherence: notes.coherence || prevDelphi.notes?.coherence || 'Set by author',
        dominance: notes.dominance || prevDelphi.notes?.dominance || 'Set by author',
        triggers: notes.triggers || prevDelphi.notes?.triggers || 'Set by author',
        crossModel: notes.crossModel || prevDelphi.notes?.crossModel || ''
      },
      manual: true,
      timestamp: new Date().toISOString()
    }, comp);

    comp.delphi = updatedDelphi;
    await window.ForgeDB.saveComponent(comp);

    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('delphi:verdict-saved', {
        detail: { id: comp.id, verdict: overallVerdict }
      }));
    }

    return updatedDelphi;
  }

  window.Delphi = {
    FAILURE_MODES,
    buildComponentContentSnapshot,
    extractRawContentFromSnapshot,
    computeContentHash,
    verifyEvidenceQuote,
    verifyEvidenceQuotes,
    normalizeFailureModes,
    normalizeFindings,
    normalizeTraitDominance,
    normalizeDelphiRecord,
    mergeDelphiHistory,
    diagnoseComponent,
    saveComponentDiagnosticResult,
    diagnoseAssembled,
    diagnoseEnsemble,
    computeEnsembleCoverage,
    runCrossModelComparison,
    togglePinDelphiRun,
    computeLineDiff,
    compareDelphiRuns,
    runSymmetricVersionDelta,
    runBatch,
    parseVerdict,
    parseAssembledVerdict,
    parseComparison,
    computeOverallVerdict,
    repairComponentVerdict,
    setManualVerdict
  };
})();
