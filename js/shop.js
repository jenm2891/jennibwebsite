lucide.createIcons();

const CART_STORAGE_KEY = 'jennib_cart_v1';
const catalogContainer = document.getElementById('shop-catalog');
const COMMERCE_API_BASE = resolveCommerceApiBase();

// Add real image paths here as you upload assets (e.g. '/images/the-chair.jpg').
const CARD_IMAGE_BY_PIECE = {
  'King Germutt Sticker': 'Images/kinggermutt.png',
  'Germutt # 3': 'Images/Germutt3.png',
  'The Chair': 'Images/Chair.png',
  'The Kitchen': 'Images/thekitchen.PNG',
  'The Bookshelf': 'Images/thebookshelf.PNG',
  'Sunrise': '',
  'Dreams of Dreaming': '',
  'The Window': '',
  'Heart of the 80s': '',
  'Floral Fall': '',
  'Into the Void': '',
  'Summers End Pattern': '',
  'Floral Fall Pattern': ''
};

const STICKER_PACK_LISTINGS = [
  { pieceName: 'King Germutt Sticker', label: 'High-Quality Vinyl Sticker 5 pack', price: 500 },
  { pieceName: 'Germutt # 3', label: 'High-Quality Vinyl Sticker 5 pack', price: 500 }
];

const DIGITAL_ART_PIECES = [
  'The Chair',
  'The Kitchen',
  'The Bookshelf',
  'Sunrise',
  'Dreams of Dreaming'
];

const ONE_OF_ONE_LISTINGS = [
  {
    pieceName: 'The Window',
    label: 'Original Physical Artwork (Small 9x12) - Acrylic on Archival Paper' ,
    price: 40000
  },
  {
    pieceName: 'Heart of the 80s',
    label: 'Original Physical Artwork (Small 5x9) - Acrylic on Archival Paper',
    price: 25000
  },
  {
    pieceName: 'Floral Fall',
    label: 'Original Physical Artwork (Small 5x9) - Acrylic on Archival Paper',
    price: 25000
  }, 
];

const PATTERN_PIECES = [
  'Summers End Pattern',
  'Floral Fall Pattern'
];

const DIGITAL_ART_OPTIONS = [
  { label: 'Art Print Matte/Luster 8x10', price: 3500 },
  { label: 'Art Print Matte/Luster 11x14', price: 4500 },
  { label: 'Art Print Matte/Luster 16x20', price: 6500 },
  { label: 'Art Print Archival Giclee 11x14', price: 6500 },
  { label: 'Art Print Archival Giclee 16x20', price: 9500 },
  { label: 'T-Shirt Edition', price: 3500 }
];

const PATTERN_OPTIONS = [
  { label: 'Pattern License - Non-Commercial', price: 2500 },
  { label: 'Pattern License - Commercial', price: 12500 }
];

const DEFAULT_CARD_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='700' viewBox='0 0 900 700'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23f4a3bb'/%3E%3Cstop offset='50%25' stop-color='%235c7fbf'/%3E%3Cstop offset='100%25' stop-color='%23a7d676'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='900' height='700' fill='url(%23g)'/%3E%3Ccircle cx='230' cy='260' r='150' fill='%23ffffff' fill-opacity='0.18'/%3E%3Ccircle cx='640' cy='390' r='170' fill='%23ffffff' fill-opacity='0.14'/%3E%3C/svg%3E";

function getCardImageUrl(pieceName) {
  const imagePath = CARD_IMAGE_BY_PIECE[pieceName];
  return imagePath && imagePath.trim() ? imagePath.trim() : DEFAULT_CARD_IMAGE;
}

