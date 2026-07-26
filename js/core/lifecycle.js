/**
 * lifecycle.js - Anansi Forge Core Transition & Promotion Rules Engine
 *
 * Enforces the 8-stage progressive lifecycle:
 * Story -> Concept -> Untested Bot -> Tested Bot -> Polished Bot -> Private Bot -> Public Bot -> Archived Bot
 *
 * Rules:
 * - Bio is OPTIONAL for testing (Untested, Tested, Polished, Private)
 * - Bio becomes MANDATORY when promoting from Private Bot -> Public Bot
 * - Archived removes record from active queues while preserving searchability, analytics, and leaderboards.
 * - Optional 'Retired' flag stops metric reminders without altering historical data.
 */

(() => {
  'use strict';

  const STAGE_ORDER = [
    'Story',
    'Concept',
    'Untested',
    'Tested',
    'Polished',
    'Private',
    'Public',
    'Archived'
  ];

  const ALLOWED_PROMOTIONS = {
    'Story': ['Concept'],
    'Concept': ['Untested'],
    'Untested': ['Tested'],
    'Tested': ['Polished'],
    'Polished': ['Private'],
    'Private': ['Public'],
    'Public': ['Archived'],
    'Archived': ['Private'] // Allow re-deploying from archive
  };

  const CoreLifecycle = {
    STAGE_ORDER,
    ALLOWED_PROMOTIONS,

    canPromote: function (currentStage, targetStage) {
      if (!ALLOWED_PROMOTIONS[currentStage]) return false;
      return ALLOWED_PROMOTIONS[currentStage].includes(targetStage);
    },

    /**
     * Validate bot publication requirements for Public Bot stage
     */
    validateReleaseRequirements: function (botRecord, bioRecord) {
      const errors = [];
      if (!botRecord) return { valid: false, errors: ['Bot record not found'] };

      // Requirement 1: Bio must be mandatory for Public Release
      if (!bioRecord || (bioRecord.status !== 'Golden Template' && bioRecord.status !== 'Published')) {
        errors.push('Publication requires a completed Bio with status "Golden Template" or "Published".');
      }

      // Requirement 2: Initial Message must be ready
      if (!botRecord.initialMessage || botRecord.initialMessage.trim().length === 0) {
        errors.push('Publication requires a completed Initial Message.');
      }

      // Requirement 3: Attached Scenario instance
      if (!botRecord.scenarioInstance) {
        errors.push('Publication requires an attached Scenario Variant or Template.');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },

    /**
     * Promote a bot record to target stage
     */
    promoteBot: async function (botId, targetStage) {
      if (!window.ForgeDB) throw new Error('Database not initialized');
      const bot = window.ForgeDB.getTrackerRecord ? await window.ForgeDB.getTrackerRecord(botId) : null;
      if (!bot) throw new Error(`Bot record ${botId} not found`);

      const currentStage = bot.stage || 'Untested';

      if (!CoreLifecycle.canPromote(currentStage, targetStage)) {
        throw new Error(`Illegal stage transition: ${currentStage} -> ${targetStage}`);
      }

      // Enforce release validation if target is Public
      if (targetStage === 'Public') {
        const bioComp = bot.bioId ? await window.ForgeDB.getComponent(bot.bioId) : null;
        const validation = CoreLifecycle.validateReleaseRequirements(bot, bioComp);
        if (!validation.valid) {
          throw new Error(`Public Release Blocked: ${validation.errors.join(' ')}`);
        }
      }

      bot.stage = targetStage;
      bot.modifiedAt = new Date().toISOString();

      if (window.ForgeDB.saveTrackerRecord) {
        await window.ForgeDB.saveTrackerRecord(bot);
      }

      if (window.AnansiEvents) {
        window.AnansiEvents.logActivity('Bot Stage Promoted', 'bot', botId, `Moved from ${currentStage} to ${targetStage}`);
        window.AnansiEvents.logAudit('bot', botId, 'stage', currentStage, targetStage);
      }

      return { success: true, bot };
    }
  };

  window.AnansiCoreLifecycle = CoreLifecycle;
})();
