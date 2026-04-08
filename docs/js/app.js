/* ============================================
   EVAS REZEPTESAMMLUNG — Supabase Edition
   ============================================ */

(function() {
  'use strict';

  // ============ SUPABASE CONFIG ============
  const SUPABASE_URL = 'https://yiczkjeuupwazjlfzvxk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_HafJLPom-lSVtVUEkSPXXg_IxPs8DRz';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

  // ============ UTILS ============
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function toast(message, type = 'success') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    const duration = type === 'error' ? 8000 : 3000;
    setTimeout(() => el.remove(), duration);
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
    const diff = Math.abs(e.touches[0].clientY - touchStartY);
    if (diff > 30 && mc.scrollTop === lastScrollTop) forceRepaint();
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
  function getRoute() {
    const hash = location.hash || '#home';
    const parts = hash.slice(1).split('/');
    return { view: parts[0], id: parts[1] };
  }

  function navigate(hash) { location.hash = hash; }

  function handleRoute() {
    const { view, id } = getRoute();
    $$('.view').forEach(v => v.style.display = 'none');
    $$('.nav-item').forEach(n => n.classList.remove('active'));

    switch (view) {
      case 'home': case '':
        showView('home'); loadRecipes(); break;
      case 'add':
        showView('add'); resetRecipeForm(); break;
      case 'shopping':
        showView('shopping'); loadShopping(); break;
      case 'planner':
        showView('planner'); loadPlanner(); break;
      case 'settings':
        showView('settings'); loadSettings(); break;
      case 'detail':
        if (id) { showView('detail'); loadRecipeDetail(id); } break;
      case 'edit':
        if (id) { showView('add'); loadRecipeForEdit(id); } break;
      default:
        showView('home'); loadRecipes();
    }
    forceRepaint();
  }

  function showView(name) {
    const el = $(`#view-${name}`);
    if (el) el.style.display = 'block';
    const navMap = { home: 'home', add: 'add', shopping: 'shopping', planner: 'planner' };
    if (navMap[name]) {
      const navItem = $(`.nav-item[data-tab="${navMap[name]}"]`);
      if (navItem) navItem.classList.add('active');
    }
    window.scrollTo(0, 0);
  }

  // ============ ONBOARDING ============
  async function checkUser() {
    const userId = getCookie('user_id');
    if (userId) {
      const { data } = await db.from('users').select('*').eq('id', userId).single();
      if (data) {
        state.currentUser = data;
        showApp();
        return;
      }
    }
    showOnboarding();
  }

  async function showOnboarding() {
    $('#app').style.display = 'none';
    $('#onboarding-overlay').style.display = 'flex';
    const { data: users } = await db.from('users').select('*').order('name');
    const list = $('#onboarding-users');
    list.innerHTML = '';
    if (users && users.length > 0) {
      users.forEach(u => {
        const btn = document.createElement('button');
        btn.className = 'onboarding-user-btn';
        btn.innerHTML = `<span class="onboarding-user-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</span><span>${escapeHtml(u.name)}</span>`;
        btn.addEventListener('click', () => selectUser(u));
        list.appendChild(btn);
      });
    }
  }

  async function createUser(name) {
    const { data, error } = await db.from('users').insert({ name: name.trim() }).select().single();
    if (error) { toast('Fehler beim Erstellen', 'error'); return; }
    selectUser(data);
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

    const { data, error } = await db.from('recipes')
      .select('*')
      .eq('user_id', state.currentUser.id)
      .order('created_at', { ascending: false });

    skeleton.style.display = 'none';

    if (error) { toast('Fehler beim Laden', 'error'); return; }
    state.recipes = data || [];
    renderRecipes();
  }

  function renderRecipes() {
    const list = $('#recipe-list');
    const empty = $('#empty-state');
    const searchTerm = ($('#search-input')?.value || '').toLowerCase();
    const sortBy = $('#sort-select')?.value || 'newest';
    const activeFilter = $('.chip.active')?.dataset.filter || 'all';

    let filtered = [...state.recipes];

    if (searchTerm) {
      filtered = filtered.filter(r => r.title.toLowerCase().includes(searchTerm));
    }

    if (activeFilter === 'favorites') {
      filtered = filtered.filter(r => r.is_favorite);
    } else if (activeFilter !== 'all') {
      filtered = filtered.filter(r => r.category === activeFilter);
    }

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
      const isFav = r.is_favorite ? 'is-fav' : '';
      const imageHtml = r.image
        ? `<img class="recipe-card-image" src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}" loading="lazy">`
        : `<div class="recipe-card-placeholder">🍽️</div>`;
      return `
        <div class="recipe-card" data-id="${r.id}">
          <button class="recipe-card-fav ${isFav}" data-id="${r.id}">
            <svg viewBox="0 0 24 24" fill="${r.is_favorite ? 'var(--danger)' : 'none'}" stroke="${r.is_favorite ? 'var(--danger)' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          ${imageHtml}
          <div class="recipe-card-body">
            <div class="recipe-card-title">${escapeHtml(r.title)}</div>
            ${r.category ? `<span class="category-badge ${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.recipe-card-fav')) return;
        navigate(`#detail/${card.dataset.id}`);
      });
    });

    list.querySelectorAll('.recipe-card-fav').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const recipe = state.recipes.find(r => r.id === btn.dataset.id);
        if (!recipe) return;
        await db.from('recipes').update({ is_favorite: !recipe.is_favorite }).eq('id', btn.dataset.id);
        await loadRecipes();
      });
    });
  }

  // ============ RECIPE DETAIL ============
  async function loadRecipeDetail(id) {
    const { data, error } = await db.from('recipes').select('*').eq('id', id).single();
    if (error || !data) { toast('Rezept nicht gefunden', 'error'); navigate('#home'); return; }
    await db.from('recipes').update({ last_viewed: new Date().toISOString() }).eq('id', id);
    state.currentRecipe = data;
    state.originalPortions = data.portions || null;
    state.currentPortions = data.portions || null;
    renderRecipeDetail(data);
  }

  function renderRecipeDetail(r) {
    const tags = r.tags || [];
    const isFav = r.is_favorite;

    const favBtn = $('#detail-fav');
    favBtn.querySelector('.icon-heart').setAttribute('fill', isFav ? 'var(--danger)' : 'none');
    favBtn.querySelector('.icon-heart').setAttribute('stroke', isFav ? 'var(--danger)' : 'currentColor');

    let html = '';
    if (r.image) html += `<img class="detail-image" src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}">`;
    html += `<h2 class="detail-title">${escapeHtml(r.title)}</h2>`;
    html += '<div class="detail-meta">';
    if (r.category) html += `<span class="category-badge ${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>`;
    html += '</div>';

    if (tags.length > 0) {
      html += '<div class="detail-tags">';
      tags.forEach(t => { html += `<span class="tag-chip">${escapeHtml(t)}</span>`; });
      html += '</div>';
    }

    if (r.portions) {
      html += `<div class="portions-stepper">
        <button id="portions-minus">−</button>
        <span id="portions-display">${r.portions} Portionen</span>
        <button id="portions-plus">+</button>
      </div>`;
    }

    if (r.ingredients && r.ingredients.trim()) {
      const lines = r.ingredients.split('\n').filter(l => l.trim());
      html += '<div class="detail-section"><h3>Zutaten</h3><ul class="detail-ingredients-list">';
      lines.forEach(l => { html += `<li class="ingredient-line">${escapeHtml(l.trim())}</li>`; });
      html += '</ul></div>';
    }

    if (r.preparation && r.preparation.trim()) {
      html += `<div class="detail-section"><h3>Zubereitung</h3><div class="detail-preparation">${escapeHtml(r.preparation.trim())}</div></div>`;
    }

    html += `<div class="detail-notes">
      <h3 style="font-size:1rem;margin-bottom:10px;color:var(--accent)">Notizen</h3>
      <textarea id="detail-notes-input" rows="3" placeholder="Eigene Anmerkungen...">${escapeHtml(r.notes || '')}</textarea>
      <button id="detail-notes-save" class="btn btn-secondary btn-sm">Speichern</button>
    </div>`;

    html += '<div class="detail-actions">';
    html += '<button id="detail-add-shopping" class="btn btn-secondary">Zur Einkaufsliste hinzufügen</button>';
    if (r.source_url) html += `<a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener" class="btn btn-secondary">Originalrezept ansehen</a>`;
    if (r.preparation && r.preparation.trim()) html += '<button id="detail-cook" class="btn btn-primary">Kochen</button>';
    html += '<button id="detail-edit" class="btn btn-secondary">Bearbeiten</button>';
    html += '<button id="detail-delete" class="btn btn-danger">Löschen</button>';
    html += '</div>';

    $('#detail-content').innerHTML = html;

    if (r.portions) {
      $('#portions-minus')?.addEventListener('click', () => adjustPortions(-1));
      $('#portions-plus')?.addEventListener('click', () => adjustPortions(1));
    }

    $('#detail-notes-input')?.addEventListener('input', () => {
      $('#detail-notes-save').classList.add('visible');
    });

    $('#detail-notes-save')?.addEventListener('click', async () => {
      await db.from('recipes').update({ notes: $('#detail-notes-input').value }).eq('id', r.id);
      toast('Notizen gespeichert');
      $('#detail-notes-save').classList.remove('visible');
    });

    $('#detail-add-shopping')?.addEventListener('click', () => addIngredientsToShopping(r));
    $('#detail-cook')?.addEventListener('click', () => startCookingMode(r));
    $('#detail-edit')?.addEventListener('click', () => navigate(`#edit/${r.id}`));
    $('#detail-delete')?.addEventListener('click', async () => {
      const ok = await showConfirm('Rezept löschen', `Möchtest du "${r.title}" wirklich löschen?`);
      if (ok) {
        await db.from('planner_entries').delete().eq('recipe_id', r.id);
        await db.from('shopping_items').delete().eq('recipe_id', r.id);
        await db.from('recipes').delete().eq('id', r.id);
        toast('Rezept gelöscht');
        navigate('#home');
      }
    });
  }

  function adjustPortions(delta) {
    const r = state.currentRecipe;
    if (!r || !state.originalPortions) return;
    state.currentPortions = Math.max(1, (state.currentPortions || state.originalPortions) + delta);
    const factor = state.currentPortions / state.originalPortions;
    $('#portions-display').textContent = `${state.currentPortions} Portionen`;
    const origLines = r.ingredients.split('\n').filter(l => l.trim());
    const ingredientEls = $$('.ingredient-line');
    origLines.forEach((line, i) => {
      if (ingredientEls[i]) ingredientEls[i].textContent = scaleIngredientLine(line.trim(), factor);
    });
  }

  function scaleIngredientLine(line, factor) {
    return line.replace(/(\d+[\.,]?\d*)\s*\/\s*(\d+[\.,]?\d*)/g, (m, num, den) => {
      return formatScaledNumber(parseFloat(num.replace(',', '.')) / parseFloat(den.replace(',', '.')) * factor);
    }).replace(/(?<!\/)(\d+[\.,]\d+)(?![\d\/])/g, (m) => {
      return formatScaledNumber(parseFloat(m.replace(',', '.')) * factor);
    }).replace(/(?<![\/\.,\d])(\d+)(?![\/\.,\d])/g, (m) => {
      return formatScaledNumber(parseInt(m) * factor);
    });
  }

  function formatScaledNumber(n) {
    if (n === Math.floor(n)) return String(Math.round(n));
    return n.toFixed(1).replace('.', ',').replace(/,0$/, '');
  }

  // ============ SHOPPING ============
  const CATEGORY_MAP = {
    'Obst & Gemüse 🥬': ['apfel','äpfel','birne','banane','orange','zitrone','limette','beeren','erdbeere','himbeere','blaubeere','heidelbeere','traube','kirsche','mango','ananas','melone','pfirsich','pflaume','kiwi','avocado','tomate','tomaten','gurke','paprika','zwiebel','knoblauch','kartoffel','kartoffeln','karotte','möhre','salat','spinat','brokkoli','blumenkohl','zucchini','aubergine','lauch','porree','sellerie','fenchel','kohlrabi','radieschen','rettich','rote bete','kürbis','süßkartoffel','mais','erbsen','bohnen','champignon','pilz','pilze','frühlingszwiebel','rucola','petersilie','basilikum','schnittlauch','dill','minze','koriander','rosmarin','thymian','salbei','ingwer','chili','peperoni','schalotte','gemüse','obst','kräuter','spargel'],
    'Fleisch & Wurst 🥩': ['fleisch','hähnchen','huhn','hühnchen','chicken','pute','truthahn','rind','rindfleisch','schwein','schweinefleisch','hackfleisch','hack','mett','steak','filet','schnitzel','bratwurst','wurst','würstchen','salami','schinken','speck','bacon','lamm','wild','ente','gans','gulasch','braten','kotelett','rippchen','aufschnitt','gyros','hähnchenbrust','putenbrust'],
    'Fisch & Meeresfrüchte 🐟': ['fisch','lachs','thunfisch','forelle','kabeljau','dorsch','hering','makrele','sardine','garnele','garnelen','shrimp','shrimps','krabbe','muschel','tintenfisch','calamari','pangasius','seelachs','meeresfrüchte'],
    'Milchprodukte & Eier 🧀': ['milch','butter','sahne','rahm','schmand','sauerrahm','crème fraîche','creme fraiche','joghurt','quark','käse','gouda','emmentaler','cheddar','parmesan','mozzarella','feta','frischkäse','mascarpone','ricotta','ei','eier','eigelb','eiweiß','buttermilch','kefir','schlagsahne','kondensmilch','skyr','hüttenkäse','ziegenkäse','schafskäse','halloumi','burrata'],
    'Brot & Backwaren 🍞': ['brot','brötchen','semmel','toast','baguette','ciabatta','croissant','brezel','knäckebrot','zwieback','tortilla','wrap','fladenbrot','naan','pita','vollkornbrot'],
    'Nudeln, Reis & Getreide 🍝': ['nudel','nudeln','pasta','spaghetti','penne','fusilli','farfalle','tagliatelle','lasagne','makkaroni','rigatoni','tortellini','gnocchi','reis','basmati','risotto','couscous','bulgur','quinoa','polenta','hirse','grieß','haferflocken','müsli','linsen','kichererbsen','kidneybohnen'],
    'Konserven & Fertigprodukte 🥫': ['konserve','dose','dosentomaten','passierte tomaten','tomatenmark','kokosmilch','brühe','fond','pesto','ketchup','mayonnaise','mayo','senf','sojasoße','sojasauce','worcestersauce','tabasco','sambal','currypaste','tomatensoße','ajvar','harissa','tahini','hummus','oliven','kapern','cornichons','gewürzgurke','sauerkraut'],
    'Gewürze & Würzmittel 🧂': ['salz','pfeffer','zucker','paprikapulver','curry','currypulver','kurkuma','kreuzkümmel','kümmel','zimt','muskat','muskatnuss','nelke','oregano','majoran','cayenne','chiliflocken','knoblauchpulver','zwiebelpulver','gewürz','bouillon','gemüsebrühe','hühnerbrühe','brühwürfel','vanille','vanillezucker','backpulver','natron','hefe','trockenhefe','gelatine','essig','balsamico','apfelessig','öl','olivenöl','sonnenblumenöl','rapsöl','sesamöl','kokosöl','honig','ahornsirup','agavendicksaft'],
    'Nüsse & Trockenfrüchte 🥜': ['nüsse','nuss','mandel','mandeln','walnuss','walnüsse','haselnuss','haselnüsse','cashew','erdnuss','erdnüsse','pistazie','pistazien','pinienkerne','rosine','rosinen','cranberry','dattel','datteln','feige','feigen','kokosraspel','erdnussbutter','mandelmus','sesam','sonnenblumenkerne','kürbiskerne','leinsamen','chiasamen','chia'],
    'Getränke & Alkohol 🍷': ['wasser','mineralwasser','saft','orangensaft','apfelsaft','wein','weißwein','rotwein','bier','sekt','prosecco','rum','whisky','vodka','gin','amaretto','tee','kaffee','kakao','hafermilch','sojamilch','mandelmilch'],
    'Süßes & Backen 🍫': ['schokolade','kuvertüre','kakaopulver','puderzucker','brauner zucker','rohrzucker','marzipan','streusel','mehl','weizenmehl','dinkelmehl','vollkornmehl','speisestärke','stärke','puddingpulver','nutella','marmelade','konfitüre','sirup','karamell','mohn'],
    'Tiefkühl 🧊': ['tiefkühl','tiefgefroren','tk ','tk-','gefrorene','eiswürfel','pommes','kroketten','fischstäbchen','blätterteig','hefeteig'],
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

  async function addIngredientsToShopping(recipe) {
    if (!recipe.ingredients || !recipe.ingredients.trim()) { toast('Keine Zutaten vorhanden', 'error'); return; }
    const lines = recipe.ingredients.split('\n').filter(l => l.trim());
    const items = lines.map(l => ({
      user_id: state.currentUser.id,
      text: l.trim(),
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      category: categorizeIngredient(l.trim())
    }));
    const { error } = await db.from('shopping_items').insert(items);
    if (error) { toast('Fehler', 'error'); return; }
    toast(`${items.length} Zutaten zur Einkaufsliste hinzugefügt`);
  }

  async function loadShopping() {
    if (!state.currentUser) return;
    const { data } = await db.from('shopping_items')
      .select('*')
      .eq('user_id', state.currentUser.id)
      .order('sort_order').order('created_at');
    state.shoppingItems = data || [];
    renderShopping();
  }

  function renderShopping() {
    const list = $('#shopping-list');
    const empty = $('#shopping-empty');
    const actions = $('#shopping-actions');
    const items = state.shoppingItems;

    if (items.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; actions.style.display = 'none'; return; }
    empty.style.display = 'none';
    actions.style.display = 'flex';

    const recipeGroups = {};
    const manualItems = [];
    items.forEach(item => {
      if (item.recipe_id && item.recipe_title) {
        if (!recipeGroups[item.recipe_id]) recipeGroups[item.recipe_id] = { title: item.recipe_title, items: [] };
        recipeGroups[item.recipe_id].items.push(item);
      } else {
        manualItems.push(item);
      }
    });

    let html = '';
    if (manualItems.length > 0) {
      html += '<div class="shopping-recipe-header">Manuell hinzugefügt</div>';
      html += renderCategoryGroups(groupByCategory(manualItems));
    }
    for (const [, group] of Object.entries(recipeGroups)) {
      html += `<div class="shopping-recipe-header">${escapeHtml(group.title)}</div>`;
      html += renderCategoryGroups(groupByCategory(group.items));
    }
    list.innerHTML = html;

    list.querySelectorAll('.shopping-checkbox').forEach(cb => {
      cb.addEventListener('click', async () => {
        const item = items.find(i => i.id === cb.dataset.id);
        if (!item) return;
        await db.from('shopping_items').update({ checked: !item.checked }).eq('id', cb.dataset.id);
        await loadShopping();
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
        html += `<div class="shopping-item ${checked}">
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
    await db.from('shopping_items').insert({
      user_id: state.currentUser.id, text, category: categorizeIngredient(text)
    });
    input.value = '';
    await loadShopping();
  }

  // ============ COOKING MODE ============
  function startCookingMode(recipe) {
    if (!recipe.preparation) return;
    let steps = recipe.preparation.split(/\n\s*\n/).filter(s => s.trim());
    if (steps.length === 1) steps = recipe.preparation.split('\n').filter(s => s.trim());
    steps = steps.map(s => s.replace(/^\d+[\.\)]\s*/, '').trim());
    state.cookingSteps = steps;
    state.cookingIndex = 0;
    renderCookingStep();
    $('#cooking-mode').style.display = 'flex';
    const ingList = $('#cooking-ingredients-list');
    const lines = (recipe.ingredients || '').split('\n').filter(l => l.trim());
    ingList.innerHTML = lines.map(l => `<li>${escapeHtml(l.trim())}</li>`).join('');
    requestWakeLock();
    setupCookingSwipe();
  }

  function renderCookingStep() {
    const { cookingSteps, cookingIndex } = state;
    $('#cooking-step-content').textContent = cookingSteps[cookingIndex];
    $('#cooking-step-counter').textContent = `Schritt ${cookingIndex + 1} von ${cookingSteps.length}`;
    $('#cooking-prev').style.visibility = cookingIndex > 0 ? 'visible' : 'hidden';
    $('#cooking-next').innerHTML = cookingIndex === cookingSteps.length - 1 ? '✓ Fertig' : 'Weiter';
    const dots = $('#cooking-dots');
    dots.innerHTML = cookingSteps.map((_, i) => `<div class="cooking-dot ${i === cookingIndex ? 'active' : ''}"></div>`).join('');
  }

  function setupCookingSwipe() {
    const el = $('#cooking-step-content');
    let startX = 0;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 60) { diff < 0 ? cookingNext() : cookingPrev(); }
    });
  }

  function cookingNext() {
    if (state.cookingIndex < state.cookingSteps.length - 1) { state.cookingIndex++; renderCookingStep(); }
    else closeCookingMode();
  }
  function cookingPrev() {
    if (state.cookingIndex > 0) { state.cookingIndex--; renderCookingStep(); }
  }
  function closeCookingMode() {
    $('#cooking-mode').style.display = 'none';
    $('#cooking-ingredients-panel').style.display = 'none';
    $('#cooking-ingredients-panel').classList.remove('open');
    releaseWakeLock();
  }
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseWakeLock() {
    if (state.wakeLock) { state.wakeLock.release(); state.wakeLock = null; }
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
    $('#ocr-section').style.display = 'none';
    $('#ocr-previews').innerHTML = '';
    $('#ocr-start-btn').style.display = 'none';
    $('#ocr-info-banner').style.display = 'none';
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    $('.mode-btn[data-mode="manual"]').classList.add('active');
  }

  async function loadRecipeForEdit(id) {
    const { data: r } = await db.from('recipes').select('*').eq('id', id).single();
    if (!r) { toast('Rezept nicht gefunden', 'error'); navigate('#home'); return; }
    state.editingRecipeId = id;
    state.currentTags = r.tags || [];
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
  }

  async function saveRecipe(e) {
    e.preventDefault();
    try {
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
        updated_at: new Date().toISOString()
      };

      if (!data.title) { toast('Bitte gib einen Titel ein', 'error'); return; }

      // Große Bilder komprimieren um Supabase Row-Size-Limit zu vermeiden
      const imgSize = data.image ? Math.round(data.image.length / 1024) : 0;
      if (imgSize > 500 && data.image.startsWith('data:image')) {
        const compImg = new Image();
        data.image = await new Promise((resolve) => {
          compImg.onload = () => {
            const maxDim = 800;
            let w = compImg.width, h = compImg.height;
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(compImg, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
          };
          compImg.src = data.image;
        });
      }

      if (id) {
        const { error } = await db.from('recipes').update(data).eq('id', id);
        if (error) { toast('Fehler beim Speichern: ' + error.message, 'error'); console.error('Update error:', error); return; }
        toast('Rezept aktualisiert');
        navigate(`#detail/${id}`);
      } else {
        const { data: recipe, error } = await db.from('recipes').insert(data).select().single();
        if (error) { toast('Fehler beim Speichern: ' + error.message, 'error'); console.error('Insert error:', error); return; }
        toast('Rezept gespeichert');
        navigate(`#detail/${recipe.id}`);
      }
    } catch (err) {
      console.error('saveRecipe error:', err);
      toast('Fehler beim Speichern: ' + err.message, 'error');
    }
  }

  function setupImageUpload() {
    $('#image-upload-area').addEventListener('click', () => $('#recipe-image-input').click());
    $('#recipe-image-input').addEventListener('change', (e) => {
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
      $('#recipe-image-input').value = '';
    });
  }

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
    if (tag && !state.currentTags.includes(tag)) { state.currentTags.push(tag); renderTags(); }
  }

  // ============ OCR ============
  function setupOCR() {
    $('#ocr-upload-area').addEventListener('click', () => $('#ocr-file-input').click());
    $('#ocr-file-input').addEventListener('change', (e) => {
      state.ocrFiles = Array.from(e.target.files);
      const container = $('#ocr-previews');
      container.innerHTML = '';
      state.ocrFiles.forEach(file => { const img = document.createElement('img'); img.src = URL.createObjectURL(file); container.appendChild(img); });
      $('#ocr-start-btn').style.display = state.ocrFiles.length > 0 ? 'inline-flex' : 'none';
    });
    $('#ocr-start-btn').addEventListener('click', performOCR);
  }

  function populateFormFromRecipe(recipe) {
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
  }

  async function parseRecipeText(text) {
    const btn = $('#btn-parse-instagram');
    const origText = btn.textContent;
    btn.textContent = 'Wird erkannt...';
    btn.disabled = true;

    try {
      const res = await fetch('https://yiczkjeuupwazjlfzvxk.supabase.co/functions/v1/scan-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erkennung fehlgeschlagen');
      }

      const recipe = await res.json();
      populateFormFromRecipe(recipe);
      toast('Rezept erkannt – bitte prüfen', 'success');
    } catch (e) {
      toast('Fehler: ' + e.message, 'error');
    }

    btn.textContent = origText;
    btn.disabled = false;
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

      const res = await fetch('https://yiczkjeuupwazjlfzvxk.supabase.co/functions/v1/scan-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erkennung fehlgeschlagen');
      }

      const recipe = await res.json();

      populateFormFromRecipe(recipe);
      $('#ocr-info-banner').style.display = 'block';
      toast('Rezept erkannt!', 'success');
    } catch (e) {
      toast('Fehler: ' + e.message, 'error');
    }

    loading.style.display = 'none';
  }

  async function fileToBase64(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ============ PLANNER ============
  function getWeekDates(offset = 0) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  }

  function formatDateISO(d) { return d.toISOString().split('T')[0]; }

  async function loadPlanner() {
    if (!state.currentUser) return;
    const dates = getWeekDates(state.plannerWeekOffset);
    const startDate = formatDateISO(dates[0]);
    const endDate = formatDateISO(dates[6]);
    $('#planner-week-range').textContent = `${dates[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} – ${dates[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

    const { data } = await db.from('planner_entries')
      .select('*, recipes(title, category, image)')
      .eq('user_id', state.currentUser.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    state.plannerEntries = (data || []).map(e => ({
      ...e,
      recipe_title: e.recipes?.title || '',
      recipe_category: e.recipes?.category || '',
      recipe_image: e.recipes?.image || ''
    }));
    renderPlanner(dates);
  }

  function renderPlanner(dates) {
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const today = formatDateISO(new Date());
    const grid = $('#planner-grid');
    grid.innerHTML = dates.map((d, i) => {
      const dateStr = formatDateISO(d);
      const entries = state.plannerEntries.filter(e => e.date === dateStr);
      return `<div class="planner-day ${dateStr === today ? 'today' : ''}" data-date="${dateStr}">
        <div class="planner-day-header">
          <span class="planner-day-name">${dayNames[i]}</span>
          <span class="planner-day-date">${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</span>
        </div>
        ${entries.map(e => `<div class="planner-recipe-item">
          <span data-id="${e.recipe_id}">${escapeHtml(e.recipe_title)}</span>
          <button data-entry-id="${e.id}">&times;</button>
        </div>`).join('')}
        <button class="planner-add-btn" data-date="${dateStr}">+ Rezept hinzufügen</button>
      </div>`;
    }).join('');

    grid.querySelectorAll('.planner-recipe-item span').forEach(el => {
      el.addEventListener('click', () => navigate(`#detail/${el.dataset.id}`));
    });
    grid.querySelectorAll('.planner-recipe-item button').forEach(btn => {
      btn.addEventListener('click', async () => {
        await db.from('planner_entries').delete().eq('id', btn.dataset.entryId);
        await loadPlanner();
      });
    });
    grid.querySelectorAll('.planner-add-btn').forEach(btn => {
      btn.addEventListener('click', () => openRecipePicker(btn.dataset.date));
    });
  }

  async function openRecipePicker(date) {
    state.pickerCallback = async (recipeId) => {
      await db.from('planner_entries').insert({ user_id: state.currentUser.id, recipe_id: recipeId, date });
      await loadPlanner();
      closeRecipePicker();
    };
    $('#recipe-picker').style.display = 'flex';
    $('#picker-search').value = '';
    renderPickerList('');
  }

  function renderPickerList(search) {
    const filtered = state.recipes.filter(r => !search || r.title.toLowerCase().includes(search.toLowerCase()));
    const list = $('#picker-list');
    list.innerHTML = filtered.map(r => {
      const imgHtml = r.image ? `<img class="picker-item-img" src="${escapeHtml(r.image)}" alt="">` : `<div class="picker-item-placeholder">🍽️</div>`;
      return `<div class="picker-item" data-id="${r.id}">${imgHtml}<span class="picker-item-title">${escapeHtml(r.title)}</span></div>`;
    }).join('');
    list.querySelectorAll('.picker-item').forEach(item => {
      item.addEventListener('click', () => { if (state.pickerCallback) state.pickerCallback(item.dataset.id); });
    });
  }

  function closeRecipePicker() { $('#recipe-picker').style.display = 'none'; state.pickerCallback = null; }

  async function generatePlannerShopping() {
    const dates = getWeekDates(state.plannerWeekOffset);
    const startDate = formatDateISO(dates[0]);
    const endDate = formatDateISO(dates[6]);
    const { data: entries } = await db.from('planner_entries')
      .select('recipe_id, recipes(id, title, ingredients)')
      .eq('user_id', state.currentUser.id)
      .gte('date', startDate).lte('date', endDate);

    if (!entries || entries.length === 0) { toast('Keine Rezepte in dieser Woche geplant', 'error'); return; }
    const seen = new Set();
    const allItems = [];
    entries.forEach(e => {
      const r = e.recipes;
      if (!r || seen.has(r.id)) return;
      seen.add(r.id);
      (r.ingredients || '').split('\n').filter(l => l.trim()).forEach(l => {
        allItems.push({ user_id: state.currentUser.id, text: l.trim(), recipe_id: r.id, recipe_title: r.title, category: categorizeIngredient(l.trim()) });
      });
    });
    if (allItems.length === 0) { toast('Keine Zutaten gefunden', 'error'); return; }
    await db.from('shopping_items').insert(allItems);
    toast(`${allItems.length} Zutaten zur Einkaufsliste hinzugefügt`);
  }

  // ============ SETTINGS ============
  function loadSettings() {
    if (state.currentUser) $('#settings-username').textContent = state.currentUser.name;
  }

  async function exportRecipes() {
    const { data } = await db.from('recipes').select('*').eq('user_id', state.currentUser.id);
    const blob = new Blob([JSON.stringify({ version: '1.0', exported_at: new Date().toISOString(), recipes: data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evas-rezepte-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast('Rezepte exportiert');
  }

  async function importRecipes(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const recipes = data.recipes || data;
      if (!Array.isArray(recipes)) throw new Error('Ungültiges Format');
      const items = recipes.map(r => ({
        user_id: state.currentUser.id, title: r.title || 'Unbenannt', category: r.category || '',
        portions: r.portions || null, tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
        source_url: r.source_url || '', ingredients: r.ingredients || '', preparation: r.preparation || '',
        image: r.image || '', notes: r.notes || '', is_favorite: !!r.is_favorite
      }));
      await db.from('recipes').insert(items);
      toast(`${items.length} Rezepte importiert`);
      loadRecipes();
    } catch (e) { toast('Fehler beim Import: ' + e.message, 'error'); }
  }

  // ============ EVENT LISTENERS ============
  function initEventListeners() {
    $('#onboarding-start').addEventListener('click', () => {
      const name = $('#onboarding-name').value.trim();
      if (name) createUser(name); else toast('Bitte gib einen Namen ein', 'error');
    });
    $('#onboarding-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const name = $('#onboarding-name').value.trim(); if (name) createUser(name); }
    });
    $('#btn-dark-mode').addEventListener('click', toggleDarkMode);
    $('#btn-settings').addEventListener('click', () => navigate('#settings'));
    window.addEventListener('hashchange', handleRoute);

    $('#search-input').addEventListener('input', renderRecipes);
    $('#sort-select').addEventListener('change', renderRecipes);
    $$('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.chip[data-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderRecipes();
      });
    });

    $('#recipe-form').addEventListener('submit', saveRecipe);
    setupImageUpload();

    $$('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#ocr-section').style.display = btn.dataset.mode === 'ocr' ? 'block' : 'none';
      });
    });

    $('#tags-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag($('#tags-input').value.replace(',', '')); $('#tags-input').value = ''; }
    });
    $$('#tag-suggestions .chip').forEach(btn => { btn.addEventListener('click', () => addTag(btn.dataset.tag)); });
    $('#tags-container').addEventListener('click', () => $('#tags-input').focus());

    $('#btn-parse-instagram').addEventListener('click', () => {
      const text = $('#recipe-instagram').value;
      if (text.trim()) { parseRecipeText(text); toast('Text erkannt – bitte prüfen'); }
    });

    setupOCR();

    $('#detail-back').addEventListener('click', () => history.back());
    $('#detail-fav').addEventListener('click', async () => {
      if (!state.currentRecipe) return;
      const newFav = !state.currentRecipe.is_favorite;
      await db.from('recipes').update({ is_favorite: newFav }).eq('id', state.currentRecipe.id);
      state.currentRecipe.is_favorite = newFav;
      renderRecipeDetail(state.currentRecipe);
    });

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

    $('#shopping-add-btn').addEventListener('click', addShoppingItem);
    $('#shopping-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addShoppingItem(); });
    $('#shopping-check-all').addEventListener('click', async () => {
      await db.from('shopping_items').update({ checked: true }).eq('user_id', state.currentUser.id);
      await loadShopping();
    });
    $('#shopping-delete-checked').addEventListener('click', async () => {
      if (await showConfirm('Erledigte löschen', 'Alle abgehakten Einträge löschen?', 'Löschen')) {
        await db.from('shopping_items').delete().eq('user_id', state.currentUser.id).eq('checked', true);
        await loadShopping();
      }
    });
    $('#shopping-clear').addEventListener('click', async () => {
      if (await showConfirm('Liste leeren', 'Die gesamte Einkaufsliste löschen?', 'Leeren')) {
        await db.from('shopping_items').delete().eq('user_id', state.currentUser.id);
        await loadShopping();
      }
    });

    $('#planner-prev').addEventListener('click', () => { state.plannerWeekOffset--; loadPlanner(); });
    $('#planner-next').addEventListener('click', () => { state.plannerWeekOffset++; loadPlanner(); });
    $('#planner-today').addEventListener('click', () => { state.plannerWeekOffset = 0; loadPlanner(); });
    $('#planner-shopping-btn').addEventListener('click', generatePlannerShopping);

    $('#picker-close').addEventListener('click', closeRecipePicker);
    $('#picker-search').addEventListener('input', (e) => renderPickerList(e.target.value));
    $('#recipe-picker').addEventListener('click', (e) => { if (e.target === $('#recipe-picker')) closeRecipePicker(); });

    $('#settings-switch-user').addEventListener('click', () => {
      document.cookie = 'user_id=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
      state.currentUser = null;
      showOnboarding();
    });
    $('#settings-export').addEventListener('click', exportRecipes);
    $('#settings-import-btn').addEventListener('click', () => $('#settings-import-file').click());
    $('#settings-import-file').addEventListener('change', (e) => { if (e.target.files[0]) importRecipes(e.target.files[0]); });
    $('#confirm-dialog').addEventListener('click', (e) => { if (e.target === $('#confirm-dialog')) $('#confirm-dialog').style.display = 'none'; });
  }

  // ============ INIT ============
  function init() {
    initDarkMode();
    initEventListeners();
    checkUser();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
