import { getRequestOrigin } from './common.js';

const STICKER_PACK_LISTINGS = [
  { pieceName: 'Studio Sticker Pack Vol. 1', label: '5-Piece High-Quality Vinyl Pack', price: 500 },
  { pieceName: 'Studio Sticker Pack Vol. 2', label: '8-Piece Collector Vinyl Pack', price: 1200 }
];

const DIGITAL_ART_PIECES = [
  'The Chair',
  'Summers End',
  'The Bookshelf',
  'Sunrise',
  'Dreams of Dreaming'
];

const ONE_OF_ONE_LISTINGS = [
  {
    pieceName: 'The Window',
    label: 'Exclusive 1/1 Digital Artwork (Single Edition Download)',
    price: 35000
  },
  {
    pieceName: 'Heart of the 80s',
    label: 'Original Physical Artwork - Acrylic on Archival Paper (5\'9")',
    price: 180000
  },
  {
    pieceName: 'Floral Fall',
    label: 'Original Physical Artwork (Small 9x12 to 11x14)',
    price: 55000
  },
  {
    pieceName: 'Floral Fall',
    label: 'Original Physical Artwork (Medium 16x20 to 18x24)',
    price: 95000
  },
  {
    pieceName: 'Floral Fall',
    label: 'Original Physical Artwork (Large 24x36+)',
    price: 150000
  },
  {
    pieceName: 'Into the Void',
    label: 'Exclusive 1/1 Digital Artwork (Single Edition Download)',
    price: 45000
  }
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

function appendPieceVariants(products, pieces, options, category, sequence) {
  let nextSequence = sequence;

  pieces.forEach((piece) => {
    options.forEach((option) => {
      products.push({
        id: `product-${nextSequence}`,
        name: `${piece} - ${option.label}`,
        price: option.price,
        currency: 'usd',
        category
      });
      nextSequence += 1;
    });
  });

  return nextSequence;
}

function appendListings(products, listings, category, sequence) {
  let nextSequence = sequence;

  listings.forEach((listing) => {
    products.push({
      id: `product-${nextSequence}`,
      name: `${listing.pieceName} - ${listing.label}`,
      price: listing.price,
      currency: 'usd',
      category
    });
    nextSequence += 1;
  });

  return nextSequence;
}

function buildShopProducts() {
  const products = [];
  let sequence = 1;

  sequence = appendListings(products, STICKER_PACK_LISTINGS, 'Sticker Packs', sequence);
  sequence = appendPieceVariants(products, DIGITAL_ART_PIECES, DIGITAL_ART_OPTIONS, 'Digital Art', sequence);
  sequence = appendListings(products, ONE_OF_ONE_LISTINGS, '1/1 Art', sequence);
  appendPieceVariants(products, PATTERN_PIECES, PATTERN_OPTIONS, 'Patterns', sequence);

  return products;
}

const PRODUCT_CATALOG = [
  ...buildShopProducts(),
  {
    id: 'service-1',
    name: 'Fullstack Website Build',
    price: 350000,
    currency: 'usd'
  },
  {
    id: 'service-2',
    name: 'WordPress Website Build',
    price: 180000,
    currency: 'usd'
  },
  {
    id: 'service-3',
    name: 'Custom Website Package',
    price: 220000,
    currency: 'usd'
  },
  {
    id: 'service-4',
    name: 'Custom dApp Build',
    price: 450000,
    currency: 'usd'
  },
  {
    id: 'commission-1',
    name: 'Personal Use Commission',
    price: 35000,
    currency: 'usd'
  },
  {
    id: 'commission-2',
    name: 'Commercial Vector Commission',
    price: 70000,
    currency: 'usd'
  },
  {
    id: 'commission-3',
    name: 'NFT Custom Mint Add-On',
    price: 15000,
    currency: 'usd'
  },
  {
    id: 'commission-4',
    name: 'CMS Foundations Build',
    price: 120000,
    currency: 'usd'
  },
  {
    id: 'commission-5',
    name: 'Interactive Front-End Build',
    price: 350000,
    currency: 'usd'
  },
  {
    id: 'commission-6',
    name: 'Full-Stack Architecture (1 hour)',
    price: 6500,
    currency: 'usd'
  },
  {
    id: 'commission-7',
    name: 'Smart Contract Launch',
    price: 220000,
    currency: 'usd'
  },
  {
    id: 'commission-8',
    name: 'dApp Front-End Experience',
    price: 320000,
    currency: 'usd'
  },
  {
    id: 'commission-9',
    name: 'Full dApp Product Stack',
    price: 550000,
    currency: 'usd'
  }
];

const PRODUCT_INDEX = new Map(PRODUCT_CATALOG.map((item) => [item.id, item]));

function normalizeLineItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 25) {
    throw new Error('Invalid cart items payload.');
  }

  return items.map((item) => {
    if (!item || typeof item.id !== 'string') {
      throw new Error('Invalid cart item payload.');
    }

    const product = PRODUCT_INDEX.get(item.id);

    if (!product) {
      throw new Error('Unknown product in cart.');
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Invalid item quantity.');
    }

    return {
      product,
      quantity
    };
  });
}

