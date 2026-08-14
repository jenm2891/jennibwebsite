window.lucide?.createIcons();

const BLOG_AUTH_STORAGE_KEY = 'jennib_blog_auth_token_v1';
const BLOG_API_BASE = resolveBlogApiBase();

const state = {
  sections: [],
  posts: [],
  token: localStorage.getItem(BLOG_AUTH_STORAGE_KEY) || '',
  user: null
};

const sectionContainer = document.getElementById('blog-sections');
const authForm = document.getElementById('auth-form');
const resetForm = document.getElementById('reset-form');
const resetFormWrap = document.getElementById('reset-form-wrap');
const authStatus = document.getElementById('auth-status');
const userPill = document.getElementById('user-pill');
const registerButton = document.getElementById('register-btn');
const verifyEmailButton = document.getElementById('verify-email-btn');
const forgotPasswordButton = document.getElementById('forgot-password-btn');
const logoutButton = document.getElementById('logout-btn');
const authorDashboardWrap = document.getElementById('author-dashboard-link-wrap');
const openAuthModalButton = document.getElementById('open-auth-modal');
const closeAuthModalButton = document.getElementById('close-auth-modal');
const authModal = document.getElementById('auth-modal');
const newsletterForm = document.getElementById('newsletter-form');
const newsletterStatus = document.getElementById('newsletter-status');

initializeThemeToggle();
initializeAuthModalEvents();
initializeAuthEvents();
initializeInteractionEvents();
void initializeBlog();

async function initializeBlog() {
  hideResetForm();
  hydrateResetTokenFromQuery();
  await verifyEmailFromQueryIfPresent();

  if (state.token) {
    await fetchCurrentUser();
  }

  updateAuthUI();
  await loadBlog();
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

function initializeAuthEvents() {
  registerButton?.addEventListener('click', () => {
    void registerAccount();
  });

  verifyEmailButton?.addEventListener('click', () => {
    void requestVerificationEmail();
  });

  forgotPasswordButton?.addEventListener('click', () => {
    showResetForm();
    void requestPasswordReset();
  });

  authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void loginAccount();
  });

  resetForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void resetPassword();
  });

  logoutButton?.addEventListener('click', () => {
    clearAuth();
    updateAuthUI();
    renderStatus('Logged out.');
    void loadBlog();
  });

  newsletterForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void subscribeNewsletter();
  });
}

function initializeAuthModalEvents() {
  openAuthModalButton?.addEventListener('click', () => {
    openAuthModal();
  });

  closeAuthModalButton?.addEventListener('click', () => {
    closeAuthModal();
  });

  authModal?.addEventListener('click', (event) => {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && authModal && !authModal.classList.contains('hidden')) {
      closeAuthModal();
    }
  });
}

function initializeInteractionEvents() {
  sectionContainer?.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');

    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const postId = target.dataset.postId;

    if (!action || !postId) {
      return;
    }

    if (action === 'like') {
      void likePost(postId, target);
      return;
    }

    if (action === 'share') {
      void sharePost(postId);
    }
  });

  sectionContainer?.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-comment-form-for]');

    if (!form) {
      return;
    }

    event.preventDefault();
    const postId = form.dataset.commentFormFor;

    if (!postId) {
      return;
    }

    void submitComment(postId, form);
  });
}

