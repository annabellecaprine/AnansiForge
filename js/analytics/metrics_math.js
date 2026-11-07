/**
 * metrics_math.js - Anansi Forge Mission Control Analytics Math
 *
 * Derived metrics math:
 * - Messages per Chat (MpC)
 * - Message Growth
 * - Chat Growth
 * - Favorite Growth
 * - Favorites per Chat
 * - Favorites per 100 Messages
 */

(() => {
  'use strict';

  const PIPELINE_STEPS = {
    character: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    scenario: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    bio: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    initial_message: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    organization: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    concept_stub: ['generated', 'goldenTemplate', 'test1', 'trimmed', 'test2', 'complete', 'published'],
    story: ['concept', 'notesReady', 'initialMessage', 'bio', 'otherMessages', 'testing', 'complete', 'published'],
    release: ['staged', 'bio', 'scenario', 'initialMessage', 'personalityLocked', 'thumbnail', 'banner', 'tagsDone', 'initialTest', 'regressionTest', 'finalPolish', 'ready']
  };

  const MetricsMath = {
    PIPELINE_STEPS,

    calcReadiness: function (pipeline, category) {
      const steps = PIPELINE_STEPS[category] || PIPELINE_STEPS.character;
      if (!steps || !steps.length) return 0;
      const checked = steps.filter(s => pipeline && pipeline[s]).length;
      return checked / steps.length;
    },

    calcReadinessForVault: function (comp) {
      return MetricsMath.calcReadiness(comp.tracker?.pipeline, comp.category);
    },

    calcReadinessForRecord: function (rec) {
      return MetricsMath.calcReadiness(rec.pipeline, rec.assetType);
    },

    priorityBoost: function (priority) {
      return priority === 'P1' ? 0.005 : priority === 'P2' ? 0.003 : priority === 'P3' ? 0.001 : 0;
    },

    /**
     * Calculate snapshot derived metrics & growth deltas
     */
    calculateSnapshotMetrics: function (messages, chats, favorites, prevSnapshot = null) {
      const msgCount = Math.max(0, parseInt(messages, 10) || 0);
      const chatCount = Math.max(0, parseInt(chats, 10) || 0);
      const favCount = Math.max(0, parseInt(favorites, 10) || 0);

      const mpc = chatCount > 0 ? parseFloat((msgCount / chatCount).toFixed(2)) : 0;
      const favPerChat = chatCount > 0 ? parseFloat((favCount / chatCount).toFixed(3)) : 0;
      const favPer100Msg = msgCount > 0 ? parseFloat(((favCount / msgCount) * 100).toFixed(2)) : 0;

      let msgGrowth = 0;
      let chatGrowth = 0;
      let favGrowth = 0;

      if (prevSnapshot) {
        msgGrowth = msgCount - (prevSnapshot.messages || 0);
        chatGrowth = chatCount - (prevSnapshot.chats || 0);
        favGrowth = favCount - (prevSnapshot.favorites || 0);
      }

      return {
        messages: msgCount,
        chats: chatCount,
        favorites: favCount,
        mpc,
        favPerChat,
        favPer100Msg,
        msgGrowth,
        chatGrowth,
        favGrowth,
        timestamp: new Date().toISOString()
      };
    }
  };

  window.MissionControlMath = MetricsMath;
})();
