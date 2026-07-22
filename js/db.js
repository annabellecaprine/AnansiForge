/**
 * db.js - IndexedDB wrapper for Anansi Forge.
 * 
 * Database: "anansi-forge" v5
 * Stores:
 *   - "vault_components" (keyPath: "id")
 *   - "projects" (keyPath: "id")
 *   - "chat_history" (keyPath: "projectId")
 */

(() => {
  const DB_NAME = 'anansi-forge';
  const DB_VERSION = 6;
  
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
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');
    
    const now = new Date().toISOString();
    const cat = comp.category || 'character';
    const record = {
      ...comp,
      id: comp.id || generateId(),
      name: (comp.name || 'Unnamed Item').trim(),
      category: cat,
      lineage: (comp.lineage || '').trim(),
      scenarios: Array.isArray(comp.scenarios) ? comp.scenarios : [],
      isTemplate: comp.isTemplate === true,
      content: comp.content || '',
      tags: Array.isArray(comp.tags) ? comp.tags : [],
      tracker: comp.tracker || { universe: '', project: '', priority: null, pipeline: defaultTrackerPipeline(cat), publishedDate: null, trackerTags: [] },
      createdAt: comp.createdAt || now,
      modifiedAt: now
    };
    // Ensure old cluster key is not persisted
    delete record.cluster;
    
    await promisify(store.put(record));
    return record;
  }

  async function deleteComponent(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');
    return promisify(store.delete(id));
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

  async function getAllTrackerRecords() {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readonly');
    const store = tx.objectStore('tracker_records');
    return promisify(store.getAll());
  }

  async function getTrackerRecord(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readonly');
    const store = tx.objectStore('tracker_records');
    return promisify(store.get(id));
  }

  async function saveTrackerRecord(rec) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readwrite');
    const store = tx.objectStore('tracker_records');
    const now = new Date().toISOString();
    const aType = rec.assetType || 'concept_stub';
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
      // release-only
      projectId: rec.projectId || null,
      visibility: rec.visibility || null,
      scheduledDate: rec.scheduledDate || null,
      metrics: rec.metrics || { messages: 0, chats: 0 },
      // stub-only
      intendedCategory: rec.intendedCategory || 'character',
      promotedToVaultId: rec.promotedToVaultId || null,
      createdAt: rec.createdAt || now,
      updatedAt: now
    };
    await promisify(store.put(record));
    return record;
  }

  async function deleteTrackerRecord(id) {
    const db = dbInstance || await initDB();
    const tx = db.transaction('tracker_records', 'readwrite');
    const store = tx.objectStore('tracker_records');
    return promisify(store.delete(id));
  }

  async function updateVaultTracker(id, trackerPatch) {
    const db = dbInstance || await initDB();
    const comp = await getComponent(id);
    if (!comp) throw new Error('Component not found: ' + id);
    comp.tracker = { ...(comp.tracker || defaultTracker()), ...trackerPatch };
    comp.modifiedAt = new Date().toISOString();
    const tx = db.transaction('vault_components', 'readwrite');
    const store = tx.objectStore('vault_components');
    await promisify(store.put(comp));
    return comp;
  }

  // --- Vault Backup / Restore ---

  async function exportVault() {
    const components     = await getAllComponents();
    const projects       = await getAllProjects();
    const personas       = await getAllPersonas();
    const trackerRecords = await getAllTrackerRecords();
    return {
      _version: 2,
      _exportedAt: new Date().toISOString(),
      components,
      projects,
      personas,
      trackerRecords
    };
  }

  async function importVault(bundle) {
    if (!bundle || (bundle._version !== 1 && bundle._version !== 2)) throw new Error('Unrecognised backup format.');
    const db = dbInstance || await initDB();

    const stores = ['vault_components', 'projects', 'personas', 'tracker_records'];
    const keys   = ['components',       'projects',  'personas', 'trackerRecords'];

    for (let i = 0; i < stores.length; i++) {
      const storeName = stores[i];
      const records   = bundle[keys[i]] || [];
      if (!records.length) continue;

      await new Promise((resolve, reject) => {
        const tx    = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        records.forEach(rec => store.put(rec));
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      });
    }
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
    updateVaultTracker,
    defaultTrackerPipeline,
    exportVault,
    importVault
  };
})();
