const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const catalog = [
  { id: 'product-1', name: 'Crimson Reverie', price: 480, description: 'Limited print' },
  { id: 'product-2', name: 'Garden Whispers', price: 320, description: 'Fine art print' },
  { id: 'product-3', name: 'Organic Form No. 7', price: 650, description: 'Original concept art' },
  { id: 'product-4', name: 'Urban Layers', price: 390, description: 'Collector print' },
  { id: 'product-5', name: 'Botanical Dreams', price: 180, description: 'Mini print' },
  { id: 'product-6', name: 'Golden Horizon', price: 540, description: 'Studio print' }
];

function getProductCatalog() {
  return catalog;
}

function createCheckoutOrder(payload) {
  const items = payload.items.map((item) => {
    const product = catalog.find((entry) => entry.id === item.id);
    return {
      id: item.id,
      name: product ? product.name : 'Unknown item',
      quantity: item.quantity || 1,
      price: product ? product.price : 0
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal > 0 ? (payload.shippingMethod === 'express' ? 24 : 12) : 0;
  const total = subtotal + shipping;

  return {
    id: `order-${Date.now()}`,
    status: 'confirmed',
    customerName: payload.customerName,
    email: payload.email,
    shippingAddress: payload.shippingAddress,
    shippingMethod: payload.shippingMethod || 'standard',
    items,
    subtotal,
    shipping,
    total
  };
}

app.get('/api/products', (req, res) => {
  res.json(getProductCatalog());
});

app.post('/api/checkout', (req, res) => {
  const order = createCheckoutOrder(req.body);
  res.json(order);
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Checkout server listening on port ${port}`);
  });
}

module.exports = { app, getProductCatalog, createCheckoutOrder };
