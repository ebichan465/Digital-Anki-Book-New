(() => {
  const params = new URLSearchParams(location.search);
  const bookId = params.get('id') || params.get('bookId') || '';

  const btnBackStudy = document.getElementById('btnBackStudy');
  const bookTitle = document.getElementById('bookTitle');
  const bookMeta = document.getElementById('bookMeta');
  const bookCanvas = document.getElementById('bookCanvas');
  const bookMainImage = document.getElementById('bookMainImage');
  const bookEmpty = document.getElementById('bookEmpty');

  const btnResetMasks = document.getElementById('btnResetMasks');
  const btnRenameBook = document.getElementById('btnRenameBook');
  const bookCategoryBox = document.getElementById('bookCategoryBox');
  const bookCategoryList = document.getElementById('bookCategoryList');
  const btnNewBookCategory = document.getElementById('btnNewBookCategory');
  const btnDeleteImage = document.getElementById('btnDeleteImage');
  const btnReviewComplete = document.getElementById('btnReviewComplete');
  const bookWeakCheckbox = document.getElementById('bookWeakCheckbox');
  const reviewCompleteToast = document.getElementById('reviewCompleteToast');
  let reviewCompleteToastTimer = null;
  

  let currentBook = null;
  let currentImageIndex = 0;
  let sessionMasks = [];
  let maskEntries = [];

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const DEFAULT_MASK_ROTATION = 0;

  function normalizeRotation(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : DEFAULT_MASK_ROTATION;
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

  async function loadAllProjects() {
    return DigitalAnkiStorage.getAllProjects();
  }
  
  async function saveAllProjects(projects) {
  await DigitalAnkiStorage.saveProjects(projects);
  }

  async function loadAllCategories() {
    return DigitalAnkiStorage.getAllCategories();
  }

  async function saveAllCategories(categories) {
    await DigitalAnkiStorage.saveAllCategories(categories);
  }

  function normalizeImageRecord(image, fallbackTitle, fallbackCreatedAt) {
    if (!image || typeof image !== 'object') return null;
    const imageDataUrl = image.imageDataUrl || image.dataUrl || '';
    if (!imageDataUrl) return null;

    return {
      id: image.id || uid('image'),
      title: image.title || fallbackTitle || '無題',
      imageDataUrl,
      masks: Array.isArray(image.masks) ? deepClone(image.masks) : [],
      createdAt: image.createdAt || fallbackCreatedAt || Date.now(),
    };
  }

  function normalizeBook(record) {
    const source = record && typeof record === 'object' ? record : {};
    const base = deepClone(source) || {};

    const legacyFallback = base.imageDataUrl
      ? {
          id: `${base.id || uid('book')}-image`,
          title: base.name || '無題',
          imageDataUrl: base.imageDataUrl,
          masks: Array.isArray(base.masks) ? deepClone(base.masks) : [],
          createdAt: base.createdAt || Date.now(),
        }
      : null;

    const normalizedImages = Array.isArray(base.images) && base.images.length
      ? base.images
          .map((img, index) => normalizeImageRecord(img, base.name || '無題', base.createdAt || Date.now()) || {
            id: `${base.id || uid('book')}-image-${index}`,
            title: base.name || '無題',
            imageDataUrl: '',
            masks: [],
            createdAt: base.createdAt || Date.now(),
          })
          .filter((img) => !!img && !!img.imageDataUrl)
      : (legacyFallback ? [legacyFallback] : []);

    return {
      ...base,
      id: base.id || uid('book'),
      name: base.name || '無題',
      createdAt: base.createdAt || Date.now(),
      checked: !!base.checked,
      categories: Array.isArray(base.categories) ? base.categories.filter(Boolean) : [],
      images: normalizedImages,
      review: normalizeReview(base.review, base.createdAt),
    };
  }

  function syncLegacyFields(book) {
    if (!book || !Array.isArray(book.images)) return;
    const first = book.images[0] || null;
    if (first && first.imageDataUrl) {
      book.imageDataUrl = first.imageDataUrl;
      book.masks = Array.isArray(first.masks) ? deepClone(first.masks) : [];
    } else {
      book.imageDataUrl = '';
      book.masks = [];
    }
  }

  async function getBookById(id) {
    const all = await loadAllProjects();
    const found = all.find((project) => project.id === id);
    return found ? normalizeBook(found) : null;
  }

  function getActiveImageRecord() {
    if (!currentBook || !Array.isArray(currentBook.images) || !currentBook.images.length) return null;
    currentImageIndex = Math.max(0, Math.min(currentImageIndex, currentBook.images.length - 1));
    return currentBook.images[currentImageIndex] || null;
  }

  function updateHeader() {
    if (!currentBook) {
      if (bookTitle) bookTitle.textContent = 'Book';
      if (bookMeta) bookMeta.textContent = '';
      if (bookWeakCheckbox) bookWeakCheckbox.checked = false;
      document.title = 'Digital Anki Book - Book';
      return;
    }

    if (bookTitle) bookTitle.textContent = currentBook.name || '無題';

    const metaParts = [];
    if (Array.isArray(currentBook.categories) && currentBook.categories.length) {
      metaParts.push(`カテゴリ: ${currentBook.categories.join(', ')}`);
    }
    if (currentBook.checked) {
      metaParts.push('苦手');
    }
    if (bookMeta) bookMeta.textContent = metaParts.join(' / ');

    if (bookWeakCheckbox) {
      bookWeakCheckbox.checked = !!currentBook.checked;
      bookWeakCheckbox.disabled = false;
    }

    document.title = `Digital Anki Book - ${currentBook.name || 'Book'}`;
  }

  function setBookState() {
    const hasBook = !!currentBook;
    const activeImage = getActiveImageRecord();
    const hasImage = !!(activeImage && activeImage.imageDataUrl);

    if (btnResetMasks) btnResetMasks.disabled = !hasImage;
    if (btnRenameBook) btnRenameBook.disabled = !hasBook;
    if (btnDeleteImage) btnDeleteImage.disabled = !hasImage;
    if (bookWeakCheckbox) bookWeakCheckbox.disabled = !hasBook;

    if (bookMainImage) {
      bookMainImage.classList.toggle('hidden', !hasImage);
      bookMainImage.alt = hasBook ? `${currentBook.name || 'Book'} の教材` : 'Bookの教材';
    }

    if (bookEmpty) {
      if (!hasBook) {
        bookEmpty.textContent = '教材が見つかりませんでした。';
        bookEmpty.classList.remove('hidden');
      } else if (!hasImage) {
        bookEmpty.textContent = 'この教材には画像がありません。';
        bookEmpty.classList.remove('hidden');
      } else {
        bookEmpty.classList.add('hidden');
      }
    }
    updateReviewButton();
  }
  
function updateReviewButton() {
  if (!btnReviewComplete) return;

  if (!currentBook) {
    btnReviewComplete.classList.add('hidden');
    btnReviewComplete.disabled = true;
    return;
  }

  const activeImage = getActiveImageRecord();
  const review = normalizeReview(currentBook.review, currentBook.createdAt);
  const stage = getReviewStage(
    review.createdAt ||
    (activeImage && activeImage.createdAt) ||
    currentBook.createdAt
  );

  const shouldShow =
    !!(activeImage && activeImage.imageDataUrl) &&
    stage > 0 &&
    !review.completedStages.includes(stage);

  btnReviewComplete.classList.toggle('hidden', !shouldShow);
  btnReviewComplete.disabled = !shouldShow;
}

function showReviewCompleteToast() {
  if (!reviewCompleteToast) return;

  if (reviewCompleteToastTimer) {
    clearTimeout(reviewCompleteToastTimer);
    reviewCompleteToastTimer = null;
  }

  reviewCompleteToast.classList.remove('hidden');

  reviewCompleteToastTimer = window.setTimeout(() => {
    reviewCompleteToast.classList.add('hidden');
    reviewCompleteToastTimer = null;
  }, 1000);
}

async function completeReviewStage() {
  if (!currentBook) return;

  const activeImage = getActiveImageRecord();
  const review = normalizeReview(currentBook.review, currentBook.createdAt);
  const stage = getReviewStage(
    review.createdAt ||
    (activeImage && activeImage.createdAt) ||
    currentBook.createdAt
  );

  if (stage <= 0) return;

  currentBook.review = {
    ...review,
    currentStage: stage,
    lastCompletedStage: stage,
    completedStages: unique([...review.completedStages, stage]).sort((a, b) => a - b),
  };

  await persistCurrentBook();
  setBookState();
  showReviewCompleteToast();
}

function clearMaskElements() {
  maskEntries.forEach((entry) => {
     if (entry.el && entry.el.parentNode) {
       entry.el.parentNode.removeChild(entry.el);
     }
  });
  maskEntries = [];
}

  function normalizeMaskModel(mask) {
  const safe = mask && typeof mask === 'object' ? mask : {};
  return {
    id: safe.id || uid('mask'),
    x: Number.isFinite(Number(safe.x)) ? Number(safe.x) : 0,
    y: Number.isFinite(Number(safe.y)) ? Number(safe.y) : 0,
    w: Number.isFinite(Number(safe.w)) ? Number(safe.w) : 0.2,
    h: Number.isFinite(Number(safe.h)) ? Number(safe.h) : 0.12,
    rotation: normalizeRotation(safe.rotation),
    visible: safe.visible === undefined || safe.visible === null ? true : !!safe.visible,
    color: safe.color || '#000000',
    shape: safe.shape === 'circle' ? 'circle' : 'rect',
  };
}

  function applyMaskVisual(entry) {
    if (!entry || !entry.el || !entry.model) return;
    const mask = entry.model;
    entry.el.classList.remove('rect', 'circle');
    entry.el.classList.add(mask.shape === 'circle' ? 'circle' : 'rect');
    entry.el.style.background = mask.visible
      ? (mask.color || '#000000')
      : 'transparent';
  }

  function waitForImageLayout(imgEl, timeout = 700) {
    return new Promise((resolve) => {
      const start = Date.now();

      function check() {
        const rect = imgEl.getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) {
          resolve();
          return;
        }
        if (Date.now() - start > timeout) {
          resolve();
          return;
        }
        setTimeout(check, 40);
      }

      check();
    });
  }

  function updateMaskPositions() {
    if (!maskEntries.length || !bookCanvas || !bookMainImage) return;

    requestAnimationFrame(() => {
      const imgRect = getImageContentRect(bookMainImage);
      const canvasRect = bookCanvas.getBoundingClientRect();
      if (!imgRect.width || !imgRect.height) return;

      maskEntries.forEach((entry) => {
        const mask = entry.model;
        const left = (mask.x * imgRect.width) + (imgRect.left - canvasRect.left);
        const top = (mask.y * imgRect.height) + (imgRect.top - canvasRect.top);
        entry.el.style.left = `${left}px`;
        entry.el.style.top = `${top}px`;
        entry.el.style.width = `${mask.w * imgRect.width}px`;
        entry.el.style.height = `${mask.h * imgRect.height}px`;
        entry.el.style.transformOrigin = 'center center';
        entry.el.style.transform = `rotate(${normalizeRotation(mask.rotation)}deg)`;
        applyMaskVisual(entry);
      });
    });
  }

  function getImageContentRect(imgEl){
    const rect = imgEl.getBoundingClientRect();

    const naturalWidth = imgEl.naturalWidth;
    const naturalHeight = imgEl.naturalHeight;

    if (!naturalWidth || !naturalHeight) {
      return rect;
    }

    const imageRatio = naturalWidth / naturalHeight;
    const elementRatio = rect.width / rect.height;

    let contentWidth = rect.width;
    let contentHeight = rect.height;

    if (elementRatio > imageRatio) {
      contentHeight = rect.height;
      contentWidth = contentHeight * imageRatio;
    } else {
      contentWidth = rect.width;
      contentHeight = contentWidth / imageRatio;
    }

    return {
      left: rect.left + (rect.width - contentWidth) / 2,
      top: rect.top + (rect.height - contentHeight) / 2,
      width: contentWidth,
      height: contentHeight
    };
  }

  function renderMasks() {
    clearMaskElements();

    if (!currentBook) return;
    const activeImage = getActiveImageRecord();
    if (!activeImage || !activeImage.imageDataUrl) return;
    if (!bookCanvas) return;

    maskEntries = sessionMasks.map((rawMask) => {
      const model = normalizeMaskModel(rawMask);
      const el = document.createElement('div');
      el.className = 'book-mask';
      el.dataset.maskId = model.id;
      el.style.position = 'absolute';
      el.style.touchAction = 'none';
      el.style.cursor = 'pointer';
      el.style.boxSizing = 'border-box';
      el.style.transformOrigin = 'center center';

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        model.visible = !model.visible;
        applyMaskVisual({ el, model });
      });

      bookCanvas.appendChild(el);
      const entry = { el, model };
      applyMaskVisual(entry);
      return entry;
    });

    updateMaskPositions();
  }

  function loadCurrentImage() {
    if (!currentBook) {
      setBookState();
      return;
    }

    const activeImage = getActiveImageRecord();
    if (!activeImage || !activeImage.imageDataUrl) {
      sessionMasks = [];
      clearMaskElements();
      setBookState();
      return;
    }

    if (bookMainImage) {
      bookMainImage.classList.remove('hidden');
    }
    if (bookEmpty) {
      bookEmpty.classList.add('hidden');
    }

    let handled = false;
    const handleLoaded = async () => {
      if (handled) return;
      handled = true;
      sessionMasks = deepClone(Array.isArray(activeImage.masks) ? activeImage.masks : []).map(normalizeMaskModel);
      await waitForImageLayout(bookMainImage, 800);
      renderMasks();
      setBookState();
    };

    bookMainImage.onload = handleLoaded;
    bookMainImage.src = activeImage.imageDataUrl;

    if (bookMainImage.complete && bookMainImage.naturalWidth > 0) {
      handleLoaded();
    }

    setBookState();
  }

  async function persistCurrentBook(mutator) {
    if (!currentBook) return null;

    if (typeof mutator === 'function') {
      mutator(currentBook);
    }

    const normalized = normalizeBook(currentBook);
    syncLegacyFields(normalized);

    try {
      await DigitalAnkiStorage.saveProject(normalized);
    } catch (error) {
      console.error('教材の保存に失敗しました。', error);
      return null;
    }

    currentBook = normalized;
    updateHeader();
    return currentBook;
  }

  async function renameBook() {
    if (!currentBook) return;
    const nextName = prompt('新しい教材名を入力してください', currentBook.name || '');
    if (nextName === null) return;

    const trimmed = nextName.trim();
    if (!trimmed) return;

    currentBook.name = trimmed;

    const saved = await persistCurrentBook();

    if (!saved) {
      alert('保存に失敗しました。');
      return;
    }

    updateHeader();
  }

  if (btnNewBookCategory) {
    btnNewBookCategory.addEventListener('click', async () => {
      const name = prompt('カテゴリ名を入力してください');
      if (name === null) return;

      const trimmed = name.trim();
      if (!trimmed) return;

      const categories = await loadAllCategories();

      if (categories.includes(trimmed)) {
        alert('同名のカテゴリが既に存在します');
        return;
      }

      categories.push(trimmed);

      await saveAllCategories(categories);
      await refreshBookCategoryOptions();
    });
  }

  async function refreshBookCategoryOptions() {
    if (!bookCategoryList) return;

    const categories = await loadAllCategories();
    bookCategoryList.innerHTML = '';

    categories.forEach((category) => {
      const row = document.createElement('div');
      row.className = 'book-category-panel__item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'book-category-panel__checkbox';
      checkbox.value = category;
      checkbox.checked = Array.isArray(currentBook?.categories)
        ? currentBook.categories.includes(category)
        : false;

      checkbox.addEventListener('change', async () => {
        if (!currentBook) return;

        const nextCategories = new Set(
          Array.isArray(currentBook.categories)
            ? currentBook.categories
            : []
        );

        if (checkbox.checked) {
          nextCategories.add(category);
        } else {
          nextCategories.delete(category);
        }

        currentBook.categories = Array.from(nextCategories);

        const saved = await persistCurrentBook();

        if (!saved) {
          checkbox.checked = !checkbox.checked;
          return;
        }

        updateHeader();
      });

      const label = document.createElement('span');
      label.className = 'book-category-panel__label';
      label.textContent = category;

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'book-category-panel__delete';
      deleteButton.title = 'カテゴリを削除';

      const deleteIcon = document.createElement('img');
      deleteIcon.src = 'assets/delete.svg';
      deleteIcon.alt = '';
      deleteIcon.setAttribute('aria-hidden', 'true');

      deleteButton.appendChild(deleteIcon);

      deleteButton.addEventListener('click', async (ev) => {
        ev.stopPropagation();

        if (!confirm(`カテゴリ「${category}」を削除しますか？`)) {
          return;
        }

        const categories = await loadAllCategories();
        const nextCategories = categories.filter((item) => item !== category);

        await saveAllCategories(nextCategories);

        const allProjects = await loadAllProjects();

        for (const project of allProjects) {
          if (!Array.isArray(project.categories)) {
            project.categories = [];
          }

          if (!project.categories.includes(category)) {
            continue;
          }

          project.categories = project.categories.filter(
            (item) => item !== category
          );

          try {
            await DigitalAnkiStorage.saveProject(project);
          } catch (error) {
            console.error(
              'カテゴリ削除に伴う教材の更新に失敗しました。',
              error
            );
          }
        }

        if (currentBook && Array.isArray(currentBook.categories)) {
          currentBook.categories = currentBook.categories.filter(
            (item) => item !== category
          );
        }

        updateHeader();
        await refreshBookCategoryOptions();

        alert(`カテゴリ「${category}」を削除しました。`);
      });

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(deleteButton);

      bookCategoryList.appendChild(row);
    });
  }

  function resetMasks() {
    if (!currentBook) return;
    sessionMasks = sessionMasks.map((mask) => ({
      ...mask,
      visible: true,
    }));
    maskEntries.forEach((entry) => {
      entry.model.visible = true;
      applyMaskVisual(entry);
    });
  }

  async function toggleWeakFlag() {
    if (!currentBook || !bookWeakCheckbox) return;
    currentBook.checked = !!bookWeakCheckbox.checked;
    await persistCurrentBook();
    updateHeader();
  }

  async function deleteCurrentImage() {
    if (!currentBook) return;

    const all = await loadAllProjects();
    const idx = all.findIndex((project) => project.id === currentBook.id);
    if (idx < 0) return;

    const activeImage = getActiveImageRecord();
    if (!activeImage) {
      alert('削除する教材がありません');
      return;
    }

    const hasMultipleImages = Array.isArray(currentBook.images) && currentBook.images.length > 1;
    const confirmMessage = hasMultipleImages
      ? '選択中の教材を削除しますか？'
      : 'この教材を削除しますか？';

    if (!confirm(confirmMessage)) return;

    const nextBook = normalizeBook(currentBook);
    nextBook.images = Array.isArray(nextBook.images)
      ? nextBook.images.filter((image) => image.id !== activeImage.id)
      : [];

    if (!nextBook.images.length) {
      await DigitalAnkiStorage.deleteProject(currentBook.id);
      alert('Bookを削除しました。');
      location.href = 'study.html';
      return;
    }

    nextBook.images = nextBook.images.map((image) => normalizeImageRecord(image, nextBook.name, nextBook.createdAt)).filter(Boolean);
    syncLegacyFields(nextBook);

    currentBook = nextBook;
    await persistCurrentBook();
    currentImageIndex = 0;
    sessionMasks = deepClone(nextBook.images[0].masks || []).map(normalizeMaskModel);
    updateHeader();
    loadCurrentImage();
    alert('教材を削除しました。');
  }

  function showMissingBookState(message) {
    currentBook = null;
    currentImageIndex = 0;
    sessionMasks = [];
    clearMaskElements();

    if (bookTitle) bookTitle.textContent = 'Book';
    if (bookMeta) bookMeta.textContent = '';
    if (bookMainImage) {
      bookMainImage.src = '';
      bookMainImage.classList.add('hidden');
    }
    if (bookEmpty) {
      bookEmpty.textContent = message;
      bookEmpty.classList.remove('hidden');
    }

    if (btnResetMasks) btnResetMasks.disabled = true;
    if (btnRenameBook) btnRenameBook.disabled = true;
    if (btnDeleteImage) btnDeleteImage.disabled = true;
    if (btnReviewComplete) {
      btnReviewComplete.classList.add('hidden');
      btnReviewComplete.disabled = true;
    }
    if (bookWeakCheckbox) {
      bookWeakCheckbox.disabled = true;
      bookWeakCheckbox.checked = false;
    }

    document.title = 'Digital Anki Book - Book';
  }

  async function init() {
    if (btnBackStudy) {
      btnBackStudy.addEventListener('click', () => {
        location.href = 'study.html';
      });
    }

    if (btnResetMasks) {
      btnResetMasks.addEventListener('click', resetMasks);
    }

    if (btnRenameBook) {
      btnRenameBook.addEventListener('click', renameBook);
    }

    if (btnDeleteImage) {
      btnDeleteImage.addEventListener('click', deleteCurrentImage);
    }

    if (btnReviewComplete) {
      btnReviewComplete.addEventListener('click', completeReviewStage);
    }

    if (bookWeakCheckbox) {
      bookWeakCheckbox.addEventListener('change', toggleWeakFlag);
    }

    window.addEventListener('resize', updateMaskPositions);
    window.addEventListener('orientationchange', updateMaskPositions);

    if (!bookId) {
      showMissingBookState('教材が見つかりませんでした。');
      return;
    }

    const found = await getBookById(bookId);
    if (!found) {
      showMissingBookState('教材が見つかりませんでした。');
      return;
    }

    currentBook = normalizeBook(found);
    currentImageIndex = 0;
    syncLegacyFields(currentBook);
    updateHeader();
    setBookState();
    await refreshBookCategoryOptions();
    loadCurrentImage();
  }

  init();
})();