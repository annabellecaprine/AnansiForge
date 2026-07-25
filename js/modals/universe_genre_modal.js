/**
 * universe_genre_modal.js - Anansi Forge Universe & Genre Manager Modal
 */

(() => {
  'use strict';

  const UniverseGenreModal = {
    openModal: function () {
      const modalEl = document.getElementById('mc-universe-manager-modal');
      if (modalEl) modalEl.classList.remove('hidden');
    },

    closeModal: function () {
      const modalEl = document.getElementById('mc-universe-manager-modal');
      if (modalEl) modalEl.classList.add('hidden');
    }
  };

  window.MissionControlUniverseModal = UniverseGenreModal;
})();
