/**
 * db.js - IndexedDB wrapper for Anansi Forge.
 * 
 * Database: "anansi-forge" v10
 * Stores:
 *   - "vault_components" (keyPath: "id")
 *   - "projects" (keyPath: "id")
 *   - "chat_history" (keyPath: "projectId")
 */

(() => {
  const DB_NAME = 'anansi-forge';
  const DB_VERSION = 11;

  let dbInstance = null;

  // UUID generator
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function defaultTrackerPipeline(category) {
    if (category === 'story') {
      return { concept: false, notesReady: false, initialMessage: false, bio: false, otherMessages: false, testing: false, complete: false, published: false };
    }
    if (category === 'release') {
      return { staged: false, bio: false, scenario: false, initialMessage: false, personalityLocked: false, thumbnail: false, banner: false, tagsDone: false, initialTest: false, regressionTest: false, finalPolish: false, ready: false, released: false, hotfixNeeded: false };
    }
    // character, scenario, bio, initial_message, organization, concept_stub
    return { generated: false, goldenTemplate: false, test1: false, trimmed: false, test2: false, complete: false, published: false };
  }

  function defaultTracker() {
    return {
      universe: '',
      project: '',
      role: '',         // 'Hero' | 'Villain' | 'AntiHero' | 'Support' | 'Other'
      faction: '',      // e.g. 'X-Men', 'Avengers', 'Sinister Six'
      priority: null,
      pipeline: defaultTrackerPipeline('character'),
      publishedDate: null,
      trackerTags: []
    };
  }

  async function runSchemaMigration(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault_components', 'readwrite');
      const store = tx.objectStore('vault_components');

      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve();
          return;
        }

        const rec = cursor.value;
        let changed = false;

        // Migrate cluster → scenarios array
        if (rec.cluster !== undefined) {
          if (!rec.scenarios) {
            rec.scenarios = rec.cluster ? [rec.cluster] : [];
          }
          delete rec.cluster;
          changed = true;
        }
        if (rec.lineage === undefined) {
          rec.lineage = '';
          changed = true;
        }
        if (rec.isTemplate === undefined) {
          rec.isTemplate = false;
          changed = true;
        }
        // Migrate legacy setting/rules/lore categories to scenario
        if (rec.category === 'setting' || rec.category === 'rules' || rec.category === 'lore') {
          rec.category = 'scenario';
          changed = true;
        }
        // v6: inject tracker metadata field
        if (rec.tracker === undefined) {
          rec.tracker = defaultTracker();
          rec.tracker.pipeline = defaultTrackerPipeline(rec.category || 'character');
          changed = true;
        }

        if (changed) {
          cursor.update(rec);
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function initDB() {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = (event) => {
        console.warn('Database upgrade is blocked by another tab or connection. Please close all other tabs of this application.');
        alert('Database upgrade is blocked by another tab of Anansi Forge. Please close all other tabs of the app to allow the upgrade, then refresh this page.');
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // 1. Vault Components Store
        if (!db.objectStoreNames.contains('vault_components')) {
          const store = db.createObjectStore('vault_components', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('lineage', 'lineage', { unique: false });
          store.createIndex('modifiedAt', 'modifiedAt', { unique: false });
        } else {
          const store = event.target.transaction.objectStore('vault_components');
          if (!store.indexNames.contains('lineage')) {
            store.createIndex('lineage', 'lineage', { unique: false });
          }
          if (store.indexNames.contains('cluster')) {
            store.deleteIndex('cluster');
          }
        }

        // 2. Projects Store
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('modifiedAt', 'modifiedAt', { unique: false });
        }

        // 3. Chat History Store
        if (!db.objectStoreNames.contains('chat_history')) {
          db.createObjectStore('chat_history', { keyPath: 'projectId' });
        }

        // 4. Cover Images Store
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers', { keyPath: 'id' });
        }

        // 5. User Personas Store
        if (!db.objectStoreNames.contains('personas')) {
          db.createObjectStore('personas', { keyPath: 'id' });
        }

        // 6. Tracker Records Store (Stories, Releases, Concept Stubs)
        if (!db.objectStoreNames.contains('tracker_records')) {
          const trStore = db.createObjectStore('tracker_records', { keyPath: 'id' });
          trStore.createIndex('assetType', 'assetType', { unique: false });
          trStore.createIndex('name', 'name', { unique: false });
          trStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 7. Component Versions
        if (!db.objectStoreNames.contains('component_versions')) {
          const cvStore = db.createObjectStore('component_versions', { keyPath: 'id' });
          cvStore.createIndex('componentId', 'componentId', { unique: false });
          cvStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 8. Activity Log
        if (!db.objectStoreNames.contains('activity_log')) {
          const alStore = db.createObjectStore('activity_log', { keyPath: 'id' });
          alStore.createIndex('timestamp', 'timestamp', { unique: false });
          alStore.createIndex('targetType', 'targetType', { unique: false });
          alStore.createIndex('targetId', 'targetId', { unique: false });
        } else {
          // v11: add targetId index if missing
          const alStore = event.target.transaction.objectStore('activity_log');
          if (!alStore.indexNames.contains('targetId')) {
            alStore.createIndex('targetId', 'targetId', { unique: false });
          }
        }

        // 9. Snapshots
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapStore.createIndex('date', 'date', { unique: true });
        }

        // 10. Auto Backups
        if (!db.objectStoreNames.contains('auto_backups')) {
          const backupStore = db.createObjectStore('auto_backups', { keyPath: 'id' });
          backupStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 11. Universes & Genres Store
        if (!db.objectStoreNames.contains('universes')) {
          const uniStore = db.createObjectStore('universes', { keyPath: 'id' });
          uniStore.createIndex('name', 'name', { unique: true });
          uniStore.createIndex('genre', 'genre', { unique: false });
          DEFAULT_UNIVERSES.forEach(u => uniStore.put(u));
        } else {
          try {
            const uniTx = event.target.transaction.objectStore('universes');
            DEFAULT_UNIVERSES.forEach(u => uniTx.put(u));
          } catch (e) { }
        }
      };

      request.onsuccess = async (event) => {
        dbInstance = event.target.result;
        try {
          await runSchemaMigration(dbInstance);
          resolve(dbInstance);
        } catch (err) {
          console.error('Schema migration failed:', err);
          reject(err);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // --- Vault Component CRUD ---

  async function getAllComponents() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('vault_components', 'readonly');
    const store = tx.objectStore('vault_components');
    const index = store.index('modifiedAt');

    return new Promise((resolve, reject) => {
      const results = [];
      const cursorReq = index.openCursor(null, 'prev'); // Most recent first
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async function getComponent(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('vault_components', 'readonly');
    const store = tx.objectStore('vault_components');
    return promisify(store.get(id));
  }

  async function saveComponent(comp) {
    const db = dbInstance || await initDB();
    const existing = comp.id ? await getComponent(comp.id) : null;
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');

    const now = new Date().toISOString();
    const cat = comp.category || existing?.category || 'character';
    const tracker = { ...(existing?.tracker || { universe: '', project: '', priority: null, pipeline: defaultTrackerPipeline(cat), publishedDate: null, trackerTags: [] }), ...(comp.tracker || {}) };

    const record = {
      ...(existing || {}),
      ...comp,
      id: comp.id || generateId(),
      name: (comp.name || existing?.name || 'Unnamed Item').trim(),
      category: cat,
      lineage: (comp.lineage !== undefined ? comp.lineage : existing?.lineage || '').trim(),
      scenarios: Array.isArray(comp.scenarios) ? comp.scenarios : (existing?.scenarios || []),
      isTemplate: comp.isTemplate !== undefined ? (comp.isTemplate === true) : (existing?.isTemplate === true),
      content: comp.content !== undefined ? comp.content : (existing?.content || ''),
      tags: Array.isArray(comp.tags) ? comp.tags : (existing?.tags || []),
      tracker: tracker,
      createdAt: comp.createdAt || existing?.createdAt || now,
      modifiedAt: now
    };
    // Ensure old cluster key is not persisted
    delete record.cluster;

    await promisify(store.put(record));

    // Activity Log
    logActivity({
      action: existing ? 'edited' : 'created',
      targetType: 'component',
      targetId: record.id,
      targetName: record.name,
      details: record.category
    });

    // Version History
    if (existing) {
      saveComponentVersion(record.id, {
        name: record.name,
        content: record.content,
        category: record.category,
        tags: record.tags,
        tracker: record.tracker
      });
    }

    return record;
  }

  async function deleteComponent(id) {
    const db = dbInstance || await initDB();
    const comp = await getComponent(id);
    const name = comp ? comp.name : 'Unknown';
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');
    await promisify(store.delete(id));
    logActivity({ action: 'deleted', targetType: 'component', targetId: id, targetName: name });
  }

  // --- Project CRUD ---

  async function getAllProjects() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const index = store.index('modifiedAt');

    return new Promise((resolve, reject) => {
      const results = [];
      const cursorReq = index.openCursor(null, 'prev');
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async function getProject(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    return promisify(store.get(id));
  }

  async function saveProject(project) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');

    const now = new Date().toISOString();
    const record = {
      ...project,
      id: project.id || generateId(),
      name: (project.name || 'Unnamed Project').trim(),
      componentIds: Array.isArray(project.componentIds) ? project.componentIds : [],
      mappings: project.mappings || {}, // Maps component ID to character card field (e.g. description, personality)
      relationships: Array.isArray(project.relationships) ? project.relationships : [],
      compiledCard: project.compiledCard || null,
      createdAt: project.createdAt || now,
      modifiedAt: now
    };

    await promisify(store.put(record));
    return record;
  }

  async function deleteProject(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    return promisify(store.delete(id));
  }

  // --- Chat History Operations ---

  async function getChatHistory(projectId) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('chat_history', 'readonly');
    const store = tx.objectStore('chat_history');
    const record = await promisify(store.get(projectId));
    return record ? record.messages : [];
  }

  async function saveChatHistory(projectId, messages) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('chat_history', 'readwrite');
    const store = tx.objectStore('chat_history');
    return promisify(store.put({ projectId, messages }));
  }

  async function clearChatHistory(projectId) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('chat_history', 'readwrite');
    const store = tx.objectStore('chat_history');
    return promisify(store.delete(projectId));
  }

  // --- Cover Images ---

  async function getCover(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('covers', 'readonly');
    const store = tx.objectStore('covers');
    const record = await promisify(store.get(id));
    return record ? record.dataUrl : null;
  }

  async function saveCover(id, dataUrl) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('covers', 'readwrite');
    const store = tx.objectStore('covers');
    return promisify(store.put({ id, dataUrl }));
  }

  async function deleteCover(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('covers', 'readwrite');
    const store = tx.objectStore('covers');
    return promisify(store.delete(id));
  }

  // --- User Personas ---

  async function getAllPersonas() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('personas', 'readonly');
    const store = tx.objectStore('personas');
    return promisify(store.getAll());
  }

  async function getPersona(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('personas', 'readonly');
    const store = tx.objectStore('personas');
    return promisify(store.get(id));
  }

  async function savePersona(persona) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('personas', 'readwrite');
    const store = tx.objectStore('personas');

    const record = {
      ...persona,
      id: persona.id || generateId(),
      name: (persona.name || 'Unnamed Persona').trim(),
      description: persona.description || ''
    };

    await promisify(store.put(record));
    return record;
  }

  async function deletePersona(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('personas', 'readwrite');
    const store = tx.objectStore('personas');
    return promisify(store.delete(id));
  }

  // --- Tracker Records CRUD ---

  const VALID_STORY_STATUSES = new Set(['Active', 'Promoted', 'Archived']);
  const VALID_RELEASE_SOURCES = new Set(['story', 'existing_bot', 'legacy_import', 'manual', 'experiment']);
  const VALID_SERIES = new Set(['standard', 'workshop', 'experimental', 'event_bot']);

  /**
   * Normalizes a tracker record on read so legacy/uninitialized records never break UI state
   */
  function normalizeTrackerRecord(rec) {
    if (!rec) return rec;
    const aType = rec.assetType || 'concept_stub';

    // Normalize Story specific fields
    if (aType === 'story') {
      if (!rec.status || !VALID_STORY_STATUSES.has(rec.status)) {
        rec.status = 'Active';
      }
      if (!Array.isArray(rec.releaseIds)) {
        rec.releaseIds = rec.promotedToReleaseId ? [rec.promotedToReleaseId] : [];
      }
      if (!Array.isArray(rec.linkedVaultIds)) {
        rec.linkedVaultIds = [];
      }
    }

    // Normalize Release specific fields
    if (aType === 'release') {
      if (!rec.releaseSource || !VALID_RELEASE_SOURCES.has(rec.releaseSource)) {
        rec.releaseSource = rec.sourceStoryId ? 'story' : 'manual';
      }
      if (rec.sourceStoryId === undefined) {
        rec.sourceStoryId = null;
      }
      if (!rec.status || (rec.status !== 'Active' && rec.status !== 'Archived')) {
        rec.status = 'Active';
      }
      if (!rec.series || !VALID_SERIES.has(rec.series)) {
        rec.series = 'standard';
      }
    }

    // Common defaults
    if (!Array.isArray(rec.tags)) rec.tags = [];
    if (!Array.isArray(rec.linkedVaultIds)) rec.linkedVaultIds = [];
    if (!rec.notes) rec.notes = '';
    if (!rec.pipeline) rec.pipeline = defaultTrackerPipeline(aType);
    if (!Array.isArray(rec.lifecycleEvents)) rec.lifecycleEvents = [];

    return rec;
  }

  async function getAllTrackerRecords() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readonly');
    const store = tx.objectStore('tracker_records');
    const records = await promisify(store.getAll());
    return (records || []).map(normalizeTrackerRecord);
  }

  async function getTrackerRecord(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readonly');
    const store = tx.objectStore('tracker_records');
    const record = await promisify(store.get(id));
    return normalizeTrackerRecord(record);
  }

  async function saveTrackerRecord(rec) {
    const db = dbInstance || await initDB();
    const now = new Date().toISOString();
    const aType = rec.assetType || 'concept_stub';

    // Save-time validation & default enforcement
    let status = rec.status;
    if (aType === 'story') {
      status = VALID_STORY_STATUSES.has(status) ? status : 'Active';
    } else if (aType === 'release') {
      status = (status === 'Active' || status === 'Archived') ? status : 'Active';
    }

    let releaseSource = rec.releaseSource;
    if (aType === 'release') {
      releaseSource = VALID_RELEASE_SOURCES.has(releaseSource) ? releaseSource : (rec.sourceStoryId ? 'story' : 'manual');
    }

    // Metrics history & delta tracking
    let previousMetrics = rec.previousMetrics || null;
    let metricsHistory = Array.isArray(rec.metricsHistory) ? [...rec.metricsHistory] : [];

    // Lifecycle event detection
    let lifecycleEvents = Array.isArray(rec.lifecycleEvents) ? [...rec.lifecycleEvents] : [];

    if (rec.id) {
      try {
        const existing = await getTrackerRecord(rec.id);
        if (existing && existing.metrics && rec.metrics) {
          const oldM = existing.metrics.messages || 0;
          const oldC = existing.metrics.uniqueChats || 0;
          const oldF = existing.metrics.favorites || 0;
          const newM = rec.metrics.messages || 0;
          const newC = rec.metrics.uniqueChats || 0;
          const newF = rec.metrics.favorites || 0;
          if (oldM !== newM || oldC !== newC || oldF !== newF) {
            previousMetrics = {
              messages: oldM,
              uniqueChats: oldC,
              favorites: oldF,
              updatedAt: existing.updatedAt || now
            };
          }
        }

        // Auto-record lifecycle events on key transitions
        if (existing && aType === 'release') {
          const oldVis = existing.visibility || null;
          const newVis = rec.visibility || null;
          const oldStatus = existing.status || 'Active';
          const newStatus = status || 'Active';

          // Visibility transitions
          if (oldVis !== 'Private' && newVis === 'Private') {
            lifecycleEvents.push({ type: 'private_testing', label: 'Private Testing Started', icon: '🧪', timestamp: now });
          }
          if (oldVis === 'Private' && newVis && newVis !== 'Private') {
            lifecycleEvents.push({ type: 'private_testing_ended', label: 'Private Testing Ended', icon: '🔬', timestamp: now });
          }
          if (oldVis !== 'Pre-Release' && newVis === 'Pre-Release') {
            lifecycleEvents.push({ type: 'pre_release', label: 'Scheduled Pre-Release', icon: '⏰', timestamp: now });
          }
          if (oldVis !== 'Public' && newVis === 'Public') {
            lifecycleEvents.push({ type: 'public_release', label: 'Public Release', icon: '🚀', timestamp: now });
          }

          // Scheduled date set for the first time
          if (!existing.scheduledDate && rec.scheduledDate) {
            lifecycleEvents.push({ type: 'scheduled_release', label: 'Scheduled Release', icon: '📅', timestamp: now });
          }

          // Status transitions
          if (oldStatus !== 'Archived' && newStatus === 'Archived') {
            lifecycleEvents.push({ type: 'archived', label: 'Archived', icon: '📦', timestamp: now });
          }
          if (oldStatus === 'Archived' && newStatus === 'Active') {
            lifecycleEvents.push({ type: 'unarchived', label: 'Unarchived', icon: '📤', timestamp: now });
          }
        }
      } catch (e) {
        console.warn('Could not fetch existing record for metrics history:', e);
      }
    }

    // Open readwrite transaction synchronously right before put()
    const tx = db.transaction('tracker_records', 'readwrite');
    const store = tx.objectStore('tracker_records');

    const record = {
      ...rec,
      id: rec.id || generateId(),
      assetType: aType,
      name: (rec.name || 'Unnamed').trim(),
      universe: rec.universe || '',
      project: rec.project || '',
      priority: rec.priority || null,
      tags: Array.isArray(rec.tags) ? rec.tags : [],
      notes: rec.notes || '',
      linkedVaultIds: Array.isArray(rec.linkedVaultIds) ? rec.linkedVaultIds : [],
      pipeline: rec.pipeline || defaultTrackerPipeline(aType),
      // story-specific
      status: status || 'Active',
      releaseIds: Array.isArray(rec.releaseIds) ? rec.releaseIds : (rec.promotedToReleaseId ? [rec.promotedToReleaseId] : []),
      // release-specific
      releaseSource: releaseSource || 'manual',
      series: (aType === 'release' && VALID_SERIES.has(rec.series)) ? rec.series : (aType === 'release' ? 'standard' : undefined),
      sourceStoryId: rec.sourceStoryId || null,
      iterationLabel: rec.iterationLabel || '',
      previousMetrics: previousMetrics,
      metricsHistory: metricsHistory,
      lifecycleEvents: lifecycleEvents,
      projectId: rec.projectId || null,
      visibility: rec.visibility || null,
      scheduledDate: rec.scheduledDate || null,
      metrics: rec.metrics || { messages: 0, uniqueChats: 0, favorites: 0 },
      // stub-specific
      intendedCategory: rec.intendedCategory || 'character',
      promotedToVaultId: rec.promotedToVaultId || null,
      createdAt: rec.createdAt || now,
      updatedAt: now
    };
    await promisify(store.put(record));
    return normalizeTrackerRecord(record);
  }

  async function deleteTrackerRecord(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readwrite');
    const store = tx.objectStore('tracker_records');
    return promisify(store.delete(id));
  }

  async function updateVaultTracker(id, trackerPatch, updateModifiedAt = true) {
    const db = dbInstance || await initDB();
    const comp = await getComponent(id);
    if (!comp) throw new Error('Component not found: ' + id);
    comp.tracker = { ...(comp.tracker || defaultTracker()), ...trackerPatch };
    if (updateModifiedAt) {
      comp.modifiedAt = new Date().toISOString();
    }
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');
    await promisify(store.put(comp));

    logActivity({
      action: 'tracker_updated',
      targetType: 'component',
      targetId: id,
      targetName: comp.name,
      details: Object.keys(trackerPatch).join(', ')
    });

    return comp;
  }

  // --- Universes & Genres Registry CRUD ---

  const DEFAULT_UNIVERSES = [
    // Comics
    { id: 'dc', name: 'DC', genre: 'Comics', color: '#2563eb', content: '' },
    { id: 'marvel', name: 'Marvel', genre: 'Comics', color: '#dc2626', content: '' },
    { id: 'hellboy', name: 'Hellboy', genre: 'Comics', color: '#b91c1c', content: '' },
    { id: 'invincible', name: 'Invincible', genre: 'Comics', color: '#f59e0b', content: '' },
    { id: 'oc', name: 'OC', genre: 'Comics', color: '#7c3aed', content: '' },
    { id: 'mixed', name: 'Mixed', genre: 'Comics', color: '#d97706', content: '' },
    // Sci-Fi & Space Opera
    { id: 'star_wars', name: 'Star Wars', genre: 'Sci-Fi & Space Opera', color: '#0284c7', content: '' },
    { id: 'star_trek', name: 'Star Trek', genre: 'Sci-Fi & Space Opera', color: '#0369a1', content: '' },
    { id: 'firefly', name: 'Firefly', genre: 'Sci-Fi & Space Opera', color: '#ea580c', content: '' },
    { id: 'stargate', name: 'Stargate', genre: 'Sci-Fi & Space Opera', color: '#0891b2', content: '' },
    { id: 'mass_effect', name: 'Mass Effect', genre: 'Sci-Fi & Space Opera', color: '#2563eb', content: '' },
    { id: 'babylon_5', name: 'Babylon 5', genre: 'Sci-Fi & Space Opera', color: '#4f46e5', content: '' },
    // Urban Fantasy
    { id: 'supernatural', name: 'Supernatural', genre: 'Urban Fantasy', color: '#78350f', content: '' },
    { id: 'buffy', name: 'Buffy', genre: 'Urban Fantasy', color: '#9333ea', content: '' },
    { id: 'angel', name: 'Angel', genre: 'Urban Fantasy', color: '#6b21a8', content: '' },
    { id: 'dresden_files', name: 'Dresden Files', genre: 'Urban Fantasy', color: '#1e293b', content: '' },
    { id: 'grimm', name: 'Grimm', genre: 'Urban Fantasy', color: '#15803d', content: '' },
    { id: 'constantine', name: 'Constantine', genre: 'Urban Fantasy', color: '#ca8a04', content: '' },
    { id: 'daniel_faust', name: 'Daniel Faust', genre: 'Urban Fantasy', color: '#881337', content: '' },
    // Fantasy
    { id: 'lotr', name: 'LotR', genre: 'Fantasy', color: '#15803d', content: '' },
    { id: 'dragon_age', name: 'Dragon Age', genre: 'Fantasy', color: '#991b1b', content: '' },
    { id: 'elder_scrolls', name: 'Elder Scrolls', genre: 'Fantasy', color: '#854d0e', content: '' },
    { id: 'dnd', name: 'D&D', genre: 'Fantasy', color: '#dc2626', content: '' },
    { id: 'witcher', name: 'Witcher', genre: 'Fantasy', color: '#374151', content: '' },
    // Adventure / Pulp
    { id: 'indiana_jones', name: 'Indiana Jones', genre: 'Adventure / Pulp', color: '#d97706', content: '' },
    { id: 'the_shadow', name: 'The Shadow', genre: 'Adventure / Pulp', color: '#111827', content: '' },
    { id: 'the_phantom', name: 'The Phantom', genre: 'Adventure / Pulp', color: '#7c3aed', content: '' },
    { id: 'doc_savage', name: 'Doc Savage', genre: 'Adventure / Pulp', color: '#ca8a04', content: '' },
    { id: 'zorro', name: 'Zorro', genre: 'Adventure / Pulp', color: '#991b1b', content: '' },
    { id: 'dick_tracy', name: 'Dick Tracy', genre: 'Adventure / Pulp', color: '#f59e0b', content: '' },
    { id: 'the_rocketeer', name: 'The Rocketeer', genre: 'Adventure / Pulp', color: '#b91c1c', content: '' },
    // Detective
    { id: 'sherlock', name: 'Sherlock', genre: 'Detective', color: '#475569', content: '' },
    { id: 'lupin', name: 'Lupin', genre: 'Detective', color: '#c026d3', content: '' },
    { id: 'columbo', name: 'Columbo', genre: 'Detective', color: '#854d0e', content: '' },
    // General
    { id: 'other', name: 'Other', genre: 'General', color: '#6b7280', content: '' }
  ];

  async function getAllUniverses() {
    const db = dbInstance || await initDB();
    if (!db.objectStoreNames.contains('universes')) {
      return DEFAULT_UNIVERSES;
    }
    const tx = db.transaction('universes', 'readonly');
    const store = tx.objectStore('universes');
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        let list = req.result || [];
        if (list.length === 0) {
          resolve(DEFAULT_UNIVERSES);
        } else {
          resolve(list);
        }
      };
      req.onerror = () => resolve(DEFAULT_UNIVERSES);
    });
  }

  async function getUniverse(id) {
    const db = dbInstance || await initDB();
    if (!db.objectStoreNames.contains('universes')) return null;
    const tx = db.transaction('universes', 'readonly');
    const store = tx.objectStore('universes');
    return promisify(store.get(id));
  }

  async function saveUniverse(uni) {
    const db = dbInstance || await initDB();
    if (!db.objectStoreNames.contains('universes')) return null;
    const name = (uni.name || 'Universe').trim();
    const id = uni.id || name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const record = {
      id,
      name,
      genre: (uni.genre || 'General').trim(),
      color: uni.color || '#6b7280',
      content: (uni.content !== undefined ? uni.content : '').trim(),
      isCustom: uni.isCustom !== undefined ? uni.isCustom : true,
      updatedAt: new Date().toISOString()
    };
    const tx = db.transaction('universes', 'readwrite');
    const store = tx.objectStore('universes');
    await promisify(store.put(record));
    return record;
  }

  async function deleteUniverse(id) {
    const db = dbInstance || await initDB();
    if (!db.objectStoreNames.contains('universes')) return;
    const tx = db.transaction('universes', 'readwrite');
    const store = tx.objectStore('universes');
    return promisify(store.delete(id));
  }

  async function getUniverseColorMap() {
    const list = await getAllUniverses();
    const map = {};
    list.forEach(u => {
      if (u.name) map[u.name] = u.color || '#6b7280';
      if (u.id) map[u.id] = u.color || '#6b7280';
    });
    return map;
  }

  // --- Version History ---
  async function saveComponentVersion(componentId, snapshot) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('component_versions', 'readwrite');
    const store = tx.objectStore('component_versions');
    const record = { id: generateId(), componentId, ...snapshot, timestamp: new Date().toISOString() };
    await promisify(store.put(record));
    deleteOldVersions(componentId, 10);
  }

  async function getComponentVersions(componentId) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('component_versions', 'readonly');
    const store = tx.objectStore('component_versions');
    const index = store.index('componentId');
    const results = await new Promise((resolve, reject) => {
      const req = index.getAll(componentId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async function deleteOldVersions(componentId, keepCount) {
    const versions = await getComponentVersions(componentId);
    if (versions.length <= keepCount) return;
    const db = dbInstance || await initDB();
    const toDelete = versions.slice(keepCount);
    const tx = db.transaction('component_versions', 'readwrite');
    const store = tx.objectStore('component_versions');
    for (const v of toDelete) {
      store.delete(v.id);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Activity Logging ---
  async function logActivity(entry) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('activity_log', 'readwrite');
    const store = tx.objectStore('activity_log');
    const record = { id: generateId(), ...entry, timestamp: new Date().toISOString() };
    await promisify(store.put(record));
    pruneActivityLog(500); // fire and forget
  }

  async function getRecentActivity(limit = 50) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('activity_log', 'readonly');
    const store = tx.objectStore('activity_log');
    const index = store.index('timestamp');
    return new Promise((resolve, reject) => {
      const results = [];
      const cursorReq = index.openCursor(null, 'prev');
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async function getTargetActivity(targetId) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('activity_log', 'readonly');
    const store = tx.objectStore('activity_log');
    // Use the targetId index for an O(log n) lookup instead of a full table scan
    const index = store.index('targetId');
    return new Promise((resolve) => {
      const req = index.getAll(targetId);
      req.onsuccess = () => {
        const results = (req.result || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  }

  let lastPruneTime = 0;
  async function pruneActivityLog(keepCount = 500) {
    const now = Date.now();
    if (now - lastPruneTime < 30000) return; // Throttle to run at most once per 30 seconds
    lastPruneTime = now;

    try {
      const db = dbInstance || await initDB();
      const count = await new Promise((resolve, reject) => {
        const tx = db.transaction('activity_log', 'readonly');
        const req = tx.objectStore('activity_log').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (count <= keepCount) return;

      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction('activity_log', 'readonly');
        const req = tx.objectStore('activity_log').index('timestamp').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (entries.length <= keepCount) return;

      const toDelete = entries.slice(keepCount);
      const txDelete = db.transaction('activity_log', 'readwrite');
      const storeDelete = txDelete.objectStore('activity_log');
      for (const entry of toDelete) {
        storeDelete.delete(entry.id);
      }
    } catch (e) {
      console.warn('Prune activity log skipped:', e);
    }
  }

  // --- Snapshots ---
  async function captureSnapshot() {
    const components = await getAllComponents();
    const records = await getAllTrackerRecords();

    let publishedVault = 0;
    const byCategory = {};
    const universes = {};

    components.forEach(c => {
      if (c.tracker && c.tracker.pipeline && c.tracker.pipeline.published) {
        publishedVault++;
      }
      const cat = c.category || 'character';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, published: 0 };
      byCategory[cat].total++;
      if (c.tracker && c.tracker.pipeline && c.tracker.pipeline.published) {
        byCategory[cat].published++;
      }
      if (c.tracker && c.tracker.universe) {
        const u = c.tracker.universe;
        universes[u] = (universes[u] || 0) + 1;
      }
    });

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const releases = records.filter(r => r.assetType === 'release');
    const isReleased = (r) => {
      if (r.pipeline?.released || r.pipeline?.published) return true;
      if (r.scheduledDate && r.scheduledDate <= dateStr) return true;
      return false;
    };
    const publishedReleases = releases.filter(isReleased).length;

    const totalItems = components.length + releases.length;
    const publishedCount = publishedVault + publishedReleases;

    const db = dbInstance || await initDB();

    // Check if snapshot for today exists
    const txCheck = db.transaction('snapshots', 'readonly');
    const storeCheck = txCheck.objectStore('snapshots');
    const index = storeCheck.index('date');
    const existing = await new Promise((resolve, reject) => {
      const req = index.get(dateStr);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const snapshot = {
      id: existing ? existing.id : generateId(),
      date: dateStr,
      totalItems,
      publishedCount,
      publishedVault,
      publishedReleases,
      totalVault: components.length,
      totalReleases: releases.length,
      byCategory,
      universes,
      timestamp: new Date().toISOString()
    };

    await saveSnapshot(snapshot);
    return snapshot;
  }

  async function getSnapshots(limit = 12) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('snapshots', 'readonly');
    const store = tx.objectStore('snapshots');
    const index = store.index('date');
    return new Promise((resolve, reject) => {
      const results = [];
      const cursorReq = index.openCursor(null, 'prev');
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async function saveSnapshot(snapshot) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('snapshots', 'readwrite');
    const store = tx.objectStore('snapshots');
    return promisify(store.put(snapshot));
  }

  // --- Auto-Backup ---
  async function saveAutoBackup(bundleJSON) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('auto_backups', 'readwrite');
    const store = tx.objectStore('auto_backups');
    const record = { id: generateId(), bundle: bundleJSON, createdAt: new Date().toISOString() };
    await promisify(store.put(record));

    const all = await getAllAutoBackups();
    if (all.length > 3) {
      const toDelete = all.slice(3);
      const txDelete = db.transaction('auto_backups', 'readwrite');
      const storeDelete = txDelete.objectStore('auto_backups');
      for (const b of toDelete) {
        storeDelete.delete(b.id);
      }
    }
  }

  async function getLatestAutoBackup() {
    const all = await getAllAutoBackups();
    return all.length > 0 ? all[0] : null;
  }

  async function getAllAutoBackups() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('auto_backups', 'readonly');
    const store = tx.objectStore('auto_backups');
    const index = store.index('createdAt');
    const results = await new Promise((resolve, reject) => {
      const req = index.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // --- Duplicate Detection ---
  function normalizeForComparison(str) {
    if (!str) return '';
    return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  }

  function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function findSimilarComponents(name, components, threshold = 0.8) {
    const normName = normalizeForComparison(name);
    if (!normName) return [];

    return components.filter(c => {
      const normC = normalizeForComparison(c.name);
      if (!normC) return false;
      const dist = levenshteinDistance(normName, normC);
      const maxLen = Math.max(normName.length, normC.length);
      const sim = 1 - (dist / maxLen);
      return sim >= threshold;
    });
  }

  // --- Vault Backup / Restore ---

  async function exportVault() {
    const components = await getAllComponents();
    const projects = await getAllProjects();
    const personas = await getAllPersonas();
    const trackerRecords = await getAllTrackerRecords();

    let component_versions = [];
    let activity_log = [];
    let covers = [];
    let universes = [];
    try {
      const db = dbInstance || await initDB();
      const storeNames = ['component_versions', 'activity_log', 'covers', 'universes'].filter(s => db.objectStoreNames.contains(s));
      if (storeNames.length > 0) {
        const tx = db.transaction(storeNames, 'readonly');
        if (storeNames.includes('component_versions')) component_versions = await promisify(tx.objectStore('component_versions').getAll());
        if (storeNames.includes('activity_log')) activity_log = await promisify(tx.objectStore('activity_log').getAll());
        if (storeNames.includes('covers')) covers = await promisify(tx.objectStore('covers').getAll());
        if (storeNames.includes('universes')) universes = await promisify(tx.objectStore('universes').getAll());
      }
    } catch (e) {
      console.warn('Could not export versions/activity/covers/universes', e);
    }

    return {
      _version: 3,
      _exportedAt: new Date().toISOString(),
      components,
      projects,
      personas,
      trackerRecords,
      component_versions,
      activity_log,
      covers,
      universes
    };
  }

  async function importVault(bundle) {
    if (!bundle || (bundle._version !== 1 && bundle._version !== 2 && bundle._version !== 3)) throw new Error('Unrecognised backup format.');
    const db = dbInstance || await initDB();

    const stores = ['vault_components', 'projects', 'personas', 'tracker_records', 'component_versions', 'activity_log', 'covers', 'universes'];
    const keys = ['components', 'projects', 'personas', 'trackerRecords', 'component_versions', 'activity_log', 'covers', 'universes'];

    for (let i = 0; i < stores.length; i++) {
      const storeName = stores[i];
      const records = bundle[keys[i]] || [];
      if (!records.length) continue;

      if (!db.objectStoreNames.contains(storeName)) continue;

      // Shape-check: reject records with non-string ids or HTML-like name fields
      const safeRecords = records.filter(rec => {
        if (!rec || typeof rec !== 'object') return false;
        if (rec.id !== undefined && typeof rec.id !== 'string') return false;
        // Reject names/titles that contain angle brackets (basic HTML injection guard)
        const nameLike = rec.name || rec.title || '';
        if (typeof nameLike === 'string' && /<[^>]+>/.test(nameLike)) {
          console.warn('[importVault] Skipping record with HTML-like name:', nameLike);
          return false;
        }
        return true;
      });

      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        safeRecords.forEach(rec => store.put(rec));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  }


  // --- Relationship Integrity Helpers ---

  async function linkReleaseToStory(storyId, releaseId) {
    if (!storyId || !releaseId) return;
    const story = await getTrackerRecord(storyId);
    const release = await getTrackerRecord(releaseId);
    if (!story || !release) return;

    const updatedReleaseIds = Array.from(new Set([...(story.releaseIds || []), releaseId]));
    await saveTrackerRecord({ ...story, status: 'Promoted', releaseIds: updatedReleaseIds });
    await saveTrackerRecord({ ...release, sourceStoryId: storyId, releaseSource: 'story' });
  }

  async function unlinkReleaseFromStory(storyId, releaseId) {
    if (!storyId || !releaseId) return;
    const story = await getTrackerRecord(storyId);
    const release = await getTrackerRecord(releaseId);

    if (story) {
      const updatedReleaseIds = (story.releaseIds || []).filter(id => id !== releaseId);
      await saveTrackerRecord({ ...story, releaseIds: updatedReleaseIds });
    }

    if (release && release.sourceStoryId === storyId) {
      await saveTrackerRecord({ ...release, sourceStoryId: null });
    }
  }

  async function reconcileStoryReleaseLinks(storyId) {
    const story = await getTrackerRecord(storyId);
    if (!story) return;
    const allRecords = await getAllTrackerRecords();
    const actualReleases = allRecords.filter(r => r.assetType === 'release' && r.sourceStoryId === storyId);
    const actualIds = actualReleases.map(r => r.id);
    await saveTrackerRecord({ ...story, releaseIds: actualIds });
  }

  // Expose APIs globally
  window.ForgeDB = {
    generateId,
    initDB,
    getAllComponents,
    getComponent,
    saveComponent,
    deleteComponent,
    getAllProjects,
    getProject,
    saveProject,
    deleteProject,
    getChatHistory,
    saveChatHistory,
    clearChatHistory,
    getCover,
    saveCover,
    deleteCover,
    getAllPersonas,
    getPersona,
    savePersona,
    deletePersona,
    getAllTrackerRecords,
    getTrackerRecord,
    saveTrackerRecord,
    deleteTrackerRecord,
    linkReleaseToStory,
    unlinkReleaseFromStory,
    reconcileStoryReleaseLinks,
    getAllUniverses,
    getUniverse,
    saveUniverse,
    deleteUniverse,
    getUniverseColorMap,
    DEFAULT_UNIVERSES,
    updateVaultTracker,
    defaultTrackerPipeline,
    exportVault,
    importVault,
    saveComponentVersion,
    getComponentVersions,
    deleteOldVersions,
    logActivity,
    getRecentActivity,
    getTargetActivity,
    pruneActivityLog,
    captureSnapshot,
    getSnapshots,
    saveSnapshot,
    saveAutoBackup,
    getLatestAutoBackup,
    getAllAutoBackups,
    findSimilarComponents,
    levenshteinDistance
  };
})();
