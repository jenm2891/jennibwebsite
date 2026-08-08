(function initMobileNav() {
  function setupPageNav() {
    const nav = document.querySelector('header nav');
    if (!nav) {
      return;
    }

    const navGroups = Array.from(nav.querySelectorAll(':scope > div'));
    if (navGroups.length < 2) {
      return;
    }

    const linksGroup = navGroups[0];
    const actionsGroup = navGroups[navGroups.length - 1];

    if (!linksGroup.querySelector('a')) {
      return;
    }

    linksGroup.classList.add('mobile-nav-links');
    actionsGroup.classList.add('mobile-nav-actions');

    if (nav.querySelector('.mobile-menu-button')) {
      return;
    }

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'mobile-menu-button';
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation menu');
    menuButton.innerHTML = '<span aria-hidden="true">Menu</span>';

    nav.insertBefore(menuButton, actionsGroup);

    const closeMenu = () => {
      linksGroup.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mobile-menu-open');
    };

    const openMenu = () => {
      linksGroup.classList.add('is-open');
      menuButton.setAttribute('aria-expanded', 'true');
      document.body.classList.add('mobile-menu-open');
    };

    menuButton.addEventListener('click', () => {
      if (linksGroup.classList.contains('is-open')) {
        closeMenu();
        return;
      }
      openMenu();
    });

    linksGroup.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('a')) {
        closeMenu();
      }
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!nav.contains(target)) {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 760) {
        closeMenu();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPageNav, { once: true });
    return;
  }

  setupPageNav();
})();
