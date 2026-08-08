const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Auth-Token'
};

export function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '').trim();
  if (!configured) {
    return [];
  }

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function withCorsHeaders(request, env, extraHeaders = {}) {
  const headers = new Headers({
    ...CORS_HEADERS,
    ...extraHeaders
  });

  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  } else if (allowedOrigins.length === 0) {
    headers.set('Access-Control-Allow-Origin', '*');
  }

  return headers;
}

export function jsonResponse(request, env, data, status = 200) {
  const headers = withCorsHeaders(request, env, {
    'Content-Type': 'application/json; charset=utf-8'
  });

  return new Response(JSON.stringify(data), { status, headers });
}

export function getRequestOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  const fallback = String(env.PUBLIC_SITE_ORIGIN || '').trim();
  if (fallback) {
    return fallback;
  }

  return 'https://jennibee.art';
}

export function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return String(request.headers.get('X-Auth-Token') || '').trim();
}

export function isJsonRequest(request) {
  const contentType = request.headers.get('Content-Type') || '';
  return contentType.includes('application/json');
}
