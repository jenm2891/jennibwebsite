window.lucide?.createIcons();

const BLOG_AUTH_STORAGE_KEY = 'jennib_blog_auth_token_v1';
const BLOG_API_BASE = resolveBlogApiBase();
const state = {
  token: localStorage.getItem(BLOG_AUTH_STORAGE_KEY) || '',
  user: null,
  posts: []
};

const statusEl = document.getElementById('dashboard-status');
const loginForm = document.getElementById('dashboard-login-form');
const createForm = document.getElementById('create-post-form');
const editForm = document.getElementById('edit-post-form');
const postPicker = document.getElementById('edit-post-id');

initializeThemeToggle();
bindEvents();
void bootstrap();

async function bootstrap() {
  if (state.token) {
    await fetchCurrentUser();
  }

  if (!state.user?.isAdmin) {
    setStatus('Login with an admin account to manage posts.');
    return;
  }

  await loadAdminPosts();
}

function bindEvents() {
  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void login();
  });

  createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void createPost();
  });

  editForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void savePost();
  });

  postPicker?.addEventListener('change', () => {
    syncEditForm();
  });
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

async function login() {
  const username = String(document.getElementById('dashboard-username')?.value || '').trim().toLowerCase();
  const password = String(document.getElementById('dashboard-password')?.value || '');

  if (!username || !password) {
    setStatus('Username and password are required.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(BLOG_AUTH_STORAGE_KEY, data.token);

    if (!state.user.isAdmin) {
      setStatus('This account is not an admin.');
      return;
    }

    setStatus(`Logged in as @${state.user.username}.`);
    await loadAdminPosts();
  } catch (error) {
    setStatus(error.message || 'Login failed.');
  }
}

async function fetchCurrentUser() {
  try {
    const data = await fetchJson('/api/blog/auth/me', {
      headers: authHeaders()
    });

    state.user = data.user;
  } catch {
    state.user = null;
    state.token = '';
    localStorage.removeItem(BLOG_AUTH_STORAGE_KEY);
  }
}

async function loadAdminPosts() {
  try {
    const data = await fetchJson('/api/blog/admin/posts', {
      headers: authHeaders()
    });

    state.posts = Array.isArray(data.posts) ? data.posts : [];
    hydratePostPicker();
    syncEditForm();
    setStatus(`Loaded ${state.posts.length} posts.`);
  } catch (error) {
    setStatus(error.message || 'Could not load admin posts.');
  }
}

function hydratePostPicker() {
  postPicker.innerHTML = '';

  state.posts.forEach((post) => {
    const option = document.createElement('option');
    option.value = post.id;
    option.textContent = `${post.title} (${post.category})`;
    postPicker.append(option);
  });
}

function syncEditForm() {
  const selectedId = postPicker.value;
  const post = state.posts.find((entry) => entry.id === selectedId);

  if (!post) {
    return;
  }

  editForm.elements.title.value = post.title;
  editForm.elements.category.value = post.category;
  editForm.elements.type.value = post.type;
  editForm.elements.videoUrl.value = post.videoUrl || '';
  editForm.elements.summary.value = post.summary;
  editForm.elements.body.value = post.body;
  editForm.elements.allowInteractions.checked = Boolean(post.allowInteractions);
  editForm.elements.allowComments.checked = Boolean(post.allowComments);
}

async function createPost() {
  if (!state.user?.isAdmin) {
    setStatus('Admin login required.');
    return;
  }

  const payload = collectPostPayload(createForm);

  try {
    await fetchJson('/api/blog/admin/posts', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    createForm.reset();
    await loadAdminPosts();
    setStatus('Post created.');
  } catch (error) {
    setStatus(error.message || 'Failed to create post.');
  }
}

async function savePost() {
  if (!state.user?.isAdmin) {
    setStatus('Admin login required.');
    return;
  }

  const postId = postPicker.value;
  if (!postId) {
    setStatus('Select a post to edit.');
    return;
  }

  const payload = collectPostPayload(editForm);

  try {
    await fetchJson(`/api/blog/admin/posts/${encodeURIComponent(postId)}`, {
      method: 'PUT',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    await loadAdminPosts();
    setStatus('Post updated.');
  } catch (error) {
    setStatus(error.message || 'Failed to update post.');
  }
}

function collectPostPayload(form) {
  return {
    title: String(form.elements.title.value || '').trim(),
    category: String(form.elements.category.value || '').trim(),
    type: String(form.elements.type.value || '').trim(),
    videoUrl: String(form.elements.videoUrl.value || '').trim(),
    summary: String(form.elements.summary.value || '').trim(),
    body: String(form.elements.body.value || '').trim(),
    allowInteractions: Boolean(form.elements.allowInteractions.checked),
    allowComments: Boolean(form.elements.allowComments.checked)
  };
}

function authHeaders() {
  return state.token
    ? { Authorization: `Bearer ${state.token}` }
    : {};
}

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
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
