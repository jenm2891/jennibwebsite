const test = require('node:test');
const assert = require('node:assert/strict');

const { getProductCatalog, createCheckoutOrder } = require('../js/server');

test('returns a product catalog with known artwork items', () => {
  const products = getProductCatalog();

  assert.ok(Array.isArray(products));
  assert.ok(products.length >= 3);
  assert.equal(products[0].id, 'product-1');
  assert.ok(products[0].price > 0);
});

test('creates a checkout order with subtotal, shipping, and total', () => {
  const order = createCheckoutOrder({
    customerName: 'Jenni B',
    email: 'hello@example.com',
    shippingAddress: {
      line1: '123 Studio Lane',
      city: 'Austin',
      state: 'TX',
      zip: '78701'
    },
    items: [{ id: 'product-1', quantity: 2 }],
    shippingMethod: 'standard'
  });

  assert.equal(order.status, 'confirmed');
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.subtotal, 960);
  assert.equal(order.shipping, 12);
  assert.equal(order.total, 972);
});
