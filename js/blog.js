window.lucide?.createIcons();

const BLOG_AUTH_STORAGE_KEY = 'jennib_blog_auth_token_v1';
const BLOG_API_BASE = resolveBlogApiBase();
const state = {
  token: localStorage.getItem(BLOG_AUTH_STORAGE_KEY) || '',
  user: null
};

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
}

function bindEvents() {
  // --- PUBLIC BLOG MODAL & AUTH ---
  openAuthModalBtn?.addEventListener('click', () => {
    authModal?.classList.remove('hidden');
  });

  closeAuthModalBtn?.addEventListener('click', () => {
    authModal?.classList.add('hidden');
  });

  authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('auth-username')?.value;
    const password = document.getElementById('auth-password')?.value;
    void login(username, password);
  });

  registerBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    void registerPublic();
  });

  // Newsletter Subscription
  newsletterForm?.addEventListener('submit', (event) => {
    event.preventDefault(); 
    void subscribeNewsletter();
  });
}

// --- PUBLIC AUTH FUNCTIONS ---
async function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');

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

    setStatus(`Welcome back, @${state.user.username}!`);
    setTimeout(() => authModal?.classList.add('hidden'), 1500);
      
    if (state.user.isAdmin) {
      document.getElementById('author-dashboard-link-wrap')?.classList.remove('hidden');
    }
    
  } catch (error) {
    setStatus(error.message || 'Login failed.');
  }
}

async function registerPublic() {
  const username = String(document.getElementById('auth-username')?.value || '').trim().toLowerCase();
  const email = String(document.getElementById('auth-email')?.value || '').trim();
  const password = String(document.getElementById('auth-password')?.value || '');

  if (!username || !email || !password) {
    setStatus('Username, email, and password are required.');
    return;
  }

  try {
    const data = await fetchJson('/api/blog/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(BLOG_AUTH_STORAGE_KEY, data.token);
    
    setStatus(`Account created! Welcome, @${state.user.username}.`);
    setTimeout(() => authModal?.classList.add('hidden'), 2000);
  } catch (error) {
    setStatus(error.message || 'Registration failed.');
  }
}

async function fetchCurrentUser() {
  try {
    const data = await fetchJson('/api/blog/auth/me', {
      headers: authHeaders()
    });
    state.user = data.user;
    
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
    newsletterForm?.reset(); 
  } catch (error) {
    if (newsletterStatus) newsletterStatus.textContent = error.message || 'Failed to subscribe.';
  }
}

// --- UTILITIES ---
function setStatus(message) {
  if (authStatusEl) {
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
  
  if (toggle) {
    if (localStorage.getItem('theme') === 'dark') applyDark();

    toggle.addEventListener('click', () => {
      if (body.classList.contains('dark-mode')) {
        body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('theme', 'light');
        document.querySelector('.light-icon')?.classList.remove('hidden');
        document.querySelector('.dark-icon')?.classList.add('hidden');
      } else {
        applyDark();
      }
    });
  }

  function applyDark() {
    body.classList.replace('light-mode', 'dark-mode');
    localStorage.setItem('theme', 'dark');
    document.querySelector('.light-icon')?.classList.add('hidden');
    document.querySelector('.dark-icon')?.classList.remove('hidden');
  }
}