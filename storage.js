(() => {
  'use strict';

  // IndexedDBを使った教材・カテゴリデータの保存処理

  const DB_NAME = 'DigitalAnkiBookDB';
  const DB_VERSION = 1;

  const PROJECTS_STORE = 'projects';
  const CATEGORIES_STORE = 'categories';

  const LEGACY_PROJECTS_KEY = 'digital-anki-projects-v1';
  const LEGACY_CATEGORIES_KEY = 'digital-anki-categories-v1';

  const MIGRATION_FLAG_KEY = 'digital-anki-indexeddb-migrated-v1';

  let dbPromise = null;

  // 共通処理

  // IndexedDBの処理をPromiseとして扱うための変換
  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('IndexedDB request failed.'));
      };
    });
  }

// IndexedDBの処理完了をPromiseとして扱うための変換 
  function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error('IndexedDB transaction failed.'));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error('IndexedDB transaction aborted.'));
      };
    });
  }

  // データの複製
  function safeClone(value) {
    if (value === undefined) return undefined;

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (e) {
        
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  // localStorageからJSONデータを取得  
  function readLegacyJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.error(`localStorageの読み込みに失敗しました: ${key}`, e);
      return fallback;
    }
  }

  function getLegacyProjects() {
    const parsed = readLegacyJson(LEGACY_PROJECTS_KEY, null);

    if (!parsed || !Array.isArray(parsed.projects)) {
      return [];
    }

    return parsed.projects;
  }

  function getLegacyCategories() {
    const parsed = readLegacyJson(LEGACY_CATEGORIES_KEY, null);

    if (!parsed || !Array.isArray(parsed.categories)) {
      return [];
    }

    return parsed.categories;
  }

  // IndexedDBへの移行完了状態の確認  
  function isMigrationCompleted() {
    try {
      return localStorage.getItem(MIGRATION_FLAG_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  // IndexedDBへの移行完了状態の保存 
  function markMigrationCompleted() {
    try {
      localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    } catch (e) {
      console.warn('IndexedDB移行完了フラグの保存に失敗しました。', e);
    }
  }

  // IndexedDBの初期化
  function openDatabase() {
    if (dbPromise) {
      return dbPromise;
    }

    if (!('indexedDB' in window)) {
      return Promise.reject(
        new Error('このブラウザではIndexedDBが利用できません。')
      );
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // 教材データ用の保存場所
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, {
            keyPath: 'id'
          });
        }

        // カテゴリ一覧をまとめて保存する場所
        if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
          db.createObjectStore(CATEGORIES_STORE, {
            keyPath: 'id'
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };

        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(
          request.error ||
          new Error('IndexedDBを開けませんでした。')
        );
      };

      request.onblocked = () => {
        console.warn(
          'IndexedDBの更新がブロックされています。'
        );
      };
    });

    return dbPromise;
  }

  // 保存先の初期化
  async function initializeStorage() {
    const db = await openDatabase();

    if (!isMigrationCompleted()) {
      await migrateFromLocalStorage(db);
    }

    return db;
  }

  // localStorageからIndexedDBへの移行
  async function migrateFromLocalStorage(db) {
    const legacyProjects = getLegacyProjects();
    const legacyCategories = getLegacyCategories();

    // 移行対象がない場合の処理
    if (!legacyProjects.length && !legacyCategories.length) {
      markMigrationCompleted();
      return;
    }

    // 教材データの移行
    if (legacyProjects.length) {
      const transaction = db.transaction(
        PROJECTS_STORE,
        'readwrite'
      );

      const store = transaction.objectStore(PROJECTS_STORE);

      for (const project of legacyProjects) {
        if (!project || typeof project !== 'object') {
          continue;
        }

        if (!project.id) {
          continue;
        }

        store.put(safeClone(project));
      }

      await transactionToPromise(transaction);
    }

    // カテゴリ一覧の移行
    if (legacyCategories.length) {
      const transaction = db.transaction(
        CATEGORIES_STORE,
        'readwrite'
      );

      const store = transaction.objectStore(CATEGORIES_STORE);

      store.put({
        id: 'all',
        categories: safeClone(legacyCategories)
      });

      await transactionToPromise(transaction);
    }

    // 移行完了状態の保存
    markMigrationCompleted();
  }

  // 教材データの取得・保存・削除
  async function getAllProjects() {
    const db = await initializeStorage();

    const transaction = db.transaction(
      PROJECTS_STORE,
      'readonly'
    );

    const store = transaction.objectStore(PROJECTS_STORE);

    return requestToPromise(store.getAll());
  }

  async function getProjectById(projectId) {
    if (!projectId) {
      return null;
    }

    const db = await initializeStorage();

    const transaction = db.transaction(
      PROJECTS_STORE,
      'readonly'
    );

    const store = transaction.objectStore(PROJECTS_STORE);

    const result = await requestToPromise(
      store.get(projectId)
    );

    return result || null;
  }

  async function saveProject(project) {
    if (!project || typeof project !== 'object') {
      throw new Error('保存するprojectが不正です。');
    }

    if (!project.id) {
      throw new Error('project.idがありません。');
    }

    const db = await initializeStorage();

    const transaction = db.transaction(
      PROJECTS_STORE,
      'readwrite'
    );

    const store = transaction.objectStore(PROJECTS_STORE);

    store.put(safeClone(project));

    await transactionToPromise(transaction);

    return safeClone(project);
  }

  async function deleteProject(projectId) {
    if (!projectId) {
      return false;
    }

    const db = await initializeStorage();

    const transaction = db.transaction(
      PROJECTS_STORE,
      'readwrite'
    );

    const store = transaction.objectStore(PROJECTS_STORE);

    store.delete(projectId);

    await transactionToPromise(transaction);

    return true;
  }

  async function deleteProjects(projectIds) {
    if (!Array.isArray(projectIds)) {
      throw new Error('削除するproject IDが配列ではありません。');
    }

    const db = await initializeStorage();

    const transaction = db.transaction(
      PROJECTS_STORE,
      'readwrite'
    );

    const store = transaction.objectStore(PROJECTS_STORE);

    for (const projectId of projectIds) {
      if (!projectId) {
        continue;
      }

      store.delete(projectId);
    }

    await transactionToPromise(transaction);

    return true;
  }

  // カテゴリ一覧の取得・保存
  async function getAllCategories() {
    const db = await initializeStorage();

    const transaction = db.transaction(
      CATEGORIES_STORE,
      'readonly'
    );

    const store = transaction.objectStore(CATEGORIES_STORE);

    const result = await requestToPromise(
      store.get('all')
    );

    if (!result || !Array.isArray(result.categories)) {
      return [];
    }

    return safeClone(result.categories);
  }

  async function saveAllCategories(categories) {
    if (!Array.isArray(categories)) {
      throw new Error('categoriesが配列ではありません。');
    }

    const db = await initializeStorage();

    const transaction = db.transaction(
      CATEGORIES_STORE,
      'readwrite'
    );

    const store = transaction.objectStore(CATEGORIES_STORE);

    store.put({
      id: 'all',
      categories: safeClone(categories)
    });

    await transactionToPromise(transaction);

    return safeClone(categories);
  }

  // 他のJavaScriptファイルから利用する処理の公開
  window.DigitalAnkiStorage = Object.freeze({
    initializeStorage,

    getAllProjects,
    getProjectById,
    saveProject,
    deleteProject,
    deleteProjects,

    getAllCategories,
    saveAllCategories
  });

})();