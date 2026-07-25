/**
 * priority_sorter.js - Anansi Forge Mission Control Priority & Readiness Sorter
 */

(() => {
  'use strict';

  const PrioritySorter = {
    sortByReadiness: function (items, getScore, getPriority, dir = 'desc') {
      const priorityBoost = (priority) => priority === 'P1' ? 0.005 : priority === 'P2' ? 0.003 : priority === 'P3' ? 0.001 : 0;

      return [...items].sort((a, b) => {
        const sa = getScore(a) + priorityBoost(getPriority(a));
        const sb = getScore(b) + priorityBoost(getPriority(b));
        return dir === 'desc' ? sb - sa : sa - sb;
      });
    }
  };

  window.MissionControlPrioritySorter = PrioritySorter;
})();
