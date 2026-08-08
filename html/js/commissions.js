lucide.createIcons();

const CART_STORAGE_KEY = 'jennib_cart_v1';
const commissionPackages = {
  'commission-1': { id: 'commission-1', name: 'Personal Use Commission', price: 35000 },
  'commission-2': { id: 'commission-2', name: 'Commercial Vector Commission', price: 70000 },
  'commission-3': { id: 'commission-3', name: 'NFT Custom Mint Add-On', price: 15000 },
  'commission-4': { id: 'commission-4', name: 'CMS Foundations Build', price: 120000 },
  'commission-5': { id: 'commission-5', name: 'Interactive Front-End Build', price: 350000 },
  'commission-6': { id: 'commission-6', name: 'Full-Stack Architecture (1 hour)', price: 6500 },
  'commission-7': { id: 'commission-7', name: 'Smart Contract Launch', price: 220000 },
  'commission-8': { id: 'commission-8', name: 'dApp Front-End Experience', price: 320000 },
  'commission-9': { id: 'commission-9', name: 'Full dApp Product Stack', price: 550000 }
};

bindCommissionButtons();
initializeThemeToggle();

function bindCommissionButtons() {
  const buttons = document.querySelectorAll('[data-commission-package-id]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const packageId = button.getAttribute('data-commission-package-id');

      if (!packageId || !commissionPackages[packageId]) {
        return;
      }

      addPackageToCart(packageId);
      const feedback = document.getElementById('commission-cart-message');

      if (feedback) {
        feedback.textContent = `${commissionPackages[packageId].name} added to cart.`;
      }
    });
  });
}

function addPackageToCart(id) {
  const cart = loadCart();
  const existing = cart.find((item) => item.id === id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, quantity: 1 });
  }

  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('cart-updated'));
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.id === 'string' && Number(item.quantity) > 0)
      .map((item) => ({
        id: item.id,
        quantity: Number(item.quantity)
      }));
  } catch {
    return [];
  }
}

function initializeThemeToggle() {
  const body = document.body;
  const toggle = document.getElementById('theme-toggle');

  if (localStorage.getItem('theme') === 'dark') {
    applyDark();
  }

  toggle?.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
      body.classList.replace('dark-mode', 'light-mode');
      localStorage.setItem('theme', 'light');
      document.querySelector('.light-icon')?.classList.remove('hidden');
      document.querySelector('.dark-icon')?.classList.add('hidden');
      return;
    }

    applyDark();
  });

  function applyDark() {
    body.classList.replace('light-mode', 'dark-mode');
    localStorage.setItem('theme', 'dark');
    document.querySelector('.light-icon')?.classList.add('hidden');
    document.querySelector('.dark-icon')?.classList.remove('hidden');
  }
}
