const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Todas as rotas abaixo exigem estar logado E ser admin
router.use(requireAuth, requireAdmin);

// ══════════════════════════════════════════════
// GET /admin/users — lista todos os usuários cadastrados
// ══════════════════════════════════════════════
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, full_name, email, phone, postal_code, birth_year, role, plan,
           analyses_used, premium_since, premium_until, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ total: users.length, users });
});

// ══════════════════════════════════════════════
// GET /admin/stats — visão geral do negócio
// ══════════════════════════════════════════════
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const premiumUsers = db.prepare(`SELECT COUNT(*) as n FROM users WHERE plan = 'premium'`).get().n;
  const freeUsers = totalUsers - premiumUsers;
  const totalAnalyses = db.prepare('SELECT COUNT(*) as n FROM analysis_log').get().n;
  const last7days = db.prepare(`SELECT COUNT(*) as n FROM users WHERE created_at >= datetime('now', '-7 days')`).get().n;
  const mrr = premiumUsers * 49.90;

  res.json({
    totalUsers, premiumUsers, freeUsers, totalAnalyses, newUsersLast7Days: last7days,
    estimatedMRR: `R$ ${mrr.toFixed(2)}`,
  });
});

// ══════════════════════════════════════════════
// PUT /admin/users/:id/plan — muda o plano manualmente (ex: dar premium de cortesia)
// ══════════════════════════════════════════════
router.put('/users/:id/plan', (req, res) => {
  const { plan, premiumUntil } = req.body; // plan: 'free' | 'premium'
  if (!['free', 'premium'].includes(plan)) return res.status(400).json({ error: "Plano deve ser 'free' ou 'premium'." });

  db.prepare(`UPDATE users SET plan = ?, premium_until = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(plan, premiumUntil || null, req.params.id);

  res.json({ message: `Plano atualizado para ${plan}.` });
});

// ══════════════════════════════════════════════
// PUT /admin/users/:id/role — promove/rebaixa admin
// ══════════════════════════════════════════════
router.put('/users/:id/role', (req, res) => {
  const { role } = req.body; // 'user' | 'admin'
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: "Role deve ser 'user' ou 'admin'." });

  db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(role, req.params.id);
  res.json({ message: `Papel atualizado para ${role}.` });
});

// ══════════════════════════════════════════════
// PUT /admin/users/:id/reset-password — admin reseta a senha de qualquer usuário
// ══════════════════════════════════════════════
router.put('/users/:id/reset-password', (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres.' });

  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, req.params.id);
  db.prepare(`INSERT INTO password_resets (email, method) VALUES (?, 'admin_panel')`).run(user.email);

  res.json({ message: `Senha de ${user.email} redefinida com sucesso.` });
});

// ══════════════════════════════════════════════
// PUT /admin/users/:id/reset-analyses — zera contador de análises gratuitas
// ══════════════════════════════════════════════
router.put('/users/:id/reset-analyses', (req, res) => {
  db.prepare(`UPDATE users SET analyses_used = 0, updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Contador de análises zerado.' });
});

// ══════════════════════════════════════════════
// DELETE /admin/users/:id — admin exclui uma conta
// ══════════════════════════════════════════════
router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  db.prepare('INSERT INTO deletion_requests (email, completed_at) VALUES (?, datetime(\'now\'))').run(user.email);
  db.prepare('DELETE FROM analysis_log WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

  res.json({ message: `Conta ${user.email} excluída.` });
});

module.exports = router;
