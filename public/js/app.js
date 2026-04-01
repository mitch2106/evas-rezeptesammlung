/* ============================================
   EVAS REZEPTESAMMLUNG — App JavaScript
   ============================================ */

(function() {
  'use strict';

  // ============ STATE ============
  const state = {
    currentUser: null,
    recipes: [],
    shoppingItems: [],
    plannerWeekOffset: 0,
    plannerEntries: [],
    currentRecipe: null,
    cookingSteps: [],
    cookingIndex: 0,
    wakeLock: null,
    pickerCallback: null,
    editingRecipeId: null,
    currentTags: [],
    ocrFiles: [],
    originalPortions: null,
    currentPortions: null
  };

  // ============ API CLIENT ============
  const api = {
    async get(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async put(url, data) {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async patch(url, data) {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async del(url) {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  };

  // ============ UTILS ============
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function toast(message, type = 'success') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function showConfirm(title, message, okText = 'Löschen') {
    return new Promise((resolve) => {
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      $('#confirm-ok').textContent = okText;
      $('#confirm-dialog').style.display = 'flex';
      const cleanup = () => {
        $('#confirm-dialog').style.display = 'none';
        $('#confirm-ok').removeEventListener('click', onOk);
        $('#confirm-cancel').removeEventListener('click', onCancel);
      };
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      $('#confirm-ok').addEventListener('click', onOk);
      $('#confirm-cancel').addEventListener('click', onCancel);
    });
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Samsung/Chrome scroll bug workaround
  function forceRepaint() {
    const mc = $('#main-content');
    if (mc) {
      mc.style.transform = 'translateZ(0)';
      requestAnimationFrame(() => { mc.style.transform = ''; });
    }
  }

  let touchStartY = 0;
  let lastScrollTop = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    lastScrollTop = $('#main-content')?.scrollTop || 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const mc = $('#main-content');
    if (!mc) return;
    const touchY = e.touches[0].clientY;
    const diff = Math.abs(touchY - touchStartY);
    if (diff > 30 && mc.scrollTop === lastScrollTop) {
      forceRepaint();
    }
  }, { passive: true });

  // ============ DARK MODE ============
  function initDarkMode() {
    const saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateDarkModeIcon();
    updateThemeColor();
  }

  function toggleDarkMode() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateDarkModeIcon();
    updateThemeColor();
  }

  function updateDarkModeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('.icon-moon').style.display = isDark ? 'none' : 'block';
    $('.icon-sun').style.display = isDark ? 'block' : 'none';
  }

  function updateThemeColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('meta[name="theme-color"]').setAttribute('content', isDark ? '#1a1a1a' : '#f8f5f0');
  }

  // ============ ROUTER ============
  function navigate(hash) {
    location.hash = hash;
  }

  function getRoute() {
    const hash = location.hash || '#home';
    const parts = hash.slice(1).split('/');
    return { view: parts[0], id: parts[1] };
  }

  function handleRoute() {
    const { view, id } = getRoute();
    // Hide all views
    $$('.view').forEach(v => v.style.display = 'none');
    // Deactivate all nav items
    $$('.nav-item').forEach(n => n.classList.remove('active'));

    switch (view) {
      case 'home':
      case '':
        showView('home');
        loadRecipes();
        break;
      case 'add':
        showView('add');
        resetRecipeForm();
        break;
      case 'shopping':
        showView('shopping');
        loadShopping();
        break;
      case 'planner':
        showView('planner');
        loadPlanner();
        break;
      case 'settings':
        showView('settings');
        loadSettings();
        break;
      case 'detail':
        if (id) {
          showView('detail');
          loadRecipeDetail(id);
        }
        break;
      case 'edit':
        if (id) {
          showView('add');
          loadRecipeForEdit(id);
        }
        break;
      default:
        showView('home');
        loadRecipes();
    }
    forceRepaint();
  }

  function showView(name) {
    const el = $(`#view-${name}`);
    if (el) el.style.display = 'block';
    // Activate nav
    const navMap = { home: 'home', add: 'add', shopping: 'shopping', planner: 'planner' };
    const tab = navMap[name];
    if (tab) {
      const navItem = $(`.nav-item[data-tab="${tab}"]`);
      if (navItem) navItem.classList.add('active');
    }
    window.scrollTo(0, 0);
  }

  // ============ ONBOARDING ============
  async function checkUser() {
    const userId = getCookie('user_id');
    if (userId) {
      try {
        const user = await api.get(`/api/users/${userId}`);
        state.currentUser = user;
        showApp();
        return;
      } catch (e) {
        // User not found, show onboarding
      }
    }
    showOnboarding();
  }

  async function showOnboarding() {
    $('#app').style.display = 'none';
    $('#onboarding-overlay').style.display = 'flex';
    try {
      const users = await api.get('/api/users');
      const list = $('#onboarding-users');
      list.innerHTML = '';
      if (users.length > 0) {
        users.forEach(u => {
          const btn = document.createElement('button');
          btn.className = 'onboarding-user-btn';
          btn.innerHTML = `<span class="onboarding-user-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</span><span>${escapeHtml(u.name)}</span>`;
          btn.addEventListener('click', () => selectUser(u));
          list.appendChild(btn);
        });
      }
    } catch (e) {
      console.error('Failed to load users', e);
    }
  }

  async function createUser(name) {
    try {
      const user = await api.post('/api/users', { name });
      selectUser(user);
    } catch (e) {
      toast('Fehler beim Erstellen des Benutzers', 'error');
    }
  }

  function selectUser(user) {
    state.currentUser = user;
    setCookie('user_id', user.id);
    showApp();
  }

  function showApp() {
    $('#onboarding-overlay').style.display = 'none';
    $('#app').style.display = 'block';
    handleRoute();
  }

  // ============ RECIPES LIST ============
  async function loadRecipes() {
    if (!state.currentUser) return;
    const skeleton = $('#skeleton-loader');
    const list = $('#recipe-list');
    const empty = $('#empty-state');

    skeleton.style.display = 'grid';
    list.style.display = 'none';
    empty.style.display = 'none';

    try {
      state.recipes = await api.get(`/api/recipes?user_id=${state.currentUser.id}`);
      renderRecipes();
    } catch (e) {
      toast('Fehler beim Laden der Rezepte', 'error');
    } finally {
      skeleton.style.display = 'none';
    }
  }

  function renderRecipes() {
    const list = $('#recipe-list');
    const empty = $('#empty-state');
    const searchTerm = ($('#search-input')?.value || '').toLowerCase();
    const sortBy = $('#sort-select')?.value || 'newest';
    const activeFilter = $('.chip.active')?.dataset.filter || 'all';

    let filtered = [...state.recipes];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(r => r.title.toLowerCase().includes(searchTerm));
    }

    // Category/favorites filter
    if (activeFilter === 'favorites') {
      filtered = filtered.filter(r => r.is_favorite);
    } else if (activeFilter !== 'all') {
      filtered = filtered.filter(r => r.category === activeFilter);
    }

    // Sort
    switch (sortBy) {
      case 'newest': filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
      case 'oldest': filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
      case 'az': filtered.sort((a, b) => a.title.localeCompare(b.title, 'de')); break;
      case 'za': filtered.sort((a, b) => b.title.localeCompare(a.title, 'de')); break;
      case 'last_viewed': filtered.sort((a, b) => {
        if (!a.last_viewed && !b.last_viewed) return 0;
        if (!a.last_viewed) return 1;
        if (!b.last_viewed) return -1;
        return new Date(b.last_viewed) - new Date(a.last_viewed);
      }); break;
    }

    if (state.recipes.length === 0) {
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    if (filtered.length === 0) {
      list.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0">Keine Rezepte gefunden</p>';
      list.style.display = 'grid';
      empty.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    list.style.display = 'grid';
    list.innerHTML = filtered.map(r => {
      const tags = safeParseJSON(r.tags, []);
      const isFav = r.is_favorite ? 'is-fav' : '';
      const imageHtml = r.image
        ? `<img class="recipe-card-image" src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}" loading="lazy">`
        : `<div class="recipe-card-placeholder">🍽️</div>`;
      return `
        <div class="recipe-card" data-id="${r.id}">
          <button class="recipe-card-fav ${isFav}" data-id="${r.id}" aria-label="Favorit">
            <svg viewBox="0 0 24 24" fill="${r.is_favorite ? 'var(--danger)' : 'none'}" stroke="${r.is_favorite ? 'var(--danger)' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          ${imageHtml}
          <div class="recipe-card-body">
            <div class="recipe-card-title">${escapeHtml(r.title)}</div>
            ${r.category ? `<span class="category-badge ${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    // Card click → detail
    list.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.recipe-card-fav')) return;
        navigate(`#detail/${card.dataset.id}`);
      });
    });

    // Fav button click
    list.querySelectorAll('.recipe-card-fav').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api.patch(`/api/recipes/${btn.dataset.id}/favorite`);
          await loadRecipes();
        } catch (e) {
          toast('Fehler', 'error');
        }
      });
    });
  }

  function safeParseJSON(str, fallback) {
    if (Array.isArray(str)) return str;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  // ============ RECIPE DETAIL ============
  async function loadRecipeDetail(id) {
    try {
      const recipe = await api.get(`/api/recipes/${id}`);
      state.currentRecipe = recipe;
      state.originalPortions = recipe.portions || null;
      state.currentPortions = recipe.portions || null;
      renderRecipeDetail(recipe);
    } catch (e) {
      toast('Rezept nicht gefunden', 'error');
      navigate('#home');
    }
  }

  function renderRecipeDetail(r) {
    const tags = safeParseJSON(r.tags, []);
    const isFav = r.is_favorite;

    // Update fav button
    const favBtn = $('#detail-fav');
    favBtn.querySelector('.icon-heart').setAttribute('fill', isFav ? 'var(--danger)' : 'none');
    favBtn.querySelector('.icon-heart').setAttribute('stroke', isFav ? 'var(--danger)' : 'currentColor');

    let html = '';

    if (r.image) {
      html += `<img class="detail-image" src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}">`;
    }

    html += `<h2 class="detail-title">${escapeHtml(r.title)}</h2>`;
    html += '<div class="detail-meta">';
    if (r.category) html += `<span class="category-badge ${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>`;
    html += '</div>';

    if (tags.length > 0) {
      html += '<div class="detail-tags">';
      tags.forEach(t => { html += `<span class="tag-chip">${escapeHtml(t)}</span>`; });
      html += '</div>';
    }

    // Portions stepper
    if (r.portions) {
      html += `
        <div class="portions-stepper">
          <button id="portions-minus">−</button>
          <span id="portions-display">${r.portions} Portionen</span>
          <button id="portions-plus">+</button>
        </div>`;
    }

    // Ingredients
    if (r.ingredients && r.ingredients.trim()) {
      const lines = r.ingredients.split('\n').filter(l => l.trim());
      html += '<div class="detail-section"><h3>Zutaten</h3><ul class="detail-ingredients-list">';
      lines.forEach(l => { html += `<li class="ingredient-line">${escapeHtml(l.trim())}</li>`; });
      html += '</ul></div>';
    }

    // Preparation
    if (r.preparation && r.preparation.trim()) {
      html += `<div class="detail-section"><h3>Zubereitung</h3><div class="detail-preparation">${escapeHtml(r.preparation.trim())}</div></div>`;
    }

    // Notes
    html += `
      <div class="detail-notes">
        <h3 style="font-size:1rem;margin-bottom:10px;color:var(--accent)">Notizen</h3>
        <textarea id="detail-notes-input" rows="3" placeholder="Eigene Anmerkungen...">${escapeHtml(r.notes || '')}</textarea>
        <button id="detail-notes-save" class="btn btn-secondary btn-sm">Speichern</button>
      </div>`;

    // Actions
    html += '<div class="detail-actions">';
    html += '<button id="detail-add-shopping" class="btn btn-secondary">Zur Einkaufsliste hinzufügen</button>';
    if (r.source_url) {
      html += `<a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener" class="btn btn-secondary">Originalrezept ansehen</a>`;
    }
    if (r.preparation && r.preparation.trim()) {
      html += '<button id="detail-cook" class="btn btn-primary">Kochen</button>';
    }
    html += `<button id="detail-edit" class="btn btn-secondary">Bearbeiten</button>`;
    html += `<button id="detail-delete" class="btn btn-danger">Löschen</button>`;
    html += '</div>';

    $('#detail-content').innerHTML = html;

    // Event listeners
    if (r.portions) {
      $('#portions-minus')?.addEventListener('click', () => adjustPortions(-1));
      $('#portions-plus')?.addEventListener('click', () => adjustPortions(1));
    }

    $('#detail-notes-input')?.addEventListener('input', () => {
      $('#detail-notes-save').classList.add('visible');
    });

    $('#detail-notes-save')?.addEventListener('click', async () => {
      try {
        await api.put(`/api/recipes/${r.id}`, { notes: $('#detail-notes-input').value });
        toast('Notizen gespeichert');
        $('#detail-notes-save').classList.remove('visible');
      } catch (e) {
        toast('Fehler beim Speichern', 'error');
      }
    });

    $('#detail-add-shopping')?.addEventListener('click', () => addIngredientsToShopping(r));
    $('#detail-cook')?.addEventListener('click', () => startCookingMode(r));
    $('#detail-edit')?.addEventListener('click', () => navigate(`#edit/${r.id}`));
    $('#detail-delete')?.addEventListener('click', async () => {
      const ok = await showConfirm('Rezept löschen', `Möchtest du "${r.title}" wirklich löschen?`);
      if (ok) {
        try {
          await api.del(`/api/recipes/${r.id}`);
          toast('Rezept gelöscht');
          navigate('#home');
        } catch (e) {
          toast('Fehler beim Löschen', 'error');
        }
      }
    });
  }

  function adjustPortions(delta) {
    const r = state.currentRecipe;
    if (!r || !state.originalPortions) return;
    state.currentPortions = Math.max(1, (state.currentPortions || state.originalPortions) + delta);
    const factor = state.currentPortions / state.originalPortions;

    $('#portions-display').textContent = `${state.currentPortions} Portionen`;

    // Scale ingredient amounts
    const origLines = r.ingredients.split('\n').filter(l => l.trim());
    const ingredientEls = $$('.ingredient-line');
    origLines.forEach((line, i) => {
      if (ingredientEls[i]) {
        ingredientEls[i].textContent = scaleIngredientLine(line.trim(), factor);
      }
    });
  }

  function scaleIngredientLine(line, factor) {
    // Match numbers and fractions at the beginning or embedded
    return line.replace(/(\d+[\.,]?\d*)\s*\/\s*(\d+[\.,]?\d*)/g, (match, num, den) => {
      const val = parseFloat(num.replace(',', '.')) / parseFloat(den.replace(',', '.'));
      return formatScaledNumber(val * factor);
    }).replace(/(?<!\/)(\d+[\.,]\d+)(?![\d\/])/g, (match) => {
      const val = parseFloat(match.replace(',', '.'));
      return formatScaledNumber(val * factor);
    }).replace(/(?<![\/\.,\d])(\d+)(?![\/\.,\d])/g, (match) => {
      const val = parseInt(match);
      return formatScaledNumber(val * factor);
    });
  }

  function formatScaledNumber(n) {
    if (n === Math.floor(n)) return String(Math.round(n));
    return n.toFixed(1).replace('.', ',').replace(/,0$/, '');
  }

  // ============ ADD INGREDIENTS TO SHOPPING ============
  async function addIngredientsToShopping(recipe) {
    if (!recipe.ingredients || !recipe.ingredients.trim()) {
      toast('Keine Zutaten vorhanden', 'error');
      return;
    }
    const lines = recipe.ingredients.split('\n').filter(l => l.trim());
    const items = lines.map(l => ({
      text: l.trim(),
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      category: categorizeIngredient(l.trim())
    }));
    try {
      await api.post('/api/shopping/bulk', { user_id: state.currentUser.id, items });
      toast(`${items.length} Zutaten zur Einkaufsliste hinzugefügt`);
    } catch (e) {
      toast('Fehler', 'error');
    }
  }

  // ============ COOKING MODE ============
  function startCookingMode(recipe) {
    if (!recipe.preparation) return;

    // Split into steps: double newline or numbered steps
    let steps = recipe.preparation.split(/\n\s*\n/).filter(s => s.trim());
    if (steps.length === 1) {
      // Try splitting by single newline if only one block
      steps = recipe.preparation.split('\n').filter(s => s.trim());
    }
    // Remove step numbers if present
    steps = steps.map(s => s.replace(/^\d+[\.\)]\s*/, '').trim());

    state.cookingSteps = steps;
    state.cookingIndex = 0;

    renderCookingStep();
    $('#cooking-mode').style.display = 'flex';

    // Ingredients panel
    const ingList = $('#cooking-ingredients-list');
    const lines = (recipe.ingredients || '').split('\n').filter(l => l.trim());
    ingList.innerHTML = lines.map(l => `<li>${escapeHtml(l.trim())}</li>`).join('');

    // Wake Lock
    requestWakeLock();

    // Swipe support
    setupCookingSwipe();
  }

  function renderCookingStep() {
    const { cookingSteps, cookingIndex } = state;
    $('#cooking-step-content').textContent = cookingSteps[cookingIndex];
    $('#cooking-step-counter').textContent = `Schritt ${cookingIndex + 1} von ${cookingSteps.length}`;

    // Nav buttons
    $('#cooking-prev').style.visibility = cookingIndex > 0 ? 'visible' : 'hidden';
    if (cookingIndex === cookingSteps.length - 1) {
      $('#cooking-next').innerHTML = '✓ Fertig';
    } else {
      $('#cooking-next').textContent = 'Weiter';
    }

    // Dots
    const dots = $('#cooking-dots');
    dots.innerHTML = cookingSteps.map((_, i) =>
      `<div class="cooking-dot ${i === cookingIndex ? 'active' : ''}"></div>`
    ).join('');
  }

  function setupCookingSwipe() {
    const el = $('#cooking-step-content');
    let startX = 0;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 60) {
        if (diff < 0) cookingNext();
        else cookingPrev();
      }
    });
  }

  function cookingNext() {
    if (state.cookingIndex < state.cookingSteps.length - 1) {
      state.cookingIndex++;
      renderCookingStep();
    } else {
      closeCookingMode();
    }
  }

  function cookingPrev() {
    if (state.cookingIndex > 0) {
      state.cookingIndex--;
      renderCookingStep();
    }
  }

  function closeCookingMode() {
    $('#cooking-mode').style.display = 'none';
    $('#cooking-ingredients-panel').style.display = 'none';
    $('#cooking-ingredients-panel').classList.remove('open');
    releaseWakeLock();
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* not supported or denied */ }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release();
      state.wakeLock = null;
    }
  }

  // ============ RECIPE FORM ============
  function resetRecipeForm() {
    state.editingRecipeId = null;
    state.currentTags = [];
    state.ocrFiles = [];
    $('#add-view-title').textContent = 'Neues Rezept';
    $('#recipe-edit-id').value = '';
    $('#recipe-form').reset();
    $('#image-preview-container').style.display = 'none';
    $('#image-upload-placeholder').style.display = 'flex';
    $('#image-preview').src = '';
    renderTags();
    // Reset OCR
    $('#ocr-section').style.display = 'none';
    $('#ocr-previews').innerHTML = '';
    $('#ocr-start-btn').style.display = 'none';
    $('#ocr-info-banner').style.display = 'none';
    // Reset mode toggle
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    $('.mode-btn[data-mode="manual"]').classList.add('active');
  }

  async function loadRecipeForEdit(id) {
    try {
      const r = await api.get(`/api/recipes/${id}`);
      state.editingRecipeId = id;
      state.currentTags = safeParseJSON(r.tags, []);
      $('#add-view-title').textContent = 'Rezept bearbeiten';
      $('#recipe-edit-id').value = id;
      $('#recipe-title').value = r.title;
      $('#recipe-category').value = r.category || '';
      $('#recipe-portions').value = r.portions || '';
      $('#recipe-source').value = r.source_url || '';
      $('#recipe-ingredients').value = r.ingredients || '';
      $('#recipe-preparation').value = r.preparation || '';
      if (r.image) {
        $('#image-preview').src = r.image;
        $('#image-preview-container').style.display = 'block';
        $('#image-upload-placeholder').style.display = 'none';
      }
      renderTags();
    } catch (e) {
      toast('Rezept nicht gefunden', 'error');
      navigate('#home');
    }
  }

  async function saveRecipe(e) {
    e.preventDefault();
    const id = $('#recipe-edit-id').value;
    const data = {
      user_id: state.currentUser.id,
      title: $('#recipe-title').value.trim(),
      category: $('#recipe-category').value,
      portions: parseInt($('#recipe-portions').value) || null,
      tags: state.currentTags,
      source_url: $('#recipe-source').value.trim(),
      ingredients: $('#recipe-ingredients').value,
      preparation: $('#recipe-preparation').value,
      image: $('#image-preview').src && $('#image-preview-container').style.display !== 'none' ? $('#image-preview').src : '',
      notes: ''
    };

    if (!data.title) {
      toast('Bitte gib einen Titel ein', 'error');
      return;
    }

    try {
      if (id) {
        await api.put(`/api/recipes/${id}`, data);
        toast('Rezept aktualisiert');
        navigate(`#detail/${id}`);
      } else {
        const recipe = await api.post('/api/recipes', data);
        toast('Rezept gespeichert');
        navigate(`#detail/${recipe.id}`);
      }
    } catch (e) {
      toast('Fehler beim Speichern', 'error');
    }
  }

  // Image upload
  function setupImageUpload() {
    const area = $('#image-upload-area');
    const input = $('#recipe-image-input');

    area.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        $('#image-preview').src = ev.target.result;
        $('#image-preview-container').style.display = 'block';
        $('#image-upload-placeholder').style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    $('#image-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#image-preview').src = '';
      $('#image-preview-container').style.display = 'none';
      $('#image-upload-placeholder').style.display = 'flex';
      input.value = '';
    });
  }

  // Tags
  function renderTags() {
    const container = $('#tags-chips');
    container.innerHTML = state.currentTags.map(t =>
      `<span class="tag-chip">${escapeHtml(t)}<button type="button" data-tag="${escapeHtml(t)}">&times;</button></span>`
    ).join('');

    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentTags = state.currentTags.filter(t => t !== btn.dataset.tag);
        renderTags();
      });
    });
  }

  function addTag(tag) {
    tag = tag.trim();
    if (tag && !state.currentTags.includes(tag)) {
      state.currentTags.push(tag);
      renderTags();
    }
  }

  // ============ OCR ============
  function setupOCR() {
    const uploadArea = $('#ocr-upload-area');
    const fileInput = $('#ocr-file-input');

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      state.ocrFiles = Array.from(e.target.files);
      renderOCRPreviews();
    });

    $('#ocr-start-btn').addEventListener('click', performOCR);
  }

  function renderOCRPreviews() {
    const container = $('#ocr-previews');
    container.innerHTML = '';
    state.ocrFiles.forEach(file => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      container.appendChild(img);
    });
    $('#ocr-start-btn').style.display = state.ocrFiles.length > 0 ? 'inline-flex' : 'none';
  }

  async function performOCR() {
    if (state.ocrFiles.length === 0) return;
    const loading = $('#ocr-loading');
    const loadingText = $('#ocr-loading-text');
    loading.style.display = 'flex';
    loadingText.textContent = 'Rezept wird erkannt...';

    try {
      const images = [];
      for (const file of state.ocrFiles) {
        images.push(await fileToBase64(file));
      }

      const res = await fetch('/api/scan-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erkennung fehlgeschlagen');
      }

      const recipe = await res.json();

      if (recipe.title) $('#recipe-title').value = recipe.title;
      if (recipe.ingredients) $('#recipe-ingredients').value = recipe.ingredients;
      if (recipe.preparation) $('#recipe-preparation').value = recipe.preparation;
      if (recipe.portions) $('#recipe-portions').value = recipe.portions;
      if (recipe.category) {
        const select = $('#recipe-category');
        for (const opt of select.options) {
          if (opt.value.toLowerCase() === recipe.category.toLowerCase()) {
            select.value = opt.value;
            break;
          }
        }
      }

      $('#ocr-info-banner').style.display = 'block';
      toast('Rezept erkannt!', 'success');
    } catch (e) {
      toast('Fehler: ' + e.message, 'error');
    }

    loading.style.display = 'none';
  }

  async function fileToBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function deduplicateTexts(texts) {
    if (texts.length <= 1) return texts.join('\n');
    let merged = texts[0];
    for (let i = 1; i < texts.length; i++) {
      const lines1 = merged.split('\n');
      const lines2 = texts[i].split('\n');
      let overlapStart = -1;

      // Find overlap: check last N lines of text1 against first N lines of text2
      for (let overlap = Math.min(10, lines2.length); overlap >= 2; overlap--) {
        const tail = lines1.slice(-overlap).map(l => l.trim().toLowerCase());
        const head = lines2.slice(0, overlap).map(l => l.trim().toLowerCase());
        let matchCount = 0;
        for (let j = 0; j < overlap; j++) {
          if (fuzzyMatch(tail[j], head[j])) matchCount++;
        }
        if (matchCount >= overlap * 0.6) {
          overlapStart = overlap;
          break;
        }
      }

      if (overlapStart > 0) {
        merged += '\n' + lines2.slice(overlapStart).join('\n');
      } else {
        merged += '\n' + texts[i];
      }
    }
    return merged;
  }

  function fuzzyMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    // Simple similarity: check if >70% chars match
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.includes(shorter)) return true;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches++;
    }
    return matches / longer.length > 0.7;
  }

  // ============ INSTAGRAM / TEXT PARSER ============
  function parseRecipeText(text) {
    // Clean social media artifacts
    let cleaned = text
      .replace(/@[\w.]+/g, '')
      .replace(/#\w+/g, '')
      .replace(/Gefällt \d+[\.,]?\d* Mal/gi, '')
      .replace(/\d+ Kommentare? ansehen/gi, '')
      .replace(/Kommentare ansehen/gi, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\d{1,2}\.\s?(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/gi, '')
      .replace(/\d{1,2}:\d{2}/g, '')
      .replace(/^\s*\n/gm, '\n')
      .trim();

    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);

    // Detect sections
    const ingredientKeywords = /^(zutaten|zutat|was du brauchst|du brauchst|ingredients)/i;
    const prepKeywords = /^(zubereitung|so geht'?s|anleitung|schritte|steps|preparation|und so geht'?s)/i;

    let title = '';
    let ingredients = [];
    let preparation = [];
    let section = 'title'; // title, ingredients, preparation

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (ingredientKeywords.test(line)) {
        section = 'ingredients';
        continue;
      }
      if (prepKeywords.test(line)) {
        section = 'preparation';
        continue;
      }

      if (section === 'title' && !title && line.length > 2 && line.length < 100) {
        title = line;
        continue;
      }

      if (section === 'ingredients') {
        // Merge fragmented lines
        if (ingredients.length > 0 && /^[a-zäöü]/.test(line)) {
          ingredients[ingredients.length - 1] += ' ' + line;
        } else {
          ingredients.push(line);
        }
      } else if (section === 'preparation') {
        if (preparation.length > 0 && /^[a-zäöü]/.test(line)) {
          preparation[preparation.length - 1] += ' ' + line;
        } else {
          preparation.push(line.replace(/^\d+[\.\)]\s*/, ''));
        }
      }
    }

    if (title) $('#recipe-title').value = title;
    if (ingredients.length) $('#recipe-ingredients').value = ingredients.join('\n');
    if (preparation.length) $('#recipe-preparation').value = preparation.join('\n\n');
  }

  // ============ SHOPPING LIST ============
  const CATEGORY_MAP = {
    'Obst & Gemüse 🥬': ['apfel', 'äpfel', 'birne', 'banane', 'orange', 'zitrone', 'limette', 'beeren', 'erdbeere', 'himbeere', 'blaubeere', 'heidelbeere', 'traube', 'kirsche', 'mango', 'ananas', 'melone', 'pfirsich', 'pflaume', 'kiwi', 'avocado', 'tomate', 'tomaten', 'gurke', 'paprika', 'zwiebel', 'knoblauch', 'kartoffel', 'kartoffeln', 'karotte', 'möhre', 'salat', 'spinat', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'lauch', 'porree', 'sellerie', 'fenchel', 'kohlrabi', 'radieschen', 'rettich', 'rote bete', 'kürbis', 'süßkartoffel', 'mais', 'erbsen', 'bohnen', 'champignon', 'pilz', 'pilze', 'frühlingszwiebel', 'rucola', 'petersilie', 'basilikum', 'schnittlauch', 'dill', 'minze', 'koriander', 'rosmarin', 'thymian', 'salbei', 'ingwer', 'chili', 'peperoni', 'schalotte', 'gemüse', 'obst', 'kräuter', 'blattspinat', 'mangold', 'pak choi', 'chinakohl', 'weißkohl', 'rotkohl', 'wirsing', 'grünkohl', 'spargel', 'artischocke'],
    'Fleisch & Wurst 🥩': ['fleisch', 'hähnchen', 'huhn', 'hühnchen', 'chicken', 'pute', 'truthahn', 'rind', 'rindfleisch', 'schwein', 'schweinefleisch', 'hackfleisch', 'hack', 'mett', 'steak', 'filet', 'schnitzel', 'bratwurst', 'wurst', 'würstchen', 'salami', 'schinken', 'speck', 'bacon', 'lamm', 'wild', 'ente', 'gans', 'kaninchen', 'gulasch', 'braten', 'kotelett', 'rippchen', 'leberkäse', 'aufschnitt', 'mortadella', 'leberwurst', 'wiener', 'bockwurst', 'gyros', 'döner', 'hähnchenbrustfilet', 'hähnchenbrust', 'putenbrust'],
    'Fisch & Meeresfrüchte 🐟': ['fisch', 'lachs', 'thunfisch', 'forelle', 'kabeljau', 'dorsch', 'hering', 'makrele', 'sardine', 'garnele', 'garnelen', 'shrimp', 'shrimps', 'krabbe', 'muschel', 'tintenfisch', 'calamari', 'pangasius', 'seelachs', 'scholle', 'zander', 'barsch', 'sardelle', 'anchovis', 'meeresfrüchte'],
    'Milchprodukte & Eier 🧀': ['milch', 'butter', 'sahne', 'rahm', 'schmand', 'sauerrahm', 'crème fraîche', 'creme fraiche', 'joghurt', 'yoghurt', 'quark', 'käse', 'gouda', 'emmentaler', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'frischkäse', 'mascarpone', 'ricotta', 'camembert', 'brie', 'ei', 'eier', 'eigelb', 'eiweiß', 'buttermilch', 'kefir', 'schlagsahne', 'kondensmilch', 'skyr', 'hüttenkäse', 'ziegenkäse', 'schafskäse', 'halloumi', 'burrata', 'schmandkäse', 'kaffeesahne', 'sprühsahne'],
    'Brot & Backwaren 🍞': ['brot', 'brötchen', 'semmel', 'toast', 'baguette', 'ciabatta', 'croissant', 'brezel', 'knäckebrot', 'zwieback', 'tortilla', 'wrap', 'fladenbrot', 'naan', 'pita', 'vollkornbrot', 'pumpernickel', 'toastbrot', 'aufbackbrötchen', 'laugenstange'],
    'Nudeln, Reis & Getreide 🍝': ['nudel', 'nudeln', 'pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'tagliatelle', 'lasagne', 'lasagneplatten', 'makkaroni', 'rigatoni', 'tortellini', 'gnocchi', 'reis', 'basmati', 'jasmin', 'risotto', 'couscous', 'bulgur', 'quinoa', 'polenta', 'hirse', 'grieß', 'haferflocken', 'müsli', 'cornflakes', 'linsen', 'kichererbsen', 'kidneybohnen', 'weiße bohnen', 'graupen', 'amaranth', 'buchweizen', 'dinkel', 'weizen', 'roggen'],
    'Konserven & Fertigprodukte 🥫': ['konserve', 'dose', 'dosentomaten', 'passierte tomaten', 'tomatenmark', 'kokosmilch', 'kokosnussmilch', 'brühe', 'fond', 'pesto', 'ketchup', 'mayonnaise', 'mayo', 'senf', 'sojasoße', 'sojasauce', 'worcestersauce', 'tabasco', 'sambal', 'currypaste', 'tomatensoße', 'tomatensauce', 'ajvar', 'harissa', 'tahini', 'hummus', 'eingelegte', 'oliven', 'kapern', 'cornichons', 'gewürzgurke', 'sauerkraut', 'mais dose', 'erbsen dose', 'bohnen dose', 'thunfisch dose'],
    'Gewürze & Würzmittel 🧂': ['salz', 'pfeffer', 'zucker', 'paprikapulver', 'curry', 'currypulver', 'kurkuma', 'kreuzkümmel', 'kümmel', 'zimt', 'muskat', 'muskatnuss', 'nelke', 'anis', 'sternanis', 'lorbeer', 'oregano', 'basilikum getrocknet', 'thymian getrocknet', 'majoran', 'cayenne', 'chili pulver', 'chiliflocken', 'knoblauchpulver', 'zwiebelpulver', 'gewürz', 'bouillon', 'gemüsebrühe', 'hühnerbrühe', 'brühwürfel', 'vanille', 'vanillezucker', 'backpulver', 'natron', 'hefe', 'trockenhefe', 'gelatine', 'agar', 'essig', 'balsamico', 'apfelessig', 'weißweinessig', 'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'sesamöl', 'kokosöl', 'honig', 'ahornsirup', 'agavendicksaft', 'worcestershire'],
    'Nüsse & Trockenfrüchte 🥜': ['nüsse', 'nuss', 'mandel', 'mandeln', 'walnuss', 'walnüsse', 'haselnuss', 'haselnüsse', 'cashew', 'erdnuss', 'erdnüsse', 'pistazie', 'pistazien', 'pinienkerne', 'pecannuss', 'macadamia', 'paranuss', 'rosine', 'rosinen', 'cranberry', 'cranberries', 'dattel', 'datteln', 'feige', 'feigen', 'aprikose getrocknet', 'kokosraspel', 'kokosflocken', 'studentenfutter', 'nussmischung', 'erdnussbutter', 'mandelmus', 'tahini', 'sesam', 'sonnenblumenkerne', 'kürbiskerne', 'leinsamen', 'chiasamen', 'chia'],
    'Getränke & Alkohol 🍷': ['wasser', 'mineralwasser', 'saft', 'orangensaft', 'apfelsaft', 'wein', 'weißwein', 'rotwein', 'bier', 'sekt', 'prosecco', 'champagner', 'likör', 'rum', 'whisky', 'vodka', 'gin', 'amaretto', 'baileys', 'tee', 'kaffee', 'kakao', 'cola', 'limonade', 'tonic', 'milch pflanzlich', 'hafermilch', 'sojamilch', 'mandelmilch', 'kokoswasser'],
    'Süßes & Backen 🍫': ['schokolade', 'kuvertüre', 'kakao', 'kakaopulver', 'puderzucker', 'brauner zucker', 'rohrzucker', 'marzipan', 'fondant', 'streusel', 'zuckerguss', 'mehl', 'weizenmehl', 'dinkelmehl', 'roggenmehl', 'vollkornmehl', 'speisestärke', 'stärke', 'puddingpulver', 'tortenguss', 'nutella', 'marmelade', 'konfitüre', 'honig', 'sirup', 'karamell', 'krokant', 'mohn', 'gummibärchen', 'bonbon', 'keks', 'cookie', 'waffel'],
    'Tiefkühl 🧊': ['tiefkühl', 'tiefgefroren', 'tk ', 'tk-', 'gefrorene', 'eiswürfel', 'eis', 'pizza tk', 'pommes', 'kroketten', 'fischstäbchen', 'spinat tiefgekühlt', 'erbsen tiefgekühlt', 'beeren tiefgekühlt', 'blätterteig', 'hefeteig'],
  };

  function categorizeIngredient(text) {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return category;
      }
    }
    return 'Sonstiges 📦';
  }

  async function loadShopping() {
    if (!state.currentUser) return;
    try {
      state.shoppingItems = await api.get(`/api/shopping?user_id=${state.currentUser.id}`);
      renderShopping();
    } catch (e) {
      toast('Fehler beim Laden', 'error');
    }
  }

  function renderShopping() {
    const list = $('#shopping-list');
    const empty = $('#shopping-empty');
    const actions = $('#shopping-actions');
    const items = state.shoppingItems;

    if (items.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      actions.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    actions.style.display = 'flex';

    // Group by recipe, then by category
    const recipeGroups = {};
    const manualItems = [];

    items.forEach(item => {
      if (item.recipe_id && item.recipe_title) {
        if (!recipeGroups[item.recipe_id]) {
          recipeGroups[item.recipe_id] = { title: item.recipe_title, items: [] };
        }
        recipeGroups[item.recipe_id].items.push(item);
      } else {
        manualItems.push(item);
      }
    });

    let html = '';

    // Manual items first
    if (manualItems.length > 0) {
      html += '<div class="shopping-recipe-header">Manuell hinzugefügt</div>';
      const byCat = groupByCategory(manualItems);
      html += renderCategoryGroups(byCat);
    }

    // Recipe groups
    for (const [recipeId, group] of Object.entries(recipeGroups)) {
      html += `<div class="shopping-recipe-header">${escapeHtml(group.title)}</div>`;
      const byCat = groupByCategory(group.items);
      html += renderCategoryGroups(byCat);
    }

    list.innerHTML = html;

    // Checkbox listeners
    list.querySelectorAll('.shopping-checkbox').forEach(cb => {
      cb.addEventListener('click', async () => {
        try {
          await api.patch(`/api/shopping/${cb.dataset.id}/toggle`);
          await loadShopping();
        } catch (e) { toast('Fehler', 'error'); }
      });
    });
  }

  function groupByCategory(items) {
    const groups = {};
    items.forEach(item => {
      const cat = item.category || 'Sonstiges 📦';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }

  function renderCategoryGroups(groups) {
    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="shopping-category-header">${escapeHtml(cat)}</div>`;
      items.forEach(item => {
        const checked = item.checked ? 'checked' : '';
        html += `
          <div class="shopping-item ${checked}">
            <div class="shopping-checkbox ${checked}" data-id="${item.id}"></div>
            <span class="shopping-item-text">${escapeHtml(item.text)}</span>
          </div>`;
      });
    }
    return html;
  }

  async function addShoppingItem() {
    const input = $('#shopping-input');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api.post('/api/shopping', {
        user_id: state.currentUser.id,
        text,
        category: categorizeIngredient(text)
      });
      input.value = '';
      await loadShopping();
    } catch (e) {
      toast('Fehler', 'error');
    }
  }

  // ============ PLANNER ============
  function getWeekDates(offset = 0) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function formatDateISO(d) {
    return d.toISOString().split('T')[0];
  }

  async function loadPlanner() {
    if (!state.currentUser) return;
    const dates = getWeekDates(state.plannerWeekOffset);
    const startDate = formatDateISO(dates[0]);
    const endDate = formatDateISO(dates[6]);

    $('#planner-week-range').textContent = `${dates[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} – ${dates[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

    try {
      state.plannerEntries = await api.get(`/api/planner?user_id=${state.currentUser.id}&start_date=${startDate}&end_date=${endDate}`);
      renderPlanner(dates);
    } catch (e) {
      toast('Fehler beim Laden', 'error');
    }
  }

  function renderPlanner(dates) {
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const today = formatDateISO(new Date());
    const grid = $('#planner-grid');

    grid.innerHTML = dates.map((d, i) => {
      const dateStr = formatDateISO(d);
      const isToday = dateStr === today;
      const entries = state.plannerEntries.filter(e => e.date === dateStr);

      let recipesHtml = entries.map(e => `
        <div class="planner-recipe-item">
          <span data-id="${e.recipe_id}">${escapeHtml(e.recipe_title)}</span>
          <button data-entry-id="${e.id}" title="Entfernen">&times;</button>
        </div>
      `).join('');

      return `
        <div class="planner-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <div class="planner-day-header">
            <span class="planner-day-name">${dayNames[i]}</span>
            <span class="planner-day-date">${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</span>
          </div>
          ${recipesHtml}
          <button class="planner-add-btn" data-date="${dateStr}">+ Rezept hinzufügen</button>
        </div>`;
    }).join('');

    // Recipe click → detail
    grid.querySelectorAll('.planner-recipe-item span').forEach(el => {
      el.addEventListener('click', () => navigate(`#detail/${el.dataset.id}`));
    });

    // Remove button
    grid.querySelectorAll('.planner-recipe-item button').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.del(`/api/planner/${btn.dataset.entryId}`);
          await loadPlanner();
        } catch (e) { toast('Fehler', 'error'); }
      });
    });

    // Add button
    grid.querySelectorAll('.planner-add-btn').forEach(btn => {
      btn.addEventListener('click', () => openRecipePicker(btn.dataset.date));
    });
  }

  // Recipe Picker
  async function openRecipePicker(date) {
    state.pickerCallback = async (recipeId) => {
      try {
        await api.post('/api/planner', { user_id: state.currentUser.id, recipe_id: recipeId, date });
        await loadPlanner();
        closeRecipePicker();
      } catch (e) { toast('Fehler', 'error'); }
    };

    $('#recipe-picker').style.display = 'flex';
    $('#picker-search').value = '';
    renderPickerList('');
  }

  function renderPickerList(search) {
    const filtered = state.recipes.filter(r =>
      !search || r.title.toLowerCase().includes(search.toLowerCase())
    );
    const list = $('#picker-list');
    list.innerHTML = filtered.map(r => {
      const imgHtml = r.image
        ? `<img class="picker-item-img" src="${escapeHtml(r.image)}" alt="">`
        : `<div class="picker-item-placeholder">🍽️</div>`;
      return `<div class="picker-item" data-id="${r.id}">${imgHtml}<span class="picker-item-title">${escapeHtml(r.title)}</span></div>`;
    }).join('');

    list.querySelectorAll('.picker-item').forEach(item => {
      item.addEventListener('click', () => {
        if (state.pickerCallback) state.pickerCallback(item.dataset.id);
      });
    });
  }

  function closeRecipePicker() {
    $('#recipe-picker').style.display = 'none';
    state.pickerCallback = null;
  }

  // Generate shopping list from planner
  async function generatePlannerShopping() {
    const dates = getWeekDates(state.plannerWeekOffset);
    const startDate = formatDateISO(dates[0]);
    const endDate = formatDateISO(dates[6]);

    try {
      const recipes = await api.get(`/api/planner/ingredients?user_id=${state.currentUser.id}&start_date=${startDate}&end_date=${endDate}`);
      if (recipes.length === 0) {
        toast('Keine Rezepte in dieser Woche geplant', 'error');
        return;
      }

      const allItems = [];
      recipes.forEach(r => {
        const lines = (r.ingredients || '').split('\n').filter(l => l.trim());
        lines.forEach(l => {
          allItems.push({
            text: l.trim(),
            recipe_id: r.id,
            recipe_title: r.title,
            category: categorizeIngredient(l.trim())
          });
        });
      });

      if (allItems.length === 0) {
        toast('Keine Zutaten gefunden', 'error');
        return;
      }

      await api.post('/api/shopping/bulk', { user_id: state.currentUser.id, items: allItems });
      toast(`${allItems.length} Zutaten zur Einkaufsliste hinzugefügt`);
    } catch (e) {
      toast('Fehler', 'error');
    }
  }

  // ============ SETTINGS ============
  function loadSettings() {
    if (state.currentUser) {
      $('#settings-username').textContent = state.currentUser.name;
    }
  }

  async function exportRecipes() {
    try {
      const data = await api.get(`/api/export?user_id=${state.currentUser.id}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evas-rezepte-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Rezepte exportiert');
    } catch (e) {
      toast('Fehler beim Export', 'error');
    }
  }

  async function importRecipes(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const recipes = data.recipes || data;
      if (!Array.isArray(recipes)) throw new Error('Ungültiges Format');
      const result = await api.post('/api/import', { user_id: state.currentUser.id, recipes });
      toast(`${result.imported} Rezepte importiert`);
      loadRecipes();
    } catch (e) {
      toast('Fehler beim Import: ' + e.message, 'error');
    }
  }

  // ============ EVENT LISTENERS ============
  function initEventListeners() {
    // Onboarding
    $('#onboarding-start').addEventListener('click', () => {
      const name = $('#onboarding-name').value.trim();
      if (name) createUser(name);
      else toast('Bitte gib einen Namen ein', 'error');
    });

    $('#onboarding-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = $('#onboarding-name').value.trim();
        if (name) createUser(name);
      }
    });

    // Dark Mode
    $('#btn-dark-mode').addEventListener('click', toggleDarkMode);

    // Settings
    $('#btn-settings').addEventListener('click', () => navigate('#settings'));

    // Router
    window.addEventListener('hashchange', handleRoute);

    // Search & Sort & Filter
    $('#search-input').addEventListener('input', renderRecipes);
    $('#sort-select').addEventListener('change', renderRecipes);
    $$('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.chip[data-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderRecipes();
      });
    });

    // Recipe form
    $('#recipe-form').addEventListener('submit', saveRecipe);
    setupImageUpload();

    // Mode toggle (manual/ocr)
    $$('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#ocr-section').style.display = btn.dataset.mode === 'ocr' ? 'block' : 'none';
      });
    });

    // Tags input
    $('#tags-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag($('#tags-input').value.replace(',', ''));
        $('#tags-input').value = '';
      }
    });

    // Tag suggestions
    $$('#tag-suggestions .chip').forEach(btn => {
      btn.addEventListener('click', () => addTag(btn.dataset.tag));
    });

    // Tags container click focuses input
    $('#tags-container').addEventListener('click', () => $('#tags-input').focus());

    // Instagram parser
    $('#btn-parse-instagram').addEventListener('click', () => {
      const text = $('#recipe-instagram').value;
      if (text.trim()) {
        parseRecipeText(text);
        toast('Text erkannt – bitte prüfen');
      }
    });

    // OCR
    setupOCR();

    // Detail back & fav
    $('#detail-back').addEventListener('click', () => history.back());
    $('#detail-fav').addEventListener('click', async () => {
      if (!state.currentRecipe) return;
      try {
        const result = await api.patch(`/api/recipes/${state.currentRecipe.id}/favorite`);
        state.currentRecipe.is_favorite = result.is_favorite;
        renderRecipeDetail(state.currentRecipe);
      } catch (e) { toast('Fehler', 'error'); }
    });

    // Cooking mode
    $('#cooking-close').addEventListener('click', closeCookingMode);
    $('#cooking-next').addEventListener('click', cookingNext);
    $('#cooking-prev').addEventListener('click', cookingPrev);
    $('#cooking-ingredients-btn').addEventListener('click', () => {
      const panel = $('#cooking-ingredients-panel');
      panel.style.display = 'flex';
      requestAnimationFrame(() => panel.classList.add('open'));
    });
    $('#cooking-ingredients-close').addEventListener('click', () => {
      const panel = $('#cooking-ingredients-panel');
      panel.classList.remove('open');
      setTimeout(() => panel.style.display = 'none', 300);
    });

    // Shopping
    $('#shopping-add-btn').addEventListener('click', addShoppingItem);
    $('#shopping-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addShoppingItem();
    });
    $('#shopping-check-all').addEventListener('click', async () => {
      try {
        await api.patch(`/api/shopping/check-all?user_id=${state.currentUser.id}`);
        await loadShopping();
      } catch (e) { toast('Fehler', 'error'); }
    });
    $('#shopping-delete-checked').addEventListener('click', async () => {
      const ok = await showConfirm('Erledigte löschen', 'Alle abgehakten Einträge löschen?', 'Löschen');
      if (ok) {
        try {
          await api.del(`/api/shopping/checked?user_id=${state.currentUser.id}`);
          await loadShopping();
        } catch (e) { toast('Fehler', 'error'); }
      }
    });
    $('#shopping-clear').addEventListener('click', async () => {
      const ok = await showConfirm('Liste leeren', 'Die gesamte Einkaufsliste löschen?', 'Leeren');
      if (ok) {
        try {
          await api.del(`/api/shopping/all?user_id=${state.currentUser.id}`);
          await loadShopping();
        } catch (e) { toast('Fehler', 'error'); }
      }
    });

    // Planner
    $('#planner-prev').addEventListener('click', () => { state.plannerWeekOffset--; loadPlanner(); });
    $('#planner-next').addEventListener('click', () => { state.plannerWeekOffset++; loadPlanner(); });
    $('#planner-today').addEventListener('click', () => { state.plannerWeekOffset = 0; loadPlanner(); });
    $('#planner-shopping-btn').addEventListener('click', generatePlannerShopping);

    // Picker
    $('#picker-close').addEventListener('click', closeRecipePicker);
    $('#picker-search').addEventListener('input', (e) => renderPickerList(e.target.value));
    $('#recipe-picker').addEventListener('click', (e) => {
      if (e.target === $('#recipe-picker')) closeRecipePicker();
    });

    // Settings
    $('#settings-switch-user').addEventListener('click', () => {
      document.cookie = 'user_id=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
      state.currentUser = null;
      showOnboarding();
    });
    $('#settings-export').addEventListener('click', exportRecipes);
    $('#settings-import-btn').addEventListener('click', () => $('#settings-import-file').click());
    $('#settings-import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importRecipes(e.target.files[0]);
    });

    // Confirm dialog backdrop click
    $('#confirm-dialog').addEventListener('click', (e) => {
      if (e.target === $('#confirm-dialog')) {
        $('#confirm-dialog').style.display = 'none';
      }
    });
  }

  // ============ INIT ============
  function init() {
    initDarkMode();
    initEventListeners();
    checkUser();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
