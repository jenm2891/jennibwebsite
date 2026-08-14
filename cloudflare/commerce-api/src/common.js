const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Auth-Token'
};

export function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '').trim();
  if (configured) {
    return configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  // VIP List Default - Prevents the list from ever being empty!
  return [
    "https://jennibee.art",
    "https://www.jennibee.art",
    "http://localhost:8788",
    "http://localhost:3000"
  ];
}

export function withCorsHeaders(request, env, extraHeaders = {}) {
  const headers = new Headers({
    ...CORS_HEADERS,
    'Access-Control-Max-Age': '86400', // Cache this strict policy for 24 hours
    ...extraHeaders
  });

  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  } else {
    // Strict Fallback - Removed the '*' wildcard and replaced it with your secure domain
    headers.set('Access-Control-Allow-Origin', 'https://jennibee.art');
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