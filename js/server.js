const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3010', 'http://localhost:3030'];
const CHECKOUT_RATE_WINDOW_MS = 60 * 1000;
const CHECKOUT_RATE_MAX = 20;
const RATE_LIMIT_MAX_KEYS = 5000;
const BLOG_AUTH_WINDOW_MS = 60 * 1000;
const BLOG_AUTH_MAX = 20;
const BLOG_INTERACTION_MAX = 50;
const BLOG_COMMENT_MAX = 15;
const BLOG_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BLOG_MAX_COMMENT_LENGTH = 500;
const BLOG_MAX_COMMENTS_PER_POST = 200;
const BLOG_USERNAME_MIN_LENGTH = 3;
const BLOG_USERNAME_MAX_LENGTH = 24;
const BLOG_PASSWORD_MIN_LENGTH = 8;
const BLOG_STORE_FILE = process.env.BLOG_STORE_FILE
  ? path.resolve(process.env.BLOG_STORE_FILE)
  : path.join(__dirname, '..', 'data', 'blog-store.json');
const BLOG_OUTBOX_FILE = process.env.BLOG_OUTBOX_FILE
  ? path.resolve(process.env.BLOG_OUTBOX_FILE)
  : path.join(__dirname, '..', 'data', 'blog-email-outbox.json');
const BLOG_NEWSLETTER_FILE = process.env.BLOG_NEWSLETTER_FILE
  ? path.resolve(process.env.BLOG_NEWSLETTER_FILE)
  : path.join(__dirname, '..', 'data', 'blog-newsletter.json');
