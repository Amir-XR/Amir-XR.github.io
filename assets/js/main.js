(function(){
  const btn = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if(btn && nav){
    btn.addEventListener('click', () => {
      const isOpen = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!isOpen));
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  // Mark current page in nav (robust across subfolders)
  const currentPath = (location.pathname || '').replace(/\/+$/, '');
  document.querySelectorAll('.nav a').forEach(a => {
    try{
      const linkPath = new URL(a.getAttribute('href') || '', location.href).pathname.replace(/\/+$/, '');
      if(linkPath && currentPath && linkPath === currentPath){
        a.setAttribute('aria-current','page');
      }
    }catch(e){}
  });

  // Theme (Light / Dark)
  const themes = ['dark','light'];
  const root = document.documentElement;
  const themeBtn = document.querySelector('[data-theme-toggle]');
  const themeLabel = document.querySelector('[data-theme-label]');
  function pretty(t){return t.charAt(0).toUpperCase() + t.slice(1);}
  function applyTheme(t){
    if(!themes.includes(t)) t = 'dark';
    root.setAttribute('data-theme', t);
    try{ localStorage.setItem('theme', t); }catch(e){}
    if(themeLabel) themeLabel.textContent = `Theme: ${pretty(t)}`;
  }
  let saved = null;
  try{ saved = localStorage.getItem('theme'); }catch(e){}
  applyTheme(saved || 'dark');
  if(themeBtn){
    themeBtn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') || 'light';
      const idx = themes.indexOf(current);
      const next = themes[(idx + 1) % themes.length];
      applyTheme(next);
    });
  }

  // Interactive hover (subtle glow + tilt for cards)
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if(canHover){
    // Add hover treatment
    document.querySelectorAll('.card, .pub, .stat, .meta-pill').forEach(el => {
      el.classList.add('interactive');
    });

    // Tilt effect for key blocks
    const tiltEls = document.querySelectorAll('a.card, .pub, .pub-cats .card');
    tiltEls.forEach(el => {
      el.classList.add('tilt');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const mx = (x / r.width) * 100;
        const my = (y / r.height) * 100;
        const dx = (x - r.width / 2) / (r.width / 2);
        const dy = (y - r.height / 2) / (r.height / 2);
        const rx = (-dy * 4).toFixed(2);
        const ry = (dx * 6).toFixed(2);
        el.style.setProperty('--mx', `${mx}%`);
        el.style.setProperty('--my', `${my}%`);
        el.style.setProperty('--rx', `${rx}deg`);
        el.style.setProperty('--ry', `${ry}deg`);
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }
})();
