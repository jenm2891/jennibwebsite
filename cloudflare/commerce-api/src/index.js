import { jsonResponse, withCorsHeaders } from './common.js';
import { handleCommerceRequest } from './commerce.js';
import { handleBlogRequest } from './blog.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: withCorsHeaders(request, env)
      });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse(request, env, { ok: true });
    }

    const commerceResponse = await handleCommerceRequest(request, env, url.pathname);
    if (commerceResponse) {
      return jsonResponse(request, env, commerceResponse.data, commerceResponse.status);
    }

    const blogResponse = await handleBlogRequest(request, env, url);
    if (blogResponse) {
      return jsonResponse(request, env, blogResponse.data, blogResponse.status);
    }

    return jsonResponse(request, env, { error: 'Not found.' }, 404);
  }
};