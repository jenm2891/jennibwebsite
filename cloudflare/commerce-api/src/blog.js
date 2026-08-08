import { getBearerToken } from './common.js';

const BLOG_SECTIONS = ['videos', 'articles', 'recipes', 'random', 'photo dump'];
const BLOG_USERNAME_MIN_LENGTH = 3;
const BLOG_USERNAME_MAX_LENGTH = 24;
const BLOG_PASSWORD_MIN_LENGTH = 8;
const BLOG_MAX_COMMENT_LENGTH = 500;
const BLOG_MAX_COMMENTS_PER_POST = 200;
const BLOG_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BLOG_VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const BLOG_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const encoder = new TextEncoder();
let schemaReady = false;

function boolToInt(value) {
  return value ? 1 : 0;
}

function intToBool(value) {
  return Number(value) === 1;
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function createRandomId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function createOpaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return base64UrlEncodeBytes(bytes);
}

function parseAdminList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-z0-9_]+$/.test(username)
    && username.length >= BLOG_USERNAME_MIN_LENGTH
    && username.length <= BLOG_USERNAME_MAX_LENGTH;
}

function escapeHtml(value) {
  return String(value || '')
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

  return escapeHtml(normalized.slice(0, maxLength));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function timingSafeStringEquals(a, b) {
  const aBytes = encoder.encode(String(a || ''));
  const bBytes = encoder.encode(String(b || ''));

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    mismatch |= aBytes[i] ^ bBytes[i];
  }

  return mismatch === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  const bytes = new Uint8Array(digest);
  let hex = '';

  bytes.forEach((byte) => {
    hex += byte.toString(16).padStart(2, '0');
  });

  return hex;
}

async function hashPassword(password, saltBase64Url = '') {
  const salt = saltBase64Url ? base64UrlDecodeToBytes(saltBase64Url) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: 120000
    },
    key,
    256
  );

  const hashBytes = new Uint8Array(bits);

  return {
    salt: base64UrlEncodeBytes(salt),
    hash: base64UrlEncodeBytes(hashBytes)
  };
}

async function passwordsMatch(password, salt, storedHash) {
  const computed = await hashPassword(password, salt);
  return timingSafeStringEquals(computed.hash, storedHash);
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signTokenPayload(payloadBase64, secret) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadBase64));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function toIsoDate(input) {
  const value = Date.parse(String(input || ''));
  if (!Number.isFinite(value)) {
    return new Date().toISOString();
  }

  return new Date(value).toISOString();
}

function getSafePreviewLink(env, link) {
  return String(env.ENVIRONMENT || 'production') === 'production' ? undefined : link;
}

async function ensureSchema(env) {
  if (schemaReady) {
    return;
  }

  if (!env.DB) {
    throw new Error('Blog database binding is missing. Configure D1 binding DB.');
  }

  schemaReady = true;
}

function getBlogAuthSecret(env) {
  const secret = String(env.BLOG_AUTH_SECRET || '').trim();

  if (!secret || secret.length < 32) {
    throw new Error('Blog auth is unavailable. Configure BLOG_AUTH_SECRET (min 32 chars).');
  }

  return secret;
}

function getBaseOriginForLinks(request, env) {
  const origin = request.headers.get('Origin');
  if (origin) {
    return origin;
  }

  const configured = String(env.PUBLIC_SITE_ORIGIN || '').trim();
  if (configured) {
    return configured;
  }

  return 'https://jennibee.art';
}

async function issueBlogAuthToken(userId, env) {
  const payload = {
    uid: userId,
    exp: Date.now() + BLOG_TOKEN_TTL_MS
  };

  const payloadBase64 = base64UrlEncodeBytes(encoder.encode(JSON.stringify(payload)));
  const signature = await signTokenPayload(payloadBase64, getBlogAuthSecret(env));
  return `${payloadBase64}.${signature}`;
}

