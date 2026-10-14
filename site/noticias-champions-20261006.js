(function () {
  'use strict';
  var main = document.querySelector('.pc-news');
  if (!main) return;
  var media = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = media.matches;
  var observer;
  var items = main.querySelectorAll('[data-pc-reveal]');
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pc-motion-toggle';
  toggle.textContent = 'Reduzir movimento';
  toggle.setAttribute('aria-pressed', String(reduced));
  var nav = main.querySelector('.n-jump');
  if (nav) nav.appendChild(toggle);
  function applyMotion() {
    document.body.classList.toggle('pc-reduce-motion', reduced);
    document.body.classList.toggle('pc-allow-motion', !reduced);
    toggle.setAttribute('aria-pressed', String(reduced));
    if (observer) observer.disconnect();
    items.forEach(function (el) { el.classList.remove('pc-pending'); });
    if (reduced || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('pc-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    items.forEach(function (el) {
      if (el.classList.contains('pc-visible')) return;
      var siblings = Array.prototype.filter.call(el.parentNode.children, function (child) { return child.hasAttribute('data-pc-reveal'); });
      el.style.setProperty('--pc-delay', Math.min(siblings.indexOf(el), 3) * 0.2 + 's');
      // Already visible content never flashes blank when initialization runs.
      var box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) { el.classList.add('pc-visible'); return; }
      el.classList.add('pc-pending');
      observer.observe(el);
    });
  }
  toggle.addEventListener('click', function () { reduced = !reduced; applyMotion(); });
  function preferenceChanged(event) { reduced = event.matches; applyMotion(); }
  if (media.addEventListener) media.addEventListener('change', preferenceChanged);
  else if (media.addListener) media.addListener(preferenceChanged);
  applyMotion();
  var topLink = document.querySelector('.pc-to-top');
  var scheduled = false;
  function updateTop() { scheduled = false; if (topLink) topLink.hidden = window.scrollY < 360; }
  updateTop();
  window.addEventListener('scroll', function () {
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(updateTop); }
  }, { passive: true });
  main.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      window.history.pushState(null, '', link.hash);
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });
  if (topLink) topLink.addEventListener('click', function (event) {
    event.preventDefault();
    window.history.replaceState(null, '', '#top');
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    var firstLink = document.querySelector('.topbar .logo-sigla');
    if (firstLink) firstLink.focus({ preventScroll: true });
  });
  // Keyboard navigation must expose an element immediately if it is reached first.
  main.addEventListener('focusin', function (event) {
    var node = event.target.closest('[data-pc-reveal]');
    if (node) { node.classList.add('pc-visible'); if (observer) observer.unobserve(node); }
  });
})();
