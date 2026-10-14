import {characters, cards, portraitMarkup, cardMarkup} from './profile-catalog.js?pwu=profile-20260926-v6';
import {worlds} from './world-catalog.js?pwu=onboarding-20260926-v12';
import {initProfileCarousel} from './profile-carousel.js?pwu=profile-20260926-v4';
import {readPrefill, hasPrefill, savePrefill, takePrefill} from './onboarding-prefill.js?pwu=lobby-prefill-20261001-v1';

const root = document.getElementById('onboarding');
const auth = window.PWU?.auth;
const $ = id => document.getElementById(id);
const countdownUiAvailable = ['recovery-countdown', 'recovery-countdown-seconds', 'recovery-countdown-pause', 'recovery-saved-label'].every(id => !!$(id));
let owner = null, generation = 0, stage = '', account = null, busy = false, ready = false;
let recoveryKey = '', keyVersion = null;
let recoveryEmailConfirmed = false, countdownTimer = null, countdownToken = 0, countdownStarted = false;
let recoveryFlow = 'security', signupNeedsCharacter = false;
let portraitId = characters[0].id, cardId = cards[0].id;
const explicitNew = new URLSearchParams(location.search).get('novo') === '1';
// Criar personagem pelo jogo sem sessão no site: entra e volta direto para a criação (o login.js só aceita este next).
const LOGIN_NOVO_PERSONAGEM = 'login.html?next=novo-personagem';
if (explicitNew) $('onboarding-login')?.setAttribute('href', LOGIN_NOVO_PERSONAGEM);
// Nome e sexo enviados pelo jogo (onboarding.html?novo=1&nome=...&sexo=m|f). Só preenchem os campos.
const urlPrefill = readPrefill(location.search);
function tabStorage() { try { return window.sessionStorage; } catch { return null; } }
const panels = ['onboarding-status', 'recovery-panel', 'character-panel', 'onboarding-complete'];

