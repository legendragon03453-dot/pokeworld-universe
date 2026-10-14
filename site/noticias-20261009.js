/* =====================================================================
   POKEWORLD UNIVERSE — Portal de notícias
   Páginas: noticias.html (data-page="noticias") e matérias no mesmo visual
   (data-page="noticia-portal"). Destaque, últimas, promo, arquivo com filtros,
   "Olha que incrível", mais notícias, compartilhar e animações de entrada.
   Lê as notícias do PWU.store (Supabase) ou do data.js, como o pages.js.
   ===================================================================== */
(function () {
  'use strict';
  var page = document.body.dataset.page;
  if (page !== 'noticias' && page !== 'noticia-portal') return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G = window.gsap && !reduce ? window.gsap : null;
  var ST = G && window.ScrollTrigger ? window.ScrollTrigger : null;
  if (G && ST) { G.registerPlugin(ST); document.documentElement.classList.add('has-gsap'); }
  var STEP = 9;
  var currentSlug = document.body.dataset.slug || new URLSearchParams(location.search).get('id') || '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function imageUrl(value) {
    try {
      var url = new URL(String(value || ''), location.href);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return esc(url.href);
    } catch (_) { return ''; }
  }
  function NEWS() { return (window.PWU && PWU.store) ? PWU.store.news() : (window.PWU && PWU.news) || []; }
  function whenReady(fn) { if (window.PWU && PWU.store) PWU.store.ready.then(fn); else fn(); }
  function href(n) { return n.url ? esc(n.url) : 'noticia.html?id=' + encodeURIComponent(n.slug); }
  function fmtDate(iso) { return (window.PWU && PWU.fmtDate) ? PWU.fmtDate(iso) : iso; }
  function shortDate(iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }
  function minutes(n) { var len = (n.body || []).concat([n.excerpt || '']).join(' ').length; return Math.max(2, Math.round(len / 900)); }
  function byDateDesc(a, b) { return ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || String(b.date).localeCompare(String(a.date)); } // fixadas primeiro
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function highlight(n) {
    var title = esc(n.title);
    if (n.highlight) {
      var i = n.title.toLowerCase().indexOf(String(n.highlight).toLowerCase());
      if (i > -1) title = esc(n.title.slice(0, i)) + '<span class="grad">' + esc(n.title.slice(i, i + n.highlight.length)) + '</span>' + esc(n.title.slice(i + n.highlight.length));
    }
    return title;
  }

  /* ---------- animações ---------- */
  // elementos com data-nw-reveal entram em fade + subida quando aparecem na tela
  function reveal(scope) {
    var els = Array.prototype.slice.call((scope || document).querySelectorAll('[data-nw-reveal]:not([data-revealed])'));
    if (!els.length) return;
    els.forEach(function (el) { el.setAttribute('data-revealed', '1'); });
    if (!G || !ST) return;
    G.set(els, { y: 36, autoAlpha: 0 });
    ST.batch(els, {
      start: 'top 90%', once: true,
      onEnter: function (b) { G.to(b, { y: 0, autoAlpha: 1, duration: .8, stagger: .08, ease: 'power3.out', overwrite: true }); }
    });
    ST.refresh();
  }
  function intro() {
    if (!G) return;
    var tl = G.timeline({ defaults: { ease: 'power3.out' }, delay: .15 });
    if (document.querySelector('.nw-crumb')) tl.from('.nw-crumb', { y: 16, autoAlpha: 0, duration: .5 });
    if (document.querySelector('.nw-title')) tl.from('.nw-title', { y: 30, autoAlpha: 0, duration: .7 }, '-=.25');
  }
  function parallax() {
    if (!G || !ST || !window.matchMedia('(min-width: 901px)').matches) return; // no celular a foto fica em fluxo
    var fig = document.querySelector('.nw-spot__fig img');
    if (fig) G.fromTo(fig, { yPercent: -6, scale: 1.12 }, { yPercent: 6, scale: 1.12, ease: 'none', scrollTrigger: { trigger: '.nw-spot', start: 'top bottom', end: 'bottom top', scrub: 1 } });
    var bg = document.querySelector('.nw-hero__bg');
    if (bg) G.fromTo(bg, { yPercent: 0, scale: 1.06 }, { yPercent: 10, scale: 1.06, ease: 'none', scrollTrigger: { trigger: '.nw-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
  }

  /* ---------- destaque ---------- */
  function renderHero(n) {
    var box = document.getElementById('nw-hero');
    if (!box || !n) return;
    box.classList.toggle('nw-hero--banner', !!n.banner);
    box.classList.toggle('nw-hero--square', !!n.square);
    box.innerHTML = heroImage(n) +
      '<div class="nw-hero__meta" data-nw-reveal><span class="tag">' + esc(n.tag) + '</span><span>' + fmtDate(n.date) + '</span><span>·</span><span>' + minutes(n) + ' min de leitura</span></div>' +
      '<div class="nw-hero__row"><h2 data-nw-reveal' + (n.banner ? ' class="sr-only"' : '') + '>' + highlight(n) + '</h2><a class="btn btn--yellow" data-nw-reveal href="' + href(n) + '">Ler notícia completa</a></div>';
  }
  function heroImage(n) {
    var src = imageUrl(n.cover || n.image);
    return '<img class="nw-hero__bg" src="' + src + '" alt="">';
  }

  /* ---------- promo lateral (CTA da notícia em destaque) ---------- */
  function renderPromo(n) {
    var box = document.getElementById('nw-promo');
    if (!box) return;
    var promo = (n && n.promo) || null;
    if (!promo) { box.hidden = true; return; }
    box.href = esc(promo.href);
    box.innerHTML = (promo.badge ? '<span class="nw-promo__coin"><img src="' + imageUrl(promo.badgeIcon || '') + '" alt="">' + esc(promo.badge) + '</span>' : '') +
      '<h3>' + highlight({ title: promo.title, highlight: promo.highlight }) + '</h3>' +
      '<span class="btn btn--ghost">' + esc(promo.label) + '</span>';
  }

  /* ---------- últimas (lateral) ---------- */
  function renderLatest(list) {
    var box = document.getElementById('nh-latest');
    if (!box) return;
    box.innerHTML = list.map(function (n) {
      return '<a class="nh-row' + (n.art ? ' nh-row--art' : '') + '" data-nw-reveal href="' + href(n) + '">' +
        '<img src="' + imageUrl(n.image) + '" alt="" loading="lazy">' +
        '<div><small><b>' + esc(n.tag) + '</b><span>' + shortDate(n.date) + '</span></small><strong>' + esc(n.title) + '</strong></div></a>';
    }).join('') || '<p class="nh-empty">Sem outras notícias por enquanto.</p>';
  }

  /* ---------- card ---------- */
  // capa quadrada: cópia desfocada atrás e a arte inteira na frente
  function cardImage(n) {
    var src = imageUrl(n.image);
    return '<img src="' + src + '" alt="" loading="lazy">';
  }
  function card(n) {
    return '<article class="nh-card' + (n.art ? ' nh-card--art' : '') + (n.square ? ' nh-card--square' : '') + '" data-nw-reveal>' +
      '<a class="nh-card__img" href="' + href(n) + '" aria-label="' + esc(n.title) + '"><span class="nh-card__tag">' + esc(n.tag) + '</span>' + cardImage(n) + '</a>' +
      '<div class="nh-card__body">' +
        '<div class="nh-card__meta"><span>' + fmtDate(n.date) + '</span><i>·</i><span>' + minutes(n) + ' min</span></div>' +
        '<h3><a href="' + href(n) + '">' + esc(n.title) + '</a></h3>' +
        '<p>' + esc(n.excerpt) + '</p>' +
        '<a class="nh-card__more" href="' + href(n) + '">Ler notícia</a>' +
      '</div></article>';
  }

  /* ---------- "Olha que incrível!" ---------- */
  function renderSpot(all) {
    var box = document.getElementById('nw-spot');
    if (!box) return;
    var cfg = (window.PWU && PWU.spotlight) || {};
    var n = all.filter(function (x) { return x.slug === cfg.slug; })[0] || all.filter(function (x) { return x.tag === 'Comunidade'; })[0] || all[0];
    if (!n) { box.hidden = true; return; }
    var talks = cfg.discussions || [];
    box.querySelector('.nw-spot__left').innerHTML =
      '<a class="nw-spot__fig" data-nw-reveal href="' + href(n) + '"><img src="' + imageUrl(cfg.image || n.cover || n.image) + '" alt=""></a>' +
      '<span class="nw-spot__label" data-nw-reveal>' + esc(cfg.label || 'Notícias') + '</span>' +
      '<h3 class="nw-spot__title" data-nw-reveal><a href="' + href(n) + '">' + esc(n.title) + '</a></h3>' +
      '<p class="nw-spot__text" data-nw-reveal>' + esc(cfg.text || n.excerpt) + '</p>';
    box.querySelector('.nw-spot__right').innerHTML = '<ul class="nw-talk">' + talks.map(function (t) {
      var inner = '<small>' + esc(t.topic) + '</small><p>' + esc(t.text) + '</p><time>' + esc(t.when) + '</time>';
      return '<li data-nw-reveal>' + (t.href ? '<a href="' + esc(t.href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : inner) + '</li>';
    }).join('') + '</ul>';
    if (!talks.length) box.querySelector('.nw-spot__right').hidden = true;
  }

  /* ---------- corpo de notícia (linhas do data.js) ---------- */
  // "## " vira subtítulo, "- " vira lista, "> " vira chamada em destaque, o resto é parágrafo
  function renderBody(lines) {
    var out = '', list = [];
    function flush() { if (list.length) { out += '<ul>' + list.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'; list = []; } }
    (lines || []).forEach(function (l) {
      l = String(l);
      if (/^\s*-\s+/.test(l)) { list.push(l.replace(/^\s*-\s+/, '')); return; }
      flush();
      if (/^##\s+/.test(l)) out += '<h3 data-nw-reveal>' + esc(l.replace(/^##\s+/, '')) + '</h3>';
      else if (/^>\s+/.test(l)) out += '<div class="lc-callout" data-nw-reveal><img src="assets/logo-sigla.png" alt=""><p><strong>' + esc(l.replace(/^>\s+/, '')) + '</strong></p></div>';
      else if (l.trim()) out += '<p data-nw-reveal>' + esc(l) + '</p>';
    });
    flush();
    return out;
  }

  /* ---------- página genérica de notícia (noticia.html?id=slug) ---------- */
  function renderArticle(n) {
    var hero = document.getElementById('nw-article-hero'), body = document.getElementById('nw-article-body');
    if (!hero || !body || !n) return;
    document.title = n.title + ' — Notícias — Pokeworld Universe';
    var cur = document.getElementById('nw-crumb-cur'); if (cur) cur.textContent = n.tag;
    var h1 = document.getElementById('nw-title'); if (h1) h1.innerHTML = esc(n.tag) + ' · <span class="grad">' + esc(n.title.split(':')[0]) + '</span>';
    hero.classList.toggle('nw-hero--banner', !!n.banner);
    hero.classList.toggle('nw-hero--square', !!n.square);
    var meta = '<div class="nw-hero__meta" data-nw-reveal><span class="tag">' + esc(n.tag) + '</span><span>' + fmtDate(n.date) + '</span><span>·</span><span>' + minutes(n) + ' min de leitura</span></div>';
    hero.innerHTML = heroImage(n) + meta +
      (n.banner ? '<h2 class="sr-only">' + esc(n.title) + '</h2>' : '<h2 data-nw-reveal>' + highlight(n) + '</h2><p class="lc-hero__lead" data-nw-reveal>' + esc(n.excerpt) + '</p>');
    body.innerHTML = (n.banner ? '<p class="lc-lead" data-nw-reveal>' + esc(n.excerpt) + '</p>' : '') +
      '<section class="lc-sec lc-sec--article">' + renderBody(n.body) + '</section>' +
      '<div class="lc-share" data-share-box data-nw-reveal><span>Compartilhar</span><button type="button" data-share="copy">Copiar link</button><button type="button" data-share="wa">WhatsApp</button><button type="button" data-share="x">X / Twitter</button></div>';
  }

  /* ---------- compartilhar (matérias) ---------- */
  function share() {
    var box = document.querySelector('[data-share-box]');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-share]'); if (!b) return;
      var url = location.href.split('#')[0], txt = encodeURIComponent(document.title + ' ' + url);
      if (b.dataset.share === 'copy') { if (navigator.clipboard) navigator.clipboard.writeText(url); if (window.PWU && PWU.toast) PWU.toast('Link copiado!', 'ok'); }
      if (b.dataset.share === 'wa') window.open('https://wa.me/?text=' + txt, '_blank', 'noopener');
      if (b.dataset.share === 'x') window.open('https://twitter.com/intent/tweet?text=' + txt, '_blank', 'noopener');
    });
  }

  intro();

  whenReady(function () {
    var all = NEWS().slice();
    if (!all.length) { reveal(); return; }
    var sorted = all.slice().sort(byDateDesc);
    var hero = all.filter(function (n) { return n.hero; })[0] || all.filter(function (n) { return n.featured; })[0] || sorted[0];
    var current = currentSlug ? sorted.filter(function (n) { return n.slug === currentSlug; })[0] : null;
    if (page === 'noticia-portal' && document.getElementById('nw-article-hero')) {
      if (!current) current = sorted[0];
      if (current.url && current.slug !== document.body.dataset.slug) { location.replace(current.url); return; } // notícia com página própria
      renderArticle(current);
    }
    var exclude = current || hero;
    var rest = sorted.filter(function (n) { return n !== exclude; });
    share();

    renderHero(hero);
    renderPromo(hero);
    renderLatest(rest.slice(0, 4));

    var latestGrid = document.getElementById('nw-latest-grid');
    if (latestGrid) latestGrid.innerHTML = rest.slice(0, 4).map(card).join('');

    /* arquivo com filtros */
    var chips = document.getElementById('nh-chips'), grid = document.getElementById('nh-grid');
    if (chips && grid) {
      var tags = []; all.forEach(function (n) { if (n.tag && tags.indexOf(n.tag) < 0) tags.push(n.tag); });
      chips.innerHTML = '<button class="chip is-active" type="button" data-filter="todas">Todas</button>' +
        tags.map(function (t) { return '<button class="chip" type="button" data-filter="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
      var count = document.getElementById('nh-count'), more = document.getElementById('nh-more');
      var search = document.getElementById('nh-search'), sort = document.getElementById('nh-sort');
      var state = { filter: 'todas', q: '', sort: 'recentes', shown: STEP };
      function filtered() {
        var q = norm(state.q);
        var list = all.filter(function (n) {
          if (state.filter !== 'todas' && n.tag !== state.filter) return false;
          if (q && norm(n.title + ' ' + n.excerpt + ' ' + (n.body || []).join(' ')).indexOf(q) < 0) return false;
          return true;
        });
        if (state.filter === 'todas' && !q) list = list.filter(function (n) { return n !== hero; });
        list.sort(byDateDesc);
        if (state.sort === 'antigas') list.reverse();
        return list;
      }
      function render() {
        var list = filtered(), visible = list.slice(0, state.shown);
        grid.innerHTML = visible.map(card).join('') || '<p class="nh-empty">Nenhuma notícia encontrada. Tente outra categoria ou termo.</p>';
        var n = list.length;
        count.innerHTML = '<span><strong>' + n + '</strong> ' + (n === 1 ? 'notícia encontrada' : 'notícias encontradas') +
          (state.filter !== 'todas' ? ' em <strong>' + esc(state.filter) + '</strong>' : '') + (state.q ? ' para “<strong>' + esc(state.q) + '</strong>”' : '') + '</span>' +
          ((state.filter !== 'todas' || state.q) ? '<button type="button" id="nh-clear">Limpar filtros</button>' : '');
        more.hidden = list.length <= state.shown;
        reveal(grid);
        var c = document.getElementById('nh-clear');
        if (c) c.addEventListener('click', function () {
          state.filter = 'todas'; state.q = ''; search.value = ''; state.shown = STEP;
          chips.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('is-active', x.dataset.filter === 'todas'); });
          render();
        });
      }
      chips.addEventListener('click', function (e) {
        var c = e.target.closest('.chip'); if (!c) return;
        chips.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
        state.filter = c.dataset.filter; state.shown = STEP; render();
      });
      var t;
      search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value.trim(); state.shown = STEP; render(); }, 120); });
      sort.addEventListener('change', function () { state.sort = sort.value; state.shown = STEP; render(); });
      more.addEventListener('click', function () { state.shown += STEP; render(); });
      var p = new URLSearchParams(location.search);
      if (p.get('tag') && tags.indexOf(p.get('tag')) > -1) { state.filter = p.get('tag'); chips.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('is-active', x.dataset.filter === state.filter); }); }
      if (p.get('q')) { state.q = p.get('q'); search.value = state.q; }
      render();
    }

    renderSpot(all);

    /* mais notícias: 3 que ainda não apareceram no topo */
    var moreGrid = document.getElementById('nw-more-grid');
    if (moreGrid) { var pool = rest.slice(4); moreGrid.innerHTML = (pool.length >= 3 ? pool.slice(-3) : rest.slice(-3)).map(card).join(''); }

    reveal();
    parallax();
    window.addEventListener('load', function () { if (ST) ST.refresh(); });
  });
})();
