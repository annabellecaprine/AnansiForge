/**
 * js/janitor.js - JanitorAI public metrics fetch for Anansi Forge
 *
 * JanitorAI's web client reads character stats from a JSON API at
 * https://janitorai.com/hampter/... Two facts make this usable here:
 *   1. GET /hampter/characters/{uuid} needs NO login and returns
 *      stats.chat (unique chats) and stats.message (total messages).
 *   2. That endpoint sends `Access-Control-Allow-Origin: *`, so a plain
 *      fetch() from this page works — no backend or proxy needed.
 *
 * NOT covered: favorites. GET /hampter/favorites/character/{uuid}/count
 * returns 401 without a logged-in JanitorAI session, so favorites stay a
 * manual entry (see the snapshot modal note).
 *
 * UUID rule (mirrors JanitorAI's own client): the page URL looks like
 *   https://janitorai.com/characters/<uuid>_character-the-slug
 * and the API id is everything before the first underscore.
 */
(() => {
  'use strict';

  const API_BASE = 'https://janitorai.com/hampter';

  /**
   * Pull the character UUID out of a JanitorAI page URL or accept a bare UUID.
   * Returns null when nothing UUID-shaped is found.
   */
  function extractUuid(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim();
    if (!s) return null;
    const m = s.match(/\/characters\/([^\/?#]+)/i);
    if (m) s = m[1];
    s = s.split(/[?#]/)[0];
    const us = s.indexOf('_');
    const uuid = (us === -1 ? s : s.substring(0, us)).trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)) {
      return null;
    }
    return uuid.toLowerCase();
  }

  /**
   * Fetch public metrics for one character. Resolves to
   * { uuid, name, messages, uniqueChats }. Throws a human-readable Error
   * when the link is bad, the character is private/deleted, or the
   * network fails.
   */
  async function fetchMetrics(urlOrUuid) {
    const uuid = extractUuid(urlOrUuid);
    if (!uuid) {
      throw new Error('That does not look like a JanitorAI character link. Paste the page URL from janitorai.com.');
    }
    let res;
    try {
      res = await fetch(`${API_BASE}/characters/${encodeURIComponent(uuid)}`, {
        headers: { Accept: 'application/json' }
      });
    } catch (e) {
      throw new Error('Could not reach JanitorAI. Check your connection and try again.');
    }
    if (res.status === 404) {
      throw new Error('Character not found on JanitorAI — it may be private, deleted, or the link is wrong.');
    }
    if (!res.ok) {
      throw new Error(`JanitorAI returned HTTP ${res.status}. Try again in a bit.`);
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('JanitorAI returned an unexpected response. Try again in a bit.');
    }
    const stats = (data && data.stats) || {};
    return {
      uuid,
      name: (data && data.name) || null,
      messages: Number(stats.message) || 0,
      uniqueChats: Number(stats.chat) || 0
    };
  }

  window.JanitorAPI = {
    API_BASE,
    extractUuid,
    fetchMetrics,
    fetchMetricsForBots,
    isPullDue,
    getLastPullIso,
    setLastPullNow,
    isAutoPullEnabled,
    setAutoPullEnabled
  };

  /**
   * Fetch metrics for several bots in sequence (polite: small delay between
   * calls). `bots` = [{id, name, janitorUrl}]. Resolves to an array of
   * {id, name, ok, messages?, uniqueChats?, fetchedName?, error?}.
   * One bot failing never stops the rest.
   */
  async function fetchMetricsForBots(bots, opts = {}) {
    const { onProgress = null, delayMs = 400 } = opts;
    const results = [];
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (typeof onProgress === 'function') {
        try { onProgress(i + 1, bots.length, b); } catch (e) { /* ignore */ }
      }
      try {
        const m = await fetchMetrics(b.janitorUrl);
        results.push({ id: b.id, name: b.name, ok: true, messages: m.messages, uniqueChats: m.uniqueChats, fetchedName: m.name });
      } catch (e) {
        results.push({ id: b.id, name: b.name, ok: false, error: (e && e.message) || 'Fetch failed.' });
      }
      if (i < bots.length - 1 && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return results;
  }

  const LS_LAST_PULL = 'anansiForge.lastMetricsPull';
  const LS_AUTO_PULL = 'anansiForge.autoMetricsPull';

  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }

  function getLastPullIso() { return lsGet(LS_LAST_PULL); }
  function setLastPullNow() { lsSet(LS_LAST_PULL, new Date().toISOString()); }

  /** Auto-pull defaults ON; the Metrics tab has a toggle to disable it. */
  function isAutoPullEnabled() { return lsGet(LS_AUTO_PULL) !== '0'; }
  function setAutoPullEnabled(on) { lsSet(LS_AUTO_PULL, on ? '1' : '0'); }

  /**
   * True when a daily pull is due: enabled, never pulled or last pull is at
   * least 24h ago. Pure logic — `nowMs` injectable for tests.
   */
  function isPullDue(nowMs = Date.now()) {
    if (!isAutoPullEnabled()) return false;
    const last = getLastPullIso();
    if (!last) return true;
    const t = Date.parse(last);
    if (isNaN(t)) return true;
    return (nowMs - t) >= 24 * 60 * 60 * 1000;
  }
})();