async function registerAccount() {
  const credentials = getAuthFormData(true);

  if (!credentials) {
    renderStatus('Username, email, and password are required.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });

    setAuth(data.token, data.user);
    updateAuthUI();

    const preview = data.verificationPreviewLink
      ? ` Dev preview: ${data.verificationPreviewLink}`
      : '';

    renderStatus(`Welcome, ${data.user.username}. Verify your email to interact.${preview}`);
    closeAuthModal();
    await loadBlog();
  } catch (error) {
    renderStatus(error.message || 'Could not create account.');
  }
}

async function loginAccount() {
  const credentials = getAuthFormData(false);

  if (!credentials) {
    renderStatus('Username and password are required.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });

    setAuth(data.token, data.user);
    updateAuthUI();
    closeAuthModal();

    // If an admin logs in from the main blog, take them straight to the dashboard!
    if (data.user.isAdmin) {
      window.location.href = '/html/blog-dashboard.html';
      return;
    }

    if (data.user.emailVerified) {
      renderStatus(`Logged in as @${data.user.username}.`);
    } else {
      renderStatus(`Logged in as @${data.user.username}. Verify your email to interact.`);
    }

    await loadBlog();
  } catch (error) {
    renderStatus(error.message || 'Login failed.');
  }
}

async function requestVerificationEmail() {
  const emailInput = document.getElementById('auth-email');
  const email = String(emailInput?.value || '').trim().toLowerCase();

  if (!email) {
    renderStatus('Enter your email first.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/verify-email/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const preview = data.verificationPreviewLink
      ? ` Dev preview: ${data.verificationPreviewLink}`
      : '';

    renderStatus(`${data.message || 'Verification email requested.'}${preview}`);
  } catch (error) {
    renderStatus(error.message || 'Could not request verification email.');
  }
}

async function requestPasswordReset() {
  const emailInput = document.getElementById('auth-email');
  const email = String(emailInput?.value || '').trim().toLowerCase();

  if (!email) {
    renderStatus('Enter your email first.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/password-reset/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const preview = data.resetPreviewLink
      ? ` Dev preview: ${data.resetPreviewLink}`
      : '';

    renderStatus(`${data.message || 'Reset request submitted.'}${preview}`);
  } catch (error) {
    renderStatus(error.message || 'Could not request password reset.');
  }
}

async function resetPassword() {
  const tokenInput = document.getElementById('reset-token');
  const passwordInput = document.getElementById('new-password');
  const token = String(tokenInput?.value || '').trim();
  const newPassword = String(passwordInput?.value || '');

  if (!token || !newPassword) {
    renderStatus('Reset token and new password are required.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/password-reset/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, newPassword })
    });

    renderStatus(data.message || 'Password updated. You can login now.');
    resetForm?.reset();
  } catch (error) {
    renderStatus(error.message || 'Password reset failed.');
  }
}

async function verifyEmailFromQueryIfPresent() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('verifyToken');

  if (!token) {
    return;
  }

  try {
    const data = await fetchJson(`/api/blog/auth/verify-email?token=${encodeURIComponent(token)}`);
    renderStatus(data.message || 'Email verified.');
  } catch (error) {
    renderStatus(error.message || 'Email verification failed.');
  }

  url.searchParams.delete('verifyToken');
  window.history.replaceState({}, '', url.toString());
}

function hydrateResetTokenFromQuery() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('resetToken');

  if (!token) {
    return;
  }

  const tokenInput = document.getElementById('reset-token');
  if (tokenInput) {
    showResetForm();
    openAuthModal();
    tokenInput.value = token;
  }

  url.searchParams.delete('resetToken');
  window.history.replaceState({}, '', url.toString());
}

function showResetForm() {
  resetFormWrap?.classList.remove('hidden');
}

function hideResetForm() {
  resetFormWrap?.classList.add('hidden');
}

function openAuthModal() {
  authModal?.classList.remove('hidden');
}

function closeAuthModal() {
  authModal?.classList.add('hidden');
}

async function subscribeNewsletter() {
  const emailInput = document.getElementById('newsletter-email');
  const email = String(emailInput?.value || '').trim().toLowerCase();

  if (!email) {
    renderNewsletterStatus('Enter your email address first.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    renderNewsletterStatus(data.message || 'Subscribed to newsletter.');
    newsletterForm?.reset();
  } catch (error) {
    renderNewsletterStatus(error.message || 'Could not subscribe right now.');
  }
}

function renderNewsletterStatus(message) {
  if (newsletterStatus) {
    newsletterStatus.textContent = message;
  }
}

async function fetchCurrentUser() {
  try {
    const data = await fetchJson('/api/blog/auth/me', {
      headers: getAuthHeaders()
    });

    state.user = data.user;
  } catch {
    clearAuth();
  }
}

function getAuthFormData(requireEmail) {
  const usernameInput = document.getElementById('auth-username');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const username = String(usernameInput?.value || '').trim().toLowerCase();
  const email = String(emailInput?.value || '').trim().toLowerCase();
  const password = String(passwordInput?.value || '');

  if (!username || !password) {
    return null;
  }

  if (requireEmail && !email) {
    return null;
  }

  if (requireEmail) {
    return { username, email, password };
  }

  return { username, password };
}

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem(BLOG_AUTH_STORAGE_KEY, token);
}

function clearAuth() {
  state.token = '';
  state.user = null;
  localStorage.removeItem(BLOG_AUTH_STORAGE_KEY);
}

function updateAuthUI() {
  const loggedIn = Boolean(state.user && state.token);

  userPill?.classList.toggle('hidden', !loggedIn);
  if (userPill && loggedIn) {
    userPill.textContent = `@${state.user.username}`;
  }

  logoutButton?.classList.toggle('hidden', !loggedIn);

  if (authorDashboardWrap) {
    authorDashboardWrap.classList.toggle('hidden', !(loggedIn && state.user?.isAdmin));
  }

  if (authStatus) {
    if (!loggedIn) {
      authStatus.textContent = 'Create an account or login to like, share, and comment.';
    } else if (!state.user.emailVerified) {
      authStatus.textContent = 'Logged in. Verify your email to unlock interactions.';
    } else {
      authStatus.textContent = 'You can now like, share, and comment on eligible posts.';
    }
  }
}

async function loadBlog() {
  try {
    const payload = await fetchJson('/api/blog/posts', {
      headers: getAuthHeaders()
    });

    state.sections = Array.isArray(payload.sections) ? payload.sections : [];
    state.posts = Array.isArray(payload.posts) ? payload.posts : [];
    renderSections();
  } catch {
    sectionContainer.innerHTML = '';
    renderStatus('Unable to load blog right now. Please refresh.');
  }
}

function renderSections() {
  sectionContainer.innerHTML = '';

  state.sections.forEach((sectionName) => {
    const sectionPosts = state.posts.filter((post) => post.category === sectionName);

    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.className = 'font-display text-3xl capitalize mb-3';
    heading.textContent = sectionName;

    if (!sectionPosts.length) {
      const empty = document.createElement('p');
      empty.className = 'section-empty-note';
      empty.textContent = 'No posts yet in this section.';
      section.append(heading, empty);
      sectionContainer.append(section);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'post-grid';

    sectionPosts.forEach((post) => {
      grid.append(buildPostCard(post));
    });

    section.append(heading, grid);
    sectionContainer.append(section);
  });
}

function buildPostCard(post) {
  const article = document.createElement('article');
  article.className = 'post-card';
  article.dataset.postId = post.id;

  const meta = document.createElement('p');
  meta.className = 'post-meta';
  meta.textContent = `${post.type === 'vlog' ? 'Vlog' : 'Written'} · ${new Date(post.publishedAt).toLocaleDateString()}`;

  const title = document.createElement('h3');
  title.className = 'post-title font-display';
  title.textContent = post.title;

  const summary = document.createElement('p');
  summary.className = 'post-summary';
  summary.textContent = post.summary;

  const body = document.createElement('p');
  body.className = 'mt-2 text-sm opacity-90';
  body.textContent = post.body;

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.className = 'post-action-btn';
  likeButton.dataset.action = 'like';
  likeButton.dataset.postId = post.id;
  likeButton.textContent = `${post.likedByCurrentUser ? 'Unlike' : 'Like'} (${post.likes || 0})`;

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'post-action-btn';
  shareButton.dataset.action = 'share';
  shareButton.dataset.postId = post.id;
  shareButton.textContent = 'Share';

  actions.append(likeButton, shareButton);

  if (post.videoUrl) {
    const watchButton = document.createElement('a');
    watchButton.href = post.videoUrl;
    watchButton.target = '_blank';
    watchButton.rel = 'noopener noreferrer';
    watchButton.className = 'post-action-btn';
    watchButton.textContent = 'Watch video';
    actions.append(watchButton);
  }

  const lockNote = document.createElement('p');
  lockNote.className = 'post-lock-note';
  lockNote.textContent = post.allowInteractions
    ? 'Members can interact with this post.'
    : 'This post is read-only.';

  const commentWrap = document.createElement('div');
  commentWrap.className = 'comment-wrap';

  if (post.allowComments) {
    const commentsHeading = document.createElement('p');
    commentsHeading.className = 'text-sm font-semibold mb-2';
    commentsHeading.textContent = `Comments (${post.comments.length})`;

    const commentList = document.createElement('div');
    commentList.className = 'comment-list';
    commentList.dataset.commentListFor = post.id;
    renderCommentList(post.comments, commentList);

    const form = document.createElement('form');
    form.className = 'comment-form';
    form.dataset.commentFormFor = post.id;

    const messageInput = document.createElement('textarea');
    messageInput.name = 'message';
    messageInput.maxLength = 500;
    messageInput.rows = 3;
    messageInput.required = true;
    messageInput.className = 'comment-input rounded-xl border px-3 py-2';
    messageInput.placeholder = state.user?.emailVerified
      ? 'Leave a comment'
      : 'Verify email to comment';

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'action-btn comment-submit rounded-full px-4 py-2';
    submitButton.textContent = 'Post comment';

    if (!state.user?.emailVerified) {
      messageInput.disabled = true;
      submitButton.disabled = true;
    }

    const status = document.createElement('p');
    status.className = 'status-text';
    status.dataset.commentStatusFor = post.id;

    form.append(messageInput, submitButton);
    commentWrap.append(commentsHeading, commentList, form, status);
  } else {
    const commentsDisabled = document.createElement('p');
    commentsDisabled.className = 'text-sm opacity-75';
    commentsDisabled.textContent = 'Comments are disabled for this post.';
    commentWrap.append(commentsDisabled);
  }

  if (!post.allowInteractions || !state.user?.emailVerified) {
    likeButton.disabled = !post.allowInteractions || !state.user?.emailVerified;
    shareButton.disabled = !post.allowInteractions || !state.user?.emailVerified;
  }

  article.append(meta, title, summary, body, actions, lockNote, commentWrap);
  return article;
}

function renderCommentList(comments, container) {
  container.innerHTML = '';

  if (!comments.length) {
    const empty = document.createElement('p');
    empty.className = 'text-sm opacity-70';
    empty.textContent = 'No comments yet.';
    container.append(empty);
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement('div');
    item.className = 'comment-item';

    const header = document.createElement('p');
    header.className = 'comment-header';
    header.textContent = `${comment.author} · ${new Date(comment.createdAt).toLocaleString()}`;

    const body = document.createElement('p');
    body.className = 'text-sm';
    body.textContent = comment.message;

    item.append(header, body);
    container.append(item);
  });
}

async function likePost(postId, button) {
  if (!(await ensureAuthenticatedAndVerified())) {
    return;
  }

  try {
    const data = await fetchJson(`/api/blog/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    button.textContent = `${data.liked ? 'Unlike' : 'Like'} (${data.likes || 0})`;
  } catch (error) {
    handleAuthError(error);
  }
}

async function sharePost(postId) {
  if (!(await ensureAuthenticatedAndVerified())) {
    return;
  }

  const post = state.posts.find((entry) => entry.id === postId);

  if (!post) {
    return;
  }

  const url = `${window.location.origin}/html/blog.html#${postId}`;
  const payload = { title: post.title, text: post.summary, url };

  try {
    if (navigator.share) {
      await navigator.share(payload);
      renderStatus('Post shared.');
      return;
    }

    await navigator.clipboard.writeText(url);
    renderStatus('Share link copied to clipboard.');
  } catch {
    renderStatus('Unable to share right now.');
  }
}

async function submitComment(postId, form) {
  if (!(await ensureAuthenticatedAndVerified())) {
    return;
  }

  const status = document.querySelector(`[data-comment-status-for="${postId}"]`);
  const formData = new FormData(form);

  try {
    const data = await fetchJson(`/api/blog/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: formData.get('message')
      })
    });

    if (status) {
      status.textContent = 'Comment posted.';
    }

    const post = state.posts.find((entry) => entry.id === postId);

    if (post && data.comment) {
      post.comments.push(data.comment);
      const list = document.querySelector(`[data-comment-list-for="${postId}"]`);
      if (list) {
        renderCommentList(post.comments, list);
      }
    }

    form.reset();
  } catch (error) {
    if (status) {
      status.textContent = error.message || 'Unable to post comment.';
    }

    handleAuthError(error, false);
  }
}

async function ensureAuthenticatedAndVerified() {
  if (!state.token || !state.user) {
    renderStatus('Login required to interact with posts.');
    return false;
  }

  if (!state.user.emailVerified) {
    renderStatus('Verify your email to interact with posts.');
    return false;
  }

  return true;
}

function handleAuthError(error, updateStatus = true) {
  if (error?.statusCode === 401) {
    clearAuth();
    updateAuthUI();
    renderStatus('Session expired. Please login again.');
    void loadBlog();
    return;
  }

  if (updateStatus) {
    renderStatus(error.message || 'Action failed. Please try again.');
  }
}

function renderStatus(message) {
  if (authStatus) {
    authStatus.textContent = message;
  }
}

function getAuthHeaders() {
  if (!state.token) {
    return {};
  }

  return {
    Authorization: `Bearer ${state.token}`
  };
}

async function fetchJson(url, options) {
  const response = await fetch(toBlogApiUrl(url), options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function resolveBlogApiBase() {
  const configured = String(window.__CF_API_BASE || window.__BLOG_API_BASE || window.__COMMERCE_API_BASE || '').trim();

  if (!configured) {
    return '';
  }

  return configured.endsWith('/') ? configured.slice(0, -1) : configured;
}

function toBlogApiUrl(url) {
  if (!BLOG_API_BASE || !String(url).startsWith('/')) {
    return url;
  }

  return `${BLOG_API_BASE}${url}`;
}
