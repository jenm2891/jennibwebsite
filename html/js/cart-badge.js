(() => {
  const CART_STORAGE_KEY = 'jennib_cart_v1';

  function getCartCount() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);

      if (!raw) {
        return 0;
      }

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return 0;
      }

      return parsed.reduce((sum, item) => {
        if (typeof item === 'string') {
          return sum + 1;
        }

        if (item && typeof item.id === 'string' && Number(item.quantity) > 0) {
          return sum + Number(item.quantity);
        }

        return sum;
      }, 0);
    } catch {
      return 0;
    }
  }

  function updateCartBadges() {
    const count = getCartCount();
    const badges = document.querySelectorAll('[data-cart-badge]');

    badges.forEach((badge) => {
      badge.textContent = String(count);
      badge.classList.toggle('hidden', count === 0);
    });
  }

  updateCartBadges();
  window.addEventListener('storage', updateCartBadges);
  window.addEventListener('cart-updated', updateCartBadges);
})();
