/**
 * version_engine.js - Anansi Forge Core Versioning & Upgrade Engine
 *
 * Golden Template asset versioning and upgrade notification rules:
 * - Golden Template assets are versioned.
 * - Bots remember the exact version used during assembly.
 * - Prompts user when newer template versions exist.
 * - Allows optional review & upgrade without ever automatically modifying existing builds.
 */

(() => {
  'use strict';

  const VersionEngine = {
    /**
     * Compare semver strings (e.g. '1.0.0' vs '1.1.0')
     * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
     */
    compareSemver: function (v1, v2) {
      if (!v1 || !v2) return 0;
      const parts1 = v1.toString().split('.').map(Number);
      const parts2 = v2.toString().split('.').map(Number);

      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
      }
      return 0;
    },

    /**
     * Check if a bound Scenario Variant or Bot build has an available Template upgrade
     */
    checkTemplateUpdate: async function (variantOrBot) {
      if (!window.ForgeDB || !variantOrBot) return null;

      const templateId = variantOrBot.templateId || (variantOrBot.buildSnapshot && variantOrBot.buildSnapshot.templateId);
      if (!templateId) return null;

      const template = await window.ForgeDB.getComponent(templateId);
      if (!template) return null;

      const currentVersion = variantOrBot.templateVersion || (variantOrBot.buildSnapshot && variantOrBot.buildSnapshot.templateVersion) || '1.0.0';
      const latestVersion = template.version || '1.0.0';

      if (VersionEngine.compareSemver(latestVersion, currentVersion) > 0) {
        return {
          hasUpdate: true,
          templateId,
          templateName: template.name,
          currentVersion,
          latestVersion,
          message: `A newer revision (${latestVersion}) of Scenario Template "${template.name}" is available. Review and optionally update.`
        };
      }

      return { hasUpdate: false };
    }
  };

  window.AnansiVersionEngine = VersionEngine;
})();
