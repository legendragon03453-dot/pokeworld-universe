/* =====================================================================
   POKEWORLD UNIVERSE — subpáginas: animações compartilhadas e
   renderização (notícias, artigo, ranking, loja, wiki, galeria)
   ===================================================================== */
(function () {
  var page = document.body.dataset.page;
  var isDesktop = window.matchMedia('(min-width: 901px)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G = window.gsap && !reduce ? window.gsap : null;
  if (G) G.registerPlugin(ScrollTrigger);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function imageUrl(value) {
    try {
      var url = new URL(String(value || ''), location.href);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      return esc(url.href);
    } catch (_) { return ''; }
  }
  function renderBody(lines) {
    var out = '', list = [];
    function flush() { if (list.length) { out += '<ul>' + list.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'; list = []; } }
    (lines || []).forEach(function (l) {
      l = String(l);
      if (/^\s*-\s+/.test(l)) { list.push(l.replace(/^\s*-\s+/, '')); return; }
      flush();
      if (/^##\s+/.test(l)) out += '<h3>' + esc(l.replace(/^##\s+/, '')) + '</h3>';
      else if (l.trim()) out += '<p>' + esc(l) + '</p>';
    });
    flush();
    return out;
  }
  function NEWS() { return (window.PWU && PWU.store) ? PWU.store.news() : (PWU.news || []); }
  function DEX() { return (window.PWU && PWU.store) ? PWU.store.pokemon() : (PWU.pokedex || []); }
  function whenReady(fn) { if (window.PWU && PWU.store) PWU.store.ready.then(fn); else fn(); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  var pixRequestPayers = new WeakMap();
  function validCpf(value) {
    var cpf = String(value || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (var length = 9; length <= 10; length++) {
      var sum = 0;
      for (var i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
      if ((sum * 10 % 11) % 10 !== Number(cpf[length])) return false;
    }
    return true;
  }

  /* Pagamento (Mercado Pago, API de Orders): o site manda SÓ o id do pacote;
     o servidor define preço e coins, cria a order e devolve o checkout_url. */
  function pay(packageId, btn, provedor, cupom, amount, onError, cpf) {
    if (['stripe','mercadopago'].indexOf(provedor)<0) { PWU.toast('Meio de pagamento indisponível.'); return; }
    var requestShape = JSON.stringify([provedor,packageId,cupom||'',amount||null]);
    if (provedor === 'mercadopago' && btn && pixRequestPayers.get(btn) !== cpf) { delete btn.dataset.requestShape; pixRequestPayers.set(btn, cpf); }
    if (btn && btn.dataset.requestShape !== requestShape) { btn.dataset.requestId = crypto.randomUUID(); btn.dataset.requestShape = requestShape; }
    var requestId = btn ? btn.dataset.requestId : crypto.randomUUID();
    var conteudo = btn ? btn.innerHTML : '';
    var rota = provedor === 'stripe' ? '/api/stripe-checkout' : '/api/checkout';
    var nome = provedor === 'stripe' ? 'Stripe' : 'Pix';
    function fail(msg) { if (onError) onError(msg); else PWU.toast(msg); if (btn) { btn.disabled = false; btn.classList.remove('is-indo'); btn.innerHTML = conteudo; } }
    if (btn) { btn.disabled = true; btn.classList.add('is-indo'); btn.innerHTML = '<span class="pay-way__head"><b>Abrindo ' + nome + '…</b></span>'; }
    return PWU.auth.token().then(function (token) {
      if (!token) throw new Error('Pagamentos exigem a conta conectada ao servidor. Entre novamente.');
      return fetch(rota, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ packageId: packageId, requestId: requestId }, cupom ? { coupon: cupom } : {}, amount ? { amount: amount } : {}, provedor === 'mercadopago' && cpf ? { cpf: cpf } : {})) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) throw new Error('Sua sessão expirou. Entre novamente.');
        if (r.status === 503) throw new Error(d.error || 'Pagamento temporariamente indisponível.');
        if ([400,409,429].indexOf(r.status)>-1 && d.error) throw new Error(d.error);
        if (!r.ok || !d.checkoutUrl) throw new Error('Não foi possível iniciar o pagamento.');
        var target = new URL(d.checkoutUrl);
        if (target.protocol !== 'https:' || (provedor === 'stripe' ? target.hostname !== 'checkout.stripe.com' : (target.hostname !== 'www.mercadopago.com.br' || !/^\/payments\/[0-9]+\/ticket$/.test(target.pathname))) || target.username || target.password || target.port) throw new Error('Endereço de pagamento inválido.');
        location.href = target.href;
      });
    }).catch(function (e) { fail(e.message === 'Failed to fetch' ? 'Pagamento indisponível neste ambiente.' : e.message); });
  }

  /* =====================================================================
     Animações compartilhadas
     ===================================================================== */
  if (G) {
    // cursor
    var cursor = null; // cursor customizado desativado
    if (cursor && finePointer && isDesktop) {
      document.documentElement.classList.add('has-cursor');
      var ring = cursor.querySelector('.cursor__ring'), dot = cursor.querySelector('.cursor__dot');
      var rx = G.quickTo(ring, 'x', { duration: .35, ease: 'power3' }), ry = G.quickTo(ring, 'y', { duration: .35, ease: 'power3' });
      var dx = G.quickTo(dot, 'x', { duration: .08 }), dy = G.quickTo(dot, 'y', { duration: .08 });
      window.addEventListener('mousemove', function (e) { rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY); cursor.classList.add('is-on'); });
      var hoverSel = 'a, button, .dex, .item, .mode, .ncard, summary, input, label';
      document.addEventListener('mouseover', function (e) { if (e.target.closest(hoverSel)) cursor.classList.add('is-hover'); });
      document.addEventListener('mouseout', function (e) { if (e.target.closest(hoverSel)) cursor.classList.remove('is-hover'); });
    }
    // progresso
    var prog = document.querySelector('.scroll-progress');
    if (prog) G.to(prog, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });
    // header
    G.timeline({ defaults: { ease: 'power3.out' } })
      .from('.header-shape', { yPercent: -100, duration: .8, stagger: .08 })
      .from('.logo-sigla', { scale: 0, rotation: -25, duration: .7, ease: 'back.out(1.8)' }, '-=.4')
      .from('.nav a', { y: -20, autoAlpha: 0, duration: .45, stagger: .06 }, '-=.4')
      .from('.btn-jogue-agora', { scale: .6, autoAlpha: 0, duration: .5, ease: 'back.out(2)' }, '-=.3');
    // banner
    G.timeline({ defaults: { ease: 'power3.out' }, delay: .2 })
      .from('.banner__tag', { y: 20, autoAlpha: 0, duration: .6 })
      .from('.banner__title', { y: 60, autoAlpha: 0, duration: .9 }, '-=.3')
      .from('.banner__sub', { y: 20, autoAlpha: 0, duration: .6 }, '-=.5')
      .from('.banner__art', { x: 120, autoAlpha: 0, duration: 1 }, '-=.8');
    G.to('.banner__art', { y: -12, duration: 2.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    G.to('.banner', { backgroundPosition: '50% 30%', ease: 'none', scrollTrigger: { trigger: '.banner', start: 'top top', end: 'bottom top', scrub: true } });

    // magnéticos
    if (finePointer && isDesktop) {
      document.querySelectorAll('.btn-jogue-agora, .btn--yellow, .btn--lime').forEach(function (el) {
        var xTo = G.quickTo(el, 'x', { duration: .4, ease: 'power3' }), yTo = G.quickTo(el, 'y', { duration: .4, ease: 'power3' });
        el.addEventListener('mousemove', function (e) { var r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * .3); yTo((e.clientY - r.top - r.height / 2) * .3); });
        el.addEventListener('mouseleave', function () { G.to(el, { x: 0, y: 0, duration: .8, ease: 'elastic.out(1,.4)' }); });
      });
    }
  }

  // reveal genérico (funciona para conteúdo renderizado depois também)
  function reveal(scope) {
    var els = (scope || document).querySelectorAll('[data-reveal]:not([data-revealed])');
    if (!els.length) return;
    els.forEach(function (el) { el.setAttribute('data-revealed', '1'); });
    if (!G) return;
    ScrollTrigger.batch(els, {
      start: 'top 90%', once: true,
      onEnter: function (b) { G.fromTo(b, { y: 50, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .8, stagger: .1, ease: 'power3.out', overwrite: true }); }
    });
    ScrollTrigger.refresh();
  }

  /* =====================================================================
     Galeria (lightbox) — usada em O JOGO
     ===================================================================== */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('.lightbox__img');
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-lightbox]');
      if (!a) return;
      e.preventDefault();
      lbImg.src = a.getAttribute('href'); lb.hidden = false; document.body.classList.add('is-locked');
    });
    lb.addEventListener('click', function () { lb.hidden = true; document.body.classList.remove('is-locked'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { lb.hidden = true; document.body.classList.remove('is-locked'); } });
  }

  /* =====================================================================
     O JOGO — marquee de pokémon
     ===================================================================== */
  if (page === 'o-jogo') {
    var track = document.querySelector('.pk-marquee__track');
    if (track && window.PWU) whenReady(function () {
      var list = DEX().slice(0, 28);
      var html = list.map(function (p) { return '<a href="wiki.html?p=' + esc(p.id) + '" title="' + esc(p.name) + '"><img src="' + imageUrl(p.image) + '" alt="' + esc(p.name) + '" loading="lazy"></a>'; }).join('');
      track.innerHTML = html + html;
    });
    var counters = document.querySelectorAll('.stat-box [data-count], .geracoes [data-count]');
    if (G && counters.length) {
      ScrollTrigger.create({ trigger: '.stats-row, .geracoes', start: 'top 85%', once: true, onEnter: function () {
        counters.forEach(function (el) {
          var target = +el.dataset.count, suffix = el.dataset.suffix || '', o = { v: 0 };
          G.to(o, { v: target, duration: 2, ease: 'power2.out', onUpdate: function () { el.textContent = Math.round(o.v).toLocaleString('pt-BR') + suffix; } });
        });
      } });
    }
  }

  /* =====================================================================
     DOWNLOAD — instalador oficial Windows, independente de login e banco
     ===================================================================== */
  if (page === 'download') {
    var downloadPC = document.getElementById('dl-pc');
    if (downloadPC) {
      downloadPC.href = 'https://www.pokeworlduniverse.com/downloads/PokeWorldUniverse.exe';
      downloadPC.removeAttribute('data-require-auth');
    }
  }

  /* =====================================================================
     NOTÍCIAS — lista com filtro
     ===================================================================== */
  function newsCard(n) {
    return '<article class="ncard" data-reveal>' +
      '<a class="ncard__img" href="noticia.html?id=' + encodeURIComponent(n.slug) + '"><img src="' + imageUrl(n.image) + '" alt="" loading="lazy"></a>' +
      '<div class="ncard__body"><div class="news-meta"><span class="tag">' + esc(n.tag) + '</span><span>' + PWU.fmtDate(n.date) + '</span></div>' +
      '<h3><a href="noticia.html?id=' + encodeURIComponent(n.slug) + '">' + esc(n.title) + '</a></h3><p>' + esc(n.excerpt) + '</p>' +
      '<a class="more" href="noticia.html?id=' + encodeURIComponent(n.slug) + '">Saiba mais</a></div></article>';
  }
  if (page === 'noticias' && window.PWU) whenReady(function () {
    var grid = document.getElementById('news-grid'), feat = document.getElementById('news-featured');
    var chips = document.querySelectorAll('.chips [data-filter]');
    function renderNews(filter) {
      var list = NEWS().filter(function (n) { return filter === 'todas' || n.tag === filter; });
      var first = list[0];
      if (feat) {
        feat.innerHTML = first ? '<img src="' + imageUrl(first.image) + '" alt=""><div class="news-featured__body"><div class="news-meta"><span class="tag">' + esc(first.tag) + '</span><span>' + PWU.fmtDate(first.date) + '</span></div>' +
          '<h2>' + esc(first.title) + '</h2><p>' + esc(first.excerpt) + '</p><div class="btn-row" style="margin-top:2.4rem"><a class="btn btn--yellow btn--sm" href="noticia.html?id=' + encodeURIComponent(first.slug) + '">Ler notícia</a></div></div>' : '';
      }
      grid.innerHTML = list.slice(1).map(newsCard).join('') || '<p class="empty">Nenhuma notícia nesta categoria.</p>';
      reveal(grid);
      if (G && feat && first) G.fromTo(feat, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .7, ease: 'power3.out' });
    }
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        chips.forEach(function (x) { x.classList.toggle('is-active', x === c); });
        renderNews(c.dataset.filter);
      });
    });
    renderNews('todas');
  });

  /* =====================================================================
     ARTIGO
     ===================================================================== */
  if (page === 'noticia' && window.PWU) whenReady(function () {
    var slug = qs('id');
    var n = NEWS().find(function (x) { return x.slug === slug; }) || NEWS()[0];
    if (!n) return;
    document.title = n.title + ' — Pokeworld Universe';
    var el = document.getElementById('article');
    el.innerHTML = '<div class="article__hero"><img src="' + imageUrl(n.image) + '" alt=""></div>' +
      '<h1>' + esc(n.title) + '</h1>' +
      '<div class="news-meta"><span class="tag">' + esc(n.tag) + '</span><span>' + PWU.fmtDate(n.date) + '</span><span>·</span><span>' + Math.max(2, Math.round(n.body.join(' ').length / 900)) + ' min de leitura</span></div>' +
      '<div class="article__body">' + renderBody(n.body) + '</div>' +
      '<div class="share"><button type="button" data-share="copy">Copiar link</button><button type="button" data-share="wa">WhatsApp</button><button type="button" data-share="x">X / Twitter</button></div>';
    var rel = NEWS().filter(function (x) { return x.slug !== n.slug; }).slice(0, 3);
    document.getElementById('related').innerHTML = rel.map(newsCard).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-share]'); if (!b) return;
      var url = location.href, txt = encodeURIComponent(n.title + ' ' + url);
      if (b.dataset.share === 'copy') { navigator.clipboard && navigator.clipboard.writeText(url); PWU.toast('Link copiado!', 'ok'); }
      if (b.dataset.share === 'wa') window.open('https://wa.me/?text=' + txt, '_blank');
      if (b.dataset.share === 'x') window.open('https://twitter.com/intent/tweet?text=' + txt, '_blank');
    });
    if (G) G.from('.article__body > *', { y: 20, autoAlpha: 0, duration: .6, stagger: .06, ease: 'power2.out', delay: .3 });
  });

  /* =====================================================================
     RANKING
     ===================================================================== */
  if (page === 'ranking' && window.PWU) {
    var cats = PWU.rankingCats, R = PWU.rankings, T = PWU.trophies;
    var me = PWU.auth && PWU.auth.user;
    var catsEl = document.getElementById('rank-cats'), listEl = document.getElementById('rank-list'), descEl = document.getElementById('rank-desc');
    var search = document.getElementById('rank-search');
    var current = 'experiencia';
    var vivo = {};      // cache do que veio do banco do jogo
    function fmt(v) { return Number(v || 0).toLocaleString('pt-BR'); }

    /* Apenas dados reais; falhas não são substituídas por rankings fictícios. */
    function carregar(cat) {
      if (vivo[cat]) return Promise.resolve(vivo[cat]);
      return fetch('/api/game?resource=ranking&cat=' + encodeURIComponent(cat))
        .then(function (r) { if (!r.ok) throw new Error('offline'); return r.json(); })
        .then(function (d) { vivo[cat] = d; return d; })
        .catch(function () { var d = { rows: [], unavailable: true }; vivo[cat] = d; return d; });
    }

    function linhas(cat, d) {
      if (d && d.rows && d.rows.length) return d.rows;
      if (d && d.rows && !d.rows.length) return [];
      return [];
    }

    function renderCats() {
      catsEl.innerHTML = cats.map(function (c) {
        var d = vivo[c.id], top = d && d.rows && d.rows[0];
        return '<button type="button" class="rank-cat' + (c.id === current ? ' is-active' : '') + '" data-cat="' + c.id + '"><small>' + esc(c.label) + '</small><b>' + (top ? esc(top.name) + ' · <em>' + fmt(top.value) + '</em>' : '—') + '</b></button>';
      }).join('');
    }
    document.getElementById('trophy-legend').innerHTML = T.map(function (src, i) { return '<figure><img src="' + src + '" alt=""><figcaption>' + (i < 6 ? (i + 1) + 'º' : '7º+') + '</figcaption></figure>'; }).join('');

    function renderList() {
      var cat = cats.find(function (c) { return c.id === current; });
      var d = vivo[current];
      descEl.textContent = cat.desc;
      if (!d || d.unavailable) {
        listEl.innerHTML = '<p class="rank-empty">' + (!d ? 'Carregando ranking...' : 'Ranking indisponível nesta prévia. Tente novamente mais tarde.') + '</p>';
        return;
      }
      var q = (search.value || '').toLowerCase();
      var list = linhas(current, d).filter(function (p) { return p.name.toLowerCase().indexOf(q) > -1 || (p.guild || '').toLowerCase().indexOf(q) > -1; });

      if (d && d.missing === 'snapshot') {
        listEl.innerHTML = '<p class="rank-empty">Este ranking precisa do retrato diário de experiência.<br>Rode <b>sql/site-tables.sql</b> no banco e agende <b>/api/game?resource=snapshot</b> uma vez por dia.</p>';
        return;
      }

      listEl.innerHTML = list.map(function (p) {
        var trophy = T[Math.min(p.pos, 7) - 1];
        var slots = [];
        for (var k = 0; k < 6; k++) {
          var m = p.team && p.team[k];
          var id = m ? String(m.name || '').toLowerCase().replace(/\s+/g, '-') : null;
          slots.push(m ? '<div class="slot"><span class="slot__ini" aria-hidden="true">' + esc(String(m.name || '?').charAt(0).toUpperCase()) + '</span><span class="slot__lvl">LVL <b>' + (m.level || 0) + '</b></span><div class="bar"><i data-w="' + (m.pct != null ? m.pct : Math.min(100, (m.level || 0))) + '"></i></div><span class="slot__pct">' + esc(String(m.name).replace(/^./, function (c) { return c.toUpperCase(); })) + '</span></div>'
            : '<div class="slot slot--empty"><span class="slot__ini" aria-hidden="true">—</span><span class="slot__lvl">LVL <b>0</b></span><div class="bar"><i></i></div><span class="slot__pct">—</span></div>');
        }
        var you = me && p.name.toLowerCase() === (me.name || '').toLowerCase();
        var sub = current === 'guildas' ? esc(p.guild || '') + (p.members ? ' · ' + p.members + ' membros' : '') : esc(p.guild || 'Sem guilda') + (p.level ? ' · nível ' + p.level : '');
        return '<article class="rank-card' + (p.pos <= 3 ? ' rank-card--top' : '') + (you ? ' you' : '') + '" data-reveal>' +
          '<div class="rank-card__head">' +
            '<div class="rank-card__pos' + (trophy ? '' : ' rank-card__pos--plain') + '">' + (trophy ? '<img src="' + trophy + '" alt="">' : '') + '<b>' + esc(p.pos) + '</b></div>' +
            '<div class="rank-card__name"><b>' + esc(p.name) + '</b><small>' + sub + '</small></div>' +
            '<div class="rank-card__value"><b>' + fmt(p.value) + '</b><small>' + esc((d && d.unit) || cat.unit) + '</small></div>' +
          '</div><div class="rank-team">' + slots.join('') + '</div></article>';
      }).join('') || '<p class="rank-empty">Nenhum resultado.</p>';

      if (G) {
        G.fromTo(listEl.querySelectorAll('.rank-card'), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .5, stagger: .06, ease: 'power2.out', overwrite: true });
        G.fromTo(listEl.querySelectorAll('.bar i[data-w]'), { width: 0 }, { width: function (i, el) { return el.dataset.w + '%'; }, duration: 1, stagger: .01, ease: 'power3.out', delay: .2 });
      } else listEl.querySelectorAll('.bar i[data-w]').forEach(function (i) { i.style.width = i.dataset.w + '%'; });
      listEl.querySelectorAll('[data-reveal]').forEach(function (el) { el.setAttribute('data-revealed', '1'); });
    }

    function ir(cat) { current = cat; renderCats(); renderList(); carregar(cat).then(function () { renderCats(); renderList(); }); }
    catsEl.addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (b) ir(b.dataset.cat); });
    search.addEventListener('input', renderList);
    ir('experiencia');
    cats.forEach(function (c) { if (c.id !== 'experiencia') carregar(c.id).then(renderCats); });

    // status do servidor no topo
    fetch('/api/game?resource=status').then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (!st) return;
      var el = document.getElementById('rank-updated');
      if (el) el.textContent = 'Estatísticas em ' + new Date().toLocaleDateString('pt-BR') + ' · ' + st.online + ' online agora · recorde de ' + st.record + ' · ' + st.trainers + ' treinadores.';
      document.querySelectorAll('.count[data-count]').forEach(function (c) { if (st.online) c.dataset.count = st.online; });
    }).catch(function () {});

    var end = new Date('2026-12-15T23:59:59-03:00').getTime();
    function tick() {
      var d2 = Math.max(0, end - Date.now());
      document.getElementById('t-d').textContent = Math.floor(d2 / 864e5);
      document.getElementById('t-h').textContent = ('0' + Math.floor(d2 % 864e5 / 36e5)).slice(-2);
      document.getElementById('t-m').textContent = ('0' + Math.floor(d2 % 36e5 / 6e4)).slice(-2);
    }
    tick(); setInterval(tick, 30000);
  }

  /* =====================================================================
     LOJA — filtros e carrinho (localStorage)
     ===================================================================== */
  if (page === 'loja' && window.PWU) {
    var CART_KEY = 'pwu_cart';
    var grid2 = document.getElementById('shop-grid'), fab = document.getElementById('cart-fab'), cart = document.getElementById('cart');
    function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; } }
    function writeCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); renderCart(); }
    function price(it) {
      var parts = [];
      if (it.coins) parts.push('<span><img class="moeda-mini" src="assets/img/coins/pcoin.png?v=3" alt="">' + it.coins.toLocaleString('pt-BR') + '</span>');
      if (it.gems) parts.push('<span><i class="ico ico-gem" aria-hidden="true"></i> ' + it.gems.toLocaleString('pt-BR') + '</span>');
      if (it.price) parts.push('<span>' + PWU.brl(it.price) + '</span>');
      return parts.join('');
    }
    function renderShop(filter) {
      var list = PWU.shop.filter(function (i) { return filter === 'todos' || i.type === filter; });
      grid2.innerHTML = list.map(function (it) {
        return '<div class="item" data-reveal>' + (it.badge ? '<span class="item__badge">' + esc(it.badge) + '</span>' : '') +
          '<div class="item__img"><img src="' + imageUrl(it.image) + '" alt="" loading="lazy"></div><h3>' + esc(it.name) + '</h3><p>' + esc(it.desc) + '</p>' +
          '<div class="item__price">' + price(it) + '</div><button class="btn btn--yellow btn--sm" data-require-auth data-add="' + it.id + '">Comprar</button></div>';
      }).join('');
      reveal(grid2);
    }
    document.querySelectorAll('.chips [data-filter]').forEach(function (c) {
      c.addEventListener('click', function () { document.querySelectorAll('.chips [data-filter]').forEach(function (x) { x.classList.toggle('is-active', x === c); }); renderShop(c.dataset.filter); });
    });
    grid2.addEventListener('click', function (e) {
      var b = e.target.closest('[data-add]'); if (!b || !PWU.auth.user) return;
      var c = readCart(); c.push(b.dataset.add); writeCart(c);
      PWU.toast('Adicionado ao carrinho!', 'ok');
      if (G) G.fromTo(fab, { scale: 1.25 }, { scale: 1, duration: .5, ease: 'elastic.out(1,.4)' });
      var img = b.closest('.item').querySelector('img');
      if (G && img) {
        var ghost = img.cloneNode(); var r = img.getBoundingClientRect(), f = fab.getBoundingClientRect();
        ghost.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:300;pointer-events:none;object-fit:contain';
        document.body.appendChild(ghost);
        G.to(ghost, { left: f.left + f.width / 2 - 20, top: f.top + f.height / 2 - 20, width: 40, height: 40, opacity: .2, duration: .8, ease: 'power2.inOut', onComplete: function () { ghost.remove(); } });
      }
    });
    function renderCart() {
      var c = readCart(), items = c.map(function (id) { return PWU.shop.find(function (i) { return i.id === id; }); }).filter(Boolean);
      fab.querySelector('b').textContent = items.length;
      var list = cart.querySelector('.cart__list');
      list.innerHTML = items.map(function (it, i) { return '<div class="cart__item"><img src="' + imageUrl(it.image) + '" alt=""><div>' + esc(it.name) + '<small>' + (it.price ? PWU.brl(it.price) : it.gems ? it.gems + ' gemas' : it.coins + ' créditos') + '</small></div><button type="button" data-rm="' + i + '" aria-label="Remover">×</button></div>'; }).join('') || '<p class="empty">Seu carrinho está vazio.</p>';
      var total = items.reduce(function (s, it) { return s + (it.price || 0); }, 0), gems = items.reduce(function (s, it) { return s + (it.gems || 0); }, 0);
      cart.querySelector('.cart__total b').textContent = (total ? PWU.brl(total) : '') + (gems ? (total ? ' + ' : '') + gems + ' gemas' : '') || 'R$ 0,00';
    }
    fab.addEventListener('click', function () { cart.classList.add('is-open'); });
    cart.addEventListener('click', function (e) {
      if (e.target.closest('[data-cart-close]')) cart.classList.remove('is-open');
      var rm = e.target.closest('[data-rm]'); if (rm) { var c = readCart(); c.splice(+rm.dataset.rm, 1); writeCart(c); }
      if (e.target.closest('[data-checkout]')) {
        if (!readCart().length) return PWU.toast('Seu carrinho está vazio.');
        PWU.toast('As compras usam Diamond Points. Vamos te levar para comprar Diamond Points.');
        setTimeout(function () { location.href = 'minha-conta.html#coins'; }, 1200);
      }
    });
    renderShop('todos'); renderCart();

    // pacotes reais da tabela `pacotes` do jogo (quando houver)
    fetch('/api/game?resource=shop').then(function (r) { return r.ok ? r.json() : null; }).then(function (lista) {
      if (!lista || !lista.length) return;
      PWU.shop = lista.map(function (p) {
        return { id: 'pk-' + p.id, type: 'pacote', name: p.name, desc: p.priceFrom > p.price ? 'De ' + PWU.brl(p.priceFrom) + ' por ' + PWU.brl(p.price) : 'Pacote do servidor', price: p.price, image: 'assets/img/pokemon/mew.png', badge: p.tag || null };
      }).concat(PWU.shop.filter(function (i) { return i.type !== 'pacote'; }));
      renderShop('todos');
    }).catch(function () {});

    // Loja só para quem está logado: abre o login ao entrar e trava a grade até conectar
    var gate = document.getElementById('shop-gate');
    function applyGate() {
      var logged = !!(PWU.auth && PWU.auth.user);
      gate.hidden = logged;
      grid2.classList.toggle('is-locked', !logged);
      fab.hidden = !logged;
    }
    applyGate();
    if (!(PWU.auth && PWU.auth.user)) setTimeout(function () { PWU.auth.open('login'); }, 600);
    document.addEventListener('auth:change', applyGate);
  }

  /* =====================================================================
     WIKI — Pokédex com busca, filtro e ficha
     ===================================================================== */
  if (page === 'wiki' && window.PWU) whenReady(function () {
    var dex = document.getElementById('dex-grid'), q = document.getElementById('dex-search'), modal = document.getElementById('dex-modal');
    var role = 'todos';
    function renderDex() {
      var term = (q.value || '').toLowerCase();
      var list = DEX().filter(function (p) { return (role === 'todos' || p.role === role) && p.name.toLowerCase().indexOf(term) > -1; });
      dex.innerHTML = list.map(function (p) {
        return '<div class="dex" data-id="' + esc(p.id) + '" style="--role:' + PWU.roles[p.role].color + '"><img src="' + imageUrl(p.image) + '" alt="" loading="lazy"><h3>' + esc(p.name) + '</h3><span>' + PWU.roles[p.role].label + '</span></div>';
      }).join('') || '<p class="empty">Nenhum Pokémon encontrado.</p>';
      document.getElementById('dex-count').textContent = list.length;
      if (G) G.fromTo(dex.children, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .45, stagger: .025, ease: 'power2.out', overwrite: true });
    }
    document.querySelectorAll('.chips [data-role]').forEach(function (c) {
      c.addEventListener('click', function () { document.querySelectorAll('.chips [data-role]').forEach(function (x) { x.classList.toggle('is-active', x === c); }); role = c.dataset.role; renderDex(); });
    });
    q.addEventListener('input', renderDex);
    function openDex(id) {
      var p = DEX().find(function (x) { return x.id === id; }); if (!p) return;
      var stats = [['Ataque', p.stats.ataque], ['Defesa', p.stats.defesa], ['Resistência', p.stats.resistencia], ['Suporte', p.stats.suporte], ['Mobilidade', p.stats.mobilidade]];
      modal.querySelector('.dex-modal__card').innerHTML = '<button class="close" type="button" data-close>×</button>' +
        '<div class="dex-modal__img"><img src="' + imageUrl(p.image) + '" alt=""></div><div>' +
        '<h2>' + esc(p.name) + '</h2>' + (p.description ? '<p class="dex-modal__desc">' + esc(p.description) + '</p>' : '') + '<div class="meta"><span style="background:' + PWU.roles[p.role].color + ';color:#000">' + PWU.roles[p.role].label + '</span><span>' + (p.range === 'melee' ? 'Curto alcance' : 'Longo alcance') + '</span><span>Dificuldade <i class="stars">' + '★'.repeat(p.difficulty) + '☆'.repeat(5 - p.difficulty) + '</i></span></div>' +
        stats.map(function (s) { return '<div class="statbar"><span>' + s[0] + '</span><div class="bar"><i data-w="' + s[1] + '"></i></div><b>' + s[1] + '</b></div>'; }).join('') +
        '<div class="btn-row" style="margin-top:2.4rem"><a class="btn btn--yellow btn--sm" href="loja.html">Ver na loja</a><a class="btn btn--ghost btn--sm" href="o-jogo.html">Como jogar</a></div></div>';
      modal.hidden = false; document.body.classList.add('is-locked');
      if (G) {
        G.fromTo(modal.querySelector('.dex-modal__card'), { y: 40, scale: .95, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: .5, ease: 'back.out(1.5)' });
        G.fromTo(modal.querySelector('.dex-modal__img img'), { x: -40, rotation: -8 }, { x: 0, rotation: 0, duration: .8, ease: 'power3.out' });
        G.fromTo(modal.querySelectorAll('.bar i'), { width: 0 }, { width: function (i, el) { return el.dataset.w + '%'; }, duration: .9, stagger: .08, ease: 'power3.out', delay: .2 });
      } else modal.querySelectorAll('.bar i').forEach(function (i) { i.style.width = i.dataset.w + '%'; });
    }
    function closeDex() { modal.hidden = true; document.body.classList.remove('is-locked'); }
    dex.addEventListener('click', function (e) { var d = e.target.closest('.dex'); if (d) openDex(d.dataset.id); });
    modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]') || e.target.classList.contains('dex-modal__bd')) closeDex(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDex(); });
    renderDex();
    if (qs('p')) openDex(qs('p'));
  });

  /* =====================================================================
     MINHA CONTA
     ===================================================================== */
  if (page === 'minha-conta' && window.PWU) {
    var gateA = document.getElementById('acc-gate'), acc = document.getElementById('acc');
    var pm = document.getElementById('pmodal'), pmBody = document.getElementById('pmodal-body');
    var shown = { name: false, email: false };
    var AVATARS = ['pikachu', 'charmander', 'bulbasaur', 'greninja', 'lucario', 'gengar', 'sylveon', 'umbreon'];

    function openP(html) { pmBody.innerHTML = html; pm.hidden = false; document.body.classList.add('is-locked'); if (G) G.fromTo(pm.querySelector('.pmodal__card'), { y: 30, scale: .96, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: .4, ease: 'back.out(1.5)' }); }
    function closeP() { pm.hidden = true; document.body.classList.remove('is-locked'); }
    pm.addEventListener('click', function (e) { if (e.target.closest('[data-pclose]')) closeP(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pm.hidden) closeP(); });
    function perr(msg) { var p = pmBody.querySelector('.auth__error'); if (p) { p.textContent = msg; p.hidden = !msg; } }

    var jogo = null;   // conta vinda do banco do jogo (null = modo local)

    function renderAcc() {
      var u = PWU.auth.user;
      gateA.hidden = !!u; acc.hidden = !u;
      if (!u) return;
      var pr = jogo ? { diamonds: jogo.coins, plan: jogo.plan, twitch: null, tickets: [], trainers: (jogo.trainers || []).map(function (t) { return { name: t.name, world: t.online ? 'Online agora' : 'Nível ' + t.level, avatar: (t.team[0] && String(t.team[0].name).toLowerCase().replace(/\s+/g, '-')) || 'pikachu', level: t.level }; }) } : PWU.auth.profile();
      document.getElementById('acc-name').value = shown.name ? (jogo ? jogo.name : u.name) : ' *  *  *  *  *';
      document.getElementById('acc-email').value = shown.email ? (jogo ? jogo.email : u.email) : ' *  *  *  *  *';
      var av = document.getElementById('acc-avatar');
      if (av) av.src = (PWU.avatarUrl ? PWU.avatarUrl(u) : 'assets/img/pokemon/pikachu.png');
      document.getElementById('acc-diamonds').textContent = jogo && Number.isSafeInteger(jogo.diamondPoints) ? jogo.diamondPoints.toLocaleString('pt-BR') : 'Indisponível';
      document.getElementById('acc-plan').textContent = pr.plan || 'Conta Grátis';
      var tw = document.querySelector('[data-acc="twitch"]'); if (tw) tw.textContent = pr.twitch ? 'Twitch: ' + pr.twitch : 'Vincular Twitch';
      document.getElementById('acc-tcount').textContent = '(' + pr.trainers.length + ')';
      document.getElementById('acc-trainers').innerHTML = pr.trainers.map(function (t, i) {
        return '<div class="trainer">' + (jogo ? '' : '<button class="rm" type="button" data-rm-trainer="' + i + '" aria-label="Excluir">×</button>') +
          '<img src="assets/img/art/player-girl.png?v=3" alt=""><h5>' + esc(t.name) + '</h5><span class="lvl">Nível ' + esc(t.level) + '</span><span class="world">' + esc(t.world) + '</span></div>';
      }).join('') || '<div class="trainers__empty">' + (jogo ? 'Sua conta ainda não tem treinadores.<br>Baixe o cliente, entre no jogo e crie o primeiro.' : 'Você ainda não tem treinadores.<br>Crie o primeiro aqui ou baixe o cliente e comece sua jornada.') + '</div>';
      if (G) G.fromTo('#acc-trainers .trainer', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .4, stagger: .06, ease: 'power2.out', overwrite: true });
    }

    document.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-toggle]');
      if (tg) { var k = tg.dataset.toggle; shown[k] = !shown[k]; tg.textContent = shown[k] ? 'esconder' : 'mostrar'; renderAcc(); return; }
      var rm = e.target.closest('[data-rm-trainer]');
      if (rm) { var pr0 = PWU.auth.profile(); if (confirm('Excluir o treinador ' + pr0.trainers[+rm.dataset.rmTrainer].name + '?')) { pr0.trainers.splice(+rm.dataset.rmTrainer, 1); PWU.auth.saveProfile(pr0); renderAcc(); } return; }
      var a = e.target.closest('[data-acc]'); if (!a) return;
      var act = a.dataset.acc, pr = PWU.auth.profile();

      if (act === 'logout') { PWU.auth.logout(); return; }

      if (act === 'tickets') {
        openP('<h3>Tickets</h3><p class="sub">Abra um chamado para a equipe. Respondemos pelo e-mail da sua conta.</p>' +
          '<form id="f-ticket" novalidate><label class="field"><span>Assunto</span><select name="subject"><option>Problema com a conta</option><option>Pagamento ou doação</option><option>Bug no jogo</option><option>Denúncia</option><option>Outro</option></select></label>' +
          '<label class="field"><span>Mensagem</span><textarea name="message" rows="5" placeholder="Descreva o que aconteceu"></textarea></label><p class="auth__error" hidden></p><button class="auth__submit" type="submit"><span>Enviar ticket</span></button></form>' +
          '<div class="ticket-list">' + (pr.tickets.length ? pr.tickets.slice().reverse().map(function (t) { return '<div class="ticket"><b>#' + esc(t.id) + ' · ' + esc(t.subject) + '</b><small>' + new Date(t.at).toLocaleString('pt-BR') + ' · Aberto</small></div>'; }).join('') : '') + '</div>');
        document.getElementById('f-ticket').addEventListener('submit', function (ev) {
          ev.preventDefault(); var f = ev.currentTarget, msg = f.message.value.trim();
          if (msg.length < 10) return perr('Escreva pelo menos 10 caracteres.');
          if (jogo && PWU.auth.api.ticket) {
            PWU.auth.api.ticket(f.subject.value, msg).then(function () { closeP(); PWU.toast('Ticket enviado! Responderemos por e-mail.', 'ok'); })
              .catch(function (er) { perr(er.message || 'Não foi possível enviar.'); });
            return;
          }
          var p2 = PWU.auth.profile(); p2.tickets.push({ id: 1000 + p2.tickets.length + 1, subject: f.subject.value, message: msg, at: Date.now() }); PWU.auth.saveProfile(p2);
          closeP(); PWU.toast('Ticket enviado! Responderemos por e-mail.', 'ok');
        });
      }

      if (act === 'avatar') {
        var opcoes = (PWU.avatares || []).map(function (x) { return { url: x.image, nome: x.name }; });
        var atual = PWU.avatarUrl ? PWU.avatarUrl(PWU.auth.user) : '';
        openP('<h3>Foto de perfil</h3><p class="sub">Escolha um parceiro para representar você no site, ou informe o endereço de uma imagem.</p>' +
          '<div class="avatar-grid">' + opcoes.map(function (o) { return '<button type="button" data-av="' + imageUrl(o.url) + '" class="' + (o.url === atual ? 'is-active' : '') + '" title="' + esc(o.nome) + '"><img src="' + imageUrl(o.url) + '" alt=""></button>'; }).join('') + '</div>' +
          '<form id="f-av" novalidate><label class="field"><span>Ou cole um endereço de imagem (https)</span><input type="url" name="url" placeholder="https://..." value="' + (/^https:/.test(atual) ? esc(atual) : '') + '"></label><p class="auth__error" hidden></p><button class="auth__submit" type="submit"><span>Salvar foto</span></button></form>');
        pmBody.addEventListener('click', function (ev) {
          var b2 = ev.target.closest('[data-av]'); if (!b2) return;
          pmBody.querySelectorAll('[data-av]').forEach(function (x) { x.classList.toggle('is-active', x === b2); });
          pmBody.querySelector('#f-av [name="url"]').value = '';
        });
        document.getElementById('f-av').addEventListener('submit', function (ev) {
          ev.preventDefault();
          var sel = pmBody.querySelector('[data-av].is-active');
          var url = ev.currentTarget.url.value.trim() || (sel && sel.dataset.av) || '';
          if (!url) return perr('Escolha um parceiro ou informe um endereço.');
          if (/^https?:/i.test(url) && !/^https:/i.test(url)) return perr('Use um endereço https.');
          var b3 = ev.currentTarget.querySelector('.auth__submit'); b3.classList.add('is-loading'); b3.disabled = true;
          PWU.auth.api.avatar(url).then(function () { closeP(); renderAcc(); PWU.toast('Foto atualizada!', 'ok'); })
            .catch(function (er) { perr(er.message || 'Não foi possível salvar.'); b3.classList.remove('is-loading'); b3.disabled = false; });
        });
      }

      if (act === 'security') {
        openP('<h3>Segurança</h3><p class="sub">Troque a senha da sua conta. Use pelo menos 8 caracteres.</p><form id="f-sec" novalidate>' +
          '<label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password"></label>' +
          '<label class="field"><span>Nova senha</span><input type="password" name="next" autocomplete="new-password"></label>' +
          '<label class="field"><span>Confirmar nova senha</span><input type="password" name="confirm" autocomplete="new-password"></label>' +
          '<p class="auth__error" hidden></p><button class="auth__submit" type="submit"><span>Salvar nova senha</span></button></form>');
        document.getElementById('f-sec').addEventListener('submit', function (ev) {
          ev.preventDefault(); var f = ev.currentTarget;
          if (f.next.value.length < 8) return perr('A nova senha precisa ter pelo menos 8 caracteres.');
          if (f.next.value !== f.confirm.value) return perr('As senhas não coincidem.');
          var b3 = f.querySelector('.auth__submit'); b3.classList.add('is-loading'); b3.disabled = true;
          PWU.auth.api.changePassword(PWU.auth.user.email, f.current.value, f.next.value)
            .then(function () { closeP(); PWU.toast('Senha alterada com sucesso!', 'ok'); })
            .catch(function (er) { perr(er.message); b3.classList.remove('is-loading'); b3.disabled = false; });
        });
      }

      if (act === 'twitch') {
        openP('<h3>Vincular Twitch</h3><p class="sub">Informe seu canal para receber drops e recompensas de lives parceiras.</p><form id="f-tw" novalidate>' +
          '<label class="field"><span>Usuário da Twitch</span><input type="text" name="user" placeholder="seu_canal" value="' + esc(pr.twitch || '') + '"></label><p class="auth__error" hidden></p>' +
          '<button class="auth__submit" type="submit" style="background:#9146ff;color:#fff"><span>Salvar</span></button></form>');
        document.getElementById('f-tw').addEventListener('submit', function (ev) {
          ev.preventDefault(); var v = ev.currentTarget.user.value.trim().replace(/^@/, '');
          if (v && !/^[A-Za-z0-9_]{4,25}$/.test(v)) return perr('Usuário inválido (4 a 25 letras, números ou _).');
          var p3 = PWU.auth.profile(); p3.twitch = v || null; PWU.auth.saveProfile(p3); closeP(); renderAcc(); PWU.toast(v ? 'Twitch vinculada!' : 'Twitch desvinculada.', 'ok');
        });
      }

      if (act === 'new-trainer') {
        if (!jogo || !PWU.auth.user || String(jogo.id) !== String(PWU.auth.user.id)) return PWU.toast('Aguarde o carregamento da conta. Se necessário, entre novamente.');
        if (jogo.trainers.length >= 8) return PWU.toast('Limite de 8 personagens por conta.');
        var creatingAccountId = jogo.id;
        openP('<h3>Novo personagem</h3><p class="sub">Crie seu personagem nesta conta. Ele começará no nível 2, com os padrões do servidor.</p><form id="f-tr" novalidate>' +
          '<label class="field"><span>Nome do personagem</span><input type="text" name="name" minlength="3" maxlength="20" placeholder="Ex.: Ash Ketchum" required></label>' +
          '<p class="sub">Use apenas letras sem acentos e espaços simples entre palavras.</p>' +
          '<label class="field"><span>Gênero</span><select name="sex"><option value="1">Masculino</option><option value="0">Feminino</option></select></label>' +
          '<p class="auth__error" hidden></p><button class="auth__submit" type="submit"><span>Criar treinador</span></button></form>');
        document.getElementById('f-tr').addEventListener('submit', function (ev) {
          ev.preventDefault(); var f = ev.currentTarget, nm = f.name.value.trim();
          if (nm.length < 3 || nm.length > 20 || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(nm)) return perr('Use de 3 a 20 letras sem acentos e espaços simples entre palavras.');
          if (!PWU.auth.user || String(PWU.auth.user.id) !== String(creatingAccountId)) return perr('Sua sessão mudou. Feche este formulário e entre novamente.');
          var submit = f.querySelector('.auth__submit');
          if (submit.disabled) return;
          submit.disabled = true; submit.classList.add('is-loading');
          PWU.auth.api.createCharacter(nm, Number(f.sex.value)).then(function (result) {
            if (!PWU.auth.user || String(PWU.auth.user.id) !== String(creatingAccountId)) return;
            if (jogo && String(jogo.id) === String(creatingAccountId)) jogo.trainers.push(result.character);
            closeP(); renderAcc(); puxarJogo(0);
            PWU.toast('Personagem criado! Atualize a lista de personagens no cliente para entrar.', 'ok');
          }).catch(function (error) {
            perr(error.offline ? 'Não foi possível confirmar a criação. Atualize a conta antes de tentar novamente.' : error.message);
          }).finally(function () { submit.disabled = false; submit.classList.remove('is-loading'); });
        });
      }
    });

    // pacotes de coins (exibição; preço real é do servidor)
    var packsEl = document.getElementById('acc-packs');
    montarValorLivre();
    if (packsEl && PWU.coinPackages) {
      packsEl.innerHTML = PWU.coinPackages.map(function (k, i) {
        var moeda = 'assets/img/coins/pcoin-' + Math.min(6, i + 1) + '.png';
        return '<div class="pack' + (k.badge ? ' is-hot' : '') + '">' + (k.badge ? '<span class="pack__badge">' + esc(k.badge) + '</span>' : '') +
          '<div class="pack__moeda"><img src="' + moeda + '" alt="" loading="lazy"></div><b>' + k.coins.toLocaleString('pt-BR') + '</b><small>Diamond Points</small>' +
          '<em class="pack__bonus">+' + k.bonusPct + '%</em>' +
          '<button type="button" class="btn btn--yellow btn--sm" data-pack="' + k.id + '">' + PWU.brl(k.price) + '</button></div>';
      }).join('');
      packsEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pack]'); if (!b) return;
        location.href = 'pagamento.html?pacote=' + encodeURIComponent(b.dataset.pack); return;
        var k = PWU.coinPackages.find(function (x) { return x.id === b.dataset.pack; }) || {};
        openP('<h3>Como quer pagar?</h3><p class="sub"><b>' + Number(k.coins || 0).toLocaleString('pt-BR') + ' coins</b> por ' + PWU.brl(k.price || 0) + '. Os coins caem na sua conta do jogo assim que o pagamento for confirmado.</p>' +
          '<div class="pay-ways">' +
          '<button type="button" class="pay-way" data-prov="mercadopago"><b>Pix</b><small>QR Code ou Copia e Cola</small></button>' +
          '<button type="button" class="pay-way" data-prov="stripe"><b>Stripe</b><small>Cartão de crédito · internacional</small></button>' +
          '</div><p class="mp-note"><i class="ico ico-lock" aria-hidden="true"></i> Você é levado para o site do provedor. Nenhum dado de cartão passa pelo Pokeworld.</p>');
        pmBody.addEventListener('click', function (ev) {
          var w = ev.target.closest('[data-prov]'); if (!w) return;
          pay(b.dataset.pack, w, w.dataset.prov);
        });
      });
    }
    if (location.hash === '#coins') setTimeout(function () { var d = document.getElementById('coins'); if (d && PWU.auth.user) d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 900);


    // retorno do Mercado Pago
    var pg = qs('pagamento'), al = document.getElementById('acc-alert');
    if (pg && al) {
      al.hidden = false;
      if (pg === 'retorno' || pg === 'aprovado') al.textContent = 'A confirmação é feita diretamente com a Stripe. Assim que confirmada, os Diamond Points aparecem no saldo desta conta.';
      else if (pg === 'pendente') { al.textContent = 'Pagamento pendente. Assim que o Mercado Pago confirmar, creditamos na conta.'; al.classList.add('is-warn'); }
      else { al.textContent = 'Você retornou do pagamento. Se concluiu a compra, aguarde a confirmação no saldo; em caso de dúvida, consulte o suporte.'; al.classList.add('is-err'); }
      history.replaceState(null, '', location.pathname);
    }

    function puxarJogo(tries) {
      if (!PWU.auth.game) return;
      PWU.auth.game().then(function (d) {
        if (!d || !d.id || !PWU.auth.user || String(d.id) !== String(PWU.auth.user.id)) {
          jogo = null; renderAcc(); return;
        }
        jogo = d; renderAcc();
        if (tries > 0) setTimeout(function () { puxarJogo(tries - 1); }, 4000);
      }).catch(function () {});
    }

    renderAcc();
    puxarJogo(pg ? 8 : 0);
    if (!PWU.auth.user) setTimeout(function () { PWU.auth.open('login'); }, 500);
    document.addEventListener('auth:change', function () { jogo = null; renderAcc(); puxarJogo(0); });
  }

  /* =====================================================================
     DOAR — tabela de bônus e pacotes
     ===================================================================== */
  if (page === 'doar' && window.PWU) {
    if (location.hash === '#pacotes') {
      setTimeout(function () {
        var alvo = document.getElementById('pacotes');
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
    var pacotes = PWU.coinPackages || [];
    var corpo = document.getElementById('bonus-rows');   // a página de doação não usa mais a tabela
    if (corpo) {
      corpo.innerHTML = pacotes.map(function (k) {
        return '<tr><td class="val">' + PWU.brl(k.price) + '</td>' +
          '<td class="base">' + k.base.toLocaleString('pt-BR') + '</td>' +
          '<td><span class="bonus">+' + k.bonusPct + '% · ' + k.bonus.toLocaleString('pt-BR') + '</span></td>' +
          '<td class="coins">' + k.coins.toLocaleString('pt-BR') + ' Diamond Points</td>' +
          '<td><button type="button" class="btn btn--yellow btn--sm" data-pack="' + k.id + '">Doar</button></td></tr>';
      }).join('');
    }
    var grade = document.getElementById('doar-packs');
    if (grade) {
      grade.innerHTML = pacotes.map(function (k, i) {
        var moeda = 'assets/img/coins/pcoin-' + Math.min(6, i + 1) + '.png';
        return '<div class="pack' + (k.badge ? ' is-hot' : '') + '">' + (k.badge ? '<span class="pack__badge">' + esc(k.badge) + '</span>' : '') +
          '<div class="pack__moeda"><img src="' + moeda + '" alt="" loading="lazy"></div><b>' + k.coins.toLocaleString('pt-BR') + '</b><small>Diamond Points</small>' +
          '<em class="pack__bonus">+' + k.bonusPct + '%</em>' +
          '<button type="button" class="btn btn--yellow btn--sm" data-pack="' + k.id + '">' + PWU.brl(k.price) + '</button></div>';
      }).join('');
    }
    montarValorLivre();

    // ----- vida na página: saudação, saldo, entrada, inclinação e medidor de bônus -----
    if (grade) {
      var u0 = PWU.auth.user;
      var nomeEl = document.getElementById('doar-nome');
      if (nomeEl && u0 && u0.name) nomeEl.textContent = u0.name;
      var saldoEl = document.getElementById('doar-saldo');
      if (saldoEl && PWU.auth.coins) PWU.auth.coins().then(function (n) {
        if (n == null) return;
        saldoEl.hidden = false; saldoEl.querySelector('b').textContent = Number(n).toLocaleString('pt-BR');
      }).catch(function () {});

      var cards = [].slice.call(grade.querySelectorAll('.pack'));
      var meter = document.getElementById('bonus-meter');
      // cada marca fica embaixo do centro do seu pacote
      function centro(i) { return (i + .5) / pacotes.length * 100; }
      if (meter) {
        meter.querySelector('.bonus-meter__pontos').innerHTML = pacotes.map(function (k) {
          return '<span style="left:' + centro(pacotes.indexOf(k)) + '%"><b>+' + k.bonusPct + '%</b><small>' + PWU.brl(k.price).replace(',00', '') + '</small></span>';
        }).join('');
      }
      function marcar(i) {
        cards.forEach(function (c, n) { c.classList.toggle('is-foco', n === i); });
        if (!meter) return;
        var pct = i < 0 ? 0 : centro(i);
        meter.style.setProperty('--pos', pct + '%');
        meter.classList.toggle('is-on', i >= 0);
        [].forEach.call(meter.querySelectorAll('.bonus-meter__pontos span'), function (sp, n) { sp.classList.toggle('is-on', n === i); });
      }
      var fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      cards.forEach(function (c, i) {
        c.addEventListener('mouseenter', function () { marcar(i); });
        c.addEventListener('focusin', function () { marcar(i); });
        if (!fino) return;
        c.addEventListener('mousemove', function (e) {
          var r = c.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
          c.style.setProperty('--rx', (-y * 10).toFixed(2) + 'deg');
          c.style.setProperty('--ry', (x * 12).toFixed(2) + 'deg');
          c.style.setProperty('--mx', ((x + .5) * 100).toFixed(1) + '%');
          c.style.setProperty('--my', ((y + .5) * 100).toFixed(1) + '%');
        });
        c.addEventListener('mouseleave', function () { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
      });
      // começa apontando para o mais popular
      var ini = pacotes.findIndex(function (k) { return k.badge; });
      marcar(ini < 0 ? 0 : ini);

      if (G) {
        G.from(cards, { y: 50, autoAlpha: 0, duration: .7, stagger: .08, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        cards.forEach(function (c, i) {
          var b = c.querySelector('b'), alvo = pacotes[i].coins, o = { v: 0 };
          G.to(o, { v: alvo, duration: 1.1, delay: .2 + i * .08, ease: 'power2.out', onUpdate: function () { b.textContent = Math.round(o.v).toLocaleString('pt-BR'); } });
        });
        if (meter) G.from(meter, { y: 30, autoAlpha: 0, duration: .7, delay: .6, ease: 'power3.out' });
      }
      // moedas subindo ao fundo
      var ceu = document.querySelector('.doar-moedas');
      if (ceu && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var h = '';
        for (var m = 0; m < 14; m++) h += '<i style="left:' + (4 + Math.random() * 92).toFixed(1) + '%;--s:' + (1.6 + Math.random() * 2.6).toFixed(2) + 'rem;--d:' + (9 + Math.random() * 10).toFixed(1) + 's;--a:-' + (Math.random() * 14).toFixed(1) + 's"></i>';
        ceu.innerHTML = h;
      }
    }

    var pmD = document.getElementById('pmodal'), pmBodyD = document.getElementById('pmodal-body');
    function abrirD(html) { pmBodyD.innerHTML = html; pmD.hidden = false; document.body.classList.add('is-locked'); }
    pmD.addEventListener('click', function (e) { if (e.target.closest('[data-pclose]')) { pmD.hidden = true; document.body.classList.remove('is-locked'); } });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pack]'); if (!b) return;
      if (!PWU.auth.user) { PWU.toast('Entre na sua conta para doar e receber os Diamond Points.'); setTimeout(function () { location.href = 'login.html'; }, 1200); return; }
      location.href = 'pagamento.html?pacote=' + encodeURIComponent(b.dataset.pack); return;
      var k = pacotes.find(function (x) { return x.id === b.dataset.pack; }) || {};
      abrirD('<h3>Como quer pagar?</h3><p class="sub"><b>' + Number(k.coins || 0).toLocaleString('pt-BR') + ' coins</b> por ' + PWU.brl(k.price || 0) + (k.bonusPct ? ' · já com ' + k.bonusPct + '% de bônus' : '') + '.</p>' +
        '<div class="pay-ways"><button type="button" class="pay-way" data-prov="mercadopago"><b>Pix</b><small>QR Code ou Copia e Cola</small></button>' +
        '<button type="button" class="pay-way" data-prov="stripe"><b>Stripe</b><small>Cartão de crédito · internacional</small></button></div>' +
        '<p class="mp-note"><i class="ico ico-lock" aria-hidden="true"></i> Você é levado para o site do provedor. Nenhum dado de cartão passa pelo Pokeworld.</p>');
      pmBodyD.addEventListener('click', function (ev) {
        var w = ev.target.closest('[data-prov]'); if (!w) return;
        pay(b.dataset.pack, w, w.dataset.prov);
      });
    });
  }

  /* =====================================================================
     PÁGINAS DA CONTA: tickets, segurança, foto de perfil e pagamento
     ===================================================================== */
  /* ----- valor livre de doação (usado em /Donate e em Minha Conta) ----- */
  function montarValorLivre() {
    var fValor = document.getElementById('f-valor');
    if (fValor) {
      var campoV = fValor.querySelector('input'), dicaV = document.getElementById('valor-livre-dica');
      function dica() {
        var v = PWU.valorLivre(campoV.value);
        fValor.classList.toggle('is-erro', !!campoV.value && !v);
        if (!campoV.value) { dicaV.innerHTML = 'A partir de R$ 100 você já ganha bônus.'; return; }
        if (!v) { dicaV.innerHTML = 'Informe um valor entre <b>R$ 10</b> e <b>R$ 20.000</b>.'; return; }
        dicaV.innerHTML = v.bonusPct
          ? 'Com ' + PWU.brl(v.price) + ' você recebe <b>' + v.credits.toLocaleString('pt-BR') + ' créditos</b> (+' + v.bonusPct + '% de bônus).'
          : 'Com ' + PWU.brl(v.price) + ' você recebe <b>' + v.credits.toLocaleString('pt-BR') + ' créditos</b>. A partir de R$ 100 tem bônus.';
      }
      campoV.addEventListener('input', function () { campoV.value = campoV.value.replace(/[^\d.,]/g, ''); dica(); });
      fValor.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = PWU.valorLivre(campoV.value);
        if (!v) { fValor.classList.add('is-erro'); dica(); campoV.focus(); return; }
        location.href = 'pagamento.html?pacote=custom&valor=' + v.price;
      });
    }
  }

  /* ----- autenticador por aplicativo (página Segurança) ----- */
  function montarTotp() {
    var area = document.getElementById('totp-area'); if (!area || area.dataset.pronto) return;
    area.dataset.pronto = '1';   // a página chama isto mais de uma vez; os botões só podem ganhar um clique
    var estado = document.getElementById('totp-estado'), bAtivar = document.getElementById('totp-ativar'), bDesat = document.getElementById('totp-desativar'), aviso = document.getElementById('totp-aviso');
    var card = document.getElementById('totp-card');
    function msg(t, ok) { aviso.textContent = t || ''; aviso.hidden = !t; aviso.classList.toggle('is-ok', !!ok); }
    function estadoAtual(on) {
      estado.textContent = on ? 'ativa' : 'desativada'; estado.classList.toggle('ok', !!on);
      card.classList.toggle('is-on', !!on);
      bAtivar.style.display = on ? 'none' : ''; bDesat.style.display = on ? '' : 'none';   // [hidden] perde para o display do .btn
      var old = area.querySelector('.totp__setup'); if (old) old.remove();
    }
    PWU.auth.game().then(function (d) {
      estadoAtual(!!(d && d.totp));
      if (d && d.totpDisponivel === false) {
        estado.textContent = 'em preparação';
        bAtivar.disabled = true; bDesat.style.display = 'none';
        msg('O autenticador por aplicativo será disponibilizado após a ativação pela equipe. A confirmação por e-mail continua funcionando.');
      } else if (d && d.totp) {
        bDesat.style.display = 'none';
        msg('Verificação obrigatória. Se perder o acesso ao aplicativo, contate o suporte.');
      }
    }).catch(function () {});

    bAtivar.addEventListener('click', function () {
      bAtivar.disabled = true; msg('');
      PWU.auth.api.totpSetup().then(function (d) {
        var antigo = area.querySelector('.totp__setup'); if (antigo) antigo.remove();
        var box = document.createElement('div'); box.className = 'totp__setup';
        box.innerHTML = '<p>1. Abra o Google Authenticator, Authy ou similar e leia o QR Code:</p><div class="totp__qr" id="totp-qr"></div>' +
          '<p>Ou digite a chave manualmente: <code>' + esc(d.secret.replace(/(.{4})/g, '$1 ').trim()) + '</code></p>' +
          '<p>2. Digite o código de 6 dígitos que o aplicativo mostra:</p>' +
          '<div class="totp__linha"><input id="totp-confirma" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"><button type="button" class="btn btn--yellow btn--sm" id="totp-confirmar">Confirmar</button><button type="button" class="btn btn--ghost btn--sm" id="totp-cancelar">Cancelar</button></div>';
        area.appendChild(box);
        var qr = document.getElementById('totp-qr');
        if (window.qrcode) { var q = qrcode(0, 'M'); q.addData(d.otpauth); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
        else qr.innerHTML = '<span class="totp__semqr">Não consegui desenhar o QR Code. Use a chave manual ao lado.</span>';
        var campo = document.getElementById('totp-confirma'); campo.focus();
        campo.addEventListener('input', function () { campo.value = campo.value.replace(/\D/g, ''); });
        document.getElementById('totp-cancelar').addEventListener('click', function () { box.remove(); bAtivar.disabled = false; });
        function confirmar() {
          if (campo.value.length !== 6) return msg('Digite os 6 dígitos do aplicativo.');
          PWU.auth.api.totpEnable(campo.value).then(function () { estadoAtual(true); bAtivar.disabled = false; msg('Autenticador ativado. A partir de agora o login pede o código do app.', true); PWU.toast('Autenticador ativado!', 'ok'); })
            .catch(function (er) { msg(er.message || 'Código inválido.'); });
        }
        document.getElementById('totp-confirmar').addEventListener('click', confirmar);
        campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
      }).catch(function (er) { bAtivar.disabled = false; msg(er.offline ? 'O autenticador depende do servidor do jogo, que está fora do ar agora.' : (er.message || 'Não foi possível iniciar.')); });
    });

    bDesat.addEventListener('click', function () {
      var senha = prompt('Para desativar o autenticador, confirme sua senha:'); if (!senha) return;
      PWU.auth.api.totpDisable(senha).then(function () { estadoAtual(false); msg('Autenticador desativado.', true); })
        .catch(function (er) { msg(er.message || 'Não foi possível desativar.'); });
    });
  }

  // verificação em duas etapas obrigatória: conta sem ativar volta para o login
  if (['minha-conta', 'tickets', 'seguranca', 'perfil', 'pagamento', 'doar'].indexOf(page) > -1 && window.PWU && PWU.auth.user && PWU.auth.user.game && PWU.auth.user.totpPendente) {
    location.replace('login.html' + (page === 'doar' || page === 'pagamento' ? '?next=Donate' : ''));
    return;
  }

  if (['tickets', 'seguranca', 'perfil', 'pagamento'].indexOf(page) > -1 && window.PWU) {
    var portao = document.getElementById('acc-gate'), area = document.getElementById('acc');
    var jogoConta = null;

    function mostrar() {
      var logado = !!PWU.auth.user;
      portao.hidden = logado; area.hidden = !logado;
      if (!logado) return;
      if (PWU.auth.game) PWU.auth.game().then(function (d) { if (d && d.id) { jogoConta = d; pintar(); } });
      pintar();
    }
    function err(sel, msg) { var p = document.querySelector(sel + ' .auth__error'); if (p) { p.textContent = msg || ''; p.hidden = !msg; } }

    function pintar() {
      // ----- tickets -----
      var lista = document.getElementById('lista-tickets');
      if (lista) {
        var ts = (PWU.auth.profile() || {}).tickets || [];
        lista.innerHTML = ts.length ? ts.slice().reverse().map(function (t) {
          return '<div class="ticket"><b>#' + esc(t.id) + ' · ' + esc(t.subject) + '</b><small>' + new Date(t.at).toLocaleString('pt-BR') + ' · Aberto</small></div>';
        }).join('') : '<p class="sec__sub" style="margin:0">Você ainda não abriu nenhum chamado.</p>';
      }
      // ----- foto de perfil -----
      var grade = document.getElementById('grade-avatar');
      if (grade && !grade.dataset.pronto) {
        grade.dataset.pronto = '1';
        var atual = PWU.avatarUrl ? PWU.avatarUrl(PWU.auth.user) : '';
        grade.innerHTML = (PWU.avatares || []).map(function (x) {
          return '<button type="button" data-av="' + imageUrl(x.image) + '" class="' + (x.image === atual ? 'is-active' : '') + '" title="' + esc(x.name) + '"><img src="' + imageUrl(x.image) + '" alt=""></button>';
        }).join('');
        grade.addEventListener('click', function (e) {
          var b = e.target.closest('[data-av]'); if (!b) return;
          grade.querySelectorAll('[data-av]').forEach(function (x) { x.classList.toggle('is-active', x === b); });
          document.getElementById('acc-avatar').src = b.dataset.av;
          var u = document.querySelector('#f-av [name="url"]'); if (u) u.value = '';
        });
      }
      var av = document.getElementById('acc-avatar');
      if (av && PWU.avatarUrl) av.src = PWU.avatarUrl(PWU.auth.user);
      // ----- aparelhos -----
      if (page === 'seguranca') { carregarAparelhos(); montarTotp(); }
    }

    // ----- tickets: enviar -----
    var fTicket = document.getElementById('f-ticket');
    if (fTicket) fTicket.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = fTicket.message.value.trim();
      if (msg.length < 10) return err('#f-ticket', 'Escreva pelo menos 10 caracteres.');
      err('#f-ticket', '');
      var b = fTicket.querySelector('.auth__submit'); b.classList.add('is-loading'); b.disabled = true;
      var envio = (jogoConta && PWU.auth.api.ticket) ? PWU.auth.api.ticket(fTicket.subject.value, msg)
        : Promise.resolve().then(function () { var pr = PWU.auth.profile(); pr.tickets.push({ id: 1000 + pr.tickets.length + 1, subject: fTicket.subject.value, message: msg, at: Date.now() }); PWU.auth.saveProfile(pr); });
      envio.then(function () { fTicket.reset(); PWU.toast('Ticket enviado! Responderemos por e-mail.', 'ok'); pintar(); })
        .catch(function (er) { err('#f-ticket', er.message || 'Não foi possível enviar.'); })
        .finally(function () { b.classList.remove('is-loading'); b.disabled = false; });
    });

    // ----- segurança: senha -----
    var fSec = document.getElementById('f-sec');
    if (fSec) fSec.addEventListener('submit', function (e) {
      e.preventDefault();
      if (fSec.next.value.length < 8) return err('#f-sec', 'A nova senha precisa ter pelo menos 8 caracteres.');
      if (fSec.next.value !== fSec.confirm.value) return err('#f-sec', 'As senhas não coincidem.');
      err('#f-sec', '');
      var b = fSec.querySelector('.auth__submit'); b.classList.add('is-loading'); b.disabled = true;
      PWU.auth.api.changePassword(PWU.auth.user.email, fSec.current.value, fSec.next.value)
        .then(function () { fSec.reset(); PWU.toast('Senha alterada com sucesso!', 'ok'); })
        .catch(function (er) { err('#f-sec', er.message); })
        .finally(function () { b.classList.remove('is-loading'); b.disabled = false; });
    });

    // ----- segurança: aparelhos autorizados -----
    function carregarAparelhos() {
      var el = document.getElementById('lista-aparelhos'); if (!el || !PWU.auth.devices) return;
      PWU.auth.devices().then(function (d) {
        var st = document.getElementById('dev-status');
        if (!d || d.missing) { el.innerHTML = '<p class="db-note">A verificação por código ainda não está ativa. Rode <b>sql/site-tables.sql</b> no banco do jogo para ligar.</p>'; return; }
        if (st) st.textContent = d.devices.length + ' aparelho(s) autorizado(s)';
        el.innerHTML = d.devices.map(function (v) {
          var atual = v.device_id === d.atual;
          return '<div class="device' + (atual ? ' is-current' : '') + '"><div class="device__ico">' + (/Android|iOS/.test(v.label || '') ? '<i class="ico ico-phone" aria-hidden="true"></i>' : '<i class="ico ico-laptop" aria-hidden="true"></i>') + '</div>' +
            '<div><b>' + esc(v.label || 'Aparelho') + '</b><small>' + (v.last_ip ? 'IP ' + esc(v.last_ip) + ' · ' : '') + 'último acesso ' + new Date(v.last_seen).toLocaleString('pt-BR') + '</small></div>' +
            (atual ? '<span class="tag-atual">Este aparelho</span>' : '<button type="button" data-rmdev="' + esc(v.device_id) + '">Remover</button>') + '</div>';
        }).join('') || '<p class="sec__sub" style="margin:0">Nenhum aparelho registrado ainda.</p>';
      }).catch(function () {});
    }
    var listaAp = document.getElementById('lista-aparelhos');
    if (listaAp) listaAp.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rmdev]'); if (!b) return;
      if (!confirm('Remover este aparelho? Ele vai precisar de um novo código para entrar.')) return;
      PWU.auth.removeDevice(b.dataset.rmdev).then(function () { carregarAparelhos(); PWU.toast('Aparelho removido.'); });
    });

    // ----- foto de perfil: salvar -----
    var fAv = document.getElementById('f-av');
    if (fAv) fAv.addEventListener('submit', function (e) {
      e.preventDefault();
      var sel = document.querySelector('#grade-avatar [data-av].is-active');
      var url = fAv.url.value.trim() || (sel && sel.dataset.av) || '';
      if (!url) return err('#f-av', 'Escolha um parceiro ou informe um endereço.');
      if (/^http:/i.test(url)) return err('#f-av', 'Use um endereço https.');
      err('#f-av', '');
      var b = fAv.querySelector('.auth__submit'); b.classList.add('is-loading'); b.disabled = true;
      PWU.auth.api.avatar(url).then(function () { PWU.toast('Foto atualizada!', 'ok'); setTimeout(function () { location.href = 'minha-conta.html'; }, 900); })
        .catch(function (er) { err('#f-av', er.message || 'Não foi possível salvar.'); b.classList.remove('is-loading'); b.disabled = false; });
    });

    // ----- pagamento -----
    if (page === 'pagamento') {
      var pid = qs('pacote') || 'plus';
      var k = (PWU.coinPackages || []).find(function (x) { return x.id === pid; }) || (PWU.coinPackages || [])[0];
      var valorLivre = null;
      if (pid === 'custom') {
        valorLivre = PWU.valorLivre(qs('valor'));
        if (!valorLivre) { location.replace('Donate'); return; }
        k = { id: 'custom', price: valorLivre.price, bonusPct: valorLivre.bonusPct, coins: valorLivre.credits };
      }
      var resumo = document.getElementById('resumo-pedido');
      var cupomAplicado = null;   // { code, pct, price } depois de validado
      function desenharResumo() {
        if (!k || !resumo) return;
        // só o que importa para quem está pagando: o bônus que recebe e o valor
        var valor = cupomAplicado
          ? '<div class="resumo__de">' + PWU.brl(k.price) + '</div><div class="resumo__valor">' + PWU.brl(cupomAplicado.price) + '</div>' +
            '<div class="resumo__legenda">com o cupom <b>' + esc(cupomAplicado.code) + '</b> (−' + cupomAplicado.pct + '%)</div>'
          : '<div class="resumo__valor">' + PWU.brl(k.price) + '</div><div class="resumo__legenda">valor da sua doação</div>';
        resumo.innerHTML = '<div class="resumo__bonus"><b>+' + k.bonusPct + '%</b><span>de bônus</span></div><div class="resumo__lado">' + valor + '</div>';
      }
      desenharResumo();

      // cupom: confere no servidor e mostra o novo valor; o checkout valida de novo
      var fCupom = document.getElementById('f-cupom');
      if (fCupom && k) {
        var campo = fCupom.querySelector('input'), msg = fCupom.querySelector('.cupom__msg'), bt = fCupom.querySelector('button');
        function aviso(t, ok) { msg.textContent = t || ''; msg.hidden = !t; msg.classList.toggle('is-ok', !!ok); }
        campo.addEventListener('input', function () {
          campo.value = campo.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          if (cupomAplicado) { cupomAplicado = null; desenharResumo(); bt.textContent = 'Aplicar'; }
          aviso('');
        });
        fCupom.addEventListener('submit', function (e) {
          e.preventDefault();
          if (cupomAplicado) { cupomAplicado = null; campo.value = ''; bt.textContent = 'Aplicar'; desenharResumo(); aviso(''); return; }
          var code = campo.value.trim();
          if (!code) return aviso('Digite o código do cupom.');
          bt.disabled = true;
          fetch('/api/coupon?code=' + encodeURIComponent(code) + '&pacote=' + encodeURIComponent(k.id) + (valorLivre ? '&amount=' + valorLivre.price : ''))
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d.valid) return aviso(d.error || 'Cupom inválido ou expirado.');
              cupomAplicado = { code: d.code, pct: d.pct, price: d.price };
              desenharResumo(); bt.textContent = 'Remover';
              aviso('Cupom aplicado: ' + d.pct + '% de desconto.', true);
            })
            .catch(function () { aviso('Não consegui conferir o cupom agora. Tente de novo.'); })
            .then(function () { bt.disabled = false; });
        });
      }

      var meios = document.getElementById('meios-pagamento');

      var pixCpf = document.getElementById('pix-cpf');
      var pixEmail = document.getElementById('pix-email');
      var payerError = document.getElementById('payment-payer-error');
      function payerMessage(message) { payerError.textContent = message || ''; payerError.hidden = !message; }
      function refreshPayer() {
        pixEmail.value = PWU.auth.user ? PWU.auth.user.email || '' : '';
        pixCpf.value = ''; pixCpf.removeAttribute('aria-invalid'); payerMessage('');
      }
      if (pixCpf && pixEmail) {
        refreshPayer();
        document.addEventListener('auth:change', refreshPayer);
        window.addEventListener('pagehide', function () { pixCpf.value = ''; });
        pixCpf.addEventListener('input', function () {
          var digits = pixCpf.value.replace(/\D/g, '').slice(0, 11);
          pixCpf.value = digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2').replace(/(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
          pixCpf.removeAttribute('aria-invalid'); payerMessage('');
        });
      }
      if (meios) meios.addEventListener('click', function (e) {
        var w = e.target.closest('[data-prov]'); if (!w || meios.querySelector('[data-prov]:disabled') || !k) return;
        if (bt && bt.disabled) { PWU.toast('Aguarde a confirmação do cupom.'); return; }
        var cpf = null;
        if (w.dataset.prov === 'mercadopago') {
          if (!pixCpf || !validCpf(pixCpf.value)) {
            payerMessage('Informe um CPF válido para gerar o Pix.');
            if (pixCpf) { pixCpf.setAttribute('aria-invalid', 'true'); pixCpf.focus(); }
            return;
          }
          cpf = pixCpf.value.replace(/\D/g, '');
        }
        payerMessage('');
        if (pixCpf) pixCpf.disabled = true;
        if (campo) campo.disabled = true;
        if (bt) bt.disabled = true;
        pay(k.id, w, w.dataset.prov, cupomAplicado ? cupomAplicado.code : null, valorLivre ? valorLivre.price : null, payerMessage, cpf).then(function () {
          if (!w.disabled) {
            if (pixCpf) pixCpf.disabled = false;
            if (campo) campo.disabled = false;
            if (bt) bt.disabled = false;
          }
        });
      });
    }

    mostrar();
    document.addEventListener('auth:change', mostrar);
  }

  /* contador do rodapé */
  document.querySelectorAll('.site-footer .count').forEach(function (el) {
    if (!G) return;
    ScrollTrigger.create({ trigger: el, start: 'top 95%', once: true, onEnter: function () {
      var o = { v: 0 }; G.to(o, { v: +el.dataset.count, duration: 2, ease: 'power2.out', onUpdate: function () { el.textContent = Math.round(o.v).toLocaleString('pt-BR'); } });
    } });
  });

  reveal();
  window.addEventListener('load', function () { if (G) ScrollTrigger.refresh(); });
})();
