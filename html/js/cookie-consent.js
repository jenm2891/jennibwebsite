(function cookieConsentInit() {
  const STORAGE_KEY = 'jennib_cookie_consent_v1';
  const COOKIE_NAME = 'jb_cookie_consent';

  function setConsentCookie(value) {
    const maxAgeSeconds = 60 * 60 * 24 * 180;
    document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
  }

  function saveChoice(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Ignore storage errors.
    }

    setConsentCookie(choice);
  }

  function getChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function buildBanner() {
    const banner = document.createElement('section');
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie preferences');

    banner.innerHTML = [
      '<div class="cookie-consent-content">',
      '  <div>',
      '    <h2 class="cookie-consent-title">Cookie Notice</h2>',
      '    <p class="cookie-consent-copy">We use essential cookies for secure sign-in, checkout flow, and site reliability. Optional analytics cookies help us improve discoverability and performance. Read our <a href="./privacy.html">Privacy Policy</a>.</p>',
      '  </div>',
      '  <div class="cookie-consent-actions">',
      '    <button type="button" class="cookie-consent-btn reject" data-cookie-choice="rejected">Reject Optional</button>',
      '    <button type="button" class="cookie-consent-btn accept" data-cookie-choice="accepted">Accept All</button>',
      '  </div>',
      '</div>'
    ].join('');

    return banner;
  }

  function init() {
    if (getChoice()) {
      return;
    }

    const banner = buildBanner();
    document.body.appendChild(banner);

    banner.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const choice = target.getAttribute('data-cookie-choice');
      if (!choice) {
        return;
      }

      saveChoice(choice);
      banner.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
    return;
  }

  init();
})();
