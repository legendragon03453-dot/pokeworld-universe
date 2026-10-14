/* Navegação visual do seletor. Não salva fotos nem acessa a API da conta. */
(function () {
  'use strict';
  if (document.body.dataset.page !== 'minha-conta') return;
  var modalBody = document.getElementById('pmodal-body');
  if (!modalBody) return;
  var active = null;
  function mount(box) {
    var cleanups = [];
    var preview = box.querySelector('.foto-picker__preview');
    var subtitle = box.previousElementSibling;
    var title = subtitle && subtitle.previousElementSibling;
    if (preview && subtitle && subtitle.matches('p.sub') && title && title.tagName === 'H3') {
      var summary = document.createElement('div'); summary.className = 'foto-picker__summary';
      preview.before(summary); summary.append(title, preview, subtitle);
    }
    box.querySelectorAll('.foto-picker__row').forEach(function (track, index) {
      var title = track.previousElementSibling;
      if (!title || title.tagName !== 'H4') return;
      var heading = document.createElement('div'); heading.className = 'foto-picker__heading';
      title.before(heading); heading.append(title);
      var nav = document.createElement('div'); nav.className = 'foto-picker__nav';
      var name = title.textContent.toLowerCase();
      track.id = 'foto-picker-options-' + index;
      track.setAttribute('role', 'group'); track.setAttribute('aria-label', title.textContent + ' disponíveis');
      function arrow(direction, label) {
        var button = document.createElement('button'); button.type = 'button';
        button.setAttribute('aria-label', label); button.setAttribute('aria-controls', track.id);
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (direction < 0 ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6') + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        return button;
      }
      var previous = arrow(-1, 'Ver opções anteriores de ' + name);
      var next = arrow(1, 'Ver próximas opções de ' + name);
      var range = document.createElement('span'); range.className = 'foto-picker__range';
      range.setAttribute('role', 'status'); range.setAttribute('aria-live', 'polite'); range.setAttribute('aria-atomic', 'true');
      nav.append(previous, range, next); heading.append(nav);
      var frame = 0;
      var choices = Array.from(track.children);
      function refresh() {
        if (!track.clientWidth) return;
        var bounds = track.getBoundingClientRect();
        var visible = choices.map(function (choice, i) { return {i: i, box: choice.getBoundingClientRect()}; })
          .filter(function (choice) { return choice.box.left >= bounds.left - 2 && choice.box.right <= bounds.right + 2; });
        previous.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
        range.textContent = visible.length ? (visible[0].i + 1) + '–' + (visible[visible.length - 1].i + 1) + ' / ' + choices.length : '';
      }
      function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); }
      function behavior() { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'; }
      function reveal(choice) {
        if (!choice || !track.clientWidth) return;
        var bounds = track.getBoundingClientRect(), item = choice.getBoundingClientRect(), left = track.scrollLeft;
        if (item.left < bounds.left) left += item.left - bounds.left;
        else if (item.right > bounds.right) left += item.right - bounds.right;
        track.scrollTo({left: left, behavior: 'instant'}); schedule();
      }
      function move(direction) {
        var count = Number(getComputedStyle(track).getPropertyValue('--foto-columns')) || 3;
        var stride = choices[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0);
        track.scrollTo({left: Math.round(track.scrollLeft / stride) * stride + direction * count * stride, behavior: behavior()});
      }
      function onPrevious() { move(-1); }
      function onNext() { move(1); }
      function onKey(event) {
        var current = choices.indexOf(event.target);
        if (current < 0) return;
        var destination = {ArrowRight: Math.min(current + 1, choices.length - 1), ArrowLeft: Math.max(current - 1, 0), Home: 0, End: choices.length - 1}[event.key];
        if (destination === undefined) return;
        event.preventDefault(); choices[destination].focus({preventScroll: true}); reveal(choices[destination]);
      }
      previous.addEventListener('click', onPrevious); next.addEventListener('click', onNext);
      track.addEventListener('scroll', schedule, {passive: true}); track.addEventListener('keydown', onKey);
      var lastWidth = 0;
      var resize = new ResizeObserver(function () {
        if (track.clientWidth && track.clientWidth !== lastWidth) {
          lastWidth = track.clientWidth; reveal(track.querySelector('[aria-pressed="true"]'));
        }
        schedule();
      });
      resize.observe(track);
      reveal(track.querySelector('[aria-pressed="true"]')); schedule();
      cleanups.push(function () {
        resize.disconnect(); cancelAnimationFrame(frame);
        previous.removeEventListener('click', onPrevious); next.removeEventListener('click', onNext);
        track.removeEventListener('scroll', schedule); track.removeEventListener('keydown', onKey);
      });
    });
    return {box: box, destroy: function () { cleanups.forEach(function (cleanup) { cleanup(); }); }};
  }
  function sync() {
    var box = modalBody.querySelector('.foto-picker');
    if (active && active.box !== box) { active.destroy(); active = null; }
    if (box && !active) active = mount(box);
  }
  new MutationObserver(sync).observe(modalBody, {childList: true, subtree: true});
  sync();
})();
