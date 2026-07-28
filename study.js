(() => {
  const STORAGE_KEY = 'digital-anki-projects-v1';
  const CATS_KEY = 'digital-anki-categories-v1';
  const BOOK_COVER_SVG = 'assets/bookcover.svg';

  const btnBackHome = document.getElementById('btnBackHome');
  const btnDisplayMenu = document.getElementById('btnDisplayMenu');
  const btnSortMenu = document.getElementById('btnSortMenu');
  const btnDeleteMode = document.getElementById('btnDeleteMode');
  const displayLabel = document.getElementById('displayLabel');
  const sortLabel = document.getElementById('sortLabel');

  const deleteModePanel = document.getElementById('deleteModePanel');
  const deleteModeCount = document.getElementById('deleteModeCount');
  const btnCancelDeleteMode = document.getElementById('btnCancelDeleteMode');
  const btnConfirmDeleteMode = document.getElementById('btnConfirmDeleteMode');

  const booksList = document.getElementById('booksList');
  const emptyState = document.getElementById('emptyState');

  const displaySheet = document.getElementById('displaySheet');
  const sortSheet = document.getElementById('sortSheet');
  const displayOptions = document.getElementById('displayOptions');
  const sortOptions = document.getElementById('sortOptions');

  const state = {
    displayFilter: 'all',
    sortOrder: 'new',
    deleteMode: false,
    selectedDeleteIds: new Set(),
  };

  const DISPLAY_LABELS = {
    all: 'すべて表示',
    checked: 'お気に入りのみ',
  };

  const SORT_LABELS = {
    new: '新しい順',
    old: '古い順',
  };

  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function loadAllProjects() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch (e) {
      return [];
    }
  }

  function saveAllProjects(projects) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects }));
  }

  function loadAllCategories() {
    const raw = localStorage.getItem(CATS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.categories) ? parsed.categories : [];
    } catch (e) {
      return [];
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  function normalizeBook(record) {
    const base = record && typeof record === 'object' ? record : {};
    const copy = JSON.parse(JSON.stringify(base));

    const fallbackImage = copy.imageDataUrl
      ? {
          id: `${copy.id || uid('book')}-image`,
          title: copy.name || '無題',
          imageDataUrl: copy.imageDataUrl,
          masks: Array.isArray(copy.masks) ? copy.masks : [],
          createdAt: copy.createdAt || Date.now(),
        }
      : null;

    const normalizedImages = Array.isArray(copy.images) && copy.images.length
      ? copy.images
          .map((img, index) => {
            if (!img || typeof img !== 'object') return null;
            const imageDataUrl = img.imageDataUrl || img.dataUrl || '';
            if (!imageDataUrl) return null;
            return {
              id: img.id || `${copy.id || uid('book')}-image-${index}`,
              title: img.title || copy.name || '無題',
              imageDataUrl,
              masks: Array.isArray(img.masks) ? img.masks : [],
              createdAt: img.createdAt || copy.createdAt || Date.now(),
            };
          })
          .filter(Boolean)
      : (fallbackImage ? [fallbackImage] : []);

    return {
      ...copy,
      id: copy.id || uid('book'),
      name: copy.name || '無題',
      createdAt: copy.createdAt || Date.now(),
      categories: Array.isArray(copy.categories) ? copy.categories.filter(Boolean) : [],
      images: normalizedImages,
    };
  }

  function getDisplayLabel(value) {
    if (value === 'all') return DISPLAY_LABELS.all;
    if (value === 'checked') return DISPLAY_LABELS.checked;
    if (String(value).startsWith('cat::')) {
      const catName = String(value).replace('cat::', '');
      return `カテゴリ: ${catName}`;
    }
    return DISPLAY_LABELS.all;
  }

  function getSortLabel(value) {
    return SORT_LABELS[value] || SORT_LABELS.new;
  }

  function setDisplayFilter(value) {
    state.displayFilter = value;
    displayLabel.textContent = getDisplayLabel(value);
    closeSheets();
    renderBooks();
  }

  function setSortOrder(value) {
    state.sortOrder = value;
    sortLabel.textContent = getSortLabel(value);
    closeSheets();
    renderBooks();
  }

  function openSheet(sheetEl) {
    closeSheets();
    if (sheetEl) sheetEl.classList.remove('hidden');
  }

  function closeSheets() {
    [displaySheet, sortSheet].forEach((sheet) => {
      if (sheet) sheet.classList.add('hidden');
    });
  }

  function renderDisplayOptions() {
    if (!displayOptions) return;
    displayOptions.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'study-sheet__option';
    allBtn.textContent = 'すべて表示';
    allBtn.addEventListener('click', () => setDisplayFilter('all'));
    displayOptions.appendChild(allBtn);

    const checkedBtn = document.createElement('button');
    checkedBtn.type = 'button';
    checkedBtn.className = 'study-sheet__option';
    checkedBtn.textContent = 'お気に入り画像のみ';
    checkedBtn.addEventListener('click', () => setDisplayFilter('checked'));
    displayOptions.appendChild(checkedBtn);

    const cats = loadAllCategories();
    cats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study-sheet__option';
      btn.textContent = cat;
      btn.addEventListener('click', () => setDisplayFilter(`cat::${cat}`));
      displayOptions.appendChild(btn);
    });
  }

  function renderSortOptions() {
    if (!sortOptions) return;
    sortOptions.innerHTML = '';

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'study-sheet__option';
    newBtn.textContent = '新しい順';
    newBtn.addEventListener('click', () => setSortOrder('new'));
    sortOptions.appendChild(newBtn);

    const oldBtn = document.createElement('button');
    oldBtn.type = 'button';
    oldBtn.className = 'study-sheet__option';
    oldBtn.textContent = '古い順';
    oldBtn.addEventListener('click', () => setSortOrder('old'));
    sortOptions.appendChild(oldBtn);
  }

  function updateDeletePanel() {
    const count = state.selectedDeleteIds.size;
    if (deleteModePanel) {
      deleteModePanel.classList.toggle('hidden', !state.deleteMode);
    }
    if (deleteModeCount) {
      deleteModeCount.textContent = String(count);
    }
    if (btnDeleteMode) {
      btnDeleteMode.textContent = state.deleteMode ? '選択中' : '削除';
      btnDeleteMode.disabled = state.deleteMode;
    }
    if (btnConfirmDeleteMode) {
      btnConfirmDeleteMode.disabled = count === 0;
    }
  }

  function enterDeleteMode() {
    state.deleteMode = true;
    state.selectedDeleteIds.clear();
    closeSheets();
    updateDeletePanel();
    renderBooks();
  }

  function cancelDeleteMode() {
    state.deleteMode = false;
    state.selectedDeleteIds.clear();
    updateDeletePanel();
    renderBooks();
  }

  function toggleDeleteSelection(bookId, nextState) {
    if (nextState) {
      state.selectedDeleteIds.add(bookId);
    } else {
      state.selectedDeleteIds.delete(bookId);
    }
    updateDeletePanel();
    renderBooks();
  }

  function updateProjectField(projectId, updater) {
    const all = loadAllProjects();
    const idx = all.findIndex((project) => project.id === projectId);
    if (idx < 0) return false;
    updater(all[idx]);
    saveAllProjects(all);
    return true;
  }

  function navigateToBook(bookId) {
    location.href = `book.html?id=${encodeURIComponent(bookId)}`;
  }

  function createCoverElement() {
    const coverWrap = document.createElement('div');
    coverWrap.className = 'book-card__cover';

    const img = document.createElement('img');
    img.src = BOOK_COVER_SVG;
    img.alt = '';
    img.className = 'book-card__cover-image';
    img.loading = 'lazy';
    img.draggable = false;

    img.addEventListener('error', () => {
      if (!coverWrap.isConnected) return;
      const fallback = document.createElement('div');
      fallback.className = 'book-card__cover-placeholder';
      fallback.textContent = 'BOOK';
      coverWrap.replaceChildren(fallback);
    });

    coverWrap.appendChild(img);
    return coverWrap;
  }

  function renderBooks() {
    if (!booksList || !emptyState) return;

    const allBooks = loadAllProjects().map(normalizeBook);

    let filteredBooks = allBooks.slice();
    const filterVal = state.displayFilter;

    if (filterVal === 'checked') {
      filteredBooks = filteredBooks.filter((book) => !!book.checked);
    } else if (String(filterVal).startsWith('cat::')) {
      const catName = String(filterVal).replace('cat::', '');
      filteredBooks = filteredBooks.filter((book) => Array.isArray(book.categories) && book.categories.includes(catName));
    }

    filteredBooks.sort((a, b) => {
      const aTime = Number(a.createdAt) || 0;
      const bTime = Number(b.createdAt) || 0;
      return state.sortOrder === 'old' ? aTime - bTime : bTime - aTime;
    });

    booksList.innerHTML = '';

    const hasAnyBooks = allBooks.length > 0;
    const hasAnyFilteredBooks = filteredBooks.length > 0;

    if (!hasAnyFilteredBooks) {
      emptyState.classList.remove('hidden');
      emptyState.textContent = hasAnyBooks
        ? '条件に合うBookがありません。'
        : '新しくBookを作りましょう。';
      return;
    }

    emptyState.classList.add('hidden');

    filteredBooks.forEach((book) => {
      const card = document.createElement('article');
      card.className = 'book-card';
      card.dataset.bookId = book.id;
      card.classList.toggle('is-delete-mode', state.deleteMode);
      card.classList.toggle('is-selected-for-delete', state.selectedDeleteIds.has(book.id));

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'book-card__open';
      openButton.setAttribute('aria-label', `${book.name} を開く`);

      const coverWrap = createCoverElement();

      openButton.appendChild(coverWrap);

      const title = document.createElement('h2');
      title.className = 'book-card__title';
      title.textContent = book.name || '無題';

      const date = document.createElement('div');
      date.className = 'book-card__date';
      date.textContent = formatDate(book.createdAt);

      coverWrap.appendChild(title);
      coverWrap.appendChild(date);

      openButton.addEventListener('click', () => {
        if (state.deleteMode) {
          toggleDeleteSelection(book.id, !state.selectedDeleteIds.has(book.id));
          return;
        }
        navigateToBook(book.id);
      });

      const controls = document.createElement('div');
      controls.className = 'book-card__controls';

      const weakLabel = document.createElement('label');
      weakLabel.className = 'book-card__weak-toggle';

      const weakInput = document.createElement('input');
      weakInput.type = 'checkbox';
      weakInput.checked = !!book.checked;
      weakInput.title = 'お気に入りBook';
      weakInput.addEventListener('click', (ev) => {
        ev.stopPropagation();
      });
      weakInput.addEventListener('change', () => {
        updateProjectField(book.id, (project) => {
          project.checked = weakInput.checked;
        });
      });

      const weakText = document.createElement('span');
      weakText.textContent = 'お気に入り';

      weakLabel.appendChild(weakInput);
      weakLabel.appendChild(weakText);

      coverWrap.appendChild(weakLabel);

      card.appendChild(openButton);
      card.appendChild(controls);

      booksList.appendChild(card);
    });

    updateDeletePanel();
  }

  function confirmDeleteSelectedBooks() {
    const ids = Array.from(state.selectedDeleteIds);
    if (!ids.length) {
      alert('削除するBookを選んでください');
      return;
    }

    const ok = confirm(`選択した ${ids.length} 冊を削除しますか？`);
    if (!ok) return;

    const remaining = loadAllProjects().filter((project) => !state.selectedDeleteIds.has(project.id));
    saveAllProjects(remaining);
    cancelDeleteMode();
    renderBooks();
  }

  function wireSheet(sheetEl) {
    if (!sheetEl) return;
    sheetEl.addEventListener('click', (ev) => {
      const target = ev.target;
      if (target && target.matches('[data-sheet-close]')) {
        closeSheets();
      }
    });
  }

  if (btnBackHome) {
    btnBackHome.addEventListener('click', () => {
      location.href = 'index.html';
    });
  }

  if (btnDisplayMenu) {
    btnDisplayMenu.addEventListener('click', () => {
      renderDisplayOptions();
      openSheet(displaySheet);
    });
  }

  if (btnSortMenu) {
    btnSortMenu.addEventListener('click', () => {
      renderSortOptions();
      openSheet(sortSheet);
    });
  }

  if (btnDeleteMode) {
    btnDeleteMode.addEventListener('click', () => {
      enterDeleteMode();
    });
  }

  if (btnCancelDeleteMode) {
    btnCancelDeleteMode.addEventListener('click', () => {
      cancelDeleteMode();
    });
  }

  if (btnConfirmDeleteMode) {
    btnConfirmDeleteMode.addEventListener('click', () => {
      confirmDeleteSelectedBooks();
    });
  }

  if (displayOptions) {
    displayOptions.addEventListener('click', (ev) => {
      const button = ev.target.closest('button[data-value]');
      if (!button) return;
      setDisplayFilter(button.dataset.value || 'all');
    });
  }

  if (sortOptions) {
    sortOptions.addEventListener('click', (ev) => {
      const button = ev.target.closest('button[data-value]');
      if (!button) return;
      setSortOrder(button.dataset.value || 'new');
    });
  }

  wireSheet(displaySheet);
  wireSheet(sortSheet);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      closeSheets();
      if (state.deleteMode) cancelDeleteMode();
    }
  });

  function prepareSheetOptions() {
    if (displayOptions) {
      displayOptions.innerHTML = '';
      const baseOptions = [
        { value: 'all', label: 'すべて表示' },
        { value: 'checked', label: 'お気に入りのみ' },
      ];

      baseOptions.forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'study-sheet__option';
        btn.dataset.value = option.value;
        btn.textContent = option.label;
        displayOptions.appendChild(btn);
      });

      loadAllCategories().forEach((cat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'study-sheet__option';
        btn.dataset.value = `cat::${cat}`;
        btn.textContent = cat;
        displayOptions.appendChild(btn);
      });
    }

    if (sortOptions) {
      sortOptions.innerHTML = '';

      [
        { value: 'new', label: '新しい順' },
        { value: 'old', label: '古い順' },
      ].forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'study-sheet__option';
        btn.dataset.value = option.value;
        btn.textContent = option.label;
        sortOptions.appendChild(btn);
      });
    }
  }

  function syncToolbarLabels() {
    if (displayLabel) displayLabel.textContent = getDisplayLabel(state.displayFilter);
    if (sortLabel) sortLabel.textContent = getSortLabel(state.sortOrder);
  }

  function init() {
    prepareSheetOptions();
    syncToolbarLabels();
    updateDeletePanel();
    renderBooks();
  }

  init();
})();