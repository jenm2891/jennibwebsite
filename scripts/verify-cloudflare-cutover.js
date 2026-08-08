const DEFAULT_BASE = 'https://api.jennibee.art';

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return DEFAULT_BASE;
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function printResult(ok, label, details) {
  const prefix = ok ? 'PASS' : 'FAIL';
  console.log(`${prefix}: ${label} -> ${details}`);
}

async function main() {
  const base = normalizeBaseUrl(process.env.CF_API_BASE);
  console.log(`Verifying Cloudflare cutover routes against ${base}`);

  let failures = 0;

  async function runCheck({ label, path, method = 'GET', body, expectedStatuses, validate }) {
    const url = `${base}${path}`;
    const options = { method, headers: {} };

    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    try {
      const { response, data } = await fetchJson(url, options);
      const statusOk = expectedStatuses.includes(response.status);
      const payloadOk = typeof validate === 'function' ? Boolean(validate(data, response.status)) : true;
      const ok = statusOk && payloadOk;

      if (!ok) {
        failures += 1;
      }

      printResult(
        ok,
        label,
        `status=${response.status} body=${JSON.stringify(data).slice(0, 220)}`
      );
    } catch (error) {
      failures += 1;
      printResult(false, label, `request failed: ${error.message}`);
    }
  }

  await runCheck({
    label: 'health',
    path: '/health',
    expectedStatuses: [200],
    validate: (data) => data && data.ok === true
  });

  await runCheck({
    label: 'products catalog',
    path: '/api/products',
    expectedStatuses: [200],
    validate: (data) => Array.isArray(data.products)
  });

  await runCheck({
    label: 'checkout config route',
    path: '/api/checkout-config',
    expectedStatuses: [200, 500],
    validate: (data, status) => {
      if (status === 200) {
        return typeof data.publishableKey === 'string' && data.publishableKey.length > 0;
      }
      return typeof data.error === 'string';
    }
  });

  await runCheck({
    label: 'checkout session route',
    path: '/create-checkout-session',
    method: 'POST',
    body: {
      items: [
        { id: 'product-1', quantity: 1 }
      ]
    },
    expectedStatuses: [200, 400, 500],
    validate: (data, status) => {
      if (status === 200) {
        return typeof data.client_secret === 'string' && data.client_secret.length > 0;
      }
      return typeof data.error === 'string';
    }
  });

  await runCheck({
    label: 'blog posts route',
    path: '/api/blog/posts',
    expectedStatuses: [200, 500],
    validate: (data, status) => {
      if (status === 200) {
        return Array.isArray(data.posts) && Array.isArray(data.sections);
      }
      return typeof data.error === 'string';
    }
  });

  await runCheck({
    label: 'blog login route',
    path: '/api/blog/auth/login',
    method: 'POST',
    body: {
      username: 'nonexistent-user',
      password: 'not-a-real-password'
    },
    expectedStatuses: [401, 500],
    validate: (data) => typeof data.error === 'string'
  });

  await runCheck({
    label: 'blog newsletter route',
    path: '/api/blog/newsletter/subscribe',
    method: 'POST',
    body: {
      email: 'invalid-email'
    },
    expectedStatuses: [400, 500],
    validate: (data) => typeof data.error === 'string'
  });

  await runCheck({
    label: 'blog admin auth guard',
    path: '/api/blog/admin/posts',
    expectedStatuses: [401, 500],
    validate: (data) => typeof data.error === 'string'
  });

  if (failures > 0) {
    console.error(`\nCutover verification completed with ${failures} failure(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('\nCutover verification completed successfully.');
}

main().catch((error) => {
  console.error('Unexpected verification error:', error.message);
  process.exit(1);
});
