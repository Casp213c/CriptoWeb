const express = require('express');
const Stripe = require('stripe');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.full_name, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/?premium=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?premium=cancelled`,
      metadata: { userId: String(user.id) },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Não foi possível iniciar o pagamento.' });
  }
});

router.post('/create-portal-session', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user || !user.stripe_customer_id) return res.status(400).json({ error: 'Nenhuma assinatura encontrada.' });

  try {
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${process.env.FRONTEND_URL}/` });
    res.json({ portalUrl: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    res.status(500).json({ error: 'Não foi possível abrir o portal de gerenciamento.' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      if (userId) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const premiumUntil = new Date(subscription.current_period_end * 1000).toISOString();
        db.prepare(`UPDATE users SET plan = 'premium', stripe_subscription_id = ?, premium_since = datetime('now'), premium_until = ? WHERE id = ?`)
          .run(subscription.id, premiumUntil, userId);
        console.log(`✅ Usuário ${userId} agora é premium até ${premiumUntil}`);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const user = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(invoice.customer);
      if (user && invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const premiumUntil = new Date(subscription.current_period_end * 1000).toISOString();
        db.prepare(`UPDATE users SET plan = 'premium', premium_until = ? WHERE id = ?`).run(premiumUntil, user.id);
      }
      break;
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const user = db.prepare('SELECT * FROM users WHERE stripe_subscription_id = ?').get(subscription.id);
      if (user && (subscription.status === 'canceled' || subscription.status === 'unpaid')) {
        db.prepare(`UPDATE users SET plan = 'free' WHERE id = ?`).run(user.id);
      }
      break;
    }
  }
  res.json({ received: true });
});

module.exports = router;
