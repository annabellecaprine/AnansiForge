/**
 * relationships.js - Anansi Forge Core Graph Relationship Manager
 *
 * Explicit single-responsibility relationship manager for:
 * - Story ↔ Story (grouping multiple stories together)
 * - Story → Concept (promoting creative seeds into concepts)
 * - Concept → Character Instance (selected Vault characters with specific overrides)
 * - Concept → Scenario Instance (bound Template or Variant)
 * - Concept → Initial Message (owned directly by Concept)
 * - Bot → Bio (Bio owned by Bot with lifecycle: Draft -> Revision -> Polish -> Golden Template -> Published)
 * - Character → Organization (character affiliations)
 * - Scenario Template → Variant (custom setting variants)
 */

(() => {
  'use strict';

  const CoreRelationships = {
    /**
     * Link two stories together (bidirectional Story ↔ Story relationship)
     */
    linkStories: async function (storyIdA, storyIdB) {
      if (!window.ForgeDB) return false;
      const [storyA, storyB] = await Promise.all([
        window.ForgeDB.getTrackerRecord(storyIdA),
        window.ForgeDB.getTrackerRecord(storyIdB)
      ]);

      if (!storyA || !storyB) return false;

      storyA.relatedStoryIds = storyA.relatedStoryIds || [];
      storyB.relatedStoryIds = storyB.relatedStoryIds || [];

      if (!storyA.relatedStoryIds.includes(storyIdB)) storyA.relatedStoryIds.push(storyIdB);
      if (!storyB.relatedStoryIds.includes(storyIdA)) storyB.relatedStoryIds.push(storyIdA);

      await Promise.all([
        window.ForgeDB.saveTrackerRecord(storyA),
        window.ForgeDB.saveTrackerRecord(storyB)
      ]);
      return true;
    },

    /**
     * Link Character to Organization
     */
    linkCharacterToOrg: async function (characterId, orgId) {
      if (!window.ForgeDB) return false;
      const [charComp, orgComp] = await Promise.all([
        window.ForgeDB.getComponent(characterId),
        window.ForgeDB.getComponent(orgId)
      ]);

      if (!charComp || !orgComp) return false;

      charComp.tracker = charComp.tracker || {};
      charComp.tracker.orgId = orgId;

      orgComp.memberCharacterIds = orgComp.memberCharacterIds || [];
      if (!orgComp.memberCharacterIds.includes(characterId)) {
        orgComp.memberCharacterIds.push(characterId);
      }

      await Promise.all([
        window.ForgeDB.saveComponent(charComp),
        window.ForgeDB.saveComponent(orgComp)
      ]);
      return true;
    },

    /**
     * Create a Scenario Variant derived from a base Scenario Template
     */
    createScenarioVariant: async function (templateId, variantName, universe, customContent) {
      if (!window.ForgeDB) return null;
      const template = await window.ForgeDB.getComponent(templateId);
      if (!template) return null;

      const variantId = crypto.randomUUID();
      const variantComp = {
        id: variantId,
        name: variantName,
        category: 'scenario',
        isVariant: true,
        templateId: templateId,
        templateVersion: template.version || '1.0.0',
        content: customContent || template.content,
        tracker: {
          universe: universe || template.tracker?.universe || 'General',
          pipeline: { generated: true, goldenTemplate: false, test1: false, trimmed: false, test2: false, complete: false, published: false }
        },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };

      template.variantIds = template.variantIds || [];
      template.variantIds.push(variantId);

      await Promise.all([
        window.ForgeDB.saveComponent(variantComp),
        window.ForgeDB.saveComponent(template)
      ]);

      return variantComp;
    }
  };

  window.AnansiCoreRelationships = CoreRelationships;
})();
