/**
 * concept_stub_modal.js - Anansi Forge Mission Control Concept Stub Modal
 */

(() => {
  'use strict';

  const ConceptStubModal = {
    openModal: function () {
      const modalEl = document.getElementById('mc-stub-modal');
      if (modalEl) modalEl.classList.remove('hidden');
    },

    closeModal: function () {
      const modalEl = document.getElementById('mc-stub-modal');
      if (modalEl) modalEl.classList.add('hidden');
    }
  };

  window.MissionControlConceptModal = ConceptStubModal;
})();