async function verifyBlogAuthToken(token, env) {
  const parts = String(token || '').split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;
  const expected = await signTokenPayload(payloadBase64, getBlogAuthSecret(env));

  if (!timingSafeStringEquals(signature, expected)) {
    return null;
  }

  try {
    const payloadRaw = new TextDecoder().decode(base64UrlDecodeToBytes(payloadBase64));
    const payload = JSON.parse(payloadRaw);

    if (!payload?.uid || !payload?.exp || Date.now() > Number(payload.exp)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: intToBool(user.email_verified),
    isAdmin: intToBool(user.is_admin),
    createdAt: user.created_at
  };
}

async function findUserByEmail(env, email) {
  return env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first();
}

async function findUserByUsername(env, username) {
  return env.DB
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first();
}

async function findUserById(env, userId) {
  return env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();
}

async function getAuthenticatedUser(request, env) {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const payload = await verifyBlogAuthToken(token, env);

  if (!payload?.uid) {
    return null;
  }

  return findUserById(env, payload.uid);
}

async function issueEmailVerification(user, request, env) {
  const token = createOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + BLOG_VERIFY_TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    `UPDATE users
     SET email_verification_token_hash = ?, email_verification_expires_at = ?
     WHERE id = ?`
  ).bind(tokenHash, expiresAt, user.id).run();

  return `${getBaseOriginForLinks(request, env)}/html/blog.html?verifyToken=${encodeURIComponent(token)}`;
}

async function issuePasswordReset(user, request, env) {
  const token = createOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + BLOG_RESET_TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    `UPDATE users
     SET password_reset_token_hash = ?, password_reset_expires_at = ?
     WHERE id = ?`
  ).bind(tokenHash, expiresAt, user.id).run();

  return `${getBaseOriginForLinks(request, env)}/html/blog.html?resetToken=${encodeURIComponent(token)}`;
}

async function userCount(env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  return Number(row?.count || 0);
}

function shouldBeAdmin(env, username, email, currentUserCount) {
  const adminUsernames = parseAdminList(env.BLOG_ADMIN_USERNAMES);
  const adminEmails = parseAdminList(env.BLOG_ADMIN_EMAILS);

  if (adminUsernames.includes(username) || adminEmails.includes(email)) {
    return true;
  }

  return currentUserCount === 0;
}

async function getPostRows(env) {
  const result = await env.DB
    .prepare('SELECT * FROM posts ORDER BY datetime(published_at) DESC')
    .all();

  return Array.isArray(result?.results) ? result.results : [];
}

async function getPostById(env, postId) {
  return env.DB
    .prepare('SELECT * FROM posts WHERE id = ?')
    .bind(postId)
    .first();
}

async function getLikesSummary(env, postId, userId = '') {
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?')
    .bind(postId)
    .first();

  let likedByCurrentUser = false;
  if (userId) {
    const likedRow = await env.DB
      .prepare('SELECT 1 AS liked FROM post_likes WHERE post_id = ? AND user_id = ?')
      .bind(postId, userId)
      .first();

    likedByCurrentUser = Boolean(likedRow?.liked);
  }

  return {
    likes: Number(countRow?.count || 0),
    likedByCurrentUser
  };
}

