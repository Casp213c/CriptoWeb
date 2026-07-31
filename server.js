require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const billingRoutes = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════
// CORS — libera o domínio do seu PWA
// ══════════════════════════════════════════════
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ══════════════════════════════════════════════
// Rate limiting — protege contra abuso (ex: força bruta no login)
// ══════════════════════════════════════════════
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,                   // 20 tentativas por IP
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

// ══════════════════════════════════════════════
// IMPORTANTE: rota de webhook do Stripe precisa vir ANTES do express.json()
// porque exige o body raw (sem parse) para verificar a assinatura
// ══════════════════════════════════════════════
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/billing', billingRoutes);

// A partir daqui, todas as outras rotas usam JSON normalmente
app.use(express.json());

app.use('/auth', authLimiter, authRoutes);
app.use('/analysis', analysisRoutes);

// ══════════════════════════════════════════════
// Health check — útil para Railway/Render confirmarem que está no ar
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'CryptoTerminal Backend', time: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ══════════════════════════════════════════════
// LGPD — páginas informativas obrigatórias
// ══════════════════════════════════════════════
app.get('/legal/privacy-summary', (req, res) => {
  res.json({
    dataCollected: ['nome completo', 'ano de nascimento', 'telefone', 'CEP', 'email'],
    purpose: 'Autenticação, controle de plano (free/premium) e comunicação sobre a conta.',
    retention: 'Enquanto a conta estiver ativa. Dados excluídos permanentemente mediante solicitação (DELETE /auth/me).',
    thirdParties: ['Stripe (processamento de pagamento)'],
    contact: 'Configure um email de contato de privacidade aqui.',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CryptoTerminal Backend rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
