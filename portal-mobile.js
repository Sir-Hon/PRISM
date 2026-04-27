/**
 * Mobile / narrow screens: sidebar becomes an off-canvas drawer (full-width main).
 * Requires portal.css @media (max-width: 1023px) and .topbar-menu-btn / .sidebar-backdrop styles.
 */
(function () {
  var MQ = '(max-width: 1023px)';

  function isNarrow() {
    return typeof window.matchMedia === 'function' && window.matchMedia(MQ).matches;
  }

  function getBackdrop() {
    return document.getElementById('prism-sidebar-backdrop');
  }

  function getMenuBtn() {
    return document.getElementById('prism-mobile-menu-btn');
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    var s = document.querySelector('.app-layout .sidebar');
    if (s) s.classList.remove('open');
    var b = getBackdrop();
    if (b) {
      b.classList.remove('visible');
      b.setAttribute('aria-hidden', 'true');
    }
    var btn = getMenuBtn();
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
  }

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    var s = document.querySelector('.app-layout .sidebar');
    if (s) s.classList.add('open');
    var b = getBackdrop();
    if (b) {
      b.classList.add('visible');
      b.setAttribute('aria-hidden', 'false');
    }
    var btn = getMenuBtn();
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
    }
  }

  function toggleSidebar() {
    if (document.body.classList.contains('sidebar-open')) closeSidebar();
    else openSidebar();
  }

  function onNavClick(e) {
    var el = e.target && e.target.closest
      ? e.target.closest('a.sidebar-link, button.sidebar-class-item, button.sidebar-logout, a.sidebar-user-avatar')
      : null;
    if (el && isNarrow()) closeSidebar();
  }

  function initMobileNav() {
    var topbar = document.querySelector('.topbar');
    var layout = document.querySelector('.app-layout');
    if (!topbar || !layout) return;

    if (!getMenuBtn()) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'prism-mobile-menu-btn';
      btn.className = 'topbar-menu-btn';
      btn.setAttribute('aria-label', 'Open menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'prism-sidebar-backdrop');
      btn.innerHTML =
        '<span aria-hidden="true" style="font-size:1.35rem;line-height:1;">☰</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      });
      topbar.insertBefore(btn, topbar.firstChild);
    }

    if (!getBackdrop()) {
      var bd = document.createElement('div');
      bd.id = 'prism-sidebar-backdrop';
      bd.className = 'sidebar-backdrop';
      bd.setAttribute('aria-hidden', 'true');
      bd.addEventListener('click', function () {
        closeSidebar();
      });
      layout.insertBefore(bd, layout.firstChild);
    }

    var sidebar = document.querySelector('.app-layout .sidebar');
    if (sidebar && !sidebar.dataset.prismMobileBound) {
      sidebar.dataset.prismMobileBound = '1';
      sidebar.addEventListener('click', onNavClick);
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSidebar();
    });

    var mq = window.matchMedia(MQ);
    function onMqChange() {
      if (!mq.matches) closeSidebar();
    }
    if (mq.addEventListener) mq.addEventListener('change', onMqChange);
    else if (mq.addListener) mq.addListener(onMqChange);
  }

  function boot() {
    initMobileNav();
    /* Some WebViews run deferred scripts before layout is stable; retry once. */
    requestAnimationFrame(function () {
      initMobileNav();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', initMobileNav);
})();
