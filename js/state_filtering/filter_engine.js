/**
 * filter_engine.js - Anansi Forge Mission Control Filtering Engine
 */

(() => {
  'use strict';

  const FilterEngine = {
    filterComponents: function (components, filters = {}, activeTag = '') {
      let items = components;
      const { search, universe, priority, role } = filters;

      if (search) {
        const q = search.toLowerCase();
        items = items.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.lineage || '').toLowerCase().includes(q) ||
          (c.tracker?.project || '').toLowerCase().includes(q)
        );
      }
      if (universe && universe !== 'all') items = items.filter(c => (c.tracker?.universe || '') === universe);
      if (priority && priority !== 'all') items = items.filter(c => (c.tracker?.priority || null) === priority);
      if (role && role !== 'all') items = items.filter(c => (c.tracker?.role || '') === role);
      if (activeTag) {
        items = items.filter(c =>
          (c.tags || []).includes(activeTag) ||
          (c.tracker?.trackerTags || []).includes(activeTag)
        );
      }
      return items;
    },

    filterTrackerRecords: function (records, filters = {}, activeTag = '') {
      let items = records;
      const { search, universe, priority } = filters;

      if (search) {
        const q = search.toLowerCase();
        items = items.filter(r => (r.name || '').toLowerCase().includes(q) || (r.project || '').toLowerCase().includes(q));
      }
      if (universe && universe !== 'all') items = items.filter(r => (r.universe || '') === universe);
      if (priority && priority !== 'all') items = items.filter(r => (r.priority || null) === priority);
      if (activeTag) items = items.filter(r => (r.tags || []).includes(activeTag));
      return items;
    }
  };

  window.MissionControlFilterEngine = FilterEngine;
})();