async function getCommentsForPost(env, postId) {
  const result = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.message, c.created_at, u.username
     FROM post_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ?
     ORDER BY datetime(c.created_at) ASC`
  ).bind(postId).all();

  const rows = Array.isArray(result?.results) ? result.results : [];

  return rows.map((row) => ({
    id: row.id,
    author: row.username || 'Deleted User',
    message: row.message,
    createdAt: row.created_at
  }));
}

async function getBlogPostResponse(env, post, currentUserId = '') {
  const comments = await getCommentsForPost(env, post.id);
  const likesSummary = await getLikesSummary(env, post.id, currentUserId);

  return {
    id: post.id,
    title: post.title,
    category: post.category,
    type: post.type,
    summary: post.summary,
    body: post.body,
    videoUrl: post.video_url || '',
    publishedAt: toIsoDate(post.published_at),
    allowInteractions: intToBool(post.allow_interactions),
    allowComments: intToBool(post.allow_comments),
    likes: likesSummary.likes,
    likedByCurrentUser: likesSummary.likedByCurrentUser,
    comments
  };
}

async function getBlogPostsResponse(env, currentUserId = '') {
  const rows = await getPostRows(env);
  const posts = [];

  for (const row of rows) {
    posts.push(await getBlogPostResponse(env, row, currentUserId));
  }

  return {
    sections: BLOG_SECTIONS,
    posts
  };
}

function requireAdmin(user) {
  return Boolean(user) && intToBool(user.is_admin);
}

async function listAdminPosts(env) {
  const rows = await getPostRows(env);
  const posts = [];

  for (const row of rows) {
    posts.push(await getBlogPostResponse(env, row, ''));
  }

  return posts;
}

async function handleBlogRegister(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const username = normalizeUsername(body?.username);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');

  if (!isValidUsername(username)) {
    return {
      status: 400,
      data: { error: `Username must be ${BLOG_USERNAME_MIN_LENGTH}-${BLOG_USERNAME_MAX_LENGTH} chars using a-z, 0-9, or _.` }
    };
  }

  if (password.length < BLOG_PASSWORD_MIN_LENGTH) {
    return {
      status: 400,
      data: { error: `Password must be at least ${BLOG_PASSWORD_MIN_LENGTH} characters.` }
    };
  }

  if (!isValidEmail(email)) {
    return { status: 400, data: { error: 'A valid email address is required.' } };
  }

  const existingUsername = await findUserByUsername(env, username);
  if (existingUsername) {
    return { status: 409, data: { error: 'Username is already taken.' } };
  }

  const existingEmail = await findUserByEmail(env, email);
  if (existingEmail) {
    return { status: 409, data: { error: 'Email is already registered.' } };
  }

  const hashed = await hashPassword(password);
  const count = await userCount(env);
  const user = {
    id: createRandomId(),
    username,
    email,
    email_verified: 0,
    is_admin: boolToInt(shouldBeAdmin(env, username, email, count)),
    password_salt: hashed.salt,
    password_hash: hashed.hash,
    created_at: new Date().toISOString()
  };

  await env.DB.prepare(
    `INSERT INTO users (
      id, username, email, email_verified, is_admin,
      password_salt, password_hash, created_at,
      email_verification_token_hash, email_verification_expires_at,
      password_reset_token_hash, password_reset_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '')`
  ).bind(
    user.id,
    user.username,
    user.email,
    user.email_verified,
    user.is_admin,
    user.password_salt,
    user.password_hash,
    user.created_at
  ).run();

  const verificationLink = await issueEmailVerification(user, request, env);
  const token = await issueBlogAuthToken(user.id, env);

  return {
    status: 201,
    data: {
      token,
      user: getSafeUser(user),
      verificationRequired: true,
      verificationPreviewLink: getSafePreviewLink(env, verificationLink)
    }
  };
}

async function handleBlogLogin(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const username = normalizeUsername(body?.username);
  const password = String(body?.password || '');

  const user = await findUserByUsername(env, username);

  if (!user) {
    return { status: 401, data: { error: 'Invalid username or password.' } };
  }

  const isMatch = await passwordsMatch(password, user.password_salt, user.password_hash);

  if (!isMatch) {
    return { status: 401, data: { error: 'Invalid username or password.' } };
  }

  const token = await issueBlogAuthToken(user.id, env);

  return {
    status: 200,
    data: {
      token,
      user: getSafeUser(user)
    }
  };
}

async function handleVerifyEmailRequest(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);

  if (!isValidEmail(email)) {
    return { status: 400, data: { error: 'A valid email address is required.' } };
  }

  const user = await findUserByEmail(env, email);

  if (!user) {
    return { status: 200, data: { message: 'If this email exists, a verification link has been sent.' } };
  }

  if (intToBool(user.email_verified)) {
    return { status: 200, data: { message: 'Email is already verified.' } };
  }

  const verificationLink = await issueEmailVerification(user, request, env);
  return {
    status: 200,
    data: {
      message: 'Verification link sent.',
      verificationPreviewLink: getSafePreviewLink(env, verificationLink)
    }
  };
}

async function handleVerifyEmail(url, env) {
  const token = String(url.searchParams.get('token') || '').trim();

  if (!token) {
    return { status: 400, data: { error: 'Verification token is required.' } };
  }

  const tokenHash = await sha256Hex(token);
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE email_verification_token_hash = ?')
    .bind(tokenHash)
    .first();

  if (!user) {
    return { status: 400, data: { error: 'Verification token is invalid.' } };
  }

  const expiresAt = Date.parse(String(user.email_verification_expires_at || ''));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { status: 400, data: { error: 'Verification token has expired.' } };
  }

  await env.DB.prepare(
    `UPDATE users
     SET email_verified = 1,
         email_verification_token_hash = '',
         email_verification_expires_at = ''
     WHERE id = ?`
  ).bind(user.id).run();

  return { status: 200, data: { message: 'Email verified successfully.' } };
}

async function handlePasswordResetRequest(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);

  if (!isValidEmail(email)) {
    return { status: 400, data: { error: 'A valid email address is required.' } };
  }

  const user = await findUserByEmail(env, email);

  if (!user) {
    return { status: 200, data: { message: 'If this email exists, a reset link has been sent.' } };
  }

  const resetLink = await issuePasswordReset(user, request, env);
  return {
    status: 200,
    data: {
      message: 'Password reset link sent.',
      resetPreviewLink: getSafePreviewLink(env, resetLink)
    }
  };
}

async function handlePasswordResetConfirm(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || '').trim();
  const newPassword = String(body?.newPassword || '');

  if (!token) {
    return { status: 400, data: { error: 'Reset token is required.' } };
  }

  if (newPassword.length < BLOG_PASSWORD_MIN_LENGTH) {
    return {
      status: 400,
      data: { error: `Password must be at least ${BLOG_PASSWORD_MIN_LENGTH} characters.` }
    };
  }

  const tokenHash = await sha256Hex(token);
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE password_reset_token_hash = ?')
    .bind(tokenHash)
    .first();

  if (!user) {
    return { status: 400, data: { error: 'Reset token is invalid.' } };
  }

  const expiresAt = Date.parse(String(user.password_reset_expires_at || ''));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { status: 400, data: { error: 'Reset token has expired.' } };
  }

  const hashed = await hashPassword(newPassword);

  await env.DB.prepare(
    `UPDATE users
     SET password_salt = ?,
         password_hash = ?,
         password_reset_token_hash = '',
         password_reset_expires_at = ''
     WHERE id = ?`
  ).bind(hashed.salt, hashed.hash, user.id).run();

  return { status: 200, data: { message: 'Password has been reset successfully.' } };
}

async function handleNewsletterSubscribe(request, env) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);

  if (!isValidEmail(email)) {
    return { status: 400, data: { error: 'A valid email address is required.' } };
  }

  const exists = await env.DB
    .prepare('SELECT email FROM newsletter_subscribers WHERE email = ?')
    .bind(email)
    .first();

  if (exists) {
    return { status: 200, data: { message: 'You are already subscribed.' } };
  }

  await env.DB.prepare(
    'INSERT INTO newsletter_subscribers (email, subscribed_at) VALUES (?, ?)'
  ).bind(email, new Date().toISOString()).run();

  return { status: 201, data: { message: 'Newsletter signup confirmed.' } };
}

async function handleAuthMe(request, env) {
  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return { status: 401, data: { error: 'Authentication required.' } };
  }

  return { status: 200, data: { user: getSafeUser(user) } };
}

async function handleBlogPosts(request, env) {
  const user = await getAuthenticatedUser(request, env);
  const payload = await getBlogPostsResponse(env, user?.id || '');
  return { status: 200, data: payload };
}

async function handleLikePost(request, env, postId) {
  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return { status: 401, data: { error: 'Login required for likes.' } };
  }

  if (!intToBool(user.email_verified)) {
    return { status: 403, data: { error: 'Verify your email to interact with posts.' } };
  }

  const post = await getPostById(env, postId);

  if (!post) {
    return { status: 404, data: { error: 'Post not found.' } };
  }

  if (!intToBool(post.allow_interactions)) {
    return { status: 403, data: { error: 'Interactions are disabled for this post.' } };
  }

  const existing = await env.DB
    .prepare('SELECT 1 AS found FROM post_likes WHERE post_id = ? AND user_id = ?')
    .bind(postId, user.id)
    .first();

  let liked = true;

  if (existing) {
    await env.DB
      .prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
      .bind(postId, user.id)
      .run();
    liked = false;
  } else {
    await env.DB
      .prepare('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)')
      .bind(postId, user.id, new Date().toISOString())
      .run();
  }

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?')
    .bind(postId)
    .first();

  return {
    status: 200,
    data: {
      likes: Number(countRow?.count || 0),
      liked
    }
  };
}

async function handlePostComment(request, env, postId) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return { status: 401, data: { error: 'Login required for comments.' } };
  }

  if (!intToBool(user.email_verified)) {
    return { status: 403, data: { error: 'Verify your email to interact with posts.' } };
  }

  const post = await getPostById(env, postId);

  if (!post) {
    return { status: 404, data: { error: 'Post not found.' } };
  }

  if (!intToBool(post.allow_comments)) {
    return { status: 403, data: { error: 'Comments are disabled for this post.' } };
  }

  const body = await request.json().catch(() => ({}));
  const message = sanitizeInputText(body?.message, BLOG_MAX_COMMENT_LENGTH);

  if (!message || message.length < 2) {
    return { status: 400, data: { error: 'Comment must be at least 2 characters.' } };
  }

  const comment = {
    id: createRandomId(),
    user_id: user.id,
    message,
    created_at: new Date().toISOString()
  };

  await env.DB.prepare(
    'INSERT INTO post_comments (id, post_id, user_id, message, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(comment.id, postId, comment.user_id, comment.message, comment.created_at).run();

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM post_comments WHERE post_id = ?')
    .bind(postId)
    .first();

  const count = Number(countRow?.count || 0);

  if (count > BLOG_MAX_COMMENTS_PER_POST) {
    await env.DB.prepare(
      `DELETE FROM post_comments
       WHERE id IN (
         SELECT id FROM post_comments
         WHERE post_id = ?
         ORDER BY datetime(created_at) ASC
         LIMIT ?
       )`
    ).bind(postId, count - BLOG_MAX_COMMENTS_PER_POST).run();
  }

  return {
    status: 201,
    data: {
      comment: {
        id: comment.id,
        author: user.username,
        message: comment.message,
        createdAt: comment.created_at
      },
      commentCount: Math.min(count, BLOG_MAX_COMMENTS_PER_POST)
    }
  };
}

function parsePostInput(body, currentPost = null) {
  const title = sanitizeInputText(body?.title ?? currentPost?.title, 120);
  const category = sanitizeInputText(body?.category ?? currentPost?.category, 40).toLowerCase();
  const type = sanitizeInputText(body?.type ?? currentPost?.type, 20).toLowerCase();
  const summary = sanitizeInputText(body?.summary ?? currentPost?.summary, 240);
  const postBody = sanitizeInputText(body?.body ?? currentPost?.body, 5000);
  const videoUrl = String(body?.videoUrl ?? currentPost?.video_url ?? '').trim();
  const allowInteractions = typeof body?.allowInteractions === 'boolean'
    ? body.allowInteractions
    : currentPost
      ? intToBool(currentPost.allow_interactions)
      : false;
  const allowComments = typeof body?.allowComments === 'boolean'
    ? body.allowComments
    : currentPost
      ? intToBool(currentPost.allow_comments)
      : false;

  if (!title || !summary || !postBody) {
    return { error: 'Title, summary, and body are required.' };
  }

  if (!BLOG_SECTIONS.includes(category)) {
    return { error: 'Category must be one of the supported blog sections.' };
  }

  if (type !== 'written' && type !== 'vlog') {
    return { error: 'Type must be either "written" or "vlog".' };
  }

  if (videoUrl && type !== 'vlog') {
    return { error: 'Video URL can only be set for vlog posts.' };
  }

  return {
    value: {
      title,
      category,
      type,
      summary,
      body: postBody,
      videoUrl,
      allowInteractions,
      allowComments
    }
  };
}

async function handleAdminPosts(request, env) {
  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return { status: 401, data: { error: 'Authentication required.' } };
  }

  if (!requireAdmin(user)) {
    return { status: 403, data: { error: 'Admin access required.' } };
  }

  if (request.method === 'GET') {
    return {
      status: 200,
      data: {
        sections: BLOG_SECTIONS,
        posts: await listAdminPosts(env)
      }
    };
  }

  if (request.method === 'POST') {
    if (!request.headers.get('Content-Type')?.includes('application/json')) {
      return { status: 415, data: { error: 'Content-Type must be application/json.' } };
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parsePostInput(body);

    if (parsed.error) {
      return { status: 400, data: { error: parsed.error } };
    }

    const input = parsed.value;
    const slug = slugify(input.title) || createRandomId().slice(0, 8);
    const postId = `blog-${slug}-${createRandomId().slice(0, 6)}`;
    const publishedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO posts (
        id, title, category, type, summary, body,
        video_url, published_at, allow_interactions, allow_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      postId,
      input.title,
      input.category,
      input.type,
      input.summary,
      input.body,
      input.videoUrl,
      publishedAt,
      boolToInt(input.allowInteractions),
      boolToInt(input.allowComments)
    ).run();

    const post = await getPostById(env, postId);

    return {
      status: 201,
      data: {
        post: await getBlogPostResponse(env, post, '')
      }
    };
  }

  return null;
}

async function handleAdminPostUpdate(request, env, postId) {
  if (request.method !== 'PUT') {
    return null;
  }

  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return { status: 415, data: { error: 'Content-Type must be application/json.' } };
  }

  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return { status: 401, data: { error: 'Authentication required.' } };
  }

  if (!requireAdmin(user)) {
    return { status: 403, data: { error: 'Admin access required.' } };
  }

  const existing = await getPostById(env, postId);

  if (!existing) {
    return { status: 404, data: { error: 'Post not found.' } };
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parsePostInput(body, existing);

  if (parsed.error) {
    return { status: 400, data: { error: parsed.error } };
  }

  const input = parsed.value;

  await env.DB.prepare(
    `UPDATE posts
     SET title = ?, category = ?, type = ?, summary = ?, body = ?,
         video_url = ?, allow_interactions = ?, allow_comments = ?
     WHERE id = ?`
  ).bind(
    input.title,
    input.category,
    input.type,
    input.summary,
    input.body,
    input.videoUrl,
    boolToInt(input.allowInteractions),
    boolToInt(input.allowComments),
    postId
  ).run();

  const post = await getPostById(env, postId);

  return {
    status: 200,
    data: {
      post: await getBlogPostResponse(env, post, '')
    }
  };
}

export async function handleBlogRequest(request, env, url) {
  try {
    await ensureSchema(env);
  } catch (error) {
    return {
      status: 500,
      data: { error: error.message || 'Blog backend is unavailable.' }
    };
  }

  const { pathname } = url;

  try {
    if (pathname === '/api/blog/posts' && request.method === 'GET') {
      return handleBlogPosts(request, env);
    }

    if (pathname === '/api/blog/auth/register' && request.method === 'POST') {
      return handleBlogRegister(request, env);
    }

    if (pathname === '/api/blog/auth/login' && request.method === 'POST') {
      return handleBlogLogin(request, env);
    }

    if (pathname === '/api/blog/auth/verify-email/request' && request.method === 'POST') {
      return handleVerifyEmailRequest(request, env);
    }

    if (pathname === '/api/blog/auth/verify-email' && request.method === 'GET') {
      return handleVerifyEmail(url, env);
    }

    if (pathname === '/api/blog/auth/password-reset/request' && request.method === 'POST') {
      return handlePasswordResetRequest(request, env);
    }

    if (pathname === '/api/blog/auth/password-reset/confirm' && request.method === 'POST') {
      return handlePasswordResetConfirm(request, env);
    }

    if (pathname === '/api/blog/newsletter/subscribe' && request.method === 'POST') {
      return handleNewsletterSubscribe(request, env);
    }

    if (pathname === '/api/blog/auth/me' && request.method === 'GET') {
      return handleAuthMe(request, env);
    }

    if (pathname.startsWith('/api/blog/posts/') && pathname.endsWith('/like') && request.method === 'POST') {
      const postId = decodeURIComponent(pathname.slice('/api/blog/posts/'.length, -'/like'.length));
      return handleLikePost(request, env, postId);
    }

    if (pathname.startsWith('/api/blog/posts/') && pathname.endsWith('/comments') && request.method === 'POST') {
      const postId = decodeURIComponent(pathname.slice('/api/blog/posts/'.length, -'/comments'.length));
      return handlePostComment(request, env, postId);
    }

    if (pathname === '/api/blog/admin/posts') {
      return handleAdminPosts(request, env);
    }

    if (pathname.startsWith('/api/blog/admin/posts/')) {
      const postId = decodeURIComponent(pathname.slice('/api/blog/admin/posts/'.length));
      return handleAdminPostUpdate(request, env, postId);
    }
  } catch (error) {
    return {
      status: 500,
      data: { error: error.message || 'Blog backend is unavailable.' }
    };
  }

  return null;
}
