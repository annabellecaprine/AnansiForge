/**
 * record_edit_modal.js - Anansi Forge Record Edit Modal Dialog
 */

(() => {
  'use strict';

  const RecordEditModal = {
    openModal: function () {
      const modalEl = document.getElementById('mc-edit-modal');
      if (modalEl) modalEl.classList.remove('hidden');
    },

    closeModal: function () {
      const modalEl = document.getElementById('mc-edit-modal');
      if (modalEl) modalEl.classList.add('hidden');
    }
  };

  window.MissionControlRecordEditModal = RecordEditModal;
})();
