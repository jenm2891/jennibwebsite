window.lucide?.createIcons();

const BLOG_AUTH_STORAGE_KEY = 'jennib_blog_auth_token_v1';
const BLOG_API_BASE = resolveBlogApiBase();
const state = {
  token: localStorage.getItem(BLOG_AUTH_STORAGE_KEY) || '',
  user: null,
  posts: []
};

// Dashboard Elements
const dashboardStatusEl = document.getElementById('dashboard-status');
const loginForm = document.getElementById('dashboard-login-form');
const createForm = document.getElementById('create-post-form');
const editForm = document.getElementById('edit-post-form');
const postPicker = document.getElementById('edit-post-id');

// Public Blog Elements
const openAuthModalBtn = document.getElementById('open-auth-modal');
const closeAuthModalBtn = document.getElementById('close-auth-modal');
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authStatusEl = document.getElementById('auth-status');
const registerBtn = document.getElementById('register-btn');

// Newsletter Elements
const newsletterForm = document.getElementById('newsletter-form');
const newsletterEmail = document.getElementById('newsletter-email');
const newsletterStatus = document.getElementById('newsletter-status');

initializeThemeToggle();
bindEvents();
void bootstrap();

async function bootstrap() {
  if (state.token) {
    await fetchCurrentUser();
  }

  // If on the dashboard page, load admin data
  if (createForm || editForm) {
    if (!state.user?.isAdmin) {
      setStatus('Login with an admin account to manage posts.', true);
      return;
    }
    await loadAdminPosts();
  }
}

function bindEvents() {
  // --- PUBLIC BLOG MODAL & AUTH ---
  openAuthModalBtn?.addEventListener('click', () => {
    authModal?.classList.remove('hidden');
  });

  closeAuthModalBtn?.addEventListener('click', () => {
    authModal?.classList.add('hidden');
  });

  // Public Login
  authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('auth-username')?.value;
    const password = document.getElementById('auth-password')?.value;
    void login(username, password, false);
  });

  // Public Registration
  registerBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    void registerPublic();
  });

  // Newsletter Subscription
  newsletterForm?.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevents the page from refreshing
    void subscribeNewsletter();
  });

  // --- DASHBOARD AUTH & ACTIONS ---
  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('dashboard-username')?.value;
    const password = document.getElementById('dashboard-password')?.value;
    void login(username, password, true);
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

// Unified Login Function
async function login(username, password, isDashboard) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');

  if (!username || !password) {
    setStatus('Username and password are required.', isDashboard);
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

    if (isDashboard) {
      if (!state.user.isAdmin) {
        setStatus('This account is not an admin.', true);
        return;
      }
      setStatus(`Logged in as @${state.user.username}.`, true);
      await loadAdminPosts();
    } else {
      // Success on public blog
      setStatus(`Welcome back, @${state.user.username}!`, false);
      setTimeout(() => authModal?.classList.add('hidden'), 1500);
      
      // If they are an admin, reveal the hidden dashboard link in the modal
      if (state.user.isAdmin) {
        document.getElementById('author-dashboard-link-wrap')?.classList.remove('hidden');
      }
    }
  } catch (error) {
    setStatus(error.message || 'Login failed.', isDashboard);
  }
}

// Public Registration Function
async function registerPublic() {
  const username = String(document.getElementById('auth-username')?.value || '').trim().toLowerCase();
  const email = String(document.getElementById('auth-email')?.value || '').trim();
  const password = String(document.getElementById('auth-password')?.value || '');

  if (!username || !email || !password) {
    setStatus('Username, email, and password are required.', false);
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    // Auto-login after successful registration
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(BLOG_AUTH_STORAGE_KEY, data.token);
    
    setStatus(`Account created! Welcome, @${state.user.username}.`, false);
    setTimeout(() => authModal?.classList.add('hidden'), 2000);
  } catch (error) {
    setStatus(error.message || 'Registration failed.', false);
  }
}

