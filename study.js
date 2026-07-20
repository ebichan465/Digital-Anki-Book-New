(() => {
  const STORAGE_KEY = 'digital-anki-projects-v1';
  const CATS_KEY = 'digital-anki-categories-v1';

  const bookList = document.getElementById('bookList');
  const emptyState = document.getElementById('emptyState');
  const btnBackHome = document.getElementById('btnBackHome');
  const btnDisplayMenu = document.getElementById('btnDisplayMenu');
  const btnSortMenu = document.getElementById('btnSortMenu');
  const btnSelectDelete = document.getElementById('btnSelectDelete');
  const displayCurrentLabel = document.getElementById('displayCurrentLabel');
  const sortCurrentLabel = document.getElementById('sortCurrentLabel');

  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const sheetTitle = document.getElementById('sheetTitle');
  const sheetDescription = document.getElementById('sheetDescription');
  const sheetOptions = document.getElementById('sheetOptions');
  const sheetCancel = document.getElementById('sheetCancel');

  const selectionBar = document.getElementById('selectionBar');
  const selectionCount = document.getElementById('selectionCount');
  const selectionCancel = document.getElementById('selectionCancel');
  const selectionDelete = document.getElementById('selectionDelete');

  const state = {
    displayMode: 'all',
    sortMode: 'new',
    selectionMode: false,
    deleteSelection: new Set(),
    sheetType: null,
  };

  function loadAllBooks() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch (e) {
      return [];
    }
  }

  function saveAllBooks(books) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: books }));
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

  function normalizeCategories(book) {
    if (!book) return [];
    if (Array.isArray(book.categories)) return unique(book.categories);
    if (typeof book.categories === 'string' && book.categories.trim()) return [book.categories.trim()];
    return [];
  }

  function normalizeImages(book) {
    if (!book) return [];
    if (Array.isArray(book.images)) {
      return book.images
        .map((image) => {
          if (typeof image === 'string') return { imageDataUrl: image };
          if (image && typeof image === 'object') {
            return {
              imageDataUrl: image.imageDataUrl || image.dataUrl || image.src || '',
              title: image.title || '',
              masks: Array.isArray(image.masks) ? image.masks : [],
            };
          }
          return { imageDataUrl: '' };
        })
        .filter((image) => image.imageDataUrl);
    }

    if (book.imageDataUrl) {
      return [{
        imageDataUrl: book.imageDataUrl,
        masks: Array.isArray(book.masks) ? book.masks : [],
      }];
    }

    return [];
  }

  function getCoverUrl(book) {
    const images = normalizeImages(book);
    if (!images.length) return '';
    return images[0].imageDataUrl || '';
  }

  function getBookTitle(book) {
    return String(book && book.name ? book.name : '無題');
  }

  function getBookDate(book) {
    const createdAt = Number(book && book.createdAt) || Date.now();
    const d = new Date(createdAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  function getBookImagesLabel(book) {
    const count = normalizeImages(book).length;
    return count > 1 ? `${count}枚` : '1枚';
  }

  function getDisplayLabel(mode) {
    if (mode === 'checked') return 'チェック済み';
    if (mode && mode.startsWith('cat::')) return mode.replace('cat::', '');
    return 'すべて表示';
  }

  function getSortLabel(mode) {
    return mode === 'old' ? '古い順' : '新しい順';
  }

  function setDisplayMode(mode) {
    state.displayMode = mode;
    updateHeaderLabels();
    render();
  }

  function setSortMode(mode) {
    state.sortMode = mode;
    updateHeaderLabels();
    render();
  }

  function openSheet(type) {
    state.sheetType = type;
    sheetTitle.textContent = type === 'sort' ? '並び替え' : '表示';
    sheetDescription.textContent = type === 'sort'
      ? '並び順を選んでください。'
      : '表示方法を選んでください。';

    sheetOptions.innerHTML = '';

    const makeOption = (label, value, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study-sheet-option' + (active ? ' is-selected' : '');
      btn.dataset.value = value;

      const left = document.createElement('span');
      left.className = 'study-sheet-option__label';
      left.textContent = label;

      const mark = document.createElement('span');
      mark.className = 'study-sheet-option__mark';
      mark.textContent = active ? '●' : '○';

      btn.appendChild(left);
      btn.appendChild(mark);
      btn.addEventListener('click', () => {
        if (type === 'sort') {
          setSortMode(value);
        } else {
          setDisplayMode(value);
        }
        closeSheet();
      });
      sheetOptions.appendChild(btn);
    };

    if (type === 'sort') {
      makeOption('新しい順', 'new', state.sortMode === 'new');
      makeOption('古い順', 'old', state.sortMode === 'old');
    } else {
      makeOption('すべて表示', 'all', state.displayMode === 'all');
      makeOption('チェックが付いた画像のみ', 'checked', state.displayMode === 'checked');

      const cats = loadAllCategories();
      cats.forEach((cat) => {
        makeOption(cat, `cat::${cat}`, state.displayMode === `cat::${cat}`);
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
    state.sheetType = null;
    sheetBackdrop.classList.add('hidden');
    sheetBackdrop.setAttribute('aria-hidden', 'true');
  }

  function enterSelectionMode() {
    state.selectionMode = true;
    state.deleteSelection.clear();
    updateSelectionBar();
    render();
  }

  function exitSelectionMode() {
    state.selectionMode = false;
    state.deleteSelection.clear();
    updateSelectionBar();
    render();
  }

  function toggleDeleteSelection(bookId) {
    const key = String(bookId);
    if (state.deleteSelection.has(key)) {
      state.deleteSelection.delete(key);
    } else {
      state.deleteSelection.add(key);
    }
    updateSelectionBar();
    render();
  }

  function updateSelectionBar() {
    const count = state.deleteSelection.size;
    selectionCount.textContent = `${count}冊`;
    selectionBar.classList.toggle('hidden', !state.selectionMode);
    selectionDelete.disabled = count === 0;
    btnSelectDelete.textContent = state.selectionMode ? '選択中' : '選択して削除';
  }

  function toggleBookChecked(bookId, checked) {
    const books = loadAllBooks();
    const idx = books.findIndex((book) => String(book.id) === String(bookId));
    if (idx < 0) return;
    books[idx].checked = !!checked;
    saveAllBooks(books);
    render();
  }

  function deleteSelectedBooks() {
    const ids = Array.from(state.deleteSelection);
    if (!ids.length) return;
    if (!confirm(`選択した${ids.length}冊を削除しますか？`)) return;

    const books = loadAllBooks().filter((book) => !ids.includes(String(book.id)));
    saveAllBooks(books);
    state.deleteSelection.clear();
    state.selectionMode = false;
    updateSelectionBar();
    render();
  }

  function getVisibleBooks() {
    let books = loadAllBooks().slice();

    const sortMode = state.sortMode === 'old' ? 'old' : 'new';
    books.sort((a, b) => {
      const aTime = Number(a && a.createdAt) || 0;
      const bTime = Number(b && b.createdAt) || 0;
      return sortMode === 'new' ? (bTime - aTime) : (aTime - bTime);
    });

    const filterMode = state.displayMode;
    if (filterMode === 'checked') {
      books = books.filter((book) => !!book.checked);
    } else if (filterMode && filterMode.startsWith('cat::')) {
      const catName = filterMode.slice('cat::'.length);
      books = books.filter((book) => normalizeCategories(book).includes(catName));
    }

    return books;
  }

  function createBookCard(book) {
    const wrapper = document.createElement('article');
    wrapper.className = 'study-book-card';
    wrapper.dataset.bookId = String(book.id || '');
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-label', `${getBookTitle(book)} を開く`);

    if (state.selectionMode) {
      wrapper.classList.add('is-selection-mode');
    }
    if (state.deleteSelection.has(String(book.id))) {
      wrapper.classList.add('is-selected');
    }

    const shell = document.createElement('div');
    shell.className = 'study-book-card__shell';

    const cover = document.createElement('div');
    cover.className = 'study-book-card__cover';
    const coverUrl = getCoverUrl(book);
    if (coverUrl) {
      cover.style.backgroundImage = `linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.18)), url("${coverUrl}")`;
    } else {
      cover.style.backgroundImage = 'linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.10)), linear-gradient(160deg, #d3a36d 0%, #b97943 50%, #9f6538 100%)';
    }

    const spine = document.createElement('div');
    spine.className = 'study-book-card__spine';

    const coverText = document.createElement('div');
    coverText.className = 'study-book-card__cover-text';
    const coverLabel = document.createElement('div');
    coverLabel.className = 'study-book-card__cover-label';
    coverLabel.textContent = 'BOOK';
    const coverCount = document.createElement('div');
    coverCount.className = 'study-book-card__cover-count';
    coverCount.textContent = getBookImagesLabel(book);
    coverText.appendChild(coverLabel);
    coverText.appendChild(coverCount);

    cover.appendChild(spine);
    cover.appendChild(coverText);

    const body = document.createElement('div');
    body.className = 'study-book-card__body';

    const title = document.createElement('div');
    title.className = 'study-book-card__title';
    title.title = getBookTitle(book);
    title.textContent = getBookTitle(book);

    const date = document.createElement('div');
    date.className = 'study-book-card__date';
    date.textContent = getBookDate(book);

    const chips = document.createElement('div');
    chips.className = 'study-book-card__chips';
    const categories = normalizeCategories(book);
    categories.slice(0, 3).forEach((cat) => {
      const chip = document.createElement('span');
      chip.className = 'study-chip';
      chip.textContent = cat;
      chips.appendChild(chip);
    });

    const bookMeta = document.createElement('div');
    bookMeta.className = 'study-book-card__meta';
    bookMeta.appendChild(title);
    bookMeta.appendChild(date);
    if (chips.childNodes.length) {
      bookMeta.appendChild(chips);
    }

    const hard = document.createElement('label');
    hard.className = 'study-book-card__hard';
    hard.title = '苦手Book';
    const hardInput = document.createElement('input');
    hardInput.type = 'checkbox';
    hardInput.checked = !!book.checked;
    hardInput.addEventListener('click', (ev) => ev.stopPropagation());
    hardInput.addEventListener('change', () => {
      toggleBookChecked(book.id, hardInput.checked);
    });
    const hardText = document.createElement('span');
    hardText.textContent = '苦手';
    hard.appendChild(hardInput);
    hard.appendChild(hardText);
    hard.addEventListener('click', (ev) => ev.stopPropagation());

    const selectBox = document.createElement('label');
    selectBox.className = 'study-book-card__select';
    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.checked = state.deleteSelection.has(String(book.id));
    selectInput.addEventListener('click', (ev) => ev.stopPropagation());
    selectInput.addEventListener('change', () => {
      toggleDeleteSelection(String(book.id));
    });
    selectBox.appendChild(selectInput);
    selectBox.addEventListener('click', (ev) => ev.stopPropagation());

    shell.appendChild(cover);
    shell.appendChild(bookMeta);
    shell.appendChild(hard);
    shell.appendChild(selectBox);
    wrapper.appendChild(shell);

    const goToBookPage = () => {
      const bookId = encodeURIComponent(String(book.id || ''));
      window.location.href = `book.html?bookId=${bookId}`;
    };

    wrapper.addEventListener('click', (ev) => {
      const target = ev.target;
      if (target.closest('input')) return;
      if (state.selectionMode) {
        toggleDeleteSelection(String(book.id));
        return;
      }
      goToBookPage();
    });

    wrapper.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      if (state.selectionMode) {
        toggleDeleteSelection(String(book.id));
      } else {
        goToBookPage();
      }
    });

    return wrapper;
  }

  function updateHeaderLabels() {
    displayCurrentLabel.textContent = getDisplayLabel(state.displayMode);
    sortCurrentLabel.textContent = getSortLabel(state.sortMode);
    btnSelectDelete.textContent = state.selectionMode ? '選択中' : '選択して削除';
  }

  function render() {
    const books = getVisibleBooks();
    bookList.innerHTML = '';

    const hasBooks = books.length > 0;
    emptyState.classList.toggle('hidden', hasBooks);

    books.forEach((book) => {
      bookList.appendChild(createBookCard(book));
    });

    updateHeaderLabels();
    updateSelectionBar();
  }

  function init() {
    updateHeaderLabels();
    updateSelectionBar();

    btnBackHome.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    btnDisplayMenu.addEventListener('click', () => openSheet('display'));
    btnSortMenu.addEventListener('click', () => openSheet('sort'));

    btnSelectDelete.addEventListener('click', () => {
      if (state.selectionMode) {
        exitSelectionMode();
      } else {
        enterSelectionMode();
      }
    });

    sheetBackdrop.addEventListener('click', (ev) => {
      if (ev.target === sheetBackdrop) {
        closeSheet();
      }
    });

    sheetCancel.addEventListener('click', closeSheet);
    selectionCancel.addEventListener('click', exitSelectionMode);
    selectionDelete.addEventListener('click', deleteSelectedBooks);

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!sheetBackdrop.classList.contains('hidden')) {
          closeSheet();
          return;
        }
        if (state.selectionMode) {
          exitSelectionMode();
        }
      }
    });

    render();
  }

  init();
})();