function buildFallbackCatalog() {
  let sequence = 1;
  const products = [];

  const nextProduct = (pieceName, option, category) => {
    const product = {
      id: `product-${sequence}`,
      name: `${pieceName} - ${option.label}`,
      price: option.price,
      category
    };

    sequence += 1;
    products.push(product);
    return { id: product.id, label: option.label };
  };

  const buildCards = (pieces, options, category) => {
    return pieces.map((pieceName) => ({
      pieceName,
      imageUrl: getCardImageUrl(pieceName),
      options: options.map((option) => nextProduct(pieceName, option, category))
    }));
  };

  const buildListingCards = (listings, category) => {
    return listings.map((listing) => ({
      pieceName: listing.pieceName,
      imageUrl: getCardImageUrl(listing.pieceName),
      useDropdown: false,
      options: [
        {
          id: nextProduct(listing.pieceName, { label: listing.label, price: listing.price }, category).id,
          label: listing.label
        }
      ]
    }));
  };

  const sections = [
    {
      title: 'Sticker Packs',
      tone: 'pink',
      useDropdown: false,
      note: 'Exclusive sticker bundles for collectors and shipping-ready merch drops.',
      cards: buildListingCards(STICKER_PACK_LISTINGS, 'Sticker Packs')
    },
    {
      title: 'Digital Downloads',
      tone: 'green',
      useDropdown: false,
      note: 'A dedicated space for downloadable editions is coming soon.',
      cards: []
    },
    {
      title: 'Digital Art',
      tone: 'yellow',
      useDropdown: true,
      note: 'All physical prints are signed, dated, and include the hand-written edition number plus an authentication seal.',
      cards: buildCards(DIGITAL_ART_PIECES, DIGITAL_ART_OPTIONS, 'Digital Art')
    },
    {
      title: '1/1 Art',
      tone: 'blue',
      useDropdown: false,
      note: 'Each 1/1 piece is listed once with its exact format and size details.',
      cards: buildListingCards(ONE_OF_ONE_LISTINGS, '1/1 Art')
    },
    {
      title: 'Patterns',
      tone: 'lavender',
      useDropdown: true,
      note: 'Choose either a non-commercial or commercial pattern license for each pattern piece.',
      cards: buildCards(PATTERN_PIECES, PATTERN_OPTIONS, 'Patterns')
    }
  ];

  return { sections, products };
}

const { sections: shopSections, products: fallbackProducts } = buildFallbackCatalog();

let products = [...fallbackProducts];
let productIndex = new Map(products.map((product) => [product.id, product]));
let cart = loadCart();

initializeShop();

async function initializeShop() {
  await loadProductsFromServer();
  renderCatalog();
  updateCartUI();
  initializeThemeToggle();
}

