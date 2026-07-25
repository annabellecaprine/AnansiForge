/**
 * interview_modal.js - Anansi Forge Character Voice Interview Rapid Tester
 */

(() => {
  'use strict';

  const InterviewModal = {
    openModal: function (characterName) {
      alert(`Voice Interview Tester for ${characterName}: Ready to test rapid voice response via configured API.`);
    }
  };

  window.MissionControlInterviewModal = InterviewModal;
})();