const BLOG_VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const BLOG_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const BLOG_MAX_UPLOAD_DATA_URL_LENGTH = 8_000_000;
const BLOG_ADMIN_USERNAMES = String(process.env.BLOG_ADMIN_USERNAMES || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const BLOG_ADMIN_EMAILS = String(process.env.BLOG_ADMIN_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_BLOG_AUTH_SECRET = 'replace-this-secret-in-production';
const BLOG_AUTH_SECRET = process.env.BLOG_AUTH_SECRET || DEFAULT_BLOG_AUTH_SECRET;

const BLOG_SECTIONS = ['videos', 'articles', 'recipes', 'random', 'photo dump'];

const BLOG_POSTS = [];

const LEGACY_PLACEHOLDER_POST_IDS = new Set([
  'blog-video-midnight-sketchbook',
  'blog-video-weekly-reset',
  'blog-article-burnout',
  'blog-article-tools',
  'blog-recipe-matcha',
  'blog-recipe-toast',
  'blog-random-notes',
  'blog-random-audio',
  'blog-photo-golden-hour',
  'blog-photo-city'
]);

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production';
}

function validateProductionSecurityConfig() {
  if (!isProductionEnvironment()) {
    return;
  }

  if (!process.env.BLOG_AUTH_SECRET) {
    throw new Error('Missing BLOG_AUTH_SECRET in production.');
  }

  if (process.env.BLOG_AUTH_SECRET === DEFAULT_BLOG_AUTH_SECRET) {
    throw new Error('BLOG_AUTH_SECRET must not use the default value in production.');
  }

  if (String(process.env.BLOG_AUTH_SECRET).length < 32) {
    throw new Error('BLOG_AUTH_SECRET must be at least 32 characters in production.');
  }
}

function createInitialBlogStore() {
  return {
    users: [],
    posts: BLOG_POSTS.map((post) => ({
      ...post,
      likedByUserIds: [],
      comments: []
    }))
  };
}

function loadBlogStore() {
  fs.mkdirSync(path.dirname(BLOG_STORE_FILE), { recursive: true });

  if (!fs.existsSync(BLOG_STORE_FILE)) {
    const initial = createInitialBlogStore();
    fs.writeFileSync(BLOG_STORE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(BLOG_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    const users = (Array.isArray(parsed?.users) ? parsed.users : [])
      .map((user) => ({
        ...user,
        email: normalizeEmail(user.email || `${user.username || createRandomId()}@example.local`),
        emailVerified: Boolean(user.emailVerified),
        isAdmin: Boolean(user.isAdmin),
        emailVerificationTokenHash: String(user.emailVerificationTokenHash || ''),
        emailVerificationExpiresAt: String(user.emailVerificationExpiresAt || ''),
        passwordResetTokenHash: String(user.passwordResetTokenHash || ''),
        passwordResetExpiresAt: String(user.passwordResetExpiresAt || '')
      }));

    if (users.length > 0 && !users.some((user) => user.isAdmin)) {
      users[0].isAdmin = true;
    }
    const existingPosts = (Array.isArray(parsed?.posts) ? parsed.posts : [])
      .filter((post) => !LEGACY_PLACEHOLDER_POST_IDS.has(post?.id));
    const existingById = new Map(existingPosts.map((post) => [post.id, post]));

    const seededPosts = BLOG_POSTS.map((seed) => {
      const stored = existingById.get(seed.id);

      if (!stored) {
        return {
          ...seed,
          likedByUserIds: [],
          comments: []
        };
      }

      return {
        ...seed,
        likedByUserIds: Array.isArray(stored.likedByUserIds) ? stored.likedByUserIds : [],
        comments: Array.isArray(stored.comments) ? stored.comments : []
      };
    });

    const customPosts = existingPosts
      .filter((post) => !BLOG_POSTS.some((seed) => seed.id === post.id))
      .map((post) => ({
        ...post,
        likedByUserIds: Array.isArray(post.likedByUserIds) ? post.likedByUserIds : [],
        comments: Array.isArray(post.comments) ? post.comments : []
      }));

    const posts = [...seededPosts, ...customPosts];

    const hydrated = { users, posts };
    fs.writeFileSync(BLOG_STORE_FILE, JSON.stringify(hydrated, null, 2));
    return hydrated;
  } catch {
    const fallback = createInitialBlogStore();
    fs.writeFileSync(BLOG_STORE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function saveBlogStore() {
  fs.writeFileSync(BLOG_STORE_FILE, JSON.stringify(BLOG_STORE, null, 2));
}

function appendEmailOutboxEntry(entry) {
  fs.mkdirSync(path.dirname(BLOG_OUTBOX_FILE), { recursive: true });

  let items = [];
  if (fs.existsSync(BLOG_OUTBOX_FILE)) {
    try {
      items = JSON.parse(fs.readFileSync(BLOG_OUTBOX_FILE, 'utf8'));
      if (!Array.isArray(items)) {
        items = [];
      }
    } catch {
      items = [];
    }
  }

  items.push(entry);
  if (items.length > 500) {
    items.splice(0, items.length - 500);
  }

  fs.writeFileSync(BLOG_OUTBOX_FILE, JSON.stringify(items, null, 2));
}

function loadNewsletterStore() {
  fs.mkdirSync(path.dirname(BLOG_NEWSLETTER_FILE), { recursive: true });

  if (!fs.existsSync(BLOG_NEWSLETTER_FILE)) {
    const initial = { subscribers: [] };
    fs.writeFileSync(BLOG_NEWSLETTER_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BLOG_NEWSLETTER_FILE, 'utf8'));
    const subscribers = Array.isArray(parsed?.subscribers)
      ? parsed.subscribers
        .map((entry) => ({
          email: normalizeEmail(entry?.email),
          subscribedAt: String(entry?.subscribedAt || '')
        }))
        .filter((entry) => isValidEmail(entry.email))
      : [];

    const hydrated = { subscribers };
    fs.writeFileSync(BLOG_NEWSLETTER_FILE, JSON.stringify(hydrated, null, 2));
    return hydrated;
  } catch {
    const fallback = { subscribers: [] };
    fs.writeFileSync(BLOG_NEWSLETTER_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function saveNewsletterStore() {
  fs.writeFileSync(BLOG_NEWSLETTER_FILE, JSON.stringify(BLOG_NEWSLETTER_STORE, null, 2));
}

const BLOG_STORE = loadBlogStore();
const BLOG_NEWSLETTER_STORE = loadNewsletterStore();

function toIsoDate(input) {
  try {
    return new Date(input).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function createRandomId() {
  return crypto.randomBytes(16).toString('hex');
}

function createOpaqueToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function shouldBeAdmin(username, email, userCount) {
  if (BLOG_ADMIN_USERNAMES.includes(username) || BLOG_ADMIN_EMAILS.includes(email)) {
    return true;
  }

  return userCount === 0;
}

function isAdminUser(user) {
  return Boolean(user?.isAdmin);
}

function getBaseOrigin(req) {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host');

  if (!host) {
    return 'http://localhost:3030';
  }

  return `${protocol}://${host}`;
}

function issueEmailVerification(user, req) {
  const token = createOpaqueToken();
  user.emailVerificationTokenHash = hashOpaqueToken(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + BLOG_VERIFY_TOKEN_TTL_MS).toISOString();
  saveBlogStore();

  const link = `${getBaseOrigin(req)}/html/blog.html?verifyToken=${encodeURIComponent(token)}`;

  appendEmailOutboxEntry({
    type: 'verify-email',
    to: user.email,
    username: user.username,
    sentAt: new Date().toISOString(),
    link
  });

  return link;
}

function issuePasswordReset(user, req) {
  const token = createOpaqueToken();
  user.passwordResetTokenHash = hashOpaqueToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + BLOG_RESET_TOKEN_TTL_MS).toISOString();
  saveBlogStore();

  const link = `${getBaseOrigin(req)}/html/blog.html?resetToken=${encodeURIComponent(token)}`;

  appendEmailOutboxEntry({
    type: 'password-reset',
    to: user.email,
    username: user.username,
    sentAt: new Date().toISOString(),
    link
  });

  return link;
}

function findUserByEmail(email) {
  return BLOG_STORE.users.find((user) => user.email === email) || null;
}

function getSafePreviewLink(link) {
  return process.env.NODE_ENV === 'production' ? undefined : link;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function isSafeMediaUrl(value, dataUrlPrefix) {
  if (!value) return true;
  return value.startsWith('https://') || value.startsWith(dataUrlPrefix);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeInputText(value, maxLength) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const truncated = normalized.slice(0, maxLength);
  return escapeHtml(truncated);
}

function getBlogPostResponse(post) {
  const userMap = new Map(BLOG_STORE.users.map((user) => [user.id, user]));

  return {
    id: post.id,
    title: post.title,
    category: post.category,
    type: post.type,
    summary: post.summary,
    body: post.body,
    videoUrl: post.videoUrl || '',
    imageUrl: post.imageUrl || '',
    publishedAt: toIsoDate(post.publishedAt),
    allowInteractions: Boolean(post.allowInteractions),
    allowComments: Boolean(post.allowComments),
    likes: Array.isArray(post.likedByUserIds) ? post.likedByUserIds.length : 0,
    comments: post.comments.map((comment) => ({
      id: comment.id,
      author: userMap.get(comment.userId)?.username || comment.author || 'Deleted User',
      message: comment.message,
      createdAt: comment.createdAt
    }))
  };
}

function getBlogPostsResponse(currentUserId = '') {
  const posts = BLOG_STORE.posts
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map((post) => ({
      ...getBlogPostResponse(post),
      likedByCurrentUser: Boolean(currentUserId) && Array.isArray(post.likedByUserIds)
        ? post.likedByUserIds.includes(currentUserId)
        : false
    }));

  return {
    sections: BLOG_SECTIONS,
    posts
  };
}

function getPostById(postId) {
  return BLOG_STORE.posts.find((post) => post.id === postId) || null;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]+$/.test(username)
    && username.length >= BLOG_USERNAME_MIN_LENGTH
    && username.length <= BLOG_USERNAME_MAX_LENGTH;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function passwordsMatch(password, storedSalt, storedHash) {
  const computed = crypto.scryptSync(password, storedSalt, 64);
  const known = Buffer.from(storedHash, 'hex');

  if (computed.length !== known.length) {
    return false;
  }

  return crypto.timingSafeEqual(computed, known);
}

function signTokenPayload(payloadBase64) {
  return crypto.createHmac('sha256', BLOG_AUTH_SECRET)
    .update(payloadBase64)
    .digest('base64url');
}

function issueBlogAuthToken(userId) {
  const payload = {
    uid: userId,
    exp: Date.now() + BLOG_TOKEN_TTL_MS
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signTokenPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

function verifyBlogAuthToken(token) {
  const parts = String(token || '').split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;
  const expected = signTokenPayload(payloadBase64);

  const signatureBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(String(expected));

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

    if (!payload?.uid || !payload?.exp || Date.now() > Number(payload.exp)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getAuthTokenFromRequest(req) {
  const authHeader = req.get('authorization') || '';

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const alt = req.get('x-auth-token');
  return alt ? String(alt).trim() : '';
}

function getAuthenticatedUser(req) {
  const token = getAuthTokenFromRequest(req);

  if (!token) {
    return null;
  }

  const payload = verifyBlogAuthToken(token);

  if (!payload) {
    return null;
  }

  return BLOG_STORE.users.find((user) => user.id === payload.uid) || null;
}

function sanitizeAuthPassword(value) {
  return String(value || '');
}

function getSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

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

  sequence = appendListings(
    products,
    STICKER_PACK_LISTINGS,
    'Sticker Packs',
    sequence
  );

  sequence = appendPieceVariants(
    products,
    DIGITAL_ART_PIECES,
    DIGITAL_ART_OPTIONS,
    'Digital Art',
    sequence
  );

  sequence = appendListings(
    products,
    ONE_OF_ONE_LISTINGS,
    '1/1 Art',
    sequence
  );

  appendPieceVariants(
    products,
    PATTERN_PIECES,
    PATTERN_OPTIONS,
    'Patterns',
    sequence
  );

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

const SHIPPING_RATES = {
  standard: 12,
  express: 24
};

function getProductCatalog() {
  return PRODUCT_CATALOG.map((product) => ({ ...product }));
}

function createCheckoutOrder(orderInput) {
  const items = Array.isArray(orderInput?.items) ? orderInput.items : [];

  const normalizedItems = items.map((item) => {
    const product = PRODUCT_CATALOG.find((entry) => entry.id === item.id);

    if (!product) {
      throw new Error(`Unknown product: ${item.id}`);
    }

    const quantity = Number(item.quantity) || 0;

    if (quantity < 1) {
      throw new Error(`Invalid quantity for product: ${item.id}`);
    }

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      quantity,
      lineTotal: product.price * quantity
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingMethod = orderInput?.shippingMethod || 'standard';
  const shipping = SHIPPING_RATES[shippingMethod] ?? SHIPPING_RATES.standard;

  return {
    status: 'confirmed',
    customerName: orderInput?.customerName || '',
    email: orderInput?.email || '',
    shippingAddress: orderInput?.shippingAddress || {},
    shippingMethod,
    items: normalizedItems,
    subtotal,
    shipping,
    total: subtotal + shipping
  };
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.stripeAPI;

  if (!secretKey) {
    throw new Error('Missing Stripe secret key. Set STRIPE_SECRET_KEY or stripeAPI.');
  }

  return new Stripe(secretKey);
}

function getPublishableKey() {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.stripePublishableKey;

  if (!publishableKey) {
    throw new Error('Missing Stripe publishable key. Set STRIPE_PUBLISHABLE_KEY or stripePublishableKey.');
  }

  return publishableKey;
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.ALLOWED_ORIGINS;

  if (!configuredOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const normalized = configuredOrigins
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : DEFAULT_ALLOWED_ORIGINS;
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin, allowedOrigins) {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return false;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

function getRequestOrigin(req, allowedOrigins) {
  const originHeader = req.get('origin');

  if (originHeader && isAllowedOrigin(originHeader, allowedOrigins)) {
    return normalizeOrigin(originHeader);
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;

  if (host) {
    const computedOrigin = normalizeOrigin(`${protocol}://${host}`);

    if (computedOrigin && isAllowedOrigin(computedOrigin, allowedOrigins)) {
      return computedOrigin;
    }
  }

  return allowedOrigins[0] || 'http://localhost:3000';
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  let requestCounter = 0;

  function pruneExpired(now) {
    hits.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        hits.delete(key);
      }
    });
  }

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';

    requestCounter += 1;
    if (requestCounter % 100 === 0) {
      pruneExpired(now);
    }

    const current = hits.get(key);

    if (!current || current.expiresAt <= now) {
      if (hits.size >= RATE_LIMIT_MAX_KEYS && !current) {
        pruneExpired(now);
      }

      if (hits.size >= RATE_LIMIT_MAX_KEYS && !current) {
        res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        return;
      }

      hits.set(key, {
        count: 1,
        expiresAt: now + windowMs
      });
      next();
      return;
    }

    if (current.count >= max) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }

    current.count += 1;
    hits.set(key, current);
    next();
  };
}

function applySecurityHeaders(req, res) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://api.stripe.com https://*.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
    "form-action 'self' https://checkout.stripe.com https://*.stripe.com"
  ].join('; ');

  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Origin-Agent-Cluster', '?1');
}

function getTrustProxySetting() {
  const configured = process.env.TRUST_PROXY;

  if (!configured) {
    return false;
  }

  if (configured === 'true' || configured === '1') {
    return true;
  }

  if (configured === 'false' || configured === '0') {
    return false;
  }

  const numericValue = Number(configured);

  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return configured;
}

function normalizeLineItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 25) {
    throw new Error('Invalid cart items payload.');
  }

  return items.map((item) => {
    if (!item || typeof item.id !== 'string') {
      throw new Error('Invalid cart item payload.');
    }

    const product = PRODUCT_CATALOG.find((entry) => entry.id === item.id);

    if (!product) {
      throw new Error('Unknown product in cart.');
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Invalid item quantity.');
    }

    return {
      price_data: {
        currency: product.currency,
        product_data: {
          name: product.name
        },
        unit_amount: product.price
      },
      quantity
    };
  });
}

function createApp() {
  const app = express();
  const projectRoot = path.join(__dirname, '..');
  const allowedOrigins = getAllowedOrigins();
  const checkoutRateLimiter = createRateLimiter({
    windowMs: CHECKOUT_RATE_WINDOW_MS,
    max: CHECKOUT_RATE_MAX
  });
  const blogAuthRateLimiter = createRateLimiter({
    windowMs: BLOG_AUTH_WINDOW_MS,
    max: BLOG_AUTH_MAX
  });
  const blogInteractionRateLimiter = createRateLimiter({
    windowMs: BLOG_AUTH_WINDOW_MS,
    max: BLOG_INTERACTION_MAX
  });
  const blogCommentRateLimiter = createRateLimiter({
    windowMs: BLOG_AUTH_WINDOW_MS,
    max: BLOG_COMMENT_MAX
  });

  app.disable('x-powered-by');
  app.set('trust proxy', getTrustProxySetting());

  app.use(cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token']
  }));
  const defaultJsonParser = express.json({ limit: '20kb' });
  const blogAdminPostJsonParser = express.json({ limit: '18mb' });
  const blogAdminPostRoutePattern = /^\/api\/blog\/admin\/posts(\/[^/]+)?$/;

  app.use((req, res, next) => {
    if (req.method !== 'GET' && blogAdminPostRoutePattern.test(req.path)) {
      return blogAdminPostJsonParser(req, res, next);
    }
    return defaultJsonParser(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.method === 'TRACE' || req.method === 'TRACK') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    applySecurityHeaders(req, res);

    if (req.path === '/api/checkout-config' || req.path === '/create-checkout-session' || req.path.startsWith('/api/blog')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    next();
  });

  // Only expose client assets, not server/test/config source files.
  app.use('/html', express.static(path.join(projectRoot, 'html'), {
    dotfiles: 'deny'
  }));

  app.use('/css', express.static(path.join(projectRoot, 'css'), {
    dotfiles: 'deny'
  }));

  app.use('/js', (req, res, next) => {
    if (req.path === '/server.js' || req.path.endsWith('.test.js')) {
      return res.status(404).json({ error: 'Not found.' });
    }

    return next();
  }, express.static(path.join(projectRoot, 'js'), {
    dotfiles: 'deny'
  }));

  app.use('/images', express.static(path.join(projectRoot, 'images'), {
    dotfiles: 'deny'
  }));

  app.get('/', (req, res) => {
    return res.redirect('/html/index.html');
  });

  app.get('/api/checkout-config', (req, res) => {
    try {
      const publishableKey = getPublishableKey();

      return res.json({ publishableKey });
    } catch (error) {
      console.error('Checkout config error:', error.message);
      return res.status(500).json({
        error: 'Checkout configuration is unavailable.'
      });
    }
  });

  app.get('/api/products', (req, res) => {
    return res.json({ products: getProductCatalog() });
  });

  app.get('/api/blog/posts', (req, res) => {
    const user = getAuthenticatedUser(req);
    return res.json(getBlogPostsResponse(user?.id || ''));
  });

  app.post('/api/blog/auth/register', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const username = normalizeUsername(req.body?.username);
    const email = normalizeEmail(req.body?.email);
    const password = sanitizeAuthPassword(req.body?.password);

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: `Username must be ${BLOG_USERNAME_MIN_LENGTH}-${BLOG_USERNAME_MAX_LENGTH} chars using a-z, 0-9, or _.`
      });
    }

    if (password.length < BLOG_PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${BLOG_PASSWORD_MIN_LENGTH} characters.` });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const existing = BLOG_STORE.users.find((user) => user.username === username);

    if (existing) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    if (findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      id: createRandomId(),
      username,
      email,
      emailVerified: false,
      isAdmin: shouldBeAdmin(username, email, BLOG_STORE.users.length),
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };

    BLOG_STORE.users.push(user);
    saveBlogStore();

    const verificationLink = issueEmailVerification(user, req);

    return res.status(201).json({
      token: issueBlogAuthToken(user.id),
      user: getSafeUser(user),
      verificationRequired: true,
      verificationPreviewLink: getSafePreviewLink(verificationLink)
    });
  });

  app.post('/api/blog/auth/login', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const username = normalizeUsername(req.body?.username);
    const password = sanitizeAuthPassword(req.body?.password);
    const user = BLOG_STORE.users.find((entry) => entry.username === username);

    if (!user || !passwordsMatch(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    return res.json({
      token: issueBlogAuthToken(user.id),
      user: getSafeUser(user)
    });
  });

  app.post('/api/blog/auth/verify-email/request', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const user = findUserByEmail(email);

    if (!user) {
      return res.json({ message: 'If this email exists, a verification link has been sent.' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email is already verified.' });
    }

    const verificationLink = issueEmailVerification(user, req);
    return res.json({
      message: 'Verification link sent.',
      verificationPreviewLink: getSafePreviewLink(verificationLink)
    });
  });

  app.get('/api/blog/auth/verify-email', (req, res) => {
    const token = String(req.query?.token || '').trim();

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const tokenHash = hashOpaqueToken(token);
    const user = BLOG_STORE.users.find((entry) => entry.emailVerificationTokenHash === tokenHash);

    if (!user) {
      return res.status(400).json({ error: 'Verification token is invalid.' });
    }

    const expiresAtMs = Date.parse(user.emailVerificationExpiresAt || '');
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
      return res.status(400).json({ error: 'Verification token has expired.' });
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = '';
    user.emailVerificationExpiresAt = '';
    saveBlogStore();

    return res.json({ message: 'Email verified successfully.' });
  });

  app.post('/api/blog/auth/password-reset/request', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const user = findUserByEmail(email);

    if (!user) {
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const resetLink = issuePasswordReset(user, req);
    return res.json({
      message: 'Password reset link sent.',
      resetPreviewLink: getSafePreviewLink(resetLink)
    });
  });

  app.post('/api/blog/auth/password-reset/confirm', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const token = String(req.body?.token || '').trim();
    const newPassword = sanitizeAuthPassword(req.body?.newPassword);

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }

    if (newPassword.length < BLOG_PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${BLOG_PASSWORD_MIN_LENGTH} characters.` });
    }

    const tokenHash = hashOpaqueToken(token);
    const user = BLOG_STORE.users.find((entry) => entry.passwordResetTokenHash === tokenHash);

    if (!user) {
      return res.status(400).json({ error: 'Reset token is invalid.' });
    }

    const expiresAtMs = Date.parse(user.passwordResetExpiresAt || '');
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
      return res.status(400).json({ error: 'Reset token has expired.' });
    }

    const { salt, hash } = hashPassword(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = '';
    saveBlogStore();

    return res.json({ message: 'Password has been reset successfully.' });
  });

  app.post('/api/blog/newsletter/subscribe', blogAuthRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const alreadySubscribed = BLOG_NEWSLETTER_STORE.subscribers.some((entry) => entry.email === email);

    if (alreadySubscribed) {
      return res.json({ message: 'You are already subscribed.' });
    }

    BLOG_NEWSLETTER_STORE.subscribers.push({
      email,
      subscribedAt: new Date().toISOString()
    });
    saveNewsletterStore();

    return res.status(201).json({ message: 'Newsletter signup confirmed.' });
  });

  app.get('/api/blog/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    return res.json({ user: getSafeUser(user) });
  });

  app.post('/api/blog/posts/:postId/like', blogInteractionRateLimiter, (req, res) => {
    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Login required for likes.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Verify your email to interact with posts.' });
    }

    const post = getPostById(req.params.postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    if (!post.allowInteractions) {
      return res.status(403).json({ error: 'Interactions are disabled for this post.' });
    }

    if (!Array.isArray(post.likedByUserIds)) {
      post.likedByUserIds = [];
    }

    const alreadyLiked = post.likedByUserIds.includes(user.id);

    if (alreadyLiked) {
      post.likedByUserIds = post.likedByUserIds.filter((id) => id !== user.id);
    } else {
      post.likedByUserIds.push(user.id);
    }

    saveBlogStore();

    return res.json({
      likes: post.likedByUserIds.length,
      liked: !alreadyLiked
    });
  });

  app.post('/api/blog/posts/:postId/comments', blogCommentRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Login required for comments.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Verify your email to interact with posts.' });
    }

    const post = getPostById(req.params.postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    if (!post.allowComments) {
      return res.status(403).json({ error: 'Comments are disabled for this post.' });
    }

    const message = sanitizeInputText(req.body?.message, BLOG_MAX_COMMENT_LENGTH);

    if (!message || message.length < 2) {
      return res.status(400).json({ error: 'Comment must be at least 2 characters.' });
    }

    const comment = {
      id: createRandomId(),
      userId: user.id,
      message,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(post.comments)) {
      post.comments = [];
    }

    post.comments.push(comment);

    if (post.comments.length > BLOG_MAX_COMMENTS_PER_POST) {
      post.comments.splice(0, post.comments.length - BLOG_MAX_COMMENTS_PER_POST);
    }

    saveBlogStore();

    return res.status(201).json({
      comment: {
        id: comment.id,
        author: user.username,
        message: comment.message,
        createdAt: comment.createdAt
      },
      commentCount: post.comments.length
    });
  });

  app.get('/api/blog/admin/posts', (req, res) => {
    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!isAdminUser(user)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const posts = BLOG_STORE.posts
      .map((post) => getBlogPostResponse(post))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return res.json({ sections: BLOG_SECTIONS, posts });
  });

  app.post('/api/blog/admin/posts', blogInteractionRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!isAdminUser(user)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const title = sanitizeInputText(req.body?.title, 120);
    const category = sanitizeInputText(req.body?.category, 40).toLowerCase();
    const type = sanitizeInputText(req.body?.type, 20).toLowerCase();
    const summary = sanitizeInputText(req.body?.summary, 240);
    const body = sanitizeInputText(req.body?.body, 5000);
    const videoUrl = String(req.body?.videoUrl || '').trim();
    const imageUrl = String(req.body?.imageUrl || '').trim();
    const allowInteractions = Boolean(req.body?.allowInteractions);
    const allowComments = Boolean(req.body?.allowComments);

    if (!title || !summary || !body) {
      return res.status(400).json({ error: 'Title, summary, and body are required.' });
    }

    if (!BLOG_SECTIONS.includes(category)) {
      return res.status(400).json({ error: 'Category must be one of the supported blog sections.' });
    }

    if (type !== 'written' && type !== 'vlog') {
      return res.status(400).json({ error: 'Type must be either "written" or "vlog".' });
    }

    if (videoUrl && type !== 'vlog') {
      return res.status(400).json({ error: 'Video URL can only be set for vlog posts.' });
    }

    if (videoUrl.length > BLOG_MAX_UPLOAD_DATA_URL_LENGTH) {
      return res.status(400).json({ error: 'Uploaded video is too large.' });
    }

    if (imageUrl.length > BLOG_MAX_UPLOAD_DATA_URL_LENGTH) {
      return res.status(400).json({ error: 'Uploaded photo is too large.' });
    }

    if (!isSafeMediaUrl(videoUrl, 'data:video/')) {
      return res.status(400).json({ error: 'Video URL must be an https link or an uploaded video file.' });
    }

    if (!isSafeMediaUrl(imageUrl, 'data:image/')) {
      return res.status(400).json({ error: 'Image URL must be an https link or an uploaded image file.' });
    }

    const slug = slugify(title) || createRandomId().slice(0, 8);
    const postId = `blog-${slug}-${createRandomId().slice(0, 6)}`;

    const post = {
      id: postId,
      title,
      category,
      type,
      summary,
      body,
      videoUrl,
      imageUrl,
      publishedAt: new Date().toISOString(),
      allowInteractions,
      allowComments,
      likedByUserIds: [],
      comments: []
    };

    BLOG_STORE.posts.push(post);
    saveBlogStore();

    return res.status(201).json({ post: getBlogPostResponse(post) });
  });

  app.put('/api/blog/admin/posts/:postId', blogInteractionRateLimiter, (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!isAdminUser(user)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const post = getPostById(req.params.postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    const title = sanitizeInputText(req.body?.title ?? post.title, 120);
    const category = sanitizeInputText(req.body?.category ?? post.category, 40).toLowerCase();
    const type = sanitizeInputText(req.body?.type ?? post.type, 20).toLowerCase();
    const summary = sanitizeInputText(req.body?.summary ?? post.summary, 240);
    const body = sanitizeInputText(req.body?.body ?? post.body, 5000);
    const videoUrl = String(req.body?.videoUrl ?? post.videoUrl ?? '').trim();
    const imageUrl = String(req.body?.imageUrl ?? post.imageUrl ?? '').trim();
    const allowInteractions = typeof req.body?.allowInteractions === 'boolean'
      ? req.body.allowInteractions
      : post.allowInteractions;
    const allowComments = typeof req.body?.allowComments === 'boolean'
      ? req.body.allowComments
      : post.allowComments;

    if (!BLOG_SECTIONS.includes(category)) {
      return res.status(400).json({ error: 'Category must be one of the supported blog sections.' });
    }

    if (type !== 'written' && type !== 'vlog') {
      return res.status(400).json({ error: 'Type must be either "written" or "vlog".' });
    }

    if (videoUrl && type !== 'vlog') {
      return res.status(400).json({ error: 'Video URL can only be set for vlog posts.' });
    }

    if (videoUrl.length > BLOG_MAX_UPLOAD_DATA_URL_LENGTH) {
      return res.status(400).json({ error: 'Uploaded video is too large.' });
    }

    if (imageUrl.length > BLOG_MAX_UPLOAD_DATA_URL_LENGTH) {
      return res.status(400).json({ error: 'Uploaded photo is too large.' });
    }

    if (!isSafeMediaUrl(videoUrl, 'data:video/')) {
      return res.status(400).json({ error: 'Video URL must be an https link or an uploaded video file.' });
    }

    if (!isSafeMediaUrl(imageUrl, 'data:image/')) {
      return res.status(400).json({ error: 'Image URL must be an https link or an uploaded image file.' });
    }

    post.title = title;
    post.category = category;
    post.type = type;
    post.summary = summary;
    post.body = body;
    post.videoUrl = videoUrl;
    post.imageUrl = imageUrl;
    post.allowInteractions = Boolean(allowInteractions);
    post.allowComments = Boolean(allowComments);

    saveBlogStore();

    return res.json({ post: getBlogPostResponse(post) });
  });

  app.post('/create-checkout-session', checkoutRateLimiter, async (req, res) => {
    try {
      if (!req.is('application/json')) {
        return res.status(415).json({ error: 'Content-Type must be application/json.' });
      }

      const stripe = getStripeClient();
      const origin = getRequestOrigin(req, allowedOrigins);
      const lineItems = normalizeLineItems(req.body?.items);

      const session = await stripe.checkout.sessions.create({
        ui_mode: 'custom',
        mode: 'payment',
        line_items: lineItems,
        return_url: `${origin}/html/checkout.html?session_id={CHECKOUT_SESSION_ID}`
      });

      return res.json({ client_secret: session.client_secret });
    } catch (error) {
      const isValidationError = error.message === 'Invalid cart items payload.'
        || error.message === 'Invalid cart item payload.'
        || error.message === 'Unknown product in cart.'
        || error.message === 'Invalid item quantity.';

      if (isValidationError) {
        return res.status(400).json({ error: error.message });
      }

      console.error('Checkout session creation failed:', error.message);

      return res.status(500).json({
        error: 'Unable to create checkout session.'
      });
    }
  });

  app.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload is too large.' });
    }

    if (error?.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'Origin not allowed.' });
    }

    return res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}

validateProductionSecurityConfig();

const app = createApp();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

module.exports = {
  app,
  getProductCatalog,
  createCheckoutOrder
};