(() => {
  const STORAGE_KEY = 'digital-anki-projects-v1';
  const CATS_KEY = 'digital-anki-categories-v1';
  const BOOK_COVER_SVG = 'assets/bookcover.svg';

  const btnBackHome = document.getElementById('btnBackHome');
  const btnDisplayMenu = document.getElementById('btnDisplayMenu');
  const btnSortMenu = document.getElementById('btnSortMenu');
  const btnDeleteMode = document.getElementById('btnSelectDelete');
  const btnTodayReview = document.getElementById('btnTodayReview');
  const displayLabel = document.getElementById('displayCurrentLabel');
  const sortLabel = document.getElementById('sortCurrentLabel');

  const deleteModePanel = document.getElementById('deleteModePanel');
  const deleteModeCount = document.getElementById('deleteModeCount');
  const btnCancelDeleteMode = document.getElementById('btnCancelDeleteMode');
  const btnConfirmDeleteMode = document.getElementById('btnConfirmDeleteMode');
  const selectionBar = document.getElementById('selectionBar');
  const selectionCount = document.getElementById('selectionCount');
  const selectionCancel = document.getElementById('selectionCancel');
  const selectionDelete = document.getElementById('selectionDelete');

  const booksList = document.getElementById('booksList');
  const emptyState = document.getElementById('emptyState');

  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const sheetTitle = document.getElementById('sheetTitle');
  const sheetDescription = document.getElementById('sheetDescription');
  const sheetOptions = document.getElementById('sheetOptions');
  const sheetCancel = document.getElementById('sheetCancel');

  const state = {
    displayFilter: 'all',
    sortOrder: 'new',
    deleteMode: false,
    selectedDeleteIds: new Set(),
  };

  const DISPLAY_LABELS = {
    all: 'すべて表示',
    checked: 'お気に入りのみ',
    todayReview: '今日の復習',
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

  function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

const REVIEW_WINDOWS = [
  { stage: 1, minDays: 1, maxDays: 3 },
  { stage: 2, minDays: 7, maxDays: 14 },
  { stage: 3, minDays: 30, maxDays: 60 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayMs(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function diffDays(from, to = Date.now()) {
  return Math.floor((startOfDayMs(to) - startOfDayMs(from)) / DAY_MS);
}

function getReviewStage(createdAt, now = Date.now()) {
  const days = diffDays(createdAt, now);
  const matched = REVIEW_WINDOWS.find((item) => days >= item.minDays && days <= item.maxDays);
  return matched ? matched.stage : 0;
}

function normalizeReview(review, createdAt) {
  const baseCreatedAt = Number(createdAt) || Date.now();
  const safe = review && typeof review === 'object' ? review : {};
  return {
    createdAt: Number.isFinite(Number(safe.createdAt)) ? Number(safe.createdAt) : baseCreatedAt,
    currentStage: Number.isFinite(Number(safe.currentStage))
      ? Number(safe.currentStage)
      : getReviewStage(baseCreatedAt),
    completedStages: Array.isArray(safe.completedStages)
      ? unique(safe.completedStages.map((n) => Number(n)).filter((n) => Number.isFinite(n)))
      : [],
    lastCompletedStage: Number.isFinite(Number(safe.lastCompletedStage)) ? Number(safe.lastCompletedStage) : 0,
  };
}

function isTodayReviewTarget(book, now = Date.now()) {
  if (!book) return false;
  const review = normalizeReview(book.review, book.createdAt);
  const stage = getReviewStage(review.createdAt, now);
  return stage > 0 && !review.completedStages.includes(stage);
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
      review: normalizeReview(copy.review, copy.createdAt),
    };

  }

  function getDisplayLabel(value) {
    if (value === 'all') return DISPLAY_LABELS.all;
    if (value === 'checked') return DISPLAY_LABELS.checked;
    if (value === 'todayReview') return DISPLAY_LABELS.todayReview;
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
    if (displayLabel) displayLabel.textContent = getDisplayLabel(value);
    closeSheet();
    renderBooks();
  }

  function setSortOrder(value) {
    state.sortOrder = value;
    if (sortLabel) sortLabel.textContent = getSortLabel(value);
    closeSheet();
    renderBooks();
  }

  function openSheet(type) {
    if (!sheetBackdrop || !sheetTitle || !sheetDescription || !sheetOptions) return;

    sheetTitle.textContent = type === 'sort' ? '並び替え' : '表示';
    sheetDescription.textContent = type === 'sort'
      ? '並び順を選んでください。'
      : '表示方法を選んでください。';

    sheetOptions.innerHTML = '';

    const makeOption = (label, value, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study-sheet__option' + (active ? ' is-selected' : '');
      btn.dataset.value = value;

      const left = document.createElement('span');
      left.className = 'study-sheet__option__label';
      left.textContent = label;

      const mark = document.createElement('span');
      mark.className = 'study-sheet__option__mark';
      mark.textContent = active ? '●' : '○';

      btn.appendChild(left);
      btn.appendChild(mark);
      sheetOptions.appendChild(btn);
    };

    if (type === 'sort') {
      makeOption('新しい順', 'new', state.sortOrder === 'new');
      makeOption('古い順', 'old', state.sortOrder === 'old');
    } else {
      makeOption('すべて表示', 'all', state.displayFilter === 'all');
      makeOption('お気に入り画像のみ', 'checked', state.displayFilter === 'checked');
      makeOption('今日の復習', 'todayReview', state.displayFilter === 'todayReview');

      const cats = loadAllCategories();
      cats.forEach((cat) => {
        makeOption(cat, `cat::${cat}`, state.displayFilter === `cat::${cat}`);
      });

      if (!cats.length) {
        const note = document.createElement('div');
        note.className = 'study-sheet-note';
        note.textContent = 'カテゴリはまだありません。';
        sheetOptions.appendChild(note);
      }
    }

    sheetBackdrop.classList.remove('hidden');
    sheetBackdrop.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    if (!sheetBackdrop) return;
    sheetBackdrop.classList.add('hidden');
    sheetBackdrop.setAttribute('aria-hidden', 'true');
  }

    if (sheetOptions) {
    sheetOptions.addEventListener('click', (ev) => {
      const button = ev.target.closest('button[data-value]');
      if (!button) return;

      const value = button.dataset.value || 'all';

      if (value === 'new' || value === 'old') {
        setSortOrder(value);
      } else {
        setDisplayFilter(value);
      }
    });
  }
  
  function updateDeletePanel() {
    const count = state.selectedDeleteIds.size;

    if (deleteModePanel) {
      deleteModePanel.classList.toggle('hidden', !state.deleteMode);
    }

    if (selectionBar) {
      selectionBar.classList.toggle('hidden', !state.deleteMode);
    }

    if (deleteModeCount) {
      deleteModeCount.textContent = String(count);
    }

    if (selectionCount) {
      selectionCount.textContent = `${count}冊`;
    }

    if (btnDeleteMode) {
      btnDeleteMode.textContent = state.deleteMode ? '選択中' : '削除';
      btnDeleteMode.disabled = false;
    }

    if (btnConfirmDeleteMode) {
      btnConfirmDeleteMode.disabled = count === 0;
    }

    if (selectionDelete) {
      selectionDelete.disabled = count === 0;
    }
  }

  function enterDeleteMode() {
    state.deleteMode = true;
    state.selectedDeleteIds.clear();
    closeSheet();
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
    } else if (filterVal === 'todayReview') {
      filteredBooks = filteredBooks.filter((book) => isTodayReviewTarget(book));
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
  emptyState.textContent = filterVal === 'todayReview'
    ? '今日は復習するものがありません。'
    : hasAnyBooks
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

            // ===== お気に入り復活：この位置から =====
      // ===== お気に入りボタン配置：この位置から =====

      openButton.addEventListener('click', () => {
        if (state.deleteMode) {
          toggleDeleteSelection(book.id, !state.selectedDeleteIds.has(book.id));
          return;
        }
        navigateToBook(book.id);
      });

      // Bookの下側に配置するための操作エリア
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
      controls.appendChild(weakLabel);
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

  if (sheetBackdrop) {
  sheetBackdrop.addEventListener('click', (ev) => {
    if (ev.target === sheetBackdrop) {
      closeSheet();
    }
  });
}

if (sheetCancel) {
  sheetCancel.addEventListener('click', closeSheet);
}

  if (btnBackHome) {
    btnBackHome.addEventListener('click', () => {
      location.href = 'index.html';
    });
  }

  if (btnDisplayMenu) {
    btnDisplayMenu.addEventListener('click', () => {
      openSheet('display');
    });
  }

  if (btnSortMenu) {
    btnSortMenu.addEventListener('click', () => {
      openSheet('sort');
    });
  }

  if (btnDeleteMode) {
    btnDeleteMode.addEventListener('click', () => {
      if (state.deleteMode) {
        cancelDeleteMode();
      } else {
        enterDeleteMode();
      }
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

  if (selectionCancel) {
    selectionCancel.addEventListener('click', () => {
      cancelDeleteMode();
    });
  }

  if (selectionDelete) {
    selectionDelete.addEventListener('click', () => {
      confirmDeleteSelectedBooks();
    });
  }


  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (!sheetBackdrop.classList.contains('hidden')) {
        closeSheet();
        return;
      }
      if (state.deleteMode) cancelDeleteMode();
    }
  });

  function syncToolbarLabels() {
    if (displayLabel) displayLabel.textContent = getDisplayLabel(state.displayFilter);
    if (sortLabel) sortLabel.textContent = getSortLabel(state.sortOrder);
  }

function init() {
  syncToolbarLabels();
  updateDeletePanel();

  if (btnTodayReview) {
    btnTodayReview.addEventListener('click', () => {
      setDisplayFilter('todayReview');
    });
  }

  renderBooks();
}

  init();
})();