async function loadProductsFromServer() {
  try {
    const response = await fetch(commerceUrl('/api/products'), {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();

    if (!Array.isArray(payload?.products) || payload.products.length === 0) {
      return;
    }

    const incoming = payload.products
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        category: item.category || ''
      }));

    const incomingById = new Map(incoming.map((item) => [item.id, item]));
    const merged = [];

    fallbackProducts.forEach((fallback) => {
      merged.push(incomingById.get(fallback.id) || fallback);
    });

    products = merged;
    productIndex = new Map(products.map((product) => [product.id, product]));
  } catch {
    // Keep fallback products when API is unavailable.
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

function renderCatalog() {
  if (!catalogContainer) {
    return;
  }

  catalogContainer.innerHTML = '';

  shopSections.forEach((sectionConfig) => {
    const section = document.createElement('section');
    section.className = `shop-category shop-category--${sectionConfig.tone} space-y-4`;

    const heading = document.createElement('h3');
    heading.className = 'font-display text-2xl';
    heading.textContent = sectionConfig.title;

    const note = document.createElement('p');
    note.className = 'shop-category-note';
    note.textContent = sectionConfig.note;

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

    sectionConfig.cards.forEach((cardConfig) => {
      const availableOptions = cardConfig.options.filter((option) => productIndex.has(option.id));

      if (availableOptions.length === 0) {
        return;
      }

      const card = document.createElement('article');
      card.className = 'shop-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow';

      const image = document.createElement('img');
      image.className = 'shop-card-image';
      image.src = cardConfig.imageUrl || DEFAULT_CARD_IMAGE;
      image.alt = `${cardConfig.pieceName} preview`;
      image.loading = 'lazy';

      const content = document.createElement('div');
      content.className = 'p-5 flex flex-col gap-3';

      const name = document.createElement('h4');
      name.className = 'canva-text font-display';
      name.textContent = cardConfig.pieceName;

      const price = document.createElement('p');
      price.className = 'canva-text variant-price mt-1 font-bold';
      price.textContent = formatCurrency(productIndex.get(availableOptions[0].id)?.price || 0);

      let selectedProductId = availableOptions[0].id;

      if (sectionConfig.useDropdown !== false) {
        const selectorLabel = document.createElement('label');
        selectorLabel.className = 'variant-label';
        selectorLabel.textContent = 'Choose format';

        const selector = document.createElement('select');
        selector.className = 'variant-select rounded-xl border px-3 py-2';

        availableOptions.forEach((option) => {
          const product = productIndex.get(option.id);
          const choice = document.createElement('option');
          choice.value = option.id;
          choice.textContent = `${option.label} - ${formatCurrency(product.price)}`;
          selector.append(choice);
        });

        selector.addEventListener('change', () => {
          selectedProductId = selector.value;
          const selectedProduct = productIndex.get(selector.value);
          price.textContent = formatCurrency(selectedProduct?.price || 0);
        });

        content.append(selectorLabel, selector);
      } else {
        const formatLabel = document.createElement('p');
        formatLabel.className = 'canva-text variant-static text-sm opacity-85';
        formatLabel.textContent = availableOptions[0].label;
        content.append(formatLabel);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'canva-button mt-2 w-full py-2 rounded-full font-medium transition hover:opacity-90';
      button.textContent = 'Add to cart';
      button.addEventListener('click', () => addToCart(selectedProductId));

      content.prepend(name);
      content.append(price, button);
      card.append(image, content);
      grid.append(card);
    });

    if (!grid.children.length) {
      const emptyState = document.createElement('p');
      emptyState.className = 'shop-category-note';
      emptyState.textContent = 'No downloadable pieces listed yet. New releases will appear here.';
      section.append(heading, note, emptyState);
      catalogContainer.append(section);
      return;
    }

    section.append(heading, note, grid);
    catalogContainer.append(section);
  });
}

function addToCart(id) {
  const product = productIndex.get(id);

  if (!product) {
    return;
  }

  const existing = cart.find((item) => item.id === id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, quantity: 1 });
  }

  persistCart();
  updateCartUI();
}

function removeFromCart(index) {
  const lineItem = cart[index];

  if (!lineItem) {
    return;
  }

  if (lineItem.quantity > 1) {
    lineItem.quantity -= 1;
  } else {
    cart.splice(index, 1);
  }

  persistCart();
  updateCartUI();
}

function updateCartUI() {
  const badge = document.getElementById('cart-badge');
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const footerEl = document.getElementById('cart-footer');
  const totalEl = document.getElementById('cart-total');
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (badge) {
    badge.textContent = String(itemCount);
    badge.classList.toggle('hidden', itemCount === 0);
  }

  if (!itemsEl || !emptyEl || !footerEl || !totalEl) {
    return;
  }

  if (itemCount === 0) {
    itemsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    footerEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  footerEl.classList.remove('hidden');

  let total = 0;
  itemsEl.innerHTML = '';

  cart.forEach((item, i) => {
    const product = productIndex.get(item.id);

    if (!product) {
      return;
    }

    const lineTotal = product.price * item.quantity;
    total += lineTotal;

    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';

    const info = document.createElement('div');
    info.className = 'flex flex-col gap-1';

    const name = document.createElement('span');
    name.className = 'cart-item-name text-sm';
    name.textContent = product.name;

    const price = document.createElement('span');
    price.className = 'cart-item-price text-sm';
    price.textContent = `${formatCurrency(lineTotal)} (${item.quantity})`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'cart-remove-btn';
    removeButton.setAttribute('aria-label', 'Remove item');
    removeButton.textContent = 'x';
    removeButton.addEventListener('click', () => removeFromCart(i));

    info.append(name, price);
    cartItem.append(info, removeButton);
    itemsEl.append(cartItem);
  });

  totalEl.textContent = formatCurrency(total);
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

function persistCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('cart-updated'));
}

function formatCurrency(amountInCents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format((amountInCents || 0) / 100);
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
