/* =====================================================================
   POKEWORLD UNIVERSE — UI compartilhada: login/cadastro, sessão,
   menu mobile e toasts. Sem backend: contas ficam no localStorage
   (senhas com hash SHA-256). Troque PWU.auth.api para plugar Supabase.
   ===================================================================== */
(function () {
  window.PWU = window.PWU || {};
  var headerCatalogPromise;
  var USERS_KEY = 'pwu_users', SESSION_KEY = 'pwu_session';

  /* ---------- toasts ---------- */
  var toastWrap;
  function toast(msg, type) {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toasts';
      document.body.appendChild(toastWrap);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast--' + type : '');
    t.textContent = msg;
    toastWrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-in'); });
    setTimeout(function () { t.classList.remove('is-in'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }
  PWU.toast = toast;

  /* ---------- "API" local ---------- */
  function readUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch (e) { return []; } }
  function writeUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function hash(str) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    return Promise.resolve('plain:' + str);
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var api = {
    register: function (email, password) {
      return delay(600).then(function () { return hash(password); }).then(function (h) {
        var users = readUsers();
        if (users.some(function (u) { return u.email === email; })) throw new Error('Já existe uma conta com este e-mail.');
        var user = { email: email, hash: h, createdAt: Date.now(), name: email.split('@')[0] };
        users.push(user); writeUsers(users);
        return { email: user.email, name: user.name };
      });
    },
    login: function (email, password) {
      return delay(600).then(function () { return hash(password); }).then(function (h) {
        var user = readUsers().find(function (u) { return u.email === email; });
        if (!user || user.hash !== h) throw new Error('E-mail ou senha incorretos.');
        return { email: user.email, name: user.name };
      });
    }
  };

  function profileKey(email) { return 'pwu_profile_' + email; }
  function readProfile(email) { try { return JSON.parse(localStorage.getItem(profileKey(email)) || 'null') || { diamonds: 0, plan: 'Conta Grátis', trainers: [], tickets: [], twitch: null }; } catch (e) { return { diamonds: 0, plan: 'Conta Grátis', trainers: [], tickets: [], twitch: null }; } }
  function writeProfile(email, p) { localStorage.setItem(profileKey(email), JSON.stringify(p)); }
  api.changePassword = function (email, current, next) {
    return delay(500).then(function () { return Promise.all([hash(current), hash(next)]); }).then(function (h) {
      var users = readUsers(), u = users.find(function (x) { return x.email === email; });
      if (!u || u.hash !== h[0]) throw new Error('Senha atual incorreta.');
      u.hash = h[1]; writeUsers(users);
    });
  };
  var ACCOUNT_URL = 'minha-conta.html';
  var LOGIN_URL = 'login.html';
  function onAccountPage() { return /minha-conta(\.html)?$/.test(location.pathname); }
  function onLoginPage() { return /login(\.html)?$/.test(location.pathname); }
  function staysAfterLogin() { return onAccountPage() || /loja(\.html)?$/.test(location.pathname) || /admin\.html/.test(location.pathname); }

  /* Com Supabase configurado, as contas dos jogadores são reais (Supabase Auth).
     Sem ele, continua o modo local de demonstração. */
  var sb = (window.PWU && PWU.store && PWU.store.client) || null;
  function sbUser(u) { return u ? { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0] } : null; }
  if (sb) {
    api.register = function (email, password) {
      return sb.auth.signUp({ email: email, password: password }).then(function (r) {
        if (r.error) throw new Error(/registered/i.test(r.error.message) ? 'Já existe uma conta com este e-mail.' : r.error.message);
        if (!r.data.session) throw new Error('Conta criada! Confirme o e-mail que enviamos para ativar o acesso.');
        return sbUser(r.data.user);
      });
    };
    api.login = function (email, password) {
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw new Error(/confirm/i.test(r.error.message) ? 'Confirme seu e-mail antes de entrar.' : 'E-mail ou senha incorretos.');
        return sbUser(r.data.user);
      });
    };
    api.changePassword = function (email, current, next) {
      return sb.auth.signInWithPassword({ email: email, password: current }).then(function (r) {
        if (r.error) throw new Error('Senha atual incorreta.');
        return sb.auth.updateUser({ password: next });
      }).then(function (r) { if (r.error) throw new Error(r.error.message); });
    };
  }

  /* ---------- backend do JOGO (tabela accounts do banco poke) ----------
     É o preferido: a conta do site é a conta do jogo. Se a API responder 503
     (banco não configurado) ou falhar, cai para o Supabase/local. */
  var TOKEN_KEY = 'pwu_token';
  var DEVICE_KEY = 'pwu_device';
  /** Identificador deste navegador. Serve só para reconhecer o aparelho no login. */
  function deviceId() {
    var d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  }
  var COOKIE_MODE_KEY = 'pwu_session_mode';
  var cookieMode = localStorage.getItem(COOKIE_MODE_KEY) === 'cookie-v1';
  var authRevision = 0, logoutPending = null;
  function acceptSessionMode(mode) {
    if (mode === 'cookie-v1') { cookieMode = true; localStorage.setItem(COOKIE_MODE_KEY, mode); localStorage.removeItem(TOKEN_KEY); }
  }
  var gameOn = null;          // null = ainda não sabemos
  // guarda as implementações anteriores (Supabase ou local) para o fallback.
  // Precisa copiar as FUNÇÕES: guardar o objeto `api` criaria recursão infinita.
  // Game accounts only: never substitute local/Supabase authentication.
  sb = null;

  function gameFetch(opts) {
    var o = opts || {};
    var h = { 'Content-Type': 'application/json', 'X-PWU-Session-Mode': 'cookie-v1' };
    var tk = cookieMode ? null : localStorage.getItem(TOKEN_KEY);
    if (tk) h.Authorization = 'Bearer ' + tk;
    return fetch('/api/account' + (o.query || ''), { method: o.method || 'POST', credentials: 'same-origin', headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
      .then(function (r) {
        acceptSessionMode(r.headers.get('X-PWU-Session-Mode'));
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 503) { gameOn = false; var e = new Error(d.error || 'Serviço temporariamente indisponível.'); e.offline = true; throw e; }
          gameOn = true;
          if (!r.ok) { var er = new Error(d.error || 'Algo deu errado. Tente novamente.'); er.code = d.code || null; er.status = r.status; if (d.needsDevice) { er.needsDevice = true; er.email = d.email; } if (d.needsTotp) er.needsTotp = true; throw er; }
          acceptSessionMode(d.sessionMode);
          return d;
        });
      }, function () { gameOn = false; var e = new Error('offline'); e.offline = true; throw e; });
  }

  // Only non-secret metadata can enter the persisted session. Recovery keys stay in their page.
  function safeOnboarding(value) {
    if (!value || !['recovery','character','complete'].includes(value.stage)) return null;
    return {required: value.required === true, stage: value.stage, recoveryAcknowledged: value.recoveryAcknowledged === true, hasCharacters: value.hasCharacters === true};
  }
  function safeRecovery(value) {
    if (!value) return null;
    return {configured: value.configured === true, available: value.available === true, acknowledged: value.acknowledged === true, keyVersion: value.keyVersion, masked: value.masked, emailStatus: value.emailStatus};
  }
  function safeUser(value) {
    if (!value) return null;
    var user = {};
    ['id','email','name','game','coins','plan','avatar','trainers','totpPendente','totpDisponivel','totpObrigatorio'].forEach(function (key) { if (value[key] !== undefined) user[key] = value[key]; });
    user.onboarding = safeOnboarding(value.onboarding); user.recovery = safeRecovery(value.recovery);
    if (value.security) user.security = {totpRequired:value.security.totpRequired===true,totpAvailable:value.security.totpAvailable===true,totpEnabled:value.security.totpEnabled===true,scope:'site',emailTwoFactor:value.security.emailTwoFactor===true};
    return user;
  }
  function fromGame(d) {
    acceptSessionMode(d.sessionMode);
    if (d.token && !cookieMode) localStorage.setItem(TOKEN_KEY, d.token);
    var a = d.account || d;
    return { id: a.id, email: a.email, name: (a.email || '').split('@')[0], game: true, coins: a.coins, plan: a.plan, avatar: a.avatar || null, trainers: a.trainers || [], totpPendente: !!a.totpPendente, onboarding: safeOnboarding(a.onboarding), recovery: safeRecovery(a.recovery), totpDisponivel: a.totpDisponivel, totpObrigatorio: a.totpObrigatorio, security: a.security ? {totpRequired:a.security.totpRequired===true,totpAvailable:a.security.totpAvailable===true,totpEnabled:a.security.totpEnabled===true,scope:'site',emailTwoFactor:a.security.emailTwoFactor===true} : null };
  }

  api.register = function (email, password) {
    return gameFetch({ body: { action: 'register', email: email, password: password, terms: true, deviceId: deviceId() } }).then(function (d) {
      if (d.needsEmail) { var error = new Error(d.message); error.needsEmail = true; error.email = email; throw error; }
      throw new Error('Resposta inesperada do cadastro. Nenhuma sessão iniciada.');
    });
  };
  api.confirmRegister = function(email, password, code) {
    return gameFetch({body:{action:'register-confirm',email:email,password:password,code:code,deviceId:deviceId()}}).then(fromGame);
  };
  api.login = function (email, password, totp, options) {
    return gameFetch({ body: { action: 'login', email: email, password: password, deviceId: deviceId(), totp: totp || undefined, accountIdentifier:options && options.accountIdentifier || undefined } }).then(fromGame);
  };
  api.changePassword = function (email, current, next) {
    return gameFetch({ body: { action: 'password', password: current, next: next } }).then(function (d) {
      authRevision++; localStorage.removeItem(TOKEN_KEY); auth.set(null); return d;
    });
  };
  /** Esqueci minha senha: pede o código de 6 dígitos por e-mail. */
  api.forgot = function (email, options) {
    return gameFetch({ body: { action: 'forgot', email: email, accountIdentifier: options && options.accountIdentifier || undefined } })
      .catch(function (e) {
        if (!e.offline) throw e;
        throw new Error('A recuperação por e-mail depende do servidor do jogo, que está fora do ar agora. Fale com a equipe pelo Discord.');
      });
  };
  /** Esqueci minha senha: troca a senha usando o código recebido. */
  api.reset = function (email, code, next, options) {
    return gameFetch({ body: { action: 'reset', email: email, code: code, next: next, recoveryKey: options && options.recoveryKey || undefined, accountIdentifier: options && options.accountIdentifier || undefined } })
      .catch(function (e) {
        if (!e.offline) throw e;
        throw new Error('A recuperação por e-mail depende do servidor do jogo, que está fora do ar agora. Fale com a equipe pelo Discord.');
      });
  };
  /** Autenticador por aplicativo: gera o segredo/QR, confirma o 1º código e desativa. */
  api.totpSetup = function (credentials) { return gameFetch({body:{action:'totp-setup',password:credentials && credentials.password,recoveryKey:credentials && credentials.recoveryKey}}); };
  api.totpEnable = function (code, credentials) { return gameFetch({ body: { action: 'totp-enable', code: code, password:credentials && credentials.password,recoveryKey:credentials && credentials.recoveryKey } }).then(function(d) { acceptSessionMode(d.sessionMode); if (d.token && !cookieMode) localStorage.setItem(TOKEN_KEY,d.token); return d; }); };
  api.totpDisable = function (password, options) { return gameFetch({body:{action:'totp-disable',password:password,code:options && options.code,recoveryKey:options && options.recoveryKey}}); };
  api.email2faRequest = function (value) { return gameFetch({body:{action:'email-2fa-request',enabled:value.enabled,password:value.password,recoveryKey:value.recoveryKey}}); };
  api.email2faConfirm = function (value) { return gameFetch({body:{action:'email-2fa-confirm',enabled:value.enabled,password:value.password,recoveryKey:value.recoveryKey,code:value.code}}); };
  api.recoveryEnrollRequest = function (password) { return gameFetch({body:{action:'recovery-enroll-request',password:password}}); };
  api.recoveryEnrollConfirm = function (password, code) { return gameFetch({body:{action:'recovery-enroll-confirm',password:password,code:code}}); };
  api.recoveryPurchaseState = function () { return gameFetch({body:{action:'recovery-purchase-state'}}); };
  api.recoveryPurchaseRequest = function (value) { return gameFetch({body:{action:'recovery-purchase-request',requestId:value.requestId,keyVersion:value.keyVersion,password:value.password}}); };
  api.recoveryPurchaseConfirm = function (value) { return gameFetch({body:{action:'recovery-purchase-confirm',requestId:value.requestId,keyVersion:value.keyVersion,password:value.password,code:value.code,totp:value.totp,confirmed:value.confirmed,price:value.price}}); };
  api.emailChangeState = function () { return gameFetch({body:{action:'email-change-state'}}); };
  api.emailChangeRequest = function (value) { return gameFetch({body:{action:'email-change-request',requestId:value.requestId,password:value.password,newEmail:value.newEmail}}); };
  api.emailChangeConfirmCurrent = function (value) { return gameFetch({body:{action:'email-change-confirm-current',requestId:value.requestId,password:value.password,code:value.code,totp:value.totp}}); };
  api.emailChangeRequestNew = function (value) { return gameFetch({body:{action:'email-change-request-new',requestId:value.requestId,password:value.password}}); };
  api.emailChangeConfirmNew = function (value) { return gameFetch({body:{action:'email-change-confirm-new',requestId:value.requestId,password:value.password,code:value.code,totp:value.totp}}); };
  api.emailChangeCancelRequest = function (value) { return gameFetch({body:{action:'email-change-cancel-request',requestId:value.requestId,password:value.password}}); };
  api.emailChangeCancel = function (value) { return gameFetch({body:{action:'email-change-cancel',requestId:value.requestId,password:value.password,code:value.code,totp:value.totp}}); };
  /** Confirma o código de 6 dígitos que autoriza este computador. */
  api.confirmDevice = function (email, password, code, options) {
    return gameFetch({ body: { action: 'device-confirm', email: email, password: password, code: code, deviceId: deviceId(), accountIdentifier:options && options.accountIdentifier || undefined } }).then(fromGame);
  };
  api.avatar = function (url) {
    return gameFetch({ body: { action: 'avatar', avatar: url } }).then(function (d) {
      if (auth.user) { auth.user.avatar = d.avatar; auth.set(auth.user); }
      return d.avatar;
    }).catch(function (e) {
      if (!e.offline) throw e;
      var pr = auth.profile() || {}; pr.avatar = url; auth.saveProfile(pr);
      if (auth.user) { auth.user.avatar = url; auth.set(auth.user); }
      return url;
    });
  };
  api.appearance = function (characterId, cardId) {
    var owner = auth.user && String(auth.user.id);
    return gameFetch({ body: { action: 'appearance', characterId: characterId, cardId: cardId } }).then(function (d) {
      if (auth.user && String(auth.user.id) === owner) { auth.user.avatar = d.avatar; auth.set(auth.user); }
      return d.avatar;
    }).catch(function (e) {
      if (e.offline) throw new Error('Não foi possível conectar ao site. Sua aparência não foi salva; tente novamente.');
      throw e;
    });
  };
  /** Foto de UM personagem (retrato + moldura do catálogo). Não mexe na foto da conta. */
  api.characterAppearance = function (playerId, portraitId, cardId) {
    return gameFetch({ body: { action: 'character-appearance', playerId: playerId, portraitId: portraitId, cardId: cardId } }).catch(function (e) {
      // só a falha de rede vira aviso de conexão; os 503 do servidor mantêm a mensagem dele
      if (e.offline && e.message === 'offline') throw new Error('Não foi possível conectar ao site. A foto do treinador não foi salva; tente novamente.');
      throw e;
    });
  };
  api.ticket = function (subject, message) {
    return gameFetch({ body: { action: 'ticket', subject: subject, message: message } });
  };
  api.createCharacter = function (value, sex) {
    var body = typeof value === 'object' ? {action:'character-create',name:value.name,sex:value.sex,world:value.world,portraitId:value.portraitId,cardId:value.cardId} : {action:'character-create',name:value,sex:sex};
    return gameFetch({body:body});
  };
  /** Twitch: status, start, finish, unlink e partner-disconnect (o jogo lê o mesmo vínculo). */
  api.twitch = function (step, extra) { return gameFetch({body:Object.assign({}, extra || {}, {action:'twitch-' + step})}); };
  api.recoveryView = function () { return gameFetch({body:{action:'recovery-view'}}); };
  api.recoveryResend = function () { return gameFetch({body:{action:'recovery-email-resend'}}); };
  api.recoveryAcknowledge = function (keyVersion) { return gameFetch({body:{action:'recovery-ack',keyVersion:keyVersion,saved:true}}); };
  /** Dados frescos da conta do jogo (saldo, treinadores). null se não for conta do jogo. */
  api.me = function () {
    return gameFetch({ method: 'GET', query: '' }).catch(function () { return null; });
  };

  api.logout = function () {
    if (logoutPending) return logoutPending;
    authRevision++;
    logoutPending = gameFetch({body:{action:'logout'}}).then(function (d) {
      localStorage.removeItem(TOKEN_KEY); auth.set(null); return d;
    }).finally(function () { logoutPending = null; });
    return logoutPending;
  };

  var auth = {
    backend: 'game',
    /** Token para as funções /api: o do jogo tem prioridade. */
    token: function () {
      if (cookieMode) return Promise.resolve(null);
      var tk = localStorage.getItem(TOKEN_KEY);
      if (tk) return Promise.resolve(tk);
      return sb ? sb.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : null; }) : Promise.resolve(null);
    },
    /** Saldo real de coins: accounts.diamond_points no banco do jogo. */
    coins: function () {
      return api.me().then(function (d) {
        if (d) return Number(d.coins || 0);
        if (sb && auth.user) return sb.from('wallets').select('coins').eq('user_id', auth.user.id).maybeSingle().then(function (r) { return r.data ? r.data.coins : 0; });
        return null;
      });
    },
    /** Conta completa do jogo (saldo + treinadores). */
    game: function () { return api.me(); },
    usesCookie: function () { return cookieMode; },
    // Server has already revoked this SID. Do not let an older account read
    // restore the local signed-in state after a confirmed security operation.
    endLocalSession: function () { authRevision++; localStorage.removeItem(TOKEN_KEY); auth.set(null); },
    deviceId: deviceId,
    devices: function () { return gameFetch({ body: { action: 'devices', deviceId: deviceId() } }).catch(function () { return null; }); },
    removeDevice: function (id) { return gameFetch({ body: { action: 'device-remove', deviceId: id } }).then(function (d) { if (d.sessionEnded) { authRevision++; localStorage.removeItem(TOKEN_KEY); auth.set(null); } return d; }); },
    profile: function () { return auth.user ? readProfile(auth.user.email) : null; },
    saveProfile: function (p) { if (auth.user) writeProfile(auth.user.email, p); },
    accountUrl: ACCOUNT_URL,
    api: api,
    user: null,
    load: function () { try { auth.user = safeUser(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')); if (auth.user) localStorage.setItem(SESSION_KEY, JSON.stringify(auth.user)); } catch (e) { auth.user = null; } return auth.user; },
    set: function (u) { u = safeUser(u); auth.user = u; if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u)); else localStorage.removeItem(SESSION_KEY); renderSession(); document.dispatchEvent(new CustomEvent('auth:change', { detail: u })); },
    logout: function () { return api.logout().then(function () { if (sb) sb.auth.signOut(); toast('Você saiu da sua conta.'); if (onAccountPage()) setTimeout(function () { location.href = 'index.html'; }, 600); }).catch(function (e) { toast(e.message); }); },
    open: openModal,
    close: closeModal
  };
  PWU.auth = auth;
  PWU.avatarUrl = avatarUrl;

  /* ---------- modal ---------- */
  var modal, currentTab = 'login';
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'auth';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="auth__backdrop" data-close></div>' +
      '<div class="auth__card" role="dialog" aria-modal="true" aria-labelledby="auth-title">' +
        '<button class="auth__close" type="button" aria-label="Fechar" data-close>×</button>' +
        '<div class="auth__head">' +
          '<img class="auth__logo" src="assets/logo-sigla.png" alt="">' +
          '<h2 id="auth-title" class="auth__title">Bem-vindo ao <span class="grad">Pokeworld</span></h2>' +
          '<p class="auth__sub">Entre ou crie sua conta para salvar seu progresso em todas as plataformas.</p>' +
        '</div>' +
        '<div class="auth__tabs" role="tablist">' +
          '<button class="auth__tab is-active" type="button" data-tab="login" role="tab">Entrar</button>' +
          '<button class="auth__tab" type="button" data-tab="register" role="tab">Criar conta</button>' +
          '<span class="auth__tab-ink"></span>' +
        '</div>' +

        '<form class="auth__form" data-form="login" novalidate>' +
          '<label class="field"><span>E-mail</span><input type="email" name="email" autocomplete="email" placeholder="treinador@pokeworld.com" required></label>' +
          '<label class="field"><span>Senha</span><span class="field__pw"><input type="password" name="password" autocomplete="current-password" placeholder="Sua senha" required><button type="button" class="field__eye" aria-label="Mostrar senha"><i class="ico ico-eye" aria-hidden="true"></i></button></span></label>' +
          '<label class="check"><input type="checkbox" name="terms" required><i></i><span>Li e aceito os <a href="#" data-terms>Termos de Uso</a> e a <a href="#" data-terms>Política de Privacidade</a>.</span></label>' +
          '<p class="auth__error" hidden></p>' +
          '<button class="auth__submit" type="submit"><span>Entrar</span></button>' +
          '<p class="auth__switch">Ainda não tem conta? <a href="#" data-goto="register">Cadastre-se</a></p>' +
        '</form>' +

        '<form class="auth__form" data-form="register" hidden novalidate>' +
          '<label class="field"><span>E-mail</span><input type="email" name="email" autocomplete="email" placeholder="treinador@pokeworld.com" required></label>' +
          '<label class="field"><span>Nova senha</span><span class="field__pw"><input type="password" name="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres" minlength="8" required><button type="button" class="field__eye" aria-label="Mostrar senha"><i class="ico ico-eye" aria-hidden="true"></i></button></span></label>' +
          '<div class="strength" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<label class="field"><span>Confirmar senha</span><input type="password" name="confirm" autocomplete="new-password" placeholder="Repita a senha" required></label>' +
          '<label class="check"><input type="checkbox" name="terms" required><i></i><span>Li e aceito os <a href="#" data-terms>Termos de Uso</a> e a <a href="#" data-terms>Política de Privacidade</a>.</span></label>' +
          '<p class="auth__error" hidden></p>' +
          '<button class="auth__submit" type="submit"><span>Criar conta</span></button>' +
          '<p class="auth__switch">Já tem conta? <a href="#" data-goto="login">Entrar</a></p>' +
        '</form>' +

        '<div class="auth__done" hidden>' +
          '<div class="auth__pokeball"><img src="assets/d-sys-icon.svg" alt=""></div>' +
          '<h3 class="auth__done-title">Tudo pronto, <span class="grad" data-name></span>!</h3>' +
          '<p class="auth__sub">Sua conta está ativa. Boa aventura no Pokeworld Universe.</p>' +
          '<button class="auth__submit" type="button" data-close><span>Ir para minha conta</span></button>' +
          '<a class="auth__buy" href="minha-conta.html#coins">Comprar créditos</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-close]')) {
        var justLogged = !modal.querySelector('.auth__done').hidden;
        closeModal();
        if (justLogged && !staysAfterLogin()) location.href = ACCOUNT_URL;
        return;
      }
      var tab = t.closest('[data-tab]'); if (tab) { switchTab(tab.dataset.tab); return; }
      var go = t.closest('[data-goto]'); if (go) { e.preventDefault(); switchTab(go.dataset.goto); return; }
      var eye = t.closest('.field__eye'); if (eye) { var inp = eye.previousElementSibling; inp.type = inp.type === 'password' ? 'text' : 'password'; return; }
      if (t.closest('[data-terms]')) { e.preventDefault(); toast('Termos de Uso: demonstração. Substitua pelo link real.'); }
    });
    modal.querySelectorAll('form').forEach(function (f) { f.addEventListener('submit', onSubmit); });
    var pw = modal.querySelector('[data-form="register"] [name="password"]');
    pw.addEventListener('input', function () {
      var v = pw.value, score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      var bars = modal.querySelectorAll('.strength i');
      bars.forEach(function (b, i) { b.className = i < score ? 'lvl-' + score : ''; });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  }

  function switchTab(tab) {
    currentTab = tab;
    modal.querySelectorAll('.auth__tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === tab); });
    modal.querySelectorAll('.auth__form').forEach(function (f) { f.hidden = f.dataset.form !== tab; });
    modal.querySelector('.auth__done').hidden = true;
    modal.querySelector('.auth__tab-ink').style.transform = 'translateX(' + (tab === 'login' ? 0 : 100) + '%)';
    var first = modal.querySelector('[data-form="' + tab + '"] input');
    if (first) setTimeout(function () { first.focus(); }, 60);
    if (window.gsap) gsap.fromTo('[data-form="' + tab + '"] .field, [data-form="' + tab + '"] .check', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, stagger: 0.06, ease: 'power2.out', overwrite: true });
  }

  function openModal(tab) {
    location.href = LOGIN_URL + (tab === 'register' ? '#criar' : '');
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    var done = function () { modal.hidden = true; document.body.classList.remove('is-locked'); };
    if (window.gsap) {
      gsap.to(modal.querySelector('.auth__card'), { y: 20, scale: 0.96, autoAlpha: 0, duration: 0.25, ease: 'power2.in' });
      gsap.to(modal.querySelector('.auth__backdrop'), { autoAlpha: 0, duration: 0.25, onComplete: done });
    } else done();
  }

  function showError(form, msg) {
    var p = form.querySelector('.auth__error');
    p.textContent = msg; p.hidden = !msg;
    if (msg && window.gsap) gsap.fromTo(form.querySelector('.auth__card, .auth__submit'), { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget, kind = form.dataset.form;
    var email = form.email.value.trim(), password = form.password.value;
    var terms = form.terms.checked;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(form, 'Digite um e-mail válido.');
    if (password.length < 8) return showError(form, 'A senha precisa ter pelo menos 8 caracteres.');
    if (kind === 'register' && password !== form.confirm.value) return showError(form, 'As senhas não coincidem.');
    if (!terms) return showError(form, 'Você precisa aceitar os termos para continuar.');
    showError(form, '');
    var btn = form.querySelector('.auth__submit');
    btn.classList.add('is-loading'); btn.disabled = true;
    var p = kind === 'register' ? api.register(email, password) : api.login(email, password);
    p.then(function (user) {
      auth.set(user);
      form.reset();
      modal.querySelectorAll('.auth__form').forEach(function (f) { f.hidden = true; });
      modal.querySelector('.auth__tabs').hidden = true;
      var d = modal.querySelector('.auth__done');
      d.hidden = false; d.querySelector('[data-name]').textContent = user.name;
      if (window.gsap) {
        gsap.fromTo(d, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5 });
        gsap.fromTo(d.querySelector('.auth__pokeball'), { rotation: -540, scale: 0 }, { rotation: 0, scale: 1, duration: 0.9, ease: 'back.out(1.5)' });
      }
      toast(kind === 'register' ? 'Conta criada com sucesso!' : 'Login realizado!', 'ok');
    }).catch(function (err) {
      showError(form, err.message || 'Algo deu errado. Tente novamente.');
    }).finally(function () {
      btn.classList.remove('is-loading'); btn.disabled = false;
      setTimeout(function () { if (modal && !modal.hidden && modal.querySelector('.auth__done').hidden === false) return; modal && (modal.querySelector('.auth__tabs').hidden = false); }, 0);
    });
  }

  /* ---------- estado de sessão no header ---------- */
  function avatarUrl(u) {
    var pr = u ? (auth.profile() || {}) : {};
    return (u && u.avatar) || pr.avatar || 'assets/logo-sigla.png';
  }

  function renderSession() {
    var u = auth.user;
    document.querySelectorAll('[data-entrar]').forEach(function (el) {
      el.textContent = u ? 'Minha conta' : 'Iniciar sessão';
      el.setAttribute('href', u ? ACCOUNT_URL : LOGIN_URL);
    });
    document.querySelectorAll('[data-auth="login"]').forEach(function (el) {
      el.textContent = u ? 'Minha conta' : (el.dataset.label || 'Iniciar sessão');
    });
    document.querySelectorAll('.user-chip').forEach(function (c) { c.remove(); });

    var acoes = document.querySelector('.topbar-actions');
    var entrar = document.querySelector('[data-entrar]');
    if (entrar) entrar.hidden = !!u;          // logado: o chip toma o lugar do botão

    if (u) {
      var chip = document.createElement('div');
      chip.className = 'user-chip';
      var link = document.createElement('a'); link.href = ACCOUNT_URL; link.setAttribute('aria-label', 'Minha conta');
      var picture = document.createElement('img'); picture.alt = ''; picture.width = 44; picture.height = 44;
      var requestedAvatar = avatarUrl(u), requestedOwner = String(u.id);
      picture.src = requestedAvatar;
      picture.onerror = function () { picture.onerror = null; picture.src = 'assets/logo-sigla.png'; };
      var name = document.createElement('span'); name.textContent = u.name;
      var logout = document.createElement('button'); logout.type = 'button'; logout.textContent = 'Sair'; logout.setAttribute('aria-label', 'Sair');
      logout.addEventListener('click', auth.logout); link.append(picture, name); chip.append(link, logout);
      headerCatalogPromise = headerCatalogPromise || import('./profile-catalog.js?pwu=profile-20260926-v6');
      headerCatalogPromise.then(function (catalog) {
        if (picture.isConnected && auth.user && String(auth.user.id) === requestedOwner && avatarUrl(auth.user) === requestedAvatar) {
          picture.src = catalog.headerAvatarUrl(requestedAvatar);
        }
      }).catch(function () { /* Keep the saved image if the optional close-up cannot load. */ });
      if (acoes) acoes.insertBefore(chip, acoes.firstChild);
      else (document.querySelector('.hero, .topbar') || document.body).appendChild(chip);
    }
  }

  /* ---------- links desligados (wiki fora do ar): clicar não faz nada ---------- */
  document.addEventListener('click', function (e) {
    var off = e.target.closest && e.target.closest('a.is-off');
    if (off) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- menu mobile ---------- */
  function mobileMenu() {
    var btn = document.querySelector('.hamburger');
    if (!btn) return;
    var nav = document.querySelector('.nav');
    var menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.innerHTML = '<div class="mobile-menu__inner">' + (nav ? nav.innerHTML : '') +
      '<a href="#" class="pill pill--yellow" data-auth="login">Iniciar sessão</a></div>';
    document.body.appendChild(menu);
    function toggle(force) {
      var on = typeof force === 'boolean' ? force : !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', on);
      btn.classList.toggle('is-open', on);
      document.body.classList.toggle('is-locked', on);
      if (on && window.gsap) gsap.fromTo('.mobile-menu__inner > *', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out' });
    }
    btn.addEventListener('click', function () { toggle(); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a') || e.target.closest('.mobile-menu__close')) toggle(false); });
    renderSession();
  }

  /* ---------- ligações ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-auth]');
    if (!t) return;
    e.preventDefault();
    if (auth.user) { if (!onAccountPage()) location.href = ACCOUNT_URL; return; }
    // fora das páginas de conta/loja, manda para a página dedicada de login
    if (!onLoginPage() && !staysAfterLogin()) { location.href = LOGIN_URL + (t.dataset.auth === 'register' ? '#criar' : ''); return; }
    openModal(t.dataset.auth === 'register' ? 'register' : 'login');
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-require-auth]');
    if (!t || auth.user) return;
    e.preventDefault();
    toast('Entre na sua conta para continuar.');
    openModal('login');
  });

  auth.load();
  if (auth.user && !auth.user.game) auth.set(null);
  {
    var initialRevision = authRevision, initialUser = auth.user, initialAvatar = auth.user && auth.user.avatar;
    auth.ready = api.me().then(function (d) {
      // A delayed account read must never undo a save or restore a logged-out session.
      if (authRevision !== initialRevision || auth.user !== initialUser || (auth.user && auth.user.avatar) !== initialAvatar) return;
      if (d && d.id) {
        var u = fromGame(d);
        if (!auth.user || String(auth.user.id) !== String(u.id) || auth.user.email !== u.email) auth.set(u);
        else auth.set(Object.assign({}, auth.user, {avatar:u.avatar,onboarding:u.onboarding,recovery:u.recovery,totpPendente:u.totpPendente,totpDisponivel:u.totpDisponivel,totpObrigatorio:u.totpObrigatorio,security:u.security}));
        if (u.onboarding && u.onboarding.required && !['login','onboarding'].includes(document.body.dataset.page)) location.replace('onboarding.html');
      } else if (d === null && gameOn === true) { localStorage.removeItem(TOKEN_KEY); auth.set(null); }
    });
  }
  window.addEventListener('storage', function (e) {
    if (e.key === SESSION_KEY && e.newValue === null) { authRevision++; if (auth.user) auth.set(null); }
  });
  if (sb) sb.auth.getSession().then(function (r) {
    var u = sbUser(r.data.session && r.data.session.user);
    if ((u && (!auth.user || auth.user.id !== u.id)) || (!u && auth.user)) auth.set(u);
  });
  document.addEventListener('DOMContentLoaded', function () { mobileMenu(); renderSession(); });
  if (document.readyState !== 'loading') { mobileMenu(); renderSession(); }
})();
