/* Editorial / Purple sibling site — page bootstrap */
(function(){

  // ---------- Skip link ----------
  (function injectSkipLink(){
    if (document.querySelector('.skip-link')) return;
    const main = document.querySelector('main, [role="main"], .shell');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = 'Skip to main content';
    document.body.insertBefore(a, document.body.firstChild);
  })();

  // ---------- Year stamp ----------
  // Only target empty <span data-year-now> elements so we don't clobber
  // the data-year attributes used by the publications filter (where each
  // <li class="pub-item" data-year="2025"> tags its year for filtering).
  document.querySelectorAll('[data-year-now]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // ---------- Theme (shares localStorage key with production site) ----------
  const themes = ['dark','light'];
  const root = document.documentElement;
  const themeBtn = document.querySelector('[data-theme-toggle]');
  function applyTheme(t){
    if (!themes.includes(t)) t = 'light';
    root.setAttribute('data-theme', t);
    try{ localStorage.setItem('theme', t); }catch(e){}
    if (themeBtn){
      const next = themes[(themes.indexOf(t) + 1) % themes.length];
      themeBtn.setAttribute('aria-label', `Switch to ${next} mode`);
      const lbl = themeBtn.querySelector('[data-theme-label]');
      if (lbl) lbl.textContent = next === 'dark' ? 'Go dark' : 'Go light';
    }
  }
  let saved = null;
  try{ saved = localStorage.getItem('theme'); }catch(e){}
  // Default to DARK for new visitors. Existing users keep their saved preference
  // (shared with the production site via the same `theme` key).
  applyTheme(saved || 'dark');
  if (themeBtn){
    themeBtn.addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') || 'light';
      const next = themes[(themes.indexOf(cur) + 1) % themes.length];
      applyTheme(next);
    });
  }

  // ---------- Mark current nav link ----------
  const here = (location.pathname || '').replace(/\/+$/, '').split('/').pop() || 'index.html';
  document.querySelectorAll('.masthead a').forEach(a => {
    const href = (a.getAttribute('href') || '').split('/').pop();
    if (href && href === here) a.setAttribute('aria-current', 'page');
  });

  // ---------- Mobile FAB → open bay sheet ----------
  const fab = document.querySelector('[data-bay-open]');
  const close = document.querySelector('[data-bay-close]');
  function openBay(){
    document.body.classList.add('bay-open');
    if (fab) fab.setAttribute('aria-expanded', 'true');
  }
  function closeBay(){
    document.body.classList.remove('bay-open');
    if (fab) fab.setAttribute('aria-expanded', 'false');
  }
  if (fab) fab.addEventListener('click', openBay);
  if (close) close.addEventListener('click', closeBay);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('bay-open')) closeBay();
  });
  // Tap on backdrop closes (the body::after)
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('bay-open')) return;
    if (e.target === document.body) closeBay();
  });

  // ---------- Custom cursor ----------
  (() => {
    const c = document.querySelector('.cursor');
    if (!c || matchMedia('(pointer: coarse)').matches) return;
    let tx = innerWidth/2, ty = innerHeight/2, cx = tx, cy = ty, active = false;

    document.addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      if (!active){ cx = tx; cy = ty; active = true; }
      c.classList.remove('is-hidden');
    });
    document.addEventListener('mouseleave', () => c.classList.add('is-hidden'));
    document.addEventListener('mouseenter', () => c.classList.remove('is-hidden'));

    function tick(){
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      c.style.setProperty('--cursor-x', cx + 'px');
      c.style.setProperty('--cursor-y', cy + 'px');
      requestAnimationFrame(tick);
    }
    tick();

    document.querySelectorAll('a, button, [role="button"]').forEach(el => {
      el.addEventListener('mouseenter', () => c.classList.add('is-link'));
      el.addEventListener('mouseleave', () => c.classList.remove('is-link'));
    });
  })();

  // ---------- Reveal on scroll ----------
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.10, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal, .stagger').forEach(el => io.observe(el));

  // ---------- Improve <model-viewer> a11y ----------
  document.querySelectorAll('model-viewer').forEach(mv => {
    if (!mv.hasAttribute('alt')) mv.setAttribute('alt', "Animated 3D avatar of Amir Goli");
    if (!mv.hasAttribute('aria-label')) mv.setAttribute('aria-label', "3D avatar of Amir Goli");
  });

  // ---------- Publication filtering (only on publications.html) ----------
  const pubList = document.getElementById('pubList');
  if (pubList){
    const items = Array.from(pubList.querySelectorAll('.pub-item'));
    const empty = document.getElementById('pubEmpty');
    const state = { type: 'all', year: 'all' };
    const counts = { all: items.length, journal:0, conference:0, chapter:0, poster:0 };
    items.forEach(it => { const t = it.dataset.type; if (counts[t] !== undefined) counts[t]++; });
    Object.entries(counts).forEach(([k, v]) => {
      const el = document.querySelector(`[data-count-${k}]`);
      if (el) el.textContent = v;
    });
    function apply(){
      let visible = 0;
      items.forEach(it => {
        const ok = (state.type === 'all' || it.dataset.type === state.type)
                && (state.year === 'all' || it.dataset.year === state.year);
        it.hidden = !ok;
        if (ok) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    }
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter, v = chip.dataset.value;
        state[f] = v;
        document.querySelectorAll(`.chip[data-filter="${f}"]`).forEach(c => {
          const active = c.dataset.value === v;
          c.classList.toggle('is-active', active);
          c.setAttribute('aria-pressed', String(active));
        });
        apply();
      });
    });
  }
})();
