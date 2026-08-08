const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jennibwebsite-tests-'));
process.env.BLOG_STORE_FILE = path.join(tempDataDir, 'blog-store.json');
process.env.BLOG_OUTBOX_FILE = path.join(tempDataDir, 'blog-email-outbox.json');
process.env.BLOG_NEWSLETTER_FILE = path.join(tempDataDir, 'blog-newsletter.json');
process.env.BLOG_AUTH_SECRET = 'test-blog-auth-secret';

const { app, getProductCatalog, createCheckoutOrder } = require('../js/server');

async function startTestServer(t) {
  const server = app.listen(0);
  await once(server, 'listening');

  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  }));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Could not resolve test server address.');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const body = await response.json().catch(() => ({}));

  return {
    status: response.status,
    body
  };
}

function getQueryParam(link, key) {
  try {
    return new URL(link).searchParams.get(key) || '';
  } catch {
    return '';
  }
}

test('returns a product catalog with known artwork items', () => {
  const products = getProductCatalog();

  assert.ok(Array.isArray(products));
  assert.ok(products.length >= 3);
  assert.equal(products[0].id, 'product-1');
  assert.ok(products[0].price > 0);
});

test('creates a checkout order with subtotal, shipping, and total', () => {
  const order = createCheckoutOrder({
    customerName: 'Jenni B',
    email: 'hello@example.com',
    shippingAddress: {
      line1: '123 Studio Lane',
      city: 'Austin',
      state: 'TX',
      zip: '78701'
    },
    items: [{ id: 'product-1', quantity: 2 }],
    shippingMethod: 'standard'
  });

  assert.equal(order.status, 'confirmed');
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.subtotal, 1000);
  assert.equal(order.shipping, 12);
  assert.equal(order.total, 1012);
});

test('blog auth lifecycle, newsletter flow, and admin protection all work', async (t) => {
  const baseUrl = await startTestServer(t);
  const unique = Math.random().toString(36).slice(2, 9);
  const username = `t_${unique}`;
  const email = `tester_${unique}@example.com`;
  const password = `StartPass_${unique}!`;
  const resetPassword = `ResetPass_${unique}!`;

  const register = await requestJson(baseUrl, '/api/blog/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  assert.equal(register.status, 201);
  assert.equal(register.body.user.username, username);
  assert.equal(register.body.user.email, email);
  assert.equal(register.body.user.emailVerified, false);
  assert.ok(register.body.token);

  const verifyRequest = await requestJson(baseUrl, '/api/blog/auth/verify-email/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  assert.equal(verifyRequest.status, 200);
  assert.ok(verifyRequest.body.verificationPreviewLink);

  const verifyToken = getQueryParam(verifyRequest.body.verificationPreviewLink, 'verifyToken');
  assert.ok(verifyToken);

  const verify = await requestJson(baseUrl, `/api/blog/auth/verify-email?token=${encodeURIComponent(verifyToken)}`);
  assert.equal(verify.status, 200);

  const login = await requestJson(baseUrl, '/api/blog/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const me = await requestJson(baseUrl, '/api/blog/auth/me', {
    headers: {
      Authorization: `Bearer ${login.body.token}`
    }
  });

  assert.equal(me.status, 200);
  assert.equal(me.body.user.emailVerified, true);

  const resetRequest = await requestJson(baseUrl, '/api/blog/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  assert.equal(resetRequest.status, 200);
  assert.ok(resetRequest.body.resetPreviewLink);

  const resetToken = getQueryParam(resetRequest.body.resetPreviewLink, 'resetToken');
  assert.ok(resetToken);

  const resetConfirm = await requestJson(baseUrl, '/api/blog/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, newPassword: resetPassword })
  });

  assert.equal(resetConfirm.status, 200);

  const oldLogin = await requestJson(baseUrl, '/api/blog/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  assert.equal(oldLogin.status, 401);

  const newLogin = await requestJson(baseUrl, '/api/blog/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: resetPassword })
  });

  assert.equal(newLogin.status, 200);
  assert.ok(newLogin.body.token);

  const newsletterFirst = await requestJson(baseUrl, '/api/blog/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const newsletterSecond = await requestJson(baseUrl, '/api/blog/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  assert.equal(newsletterFirst.status, 201);
  assert.equal(newsletterSecond.status, 200);

  const adminUnauthed = await requestJson(baseUrl, '/api/blog/admin/posts');
  assert.equal(adminUnauthed.status, 401);

  const adminList = await requestJson(baseUrl, '/api/blog/admin/posts', {
    headers: {
      Authorization: `Bearer ${newLogin.body.token}`
    }
  });

  assert.equal(adminList.status, 200);
  assert.ok(Array.isArray(adminList.body.posts));

  const adminCreate = await requestJson(baseUrl, '/api/blog/admin/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${newLogin.body.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Integration Test Post',
      category: 'articles',
      type: 'written',
      summary: 'Summary for integration test post',
      body: 'Body for integration test post',
      allowInteractions: true,
      allowComments: true
    })
  });

  assert.equal(adminCreate.status, 201);
  assert.ok(adminCreate.body.post?.id);

  const postId = adminCreate.body.post.id;

  const adminEdit = await requestJson(baseUrl, `/api/blog/admin/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${newLogin.body.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Integration Test Post Updated',
      category: 'random',
      type: 'written',
      summary: 'Updated summary',
      body: 'Updated body',
      allowInteractions: false,
      allowComments: false
    })
  });

  assert.equal(adminEdit.status, 200);
  assert.equal(adminEdit.body.post.title, 'Integration Test Post Updated');
});
