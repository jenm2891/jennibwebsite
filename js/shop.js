 lucide.createIcons();

    const products = {
      'product-1': { name: 'Crimson Reverie', price: 480 },
      'product-2': { name: 'Garden Whispers', price: 320 },
      'product-3': { name: 'Organic Form No. 7', price: 650 },
      'product-4': { name: 'Urban Layers', price: 390 },
      'product-5': { name: 'Botanical Dreams', price: 180 },
      'product-6': { name: 'Golden Horizon', price: 540 }
    };

    let cart = [];

    async function submitCheckout(e) {
      e.preventDefault();
      const checkoutPanel = document.getElementById('checkout-panel');
      const messageEl = document.getElementById('checkout-message');
      const form = document.getElementById('checkout-form');
      const payload = {
        customerName: document.getElementById('customer-name').value,
        email: document.getElementById('customer-email').value,
        shippingAddress: { line1: document.getElementById('shipping-address').value },
        shippingMethod: document.getElementById('shipping-method').value,
        items: cart.map((id) => ({ id, quantity: 1 }))
      };

      if (!payload.items.length) {
        messageEl.textContent = 'Add an item to your cart before checking out.';
        return;
      }

      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const order = await response.json();
        messageEl.textContent = `Thanks ${order.customerName}! Order ${order.id} confirmed for $${order.total}.`;
        form.reset();
        cart = [];
        updateCartUI();
        checkoutPanel.classList.remove('hidden');
      } catch (error) {
        messageEl.textContent = 'Checkout failed. Please try again.';
      }
    }

    function addToCart(id) {
      cart.push(id);
      updateCartUI();
    }

    function removeFromCart(index) {
      cart.splice(index, 1);
      updateCartUI();
    }

    function updateCartUI() {
      const badge = document.getElementById('cart-badge');
      const itemsEl = document.getElementById('cart-items');
      const emptyEl = document.getElementById('cart-empty');
      const footerEl = document.getElementById('cart-footer');
      const totalEl = document.getElementById('cart-total');

      badge.textContent = cart.length;
      badge.classList.toggle('hidden', cart.length === 0);

      if (cart.length === 0) {
        itemsEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        footerEl.classList.add('hidden');
        document.getElementById('checkout-panel').classList.add('hidden');
      } else {
        emptyEl.classList.add('hidden');
        footerEl.classList.remove('hidden');
        document.getElementById('checkout-panel').classList.remove('hidden');
        let total = 0;
        itemsEl.innerHTML = cart.map((id, i) => {
          const p = products[id];
          total += p.price;
          return `<div class="cart-item"><div class="flex flex-col gap-1"><span class="cart-item-name text-sm">${p.name}</span><span class="cart-item-price text-sm">$${p.price}</span></div><button type="button" onclick="removeFromCart(${i})" class="cart-remove-btn" aria-label="Remove item"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
        }).join('');
        totalEl.textContent = '$' + total;
        lucide.createIcons();
      }
    }

    document.getElementById('cart-btn').addEventListener('click', () => {
      document.getElementById('cart-panel').classList.add('open');
      document.getElementById('cart-overlay').classList.add('open');
    });

    document.getElementById('checkout-form').addEventListener('submit', submitCheckout);

    function closeCart() {
      document.getElementById('cart-panel').classList.remove('open');
      document.getElementById('cart-overlay').classList.remove('open');
    }

    // Theme toggle
    const body = document.body;
    const toggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'dark') applyDark();

    toggle.addEventListener('click', () => {
      if (body.classList.contains('dark-mode')) {
        body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('theme', 'light');
        document.querySelector('.light-icon').classList.remove('hidden');
        document.querySelector('.dark-icon').classList.add('hidden');
      } else {
        applyDark();
      }
    });

    function applyDark() {
      body.classList.replace('light-mode', 'dark-mode');
      localStorage.setItem('theme', 'dark');
      document.querySelector('.light-icon').classList.add('hidden');
      document.querySelector('.dark-icon').classList.remove('hidden');
    }