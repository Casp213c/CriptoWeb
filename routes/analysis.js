const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FREE_LIMIT = parseInt(process.env.FREE_ANALYSIS_LIMIT || '3', 10);

function isPremiumActive(user) {
  if (user.role === 'admin') return true; // admin sempre tem acesso ilimitado
  if (user.plan !== 'premium') return false;
  if (!user.premium_until) return false;
  return new Date(user.premium_until) > new Date();
}

router.get('/status', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const premium = isPremiumActive(user);
  res.json({
    role: user.role,
    plan: premium ? 'premium' : 'free',
    analysesUsed: user.analyses_used,
    analysesLimit: premium ? null : FREE_LIMIT,
    analysesRemaining: premium ? null : Math.max(0, FREE_LIMIT - user.analyses_used),
    canAnalyze: premium || user.analyses_used < FREE_LIMIT,
  });
});

router.post('/consume', requireAuth, (req, res) => {
  const { type, symbol } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const premium = isPremiumActive(user);

  if (!premium && user.analyses_used >= FREE_LIMIT) {
    return res.status(403).json({
      error: 'Limite de análises gratuitas atingido.',
      upgradeRequired: true,
      analysesUsed: user.analyses_used,
      analysesLimit: FREE_LIMIT,
    });
  }

  db.prepare('INSERT INTO analysis_log (user_id, type, symbol) VALUES (?, ?, ?)').run(req.userId, type || 'unknown', symbol || null);

  if (!premium) {
    db.prepare('UPDATE users SET analyses_used = analyses_used + 1 WHERE id = ?').run(req.userId);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({
    allowed: true,
    role: updated.role,
    plan: premium ? 'premium' : 'free',
    analysesUsed: updated.analyses_used,
    analysesRemaining: premium ? null : Math.max(0, FREE_LIMIT - updated.analyses_used),
  });
});

module.exports = router;