function clearKey() {
  stopCountdown(); countdownStarted = false; recoveryEmailConfirmed = false;
  recoveryKey = ''; keyVersion = null;
  $('recovery-key-value').value = '';
  $('recovery-saved').checked = false;
  $('recovery-continue').disabled = true;
  if ($('recovery-saved-label')) $('recovery-saved-label').hidden = false;
}
function stopCountdown() {
  clearInterval(countdownTimer); countdownTimer = null; ++countdownToken;
  if ($('recovery-countdown')) $('recovery-countdown').hidden = true;
}
function canContinueRecovery() {
  return !busy && current() && stage === 'recovery' && !$('recovery-panel').hidden && !!recoveryKey && keyVersion != null
    && (recoveryEmailConfirmed || $('recovery-saved').checked);
}
function updateRecoveryControls() {
  if ($('recovery-saved-label')) $('recovery-saved-label').hidden = recoveryEmailConfirmed;
  $('recovery-continue').disabled = !canContinueRecovery();
}
function recoveryContext(onboarding) {
  recoveryFlow = onboarding?.recoveryFlow === 'signup' ? 'signup' : 'security';
  signupNeedsCharacter = recoveryFlow === 'signup' && onboarding?.hasCharacters === false;
  const security = recoveryFlow === 'security';
  const steps = root.querySelector('.onboarding__steps'), eyebrow = root.querySelector('.onboarding__eyebrow'), kicker = $('recovery-panel').querySelector('.ob-kicker');
  if (steps) steps.hidden = security;
  if (eyebrow) eyebrow.textContent = security ? 'PROTEÇÃO DA SUA CONTA' : 'SUA JORNADA COMEÇA AQUI';
  if ($('onboarding-title')) $('onboarding-title').innerHTML = security ? 'Sua <span>Recovery Key</span>' : 'Prepare sua <span>conta</span>';
  if (kicker) kicker.textContent = security ? 'CHAVE DE RECUPERAÇÃO' : 'ETAPA 2 DE 3';
  $('recovery-continue').textContent = security ? explicitNew ? 'Continuar para criar personagem' : 'Voltar para minha conta' : 'Continuar agora';
}
function startCountdown() {
  if (!countdownUiAvailable || !signupNeedsCharacter || countdownStarted || !recoveryEmailConfirmed || !canContinueRecovery()) return;
  countdownStarted = true;
  const version = generation, token = ++countdownToken, deadline = Date.now() + 10000;
  message('recovery-countdown-seconds', '10'); $('recovery-countdown').hidden = false;
  countdownTimer = setInterval(() => {
    if (token !== countdownToken) return;
    if (!current(version) || stage !== 'recovery' || $('recovery-panel').hidden || busy || !recoveryEmailConfirmed) return stopCountdown();
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    message('recovery-countdown-seconds', String(remaining));
    if (remaining === 0) { stopCountdown(); acknowledgeRecovery(); }
  }, 1000);
}
function current(version = generation) {
  return version === generation && owner && String(auth.user?.id) === owner;
}
function message(id, text = '') { $(id).textContent = text; }
function panel(id, focusId) {
  panels.forEach(name => { $(name).hidden = name !== id; });
  root.setAttribute('aria-busy', 'false');
  if (focusId) $(focusId).focus({preventScroll:true});
}
function status(text, retry = false, login = false) {
  panel('onboarding-status');
  message('onboarding-status-text', text);
  $('onboarding-retry').hidden = !retry;
  $('onboarding-login').hidden = !login;
}
function progress(value) {
  const sequence = ['email', 'recovery', 'character'];
  const active = value === 'complete' ? 3 : sequence.indexOf(value);
  root.querySelectorAll('[data-stage]').forEach((item, index) => {
    item.classList.toggle('is-current', index === active);
    item.classList.toggle('is-done', index < active);
    if (index === active) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}
function emailStatus(value) {
  recoveryEmailConfirmed = countdownUiAvailable && signupNeedsCharacter && value === 'sent';
  if (!recoveryEmailConfirmed) stopCountdown();
  const text = value === 'sent' ? 'O envio desta chave por e-mail foi confirmado.'
    : value === 'failed' ? 'Não foi possível enviar a chave por e-mail. Guarde sua cópia e, se quiser, tente reenviar.'
      : 'O envio da chave por e-mail ainda não foi confirmado. Guarde sua cópia em um local privado.';
  message('recovery-email-status', text);
  $('recovery-resend').hidden = value === 'sent';
  updateRecoveryControls();
}
function paintAppearance() {
  $('character-preview-art').innerHTML = portraitMarkup(portraitId, cardId);
  root.querySelectorAll('[data-portrait]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.portrait === portraitId)));
  root.querySelectorAll('[data-card]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.card === cardId)));
}
for (const world of worlds) {
  const label = document.createElement('label'); label.className = 'world-choice';
  const input = document.createElement('input'); input.type = 'radio'; input.name = 'world'; input.value = world.slug;
  input.disabled = world.enabled !== true; input.checked = world.slug === 'galaxy';
  const name = document.createElement('strong'); name.textContent = world.name;
  const state = document.createElement('small'); state.textContent = world.enabled ? 'Disponível' : 'Em breve';
  label.append(input, name, state); $('world-options').append(label);
}
for (const [items, track, kind] of [[characters, 'ob-portraits', 'portrait'], [cards, 'ob-cards', 'card']]) {
  for (const item of items) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ob-choice';
    button.dataset[kind] = item.id; button.setAttribute('aria-pressed', 'false');
    const art = document.createElement('span'); art.className = 'ob-choice__art'; art.setAttribute('aria-hidden', 'true');
    art.innerHTML = kind === 'portrait' ? portraitMarkup(item.id, 'sem-card') : cardMarkup(item.id);
    const label = document.createElement('span'); label.textContent = item.name;
    button.append(art, label);
    button.addEventListener('click', () => {
      if (busy) return;
      if (kind === 'portrait') portraitId = item.id; else cardId = item.id;
      paintAppearance();
    });
    $(track).append(button);
  }
}
const carousels = ['ob-portraits','ob-cards'].map(id => initProfileCarousel($(id)));
const tabs = [...root.querySelectorAll('[role="tab"]')];
function openTab(tab, focus = false) {
  tabs.forEach(button => {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $(button.getAttribute('aria-controls')).hidden = !selected;
  });
  requestAnimationFrame(() => carousels.forEach(carousel => { carousel.refresh(); carousel.revealSelection(); }));
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => openTab(tab));
  tab.addEventListener('keydown', event => {
    const next = {ArrowRight:1-index, ArrowLeft:1-index, Home:0, End:1}[event.key];
    if (next !== undefined) { event.preventDefault(); openTab(tabs[next], true); }
  });
});
paintAppearance();
function characterNameError(text = '', focus = false) {
  const field = $('character-name'), error = $('character-name-error');
  field.setAttribute('aria-invalid', String(!!text));
  if (error) { error.textContent = text; error.hidden = !text; }
  else if (text) message('character-message', text);
  if (text && focus) field.focus();
}
$('character-name').addEventListener('input', event => {
  characterNameError();
  message('character-preview-name', event.target.value.trim() || 'Seu personagem');
});
function applyPrefill(prefill) {
  if (prefill.name !== null && !$('character-name').value.trim()) {
    $('character-name').value = prefill.name;
    message('character-preview-name', prefill.name);
  }
  if (prefill.sex !== null) $('character-sex').value = String(prefill.sex);
}
applyPrefill(urlPrefill);

async function load() {
  clearKey(); busy = false;
  const version = ++generation;
  owner = auth.user?.id == null ? null : String(auth.user.id);
  if (!owner && explicitNew) location.replace(LOGIN_NOVO_PERSONAGEM);
  if (!owner) {
    // Guarda o nome/sexo do jogo nesta aba para depois do login.
    savePrefill(tabStorage(), urlPrefill);
    return status('Entre na sua conta para continuar sua jornada.', false, true);
  }
  status('Conferindo sua conta…'); root.setAttribute('aria-busy', 'true');
  try {
    const result = await auth.api.me();
    if (!current(version)) return;
    const data = result?.account || result;
    if (!data || String(data.id) !== owner) throw new Error('Não foi possível confirmar sua sessão. Entre novamente ou tente atualizar.');
    account = data;
    const onboarding = data.onboarding;
    recoveryContext(onboarding);
    if (onboarding?.required && !['recovery','character'].includes(onboarding.stage)) throw new Error('Não foi possível confirmar a próxima etapa. Tente novamente.');
    stage = onboarding?.required ? onboarding.stage : explicitNew ? 'character' : 'complete';
    progress(stage);
    if (stage === 'recovery') {
      const result = await auth.api.recoveryView();
      if (!current(version)) return;
      if (typeof result.recoveryKey !== 'string' || !result.recoveryKey.trim() || result.keyVersion == null || result.onboarding?.stage !== 'recovery') {
        throw new Error('Sua chave não está disponível nesta etapa. Atualize para conferir sua conta.');
      }
      recoveryKey = result.recoveryKey; keyVersion = result.keyVersion;
      recoveryContext(result.onboarding);
      $('recovery-key-value').value = recoveryKey;
      message('recovery-message'); emailStatus(result.emailStatus);
      panel('recovery-panel', 'recovery-title');
      updateRecoveryControls(); startCountdown();
    } else if (stage === 'character') {
      if (recoveryFlow === 'security' && !explicitNew) {
        if (!onboarding?.recoveryAcknowledged || !Number.isSafeInteger(data.recovery?.keyVersion)) throw new Error('Confira sua Recovery Key antes de continuar pela conta.');
        busy = true; status('Conferindo a conclusão da entrega da sua chave…');
        const result = await auth.api.recoveryAcknowledge(data.recovery.keyVersion);
        if (!current(version)) return;
        if (result.ok !== true || result.onboarding?.stage !== 'complete' || result.onboarding?.recoveryAcknowledged !== true || result.onboarding?.recoveryFlow !== 'security') throw new Error('Não foi possível confirmar a conclusão. Tente novamente.');
        clearKey(); stage = 'complete'; location.replace('minha-conta.html'); return;
      }
      if (recoveryFlow === 'security' && explicitNew) {
        const eyebrow = root.querySelector('.onboarding__eyebrow');
        if (eyebrow) eyebrow.textContent = 'NOVA JORNADA';
        if ($('onboarding-title')) $('onboarding-title').innerHTML = 'Crie seu <span>personagem</span>';
      }
      // Foto do NOVO treinador (não a da conta): sugere um retrato que nenhum treinador da conta usa ainda.
      const usados = new Set((data.trainers || []).map(t => t.profile && t.profile.portraitId).filter(Boolean));
      portraitId = (characters.find(c => !usados.has(c.id)) || characters[0]).id; cardId = cards[0].id;
      paintAppearance();
      // Uso único: o que veio do jogo antes do login (se a URL atual não trouxe nome/sexo).
      const pendingPrefill = takePrefill(tabStorage());
      if (!hasPrefill(urlPrefill)) applyPrefill(pendingPrefill);
      const hasCharacters = !!data.trainers?.length || onboarding?.hasCharacters;
      $('character-title').innerHTML = hasCharacters ? 'Crie um <span>novo personagem</span>' : 'Crie seu <span>primeiro personagem</span>';
      message('character-step-label', recoveryFlow === 'signup' && onboarding?.required ? 'ETAPA 3 DE 3' : 'NOVA JORNADA');
      panel('character-panel', 'character-title');
      requestAnimationFrame(() => carousels.forEach(carousel => carousel.refresh()));
    } else {
      message('complete-message', 'Sua conta está pronta. Continue sua jornada pelo perfil.');
      panel('onboarding-complete', 'complete-title');
    }
  } catch (error) {
    if (!current(version)) return;
    clearKey(); status(error.message || 'Não foi possível carregar esta etapa.', true, true);
  }
}
$('onboarding-retry').addEventListener('click', load);
$('recovery-saved').addEventListener('change', updateRecoveryControls);
$('recovery-countdown-pause')?.addEventListener('click', () => {
  if (!current() || stage !== 'recovery') return;
  stopCountdown(); countdownStarted = true;
  message('recovery-message', 'Avanço automático pausado. Continue quando estiver pronto.');
  updateRecoveryControls();
});
$('recovery-copy').addEventListener('click', async () => {
  if (!current() || !recoveryKey) return;
  const version = generation;
  try {
    await navigator.clipboard.writeText(recoveryKey);
    if (current(version)) message('recovery-message', 'Chave copiada. Cole em um local privado e seguro.');
  } catch {
    if (!current(version)) return;
    $('recovery-key-value').focus(); $('recovery-key-value').select();
    message('recovery-message', 'Selecione e copie a chave para um local privado e seguro.');
  }
});
$('recovery-resend').addEventListener('click', async () => {
  if (busy || !current() || !recoveryKey) return;
  const version = generation; busy = true; $('recovery-resend').disabled = true; $('recovery-continue').disabled = true;
  try {
    const result = await auth.api.recoveryResend();
    if (current(version)) emailStatus(result.emailStatus);
  } catch (error) { if (current(version)) message('recovery-message', error.message || 'Não foi possível reenviar. Sua chave continua disponível acima.'); }
  finally { if (current(version)) { busy = false; $('recovery-resend').disabled = false; updateRecoveryControls(); startCountdown(); } }
});
async function acknowledgeRecovery() {
  if (!canContinueRecovery()) return;
  stopCountdown(); countdownStarted = true;
  const version = generation; busy = true; $('recovery-continue').disabled = true;
  message('recovery-message', 'Confirmando esta etapa…');
  try {
    const result = await auth.api.recoveryAcknowledge(keyVersion);
    if (!current(version)) return;
    if (result.ok !== true || !result.onboarding?.recoveryAcknowledged || result.onboarding.stage === 'recovery') throw new Error('Não foi possível confirmar esta etapa. Tente novamente.');
    if (recoveryFlow === 'security' && !explicitNew) {
      if (result.onboarding.stage !== 'complete' || result.onboarding.recoveryFlow !== 'security') throw new Error('Não foi possível confirmar a conclusão. Tente novamente.');
      clearKey(); stage = 'complete'; location.replace('minha-conta.html'); return;
    }
    clearKey(); await load();
  } catch (error) { if (current(version)) message('recovery-message', error.message || 'Não foi possível confirmar. Tente novamente.'); }
  finally { if (current(version)) { busy = false; updateRecoveryControls(); } }
}
$('recovery-continue').addEventListener('click', acknowledgeRecovery);
$('character-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !current() || stage !== 'character') return;
  const name = $('character-name').value.trim();
  characterNameError(); message('character-message');
  if (name.length < 3 || name.length > 20 || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) { characterNameError('Use de 3 a 20 letras, sem acentos ou números. O espaço entre palavras é opcional.', true); return; }
  const world = root.querySelector('input[name="world"]:checked');
  if (!world || world.disabled || world.value !== 'galaxy') return message('character-message', 'Escolha o mundo Galaxy para começar.');
  const version = generation; busy = true; $('character-submit').disabled = true;
  root.querySelectorAll('.ob-choice').forEach(button => { button.disabled = true; });
  message('character-message', 'Criando seu personagem…');
  try {
    const result = await auth.api.createCharacter({name, sex:Number($('character-sex').value), world:world.value, portraitId, cardId});
    if (!current(version)) return;
    if (!result.character?.id) throw new Error('Não foi possível confirmar a criação. Confira sua conta antes de tentar novamente.');
    const fresh = await auth.api.me();
    if (!current(version)) return;
    const data = fresh?.account || fresh;
    if (!data || String(data.id) !== owner || data.onboarding?.required) throw new Error('A criação foi recebida, mas a conclusão ainda não foi confirmada. Atualize sua conta antes de tentar novamente.');
    account = data; stage = 'complete'; clearKey(); progress(stage);
    auth.set({...auth.user, avatar:data.avatar || null, trainers:data.trainers || [], onboarding:data.onboarding});
    message('complete-message', result.character.name + ' foi criado no mundo Galaxy.');
    panel('onboarding-complete', 'complete-title');
  } catch (error) {
    if (current(version)) {
      if (error.status === 409 && error.message === 'Este nome já está em uso.') {
        message('character-message'); characterNameError('Este nome já está em uso. Escolha outro.', true);
      } else message('character-message', error.offline ? 'Não foi possível confirmar a criação. Atualize sua conta antes de tentar novamente.' : error.message || 'Não foi possível criar. Tente novamente.');
    }
  } finally {
    if (current(version)) { busy = false; $('character-submit').disabled = false; root.querySelectorAll('.ob-choice').forEach(button => { button.disabled = false; }); }
  }
});
$('onboarding-logout').addEventListener('click', async () => {
  clearKey(); ++generation;
  try { await auth.api.logout(); location.replace('login.html'); }
  catch (error) { status(error.message || 'Não foi possível sair. Tente novamente.', true); }
});
document.addEventListener('auth:change', () => {
  stopCountdown();
  if (!ready || String(auth.user?.id) === owner) return;
  ++generation; owner = null; clearKey();
  status('Sua sessão mudou. Entre novamente para continuar.', false, true);
});
window.addEventListener('pagehide', () => { ++generation; clearKey(); });
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
if (!auth) status('Não foi possível iniciar esta página. Atualize para tentar novamente.', false, true);
else Promise.resolve(auth.ready).then(() => { ready = true; load(); }).catch(() => status('Não foi possível verificar sua conta.', true, true));
