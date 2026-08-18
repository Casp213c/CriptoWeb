require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const billingRoutes = require('./routes/billing');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

// Limite mais rígido específico para "esqueci minha senha" — evita spam de emails
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas solicitações de recuperação. Aguarde 15 minutos e tente novamente.' },
});

// Webhook do Stripe precisa vir ANTES do express.json()
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/billing', billingRoutes);

app.use(express.json());

app.use('/auth/forgot-password', forgotPasswordLimiter);
app.use('/auth', authLimiter, authRoutes);
app.use('/analysis', analysisRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'CryptoTerminal Backend', time: new Date().toISOString() });
});
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.get('/legal/privacy-summary', (req, res) => {
  res.json({
    dataCollected: ['nome completo', 'ano de nascimento', 'telefone', 'CEP', 'email'],
    purpose: 'Autenticação, controle de plano (free/premium) e comunicação sobre a conta.',
    retention: 'Enquanto a conta estiver ativa. Excluídos permanentemente mediante solicitação (DELETE /auth/me).',
    thirdParties: ['Stripe (processamento de pagamento)'],
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CryptoTerminal Backend rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`👑 Admin: ${process.env.ADMIN_EMAIL || '(não configurado)'}`);
});