async function fetchCurrentUser() {
  try {
    const data = await fetchJson('/api/blog/auth/me', {
      headers: authHeaders()
    });
    state.user = data.user;
    
    // Reveal dashboard link on public blog if admin is already logged in
    if (state.user?.isAdmin) {
       document.getElementById('author-dashboard-link-wrap')?.classList.remove('hidden');
    }
  } catch {
    state.user = null;
    state.token = '';
    localStorage.removeItem(BLOG_AUTH_STORAGE_KEY);
  }
}

// --- NEWSLETTER FUNCTION ---
async function subscribeNewsletter() {
  const email = String(newsletterEmail?.value || '').trim();

  if (!email) {
    if (newsletterStatus) newsletterStatus.textContent = 'Please enter an email address.';
    return;
  }

  if (newsletterStatus) newsletterStatus.textContent = 'Subscribing...';

  try {
    const data = await fetchJson('/api/blog/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (newsletterStatus) newsletterStatus.textContent = data.message || 'Subscribed successfully!';
    newsletterForm?.reset(); // Clear the input field
  } catch (error) {
    if (newsletterStatus) newsletterStatus.textContent = error.message || 'Failed to subscribe.';
  }
}

// --- ADMIN API FUNCTIONS ---
async function loadAdminPosts() {
  try {
    const data = await fetchJson('/api/blog/admin/posts', {
      headers: authHeaders()
    });
    state.posts = Array.isArray(data.posts) ? data.posts : [];
    hydratePostPicker();
    syncEditForm();
    setStatus(`Loaded ${state.posts.length} posts.`, true);
  } catch (error) {
    setStatus(error.message || 'Could not load admin posts.', true);
  }
}

function hydratePostPicker() {
  if (!postPicker) return;
  postPicker.innerHTML = '';
  state.posts.forEach((post) => {
    const option = document.createElement('option');
    option.value = post.id;
    option.textContent = `${post.title} (${post.category})`;
    postPicker.append(option);
  });
}

function syncEditForm() {
  if (!postPicker || !editForm) return;
  const selectedId = postPicker.value;
  const post = state.posts.find((entry) => entry.id === selectedId);
  if (!post) return;

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
  if (!state.user?.isAdmin) return setStatus('Admin login required.', true);
  const payload = collectPostPayload(createForm);
  try {
    await fetchJson('/api/blog/admin/posts', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    createForm.reset();
    await loadAdminPosts();
    setStatus('Post created.', true);
  } catch (error) {
    setStatus(error.message || 'Failed to create post.', true);
  }
}

async function savePost() {
  if (!state.user?.isAdmin) return setStatus('Admin login required.', true);
  const postId = postPicker?.value;
  if (!postId) return setStatus('Select a post to edit.', true);
  
  const payload = collectPostPayload(editForm);
  try {
    await fetchJson(`/api/blog/admin/posts/${encodeURIComponent(postId)}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadAdminPosts();
    setStatus('Post updated.', true);
  } catch (error) {
    setStatus(error.message || 'Failed to update post.', true);
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

// --- UTILITIES ---
function setStatus(message, isDashboard) {
  if (isDashboard && dashboardStatusEl) {
    dashboardStatusEl.textContent = message;
  } else if (!isDashboard && authStatusEl) {
    authStatusEl.textContent = message;
  }
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
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
  if (!configured) return '';
  return configured.endsWith('/') ? configured.slice(0, -1) : configured;
}

function toBlogApiUrl(url) {
  if (!BLOG_API_BASE || !String(url).startsWith('/')) return url;
  return `${BLOG_API_BASE}${url}`;
}

function initializeThemeToggle() {
  const body = document.body;
  const toggle = document.getElementById('theme-toggle');
  if (localStorage.getItem('theme') === 'dark') applyDark();

  toggle?.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
      body.classList.replace('dark-mode', 'light-mode');
      localStorage.setItem('theme', 'light');
      document.querySelector('.light-icon')?.classList.remove('hidden');
      document.querySelector('.dark-icon')?.classList.add('hidden');
    } else {
      applyDark();
    }
  });

  function applyDark() {
    body.classList.replace('light-mode', 'dark-mode');
    localStorage.setItem('theme', 'dark');
    document.querySelector('.light-icon')?.classList.add('hidden');
    document.querySelector('.dark-icon')?.classList.remove('hidden');
  }
}