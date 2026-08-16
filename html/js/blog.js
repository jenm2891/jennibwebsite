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

// Blog Post Elements
const blogSectionsEl = document.getElementById('blog-sections');

initializeThemeToggle();
bindEvents();
void bootstrap();

async function bootstrap() {
  if (state.token) {
    await fetchCurrentUser();
  }
  
  // Fetch and display posts when the page loads
  await fetchPublicPosts();
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
    
    // Refresh posts to show correct "like" status for the logged-in user
    await fetchPublicPosts();
    
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

// --- PUBLIC POSTS RENDERING ---
async function fetchPublicPosts() {
  try {
    const data = await fetchJson('/api/blog/posts', {
      headers: authHeaders() // Sends token if logged in (so they can see what they've liked)
    });
    
    renderPosts(data.sections || [], data.posts || []);
  } catch (error) {
    if (blogSectionsEl) {
      blogSectionsEl.innerHTML = `<p class="text-red-500 opacity-80 text-center">Failed to load posts: ${error.message}</p>`;
    }
  }
}

function renderPosts(sections, posts) {
  if (!blogSectionsEl) return;
  blogSectionsEl.innerHTML = ''; // Clear out any old content

  if (posts.length === 0) {
    blogSectionsEl.innerHTML = '<p class="opacity-70 text-center">No posts yet. Check back soon!</p>';
    return;
  }

  // Group posts by their categories
  sections.forEach(section => {
    const sectionPosts = posts.filter(p => p.category === section);
    
    // If there are no posts in this category, skip it
    if (sectionPosts.length === 0) return; 

    const sectionWrapper = document.createElement('div');
    sectionWrapper.className = 'blog-category-section mb-10';

    // Capitalize the section title (e.g. "videos" -> "Videos")
    const sectionTitle = document.createElement('h2');
    sectionTitle.className = 'font-display text-3xl mb-4 capitalize';
    sectionTitle.textContent = section;
    sectionWrapper.appendChild(sectionTitle);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6';

    // Build a card for each post
    sectionPosts.forEach(post => {
      const article = document.createElement('article');
      article.className = 'blog-surface rounded-2xl p-5 border border-current/10 shadow-sm transition hover:shadow-md flex flex-col';
      
      let mediaHtml = '';
      if (post.type === 'vlog' && post.videoUrl) {
         mediaHtml = `<div class="aspect-video mb-4 bg-black/5 rounded-xl overflow-hidden"><iframe src="${post.videoUrl}" class="w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
      }

      const dateStr = new Date(post.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

      // Build the card HTML
      article.innerHTML = `
        ${mediaHtml}
        <div class="flex items-center gap-2 mb-2 text-xs opacity-70">
          <span>${dateStr}</span>
          <span>&bull;</span>
          <span class="capitalize px-2 py-0.5 rounded-full border border-current/20">${post.type}</span>
        </div>
        <h3 class="font-display text-xl font-bold mb-2">${escapeHtml(post.title)}</h3>
        <p class="text-sm opacity-85 mb-4">${escapeHtml(post.summary)}</p>
        <div class="flex items-center gap-4 text-sm font-medium mt-auto border-t border-current/10 pt-3">
          <span class="flex items-center gap-1 ${post.likedByCurrentUser ? 'text-pink-500' : 'opacity-70'}"><i data-lucide="heart" class="w-4 h-4"></i> ${post.likes}</span>
          <span class="flex items-center gap-1 opacity-70"><i data-lucide="message-circle" class="w-4 h-4"></i> ${post.comments?.length || 0}</span>
        </div>
      `;
      grid.appendChild(article);
    });

    sectionWrapper.appendChild(grid);
    blogSectionsEl.appendChild(sectionWrapper);
  });

  // Tell Lucide to draw the heart/message icons we just generated
  window.lucide?.createIcons();
}

// A helper to make sure any text from the database is safe to display
function escapeHtml(str) {
   return String(str || '').replace(/[&<>'"]/g, 
     tag => ({
       '&': '&amp;',
       '<': '&lt;',
       '>': '&gt;',
       "'": '&#39;',
       '"': '&quot;'
     }[tag])
   );
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