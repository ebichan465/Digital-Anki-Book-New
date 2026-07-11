(() => {
  const STORAGE_KEY = 'digital-anki-projects-v1';
  const CATS_KEY = 'digital-anki-categories-v1';
  const DEFAULT_CAT = '未分類';

  const projectsList = document.getElementById('projectsList');
  const btnBackHome = document.getElementById('btnBackHome');
  const sortSelect = document.getElementById('sortSelect');
  const displayFilterSelect = document.getElementById('displayFilterSelect');
  const btnToggleReviewView = document.getElementById('btnToggleReviewView');
  const reviewSummary = document.getElementById('reviewSummary');

  function loadAllProjects(){ 
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw).projects || []; } catch(e){ return []; }
  }
  function saveAllProjects(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify({projects: arr})); }

  function loadAllCategories(){
    const raw = localStorage.getItem(CATS_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw).categories || []; } catch(e){ return []; }
  }
  function saveAllCategories(arr){ localStorage.setItem(CATS_KEY, JSON.stringify({categories: arr})); }

  const REVIEW_INTERVAL_DAYS = [1, 7, 30, 90];
  const DAY_MS = 24 * 60 * 60 * 1000;
  let reviewViewActive = false;

  function buildReviewState(createdAt){
    const base = Number(createdAt) || Date.now();
    return {
      stage: 0,
      nextReviewAt: base + REVIEW_INTERVAL_DAYS[0] * DAY_MS,
      completed: false
    };
  }

  function normalizeReviewState(project){
    const createdAt = Number(project && project.createdAt) || Date.now();
    const existing = project && project.review && typeof project.review === 'object' ? project.review : null;
    if (!existing) {
      project.review = buildReviewState(createdAt);
      return true;
    }

    const stageRaw = Number(existing.stage);
    const stage = Number.isFinite(stageRaw) ? Math.max(0, Math.min(4, Math.floor(stageRaw))) : 0;
    const completed = !!existing.completed || stage >= REVIEW_INTERVAL_DAYS.length;
    const stepIndex = Math.min(stage, REVIEW_INTERVAL_DAYS.length - 1);
    const nextReviewAt = Number.isFinite(Number(existing.nextReviewAt))
      ? Number(existing.nextReviewAt)
      : (completed ? null : createdAt + REVIEW_INTERVAL_DAYS[stepIndex] * DAY_MS);

    const normalized = {
      stage: completed ? REVIEW_INTERVAL_DAYS.length : stage,
      nextReviewAt: completed ? null : nextReviewAt,
      completed
    };

    const prev = JSON.stringify(existing);
    const next = JSON.stringify(normalized);
    project.review = normalized;
    return prev !== next;
  }

  function normalizeAllReviews(projects){
    let changed = false;
    projects.forEach(p => {
      if (normalizeReviewState(p)) changed = true;
    });
    return changed;
  }

  function isReviewDue(project, now = Date.now()){
    if (!project) return false;
    if (!project.review || typeof project.review !== 'object') normalizeReviewState(project);
    const review = project.review;
    return !!review && !review.completed && Number.isFinite(Number(review.nextReviewAt)) && Number(review.nextReviewAt) <= now;
  }

  function countDueProjects(projects){
    const now = Date.now();
    return projects.filter(p => isReviewDue(p, now)).length;
  }

  function advanceReview(project){
    if (!project) return;
    if (!project.review || typeof project.review !== 'object') normalizeReviewState(project);
    const review = project.review || buildReviewState(project.createdAt);
    const currentStage = Number.isFinite(Number(review.stage)) ? Math.max(0, Math.floor(Number(review.stage))) : 0;
    const nextStage = currentStage + 1;
    if (nextStage >= REVIEW_INTERVAL_DAYS.length) {
      project.review = {
        stage: REVIEW_INTERVAL_DAYS.length,
        nextReviewAt: null,
        completed: true
      };
      return;
    }
    project.review = {
      stage: nextStage,
      nextReviewAt: Date.now() + REVIEW_INTERVAL_DAYS[nextStage] * DAY_MS,
      completed: false
    };
  }

  function getReviewLabel(project){
    if (!project) return '';
    const review = project.review && typeof project.review === 'object' ? project.review : buildReviewState(project.createdAt);
    if (review.completed) return '完了';
    const stage = Number.isFinite(Number(review.stage)) ? Math.max(0, Math.floor(Number(review.stage))) : 0;
    const labels = ['1日後', '1週間後', '1ヶ月後', '3ヶ月後'];
    return labels[Math.min(stage, labels.length - 1)] || '';
  }

  function populateDisplayFilterOptions(){
    if (!displayFilterSelect) return;
    displayFilterSelect.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'すべて表示';
    displayFilterSelect.appendChild(optAll);

    const optChecked = document.createElement('option');
    optChecked.value = 'checked';
    optChecked.textContent = 'チェックがついた画像のみ';
    displayFilterSelect.appendChild(optChecked);

    const cats = loadAllCategories();
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = `cat::${cat}`;
      opt.textContent = cat;
      displayFilterSelect.appendChild(opt);
    });
  }

  function syncReviewDefaults(projects){
    const changed = normalizeAllReviews(projects);
    if (changed) saveAllProjects(projects);
    return projects;
  }

  function waitForImageLayout(imgEl, timeout=800){
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

  function closeAnyCategoryEditor(){
    const existing = document.querySelectorAll('.category-editor-panel');
    existing.forEach(e => e.remove());
  }

  // createCategoryEditorPanel: panel will be centered over the provided anchorElement (image wrapper),
  // and placement accounts for page scroll. Existing panels are closed before creation.
  function createCategoryEditorPanel(proj, anchorElement, onSave, onCancel){
    closeAnyCategoryEditor();

    const panel = document.createElement('div');
    panel.className = 'category-editor-panel';
    panel.style.position = 'absolute';
    panel.style.zIndex = 9999;
    panel.style.minWidth = '220px';
    panel.style.maxWidth = '420px';
    panel.style.background = '#fff';
    panel.style.border = '1px solid #ddd';
    panel.style.padding = '10px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '8px';

    const title = document.createElement('div');
    title.textContent = 'カテゴリを選択';
    title.style.fontWeight = '600';
    panel.appendChild(title);

    const listWrap = document.createElement('div');
    listWrap.style.display = 'flex';
    listWrap.style.flexDirection = 'column';
    listWrap.style.maxHeight = '240px';
    listWrap.style.overflow = 'auto';
    listWrap.style.gap = '6px';

    const cats = loadAllCategories();
    cats.forEach(cat => {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = cat;
      chk.style.margin = '0';
      if (Array.isArray(proj.categories) && proj.categories.includes(cat)) chk.checked = true;
      const span = document.createElement('span');
      span.textContent = cat;
      row.appendChild(chk);
      row.appendChild(span);
      listWrap.appendChild(row);
    });

    panel.appendChild(listWrap);

    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.gap = '8px';
    actionRow.style.justifyContent = 'flex-end';

    const btnAddNew = document.createElement('button');
    btnAddNew.textContent = '新たなカテゴリ';
    btnAddNew.className = 'secondary-btn';
    btnAddNew.style.flex = '1';
    const btnOK = document.createElement('button');
    btnOK.textContent = 'OK';
    btnOK.className = 'big-btn';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'キャンセル';
    btnCancel.className = 'secondary-btn';

    btnAddNew.addEventListener('click', ()=>{
      const name = prompt('カテゴリ名を入力してください（例: 英語）');
      if (!name) return;
      const global = loadAllCategories();
      if (!global.includes(name)) {
        global.push(name);
        saveAllCategories(global);
      }
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = name;
      chk.style.margin = '0';
      chk.checked = true;
      const span = document.createElement('span');
      span.textContent = name;
      row.appendChild(chk);
      row.appendChild(span);
      listWrap.appendChild(row);
    });

    btnOK.addEventListener('click', ()=>{
      const checked = Array.from(listWrap.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value);
      const final = checked.length ? Array.from(new Set(checked)) : [];
      onSave(final);
      panel.remove();
    });
    btnCancel.addEventListener('click', ()=>{
      onCancel && onCancel();
      panel.remove();
    });

    actionRow.appendChild(btnAddNew);
    actionRow.appendChild(btnCancel);
    actionRow.appendChild(btnOK);
    panel.appendChild(actionRow);

    document.body.appendChild(panel);

    // position panel centered over anchorElement, taking scroll into account
    const rect = anchorElement.getBoundingClientRect();
    // ensure offsets are available after append
    const pw = panel.offsetWidth || 300;
    const ph = panel.offsetHeight || 180;
    const leftPos = (rect.left + window.scrollX) + (rect.width / 2) - (pw / 2);
    const topPos = (rect.top + window.scrollY) + (rect.height / 2) - (ph / 2);
    panel.style.left = Math.max(8, leftPos) + 'px';
    panel.style.top = Math.max(8, topPos) + 'px';

    return panel;
  }

  function render(){
    let all = loadAllProjects() || [];
    const order = sortSelect && sortSelect.value ? sortSelect.value : 'new';
    if (order === 'new') {
      all.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      all.sort((a,b)=> (a.createdAt || 0) - (b.createdAt || 0));
    }

    const filterVal = displayFilterSelect ? displayFilterSelect.value : 'all';
    let filtered = all.slice();
    if (filterVal === 'checked') {
      filtered = all.filter(p => !!p.checked);
    } else if (filterVal && filterVal.startsWith('cat::')) {
      const catName = filterVal.replace('cat::','');
      filtered = all.filter(p => Array.isArray(p.categories) ? p.categories.includes(catName) : (p.categories === catName));
    }

    projectsList.innerHTML = '';
    if (!filtered.length) {
      projectsList.innerHTML = '<p>保存されたプロジェクトがありません。先に「マスクをつくる」で作成してください。</p>';
      return;
    }

    filtered.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'project-card';

      const header = document.createElement('div');
      header.className = 'project-header';
      const titleDiv = document.createElement('div');
      titleDiv.className = 'title';
      titleDiv.textContent = `${proj.name || '無題'}`;

      const catNames = Array.isArray(proj.categories) ? proj.categories.filter(c => c) : [];
      const catText = document.createElement('span');
      catText.className = 'meta';
      catText.style.marginLeft = '8px';
      catText.style.color = '#666';
      catText.style.fontSize = '0.9rem';
      catText.style.opacity = '0.85';
      catText.textContent = catNames.length ? `カテゴリ: ${catNames.join(', ')}` : '';

      const rightControls = document.createElement('div');
      rightControls.style.display = 'flex';
      rightControls.style.alignItems = 'center';
      rightControls.style.gap = '8px';

      const metaDiv = document.createElement('div');
      metaDiv.className = 'meta';
      metaDiv.style.color = '#666';
      metaDiv.style.fontSize = '0.9rem';
      metaDiv.textContent = `${new Date(proj.createdAt).toLocaleString()}`;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.title = 'チェック';
      chk.checked = !!proj.checked;
      chk.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const allProjects = loadAllProjects();
        const idx = allProjects.findIndex(p => p.id === proj.id);
        if (idx >= 0) {
          allProjects[idx].checked = chk.checked;
          saveAllProjects(allProjects);
        }
      });

      const btnHeaderDelete = document.createElement('button');
      btnHeaderDelete.innerHTML = '🗑️';
      btnHeaderDelete.className = 'delete-icon';
      btnHeaderDelete.title = '画像を削除';

      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.appendChild(titleDiv);
      leftWrap.appendChild(catText);

      header.appendChild(leftWrap);
      rightControls.appendChild(metaDiv);
      rightControls.appendChild(chk);
      rightControls.appendChild(btnHeaderDelete);
      header.appendChild(rightControls);

      card.appendChild(header);

      const content = document.createElement('div');
      content.className = 'project-content';
      content.style.minHeight = '240px';
      content.style.position = 'relative';

      const wrapper = document.createElement('div');
      wrapper.className = 'image-area';
      wrapper.style.minHeight = '240px';
      wrapper.style.position = 'relative';
      const img = document.createElement('img');
      img.src = proj.imageDataUrl;
      img.style.maxWidth = '100%';
      wrapper.appendChild(img);
      content.appendChild(wrapper);
      card.appendChild(content);

      const ctrl = document.createElement('div');
      ctrl.style.marginTop = '8px';
      ctrl.style.display = 'flex';
      ctrl.style.gap = '8px';

      const btnReset = document.createElement('button');
      btnReset.textContent = 'リセット';
      btnReset.className = 'secondary-btn';
      ctrl.appendChild(btnReset);

      const btnDelete = document.createElement('button');
      btnDelete.textContent = '画像を削除';
      btnDelete.className = 'secondary-btn';
      ctrl.appendChild(btnDelete);

      const btnRename = document.createElement('button');
      btnRename.textContent = '名前を変更';
      btnRename.className = 'secondary-btn';
      ctrl.appendChild(btnRename);

      const btnChangeCategory = document.createElement('button');
      btnChangeCategory.textContent = 'カテゴリ変更';
      btnChangeCategory.className = 'secondary-btn';
      ctrl.appendChild(btnChangeCategory);

      const btnFullscreen = document.createElement('button');
      btnFullscreen.textContent = '全画面';
      btnFullscreen.className = 'fullscreen-btn';
      ctrl.appendChild(btnFullscreen);

      content.appendChild(ctrl);

      let maskObjs = [];

      async function renderMasks() {
        maskObjs.forEach(o => o.el && o.el.remove());
        maskObjs = [];

        await waitForImageLayout(img, 600);

        requestAnimationFrame(() => {
          const rect = img.getBoundingClientRect();
          const wrapperRect = wrapper.getBoundingClientRect();
          if (!rect.width || !rect.height) return;

          let needsPersist = false;
          const allProjects = loadAllProjects();
          const projInStoreIdx = allProjects.findIndex(p => p.id === proj.id);
          const baseW_candidate = proj.imageBaseWidth || img.naturalWidth || rect.width;
          const baseH_candidate = proj.imageBaseHeight || img.naturalHeight || rect.height;

          proj.masks.forEach(mm => {
            if (!mm) return;
            if (mm.x > 1 || mm.w > 1 || mm.y > 1 || mm.h > 1) {
              const baseW = proj.imageBaseWidth || img.naturalWidth || baseW_candidate || rect.width;
              const baseH = proj.imageBaseHeight || img.naturalHeight || baseH_candidate || rect.height;
              mm.x = Math.min(1, mm.x / baseW);
              mm.y = Math.min(1, mm.y / baseH);
              mm.w = Math.min(1, mm.w / baseW);
              mm.h = Math.min(1, mm.h / baseH);
              needsPersist = true;
            }
            if (mm.visible === undefined || mm.visible === null) mm.visible = true;
          });

          if (needsPersist && projInStoreIdx >= 0) {
            allProjects[projInStoreIdx].masks = proj.masks;
            if (!allProjects[projInStoreIdx].imageBaseWidth && img.naturalWidth) allProjects[projInStoreIdx].imageBaseWidth = img.naturalWidth;
            if (!allProjects[projInStoreIdx].imageBaseHeight && img.naturalHeight) allProjects[projInStoreIdx].imageBaseHeight = img.naturalHeight;
            saveAllProjects(allProjects);
          }

          proj.masks.forEach(mm => {
            const mEl = document.createElement('div');
            mEl.className = 'mask study-mask';
            mEl.classList.add(mm.shape === 'circle' ? 'circle' : 'rect');
            const left = (mm.x * rect.width) + (rect.left - wrapperRect.left);
            const top = (mm.y * rect.height) + (rect.top - wrapperRect.top);
            mEl.style.left = left + 'px';
            mEl.style.top = top + 'px';
            mEl.style.width = (mm.w * rect.width) + 'px';
            mEl.style.height = (mm.h * rect.height) + 'px';
            const updateStudyMask = () => {
              if (mm.visible) {
                mEl.classList.remove('is-hidden');
                mEl.classList.add('is-visible');
                mEl.style.background = mm.color || '#000000';
              } else {
                mEl.classList.add('is-hidden');
                mEl.classList.remove('is-visible');
                mEl.style.background = 'transparent';
              }
            };
            updateStudyMask();
            mEl.addEventListener('click', (ev)=>{
              ev.stopPropagation();
              mm.visible = !mm.visible;
              updateStudyMask();
            });
            wrapper.appendChild(mEl);
            maskObjs.push({ el: mEl, model: mm, updateStudyMask });
          });
        });
      }

      function updateMaskPositions() {
        if (!maskObjs || !maskObjs.length) return;
        requestAnimationFrame(() => {
          const rect = img.getBoundingClientRect();
          const wrapperRect = wrapper.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          maskObjs.forEach(o => {
            const mm = o.model;
            const left = (mm.x * rect.width) + (rect.left - wrapperRect.left);
            const top = (mm.y * rect.height) + (rect.top - wrapperRect.top);
            o.el.style.left = left + 'px';
            o.el.style.top = top + 'px';
            o.el.style.width = (mm.w * rect.width) + 'px';
            o.el.style.height = (mm.h * rect.height) + 'px';
            if (typeof o.updateStudyMask === 'function') o.updateStudyMask();
          });
        });
      }

      img.addEventListener('load', ()=>{
        if (card.classList.contains('open')) {
          renderMasks();
        }
      });

      btnReset.addEventListener('click', ()=>{
        proj.masks.forEach(mm => mm.visible = true);
        if (maskObjs.length) {
          maskObjs.forEach(o => {
            o.el.style.background = o.model.color || '#000000';
            o.el.classList.remove('is-hidden');
            o.el.classList.add('is-visible');
          });
        }
      });

      btnDelete.addEventListener('click', ()=>{
        if (!confirm('本当に画像を削除しますか？')) return;
        const allProjects = loadAllProjects();
        const filtered = allProjects.filter(p => p.id !== proj.id);
        saveAllProjects(filtered);
        card.remove();
      });

      btnHeaderDelete.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!confirm('本当に画像を削除しますか？')) return;
        const allProjects = loadAllProjects();
        const filtered = allProjects.filter(p => p.id !== proj.id);
        saveAllProjects(filtered);
        card.remove();
      });

      btnRename.addEventListener('click', ()=>{
        const newName = prompt('新しい名前を入力してください', proj.name || '');
        if (newName === null) return;
        const allProjects = loadAllProjects();
        const idx = allProjects.findIndex(p=>p.id === proj.id);
        if (idx < 0) return;
        allProjects[idx].name = newName || allProjects[idx].name;
        saveAllProjects(allProjects);
        titleDiv.textContent = allProjects[idx].name;
      });

      // category change handler: show panel centered over the image wrapper
      btnChangeCategory.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeAnyCategoryEditor();
        // anchorElement: wrapper (image area) -> panel centered over this wrapper
        const panel = createCategoryEditorPanel(proj, wrapper, (finalCats)=>{
          const allProjects = loadAllProjects();
          const idx = allProjects.findIndex(p => p.id === proj.id);
          if (idx >= 0) {
            allProjects[idx].categories = finalCats;
            saveAllProjects(allProjects);
          }
          proj.categories = finalCats;
          const catNamesNow = Array.isArray(proj.categories) ? proj.categories.filter(c => c) : [];
          const catSpan = header.querySelector('.meta');
          if (catSpan) {
            catSpan.textContent = catNamesNow.length ? `カテゴリ: ${catNamesNow.join(', ')}` : '';
          }
        }, ()=>{
          // cancel - do nothing
        });
      });

      let isFullscreen = false;
      btnFullscreen.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        try {
          if (!isFullscreen) {
            if (wrapper.requestFullscreen) {
              await wrapper.requestFullscreen();
            } else if (wrapper.webkitRequestFullscreen) {
              await wrapper.webkitRequestFullscreen();
            }
            isFullscreen = true;
            btnFullscreen.textContent = '全画面終了';
          } else {
            if (document.exitFullscreen) {
              await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
              await document.webkitExitFullscreen();
            }
            isFullscreen = false;
            btnFullscreen.textContent = '全画面';
            setTimeout(updateMaskPositions, 50);
          }
        } catch(e){}
      });

      document.addEventListener('fullscreenchange', ()=>{
        if (document.fullscreenElement === wrapper) {
          isFullscreen = true;
          btnFullscreen.textContent = '全画面終了';
          setTimeout(updateMaskPositions, 60);
        } else {
          if (isFullscreen) {
            isFullscreen = false;
            btnFullscreen.textContent = '全画面';
            setTimeout(updateMaskPositions, 60);
          } else {
            btnFullscreen.textContent = '全画面';
          }
        }
      });

      window.addEventListener('resize', ()=>{
        if (card.classList.contains('open')) {
          updateMaskPositions();
        }
      });

      header.addEventListener('click', ()=>{
        closeAnyCategoryEditor();
        const isOpen = card.classList.contains('open');
        if (isOpen) {
          card.classList.remove('open');
          maskObjs.forEach(o => o.el && o.el.remove());
          maskObjs = [];
        } else {
          card.classList.add('open');
          proj.masks.forEach(mm => { if (mm.visible === undefined || mm.visible === null) mm.visible = true; });
          renderMasks();
          setTimeout(updateMaskPositions, 60);
        }
      });

      projectsList.appendChild(card);
    });
  }

  function persistMaskVisibility(projId, maskId, visible){
    // intentionally do not persist study-mode visibility to storage per spec
    const all = loadAllProjects();
    const p = all.find(x=>x.id===projId);
    if (!p) return;
    const mm = p.masks.find(m => m.id === maskId);
    if (!mm) return;
    mm.visible = visible; // update in-memory for this page (not saved)
  }

  if (btnBackHome) btnBackHome.addEventListener('click', ()=> location.href='index.html');
  if (sortSelect) sortSelect.addEventListener('change', ()=> {
    render();
  });
  if (displayFilterSelect) {
    displayFilterSelect.addEventListener('change', ()=> {
      const openCards = document.querySelectorAll('.project-card.open');
      openCards.forEach(c => c.classList.remove('open'));
      closeAnyCategoryEditor();
      render();
    });
  }
  if (btnToggleReviewView) {
    btnToggleReviewView.addEventListener('click', ()=> {
      reviewViewActive = !reviewViewActive;
      const openCards = document.querySelectorAll('.project-card.open');
      openCards.forEach(c => c.classList.remove('open'));
      closeAnyCategoryEditor();
      render();
    });
  }

  populateDisplayFilterOptions();
  render();

})();