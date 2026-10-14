/* =====================================================================
   POKEWORLD UNIVERSE — painel admin (notícias, pokémon, textos)
   Funciona com Supabase (auth + tabelas) ou em modo local.
   ===================================================================== */
(function () {
  var store = PWU.store, cfg = window.PWU_CONFIG || {};
  var sb = store.client;
  var isSupabase = store.mode === 'supabase';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slugify(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  var ROLES = PWU.roles, TAGS = ['Novidade', 'Atualização', 'Evento', 'Comunidade'];

  /* =====================================================================
     Login
     ===================================================================== */
  var loginBox = $('#admin-login'), loginForm = $('#admin-login-form'), panel = $('#admin');
  $('#admin-mode-text').textContent = isSupabase ? 'Conectado ao Supabase. Entre com uma conta marcada como admin.' : 'Modo local (sem Supabase). Use a senha definida em config.js.';
  if (!isSupabase) $('#admin-email-field').hidden = true;
  var badge = $('#admin-mode-badge');
  badge.textContent = isSupabase ? '● Supabase conectado' : '○ Modo local (navegador)';
  badge.classList.toggle('is-supabase', isSupabase);

  function showError(form, msg) { var p = form.querySelector('.auth__error'); p.textContent = msg; p.hidden = !msg; }
  function enter() { loginBox.hidden = true; panel.hidden = false; store.ready.then(function () { renderAll(); var t = new URLSearchParams(location.search).get('tab'); if (t) switchTab(t); }); }

  function checkSession() {
    if (isSupabase) {
      return sb.auth.getSession().then(function (r) {
        var u = r.data.session && r.data.session.user; if (!u) return false;
        return sb.from('profiles').select('is_admin').eq('id', u.id).single().then(function (p) { return !!(p.data && p.data.is_admin); });
      });
    }
    return Promise.resolve(sessionStorage.getItem('pwu_admin') === '1');
  }
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = loginForm.email.value.trim(), pass = loginForm.password.value;
    var btn = loginForm.querySelector('.auth__submit'); btn.classList.add('is-loading'); btn.disabled = true;
    var p;
    if (isSupabase) {
      p = sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
        if (r.error) throw new Error('E-mail ou senha incorretos.');
        return sb.from('profiles').select('is_admin').eq('id', r.data.user.id).single();
      }).then(function (r) {
        if (!r.data || !r.data.is_admin) { sb.auth.signOut(); throw new Error('Esta conta não tem permissão de admin. Rode: update profiles set is_admin = true where email = \'' + email + '\';'); }
      });
    } else {
      p = new Promise(function (res, rej) { setTimeout(function () { pass === (cfg.LOCAL_ADMIN_PASSWORD || 'pokeworld') ? res() : rej(new Error('Senha incorreta.')); }, 400); }).then(function () { sessionStorage.setItem('pwu_admin', '1'); });
    }
    p.then(function () { showError(loginForm, ''); enter(); }).catch(function (err) { showError(loginForm, err.message); }).finally(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  });
  $('#admin-logout').addEventListener('click', function () {
    if (isSupabase) sb.auth.signOut(); else sessionStorage.removeItem('pwu_admin');
    location.reload();
  });
  checkSession().then(function (ok) { if (ok) enter(); });

  /* =====================================================================
     Abas
     ===================================================================== */
  function switchTab(tab) {
    $$('.admin__nav button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === tab); });
    $$('.admin__panel').forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
  }
  $$('.admin__nav button').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.dataset.tab); }); });

  /* =====================================================================
     Gaveta de edição (formulário genérico)
     ===================================================================== */
  var drawer = $('#drawer'), drawerForm = $('#drawer-form'), drawerBody = $('#drawer-body'), onSave = null;
  function openDrawer(title, html, save) {
    $('#drawer-title').textContent = title; drawerBody.innerHTML = html; onSave = save; showError(drawerForm, '');
    drawer.hidden = false; document.body.classList.add('is-locked');
    // upload de imagem
    $$('.upload input', drawerBody).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.files[0]; if (!f) return;
        var label = inp.parentElement; label.textContent = 'Enviando...';
        store.upload(f).then(function (url) {
          var target = drawerBody.querySelector('[name="' + inp.dataset.target + '"]'); target.value = url;
          drawerBody.querySelector('[data-preview="' + inp.dataset.target + '"]').src = url;
          label.textContent = 'Imagem enviada'; PWU.toast('Imagem enviada!', 'ok');
        }).catch(function (e) { label.textContent = '⬆ Enviar imagem'; showError(drawerForm, e.message); });
      });
    });
    $$('[data-preview]', drawerBody).forEach(function (img) {
      var inp = drawerBody.querySelector('[name="' + img.dataset.preview + '"]');
      inp.addEventListener('input', function () { img.src = inp.value; });
    });
    var auto = drawerBody.querySelector('[data-slug-from]');
    if (auto) { var src = drawerBody.querySelector('[name="' + auto.dataset.slugFrom + '"]'); src.addEventListener('input', function () { if (!auto.dataset.touched) auto.value = slugify(src.value); }); auto.addEventListener('input', function () { auto.dataset.touched = '1'; }); }
  }
  function closeDrawer() { drawer.hidden = true; document.body.classList.remove('is-locked'); }
  drawer.addEventListener('click', function (e) { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });
  drawerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#drawer-save'); btn.disabled = true; btn.textContent = 'Salvando...';
    Promise.resolve().then(function () { return onSave(new FormData(drawerForm)); })
      .then(function () { closeDrawer(); renderAll(); PWU.toast('Salvo com sucesso!', 'ok'); })
      .catch(function (err) { showError(drawerForm, err.message || 'Erro ao salvar.'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Salvar'; });
  });

  function field(label, name, value, opts) {
    opts = opts || {};
    if (opts.type === 'textarea') return '<label class="field"><span>' + label + '</span><textarea name="' + name + '" ' + (opts.rows ? 'rows="' + opts.rows + '"' : '') + '>' + esc(value) + '</textarea></label>' + (opts.hint ? '<p class="hint">' + opts.hint + '</p>' : '');
    if (opts.type === 'select') return '<label class="field"><span>' + label + '</span><select name="' + name + '">' + opts.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    return '<label class="field"><span>' + label + '</span><input type="' + (opts.type || 'text') + '" name="' + name + '" value="' + esc(value) + '" ' + (opts.attrs || '') + '></label>' + (opts.hint ? '<p class="hint">' + opts.hint + '</p>' : '');
  }
  function imgField(name, value) {
    return '<div class="img-field"><img data-preview="' + name + '" src="' + esc(value || 'assets/logo-sigla.png') + '" alt=""><div>' +
      field('Imagem (URL)', name, value || '') +
      '<label class="upload">⬆ Enviar imagem<input type="file" accept="image/*" data-target="' + name + '"></label></div></div>';
  }
  function sw(label, name, on) { return '<label class="switch"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '><i></i>' + label + '</label>'; }

  /* =====================================================================
     Notícias
     ===================================================================== */
  function renderNews() {
    var q = ($('#news-search').value || '').toLowerCase();
    var list = store.news(true).filter(function (n) { return (n.title + ' ' + n.tag).toLowerCase().indexOf(q) > -1; });
    var tb = $('#news-table tbody');
    tb.innerHTML = list.map(function (n) {
      return '<tr class="' + (n.hidden ? 'is-hidden' : '') + '"><td><img class="thumb" src="' + esc(n.image) + '" alt=""></td>' +
        '<td class="title">' + esc(n.title) + '<small>' + esc(n.slug) + '</small></td><td><span class="pill-tag">' + esc(n.tag) + '</span></td><td>' + PWU.fmtDate(n.date) + '</td>' +
        '<td>' + (n.hidden ? '<span class="pill-tag off">Oculta</span>' : '<span class="pill-tag ok">Publicada</span>') + (n.featured ? ' <span class="pill-tag star">Destaque</span>' : '') + '</td>' +
        '<td><div class="row-actions"><button type="button" data-act="view" data-id="' + esc(n.slug) + '">Ver</button><button type="button" data-act="edit" data-id="' + esc(n.slug) + '">Editar</button><button type="button" data-act="toggle" data-id="' + esc(n.slug) + '">' + (n.hidden ? 'Publicar' : 'Ocultar') + '</button><button type="button" class="danger" data-act="del" data-id="' + esc(n.slug) + '">Excluir</button></div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="admin-empty">Nenhuma notícia.</td></tr>';
  }
  function newsForm(n) {
    n = n || { slug: '', title: '', tag: 'Novidade', date: new Date().toISOString().slice(0, 10), image: '', excerpt: '', body: [], featured: false, hidden: false };
    var isNew = !n.slug;
    openDrawer(isNew ? 'Nova notícia' : 'Editar notícia',
      field('Título', 'title', n.title) +
      field('Slug (URL)', 'slug', n.slug, { attrs: (isNew ? 'data-slug-from="title"' : 'readonly'), hint: 'Endereço da notícia: noticia.html?id=<b>slug</b>' }) +
      '<div class="grid-2">' + field('Categoria', 'tag', n.tag, { type: 'select', options: TAGS.map(function (t) { return [t, t]; }) }) + field('Data', 'date', n.date, { type: 'date' }) + '</div>' +
      imgField('image', n.image) +
      field('Resumo', 'excerpt', n.excerpt, { type: 'textarea', rows: 3 }) +
      field('Conteúdo', 'body', (n.body || []).join('\n\n'), { type: 'textarea', rows: 14, hint: 'Um parágrafo por linha em branco. Use <b>## </b> no início para um subtítulo e <b>- </b> para itens de lista.' }) +
      '<div class="switches">' + sw('Destaque na página de notícias', 'featured', n.featured) + sw('Ocultar do site', 'hidden', n.hidden) + '</div>',
      function (fd) {
        var title = fd.get('title').trim(), slug = slugify(fd.get('slug') || title);
        if (!title) throw new Error('Informe o título.');
        if (!slug) throw new Error('Informe o slug.');
        if (isNew && store.news(true).some(function (x) { return x.slug === slug; })) throw new Error('Já existe uma notícia com este slug.');
        var body = fd.get('body').split(/\n\s*\n|\n(?=\s*(?:-|##)\s)/).map(function (s) { return s.trim(); }).filter(Boolean);
        var item = { slug: slug, title: title, tag: fd.get('tag'), date: fd.get('date') || new Date().toISOString().slice(0, 10), image: fd.get('image').trim(), excerpt: fd.get('excerpt').trim(), body: body, featured: fd.get('featured') === 'on', hidden: fd.get('hidden') === 'on', sort: n.sort || 0 };
        return store.saveNews(item);
      });
  }
  $('#news-new').addEventListener('click', function () { newsForm(null); });
  $('#news-search').addEventListener('input', renderNews);
  $('#news-table').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var n = store.news(true).find(function (x) { return x.slug === b.dataset.id; }); if (!n) return;
    if (b.dataset.act === 'view') window.open('noticia.html?id=' + n.slug, '_blank');
    if (b.dataset.act === 'edit') newsForm(n);
    if (b.dataset.act === 'toggle') store.saveNews(Object.assign({}, n, { hidden: !n.hidden })).then(function () { renderNews(); PWU.toast(n.hidden ? 'Notícia publicada.' : 'Notícia oculta.', 'ok'); });
    if (b.dataset.act === 'del' && confirm('Excluir "' + n.title + '"? Esta ação não pode ser desfeita.')) store.deleteNews(n.slug).then(function () { renderNews(); PWU.toast('Notícia excluída.'); });
  });

  /* =====================================================================
     Pokémon
     ===================================================================== */
  function renderPk() {
    var q = ($('#pk-search').value || '').toLowerCase();
    var list = store.pokemon(true).filter(function (p) { return p.name.toLowerCase().indexOf(q) > -1; });
    $('#pk-table tbody').innerHTML = list.map(function (p) {
      return '<tr class="' + (p.hidden ? 'is-hidden' : '') + '"><td><img class="thumb thumb--pk" src="' + esc(p.image) + '" alt=""></td><td class="title">' + esc(p.name) + '<small>' + esc(p.id) + '</small></td>' +
        '<td><span class="pill-tag" style="background:' + (ROLES[p.role] || {}).color + ';color:#000">' + esc((ROLES[p.role] || {}).label || p.role) + '</span></td><td>' + (p.range === 'melee' ? 'Curto' : 'Longo') + '</td><td>' + '★'.repeat(p.difficulty || 0) + '</td>' +
        '<td>' + (p.hidden ? '<span class="pill-tag off">Oculto</span>' : '<span class="pill-tag ok">Visível</span>') + '</td>' +
        '<td><div class="row-actions"><button type="button" data-act="view" data-id="' + esc(p.id) + '">Ver</button><button type="button" data-act="edit" data-id="' + esc(p.id) + '">Editar</button><button type="button" data-act="toggle" data-id="' + esc(p.id) + '">' + (p.hidden ? 'Mostrar' : 'Ocultar') + '</button><button type="button" class="danger" data-act="del" data-id="' + esc(p.id) + '">Excluir</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="admin-empty">Nenhum Pokémon.</td></tr>';
  }
  function pkForm(p) {
    p = p || { id: '', name: '', role: 'atacante', range: 'ranged', difficulty: 3, image: '', description: '', stats: { ataque: 50, defesa: 50, resistencia: 50, suporte: 50, mobilidade: 50 }, hidden: false };
    var isNew = !p.id, st = p.stats || {};
    openDrawer(isNew ? 'Novo Pokémon' : 'Editar ' + p.name,
      '<div class="grid-2">' + field('Nome', 'name', p.name) + field('ID', 'id', p.id, { attrs: isNew ? 'data-slug-from="name"' : 'readonly' }) + '</div>' +
      '<div class="grid-3">' + field('Função', 'role', p.role, { type: 'select', options: Object.keys(ROLES).map(function (k) { return [k, ROLES[k].label]; }) }) +
      field('Alcance', 'range', p.range, { type: 'select', options: [['ranged', 'Longo alcance'], ['melee', 'Curto alcance']] }) +
      field('Dificuldade (1-5)', 'difficulty', p.difficulty, { type: 'number', attrs: 'min="1" max="5"' }) + '</div>' +
      imgField('image', p.image) +
      field('Descrição', 'description', p.description || '', { type: 'textarea', rows: 4 }) +
      '<p class="hint">Estatísticas (0 a 100)</p><div class="stat-inputs">' + ['ataque', 'defesa', 'resistencia', 'suporte', 'mobilidade'].map(function (k) { return '<label>' + k + '<input type="number" min="0" max="100" name="st_' + k + '" value="' + (st[k] != null ? st[k] : 50) + '"></label>'; }).join('') + '</div>' +
      '<div class="switches">' + sw('Ocultar da Wiki', 'hidden', p.hidden) + '</div>',
      function (fd) {
        var name = fd.get('name').trim(), id = slugify(fd.get('id') || name);
        if (!name) throw new Error('Informe o nome.');
        if (isNew && store.pokemon(true).some(function (x) { return x.id === id; })) throw new Error('Já existe um Pokémon com este ID.');
        var stats = {}; ['ataque', 'defesa', 'resistencia', 'suporte', 'mobilidade'].forEach(function (k) { stats[k] = Math.max(0, Math.min(100, +fd.get('st_' + k) || 0)); });
        return store.savePokemon({ id: id, name: name, role: fd.get('role'), range: fd.get('range'), difficulty: Math.max(1, Math.min(5, +fd.get('difficulty') || 3)), image: fd.get('image').trim() || ('assets/img/pokemon/' + id + '.png'), description: fd.get('description').trim(), stats: stats, hidden: fd.get('hidden') === 'on', sort: p.sort || 0 });
      });
  }
  $('#pk-new').addEventListener('click', function () { pkForm(null); });
  $('#pk-search').addEventListener('input', renderPk);
  $('#pk-table').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var p = store.pokemon(true).find(function (x) { return x.id === b.dataset.id; }); if (!p) return;
    if (b.dataset.act === 'view') window.open('wiki.html?p=' + p.id, '_blank');
    if (b.dataset.act === 'edit') pkForm(p);
    if (b.dataset.act === 'toggle') store.savePokemon(Object.assign({}, p, { hidden: !p.hidden })).then(function () { renderPk(); PWU.toast(p.hidden ? 'Pokémon visível.' : 'Pokémon oculto.', 'ok'); });
    if (b.dataset.act === 'del' && confirm('Excluir ' + p.name + '?')) store.deletePokemon(p.id).then(function () { renderPk(); PWU.toast('Pokémon excluído.'); });
  });

  /* =====================================================================
     Textos
     ===================================================================== */
  var TEXT_LABELS = {
    'home.about.text': 'Home · "O que é o PokeWorld Universe" (parágrafo)',
    'home.cta.title': 'Home · título do card principal',
    'wiki.banner.title': 'Wiki · título do banner',
    'wiki.banner.sub': 'Wiki · subtítulo do banner',
    'noticias.banner.title': 'Notícias · título do banner',
    'noticias.banner.sub': 'Notícias · subtítulo do banner',
    'ojogo.intro.p1': 'O Jogo · introdução, parágrafo 1',
    'ojogo.intro.p2': 'O Jogo · introdução, parágrafo 2'
  };
  function renderTexts() {
    var t = store.texts();
    $('#texts-list').innerHTML = Object.keys(TEXT_LABELS).map(function (k) {
      return '<div class="text-card" data-key="' + k + '"><div class="text-card__head"><b>' + TEXT_LABELS[k] + '</b><code>' + k + '</code></div><textarea>' + esc(t[k] || '') + '</textarea><div class="text-card__foot"><button type="button" class="btn btn--ghost btn--sm" data-reset>Restaurar padrão</button><button type="button" class="btn btn--yellow btn--sm" data-save>Salvar</button></div></div>';
    }).join('');
  }
  $('#texts-list').addEventListener('click', function (e) {
    var card = e.target.closest('.text-card'); if (!card) return;
    var k = card.dataset.key, ta = card.querySelector('textarea');
    if (e.target.closest('[data-save]')) store.saveText(k, ta.value).then(function () { PWU.toast('Texto salvo!', 'ok'); });
    if (e.target.closest('[data-reset]')) { ta.value = (PWU.texts || {})[k] || ''; store.saveText(k, ta.value).then(function () { PWU.toast('Texto restaurado.'); }); }
  });

  /* =====================================================================
     Configuração
     ===================================================================== */
  function renderConfig() {
    $('#config-panel').innerHTML =
      '<div class="cfg-card"><h3>Status</h3>' + (isSupabase ? 'Conectado ao Supabase em <code>' + esc(cfg.SUPABASE_URL) + '</code>. Tudo o que você salva aqui vai para as tabelas <code>news</code>, <code>pokemon</code> e <code>site_texts</code>, e as imagens para o bucket <code>media</code>.' :
        'O painel está em <b>modo local</b>: as alterações ficam salvas apenas neste navegador (localStorage). Para publicar de verdade, conecte o Supabase seguindo os passos abaixo.') + '</div>' +
      '<div class="cfg-card"><h3>Conectar ao Supabase</h3><ol>' +
      '<li>Crie um projeto em <code>supabase.com</code>.</li>' +
      '<li>No SQL Editor, rode o arquivo <code>supabase/schema.sql</code> do projeto (cria tabelas, permissões e o bucket de imagens).</li>' +
      '<li>Rode <code>supabase/seed.sql</code> para importar as notícias, os Pokémon e os textos atuais.</li>' +
      '<li>Em <b>Project Settings → API</b>, copie a <b>URL</b> e a chave <b>anon public</b> e cole em <code>site/config.js</code>.</li>' +
      '<li>Crie sua conta pelo site (Iniciar sessão → Criar conta) e marque-a como admin:<pre>update public.profiles set is_admin = true where email = \'seu@email.com\';</pre></li>' +
      '<li>Publique o site de novo (<code>vercel deploy --prod</code>).</li></ol></div>' +
      (!isSupabase ? '<div class="cfg-card"><h3>Modo local</h3><p>Senha do painel definida em <code>config.js</code> (LOCAL_ADMIN_PASSWORD).</p><div style="margin-top:1.2rem"><button type="button" class="btn btn--ghost btn--sm" id="reset-local">Apagar alterações locais</button></div></div>' : '');
    var r = $('#reset-local'); if (r) r.addEventListener('click', function () { if (confirm('Apagar todas as alterações feitas em modo local?')) { store.resetLocal(); renderAll(); PWU.toast('Alterações locais apagadas.'); } });
  }

  function renderAll() { renderNews(); renderPk(); renderTexts(); renderConfig(); }
})();
