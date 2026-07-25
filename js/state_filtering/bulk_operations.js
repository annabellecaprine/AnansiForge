/**
 * bulk_operations.js - Anansi Forge Mission Control Bulk Operations Manager
 */

(() => {
  'use strict';

  const BulkOperations = {
    setUniverseForSelected: async function (selectedIds, compMap, recordMap, universe) {
      const updates = [];
      selectedIds.forEach(id => {
        const comp = compMap.get(id);
        if (comp) {
          comp.tracker = comp.tracker || {};
          comp.tracker.universe = universe;
          updates.push(window.ForgeDB.saveComponent(comp));
          return;
        }
        const rec = recordMap.get(id);
        if (rec) {
          rec.universe = universe;
          updates.push(window.ForgeDB.saveTrackerRecord(rec));
        }
      });
      await Promise.all(updates);
    },

    setPriorityForSelected: async function (selectedIds, compMap, recordMap, priority) {
      const p = priority === '__clear__' ? null : priority;
      const updates = [];
      selectedIds.forEach(id => {
        const comp = compMap.get(id);
        if (comp) {
          comp.tracker = comp.tracker || {};
          comp.tracker.priority = p;
          updates.push(window.ForgeDB.saveComponent(comp));
          return;
        }
        const rec = recordMap.get(id);
        if (rec) {
          rec.priority = p;
          updates.push(window.ForgeDB.saveTrackerRecord(rec));
        }
      });
      await Promise.all(updates);
    }
  };

  window.MissionControlBulkOps = BulkOperations;
})();
