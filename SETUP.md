# 🚀 CryptoTerminal Backend — Guia de Configuração

Backend responsável por: cadastro/login de usuários, contador de análises gratuitas (3),
assinatura Premium via Stripe (R$49,90/mês) e conformidade básica com a LGPD.

---

## 📋 O que este backend faz

- **Cadastro de usuário** com nome completo, ano de nascimento (valida 18+), telefone, CEP e email
- **Login seguro** com senha criptografada (bcrypt) e token JWT
- **Contador de análises**: usuários free têm direito a 3 análises de IA; depois disso, é bloqueado até assinar Premium
- **Assinatura Stripe**: cobra R$49,90/mês recorrente, libera análises ilimitadas automaticamente
- **Exclusão de conta (LGPD)**: endpoint para o usuário apagar todos os seus dados permanentemente

---

## 🛠️ Passo 1 — Criar conta no Stripe

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com) e crie uma conta (gratuito)
2. No menu lateral, vá em **Developers → API keys** e copie a **Secret key** (começa com `sk_test_` no modo teste)
3. Vá em **Product catalog → Add product**:
   - Nome: `CryptoTerminal Premium`
   - Preço: `R$ 49,90` — marque **Recurring** → **Monthly**
   - Salve e copie o **Price ID** (começa com `price_`)
4. Ainda não configure o Webhook — isso é feito depois do deploy (passo 4)

---

## 🛠️ Passo 2 — Subir no Railway (recomendado, tem plano grátis)

1. Acesse [railway.app](https://railway.app) e crie conta (pode usar GitHub)
2. Clique **New Project → Deploy from GitHub repo** (ou **Empty Project** e depois arraste os arquivos)
   - Se não tiver GitHub configurado ainda, pode usar **Railway CLI**: rode `npm install -g @railway/cli` no seu computador, depois `railway login` e `railway up` dentro da pasta do backend
3. Após o primeiro deploy, vá em **Variables** e adicione todas as variáveis do arquivo `.env.example`:

```
JWT_SECRET=            (gere uma string aleatória grande)
STRIPE_SECRET_KEY=     (a sk_test_... do Stripe)
STRIPE_WEBHOOK_SECRET= (vem no passo 4)
STRIPE_PRICE_ID=       (o price_... do Stripe)
FRONTEND_URL=          (seu link do Netlify, ex: https://cripto.netlify.app)
FREE_ANALYSIS_LIMIT=3
```

4. O Railway vai gerar uma URL pública tipo `https://cryptoterminal-backend-production.up.railway.app` — **copie essa URL**, você vai precisar dela no PWA.

---

## 🛠️ Passo 3 — Alternativa: Render (também gratuito)

1. Acesse [render.com](https://render.com) → **New → Web Service**
2. Conecte seu repositório ou faça upload manual
3. Configure:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
4. Adicione as mesmas variáveis de ambiente do passo acima em **Environment**

---

## 🛠️ Passo 4 — Configurar o Webhook do Stripe (depois do deploy)

Isso é essencial para o sistema saber quando alguém pagou.

1. Volte ao [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → Webhooks → Add endpoint**
2. URL do endpoint: `https://SEU-BACKEND-URL/billing/webhook`
3. Selecione os eventos:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copie o **Signing secret** (começa com `whsec_`) e cole na variável `STRIPE_WEBHOOK_SECRET` no Railway/Render

---

## 🔌 Passo 5 — Conectar o PWA ao backend

No arquivo `index.html` do seu PWA, será necessário adicionar a URL do backend
(vou te enviar a versão atualizada do PWA já preparada para isso — é só trocar
uma constante `API_URL` no topo do script pela URL do Railway/Render).

---

## 📡 Endpoints disponíveis

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cadastro (nome, nascimento, telefone, CEP, email, senha) |
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Dados do usuário logado |
| PUT | `/auth/me` | Atualizar nome/telefone/CEP |
| DELETE | `/auth/me` | Excluir conta e dados (LGPD) |
| GET | `/analysis/status` | Quantas análises restam |
| POST | `/analysis/consume` | Consome 1 análise (bloqueia se limite atingido) |
| POST | `/billing/create-checkout-session` | Gera link de pagamento Stripe |
| POST | `/billing/create-portal-session` | Gera link para cancelar/gerenciar assinatura |
| POST | `/billing/webhook` | Recebe eventos do Stripe (uso interno) |

---

## ✅ Testando localmente antes de subir

```bash
cd cryptobackend
npm install
cp .env.example .env
# edite o .env com suas chaves de teste do Stripe
npm start
```

Teste com curl:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"João Silva","birthYear":1990,"phone":"11987654321","postalCode":"01310-100","email":"joao@teste.com","password":"senha12345","acceptedTerms":true}'
```

---

## ⚠️ Importante — LGPD

Este backend já implementa os requisitos técnicos básicos (senha com hash, exclusão de dados,
endpoint de resumo de privacidade), mas você **ainda precisa**:

1. Publicar uma **Política de Privacidade** completa e um **Termos de Uso** (posso redigir um rascunho se quiser)
2. Definir um email de contato para o titular dos dados exercer seus direitos
3. Se for cobrar de muitos usuários, considerar registro como controlador de dados