async function createStripeCheckoutSession(env, lineItems, returnUrl) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();

  if (!secretKey) {
    throw new Error('Missing Stripe secret key. Set STRIPE_SECRET_KEY.');
  }

  const body = new URLSearchParams();
  body.set('ui_mode', 'custom');
  body.set('mode', 'payment');
  body.set('return_url', returnUrl);

  lineItems.forEach((entry, index) => {
    body.set(`line_items[${index}][price_data][currency]`, entry.product.currency);
    body.set(`line_items[${index}][price_data][product_data][name]`, entry.product.name);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(entry.product.price));
    body.set(`line_items[${index}][quantity]`, String(entry.quantity));
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const stripeMessage = payload?.error?.message || 'Unable to create checkout session.';
    throw new Error(stripeMessage);
  }

  if (!payload?.client_secret) {
    throw new Error('Checkout session did not return a client secret.');
  }

  return payload.client_secret;
}

function getProductCatalog() {
  return PRODUCT_CATALOG.map((item) => ({ ...item }));
}

export async function handleCommerceRequest(request, env, pathname) {
  if (pathname === '/api/products' && request.method === 'GET') {
    return {
      status: 200,
      data: { products: getProductCatalog() }
    };
  }

  if (pathname === '/api/checkout-config' && request.method === 'GET') {
    const publishableKey = String(env.STRIPE_PUBLISHABLE_KEY || '').trim();

    if (!publishableKey) {
      return {
        status: 500,
        data: { error: 'Checkout configuration is unavailable.' }
      };
    }

    return {
      status: 200,
      data: { publishableKey }
    };
  }

  if (pathname === '/create-checkout-session' && request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';

    if (!contentType.includes('application/json')) {
      return {
        status: 415,
        data: { error: 'Content-Type must be application/json.' }
      };
    }

    try {
      const body = await request.json();
      const lineItems = normalizeLineItems(body?.items);
      const origin = getRequestOrigin(request, env);
      const returnUrl = `${origin}/html/checkout.html?session_id={CHECKOUT_SESSION_ID}`;
      const clientSecret = await createStripeCheckoutSession(env, lineItems, returnUrl);

      return {
        status: 200,
        data: { client_secret: clientSecret }
      };
    } catch (error) {
      const knownValidationErrors = new Set([
        'Invalid cart items payload.',
        'Invalid cart item payload.',
        'Unknown product in cart.',
        'Invalid item quantity.'
      ]);

      if (knownValidationErrors.has(error.message)) {
        return {
          status: 400,
          data: { error: error.message }
        };
      }

      if (error.message?.includes('Missing Stripe secret key')) {
        return {
          status: 500,
          data: { error: 'Checkout configuration is unavailable.' }
        };
      }

      return {
        status: 500,
        data: { error: 'Unable to create checkout session.' }
      };
    }
  }

  return null;
}
