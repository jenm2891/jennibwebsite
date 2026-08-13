window.lucide?.createIcons();

const CART_STORAGE_KEY = 'jennib_cart_v1';
const body = document.body;
const toggle = document.getElementById('theme-toggle');
const summaryContainer = document.getElementById('checkout-container');
const payButton = document.getElementById('pay-button');
const errors = document.getElementById('confirm-errors');
const COMMERCE_API_BASE = resolveCommerceApiBase();

function buildAppearance(isDarkMode) {
  const palette = isDarkMode
    ? {
      colorPrimary: '#f3a8ca',
      colorBackground: '#3a3a3a',
      colorText: '#e9d9c8',
      colorDanger: '#f3a8ca',
      colorSuccess: '#a7d676',
      colorWarning: '#fde047',
      colorTextSecondary: '#cfb9a4',
      colorTextPlaceholder: '#b89f8a',
      colorIcon: '#f3a8ca',
      blockBackground: '#2f2f2f',
      inputBackground: '#38322f',
      inputBorder: '#6f635a',
      tabBorder: '#6f635a',
      focusRing: '#6f97d9'
    }
    : {
      colorPrimary: '#9b2c62',
      colorBackground: '#fffef9',
      colorText: '#6a5a4d',
      colorDanger: '#b63b61',
      colorSuccess: '#2f6b3d',
      colorWarning: '#9a6a00',
      colorTextSecondary: '#8a7767',
      colorTextPlaceholder: '#a69283',
      colorIcon: '#9b2c62',
      blockBackground: '#fffef9',
      inputBackground: '#fffef9',
      inputBorder: '#d7c3b3',
      tabBorder: '#ecd8cc',
      focusRing: '#4f6fa8'
    };

  return {
    theme: 'flat',
    inputs: 'spaced',
    labels: 'auto',
    disableAnimations: true,
    variables: {
      colorPrimary: palette.colorPrimary,
      colorBackground: palette.colorBackground,
      colorText: palette.colorText,
      colorDanger: palette.colorDanger,
      colorSuccess: palette.colorSuccess,
      colorWarning: palette.colorWarning,
      colorTextSecondary: palette.colorTextSecondary,
      colorTextPlaceholder: palette.colorTextPlaceholder,
      colorIcon: palette.colorIcon,
      fontFamily: 'Alegreya Sans, sans-serif',
      borderRadius: '12px',
      spacingUnit: '4px'
    },
    rules: {
      '.Block': {
        backgroundColor: palette.blockBackground,
        boxShadow: 'none',
        padding: '12px'
      },
      '.Input': {
        padding: '12px',
        backgroundColor: palette.inputBackground,
        border: `1px solid ${palette.inputBorder}`
      },
      '.Input:focus': {
        boxShadow: `0 0 0 2px ${palette.focusRing}`
      },
      '.Tab': {
        border: `1px solid ${palette.tabBorder}`
      },
      '.Tab--selected': {
        boxShadow: `0 0 0 2px ${palette.colorPrimary}`
      }
    }
  };
}

initializeThemeToggle();
void initializeCheckout();

function initializeThemeToggle() {
  const storedTheme = localStorage.getItem('theme');

  if (storedTheme === 'dark') {
    applyDarkTheme();
  }

  toggle?.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
      body.classList.replace('dark-mode', 'light-mode');
      localStorage.setItem('theme', 'light');
      document.querySelector('.light-icon')?.classList.remove('hidden');
      document.querySelector('.dark-icon')?.classList.add('hidden');
      window.location.reload();
      return;
    }

    applyDarkTheme();
    window.location.reload();
  });
}

function applyDarkTheme() {
  body.classList.replace('light-mode', 'dark-mode');
  localStorage.setItem('theme', 'dark');
  document.querySelector('.light-icon')?.classList.add('hidden');
  document.querySelector('.dark-icon')?.classList.remove('hidden');
}

async function initializeCheckout() {
  try {
    const cartItems = loadCartItems();

    if (!cartItems.length) {
      setStatus('Your cart is empty. Add items from the shop to start checkout.');
      payButton.disabled = true;
      return;
    }

    setStatus('Loading checkout...');

    const { publishableKey } = await fetchJson(commerceUrl('/api/checkout-config'));

    if (!window.Stripe) {
      throw new Error('Stripe.js did not load.');
    }

    const stripe = window.Stripe(publishableKey);
    const appearance = buildAppearance(body.classList.contains('dark-mode'));
    const sessionData = await fetchJson(commerceUrl('/create-checkout-session'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: cartItems
      })
    });

    if (!sessionData.client_secret) {
      throw new Error('Checkout session did not return a client secret.');
    }

    const checkout = stripe.initCheckout({
      clientSecret: sessionData.client_secret,
      elementsOptions: {
        appearance
      }
    });

    const loadActionsResult = await checkout.loadActions();

    if (loadActionsResult.type !== 'success') {
      throw new Error('Stripe checkout actions failed to load.');
    }

    const { actions } = loadActionsResult;
    const session = actions.getSession();

    renderSummary(session);

    checkout.createContactDetailsElement().mount('#contact-details-element');
    checkout.createPaymentElement().mount('#payment-element');

    payButton.disabled = !session.canConfirm;
    checkout.on('change', (updatedSession) => {
      payButton.disabled = !updatedSession.canConfirm;
    });

    payButton.addEventListener('click', async () => {
      errors.textContent = '';
      payButton.disabled = true;

      const result = await actions.confirm();

      if (result.type === 'error') {
        errors.textContent = result.error.message;
        payButton.disabled = false;
        return;
      }

      localStorage.removeItem(CART_STORAGE_KEY);
      window.dispatchEvent(new Event('cart-updated'));
    });
  } catch (error) {
    setStatus(error.message || 'Unable to load checkout.');
    errors.textContent = error.message || 'Unable to load checkout.';
    payButton.disabled = true;
  }
}

function resolveCommerceApiBase() {
  const configured = String(window.__CF_API_BASE || window.__COMMERCE_API_BASE || '').trim();

  if (!configured) {
    return '';
  }

  return configured.endsWith('/') ? configured.slice(0, -1) : configured;
}

function commerceUrl(pathname) {
  if (!COMMERCE_API_BASE) {
    return pathname;
  }

  if (pathname.startsWith('/')) {
    return `${COMMERCE_API_BASE}${pathname}`;
  }

  return `${COMMERCE_API_BASE}/${pathname}`;
}

function loadCartItems() {
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

function renderSummary(session) {
  if (!summaryContainer) {
    return;
  }

  summaryContainer.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Order summary';

  const list = document.createElement('ul');
  const lineItems = Array.isArray(session?.lineItems) ? session.lineItems : [];

  lineItems.forEach((item) => {
    const listItem = document.createElement('li');
    const quantity = item.quantity ?? 1;
    const amount = formatCurrency(item.amountSubtotal ?? item.amount_total ?? 0, session.currency);
    listItem.textContent = `${item.description} x ${quantity} - ${amount}`;
    list.append(listItem);
  });

  const total = document.createElement('p');
  total.textContent = `Total: ${formatCurrency(session?.total?.total?.amount ?? session?.amountTotal ?? 0, session?.currency)}`;

  summaryContainer.append(heading, list, total);
}

function setStatus(message) {
  if (summaryContainer) {
    summaryContainer.textContent = message;
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed for ${url}.`);
  }

  return data;
}

function formatCurrency(amount, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency).toUpperCase()
  }).format((amount || 0) / 100);
}