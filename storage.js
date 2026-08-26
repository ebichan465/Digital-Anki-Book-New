(() => {
  'use strict';

  /*
   * Digital Anki Book
   * storage.js
   *
   * 役割:
   * - IndexedDBの初期化・接続
   * - projectsのCRUD
   * - categoriesの保存・取得
   * - 既存localStorageからIndexedDBへの初回移行
   *
   * 今回は既存データ構造を変更しない。
   * imageDataUrlもそのまま保存する。
   */

  const DB_NAME = 'DigitalAnkiBookDB';
  const DB_VERSION = 1;

  const PROJECTS_STORE = 'projects';
  const CATEGORIES_STORE = 'categories';

  const LEGACY_PROJECTS_KEY = 'digital-anki-projects-v1';
  const LEGACY_CATEGORIES_KEY = 'digital-anki-categories-v1';

  const MIGRATION_FLAG_KEY = 'digital-anki-indexeddb-migrated-v1';

  let dbPromise = null;

  /*
   * ------------------------------------------------------------
   * 共通ユーティリティ
   * ------------------------------------------------------------
   */

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

  function safeClone(value) {
    if (value === undefined) return undefined;

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (e) {
        // fallback
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

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

  function isMigrationCompleted() {
    try {
      return localStorage.getItem(MIGRATION_FLAG_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markMigrationCompleted() {
    try {
      localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    } catch (e) {
      console.warn('IndexedDB移行完了フラグの保存に失敗しました。', e);
    }
  }

  /*
   * ------------------------------------------------------------
   * IndexedDB初期化
   * ------------------------------------------------------------
   */

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

        /*
         * projects
         *
         * 1レコード = 1教材
         *
         * 現在のprojectオブジェクトを基本的にそのまま保存する。
         */
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, {
            keyPath: 'id'
          });
        }

        /*
         * categories
         *
         * カテゴリ全体を1レコードとして保存する。
         * key = 'all'
         *
         * 今回はカテゴリデータの構造自体を変更しない。
         */
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

  /*
   * ------------------------------------------------------------
   * 初期化
   * ------------------------------------------------------------
   */

  async function initializeStorage() {
    const db = await openDatabase();

    /*
     * 初回のみlegacy localStorageから移行する。
     *
     * 移行後もlocalStorageのデータ自体は削除しない。
     * これは既存データ消失を避けるため。
     */
    if (!isMigrationCompleted()) {
      await migrateFromLocalStorage(db);
    }

    return db;
  }

  /*
   * ------------------------------------------------------------
   * localStorage → IndexedDB 移行
   * ------------------------------------------------------------
   */

  async function migrateFromLocalStorage(db) {
    const legacyProjects = getLegacyProjects();
    const legacyCategories = getLegacyCategories();

    /*
     * 何も移行するものがない場合でも、
     * 「確認済み」としてフラグを立てる。
     */
    if (!legacyProjects.length && !legacyCategories.length) {
      markMigrationCompleted();
      return;
    }

    /*
     * projectsを移行
     */
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

    /*
     * categoriesを移行
     *
     * 既存localStorage:
     * {
     *   categories: [...]
     * }
     *
     * IndexedDB:
     * {
     *   id: 'all',
     *   categories: [...]
     * }
     */
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

    /*
     * すべての移行処理が完了してからフラグを立てる。
     */
    markMigrationCompleted();
  }

  /*
   * ------------------------------------------------------------
   * Projects
   * ------------------------------------------------------------
   */

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

  async function saveProjects(projects) {
  if (!Array.isArray(projects)) {
    throw new Error('projectsが配列ではありません。');
  }

  const db = await initializeStorage();

  /*
   * まずreadonly transactionで、
   * 現在IndexedDBに存在するprojectのIDだけ取得する。
   *
   * readwrite transactionの途中でawaitして、
   * transactionが自動終了してしまうのを防ぐ。
   */
  const readTransaction = db.transaction(
    PROJECTS_STORE,
    'readonly'
  );

  const readStore = readTransaction.objectStore(PROJECTS_STORE);

  const existingProjects = await requestToPromise(
    readStore.getAll()
  );

  /*
   * 今回保存するprojectのID一覧
   */
  const nextIds = new Set(
    projects
      .filter((project) => (
        project &&
        typeof project === 'object' &&
        project.id
      ))
      .map((project) => project.id)
  );

  /*
   * ここから実際の書き込み。
   * このtransaction内ではawaitしない。
   */
  const writeTransaction = db.transaction(
    PROJECTS_STORE,
    'readwrite'
  );

  const writeStore = writeTransaction.objectStore(PROJECTS_STORE);

  /*
   * 現在存在するが、今回保存する配列に存在しないprojectを削除。
   */
  for (const project of existingProjects) {
    if (!nextIds.has(project.id)) {
      writeStore.delete(project.id);
    }
  }

  /*
   * 今回保存するprojectを追加・更新。
   */
  for (const project of projects) {
    if (!project || typeof project !== 'object') {
      continue;
    }

    if (!project.id) {
      continue;
    }

    writeStore.put(safeClone(project));
  }

  await transactionToPromise(writeTransaction);

  return safeClone(projects);
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

  /*
   * ------------------------------------------------------------
   * Categories
   * ------------------------------------------------------------
   */

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

  /*
   * ------------------------------------------------------------
   * Storage状態確認用
   * ------------------------------------------------------------
   *
   * 今後のデバッグやテストで使えるようにする。
   */

  async function getStorageInfo() {
    const db = await initializeStorage();

    const projects = await getAllProjects();
    const categories = await getAllCategories();

    return {
      databaseName: DB_NAME,
      databaseVersion: db.version,
      projectsCount: projects.length,
      categoriesCount: categories.length,
      migrationCompleted: isMigrationCompleted()
    };
  }

  /*
   * ------------------------------------------------------------
   * DB削除
   * ------------------------------------------------------------
   *
   * 開発・デバッグ用。
   * 通常のアプリ処理からは使用しない。
   */

  async function deleteDatabase() {
    if (dbPromise) {
      try {
        const db = await dbPromise;
        db.close();
      } catch (e) {
        // ignore
      }

      dbPromise = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => {
        try {
          localStorage.removeItem(MIGRATION_FLAG_KEY);
        } catch (e) {
          // ignore
        }

        resolve(true);
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error('IndexedDBの削除に失敗しました。')
        );
      };

      request.onblocked = () => {
        console.warn(
          'IndexedDB削除がブロックされています。'
        );
      };
    });
  }

  /*
   * ------------------------------------------------------------
   * 公開API
   * ------------------------------------------------------------
   *
   * 他のJSファイルからは、
   *
   * DigitalAnkiStorage.getAllProjects()
   * DigitalAnkiStorage.saveProject(project)
   *
   * のように利用する。
   */

  window.DigitalAnkiStorage = Object.freeze({
    initializeStorage,

    getAllProjects,
    getProjectById,
    saveProject,
    saveProjects,
    deleteProject,
    deleteProjects,

    getAllCategories,
    saveAllCategories,

    getStorageInfo,

    deleteDatabase
  });

})();