/**
 * events.js - Anansi Forge Core Independent Event & History Engine
 *
 * Manages three independent history systems:
 * 1. Activity Log: Human-readable events (Concept Created, Private Test Passed, Published, Metrics Updated).
 * 2. Audit Log: Field-level change tracking (Priority changed, Universe changed, Status changed).
 * 3. Metrics History: Performance snapshots only (append-only, immutable).
 */

(() => {
  'use strict';

  const CoreEvents = {
    /**
     * Log human-readable workflow event to Activity Log
     */
    logActivity: async function (action, entityType, entityId, details = '') {
      if (!window.ForgeDB || !window.ForgeDB.logActivity) return;
      await window.ForgeDB.logActivity({
        action,
        targetType: entityType,
        targetId: entityId,
        targetName: details
      });
    },

    /**
     * Log field-level change history.
     * Stored as a structured activity log entry until a dedicated audit store is added.
     */
    logAudit: async function (entityType, entityId, field, previousValue, newValue, author = 'user') {
      if (!window.ForgeDB || !window.ForgeDB.logActivity) return;
      await window.ForgeDB.logActivity({
        action: 'field_changed',
        targetType: entityType,
        targetId: entityId,
        targetName: `${field}: ${String(previousValue)} → ${String(newValue)} (by ${author})`
      });
    }
  };

  window.AnansiEvents = CoreEvents;
})();
