/* =====================================================================
   POKEWORLD UNIVERSE — página /login
   Cadastro e login na conta do JOGO (tabela `accounts` do banco poke).
   Depois de entrar, vai para Minha Conta.
   ===================================================================== */
(function () {
  var box = document.getElementById('login-box');
  if (!box || !window.PWU) return;

  var DESTINO = 'minha-conta.html';
  var pedido = (location.search.match(/[?&]next=([^&]+)/) || [])[1];
  if (pedido === 'Donate') DESTINO = 'Donate';
  // Criar personagem pelo jogo (lobby): entra e volta direto para a criação. Lista fechada, como o Donate.
  if (pedido === 'novo-personagem') DESTINO = 'onboarding.html?novo=1';
  var atual = 'login', flowRevision = 0, stopTotpSetup = function () {};
  function finishLogin(user, fresh) {
    PWU.auth.set(user);
    if (user && user.onboarding && user.onboarding.required) { location.replace('onboarding.html'); return; }
    if (user && user.game && user.totpPendente && user.totpObrigatorio !== false) return ativarTotp(user, !!fresh);
    location.href = DESTINO;
  }

  function form(tab) { return box.querySelector('[data-lform="' + tab + '"]'); }
  function erro(f, msg) { var p = f.querySelector('.auth__error'); p.textContent = msg || ''; p.hidden = !msg; }

  function trocar(tab) {
    stopTotpSetup();
    atual = tab; flowRevision++;
    box.querySelectorAll('.device-step,.recover').forEach(function (el) { el.remove(); });
    box.querySelectorAll('.login-tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.ltab === tab); b.setAttribute('aria-selected', String(b.dataset.ltab === tab)); b.tabIndex = b.dataset.ltab === tab ? 0 : -1; });
    box.querySelectorAll('.login-form').forEach(function (f) { f.hidden = f.dataset.lform !== tab; f.classList.remove('is-oculto'); });
    box.querySelector('.login-tabs__ink').style.transform = 'translateX(' + (tab === 'login' ? 0 : 100) + '%)';
    var first = form(tab).querySelector('input');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }

  box.addEventListener('click', function (e) {
    var t = e.target;
    var tab = t.closest('[data-ltab]'); if (tab) return trocar(tab.dataset.ltab);
    var go = t.closest('[data-lgoto]'); if (go) { e.preventDefault(); return trocar(go.dataset.lgoto); }
    var eye = t.closest('.field__eye');
    if (eye) { var inp = eye.previousElementSibling; inp.type = inp.type === 'password' ? 'text' : 'password'; return; }
    if (t.closest('[data-terms]')) { e.preventDefault(); window.open('regras.html', '_blank', 'noopener'); }
    if (t.closest('[data-lforgot]')) { e.preventDefault(); return telaRecuperar(form('login').email.value.trim()); }
  });

  box.querySelectorAll('.login-tab').forEach(function (tab) { tab.addEventListener('keydown', function (event) { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); var next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : tab.dataset.ltab === 'login' ? 'register' : 'login'; trocar(next); box.querySelector('[data-ltab="' + next + '"]').focus(); }); });

  // medidor de força da senha
  var pw = form('register').querySelector('[name="password"]');
  pw.addEventListener('input', function () {
    var v = pw.value, score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    box.querySelectorAll('.strength i').forEach(function (b, i) { b.className = i < score ? 'lvl-' + score : ''; });
  });

  box.querySelectorAll('.login-form').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var kind = f.dataset.lform;
      var revision = flowRevision;
      if (f.querySelector('.auth__submit').disabled) return;
      var email = f.email.value.trim(), senha = f.password.value;
      var accountOptions = {accountIdentifier:kind === 'login' && f.elements.accountIdentifier ? f.elements.accountIdentifier.value.trim() : ''};
      if (kind === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro(f, 'Digite um e-mail válido.');
      if (!email || email.length > 254) return erro(f, 'Informe seu e-mail ou nome da conta.');
      if (accountOptions.accountIdentifier && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro(f, 'Informe o e-mail e o nome da conta ou personagem para identificar seu acesso.');
      if (!senha.length) return erro(f, 'Informe sua senha.');
      if (kind === 'register' && senha.length < 8) return erro(f, 'A senha precisa ter pelo menos 8 caracteres.');
      if (kind === 'register' && senha !== f.confirm.value) return erro(f, 'As senhas não coincidem.');
      if (!f.terms.checked) return erro(f, 'Você precisa aceitar os termos para continuar.');
      erro(f, '');
      revision = ++flowRevision;

      var btn = f.querySelector('.auth__submit');
      btn.classList.add('is-loading'); btn.disabled = true;

      var p = kind === 'register' ? PWU.auth.api.register(email, senha) : PWU.auth.api.login(email, senha, undefined, accountOptions);
      p.catch(function (err) {
        if (revision !== flowRevision) { var stale = new Error(''); stale.tratado = true; throw stale; }
        if (err.needsTotp) { pedirTotp(email, senha, accountOptions); var e1 = new Error(''); e1.tratado = true; throw e1; }
        if (!err.needsDevice && !err.needsEmail) throw err;
        pedirCodigo(email, senha, err.email, err.message, !!err.needsEmail, accountOptions);
        var e2 = new Error(''); e2.tratado = true; throw e2;
      }).then(function (user) {
        if (revision !== flowRevision) return;
        f.password.value = ''; if (f.confirm) f.confirm.value = '';
        finishLogin(user, kind === 'register');
      }).catch(function (err) {
        if (revision !== flowRevision) return;
        if (!err.tratado) erro(f, err.message || 'Algo deu errado. Tente novamente.');
        btn.classList.remove('is-loading'); btn.disabled = false;
      }).finally(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
    });
  });

  /* Passo obrigatório depois de criar a conta: ativar o autenticador. */
  function ativarTotp(user, nova) {
    stopTotpSetup();
    esconderLogin(true);
    var antigo = box.querySelector('.device-step'); if (antigo) antigo.remove();
    var div = document.createElement('div');
    div.className = 'login-form device-step totp-step';
    div.innerHTML = '<div class="device-code"><span class="totp-step__tag">' + (nova ? 'Conta criada · falta um passo' : 'Passo obrigatório') + '</span>' +
      '<h2 style="font:400 3.2rem/1 var(--bebas);margin:1rem 0 .8rem">Ative a verificação em duas etapas</h2>' +
      '<p style="font-size:1.5rem;color:rgba(255,255,255,.7);margin-bottom:2rem">Para proteger sua conta e seus créditos, o PokeWorld exige um aplicativo autenticador. Leva menos de um minuto.</p>' +
      '<ol class="totp-step__passos"><li><b>1</b><span>Instale o <b>Google Authenticator</b> ou o <b>Authy</b> no celular.</span></li>' +
      '<li><b>2</b><span>Leia o QR Code abaixo (ou digite a chave).</span></li>' +
      '<li><b>3</b><span>Digite o código de 6 dígitos que aparecer.</span></li></ol>' +
      '<label class="field"><span>Confirme sua senha atual</span><input id="totp-password" type="password" autocomplete="current-password"></label>' +
      (user.recovery && user.recovery.configured ? '<label class="field"><span>Recovery Key</span><input id="totp-recovery" type="password" autocomplete="off" spellcheck="false"></label>' : '') +
      '<button class="auth__submit" type="button" id="totp-prepare"><span>Gerar QR Code</span></button>' +
      '<div class="totp-step__qr" id="totp-qr"><span class="totp-step__carregando">Confirme sua identidade para gerar o QR Code.</span></div>' +
      '<p class="totp-step__chave">Chave manual: <code id="totp-chave">…</code></p>' +
      '<p class="totp-step__expira" id="totp-expira"></p>' +
      '<input id="totp-code" aria-label="Código do aplicativo autenticador" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
      '<p class="auth__error" role="alert" hidden style="margin-top:1.6rem"></p>' +
      '<button class="auth__submit" type="button" id="totp-ok" style="margin-top:1.8rem"><span>Ativar e entrar</span></button>' +
      '<p class="auth__switch"><a href="#" id="totp-sair">Sair da conta</a></p></div>';
    box.appendChild(div);
    var qr = div.querySelector('#totp-qr'), chave = div.querySelector('#totp-chave'), campo = div.querySelector('#totp-code');
    var prepared = false, expiration = 0, timer = null, expiry = div.querySelector('#totp-expira');
    function checkExpiry() {
      if (!div.isConnected) return stopTotpSetup();
      var remaining = Math.ceil((expiration-Date.now())/1000);
      if (remaining <= 0) { stopTotpSetup(); prepared = false; qr.textContent = 'Este QR Code expirou. Gere um novo para continuar.'; chave.textContent = ''; campo.value = ''; expiry.textContent = ''; var button = div.querySelector('#totp-prepare'); button.hidden = false; button.disabled = false; button.querySelector('span').textContent = 'Gerar novo QR Code'; return; }
      expiry.textContent = 'Expira em ' + Math.floor(remaining/60) + ':' + String(remaining%60).padStart(2,'0') + ' · validade máxima de 10 minutos.';
    }
    stopTotpSetup = function () { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange',checkExpiry); };
    function mostrar(setup) {
      if (!setup || typeof setup.secret !== 'string' || typeof setup.otpauth !== 'string' || !Number.isFinite(setup.expiresAt) || setup.expiresAt <= Date.now()) throw new Error('Não foi possível gerar o autenticador.');
      expiration = Math.min(setup.expiresAt,Date.now()+600000);
      chave.textContent = setup.secret.replace(/(.{4})/g, '$1 ').trim();
      if (window.qrcode) { var q = qrcode(0, 'M'); q.addData(setup.otpauth); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 16, scalable: true }); }
      else qr.innerHTML = '<span class="totp-step__carregando">Use a chave manual abaixo.</span>';
      stopTotpSetup(); checkExpiry(); timer = setInterval(checkExpiry,1000); document.addEventListener('visibilitychange',checkExpiry);
    }
    function setupCredentials() { return {password:div.querySelector('#totp-password').value,recoveryKey:div.querySelector('#totp-recovery') ? div.querySelector('#totp-recovery').value.trim() : undefined}; }
    div.querySelector('#totp-prepare').addEventListener('click', function () {
      var button = this, credentials = setupCredentials();
      if (button.disabled) return;
      if (!credentials.password || (user.recovery && user.recovery.configured && !credentials.recoveryKey)) { qr.textContent = 'Confirme sua senha e a Recovery Key, quando solicitada.'; return; }
      button.disabled = true;
      PWU.auth.api.totpSetup(credentials).then(function (result) { if (!div.isConnected) return; mostrar(result); prepared = true; button.hidden = true; })
        .catch(function (error) { if (div.isConnected) { qr.textContent = error.message || 'Não foi possível gerar o QR Code.'; button.disabled = false; } });
    });
    campo.addEventListener('input', function () { campo.value = campo.value.replace(/\D/g, ''); });
    div.querySelector('#totp-sair').addEventListener('click', function (e) { e.preventDefault(); PWU.auth.api.logout().then(function () { div.remove(); esconderLogin(false); trocar('login'); }).catch(function (error) { PWU.toast(error.message); }); });
    function enviar() {
      var p2 = div.querySelector('.auth__error');
      if (div.querySelector('#totp-ok').disabled) return;
      if (prepared && Date.now() >= expiration) { checkExpiry(); return; }
      if (campo.value.length !== 6) { p2.textContent = 'Digite os 6 dígitos do aplicativo.'; p2.hidden = false; return; }
      p2.hidden = true;
      var b = div.querySelector('#totp-ok'); b.classList.add('is-loading'); b.disabled = true;
      if (!prepared) { p2.textContent = 'Gere o QR Code antes de confirmar.'; p2.hidden = false; b.disabled = false; b.classList.remove('is-loading'); return; }
      PWU.auth.api.totpEnable(campo.value, setupCredentials()).then(function () {
        if (!div.isConnected) return;
        div.querySelectorAll('input').forEach(function (input) { input.value = ''; });
        stopTotpSetup(); qr.replaceChildren(); chave.textContent = ''; expiry.textContent = '';
        user.totpPendente = false; PWU.auth.set(user);
        PWU.toast('Verificação ativada. Bem-vindo ao PokeWorld!', 'ok');
        setTimeout(function () { location.href = DESTINO; }, 700);
      }).catch(function (er) {
        if (!div.isConnected) return;
        p2.textContent = er.message || 'Código inválido.'; p2.hidden = false;
        b.classList.remove('is-loading'); b.disabled = false; b.dataset.sending = '';
      });
    }
    div.querySelector('#totp-ok').addEventListener('click', enviar);
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
  }

  /* Autenticador por aplicativo ativo: pede o código de 6 dígitos do app. */
  function pedirTotp(email, senha, accountOptions) {
    esconderLogin(true);
    var antigo = box.querySelector('.device-step'); if (antigo) antigo.remove();
    var div = document.createElement('div');
    div.className = 'login-form device-step';
    div.innerHTML = '<div class="device-code"><h2 style="font:400 3.2rem/1 var(--bebas);margin-bottom:.8rem">Código do autenticador</h2>' +
      '<p style="font-size:1.5rem;color:rgba(255,255,255,.7);margin-bottom:2rem">Abra o seu aplicativo autenticador (Google Authenticator, Authy...) e digite o código de 6 dígitos da conta PokeWorld.</p>' +
      '<input id="totp-code" aria-label="Código do aplicativo autenticador" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
      '<p class="auth__error" role="alert" hidden style="margin-top:1.6rem"></p>' +
      '<button class="auth__submit" type="button" id="totp-ok" style="margin-top:1.8rem"><span>Entrar</span></button>' +
      '<p class="auth__switch"><a href="#" id="totp-voltar">Tentar com outra conta</a></p></div>';
    box.appendChild(div);
    var campo = div.querySelector('#totp-code'); campo.focus();
    campo.addEventListener('input', function () { campo.value = campo.value.replace(/\D/g, ''); });
    div.querySelector('#totp-voltar').addEventListener('click', function (e) { e.preventDefault(); div.remove(); esconderLogin(false); trocar('login'); });
    function enviar() {
      var p2 = div.querySelector('.auth__error');
      if (campo.value.length !== 6) { p2.textContent = 'Digite os 6 dígitos.'; p2.hidden = false; return; }
      p2.hidden = true;
      var b = div.querySelector('#totp-ok'); b.classList.add('is-loading'); b.disabled = true;
      if (b.disabled && b.dataset.sending === '1') return; b.dataset.sending = '1';
      PWU.auth.api.login(email, senha, campo.value, accountOptions).then(function (user) {
        if (!div.isConnected) return;
        senha = ''; campo.value = ''; finishLogin(user, false);
      }).catch(function (er) {
        if (!div.isConnected) return;
        if (er.needsDevice) { div.remove(); return pedirCodigo(email, senha, er.email, er.message, false, accountOptions); }
        p2.textContent = er.message || 'Código inválido.'; p2.hidden = false;
        b.classList.remove('is-loading'); b.disabled = false; b.dataset.sending = '';
      });
    }
    div.querySelector('#totp-ok').addEventListener('click', enviar);
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
  }

  /* Computador novo: pede o código de 6 dígitos que foi para o e-mail. */
  function pedirCodigo(email, senha, emailMascarado, aviso, cadastro, accountOptions) {
    esconderLogin(true);
    var antigo = box.querySelector('.device-step'); if (antigo) antigo.remove();
    var div = document.createElement('div');
    div.className = 'login-form device-step';
    div.innerHTML = '<div class="device-code"><h2 style="font:400 3.2rem/1 var(--bebas);margin-bottom:.8rem">Autorize este computador</h2>' +
      '<p style="font-size:1.5rem;color:rgba(255,255,255,.7);margin-bottom:2rem"></p>' +
      '<input id="dev-code" aria-label="Código enviado ao e-mail" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
      '<p class="auth__error" role="alert" hidden style="margin-top:1.6rem"></p>' +
      '<button class="auth__submit" type="button" id="dev-ok" style="margin-top:1.8rem"><span>Autorizar e entrar</span></button>' +
      '<p class="auth__switch"><a href="#" id="dev-voltar">Tentar com outra conta</a></p></div>';
    box.appendChild(div);
    div.querySelector('h2').textContent = cadastro ? 'Confirme seu e-mail' : 'Autorize este computador';
    div.querySelector('p').textContent = cadastro ? 'Enviamos um código para ' + email + '. A conta só será criada após confirmar. Para reenviar, volte e repita o cadastro após um minuto.' : 'Digite o código enviado ao e-mail da conta.';
    div.querySelector('#dev-ok span').textContent = cadastro ? 'Confirmar e criar conta' : 'Autorizar e entrar';
    var campo = div.querySelector('#dev-code');
    campo.focus();
    campo.addEventListener('input', function () { campo.value = campo.value.replace(/\D/g, ''); });
    div.querySelector('#dev-voltar').addEventListener('click', function (e) { e.preventDefault(); div.remove(); esconderLogin(false); trocar('login'); });
    div.querySelector('#dev-ok').addEventListener('click', function () {
      var p2 = div.querySelector('.auth__error');
      if (campo.value.length !== 6) { p2.textContent = 'Digite os 6 dígitos.'; p2.hidden = false; return; }
      p2.hidden = true;
      var b = div.querySelector('#dev-ok'); if (b.disabled) return; b.classList.add('is-loading'); b.disabled = true;
      (cadastro ? PWU.auth.api.confirmRegister(email, senha, campo.value) : PWU.auth.api.confirmDevice(email, senha, campo.value, accountOptions)).then(function (user) {
        if (!div.isConnected) return;
        senha = ''; campo.value = ''; finishLogin(user, !!cadastro);
      }).catch(function (er) {
        if (!div.isConnected) return;
        p2.textContent = er.message || 'Código inválido.'; p2.hidden = false;
        b.classList.remove('is-loading'); b.disabled = false;
      });
    });
  }

  /* =========================================================
     Esqueci minha senha — dois passos na mesma tela:
     1) informa o e-mail e recebe um código de 6 dígitos
     2) digita o código e escolhe a senha nova
     ========================================================= */
  /* `hidden` sozinho não basta: o CSS das abas usa display:flex e vence o
     atributo. Por isso escondemos com uma classe própria. */
  function esconderLogin(esconder) {
    box.querySelectorAll('.login-form, .login-tabs, .login-perks').forEach(function (el) {
      if (!el.classList.contains('recover')) el.classList.toggle('is-oculto', !!esconder);
    });
  }

  function telaRecuperar(email) {
    esconderLogin(true);
    var antigo = box.querySelector('.recover'); if (antigo) antigo.remove();

    var el = document.createElement('div');
    el.className = 'login-form recover';
    el.innerHTML =
      '<div class="recover__head"><h2>Recuperar acesso</h2>' +
      '<p>Confirme o acesso ao seu e-mail e escolha uma nova senha. Se sua conta recebeu uma Recovery Key, ela também será necessária.</p></div>' +
      '<div class="recover__steps"><b class="is-on">1 · E-mail</b><i></i><b>2 · Nova senha</b></div>' +
      '<div data-rstep="1">' +
        '<label class="field"><span>E-mail da conta</span><input type="email" id="rc-email" autocomplete="email" placeholder="treinador@pokeworld.com"></label>' +
        '<label class="field"><span>Nome da conta ou de um personagem <small>(opcional)</small></span><input type="text" id="rc-account" autocomplete="username" maxlength="254" autocapitalize="none" spellcheck="false" aria-describedby="rc-account-help" placeholder="Nome completo"><small id="rc-account-help">Se você usa o mesmo e-mail em mais de uma conta, preencha este campo para indicar qual deseja recuperar.</small></label>' +
        '<p class="auth__error" role="alert" hidden></p>' +
        '<button class="auth__submit" type="button" id="rc-enviar"><span>Enviar código</span></button>' +
      '</div>' +
      '<div data-rstep="2" hidden>' +
        '<div class="login-grid">' +
          '<label class="field"><span>Código do e-mail</span><input id="rc-code" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"></label>' +
          '<label class="field"><span>Recovery Key</span><input type="password" id="rc-rk" autocomplete="off" spellcheck="false" maxlength="120" aria-describedby="rc-rk-help" placeholder="Sua chave de recuperação"><small id="rc-rk-help">Se sua conta recebeu uma Recovery Key, informe-a também.</small></label>' +
          '<label class="field"><span>Nova senha</span><span class="field__pw"><input type="password" id="rc-pw" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"><button type="button" class="field__eye" aria-label="Mostrar senha"><i class="ico ico-eye" aria-hidden="true"></i></button></span></label>' +
          '<label class="field"><span>Confirmar nova senha</span><input type="password" id="rc-pw2" autocomplete="new-password" placeholder="Repita a senha"></label>' +
          '<ul class="login-dicas"><li>Pelo menos 8 caracteres</li><li>Misture maiúsculas e minúsculas</li><li>Inclua um número ou símbolo</li></ul>' +
        '</div>' +
        '<p class="auth__error" role="alert" hidden></p>' +
        '<button class="auth__submit" type="button" id="rc-trocar"><span>Salvar nova senha</span></button>' +
        '<p class="auth__switch"><a href="#" id="rc-reenviar">Não chegou? Enviar outro código</a></p>' +
        '<p class="auth__switch"><a href="#" id="rc-corrigir">Corrigir e-mail ou conta</a></p>' +
      '</div>' +
      '<p class="auth__switch"><a href="#" id="rc-voltar">← Voltar para o login</a></p>';
    box.appendChild(el);

    var passo1 = el.querySelector('[data-rstep="1"]');
    var passo2 = el.querySelector('[data-rstep="2"]');
    var campoEmail = el.querySelector('#rc-email');
    var campoConta = el.querySelector('#rc-account'), recoveryIdentity = null, recoveryRevision = 0, resending = false;
    var campoCode = el.querySelector('#rc-code');
    if (email && email.includes('@')) campoEmail.value = email;
    else if (email) campoConta.value = email;
    campoEmail.focus();
    campoCode.addEventListener('input', function () { campoCode.value = campoCode.value.replace(/\D/g, ''); });
    // Password visibility is handled by the delegated click listener on box.

    function aviso(dentro, msg) {
      var p = dentro.querySelector('.auth__error');
      p.textContent = msg || ''; p.hidden = !msg;
    }
    function ocupado(btn, sim) { btn.classList.toggle('is-loading', sim); btn.disabled = sim; }

    function enviar(btn) {
      var mail = campoEmail.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return aviso(passo1, 'Digite um e-mail válido.');
      if (btn.disabled) return; aviso(passo1, ''); ocupado(btn, true);
      var identity = {email:mail, accountIdentifier:campoConta.value.trim()}, revision = ++recoveryRevision;
      campoEmail.disabled = true; campoConta.disabled = true;
      PWU.auth.api.forgot(identity.email, identity).then(function () {
        if (!el.isConnected || revision !== recoveryRevision) return;
        recoveryIdentity = identity;
        ocupado(btn, false);
        passo1.hidden = true; passo2.hidden = false;
        el.querySelectorAll('.recover__steps b').forEach(function (b, i) { b.classList.toggle('is-on', i === 1); });
        PWU.toast('Se os dados identificarem sua conta, você receberá um código por e-mail.', 'ok');
        campoCode.focus();
      }).catch(function (err) { if (el.isConnected && revision === recoveryRevision) aviso(passo1, err.message || 'Não consegui enviar o código.'); }).finally(function () { if (revision === recoveryRevision) { ocupado(btn, false); campoEmail.disabled = false; campoConta.disabled = false; } });
    }

    el.querySelector('#rc-enviar').addEventListener('click', function () { enviar(this); });
    campoEmail.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviar(el.querySelector('#rc-enviar')); } });
    campoConta.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviar(el.querySelector('#rc-enviar')); } });
    el.querySelector('#rc-reenviar').addEventListener('click', function (e) {
      e.preventDefault();
      if (!recoveryIdentity || resending) return;
      resending = true; var revision = recoveryRevision;
      PWU.auth.api.forgot(recoveryIdentity.email, recoveryIdentity)
        .then(function () { if (el.isConnected && revision === recoveryRevision) PWU.toast('Se os dados identificarem sua conta, você receberá um novo código.', 'ok'); })
        .catch(function (err) { if (el.isConnected && revision === recoveryRevision) aviso(passo2, err.message); })
        .finally(function () { if (revision === recoveryRevision) resending = false; });
    });

    el.querySelector('#rc-corrigir').addEventListener('click', function (e) {
      e.preventDefault(); if (el.querySelector('#rc-trocar').disabled) return;
      ++recoveryRevision; recoveryIdentity = null; resending = false;
      passo2.querySelectorAll('input').forEach(function (input) { input.value = ''; });
      passo1.hidden = false; passo2.hidden = true; aviso(passo1, ''); aviso(passo2, '');
      el.querySelectorAll('.recover__steps b').forEach(function (b, i) { b.classList.toggle('is-on', i === 0); });
      campoConta.focus();
    });

    el.querySelector('#rc-trocar').addEventListener('click', function () {
      var btn = this;
      var codigo = campoCode.value, nova = el.querySelector('#rc-pw').value, rep = el.querySelector('#rc-pw2').value;
      if (codigo.length !== 6) return aviso(passo2, 'Digite os 6 dígitos do código.');
      if (nova.length < 8) return aviso(passo2, 'A senha precisa ter pelo menos 8 caracteres.');
      if (nova !== rep) return aviso(passo2, 'As senhas não coincidem.');
      if (btn.disabled || !recoveryIdentity) return; aviso(passo2, ''); ocupado(btn, true);
      var recovery = el.querySelector('#rc-rk');
      PWU.auth.api.reset(recoveryIdentity.email, codigo, nova, {recoveryKey:recovery.value.trim(), accountIdentifier:recoveryIdentity.accountIdentifier}).then(function (result) {
        if (!el.isConnected) return;
        recovery.value = ''; campoCode.value = ''; el.querySelector('#rc-pw').value = ''; el.querySelector('#rc-pw2').value = '';
        passo2.hidden = true;
        var message = el.querySelector('.recover__head p');
        message.textContent = result && result.recoveryReplaced ? 'Senha atualizada. Sua Recovery Key anterior foi substituída. Entre novamente para ver e guardar a nova chave.' : 'Senha atualizada. Você já pode entrar com sua nova senha.';
        if (result && result.recoveryReplaced) message.textContent += result.emailStatus === 'sent' ? ' O envio da nova chave por e-mail foi confirmado.' : ' O envio por e-mail ainda não foi confirmado; confira a nova chave ao entrar.';
        el.querySelector('#rc-voltar').textContent = 'Entrar com a nova senha';
      }).catch(function (err) { ocupado(btn, false); aviso(passo2, err.message || 'Não consegui trocar a senha.'); });
    });

    el.querySelector('#rc-voltar').addEventListener('click', function (e) { e.preventDefault(); voltar(campoEmail.value.trim()); });

    function voltar(mail) {
      el.remove();
      esconderLogin(false);
      trocar('login');
      if (mail) form('login').email.value = mail;
      var senha = form('login').password; if (senha) senha.focus();
    }
  }

  // Cached browser state never decides the next stage before the server responds.
  var startupRevision = flowRevision;
  Promise.resolve(PWU.auth.ready).then(function () {
    if (flowRevision !== startupRevision) return;
    if (PWU.auth.user) finishLogin(PWU.auth.user, false);
    else if (/[?&]recuperar=1/.test(location.search)) telaRecuperar('');
    else if (location.hash === '#criar') trocar('register');
  });
  window.addEventListener('pagehide', function () { flowRevision++; stopTotpSetup(); box.querySelectorAll('input[autocomplete="current-password"], input[autocomplete="new-password"], #rc-rk, #totp-recovery').forEach(function (input) { input.value = ''; }); box.querySelectorAll('.device-step,.recover').forEach(function (step) { step.remove(); }); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) location.reload(); });

  if (window.gsap) {
    gsap.from('.login-box', { y: 40, autoAlpha: 0, duration: .7, ease: 'power3.out' });
    gsap.from('.login-page__art', { y: 60, autoAlpha: 0, duration: 1, stagger: .12, ease: 'power3.out' });
  }
})();
