/* Minha Conta: Conta Twitch + Suas Live Coins.
   O vínculo feito aqui é o mesmo que a Live Store do jogo mostra ("Vinculada").
   Retorno da Twitch: minha-conta.html?code=...&state=... (ou ?error=...).
   Vindo do jogo: minha-conta.html?twitch=vincular. */
(function () {
  'use strict';
  if (document.body.dataset.page !== 'minha-conta' || !window.PWU || !PWU.auth || !PWU.auth.api || typeof PWU.auth.api.twitch !== 'function') return;
  var btn = document.getElementById('acc-twitch');
  var card = document.getElementById('twitch'), coinsCard = document.getElementById('live-coins');
  if (!btn || !card || !coinsCard) return;
  function $(id) { return document.getElementById(id); }
  function action(name) { return card.querySelector('[data-tw="' + name + '"]'); }

  var params = new URLSearchParams(location.search);
  var back = {code: params.get('code'), state: params.get('state'), error: params.get('error')};
  var fromGame = params.get('twitch') === 'vincular';
  // O código da Twitch é de uso único: sai da barra de endereço antes de qualquer outra coisa.
  if (back.code || back.state || back.error || params.has('scope') || fromGame) history.replaceState(null, '', location.pathname);

  var status = null, busy = '', loadedFor = null;
  var alertBox = $('acc-alert');
  var pm = $('pmodal'), pmBody = $('pmodal-body');

  function owner() { return PWU.auth.user ? String(PWU.auth.user.id) : null; }
  function say(msg, kind) {
    if (!alertBox) return;
    alertBox.hidden = !msg; alertBox.textContent = msg || '';
    // A cor acompanha o assunto do aviso, sem alterar vínculo ou permissões.
    alertBox.dataset.noticeTopic = msg ? 'twitch' : '';
    alertBox.classList.toggle('is-warn', kind === 'warn'); alertBox.classList.toggle('is-err', kind === 'err');
  }
  function toast(msg, kind) { if (PWU.toast) PWU.toast(msg, kind); }
  function number(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function hours(minutes) { return (Number(minutes || 0) / 60).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + 'h'; }
  function since(ms) {
    return new Date(Number(ms)).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  }
  function partnerLabel(p) {
    if (!p) return 'Seja parceiro';
    if (p.needsReconnect) return 'Autorização do canal precisa ser renovada';
    return p.status === 'approved' ? 'Canal parceiro' : p.status === 'pending' ? 'Canal em análise' : 'Parceria suspensa';
  }
  function paintPartnerLabel(text) {
    var button = action('streamer'), label = $('tw-partner-label');
    // Uma página anterior em cache ainda tem SVG + texto, sem o span novo.
    if (!label) {
      label = Array.prototype.filter.call(button.childNodes, function (child) {
        return child.nodeType === 3 && child.textContent.trim();
      })[0];
      if (!label) label = button.appendChild(document.createTextNode(''));
    }
    label.textContent = text;
  }

  function paint() {
    var linked = !!(status && status.linked), enabled = !!status && status.enabled !== false;
    btn.textContent = busy || (linked ? 'Twitch: ' + status.login : 'Vincular Twitch');
    btn.disabled = !!busy;
    btn.classList.toggle('is-linked', linked && !busy);
    card.hidden = !enabled;
    coinsCard.hidden = !enabled;
    if (!enabled) return;
    card.classList.toggle('is-linked', linked);
    $('tw-name').textContent = linked ? (status.displayName || status.login) : 'Twitch não vinculada';
    $('tw-since').textContent = linked ? 'Jogador vinculado desde ' + since(status.linkedAt) : 'Sua conta para assistir e ganhar Live Coins.';
    action('link').hidden = linked; action('link').disabled = !!busy;
    action('link').textContent = busy && !linked ? busy : 'Vincular como jogador';
    action('unlink').hidden = !linked;
    action('streamer').hidden = false;
    action('streamer').disabled = !!busy;
    paintPartnerLabel('Seja parceiro');
    action('streamer').classList.remove('is-partner');
    var partnerStatus = $('tw-partner-status');
    if (partnerStatus) {
      partnerStatus.hidden = !status.partner;
      partnerStatus.textContent = status.partner ? status.partner.channelLogin + ' · ' + partnerLabel(status.partner) : '';
    }
    var coins = status.liveCoins || {};
    $('tw-balance').textContent = number(coins.balance);
    $('tw-earned').textContent = number(coins.earned);
    $('tw-hours').textContent = hours(coins.watchedMinutes);
  }

  function call(step, extra) {
    var me = owner();
    return PWU.auth.api.twitch(step, extra).then(function (d) {
      if (me !== owner()) { var e = new Error('stale'); e.stale = true; throw e; }
      return d;
    });
  }
  function explain(e) {
    if (e.offline) return 'Não foi possível falar com o site agora. Tente novamente em instantes.';
    return e.message || 'Algo deu errado. Tente novamente.';
  }

  function start(purpose) {
    if (status && status.enabled === false) { toast('A vinculação da Twitch estará disponível em breve.'); return; }
    busy = 'Abrindo a Twitch…'; paint();
    call('start', {purpose: purpose}).then(function (d) {
      if (typeof d.url !== 'string' || d.url.indexOf('https://id.twitch.tv/oauth2/authorize?') !== 0) throw new Error('Resposta inesperada. Tente novamente.');
      location.assign(d.url);
    }).catch(function (e) { busy = ''; paint(); if (!e.stale) toast(explain(e)); });
  }

  function load() {
    var me = owner();
    if (!me || loadedFor === me) return Promise.resolve();
    loadedFor = me;
    return call('status').then(function (d) { status = d; paint(); })
      .catch(function (e) { if (!e.stale) loadedFor = null; });
  }

  function finishReturn() {
    if (back.error) { say('Vinculação cancelada na Twitch. Nada foi alterado.', 'warn'); back = {}; return load(); }
    if (!back.code || !back.state) return Promise.resolve();
    var sent = back; back = {};
    busy = 'Vinculando…'; paint();
    return call('finish', {code: sent.code, state: sent.state}).then(function (d) {
      status = d; busy = ''; loadedFor = owner(); paint();
      if (d.connected === 'partner') {
        say(d.partner && d.partner.status === 'approved'
          ? 'Canal parceiro reconectado. Sua aprovação foi mantida.'
          : d.partner && d.partner.status === 'suspended'
            ? 'Canal reconectado. A parceria continua suspensa; fale com a equipe.'
            : 'Candidatura do canal enviada. Aguarde a aprovação da equipe. Para ganhar Live Coins como jogador, use o vínculo em "Sou jogador".');
      } else say('Pronto! Sua Twitch ' + d.login + ' está vinculada como jogador, sem precisar de aprovação. Abra novamente a Live Store no jogo para atualizar.');
      toast(d.connected === 'partner' ? 'Canal conectado!' : 'Jogador vinculado!', 'ok');
      card.scrollIntoView({behavior: 'smooth', block: 'center'});
    }).catch(function (e) { busy = ''; paint(); if (!e.stale) say(explain(e), 'err'); return load(); });
  }

  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function button(label, cls, name) { var b = node('button', 'btn btn--sm ' + cls, label); b.type = 'button'; b.dataset.twModal = name; return b; }

  function openStreamer() {
    var p = status && status.partner, wrap = node('div', 'tw-modal');
    wrap.appendChild(node('h3', null, 'Seja parceiro'));
    if (!p) {
      wrap.appendChild(node('p', 'sub', 'Candidate seu canal da Twitch à parceria PWU. A equipe analisa o canal antes de liberar. Depois de aprovado, os jogadores vinculados podem ganhar Live Coins assistindo às suas lives.'));
      wrap.appendChild(node('p', 'tw-note', 'Esta candidatura é separada do vínculo de jogador. Para assistir e ganhar Live Coins, basta usar "Vincular como jogador", sem aprovação.'));
      var rules = node('ul', 'tw-rules');
      ['Live com webcam (não só compartilhamento de tela).', 'Conteúdo de PWU e respeito às regras do jogo e da Twitch.', 'Sem bots de audiência ou qualquer forma de inflar números.'].forEach(function (r) { rules.appendChild(node('li', null, r)); });
      wrap.appendChild(rules);
      wrap.appendChild(node('p', 'tw-note', 'A Twitch vai pedir permissão só para ler quem está no chat da sua live, para contar os pontos de quem assiste.'));
      var actions = node('div', 'tw-actions'); actions.appendChild(button('Candidatar meu canal', 'btn--twitch', 'partner')); wrap.appendChild(actions);
    } else {
      var text = p.status === 'approved' ? 'aprovado como parceiro' + (p.boosted ? ' · canal turbinado (2x Live Coins)' : '')
        : p.status === 'pending' ? 'conectado · aguardando aprovação da equipe' : 'com parceria suspensa · fale com a equipe';
      var line = node('p', 'sub'); line.appendChild(node('b', null, 'Canal ' + p.channelLogin + ': ')); line.appendChild(document.createTextNode(text + '.'));
      wrap.appendChild(line);
      var row = node('div', 'tw-actions');
      if (p.needsReconnect) {
        wrap.appendChild(node('p', 'tw-warn', 'A Twitch parou de autorizar a leitura do chat. Reconecte o canal para voltar a contar pontos.'));
        row.appendChild(button('Reconectar canal', 'btn--twitch', 'partner'));
      } else {
        row.appendChild(button('Desconectar canal', 'btn--danger', 'partner-disconnect'));
      }
      wrap.appendChild(row);
    }
    pmBody.textContent = ''; pmBody.appendChild(wrap);
    pm.hidden = false; document.body.classList.add('is-locked');
  }
  function closeModal() { pm.hidden = true; document.body.classList.remove('is-locked'); }

  function change(step, question, done, el) {
    if (!window.confirm(question)) return;
    if (el) el.disabled = true;
    call(step).then(function (d) { status = d; paint(); closeModal(); done(); })
      .catch(function (e) { if (el) el.disabled = false; if (!e.stale) toast(explain(e)); });
  }

  btn.addEventListener('click', function () {
    if (busy) return;
    if (status && status.enabled !== false) card.scrollIntoView({behavior: 'smooth', block: 'center'});
    else load().then(function () { if (status && status.enabled !== false) card.scrollIntoView({behavior: 'smooth', block: 'center'}); });
  });
  card.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tw]');
    if (!el || busy) return;
    var name = el.dataset.tw;
    if (name === 'link') start('viewer');
    else if (name === 'streamer') openStreamer();
    else if (name === 'unlink') change('unlink', 'Desvincular a Twitch? Você para de ganhar Live Coins até vincular de novo.', function () {
      toast('Twitch desvinculada.', 'ok'); say('Vínculo de jogador removido. Abra novamente a Live Store no jogo para atualizar.');
    }, el);
  });
  pmBody.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tw-modal]');
    if (!el || !pmBody.querySelector('.tw-modal')) return;
    if (el.dataset.twModal === 'partner') { closeModal(); start('partner'); return; }
    change('partner-disconnect', 'Desconectar o canal? Quem assiste à sua live para de ganhar Live Coins.', function () { toast('Canal desconectado.', 'ok'); }, el);
  });

  function refresh() {
    if (!PWU.auth.user) { status = null; loadedFor = null; paint(); card.hidden = coinsCard.hidden = true; return; }
    var pending = back.code || back.error ? finishReturn() : load();
    pending.then(function () {
      if (!fromGame || !status) return;
      fromGame = false;
      if (status.linked) say('Sua Twitch ' + status.login + ' já está vinculada como jogador. Abra novamente a Live Store no jogo para atualizar.');
      else if (status.enabled !== false) {
        say('Para ganhar Live Coins, clique em "Vincular como jogador" e autorize na Twitch. Não precisa ser parceiro nem esperar aprovação.');
        action('link').classList.add('is-attention');
        card.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    });
  }
  paint();
  card.hidden = coinsCard.hidden = true;
  Promise.resolve(PWU.auth.ready).then(refresh, refresh);
  document.addEventListener('auth:change', function () { status = null; loadedFor = null; paint(); refresh(); });
})();
