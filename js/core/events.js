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
      if (!window.ForgeDB) return;
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action,
        targetType: entityType,
        targetId: entityId,
        targetName: details
      };
      if (window.ForgeDB.saveActivityLogEntry) {
        await window.ForgeDB.saveActivityLogEntry(entry);
      }
    },

    /**
     * Log field-level change history to Audit Log
     */
    logAudit: async function (entityType, entityId, field, previousValue, newValue, author = 'user') {
      if (!window.ForgeDB) return;
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        entityType,
        entityId,
        field,
        previousValue,
        newValue,
        author
      };
      if (window.ForgeDB.saveAuditLogEntry) {
        await window.ForgeDB.saveAuditLogEntry(entry);
      }
    }
  };

  window.AnansiEvents = CoreEvents;
})();
