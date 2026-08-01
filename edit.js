(() => {
  const STORAGE_KEY = 'digital-anki-projects-v1';
  const CATS_KEY = 'digital-anki-categories-v1';
  const getEl = id => document.getElementById(id);
  const imageInput = getEl('imageInput');
  const mainImage = getEl('mainImage');
  const imageArea = getEl('imageArea');
  const btnChooseImage = getEl('btnChooseImage');
  const btnAddMask = getEl('btnAddMask');
  const btnDeleteSelected = getEl('btnDeleteSelected');
  const btnSave = getEl('btnSave');
  const btnBack = getEl('btnBack');
  const projectSelect = getEl('projectSelect');
  const btnLoad = getEl('btnLoad');
  const btnDeleteProject = getEl('btnDeleteProject');
  const colorPicker = getEl('colorPicker');
  const shapeSelect = getEl('shapeSelect');
  const btnInsertText = getEl('btnInsertText');
  const btnDuplicateMask = getEl('btnDuplicateMask');

  // category controls
  const categoryBox = getEl('categoryBox');
  const categoryList = getEl('categoryList');
  const btnNewCategory = getEl('btnNewCategory');
  // NOTE: btnDeleteCategory UI/button removed per latest spec (do not reference it)
  // const btnDeleteCategory = getEl('btnDeleteCategory');

  const textModal = getEl('textModal');
  const textInputArea = getEl('textInputArea');
  const textFontSize = getEl('textFontSize');
  const textCanvasWidth = getEl('textCanvasWidth');
  const textCanvasHeight = getEl('textCanvasHeight');
  const textColorPicker = getEl('textColorPicker');
  const btnInsertCancel = getEl('btnInsertCancel');
  const btnInsertConfirm = getEl('btnInsertConfirm');

  if (!imageArea || !mainImage) {
    console.error('必須要素 missing');
    return;
  }

  // ----- state -----
  let masks = [];
  let selectedMaskId = null;
  let currentProject = null;
  let defaultShape = shapeSelect ? shapeSelect.value : 'rect';
  let textBox = null;

  // --- NEW: dirty flag (未保存状態) ---
  // true = 編集している（保存されていない変更あり OR 新規に読み込んだ/作成したが未保存）
  let isDirty = false;
  function markDirty(flag = true) { isDirty = !!flag; }
  function clearDirty() { isDirty = false; }
  const MIN_MASK_PX = 8;
  const DEFAULT_MASK_ROTATION = 0;

  function normalizeRotation(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : DEFAULT_MASK_ROTATION;
}

  const REVIEW_INTERVAL_DAYS = [1, 7, 30, 90];
  const DAY_MS = 24 * 60 * 60 * 1000;

  function buildInitialReview(createdAt){
    const base = Number(createdAt) || Date.now();
    return {
      stage: 0,
      nextReviewAt: base + REVIEW_INTERVAL_DAYS[0] * DAY_MS,
      completed: false
    };
  }

  function normalizeReviewForSave(review, createdAt){
    const base = Number(createdAt) || Date.now();
    const fallback = buildInitialReview(base);
    if (!review || typeof review !== 'object') return fallback;
    const stageRaw = Number(review.stage);
    const stage = Number.isFinite(stageRaw) ? Math.max(0, Math.min(4, Math.floor(stageRaw))) : 0;
    const completed = !!review.completed || stage >= REVIEW_INTERVAL_DAYS.length;
    const stepIndex = Math.min(stage, REVIEW_INTERVAL_DAYS.length - 1);
    const nextReviewAt = Number.isFinite(Number(review.nextReviewAt))
      ? Number(review.nextReviewAt)
      : (completed ? null : base + REVIEW_INTERVAL_DAYS[stepIndex] * DAY_MS);
    if (completed) {
      return { stage: REVIEW_INTERVAL_DAYS.length, nextReviewAt: null, completed: true };
    }
    return { stage, nextReviewAt, completed: false };
  }

  function refreshCurrentProjectReviewDefaults(){
    if (!currentProject) return;
    currentProject.review = normalizeReviewForSave(currentProject.review, currentProject.createdAt);
  }

  let activePointerInteractions = 0;
  let previousBodyOverflow = '';

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

  // ----- utils -----
  function uid(prefix='id'){ return prefix + '-' + Math.random().toString(36).slice(2,9); }

  function loadAllProjects(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw).projects || []; } catch(e){ return []; }
  }
  function saveAllProjects(arr){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({projects: arr}));
      return true;
    } catch (e) {
      console.error('保存に失敗しました', e);
      return false;
    }
  }

  function loadAllCategories(){
    const raw = localStorage.getItem(CATS_KEY);
    if (!raw) {
      const init = [];
      localStorage.setItem(CATS_KEY, JSON.stringify({categories: init}));
      return init;
    }
    try { return JSON.parse(raw).categories || []; } catch(e){ return []; }
  }
  function saveAllCategories(arr){ localStorage.setItem(CATS_KEY, JSON.stringify({categories: arr})); }

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

  // Insert label "色" between image selection button and colorPicker (do it dynamically so HTML doesn't need editing)
  (function insertColorLabelOnce(){
    try {
      if (!btnChooseImage || !colorPicker) return;
      const existingLabel = colorPicker.previousSibling;
      if (existingLabel && existingLabel.dataset && existingLabel.dataset.insertedColorLabel) return;
      const label = document.createElement('span');
      label.textContent = '色';
      label.style.margin = '0 8px';
      label.style.fontWeight = '600';
      label.dataset.insertedColorLabel = '1';
      colorPicker.parentNode && colorPicker.parentNode.insertBefore(label, colorPicker);
    } catch(e){}
  })();

  function refreshCategoryOptions(){
    const cats = loadAllCategories();
    categoryList.innerHTML = '';
    cats.forEach(cat => {
      const id = 'catchk-' + cat.replace(/\s+/g,'_') + '-' + Math.random().toString(36).slice(2,6);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'default';
      // checkbox
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = cat;
      chk.dataset.cat = cat;
      chk.id = id;
      chk.style.margin = '0';
      // label text
      const span = document.createElement('span');
      span.textContent = cat;
      span.style.fontSize = '0.95rem';
      span.style.flex = '1';
      // trash icon button (delete per-category)
      const trash = document.createElement('button');
      trash.type = 'button';
      trash.title = 'カテゴリを削除';
      trash.className = 'trash-btn';
      trash.style.border = 'none';
      trash.style.background = 'transparent';
      trash.style.cursor = 'pointer';
      trash.style.padding = '4px';
      trash.style.marginLeft = '6px';
      trash.textContent = '🗑️';
      trash.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        if (!confirm(`本当にこのカテゴリを削除しますか？`)) return;
        // delete category: remove from global list, and remove from all projects; projects that had only this become categories = []
        const catsAll = loadAllCategories().filter(c=>c !== cat);
        saveAllCategories(catsAll);
        const allProjects = loadAllProjects();
        let changed = false;
        allProjects.forEach(p => {
          if (!Array.isArray(p.categories)) p.categories = [];
          if (p.categories.includes(cat)) {
            p.categories = p.categories.filter(c => c !== cat);
            changed = true;
          }
        });
        if (changed) saveAllProjects(allProjects);
        // refresh UI
        refreshProjectSelect();
        refreshCategoryOptions();
        updateCategoryVisibility();
        alert(`カテゴリ「${cat}」を削除しました。該当画像はカテゴリなしになります。`);
      });

      // when checkbox toggled -> sync to currentProject and mark dirty
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

  function updateCategoryVisibility(){
    const visible = !!( (currentProject && currentProject.imageDataUrl) || mainImage.src );
    if (!categoryBox) return;
    categoryBox.style.display = visible ? 'block' : 'none';
    if (visible) {
      refreshCategoryOptions();
      if (currentProject && Array.isArray(currentProject.categories)) {
        const checks = categoryList.querySelectorAll('input[type="checkbox"]');
        checks.forEach(ch => {
          ch.checked = currentProject.categories.includes(ch.value);
        });
      } else {
        const checks = categoryList.querySelectorAll('input[type="checkbox"]');
        checks.forEach(ch => { ch.checked = false; });
      }
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

  function deleteCategoryBySelection(){
    const selected = Array.from(categoryList.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value);
    if (!selected.length) { alert('削除するカテゴリを選んでください'); return; }
    const catName = selected[0];
    if (!confirm(`カテゴリ "${catName}" を本当に削除しますか？\n`)) return;
    const cats = loadAllCategories().filter(c => c !== catName);
    saveAllCategories(cats);
    const all = loadAllProjects();
    let changed=false;
    all.forEach(p=>{
      if (!Array.isArray(p.categories)) p.categories = [];
      if (p.categories.includes(catName)) {
        p.categories = p.categories.filter(c => c !== catName);
        changed = true;
      }
    });
    if (changed) saveAllProjects(all);
    refreshProjectSelect();
    refreshCategoryOptions();
    updateCategoryVisibility();
    alert(`"${catName}" を削除しました。`);
  }

  if (colorPicker) colorPicker.value = '#000000';
  defaultShape = shapeSelect ? shapeSelect.value : 'rect';

  if (shapeSelect) {
    shapeSelect.addEventListener('change', (e)=>{
      defaultShape = e.target.value;
      if (selectedMaskId) {
        const m = masks.find(x=>x.id===selectedMaskId);
        if (m) {
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

  // ===== mask rendering and interactions (unchanged except default visible handling) =====
    function updateMaskDOMFromModel(m){
    if (!m.el) return;
    const imgRect = mainImage.getBoundingClientRect();
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
    resizeHandle.style.touchAction = 'none';

    const rotateHandle = document.createElement('div');
    rotateHandle.className = 'rotate-handle';
    rotateHandle.style.position = 'absolute';
    rotateHandle.style.left = '50%';
    rotateHandle.style.top = 'calc(100% + 10px)';
    rotateHandle.style.transform = 'translateX(-50%)';
    rotateHandle.style.width = '12px';
    rotateHandle.style.height = '12px';
    rotateHandle.style.borderRadius = '50%';
    rotateHandle.style.background = '#fff';
    rotateHandle.style.border = '1px solid #333';
    rotateHandle.style.boxShadow = '0 1px 3px rgba(0,0,0,.2)';
    rotateHandle.style.cursor = 'grab';
    rotateHandle.style.touchAction = 'none';
    rotateHandle.style.userSelect = 'none';
    rotateHandle.style.zIndex = '2';
    rotateHandle.style.display = 'none';

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
      const imgRect = mainImage.getBoundingClientRect();
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
      lockPageScroll();
      selectMask(m.id);

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
        startAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
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
    if (m && colorPicker) colorPicker.value = m.color || '#000000';
    if (m && shapeSelect) shapeSelect.value = m.shape || 'rect';
    if (btnDeleteSelected) btnDeleteSelected.disabled = !selectedMaskId;
  }

  if (colorPicker) {
    colorPicker.addEventListener('input', (e)=>{
      const c = e.target.value;
      if (selectedMaskId) {
        const m = masks.find(x=>x.id === selectedMaskId);
        if (m) {
          m.color = c;
          if (m.el) m.el.style.background = c;
          markDirty(true); // color change => dirty
        }
      }
    });
  }

  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener('click', ()=>{
      if (!selectedMaskId) return;
      const idx = masks.findIndex(x=>x.id===selectedMaskId);
      if (idx>=0){
        const m = masks[idx];
        m.el && m.el.remove();
        masks.splice(idx,1);
        selectedMaskId = null;
        btnDeleteSelected.disabled = true;
        markDirty(true); // deletion => dirty
      }
    });
  }

  if (btnDuplicateMask) {
    btnDuplicateMask.addEventListener('click', ()=>{
      if (!selectedMaskId) { alert('マスクが選択されていません'); return; }
      const orig = masks.find(x=>x.id===selectedMaskId);
      if (!orig) return;
      const imgRect = mainImage.getBoundingClientRect();
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
      markDirty(true); // duplication => dirty
    });
  }

  if (btnAddMask) {
    btnAddMask.addEventListener('click', ()=>{
      if (!mainImage.src) { alert('先に画像を読み込んでください'); return; }
      const rect = mainImage.getBoundingClientRect();
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
      markDirty(true); // adding mask => dirty
    });
  }

  if (btnChooseImage) {
    btnChooseImage.addEventListener('click', ()=> {
      currentProject = null;
      clearTextBox();
      masks.forEach(m=> m.el && m.el.remove());
      masks = [];
      selectedMaskId = null;
      if (imageInput) {
        imageInput.value = '';
        imageInput.click();
      }
      // Starting new image selection => unsaved until saved
      markDirty(true);
      updateCategoryVisibility();
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
      masks = [];
      selectedMaskId = null;
      // new image loaded but not saved => dirty
      markDirty(true);
      updateCategoryVisibility();
    });
  }

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
      outputDataUrl = canvas.toDataURL(outputMime, quality);
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
          const compressed = await createCanvasFromDataURL(candidate.imageDataUrl, maxWidth);
          candidate.imageDataUrl = compressed.dataUrl;
          candidate.imageBaseWidth = compressed.width;
          candidate.imageBaseHeight = compressed.height;
        } catch (e) {
          console.error('圧縮に失敗', e);
        }
      }
      const all = loadAllProjects();
      const existingIdx = all.findIndex(p => p.id === candidate.id);
      if (existingIdx >= 0) all[existingIdx] = candidate;
      else all.unshift(candidate);
      if (saveAllProjects(all)) return candidate;
    }
    return null;
  }

  function loadImage(dataUrl){
    mainImage.src = dataUrl;
    masks.forEach(m=> m.el && m.el.remove());
    masks = [];
    selectedMaskId = null;
    mainImage.onload = () => {

      setTimeout(refreshAllMasks, 40);
      updateCategoryVisibility();
    };
  }

  // TEXT insertion UI: show modal
  if (btnInsertText) {
    btnInsertText.addEventListener('click', ()=>{
      textInputArea.value = '';
      textFontSize.value = 32;
      textCanvasWidth.value = 1200;
      textCanvasHeight.value = 400;
      if (textColorPicker) textColorPicker.value = '#000000';
      textModal.classList.remove('hidden');
      textInputArea.focus();
    });
  }
  if (btnInsertCancel) btnInsertCancel.addEventListener('click', ()=> textModal.classList.add('hidden'));

  // robust text wrapping function that preserves explicit paragraph breaks
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

  // create a text-only canvas (preserves paragraphs and wraps lines)
  async function createTextCanvasData(text, fontSize, canvasW, canvasH, textColor){
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvasW,canvasH);
    ctx.fillStyle = textColor || '#000000';
    ctx.font = `${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif`;
    ctx.textBaseline = 'top';
    const padding = 12;
    const maxTextWidth = Math.max(16, canvasW - padding * 2);
    const lines = wrapTextPreserveNewlines(ctx, text || '', maxTextWidth);
    let y = padding;
    const lineHeight = Math.round(fontSize * 1.2);
    for (let i=0;i<lines.length;i++){
      const line = lines[i];
      if (line === '') {
        y += lineHeight;
        continue;
      }
      ctx.fillText(line, padding, y);
      y += lineHeight;
      if (y > canvasH - padding) break;
    }
    return { dataUrl: canvas.toDataURL('image/png', 0.95), width: canvasW, height: canvasH };
  }

  if (btnInsertConfirm) {
    btnInsertConfirm.addEventListener('click', async ()=>{
      const text = textInputArea.value || '';
      const fontSize = parseInt(textFontSize.value,10) || 32;
      const canvasW = Math.max(200, parseInt(textCanvasWidth.value,10) || 1200);
      const canvasH = Math.max(100, parseInt(textCanvasHeight.value,10) || 400);
      const textColor = textColorPicker ? (textColorPicker.value || '#000000') : '#000000';

      const textCanvasData = await createTextCanvasData(text, fontSize, canvasW, canvasH, textColor);
      textModal.classList.add('hidden');

      const canvasData = await createCanvasFromDataURL(textCanvasData.dataUrl, 1200);
      loadImage(canvasData.dataUrl);
      currentProject = { id: uid('proj'), name: 'text-image', imageDataUrl: canvasData.dataUrl, imageBaseWidth: canvasData.width, imageBaseHeight: canvasData.height, masks: [], categories: [], createdAt: Date.now() };
      masks = [];
      selectedMaskId = null;
      clearTextBox();
      await waitForImageLayout(mainImage, 300);
      // new text-image is unsaved
      markDirty(true);
      updateCategoryVisibility();
    });
  }

  function waitForImageLayout(imgEl, timeout=500){
    return new Promise((res) => {
      const start = Date.now();
      function check(){
        const r = imgEl.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) return res();
        if (Date.now() - start > timeout) return res();
        setTimeout(check, 40);
      }
      check();
    });
  }

  function clearTextBox(){
    if (textBox && textBox.el) {
      textBox.el.remove();
      textBox = null;
    }
  }

  async function composeImageIfNeeded(){
    if (!mainImage.src) return null;
    if (!textBox) return null;
    return null;
  }

  if (btnSave) {
    btnSave.addEventListener('click', async ()=>{
      try {
        if (!mainImage.src) { alert('保存する画像がありません'); return; }

        masks.forEach(m => {
          const wrapperRect = imageArea.getBoundingClientRect();
          const imgRect = mainImage.getBoundingClientRect();
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
        let baseW = undefined, baseH = undefined;
        const composed = await composeImageIfNeeded();
        if (composed) {
          finalImageDataUrl = composed.dataUrl;
          baseW = composed.width;
          baseH = composed.height;
        } else {
          baseW = mainImage.naturalWidth || undefined;
          baseH = mainImage.naturalHeight || undefined;
        }

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

        // Prompt for name; if user cancels (null) => abort save
        let name;
        if (currentProject && currentProject.name) {
          const ans = prompt('プロジェクト名を入力してください', currentProject.name);
          if (ans === null) {
            return;
          }
          name = (ans.trim() === '') ? currentProject.name : ans;
        } else {
          const ans = prompt('プロジェクト名を入力してください');
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
          review: normalizeReviewForSave(currentProject.review, createdAt)
        };

        const savedPayload = await persistProjectWithFallback(payload);
        if (!savedPayload) {
          alert('保存に失敗しました。端末の保存容量が不足している可能性があります。');
          return;
        }

        refreshProjectSelect();
        // update currentProject to saved payload and clear dirty flag
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
    btnLoad.addEventListener('click', ()=>{
      const id = projectSelect.value;
      if (!id) { alert('読み込むプロジェクトを選んでください'); return; }
      const all = loadAllProjects();
      const p = all.find(x=>x.id===id);
      if (!p) { alert('プロジェクトが見つかりません'); return; }
      currentProject = JSON.parse(JSON.stringify(p));
      refreshCurrentProjectReviewDefaults();
      clearTextBox();
      masks.forEach(m=> m.el && m.el.remove());
      masks = [];
      mainImage.src = currentProject.imageDataUrl;
      mainImage.onload = ()=>{
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
            const allProjects = loadAllProjects();
            const idx = allProjects.findIndex(pp => pp.id === currentProject.id);
            if (idx >= 0) {
              allProjects[idx].masks = currentProject.masks;
              saveAllProjects(allProjects);
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
        // loaded saved project => clear dirty flag
        clearDirty();
      };
    });
  }

  if (btnDeleteProject) {
    btnDeleteProject.addEventListener('click', ()=>{
      const id = projectSelect.value;
      if (!id) { alert('選択してください'); return; }
      if (!confirm('本当に削除しますか？')) return;
      const all = loadAllProjects().filter(p=>p.id!==id);
      saveAllProjects(all);
      refreshProjectSelect();
      alert('削除しました');
      updateCategoryVisibility();
    });
  }

  // --- UPDATED: btnBack handler checks isDirty and asks confirm when unsaved ---
  if (btnBack) {
    btnBack.addEventListener('click', (ev) => {
      // Only warn when there are unsaved changes (either never saved or saved then modified)
      if (isDirty) {
        const ok = confirm('プロジェクトが保存されていません。本当に戻りますか？');
        if (!ok) {
          // cancel navigation
          return;
        }
      }
      location.href = 'index.html';
    });
  }

  window.addEventListener('resize', refreshAllMasks);
  mainImage.addEventListener('load', refreshAllMasks);

  function refreshProjectSelect(){
    const all = loadAllProjects();
    if (!projectSelect) return;
    projectSelect.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- 保存プロジェクト --';
    projectSelect.appendChild(emptyOpt);
    all.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name || '無題'} (${new Date(p.createdAt).toLocaleString()})`;
      projectSelect.appendChild(opt);
    });
  }

  if (btnNewCategory) {
    btnNewCategory.addEventListener('click', ()=>{
      const name = prompt('カテゴリ名を入力してください（例: 英語,）');
      if (!name) return;
      const cats = loadAllCategories();
      if (cats.includes(name)) {
        alert('同名のカテゴリが既に存在します');
        return;
      }
      cats.push(name);
      saveAllCategories(cats);
      refreshCategoryOptions();
      updateCategoryVisibility();
      markDirty(true); // adding category affects project selection UI -> consider unsaved
    });
  }

  // NOTE: btnDeleteCategory removed from UI; function kept for backward compatibility but not wired
  // if (btnDeleteCategory) { btnDeleteCategory.addEventListener('click', ()=> { deleteCategoryBySelection(); }); }

  // categoryList already wires checkbox change to mark dirty in refreshCategoryOptions
  // (no additional listener needed here)

  refreshProjectSelect();
  refreshCategoryOptions();
  updateCategoryVisibility();
})();