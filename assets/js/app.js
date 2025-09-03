(() => {
  // Cache-busting version for data fetches; bump when data/resources change
  const VERSION = '2025-09-03';
  // Feature flags
  const ENABLE_STUDY_PLAN = false;
  const SELECTORS = {
    content: document.getElementById('content'),
    loading: document.getElementById('loading'),
    search: document.getElementById('search'),
    filterSection: document.getElementById('filter-section'),
    filterChannel: document.getElementById('filter-channel'),
    filterType: document.getElementById('filter-type'),
    filterWatchlist: document.getElementById('filter-watchlist'),
    filterWatched: document.getElementById('filter-watched'),
    progressBar: document.getElementById('progress-bar'),
    themeToggle: document.getElementById('theme-toggle'),
    tocEl: document.getElementById('toc'),
  };

  const YT_API_KEY = window.YT_API_KEY || '';

  const state = {
    items: [],
    channels: new Set(),
    filters: { q: '', section: '', channel: '', type: '', watchlistOnly: false, watchedOnly: false },
    watchlist: new Set(JSON.parse(localStorage.getItem('dive:watchlist') || '[]')),
    watched: new Set(JSON.parse(localStorage.getItem('dive:watched') || '[]')),
  // Default to dark mode unless explicitly overridden
  theme: localStorage.getItem('dive:theme') || 'dark',
  study: { avg: 10, budget: 60, watchlistOnly: false }
  };

  // Cookies for GH Pages persistence
  function setCookie(name, value, days) {
    const exp = new Date(); exp.setTime(exp.getTime() + (days*24*60*60*1000));
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;
  }
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function persist() {
    const wl = JSON.stringify(Array.from(state.watchlist));
    const wd = JSON.stringify(Array.from(state.watched));
    localStorage.setItem('dive:watchlist', wl);
    localStorage.setItem('dive:watched', wd);
    setCookie('dive_watchlist', wl, 180);
    setCookie('dive_watched', wd, 180);
    // Persist study plan settings
    try {
      const study = JSON.stringify(state.study);
      localStorage.setItem('dive:study', study);
      setCookie('dive_study', study, 180);
    } catch {}
  }
  (function loadCookies(){
    try { const wl = getCookie('dive_watchlist'); if (wl) JSON.parse(wl).forEach(id => state.watchlist.add(id)); } catch{}
    try { const wd = getCookie('dive_watched'); if (wd) JSON.parse(wd).forEach(id => state.watched.add(id)); } catch{}
    // Restore study plan
    try {
      const st = getCookie('dive_study') || localStorage.getItem('dive:study');
      if (st) {
        const s = JSON.parse(st);
        if (s && typeof s === 'object') {
          if (typeof s.avg === 'number') state.study.avg = s.avg;
          if (typeof s.budget === 'number') state.study.budget = s.budget;
          if (typeof s.watchlistOnly === 'boolean') state.study.watchlistOnly = s.watchlistOnly;
        }
      }
    } catch {}
    // Restore notes from cookie chunks into localStorage
    try { loadNotesFromCookies(); } catch {}
  })();

  // Chunked cookie persistence for notes
  function saveNotesToCookies() {
    try {
      const notes = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dive:notes:')) {
          const v = localStorage.getItem(key);
          if (v && String(v).trim()) {
            notes[key.slice('dive:notes:'.length)] = String(v);
          }
        }
      }
      const json = JSON.stringify(notes);
      // clear previous
      const prevParts = parseInt(getCookie('dive_notes_parts') || '0', 10);
      for (let i=0;i<prevParts;i++) setCookie('dive_notes_'+i, '', -1);
      setCookie('dive_notes_parts', '0', -1);
      if (!json || json === '{}') { return; }
      const maxChunk = 3500; // conservative per-cookie size
      const parts = Math.ceil(json.length / maxChunk);
      for (let i=0;i<parts;i++) {
        const slice = json.slice(i*maxChunk, (i+1)*maxChunk);
        setCookie('dive_notes_'+i, slice, 180);
      }
      setCookie('dive_notes_parts', String(parts), 180);
    } catch {}
  }
  function loadNotesFromCookies() {
    const parts = parseInt(getCookie('dive_notes_parts') || '0', 10);
    if (!parts || parts < 0 || parts > 50) return;
    let acc = '';
    for (let i=0;i<parts;i++) { const p = getCookie('dive_notes_'+i); if (p) acc += p; }
    if (!acc) return;
    try {
      const obj = JSON.parse(acc);
      Object.keys(obj).forEach(id => {
        const val = String(obj[id] || '');
        if (val) localStorage.setItem('dive:notes:'+id, val);
      });
    } catch {}
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    if (SELECTORS.themeToggle) {
      const isDark = state.theme === 'dark';
      SELECTORS.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      SELECTORS.themeToggle.textContent = `Dark mode: ${isDark ? 'On' : 'Off'}`;
      SELECTORS.themeToggle.title = 'Toggle dark mode';
    }
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dive:theme', state.theme);
    applyTheme();
  }

  function youTubeId(url) {
    try {
      const u = new URL(url, location.href);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      return null;
    } catch { return null; }
  }
  function youTubeThumb(url) {
    const id = youTubeId(url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  }

  function youTubePlaylistId(url) {
    try {
      const u = new URL(url, location.href);
      if (u.hostname.includes('youtube') && u.pathname === '/playlist') {
        return u.searchParams.get('list');
      }
      return null;
    } catch { return null; }
  }

  async function loadPlaylistVideos(item) {
    if (item.playlistVideos || !item.playlistId) return;
    if (!YT_API_KEY) { item.playlistVideos = []; item.playlistCount = 0; return; }
    let videos = [], token = '';
    try {
      do {
        const api = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${item.playlistId}&key=${YT_API_KEY}` + (token ? `&pageToken=${token}` : '');
        const res = await fetch(api);
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        data.items.forEach(v => { videos.push({ title: v.snippet.title, id: v.snippet.resourceId.videoId }); });
        item.playlistCount = data.pageInfo?.totalResults || videos.length;
        token = data.nextPageToken;
      } while(token);
    } catch (e) { console.error('Playlist fetch failed', e); }
    item.playlistVideos = videos;
  }

  async function togglePlaylist(item, listEl, btn, startLink) {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      btn.setAttribute('aria-expanded','false');
      listEl.hidden = true;
      startLink.style.display = 'none';
      const count = item.playlistCount || (item.playlistVideos ? item.playlistVideos.length : '');
      btn.textContent = `Show videos${count?` (${count})`:''}`;
      return;
    }
    btn.setAttribute('aria-expanded','true');
    listEl.hidden = false;
    await loadPlaylistVideos(item);
    listEl.innerHTML = '';
    (item.playlistVideos||[]).forEach(v => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `https://www.youtube.com/watch?v=${v.id}&list=${item.playlistId}`;
      a.target = '_blank'; a.rel='noopener noreferrer'; a.textContent = v.title;
      li.appendChild(a); listEl.appendChild(li);
    });
    if (item.playlistVideos && item.playlistVideos.length) {
      startLink.href = `https://www.youtube.com/watch?v=${item.playlistVideos[0].id}&list=${item.playlistId}`;
      startLink.style.display = 'inline';
    } else {
      listEl.innerHTML = '<li>Playlist details unavailable.</li>';
      startLink.style.display = 'none';
    }
    const count = item.playlistCount || (item.playlistVideos ? item.playlistVideos.length : '');
    btn.textContent = `Hide videos${count?` (${count})`:''}`;
  }

  function isSameOrigin(href) {
    try { const u = new URL(href, document.baseURI); return u.origin === location.origin; }
    catch { return false; }
  }

  function idFor(href, title) {
    return (href && href !== '#') ? 'vid:' + href : 'vid:' + title.trim().toLowerCase().replace(/\s+/g, '-');
  }

  function buildSections(items) {
    const bySection = items.reduce((acc, it) => {
      (acc[it.sectionCode] = acc[it.sectionCode] || { title: it.sectionTitle, code: it.sectionCode, items: [] }).items.push(it);
      return acc;
    }, {});
  const order = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    return order.filter(k => bySection[k]).map(k => bySection[k]);
  }

  function matchesFilters(item) {
    const f = state.filters;
    if (f.section && item.sectionCode !== f.section) return false;
    if (f.channel && item.channel !== f.channel) return false;
    if (f.type && item.type !== f.type) return false;
    if (f.watchlistOnly && !state.watchlist.has(item.id)) return false;
    if (f.watchedOnly && !state.watched.has(item.id)) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = (item.title + ' ' + (item.channel||'') + ' ' + (item.description||'')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function updateProgress(totalOverride, watchedOverride) {
    const total = totalOverride ?? state.items.length;
    const watched = watchedOverride ?? Array.from(state.watched).length;
    const pct = total ? Math.round((watched / total) * 100) : 0;
    if (SELECTORS.progressBar) SELECTORS.progressBar.style.width = pct + '%';
  }

  function ensureDeepLink() {
    if (location.hash) {
      const id = location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const card = el.closest('.card');
        if (card) {
          const orig = card.style.boxShadow;
          card.style.boxShadow = '0 0 0 3px #93c5fd';
          setTimeout(() => { card.style.boxShadow = orig; }, 1200);
        }
      }
    }
  }

  function updateUrlFromFilters(replace=true) {
    const p = new URLSearchParams();
    const f = state.filters;
    if (f.q) p.set('q', f.q);
    if (f.section) p.set('s', f.section);
    if (f.channel) p.set('c', f.channel);
    if (f.type) p.set('t', f.type);
    if (f.watchlistOnly) p.set('wl', '1');
    if (f.watchedOnly) p.set('wd', '1');
    const url = location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash;
    (replace ? history.replaceState : history.pushState).call(history, null, '', url);
  }
  function applyFiltersFromUrl() {
    const p = new URLSearchParams(location.search);
    state.filters.q = p.get('q') || '';
    state.filters.section = p.get('s') || '';
    state.filters.channel = p.get('c') || '';
    state.filters.type = p.get('t') || '';
    state.filters.watchlistOnly = p.get('wl') === '1';
    state.filters.watchedOnly = p.get('wd') === '1';
    if (SELECTORS.search) SELECTORS.search.value = state.filters.q;
    if (SELECTORS.filterSection) SELECTORS.filterSection.value = state.filters.section;
    if (SELECTORS.filterChannel) SELECTORS.filterChannel.value = state.filters.channel;
    if (SELECTORS.filterType) SELECTORS.filterType.value = state.filters.type;
    if (SELECTORS.filterWatchlist) SELECTORS.filterWatchlist.setAttribute('aria-pressed', String(state.filters.watchlistOnly));
    if (SELECTORS.filterWatched) SELECTORS.filterWatched.setAttribute('aria-pressed', String(state.filters.watchedOnly));
  }

  function updateTocChips(perSection) {
    const toc = SELECTORS.tocEl; if (!toc) return;
    const links = Array.from(toc.querySelectorAll('a[href^="#section-"]'));
    links.forEach(a => {
  const m = a.getAttribute('href').match(/^#section-([A-L])$/);
      if (!m) return;
      const code = m[1];
      const data = perSection[code] || { total: 0, watched: 0 };
      let chip = a.querySelector('.chip-mini');
      if (!chip) { chip = document.createElement('span'); chip.className = 'chip-mini'; a.appendChild(chip); }
      chip.textContent = data.total ? `${data.watched}/${data.total}` : '0/0';
    });
  }

  function render() {
    if (!state.items.length) return;
    SELECTORS.content.innerHTML = '';
    const sections = buildSections(state.items);
    let total = 0, watched = 0;
    const perSection = sections.reduce((acc, s) => {
      const items = state.items.filter(it => it.sectionCode === s.code);
      const w = items.filter(it => state.watched.has(it.id)).length;
      acc[s.code] = { total: items.length, watched: w };
      return acc;
    }, {});
    sections.forEach(section => {
      const secEl = document.createElement('section');
      secEl.className = 'section';
      secEl.id = 'section-' + section.code;
      const head = document.createElement('div'); head.className = 'section-head';
      const h = document.createElement('h3'); h.textContent = section.code + ') ' + section.title;
      const line = document.createElement('div'); line.className = 'progress-line';
      const fill = document.createElement('div'); fill.className = 'progress-fill';
      const meta = perSection[section.code] || { total: 0, watched: 0 };
      const pct = meta.total ? Math.round((meta.watched/meta.total)*100) : 0; fill.style.width = pct + '%';
      line.appendChild(fill); head.appendChild(h); head.appendChild(line); secEl.appendChild(head);

      // Resources strip (optional)
      if (state.resources && state.resources[section.code] && state.resources[section.code].length) {
        const resWrap = document.createElement('div'); resWrap.className = 'resources';
        state.resources[section.code].forEach(r => {
          const a = document.createElement('a');
          a.className = 'res-link';
          a.href = r.href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = r.title;
          const downloadable = isSameOrigin(r.href);
          if (downloadable) {
            a.setAttribute('download', '');
            a.classList.add('download');
            a.title = 'Download resource';
            a.setAttribute('aria-label', `Download resource: ${r.title}`);
            // Do not open downloads in a new tab
            a.removeAttribute('target');
            a.removeAttribute('rel');
          } else {
            a.title = 'Open resource';
            a.setAttribute('aria-label', `Open resource: ${r.title}`);
          }
          resWrap.appendChild(a);
        });
        secEl.appendChild(resWrap);
      }

      const grid = document.createElement('div'); grid.className = 'grid';
      section.items.forEach(item => {
        total += 1; const isWatched = state.watched.has(item.id); if (isWatched) watched += 1;
        if (!matchesFilters(item)) return;
        const card = document.createElement('article'); card.className = 'card'; card.setAttribute('data-id', item.id); card.setAttribute('data-section', item.sectionCode); card.setAttribute('data-channel', item.channel);
        const thumbUrl = youTubeThumb(item.href);
        if (thumbUrl) {
          const img = document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.src = thumbUrl; img.alt=''; img.className='thumb';
          if (item.href && item.href !== '#') {
            const linkThumb = document.createElement('a'); linkThumb.href=item.href; linkThumb.target='_blank'; linkThumb.rel='noopener noreferrer'; linkThumb.appendChild(img); card.appendChild(linkThumb);
          } else {
            card.appendChild(img);
          }
        }
  const t = document.createElement('h4'); t.className = 'title'; const a = document.createElement('a'); a.href=item.href||'#'; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=item.title; a.id=item.id;
  if (!item.href || item.href === '#') { a.classList.add('disabled'); a.removeAttribute('target'); a.removeAttribute('rel'); a.href = 'javascript:void(0)'; }
  t.appendChild(a);
  const metaEl = document.createElement('div'); metaEl.className='meta'; const chip = document.createElement('span'); chip.className='chip'; chip.textContent=item.channel||'Channel'; metaEl.appendChild(chip);
  const desc = document.createElement('div'); desc.className='desc'; desc.textContent=item.description||'';
        let playlistWrap;
        if (item.type === 'playlist') {
          playlistWrap = document.createElement('div'); playlistWrap.className = 'playlist-wrap';
          const btnPl = document.createElement('button'); btnPl.className='btn'; btnPl.type='button'; btnPl.textContent='Show videos'; btnPl.setAttribute('aria-expanded','false');
          const startLink = document.createElement('a'); startLink.className='start-playlist'; startLink.target='_blank'; startLink.rel='noopener noreferrer'; startLink.style.display='none'; startLink.textContent='Start playlist';
          const list = document.createElement('ol'); list.hidden = true;
          btnPl.addEventListener('click', () => togglePlaylist(item, list, btnPl, startLink));
          playlistWrap.appendChild(btnPl); playlistWrap.appendChild(startLink); playlistWrap.appendChild(list);
        }
        const actions = document.createElement('div'); actions.className='actions';
        const btnSave = document.createElement('button'); btnSave.className='btn'; btnSave.type='button'; btnSave.setAttribute('aria-pressed', state.watchlist.has(item.id)?'true':'false'); btnSave.textContent = state.watchlist.has(item.id)?'Saved':'Add to Watchlist';
        btnSave.addEventListener('click', () => { const pressed = btnSave.getAttribute('aria-pressed')==='true'; if (pressed) state.watchlist.delete(item.id); else state.watchlist.add(item.id); btnSave.setAttribute('aria-pressed', String(!pressed)); btnSave.textContent = !pressed ? 'Saved' : 'Add to Watchlist'; persist(); });
        const btnWatched = document.createElement('button'); btnWatched.className='btn'; btnWatched.type='button'; btnWatched.setAttribute('aria-pressed', isWatched?'true':'false'); btnWatched.textContent = isWatched ? 'Watched' : 'Mark Watched';
        btnWatched.addEventListener('click', () => {
          const pressed = btnWatched.getAttribute('aria-pressed')==='true'; if (pressed) state.watched.delete(item.id); else state.watched.add(item.id);
          btnWatched.setAttribute('aria-pressed', String(!pressed)); btnWatched.textContent = !pressed ? 'Watched' : 'Mark Watched'; persist(); updateProgress();
          const s = card.closest('.section'); if (s) { const code = item.sectionCode; const itemsInSection = state.items.filter(it => it.sectionCode === code); const watchedInSection = itemsInSection.filter(it => state.watched.has(it.id)).length; const f = s.querySelector('.progress-fill'); if (f) f.style.width = (itemsInSection.length? Math.round((watchedInSection/itemsInSection.length)*100):0) + '%'; }
          const tocLink = document.querySelector('#toc a[href="#section-'+item.sectionCode+'"]'); if (tocLink) { let chip = tocLink.querySelector('.chip-mini'); if (!chip) { chip = document.createElement('span'); chip.className = 'chip-mini'; tocLink.appendChild(chip); } const itemsInSection = state.items.filter(it => it.sectionCode === item.sectionCode); const watchedInSection = itemsInSection.filter(it => state.watched.has(it.id)).length; chip.textContent = `${watchedInSection}/${itemsInSection.length}`; }
        });
        const btnNotes = document.createElement('button'); btnNotes.className='btn'; btnNotes.type='button'; btnNotes.textContent='Notes'; btnNotes.setAttribute('aria-expanded','false');
        const notesWrap = document.createElement('div'); notesWrap.className='notes'; notesWrap.hidden = true; const ta = document.createElement('textarea'); ta.placeholder='Your notes (saved locally)…'; ta.value = (localStorage.getItem('dive:notes:'+item.id)||'');
        let notesSaveTimer;
        ta.addEventListener('input', () => {
          const val = String(ta.value).replace(/[\u0000-\u001F\u007F]/g,'');
          localStorage.setItem('dive:notes:'+item.id, val);
          clearTimeout(notesSaveTimer);
          notesSaveTimer = setTimeout(saveNotesToCookies, 400);
        });
        notesWrap.appendChild(ta);
        btnNotes.addEventListener('click', () => { const expanded = btnNotes.getAttribute('aria-expanded')==='true'; btnNotes.setAttribute('aria-expanded', String(!expanded)); notesWrap.hidden = expanded; });
        actions.appendChild(btnSave); actions.appendChild(btnWatched); actions.appendChild(btnNotes);
        card.appendChild(t); card.appendChild(metaEl); card.appendChild(desc); if (playlistWrap) card.appendChild(playlistWrap); card.appendChild(actions); card.appendChild(notesWrap); grid.appendChild(card);
      });
      secEl.appendChild(grid); SELECTORS.content.appendChild(secEl);
    });
    updateProgress(total, watched); ensureDeepLink(); const cards = Array.from(document.querySelectorAll('.card')); cards.forEach((c,i)=>{ c.tabIndex = (i===0?0:-1); }); updateTocChips(perSection);
  }

  function populateChannelFilter() {
    const sel = SELECTORS.filterChannel; if (!sel) return;
    const channels = Array.from(state.channels).sort((a,b)=>a.localeCompare(b));
    channels.forEach(ch => { const opt = document.createElement('option'); opt.value = ch; opt.textContent = ch; sel.appendChild(opt); });
  }

  function setUpControls() {
    SELECTORS.search?.addEventListener('input', e => { state.filters.q = e.target.value.trim(); render(); updateUrlFromFilters(); });
    SELECTORS.filterSection?.addEventListener('change', e => { state.filters.section = e.target.value; render(); updateUrlFromFilters(); });
    SELECTORS.filterChannel?.addEventListener('change', e => { state.filters.channel = e.target.value; render(); updateUrlFromFilters(); });
    SELECTORS.filterType?.addEventListener('change', e => { state.filters.type = e.target.value; render(); updateUrlFromFilters(); });
    SELECTORS.filterWatchlist?.addEventListener('click', () => { state.filters.watchlistOnly = !state.filters.watchlistOnly; SELECTORS.filterWatchlist.setAttribute('aria-pressed', String(state.filters.watchlistOnly)); render(); updateUrlFromFilters(); });
    SELECTORS.filterWatched?.addEventListener('click', () => { state.filters.watchedOnly = !state.filters.watchedOnly; SELECTORS.filterWatched.setAttribute('aria-pressed', String(state.filters.watchedOnly)); render(); updateUrlFromFilters(); });
    window.addEventListener('hashchange', ensureDeepLink);
    window.addEventListener('keydown', (e) => { if (e.key === '/') { e.preventDefault(); SELECTORS.search?.focus(); } });
    // Export notes
    document.getElementById('export-notes')?.addEventListener('click', exportNotes);
  // Export/Import state (removed)
  // Theme
  SELECTORS.themeToggle?.addEventListener('click', toggleTheme);
  // Study plan setup (hidden behind feature flag)
  if (ENABLE_STUDY_PLAN) { setupStudyPlan(); }
  }

  function setupStudyPlan() {
    // Inject a simple study panel below the toolbar
  const toolbar = document.querySelector('.toolbar'); if (!toolbar) return;
    const panel = document.createElement('div'); panel.className = 'study'; panel.setAttribute('role','region'); panel.setAttribute('aria-label','Study plan');
    panel.innerHTML = `
      <div class="row">
        <button id="study-toggle" class="pill" type="button" aria-pressed="false">Study Plan</button>
    <label>Avg minutes/video <input id="study-avg" type="number" min="1" value="${state.study.avg}"></label>
        <span>Budget:</span>
        <button class="pill" data-budget="30" type="button">30</button>
        <button class="pill" data-budget="60" type="button">60</button>
        <button class="pill" data-budget="90" type="button">90</button>
    <label>Custom <input id="study-budget" type="number" min="1" value="${state.study.budget}"></label>
    <label><input id="study-watchlist-only" type="checkbox" ${state.study.watchlistOnly ? 'checked' : ''}> Watchlist only</label>
        <button id="study-copy" class="pill" type="button">Copy Plan</button>
      </div>
      <div id="study-result" class="result" aria-live="polite"></div>
    `;
    toolbar.appendChild(panel);
    const avgEl = panel.querySelector('#study-avg');
    const budgetEl = panel.querySelector('#study-budget');
    const wlOnlyEl = panel.querySelector('#study-watchlist-only');
    const resultEl = panel.querySelector('#study-result');
    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.matches('[data-budget]')) { budgetEl.value = t.getAttribute('data-budget'); update(); }
      if (t.id === 'study-copy') { copyPlan(); }
    });
  [avgEl, budgetEl, wlOnlyEl].forEach(el => el.addEventListener('input', update));
    update();

    function currentList() {
      const list = state.items.filter(it => matchesFilters(it));
      return wlOnlyEl.checked ? list.filter(it => state.watchlist.has(it.id)) : list;
    }
    function update() {
      const avg = Math.max(1, parseInt(avgEl.value||'10',10));
      const budget = Math.max(1, parseInt(budgetEl.value||'60',10));
      const list = currentList();
      const totalEst = list.length * avg;
      const fit = Math.max(0, Math.floor(budget / avg));
  resultEl.textContent = `${list.length} videos × ${avg} min ≈ ${totalEst} min total. Fits ~${fit} in ${budget} min.`;
  // persist study values
  state.study.avg = avg; state.study.budget = budget; state.study.watchlistOnly = wlOnlyEl.checked; persist();
    }
    function copyPlan() {
      const avg = Math.max(1, parseInt(avgEl.value||'10',10));
      const budget = Math.max(1, parseInt(budgetEl.value||'60',10));
      const list = currentList();
      const fit = Math.max(0, Math.floor(budget / avg));
      const chosen = list.slice(0, fit);
      const md = chosen.map(it => `- [${it.title}](${it.href})`).join('\n') || '*No items in plan*';
      navigator.clipboard?.writeText(md).then(()=>{ resultEl.textContent += ' (Plan copied)'; });
    }
  }

  function exportNotes() {
    const parts = [];
    state.items.forEach(it => { const key = 'dive:notes:'+it.id; const val = localStorage.getItem(key); if (val && val.trim()) { parts.push(`- [${it.title}](${it.href})\n\n${val.trim()}\n`); } });
    const blob = new Blob([parts.join('\n') || '# No notes yet'], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'dive-notes.md'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 500);
  }
  // exportState / import handlers removed

  async function loadData() {
    let data;
    try {
      const videosUrl = new URL('assets/data/videos.json', document.baseURI);
      videosUrl.searchParams.set('v', VERSION);
      const res = await fetch(videosUrl.toString());
      if (!res.ok) throw new Error('HTTP '+res.status);
      data = await res.json();
    } catch (e) {
      const inline = document.getElementById('videos-inline');
  if (!inline) { throw e; }
  const txt = (inline.textContent || '').trim();
  if (!txt || txt === '$VIDEOS' || !txt.startsWith('{')) { throw e; }
  try { data = JSON.parse(txt); }
  catch (_) { throw e; }
    }
    // normalize into flat items list
    data.sections.forEach(sec => {
      sec.items.forEach(it => {
        const id = idFor(it.href, it.title);
        const pid = youTubePlaylistId(it.href);
        const item = { id, sectionCode: sec.code, sectionTitle: sec.title, title: it.title, href: it.href, channel: it.channel, description: it.description, type: pid ? 'playlist' : 'video', playlistId: pid };
        state.items.push(item);
  if (item.channel) { state.channels.add(item.channel); }
      });
    });
    // Load optional resources per section
    try {
      const resourcesUrl = new URL('assets/data/resources.json', document.baseURI);
      resourcesUrl.searchParams.set('v', VERSION);
      const res2 = await fetch(resourcesUrl.toString());
  if (!res2.ok) { throw new Error('HTTP '+res2.status); }
      state.resources = await res2.json();
    } catch(e) {
      const inlineR = document.getElementById('resources-inline');
      if (inlineR) {
        try {
          const txt = (inlineR.textContent || '').trim();
          state.resources = (!txt || txt === '$RES' || !txt.startsWith('{')) ? {} : JSON.parse(txt);
        } catch { state.resources = {}; }
      } else { state.resources = {}; }
    }
  }

  function populateTOCAnchors() {
    // Ensure destination anchors exist in content for deep links
  const order = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    order.forEach(code => {
      if (!document.getElementById('section-'+code)) {
        const div = document.createElement('div'); div.id = 'section-'+code; div.className = 'sr-only'; div.setAttribute('aria-hidden','true'); document.body.appendChild(div);
      }
    });
  }

  async function bootstrap() {
    document.documentElement.classList.add('js');
    setUpControls(); applyTheme();
    // Mobile TOC toggle
    const tocToggle = document.querySelector('.toc-toggle');
    const tocList = document.getElementById('toc-list');
    if (tocToggle && tocList) {
      tocToggle.addEventListener('click', () => {
        const expanded = tocToggle.getAttribute('aria-expanded') === 'true';
        tocToggle.setAttribute('aria-expanded', String(!expanded));
        tocList.style.display = expanded ? 'none' : '';
      });
    }
    try {
      await loadData();
      SELECTORS.loading?.remove();
      populateChannelFilter(); applyFiltersFromUrl(); render(); updateUrlFromFilters(true); updateProgress(); populateTOCAnchors();
      // Mirror any existing notes from localStorage to cookies after first render
      saveNotesToCookies();
    } catch (e) {
      console.error('Failed to load data', e);
  if (SELECTORS.loading) { SELECTORS.loading.textContent = 'Failed to load videos.'; }
    }
    // Before unload, persist state and notes mirror
    window.addEventListener('beforeunload', () => { try { persist(); saveNotesToCookies(); } catch {} });
  }

  bootstrap();
})();
