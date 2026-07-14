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
  const DB_VERSION = 5;
  
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
    const record = {
      ...comp,
      id: comp.id || generateId(),
      name: (comp.name || 'Unnamed Item').trim(),
      category: comp.category || 'character',
      lineage: (comp.lineage || '').trim(),
      scenarios: Array.isArray(comp.scenarios) ? comp.scenarios : [],
      isTemplate: comp.isTemplate === true,
      content: comp.content || '',
      tags: Array.isArray(comp.tags) ? comp.tags : [],
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

  // --- Vault Backup / Restore ---

  async function exportVault() {
    const components = await getAllComponents();
    const projects   = await getAllProjects();
    const personas   = await getAllPersonas();
    return {
      _version: 1,
      _exportedAt: new Date().toISOString(),
      components,
      projects,
      personas
    };
  }

  async function importVault(bundle) {
    if (!bundle || bundle._version !== 1) throw new Error('Unrecognised backup format.');
    const db = dbInstance || await initDB();

    const stores = ['vault_components', 'projects', 'personas'];
    const keys   = ['components',       'projects',  'personas'];

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
    exportVault,
    importVault
  };
})();
