  // 画面要素の取得
(() => {
  const getEl = id => document.getElementById(id);
  const imageInput = getEl('imageInput');
  const mainImage = getEl('mainImage');
  const imageArea = getEl('imageArea');
  const btnChooseImage = getEl('btnChooseImage');
  const btnAddMask = getEl('btnAddMask');
  const btnDeleteSelected = getEl('btnDeleteSelected');
  const btnSave = getEl('btnSave');
  const btnBack = getEl('btnBack');
  const btnUndo = getEl('btnUndo');
  const projectSelect = getEl('projectSelect');
  const btnLoad = getEl('btnLoad');
  const colorPicker = getEl('colorPicker');
  const shapeSelect = getEl('shapeSelect');
  const btnInsertText = getEl('btnInsertText');
  const btnDuplicateMask = getEl('btnDuplicateMask');

  // カテゴリ操作用の要素
  const categoryBox = getEl('categoryBox');
  const categoryList = getEl('categoryList');
  const btnNewCategory = getEl('btnNewCategory');

  const textModal = getEl('textModal');
  const textInputArea = getEl('textInputArea');
  const textFontSize = getEl('textFontSize');
  const btnInsertCancel = getEl('btnInsertCancel');
  const btnInsertConfirm = getEl('btnInsertConfirm');

  if (!imageArea || !mainImage) {
    console.error('必須要素 missing');
    return;
  }

  // 編集画面の状態
  let masks = [];
  let selectedMaskId = null;
  let currentProject = null;
  let defaultShape = shapeSelect ? shapeSelect.value : 'rect';
  let undoStack = [];
  const MAX_UNDO = 80;

  function cloneMaskForUndo(m) {
    return {
      id: m.id,
      x: m.x,
      y: m.y,
      w: m.w,
      h: m.h,
      rotation: normalizeRotation(m.rotation),
      visible: (m.visible === undefined) ? true : Boolean(m.visible),
      color: m.color || '#111111',
      shape: m.shape || 'rect'
    };
  }

  function syncSaveButtonState(){
    if (!btnSave) return;
    btnSave.disabled = !mainImage.src;
  }

  function pushUndoState() {
    if (!mainImage.src) return;
    undoStack.push({
      masks: masks.map(cloneMaskForUndo),
      selectedMaskId: selectedMaskId
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    if (btnUndo) btnUndo.disabled = false;
  }

  function restoreUndoState(state) {
    masks.forEach(m => m.el && m.el.remove());
    masks = [];

    (state.masks || []).forEach((raw) => {
      const m = {
        id: raw.id || uid('m'),
        x: raw.x,
        y: raw.y,
        w: raw.w,
        h: raw.h,
        rotation: normalizeRotation(raw.rotation),
        visible: (raw.visible === undefined) ? true : Boolean(raw.visible),
        color: raw.color || '#000000',
        shape: raw.shape || 'rect'
      };
      masks.push(m);
      renderMask(m);
    });

    selectedMaskId = state.selectedMaskId || null;

    refreshAllMasks();
    if (selectedMaskId) selectMask(selectedMaskId);
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    markDirty(true);
  }

  let isDirty = false;
  function markDirty(flag = true) { isDirty = !!flag; }
  function clearDirty() { isDirty = false; }
  const MIN_MASK_PX = 8;
  const DEFAULT_MASK_ROTATION = 0;

  function normalizeRotation(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : DEFAULT_MASK_ROTATION;
  }

    // 復習情報の初期化
  function buildInitialReview(createdAt){
    const base = Number(createdAt) || Date.now();
    return {
      createdAt: base,
      currentStage: 0,
      completedStages: [],
      lastCompletedStage: 0
    };
  }

  // 復習に必要な情報を保存用に整える処理
  function normalizeReviewForSave(review, createdAt){
    const base = Number(createdAt) || Date.now();

    if (!review || typeof review !== 'object') {
      return buildInitialReview(base);
    }

    const completedStages = Array.isArray(review.completedStages)
      ? Array.from(new Set(
          review.completedStages
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 3)
        )).sort((a, b) => a - b)
      : [];

    const currentStageRaw = Number(review.currentStage);
    const currentStage = Number.isInteger(currentStageRaw)
      ? Math.max(0, Math.min(3, currentStageRaw))
      : 0;

    const lastCompletedStageRaw = Number(review.lastCompletedStage);
    const lastCompletedStage = Number.isInteger(lastCompletedStageRaw)
      ? Math.max(0, Math.min(3, lastCompletedStageRaw))
      : (completedStages.length ? completedStages[completedStages.length - 1] : 0);

    return {
      createdAt: Number.isFinite(Number(review.createdAt))
        ? Number(review.createdAt)
        : base,
      currentStage,
      completedStages,
      lastCompletedStage
    };
  }

  function refreshCurrentProjectReviewDefaults(){
    if (!currentProject) return;
    currentProject.review = normalizeReviewForSave(
      currentProject.review,
      currentProject.createdAt
    );
  }

  let activePointerInteractions = 0;
  let previousBodyOverflow = '';

  // マスク操作中の画面スクロール制御
  function lockPageScroll(){
    if (activePointerInteractions === 0) {
      previousBodyOverflow = document.body.style.overflow || '';
    }
    activePointerInteractions += 1;
    document.body.style.overflow = 'hidden';
  }

  function unlockPageScroll(){
    if (activePointerInteractions > 0) {
      activePointerInteractions -= 1;
    }
    if (activePointerInteractions <= 0) {
      activePointerInteractions = 0;
      document.body.style.overflow = previousBodyOverflow;
    }
  }

  function uid(prefix='id'){ return prefix + '-' + Math.random().toString(36).slice(2,9); }

  // 教材・カテゴリの読み込みと保存
  async function loadAllProjects(){
    return DigitalAnkiStorage.getAllProjects();
  }

  async function loadAllCategories(){
    return DigitalAnkiStorage.getAllCategories();
  }

  async function saveAllCategories(arr){
    await DigitalAnkiStorage.saveAllCategories(arr);
  }

  // 画像形式の判定
  function getDataUrlMime(dataUrl){
    const match = /^data:([^;,]+)[;,]/.exec(dataUrl || '');
    return match ? match[1].toLowerCase() : '';
  }

  function chooseOutputMime(inputMime){
    if (!inputMime) return 'image/jpeg';
    if (inputMime.includes('png')) return 'image/png';
    if (inputMime.includes('webp')) return 'image/webp';
    if (inputMime.includes('gif')) return 'image/png';
    return 'image/jpeg';
  }

  function syncImageAreaState(){
    if (!imageArea || !mainImage) return;
    imageArea.classList.toggle('has-image', !!mainImage.getAttribute('src'));
  }

  function syncMaskSettingsVisibility(){
    const maskSettings = document.querySelector('.edit-toolbar--secondary');
    if (!maskSettings) return;

    const hasContent = !!mainImage.getAttribute('src');
    maskSettings.classList.toggle('hidden', !hasContent);
  }

  // 画像の実際の表示領域の計算
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

  // カテゴリ一覧の更新
  async function refreshCategoryOptions(){
    const cats = await loadAllCategories();
    categoryList.innerHTML = '';
    cats.forEach(cat => {
      const id = 'catchk-' + cat.replace(/\s+/g,'_') + '-' + Math.random().toString(36).slice(2,6);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'default';
      
      // カテゴリ選択用チェックボックス
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = cat;
      chk.dataset.cat = cat;
      chk.id = id;
      chk.style.margin = '0';

      // カテゴリ名
      const span = document.createElement('span');
      span.textContent = cat;
      span.style.fontSize = '0.95rem';
      span.style.flex = '1';

      // カテゴリ削除ボタン
      const trash = document.createElement('button');
      trash.type = 'button';
      trash.title = 'カテゴリを削除';
      trash.className = 'trash-btn';
      trash.style.border = 'none';
      trash.style.background = 'transparent';
      trash.style.cursor = 'pointer';
      trash.style.padding = '4px';
      trash.style.marginLeft = '6px';

      const trashIcon = document.createElement('img');
      trashIcon.src = '../assets/delete.svg';
      trashIcon.alt = '';
      trashIcon.setAttribute('aria-hidden', 'true');

      trash.appendChild(trashIcon);
      trash.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        if (!confirm(`本当にこのカテゴリを削除しますか？`)) return;
        
        // カテゴリ削除処理
        const catsAll = (await loadAllCategories()).filter(c => c !== cat);
        await saveAllCategories(catsAll);

        const allProjects = await loadAllProjects();

        const changedProjects = [];

        allProjects.forEach((project) => {
          if (!Array.isArray(project.categories)) {
            project.categories = [];
          }

          if (project.categories.includes(cat)) {
            project.categories = project.categories.filter(c => c !== cat);
            changedProjects.push(project);
          }
        });

        for (const project of changedProjects) {
          try {
            await DigitalAnkiStorage.saveProject(project);
          } catch (error) {
            console.error(
              'カテゴリ削除に伴う教材の更新に失敗しました。',
              error
            );
          }
        }

      // カテゴリ変更を現在の教材へ反映
        await refreshProjectSelect();
        await updateCategoryVisibility();

        alert(`カテゴリ「${cat}」を削除しました。`);
      });

      // カテゴリ変更を現在の教材へ反映
      chk.addEventListener('change', () => {
        syncCategoriesFromUIToCurrentProject();
        markDirty(true);
      });

      row.appendChild(chk);
      row.appendChild(span);
      row.appendChild(trash);
      categoryList.appendChild(row);
    });
  }

  async function updateCategoryVisibility(){
    const visible = !!(
      (currentProject && currentProject.imageDataUrl) ||
      mainImage.src
    );

    if (!categoryBox) return;

    categoryBox.style.display = visible ? 'block' : 'none';

    if (!visible) return;

    await refreshCategoryOptions();

    if (currentProject && Array.isArray(currentProject.categories)) {
      const checks = categoryList.querySelectorAll('input[type="checkbox"]');
      checks.forEach(ch => {
        ch.checked = currentProject.categories.includes(ch.value);
      });
    } else {
      const checks = categoryList.querySelectorAll('input[type="checkbox"]');
      checks.forEach(ch => {
        ch.checked = false;
      });
    }
  }

  function syncCategoriesFromUIToCurrentProject(){
  if (!currentProject) {
    currentProject = {
      id: uid('proj'),
      name: 'project-untitled',
      imageDataUrl: mainImage.src || '',
      imageBaseWidth: mainImage.naturalWidth || undefined,
      imageBaseHeight: mainImage.naturalHeight || undefined,
      masks: masks.map(m => ({
        id: m.id,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
        rotation: normalizeRotation(m.rotation),
        visible: m.visible,
        color: m.color,
        shape: m.shape
      })),
      categories: [],
      createdAt: Date.now()
    };
  }
  const checked = Array.from(categoryList.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value);
  currentProject.categories = checked.length ? Array.from(new Set(checked)) : [];
  markDirty(true);
}

  if (colorPicker) colorPicker.value = '#000000';

  if (shapeSelect) {
    shapeSelect.addEventListener('change', (e)=>{
      defaultShape = e.target.value;
      if (selectedMaskId) {
        const m = masks.find(x=>x.id===selectedMaskId);
        if (m) {
          pushUndoState();
          m.shape = defaultShape;
          if (m.el) {
            m.el.classList.remove('rect','circle');
            m.el.classList.add(m.shape);
          }
          markDirty(true); // shape change => dirty
        }
      }
    });
  }

    // マスクの表示
    function updateMaskDOMFromModel(m){
      if (!m.el) return;
      const imgRect = getImageContentRect(mainImage);
      const wrapperRect = imageArea.getBoundingClientRect();
      if (!imgRect.width || !imgRect.height) {
        setTimeout(()=> updateMaskDOMFromModel(m), 40);
        return;
      }

      const rotation = normalizeRotation(m.rotation);
      m.rotation = rotation;

      const left = (m.x * imgRect.width) + (imgRect.left - wrapperRect.left);
      const top = (m.y * imgRect.height) + (imgRect.top - wrapperRect.top);

      m.el.style.left = left + 'px';
      m.el.style.top = top + 'px';
      m.el.style.width = (m.w * imgRect.width) + 'px';
      m.el.style.height = (m.h * imgRect.height) + 'px';
      m.el.style.transformOrigin = 'center center';
      m.el.style.transform = `rotate(${rotation}deg)`;
      m.el.style.overflow = 'visible';

      m.el.classList.remove('rect','circle');
      m.el.classList.add(m.shape || 'rect');
      m.el.style.background = m.color || '#000000';

      const isVisible = (m.visible === undefined) ? true : Boolean(m.visible);
      m.el.style.opacity = isVisible ? '0.5' : '0';
      m.el.classList.toggle('selected', selectedMaskId === m.id);

      if (m.rotateHandle) {
        m.rotateHandle.style.display = selectedMaskId === m.id ? 'block' : 'none';
      }
    }

  function refreshAllMasks(){
    masks.forEach(updateMaskDOMFromModel);
  }

    function renderMask(m){
    const el = document.createElement('div');
    el.className = 'mask';
    el.classList.add(m.shape || 'rect');
    el.dataset.id = m.id;
    el.style.touchAction = 'none';
    el.style.overflow = 'visible';
    el.style.transformOrigin = 'center center';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';

    const rotateHandle = document.createElement('div');
    rotateHandle.className = 'rotate-handle';

    el.appendChild(resizeHandle);
    el.appendChild(rotateHandle);
    imageArea.appendChild(el);

    m.el = el;
    m.resizeHandle = resizeHandle;
    m.rotateHandle = rotateHandle;

    updateMaskDOMFromModel(m);
    setupInteractions(m, resizeHandle, rotateHandle);
  }

  function setupInteractions(m, resizeHandle, rotateHandle){
    const el = m.el;
    let dragging = false;
    let resizing = false;
    let rotating = false;
    let startClient = null;
    let startBox = null;
    let startRotation = 0;
    let startAngle = 0;
    let centerX = 0;
    let centerY = 0;

    function commit(){
      const wrapperRect = imageArea.getBoundingClientRect();
      const imgRect = getImageContentRect(mainImage);
      const left = parseFloat(el.style.left || 0);
      const top = parseFloat(el.style.top || 0);
      const width = parseFloat(el.style.width || 0);
      const height = parseFloat(el.style.height || 0);
      const relX = (left - (imgRect.left - wrapperRect.left)) / imgRect.width;
      const relY = (top - (imgRect.top - wrapperRect.top)) / imgRect.height;
      const relW = width / imgRect.width;
      const relH = height / imgRect.height;

      m.x = Math.max(0, Math.min(1 - relW, relX));
      m.y = Math.max(0, Math.min(1 - relH, relY));
      m.w = Math.max(MIN_MASK_PX / imgRect.width, Math.min(1, relW));
      m.h = Math.max(MIN_MASK_PX / imgRect.height, Math.min(1, relH));
      m.rotation = normalizeRotation(m.rotation);

      updateMaskDOMFromModel(m);
      markDirty(true);
    }

    const preventTouchScroll = (ev) => {
      ev.preventDefault();
    };

    el.addEventListener('touchstart', preventTouchScroll, { passive: false });
    el.addEventListener('touchmove', preventTouchScroll, { passive: false });
    resizeHandle.addEventListener('touchstart', preventTouchScroll, { passive: false });
    resizeHandle.addEventListener('touchmove', preventTouchScroll, { passive: false });
    rotateHandle.addEventListener('touchstart', preventTouchScroll, { passive: false });
    rotateHandle.addEventListener('touchmove', preventTouchScroll, { passive: false });

    el.addEventListener('pointerdown', (ev)=>{
      ev.preventDefault();

      const wasSelected = selectedMaskId === m.id;

      selectMask(m.id);

      if (!wasSelected) {
        return;
      }

      lockPageScroll();
      pushUndoState();

      startClient = { x: ev.clientX, y: ev.clientY };
      startBox = {
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight
      };

      if (ev.target === rotateHandle) {
        rotating = true;
        resizing = false;
        dragging = false;
        startRotation = normalizeRotation(m.rotation);
        centerX = startBox.left + startBox.width / 2;
        centerY = startBox.top + startBox.height / 2;
        startAngle = Math.atan2(
          ev.clientY - centerY,
          ev.clientX - centerX
        );
      } else if (ev.target === resizeHandle) {
        resizing = true;
        rotating = false;
        dragging = false;
      } else {
        dragging = true;
        rotating = false;
        resizing = false;
      }

      el.setPointerCapture && el.setPointerCapture(ev.pointerId);
  });

    window.addEventListener('pointermove', (ev)=>{
      if (!dragging && !resizing && !rotating) return;
      ev.preventDefault();

      if (rotating) {
        const currentAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
        const delta = (currentAngle - startAngle) * 180 / Math.PI;
        m.rotation = startRotation + delta;
        updateMaskDOMFromModel(m);
        return;
      }

      const dx = ev.clientX - startClient.x;
      const dy = ev.clientY - startClient.y;

      if (dragging){
        el.style.left = (startBox.left + dx) + 'px';
        el.style.top = (startBox.top + dy) + 'px';
      } else if (resizing){
        el.style.width = Math.max(MIN_MASK_PX, startBox.width + dx) + 'px';
        el.style.height = Math.max(MIN_MASK_PX, startBox.height + dy) + 'px';
      }
    });

    window.addEventListener('pointerup', (ev)=>{
      if (!dragging && !resizing && !rotating) {
        unlockPageScroll();
        return;
      }
      try{ el.releasePointerCapture && el.releasePointerCapture(ev.pointerId);}catch(e){}
      dragging = false;
      resizing = false;
      rotating = false;
      commit();
      unlockPageScroll();
    });

    window.addEventListener('pointercancel', ()=>{
      if (!dragging && !resizing && !rotating) {
        unlockPageScroll();
        return;
      }
      dragging = false;
      resizing = false;
      rotating = false;
      unlockPageScroll();
    });

    el.addEventListener('dblclick', (ev)=>{
      m.visible = !m.visible;
      el.style.opacity = m.visible ? '0.5' : '0';
      markDirty(true);
    });
  }

  function selectMask(id){
    selectedMaskId = id;
    refreshAllMasks();

    const m = masks.find(x=>x.id===id);

    if (m && colorPicker) {
      colorPicker.value = m.color || '#000000';

      const colorValue = (m.color || '#000000').toLowerCase();
      document.querySelectorAll('.swatch[data-color]').forEach((btn) => {
        const buttonColor = String(btn.dataset.color || '').toLowerCase();
        const active = buttonColor === colorValue;
        btn.classList.toggle('is-selected', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    if (m && shapeSelect) {
      shapeSelect.value = m.shape || 'rect';
      defaultShape = shapeSelect.value;

      const shapeValue = shapeSelect.value;
      document.querySelectorAll('.shape-btn[data-shape]').forEach((btn) => {
        const buttonShape = String(btn.dataset.shape || '');
        const active = buttonShape === shapeValue;
        btn.classList.toggle('is-selected', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    if (btnDeleteSelected) btnDeleteSelected.disabled = !selectedMaskId;
  }

  if (colorPicker) {
    colorPicker.addEventListener('input', (e)=>{
      const c = e.target.value;
      if (selectedMaskId) {
        const m = masks.find(x=>x.id === selectedMaskId);
        if (m) {
          pushUndoState();
          m.color = c;
          if (m.el) m.el.style.background = c;
          markDirty(true); // マスクの形変更を未保存状態として記録
        }
      }
    });
  }

  if (btnDeleteSelected) {
  btnDeleteSelected.addEventListener('click', ()=>{
    if (!selectedMaskId) return;
    pushUndoState();
    const idx = masks.findIndex(x=>x.id===selectedMaskId);
      if (idx>=0){
        const m = masks[idx];
        m.el && m.el.remove();
        masks.splice(idx,1);
        selectedMaskId = null;
        markDirty(true); // マスクの削除を未保存状態として記録
      }
    });
  }

  if (btnDuplicateMask) {
  btnDuplicateMask.addEventListener('click', ()=>{
    if (!selectedMaskId) { alert('マスクが選択されていません'); return; }
    const orig = masks.find(x=>x.id===selectedMaskId);
    if (!orig) return;
    pushUndoState();
      const imgRect = getImageContentRect(mainImage);
      const offsetX = Math.min(20, imgRect.width * 0.05) / imgRect.width;
      const offsetY = Math.min(20, imgRect.height * 0.05) / imgRect.height;
            const copy = {
        id: uid('m'),
        x: Math.min(1 - orig.w, orig.x + offsetX),
        y: Math.min(1 - orig.h, orig.y + offsetY),
        w: orig.w,
        h: orig.h,
        rotation: normalizeRotation(orig.rotation),
        visible: (orig.visible === undefined) ? true : orig.visible,
        color: orig.color,
        shape: orig.shape
      };
      masks.push(copy);
      renderMask(copy);
      selectMask(copy.id);
      markDirty(true); // マスクの複製を未保存状態として記録
    });
  }

  if (btnAddMask) {
    btnAddMask.addEventListener('click', ()=>{
      if (!mainImage.src) { alert('先に教材を読み込んでください'); return; }
      pushUndoState();
      const rect = getImageContentRect(mainImage);
      const w = Math.min( Math.round(rect.width * 0.5), 800 );
      const h = Math.min( Math.round(rect.height * 0.12), 200 );
      const relX = 0.5 - (w / rect.width) / 2;
      const relY = 0.5 - (h / rect.height) / 2;
      const color = colorPicker ? (colorPicker.value || '#000000') : '#000000';
      const shape = defaultShape || 'rect';
            const m = {
        id: uid('m'),
        x: relX,
        y: relY,
        w: w / rect.width,
        h: h / rect.height,
        rotation: 0,
        visible: true,
        color: color,
        shape: shape
      };
      masks.push(m);
      renderMask(m);
      selectMask(m.id);
      markDirty(true); // マスクの追加を未保存状態として記録
    });
  }

  if (btnChooseImage) {
    btnChooseImage.addEventListener('click', () => {
      if (imageInput) {
        imageInput.value = '';
        imageInput.click();
      }
    });
  }

  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const dataUrl = await fileToDataURL(file);
      const canvasData = await createCanvasFromDataURL(dataUrl, 2000);
      loadImage(canvasData.dataUrl);
      currentProject = { id: uid('proj'), name: file.name.replace(/\.[^.]+$/,''), imageDataUrl: canvasData.dataUrl, imageBaseWidth: canvasData.width, imageBaseHeight: canvasData.height, masks: [], categories: [], createdAt: Date.now() };
      undoStack = [];
      if (btnUndo) btnUndo.disabled = true;
      masks = [];
      selectedMaskId = null;

      // 新しい画像を読み込んだため未保存状態として記録
      markDirty(true);
      updateCategoryVisibility();
    });
  }
  syncSaveButtonState();

  function fileToDataURL(file){
    return new Promise((res,rej)=>{
      const fr = new FileReader();
      fr.onload = ()=> res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  async function createCanvasFromDataURL(dataUrl, maxDimension=1200){
    const img = new Image();
    await new Promise(r=>{ img.onload = r; img.onerror = r; img.src = dataUrl; });
    const origW = img.naturalWidth || img.width || 1200;
    const origH = img.naturalHeight || img.height || 800;
    const scale = Math.min(1, maxDimension / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img,0,0,targetW,targetH);

    const inputMime = getDataUrlMime(dataUrl);
    const outputMime = chooseOutputMime(inputMime);
      
    let outputDataUrl = dataUrl;
    try {
      outputDataUrl = canvas.toDataURL(outputMime, 0.95);
    } catch (e) {
      try {
        outputDataUrl = canvas.toDataURL('image/png');
      } catch (e2) {
        outputDataUrl = dataUrl;
      }
    }
    return { dataUrl: outputDataUrl, width: targetW, height: targetH, mimeType: outputMime };
  }

  async function persistProjectWithFallback(payload){
    const widths = [null, 960, 720, 560, 400];

    for (const maxWidth of widths) {
      const candidate = JSON.parse(JSON.stringify(payload));

      if (maxWidth !== null) {
        try {
          const compressed = await createCanvasFromDataURL(
            candidate.imageDataUrl,
            maxWidth
          );

          candidate.imageDataUrl = compressed.dataUrl;
          candidate.imageBaseWidth = compressed.width;
          candidate.imageBaseHeight = compressed.height;
        } catch (e) {
          console.error('圧縮に失敗', e);
        }
      }

      try {
        await DigitalAnkiStorage.saveProject(candidate);
        return candidate;
      } catch (error) {
        console.error('教材の保存に失敗', error);
      }
    }

    return null;
  }

  function loadImage(dataUrl){
    mainImage.src = dataUrl;
    syncImageAreaState();
    syncMaskSettingsVisibility();
    syncSaveButtonState();

    masks.forEach(m=> m.el && m.el.remove());
    masks = [];
    selectedMaskId = null;

    mainImage.onload = () => {
      setTimeout(refreshAllMasks, 40);
      updateCategoryVisibility();
    };
  }

  // テキスト挿入画面の表示
  if (btnInsertText) {
    btnInsertText.addEventListener('click', ()=>{
      const hasImage = !!mainImage.src;
      const isTextProject = !!(
        currentProject &&
        currentProject.contentType === 'text'
      );

      if (hasImage && !isTextProject) {
        const ok = confirm(
          'テキストを挿入した場合、現在の画像は破棄されます。テキストを挿入しますか？'
        );

        if (!ok) {
          return;
        }
      }

      if (isTextProject && currentProject.textData) {
        textInputArea.value = currentProject.textData.text || '';
        textFontSize.value = String(currentProject.textData.fontSize || 32);
      } else {
        textInputArea.value = '';
        textFontSize.value = '32';
      }

      textModal.classList.remove('hidden');
      textInputArea.focus();
    });
  }

  if (btnInsertCancel) btnInsertCancel.addEventListener('click', ()=> textModal.classList.add('hidden'));

  // テキストの折り返し処理
  function wrapTextPreserveNewlines(ctx, text, maxWidth){
    const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
    const outLines = [];
    for (let p of paragraphs){
      if (p.trim() === '') {
        outLines.push('');
        continue;
      }
      const words = p.split(' ');
      let line = '';
      for (let i=0;i<words.length;i++){
        const word = words[i];
        const test = line ? (line + ' ' + word) : word;
        const metrics = ctx.measureText(test);
        if (metrics.width > maxWidth && line) {
          outLines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) outLines.push(line);
    }
    return outLines;
  }

  async function createTextImageData(text, fontSize){
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 400;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'top';

  const padding = 12;
  const maxTextWidth = Math.max(16, canvas.width - padding * 2);
  const lines = wrapTextPreserveNewlines(ctx, text || '', maxTextWidth);

  let y = padding;
  const lineHeight = Math.round(fontSize * 1.2);

  for (const line of lines){
    if (y > canvas.height - padding) break;
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height
  };
  }


  if (btnInsertConfirm) {
    btnInsertConfirm.addEventListener('click', async ()=>{
      const text = textInputArea.value || '';
      const fontSize = parseInt(textFontSize.value, 10) || 32;

      if (!String(text).trim()) {
        return;
      }

      const textCanvasData = await createTextImageData(text, fontSize);
      textModal.classList.add('hidden');

      const projectId = currentProject && currentProject.id
        ? currentProject.id
        : uid('proj');

      const createdAt = currentProject && currentProject.createdAt
        ? currentProject.createdAt
        : Date.now();

      const categories = currentProject && Array.isArray(currentProject.categories)
        ? [...currentProject.categories]
        : [];

      loadImage(textCanvasData.dataUrl);

      currentProject = {
        id: projectId,
        name: currentProject && currentProject.name
          ? currentProject.name
          : 'text-image',
        imageDataUrl: textCanvasData.dataUrl,
        imageBaseWidth: textCanvasData.width,
        imageBaseHeight: textCanvasData.height,
        masks: [],
        categories,
        createdAt,
        contentType: 'text',
        textData: {
          text,
          fontSize
        }
      };

      undoStack = [];
      if (btnUndo) btnUndo.disabled = true;

      markDirty(true);
      updateCategoryVisibility();
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async ()=>{
      try {
        if (!mainImage.src) { alert('保存する教材がありません'); return; }

        masks.forEach(m => {
          const wrapperRect = imageArea.getBoundingClientRect();
          const imgRect = getImageContentRect(mainImage);
          const left = parseFloat(m.el.style.left || 0);
          const top = parseFloat(m.el.style.top || 0);
          const width = parseFloat(m.el.style.width || 0);
          const height = parseFloat(m.el.style.height || 0);
          const relX = (left - (imgRect.left - wrapperRect.left)) / imgRect.width;
          const relY = (top - (imgRect.top - wrapperRect.top)) / imgRect.height;
          const relW = width / imgRect.width;
          const relH = height / imgRect.height;
          m.x = Math.max(0, Math.min(1, relX));
          m.y = Math.max(0, Math.min(1, relY));
          m.w = Math.max(MIN_MASK_PX / imgRect.width, Math.min(1, relW));
          m.h = Math.max(MIN_MASK_PX / imgRect.height, Math.min(1, relH));
        });

        syncCategoriesFromUIToCurrentProject();
        if (!currentProject) currentProject = {};
        if (!Array.isArray(currentProject.categories)) currentProject.categories = [];
        refreshCurrentProjectReviewDefaults();

        let finalImageDataUrl = mainImage.src;
        let baseW = mainImage.naturalWidth || undefined;
        let baseH = mainImage.naturalHeight || undefined;

        const normalizedMasks = masks.map(m => ({
          id: m.id,
          x: Number(m.x || 0),
          y: Number(m.y || 0),
          w: Number(m.w || 0),
          h: Number(m.h || 0),
          rotation: normalizeRotation(m.rotation),
          visible: (m.visible === undefined) ? true : Boolean(m.visible),
          color: m.color,
          shape: m.shape
        }));

        // 教材名の入力
        let name;
        if (currentProject && currentProject.name) {
          const ans = prompt('教材名を入力してください', currentProject.name);
          if (ans === null) {
            return;
          }
          name = (ans.trim() === '') ? currentProject.name : ans;
        } else {
          const ans = prompt('教材名を入力してください');
          if (ans === null) {
            return;
          }
          name = (ans.trim() === '') ? ('project-' + new Date().toLocaleString()) : ans;
        }

        const createdAt = currentProject && currentProject.createdAt ? currentProject.createdAt : Date.now();
        const payload = {
          id: currentProject && currentProject.id ? currentProject.id : uid('proj'),
          name,
          imageDataUrl: finalImageDataUrl,
          masks: normalizedMasks,
          categories: currentProject.categories || [],
          imageBaseWidth: baseW,
          imageBaseHeight: baseH,
          createdAt,
          review: normalizeReviewForSave(currentProject.review, createdAt),
          contentType: currentProject && currentProject.contentType
            ? currentProject.contentType
            : 'image',
          textData: (
            currentProject &&
            currentProject.contentType === 'text' &&
            currentProject.textData
          )
            ? {
                text: currentProject.textData.text || '',
                fontSize: Number(currentProject.textData.fontSize) || 32
              }
            : null
        };
        const savedPayload = await persistProjectWithFallback(payload);
        if (!savedPayload) {
          alert('保存に失敗しました。端末の保存容量が不足している可能性があります。');
          return;
        }

        await refreshProjectSelect();

        // 保存した教材を現在の教材に反映
        currentProject = JSON.parse(JSON.stringify(savedPayload));
        clearDirty();
        alert('保存しました');
        refreshCategoryOptions();
        updateCategoryVisibility();
      } catch (err) {
        console.error(err);
        alert('保存に失敗しました');
      }
    });
  }

  if (btnLoad) {
    btnLoad.addEventListener('click', async ()=>{
      const id = projectSelect.value;
      if (!id) { alert('読み込む教材を選んでください'); return; }
      const all = await loadAllProjects();
      const p = all.find(x => x.id === id);
      if (!p) { alert('教材が見つかりません'); return; }
      currentProject = JSON.parse(JSON.stringify(p));

      if (currentProject.contentType === 'text' && currentProject.textData) {
        currentProject.textData = {
          text: currentProject.textData.text || '',
          fontSize: Number(currentProject.textData.fontSize) || 32
        };
      }

      undoStack = [];
      if (btnUndo) btnUndo.disabled = true;
      syncSaveButtonState();
      refreshCurrentProjectReviewDefaults();
      masks.forEach(m=> m.el && m.el.remove());
      masks = [];
      mainImage.src = currentProject.imageDataUrl;
      syncImageAreaState();
      syncMaskSettingsVisibility();
      syncSaveButtonState();

      mainImage.onload = async ()=>{
        if (!Array.isArray(currentProject.categories)) currentProject.categories = [];
        if (Array.isArray(currentProject.masks)) {
          const imgNaturalW = mainImage.naturalWidth || currentProject.imageBaseWidth || mainImage.width;
          const imgNaturalH = mainImage.naturalHeight || currentProject.imageBaseHeight || mainImage.height;
          let converted = false;
          currentProject.masks.forEach(mm => {
            if (!mm) return;
            if (mm.x > 1 || mm.w > 1 || mm.y > 1 || mm.h > 1) {
              const baseW = currentProject.imageBaseWidth || imgNaturalW || 1;
              const baseH = currentProject.imageBaseHeight || imgNaturalH || 1;
              mm.x = Math.min(1, mm.x / baseW);
              mm.y = Math.min(1, mm.y / baseH);
              mm.w = Math.min(1, mm.w / baseW);
              mm.h = Math.min(1, mm.h / baseH);
              converted = true;
            }
            if (mm.visible === undefined || mm.visible === null) mm.visible = true;
          });
          if (converted) {
            try {
              await DigitalAnkiStorage.saveProject(currentProject);
            } catch (error) {
              console.error('マスク補正データの保存に失敗しました。', error);
            }
          }
        }

        currentProject.masks.forEach(mm=>{
                    const m = {
            id: mm.id || uid('m'),
            x: mm.x,
            y: mm.y,
            w: mm.w,
            h: mm.h,
            rotation: normalizeRotation(mm.rotation),
            visible: (mm.visible === undefined) ? true : Boolean(mm.visible),
            color: mm.color || '#000000',
            shape: mm.shape || 'rect'
          };
          masks.push(m);
          renderMask(m);
        });
        refreshAllMasks();
        refreshCategoryOptions();
        const checks = categoryList.querySelectorAll('input[type="checkbox"]');
        checks.forEach(ch => ch.checked = currentProject.categories.includes(ch.value));
        updateCategoryVisibility();

        // 保存済み教材を読み込んだため未保存状態を解除
        clearDirty();
      };
    });
  }

  // 未保存の教材を確認してから戻る処理
  if (btnBack) {
    btnBack.addEventListener('click', (ev) => {
      // 未保存の変更がある場合に確認
      if (isDirty) {
        const ok = confirm('教材が保存されていません。本当に戻りますか？');
        if (!ok) {
          // 戻る処理を中止
          return;
        }
      }
      location.href = '../html/index.html';
    });
  }

  if (btnUndo) {
  btnUndo.disabled = true;
  btnUndo.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) {
      btnUndo.disabled = true;
      return;
    }
    restoreUndoState(prev);
  });
  }
  window.addEventListener('resize', refreshAllMasks);
  mainImage.addEventListener('load', refreshAllMasks);

  async function refreshProjectSelect(){
    const all = await loadAllProjects();

    if (!projectSelect) return;

    projectSelect.innerHTML = '';

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'タップして選択';
    projectSelect.appendChild(emptyOpt);

    all.sort((a, b) => {
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    all.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name || '無題'} (${new Date(p.createdAt).toLocaleString()})`;
      projectSelect.appendChild(opt);
    });
  }

  if (btnNewCategory) {
    btnNewCategory.addEventListener('click', async ()=>{
      const name = prompt('カテゴリ名を入力してください');
      if (!name) return;

      const cats = await loadAllCategories();

      if (cats.includes(name)) {
        alert('同名のカテゴリが既に存在します');
        return;
      }

      cats.push(name);

      await saveAllCategories(cats);
      await refreshCategoryOptions();
      updateCategoryVisibility();
      markDirty(true);
    });
  }

async function initializeEditPage() {
  syncMaskSettingsVisibility();

  await refreshProjectSelect();
  await updateCategoryVisibility();
}

initializeEditPage();
})();