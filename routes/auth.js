const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidCEP(cep) { return /^\d{5}-?\d{3}$/.test(cep); }
function isValidPhone(phone) { const d = phone.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13; }
function calcAge(birthYear) { return new Date().getFullYear() - birthYear; }

// ══════════════════════════════════════════════
// POST /auth/register
// ══════════════════════════════════════════════
router.post('/register', (req, res) => {
  const { fullName, birthYear, phone, postalCode, email, password, acceptedTerms } = req.body;

  if (!fullName || !birthYear || !phone || !postalCode || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios: nome completo, ano de nascimento, telefone, CEP, email e senha.' });
  }
  if (!acceptedTerms) {
    return res.status(400).json({ error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' });
  }
  if (fullName.trim().length < 3) return res.status(400).json({ error: 'Nome completo inválido.' });

  const birthYearNum = parseInt(birthYear, 10);
  if (isNaN(birthYearNum) || birthYearNum < 1900 || birthYearNum > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Ano de nascimento inválido.' });
  }
  if (calcAge(birthYearNum) < 18) {
    return res.status(403).json({ error: 'Cadastro permitido apenas para maiores de 18 anos.' });
  }
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Telefone inválido. Use o formato (DDD) 9XXXX-XXXX.' });
  if (!isValidCEP(postalCode)) return res.status(400).json({ error: 'CEP inválido. Use o formato 00000-000.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido.' });
  if (password.length < 8) return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Este email já está cadastrado. Faça login.' });

  const passwordHash = bcrypt.hashSync(password, 12);
  const stmt = db.prepare(`
    INSERT INTO users (full_name, birth_year, phone, postal_code, email, password_hash, plan, role, accepted_terms_at)
    VALUES (?, ?, ?, ?, ?, ?, 'free', 'user', datetime('now'))
  `);
  const result = stmt.run(fullName.trim(), birthYearNum, phone.trim(), postalCode.trim(), email.toLowerCase().trim(), passwordHash);

  const token = jwt.sign({ userId: result.lastInsertRowid }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({
    message: 'Cadastro realizado com sucesso!',
    token,
    user: {
      id: result.lastInsertRowid, fullName: fullName.trim(), email: email.toLowerCase().trim(),
      role: 'user', plan: 'free', analysesUsed: 0, analysesLimit: parseInt(process.env.FREE_ANALYSIS_LIMIT || '3', 10),
    },
  });
});

// ══════════════════════════════════════════════
// POST /auth/login
// ══════════════════════════════════════════════
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos.' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos.' });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    message: 'Login realizado com sucesso!',
    token,
    user: {
      id: user.id, fullName: user.full_name, email: user.email, role: user.role,
      plan: user.plan, analysesUsed: user.analyses_used, analysesLimit: parseInt(process.env.FREE_ANALYSIS_LIMIT || '3', 10),
    },
  });
});

// ══════════════════════════════════════════════
// GET /auth/me
// ══════════════════════════════════════════════
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  res.json({
    id: user.id, fullName: user.full_name, email: user.email, phone: user.phone,
    postalCode: user.postal_code, role: user.role, plan: user.plan,
    analysesUsed: user.analyses_used, analysesLimit: parseInt(process.env.FREE_ANALYSIS_LIMIT || '3', 10),
    premiumUntil: user.premium_until,
  });
});

// ══════════════════════════════════════════════
// PUT /auth/me
// ══════════════════════════════════════════════
router.put('/me', requireAuth, (req, res) => {
  const { fullName, phone, postalCode } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'Telefone inválido.' });
  if (postalCode && !isValidCEP(postalCode)) return res.status(400).json({ error: 'CEP inválido.' });

  db.prepare(`UPDATE users SET full_name = ?, phone = ?, postal_code = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(fullName?.trim() || user.full_name, phone?.trim() || user.phone, postalCode?.trim() || user.postal_code, req.userId);

  res.json({ message: 'Dados atualizados com sucesso.' });
});

// ══════════════════════════════════════════════
// PUT /auth/change-password — usuário logado troca a própria senha
// ══════════════════════════════════════════════
router.put('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, req.userId);
  res.json({ message: 'Senha alterada com sucesso.' });
});

// ══════════════════════════════════════════════
// POST /auth/forgot-password — fluxo normal para QUALQUER usuário
// Gera um token de uso único válido por 1 hora e envia por email.
// Sempre responde com sucesso genérico, mesmo se o email não existir,
// para não revelar quais emails estão cadastrados (boa prática de segurança).
// ══════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Informe um email válido.' });
  }

  const genericResponse = { message: 'Se este email estiver cadastrado, você receberá um link de recuperação em instantes.' };

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    // Não revela se o email existe ou não
    return res.json(genericResponse);
  }

  // Gera token aleatório seguro e salva com expiração de 1 hora
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hora

  db.prepare(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`).run(user.id, token, expiresAt);

  try {
    const result = await sendPasswordResetEmail(user.email, user.full_name, token);
    // Em ambiente de teste sem Resend configurado, devolve o link direto na resposta
    // para você conseguir testar sem precisar configurar email ainda.
    if (result?.simulated) {
      return res.json({ ...genericResponse, devResetUrl: result.resetUrl, note: 'RESEND_API_KEY não configurado — link retornado apenas para teste.' });
    }
  } catch {
    // Mesmo se o envio falhar, não expõe erro técnico ao usuário final
  }

  res.json(genericResponse);
});

// ══════════════════════════════════════════════
// POST /auth/reset-with-token — usuário define a nova senha usando o token do email
// ══════════════════════════════════════════════
router.post('/reset-with-token', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });

  const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);
  if (!record) return res.status(400).json({ error: 'Link inválido ou já utilizado.' });
  if (record.used_at) return res.status(400).json({ error: 'Este link já foi utilizado. Solicite um novo.' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Este link expirou. Solicite um novo em "Esqueci minha senha".' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(record.user_id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, user.id);
  db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(record.id);
  db.prepare(`INSERT INTO password_resets (email, method) VALUES (?, 'email_token')`).run(user.email);

  res.json({ message: 'Senha redefinida com sucesso! Você já pode fazer login.' });
});

// ══════════════════════════════════════════════
// POST /auth/reset-password — recuperação de EMERGÊNCIA via chave secreta (uso admin/dev)
// ══════════════════════════════════════════════
router.post('/reset-password', (req, res) => {
  const { email, newPassword, secretKey } = req.body;

  if (!secretKey || secretKey !== process.env.RESET_SECRET_KEY) {
    return res.status(403).json({ error: 'Chave secreta inválida.' });
  }
  if (!email || !newPassword) return res.status(400).json({ error: 'Informe email e nova senha.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Nenhuma conta encontrada com este email.' });

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, user.id);
  db.prepare(`INSERT INTO password_resets (email, method) VALUES (?, 'secret_key_endpoint')`).run(user.email);

  res.json({ message: `Senha redefinida com sucesso para ${user.email}. Já pode fazer login com a nova senha.` });
});

// ══════════════════════════════════════════════
// DELETE /auth/me — LGPD
// ══════════════════════════════════════════════
router.delete('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  db.prepare('INSERT INTO deletion_requests (email, completed_at) VALUES (?, datetime(\'now\'))').run(user.email);
  db.prepare('DELETE FROM analysis_log WHERE user_id = ?').run(req.userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

  res.json({ message: 'Sua conta e todos os dados pessoais foram excluídos permanentemente.' });
});

module.exports = router;
