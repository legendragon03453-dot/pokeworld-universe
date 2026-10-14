import { initProfileCarousel } from './profile-carousel.js?pwu=profile-20260926-v4';
import { characters, cards, appearanceUrl, fromAvatar, portraitMarkup, cardMarkup } from './profile-catalog.js?pwu=profile-20260926-v6';

const editor = document.getElementById('profile-editor');
if (editor && window.PWU?.auth) {
  const auth = PWU.auth;
  const gate = document.getElementById('acc-gate');
  const area = document.getElementById('acc');
  const preview = document.getElementById('profile-preview');
  const message = document.getElementById('profile-message');
  const save = document.getElementById('profile-save');
  const restore = document.getElementById('profile-restore');
  const tabs = [...editor.querySelectorAll('[role="tab"]')];
  let owner = null, savedAvatar = '', characterId = characters[0].id, cardId = 'agua', saving = false, dirty = false, generation = 0;

  function say(text, error = false) {
    message.textContent = text;
    message.classList.toggle('is-error', error);
  }
  function update() {
    preview.innerHTML = portraitMarkup(characterId, cardId);
    editor.querySelectorAll('[data-character]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.character === characterId)));
    editor.querySelectorAll('[data-card]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.card === cardId)));
    editor.querySelectorAll('[data-character], [data-card]').forEach(button => { button.disabled = saving; });
    const changed = appearanceUrl(characterId, cardId) !== savedAvatar;
    save.disabled = saving || !owner || !changed;
    save.textContent = saving ? 'Salvando…' : 'Salvar aparência';
    restore.disabled = saving || !dirty;
    editor.setAttribute('aria-busy', String(saving));
  }
  function reset(avatar) {
    const chosen = fromAvatar(avatar);
    characterId = chosen?.characterId || characters[0].id;
    cardId = chosen?.cardId || 'agua';
    dirty = false;
    update();
    carousels.forEach(carousel => carousel.revealSelection());
  }
  document.querySelector('#tab-characters span').textContent = characters.length;
  document.querySelector('#tab-cards span').textContent = cards.filter(card => card.image).length;
  for (const character of characters) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'profile-choice'; button.dataset.character = character.id;
    button.setAttribute('aria-pressed', 'false');
    const art = document.createElement('span'); art.className = 'profile-choice__art'; art.setAttribute('aria-hidden', 'true');
    art.innerHTML = portraitMarkup(character.id, 'sem-card');
    const label = document.createElement('span'); label.className = 'profile-choice__label'; label.textContent = character.name;
    const check = document.createElement('span'); check.className = 'profile-choice__check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    button.append(art, label, check);
    button.addEventListener('click', () => { characterId = character.id; dirty = true; update(); say(''); });
    document.getElementById('profile-characters').append(button);
  }
  for (const card of cards) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'profile-choice profile-choice--card'; button.dataset.card = card.id;
    button.setAttribute('aria-pressed', 'false');
    const art = document.createElement('span'); art.className = 'profile-choice__art';
    if (card.image) {
      art.innerHTML = cardMarkup(card.id); art.setAttribute('aria-hidden', 'true');
    } else { art.classList.add('profile-choice__empty'); art.textContent = 'PWU'; art.setAttribute('aria-hidden', 'true'); }
    const label = document.createElement('span'); label.className = 'profile-choice__label'; label.textContent = card.name;
    const check = document.createElement('span'); check.className = 'profile-choice__check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    button.append(art, label, check);
    button.addEventListener('click', () => { cardId = card.id; dirty = true; update(); say(''); });
    document.getElementById('profile-cards').append(button);
  }
  const carousels = ['profile-characters', 'profile-cards'].map(id => initProfileCarousel(document.getElementById(id)));
  function openTab(tab, focus = false) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
    });
    requestAnimationFrame(() => carousels.forEach(carousel => { carousel.refresh(); carousel.revealSelection(); }));
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => openTab(tab));
    tab.addEventListener('keydown', event => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== null) { event.preventDefault(); openTab(tabs[next], true); }
    });
  });
  restore.addEventListener('click', () => { reset(savedAvatar); say(''); });
  save.addEventListener('click', async () => {
    if (saving || save.disabled || !owner) return;
    const requestedOwner = owner, requestedGeneration = generation;
    saving = true; update(); say('Salvando sua aparência…');
    try {
      const avatar = await auth.api.appearance(characterId, cardId);
      if (owner !== requestedOwner || generation !== requestedGeneration) return;
      savedAvatar = avatar; dirty = false;
      say('Aparência salva! Seu personagem e seu card já estão no perfil.');
    } catch (error) {
      if (owner === requestedOwner && generation === requestedGeneration) say(error.message || 'Não foi possível salvar. Tente novamente.', true);
    } finally {
      if (owner === requestedOwner && generation === requestedGeneration) { saving = false; update(); }
    }
  });
  function syncUser() {
    const user = auth.user;
    const nextOwner = user?.id == null ? null : String(user.id);
    gate.hidden = !!nextOwner; area.hidden = !nextOwner;
    if (nextOwner === owner) return;
    owner = nextOwner; const currentGeneration = ++generation;
    saving = false; savedAvatar = PWU.avatarUrl(user); reset(savedAvatar);
    if (!owner) return;
    if (user.game && user.totpPendente) { location.replace('login.html'); return; }
    say('');
    if (auth.game) auth.game().then(data => {
      if (generation !== currentGeneration || !data || String(data.id) !== owner || saving) return;
      savedAvatar = data.avatar || '';
      if (!dirty) reset(savedAvatar);
    }).catch(() => {});
  }
  document.addEventListener('auth:change', syncUser);
  syncUser();
}
