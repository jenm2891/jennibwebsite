# Cloudflare Backend Setup (Full API)

This project now includes a Cloudflare Worker backend for commerce and blog APIs.

Worker source:

- `cloudflare/commerce-api/src/index.js`
- `cloudflare/commerce-api/src/commerce.js`
- `cloudflare/commerce-api/src/blog.js`
- `cloudflare/commerce-api/wrangler.jsonc`

## Endpoints on Worker

Commerce:

- `GET /api/products`
- `GET /api/checkout-config`
- `POST /create-checkout-session`

Blog/Auth/Admin:

- `GET /api/blog/posts`
- `POST /api/blog/auth/register`
- `POST /api/blog/auth/login`
- `POST /api/blog/auth/verify-email/request`
- `GET /api/blog/auth/verify-email`
- `POST /api/blog/auth/password-reset/request`
- `POST /api/blog/auth/password-reset/confirm`
- `POST /api/blog/newsletter/subscribe`
- `GET /api/blog/auth/me`
- `POST /api/blog/posts/:postId/like`
- `POST /api/blog/posts/:postId/comments`
- `GET /api/blog/admin/posts`
- `POST /api/blog/admin/posts`
- `PUT /api/blog/admin/posts/:postId`

Health:

- `GET /health`

## 1) Create D1 database

Run:

```bash
npx wrangler@4 d1 create jennib-blog
```

Copy the returned `database_id` and update:

- `cloudflare/commerce-api/wrangler.jsonc`

Replace:

- `REPLACE_WITH_D1_DATABASE_ID`

## 2) Apply D1 migrations

Run:

```bash
npm run cf:commerce:d1:migrate
```

Migration file:

- `cloudflare/commerce-api/migrations/0001_blog_schema.sql`

## 3) Set Worker secrets

Required Stripe secrets:

```bash
npx wrangler@4 secret put STRIPE_SECRET_KEY --config cloudflare/commerce-api/wrangler.jsonc
npx wrangler@4 secret put STRIPE_PUBLISHABLE_KEY --config cloudflare/commerce-api/wrangler.jsonc
```

Required blog auth secret:

```bash
npx wrangler@4 secret put BLOG_AUTH_SECRET --config cloudflare/commerce-api/wrangler.jsonc
```

Use a random value at least 32 characters.

## 4) Configure origins and admins

In `cloudflare/commerce-api/wrangler.jsonc`, set:

- `ALLOWED_ORIGINS` (comma-separated)
- `PUBLIC_SITE_ORIGIN`
- `BLOG_ADMIN_USERNAMES` (optional)
- `BLOG_ADMIN_EMAILS` (optional)

## 5) Deploy Worker

Manual deploy:

```bash
npm run cf:commerce:deploy
```

Automated deploy workflow:

- `.github/workflows/deploy-commerce-api.yml`

## 6) Point frontend to Worker API domain

Set this before loading `blog.js`, `blog-dashboard.js`, `shop.js`, and `checkout.js`:

```html
<script>
  window.__CF_API_BASE = "https://api.jennibee.art";
</script>
```

Fallback support remains for `window.__COMMERCE_API_BASE` and `window.__BLOG_API_BASE`.

## 7) Recommended custom domain

Attach your Worker to a custom domain in Cloudflare, such as:

- `https://api.jennibee.art`

Then set `window.__CF_API_BASE` to that domain in your frontend pages.

## 8) Run cutover verification

Run endpoint checks against your Cloudflare API domain:

```bash
CF_API_BASE="https://api.jennibee.art" npm run cf:cutover:verify
```

This verifies health, commerce routes, blog routes, and admin auth guarding in one pass.

Expected behavior:

- `200` for healthy and configured routes
- `401` for admin routes without auth token
- `400` for intentionally invalid newsletter/login payload probes
- `500` only when required secrets/config are still missing