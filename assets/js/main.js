/* Editorial / Purple sibling site — page bootstrap + Swup soft-nav.
 *
 * Why Swup: the assistant bay (`<aside class="bay">`) on the left holds a
 * 5+ MB GLB avatar, an open AudioContext, microphone permission, and a
 * persisted chat panel. Hard-navigating between pages tore all that down on
 * every click. Swup intercepts link clicks, fetches the next page's HTML,
 * and swaps only `<main class="shell">` — the bay (which is OUTSIDE that
 * container) keeps running across navigations. The avatar never re-mounts;
 * the audio context never re-resumes; the chat scrollback stays intact.
 */
(function(){

  // ============================================================
  // ONE-TIME SETUP — runs exactly once on first page load.
  // The bay, fab, cursor, and document-level listeners live outside the
  // swap container, so binding them here is enough — they survive nav.
  // ============================================================

  // ---------- Skip link ----------
  (function injectSkipLink(){
    if (document.querySelector('.skip-link')) return;
    const main = document.querySelector('main, [role="main"], .shell');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#main-content';
    a.textContent = 'Skip to main content';
    document.body.insertBefore(a, document.body.firstChild);
  })();

  // ---------- Theme (shares localStorage key with production site) ----------
  const themes = ['dark','light'];
  const root = document.documentElement;
  function applyTheme(t){
    if (!themes.includes(t)) t = 'light';
    root.setAttribute('data-theme', t);
    try{ localStorage.setItem('theme', t); }catch(e){}
    // Refresh the toggle's label (the button itself is rebound per-page).
    const themeBtn = document.querySelector('[data-theme-toggle]');
    if (themeBtn){
      const next = themes[(themes.indexOf(t) + 1) % themes.length];
      themeBtn.setAttribute('aria-label', `Switch to ${next} mode`);
      const lbl = themeBtn.querySelector('[data-theme-label]');
      if (lbl) lbl.textContent = next === 'dark' ? 'Go dark' : 'Go light';
    }
  }
  let saved = null;
  try{ saved = localStorage.getItem('theme'); }catch(e){}
  applyTheme(saved || 'dark');

  // ---------- Mobile FAB → open bay sheet ----------
  // The FAB and the bay live outside `<main class="shell">`, so these
  // listeners survive page swaps without rebinding.
  const fab = document.querySelector('[data-bay-open]');
  const closeBtn = document.querySelector('[data-bay-close]');
  function openBay(){
    document.body.classList.add('bay-open');
    if (fab) fab.setAttribute('aria-expanded', 'true');
  }
  function closeBay(){
    document.body.classList.remove('bay-open');
    if (fab) fab.setAttribute('aria-expanded', 'false');
  }
  if (fab) fab.addEventListener('click', openBay);
  if (closeBtn) closeBtn.addEventListener('click', closeBay);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('bay-open')) closeBay();
  });
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('bay-open')) return;
    if (e.target === document.body) closeBay();
  });

  // ---------- Custom cursor ----------
  // Hover state uses event delegation rather than per-element listeners,
  // so links/buttons added by Swup swaps still trigger the link styling.
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

    document.addEventListener('mouseover', e => {
      if (e.target.closest && e.target.closest('a, button, [role="button"]')) c.classList.add('is-link');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest && e.target.closest('a, button, [role="button"]')) c.classList.remove('is-link');
    });
  })();

  // ============================================================
  // PER-PAGE BOOTSTRAP — runs on first load and after every Swup swap.
  // Anything that binds to elements *inside* `<main class="shell">` must
  // re-run on each swap, because Swup replaces that subtree.
  // ============================================================
  function bootstrap(){
    const main = document.querySelector('main.shell');
    if (main && !main.id) main.id = 'main-content';

    // Year stamp
    document.querySelectorAll('[data-year-now]').forEach(el => {
      el.textContent = new Date().getFullYear();
    });

    // Theme toggle (the button is inside the masthead, which is inside the
    // swap container, so we get a fresh node on every page).
    const themeBtn = document.querySelector('[data-theme-toggle]');
    if (themeBtn && !themeBtn.dataset.bound){
      themeBtn.dataset.bound = '1';
      themeBtn.addEventListener('click', () => {
        const cur = root.getAttribute('data-theme') || 'light';
        const next = themes[(themes.indexOf(cur) + 1) % themes.length];
        applyTheme(next);
      });
    }
    // Sync the new button's label with the active theme.
    applyTheme(root.getAttribute('data-theme') || 'dark');

    // Mark current nav link.
    // Compare full normalized pathnames, not just the last segment —
    // otherwise "/index.html" and "/projects/index.html" both end in
    // "index.html" and both get marked current on the home page.
    const normalize = (p) => {
      p = p.replace(/\/+$/, '');
      if (!p || p === '') return '/index.html';
      if (!/\.[a-z]+$/i.test(p)) return p + '/index.html';
      return p;
    };
    const here = normalize(location.pathname);
    document.querySelectorAll('.masthead a').forEach(a => {
      a.removeAttribute('aria-current');
      if (!a.href) return;
      try {
        const linkPath = normalize(new URL(a.href).pathname);
        if (linkPath === here) a.setAttribute('aria-current', 'page');
      } catch {}
    });

    // model-viewer a11y (covers any future inline embeds inside content)
    document.querySelectorAll('main model-viewer').forEach(mv => {
      if (!mv.hasAttribute('alt')) mv.setAttribute('alt', "Animated 3D avatar of Amir Goli");
      if (!mv.hasAttribute('aria-label')) mv.setAttribute('aria-label', "3D avatar of Amir Goli");
    });

    // Reveal-on-scroll. Scope to `<main>` so we don't re-observe bay
    // elements, and skip anything already revealed.
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting){
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('main .reveal:not(.is-in), main .stagger:not(.is-in)').forEach(el => io.observe(el));

    // Publication filtering (only on publications.html)
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
  }

  // First-load bootstrap
  bootstrap();

  // ============================================================
  // SWUP — soft navigation that keeps the bay alive.
  // Loaded as a UMD <script> tag in each page; if the CDN fails, links
  // fall back to normal full-page navigation automatically.
  // ============================================================
  if (typeof Swup !== 'undefined'){
    let swup;
    try {
      swup = new Swup({
        containers: ['main.shell'],
        animationSelector: 'main.shell',
      });
    } catch (e) {
      console.warn('[swup] init failed — falling back to hard navigation:', e);
      return;
    }

    // If anything goes wrong mid-navigation (e.g. the fetched page returns
    // 404, the destination has no matching `main.shell`, network errors
    // out, etc.), fall back to a normal full-page navigation instead of
    // leaving the user stuck on a half-faded screen. We hook into both
    // `fetch:error` (HTTP-status failures, runs before the abort) and
    // `visit:abort` (any other reason a visit halts).
    function fallback(visit){
      const url = visit?.to?.url;
      if (url && url !== window.location.href){
        window.location.href = url;
      }
    }
    swup.hooks.on('fetch:error', (visit) => {
      console.warn('[swup] fetch error, hard-navigating to', visit?.to?.url);
      fallback(visit);
    });
    swup.hooks.on('visit:abort', (visit) => {
      console.warn('[swup] visit aborted, hard-navigating to', visit?.to?.url);
      fallback(visit);
    });

    swup.hooks.on('content:replace', () => {
      try { bootstrap(); }
      catch (e) { console.error('[swup] bootstrap failed:', e); }
      // Close the mobile sheet if the user navigated from inside it.
      closeBay();
      // Reset scroll (Swup's default preserves the previous scroll
      // position, which feels wrong here).
      window.scrollTo(0, 0);
    });
  }
})();
