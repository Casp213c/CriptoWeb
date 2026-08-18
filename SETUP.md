# 🚀 CryptoTerminal Backend — Guia de Configuração (v1.1 — com Admin)

## 🆕 Novidades desta versão

- **Conta ADMIN geral criada automaticamente** no primeiro start, usando as variáveis
  `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`
- **Painel de administração** (`/admin/*`) — veja todos os usuários, dê premium de cortesia,
  resete senhas, veja estatísticas de faturamento estimado
- **Recuperação de senha** — dois métodos:
  1. `/auth/reset-password` — você mesmo reseta via chave secreta (`RESET_SECRET_KEY`), sem precisar de admin logado
  2. `/admin/users/:id/reset-password` — reset através do painel admin (requer login como admin)

---

## 🔓 Recuperação de senha — QUALQUER usuário (fluxo normal via email)

Esta é a solução definitiva para todos os usuários, não só você. Funciona assim:

1. Usuário clica em **"Esqueci minha senha"** na tela de login do app
2. Informa o email → backend gera um **token único válido por 1 hora** e envia por email (via Resend)
3. Usuário clica no link do email → abre o app automaticamente na tela de **"Redefinir senha"**
4. Define a nova senha → pronto, já pode fazer login

### Configurar o envio de email (Resend — gratuito até 3.000 emails/mês)

1. Crie uma conta em [resend.com](https://resend.com)
2. Vá em **API Keys** → **Create API Key** → copie a chave (começa com `re_`)
3. No Railway, adicione as variáveis:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=CryptoTerminal <onboarding@resend.dev>
   ```
   O endereço `onboarding@resend.dev` já funciona sem configurar domínio — é o domínio de teste do Resend, ótimo para começar. Depois, se quiser um remetente com sua marca (`naoresponda@seudominio.com`), basta verificar seu domínio no painel do Resend e trocar o `EMAIL_FROM`.

### ⚠️ Se você ainda NÃO configurou o Resend

O sistema **não trava** — ele detecta que o `RESEND_API_KEY` não está configurado e, em vez de enviar
email, devolve o link de reset diretamente na resposta da API (só em modo desenvolvimento/teste).
O app mostra esse link num alerta na tela para você testar o fluxo completo sem precisar configurar
email ainda. Assim que colocar a `RESEND_API_KEY`, o envio de verdade passa a funcionar automaticamente.

---

## 🔑 Sua conta administrador

Já vem pré-configurada no `.env.example`:

```
ADMIN_EMAIL=cezar282010@hotmail.com
ADMIN_PASSWORD=Qwerty123
```

⚠️ **IMPORTANTE:** Assim que fizer o primeiro login, troque essa senha por uma mais forte,
usando `PUT /auth/change-password` ou o botão de trocar senha no app (quando implementado na UI).

O admin tem automaticamente:
- Análises **ilimitadas** (não conta como "premium" pago, é um bypass direto)
- Acesso a `/admin/*` para gerenciar todos os usuários

---

## 🛠️ Deploy no Railway — passo a passo

1. No Railway, confirme que o projeto já está conectado ao GitHub (você mencionou que já fez isso)
2. Vá em **Variables** e adicione TODAS estas:

```
JWT_SECRET=              (string aleatória grande — peça pra mim gerar se quiser)
RESET_SECRET_KEY=        (outra string aleatória grande, diferente da anterior)
STRIPE_SECRET_KEY=       sk_test_...
STRIPE_WEBHOOK_SECRET=   whsec_...
STRIPE_PRICE_ID=         price_...
FRONTEND_URL=            https://cripto.netlify.app
FREE_ANALYSIS_LIMIT=3
ADMIN_EMAIL=cezar282010@hotmail.com
ADMIN_PASSWORD=Qwerty123
ADMIN_NAME=Cezar (Admin Geral)
```

3. Salve — o Railway faz redeploy automático
4. Nos **logs** do Railway, procure por uma linha assim, confirmando que sua conta foi criada:
   ```
   ✅ Conta ADMIN criada: cezar282010@hotmail.com
   👑 Admin: cezar282010@hotmail.com
   ```

---

## 🔐 Como usar a recuperação de senha (endpoint de emergência)

Se esquecer a senha de qualquer conta (inclusive a admin), rode isto (substitua a URL e valores):

```bash
curl -X POST https://SEU-BACKEND.up.railway.app/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cezar282010@hotmail.com",
    "newPassword": "SuaNovaSenhaForte123",
    "secretKey": "O_VALOR_QUE_VOCE_COLOCOU_EM_RESET_SECRET_KEY"
  }'
```

Isso funciona **sem precisar estar logado** — só quem sabe a `RESET_SECRET_KEY` consegue.
Guarde essa chave em local seguro (gerenciador de senhas), pois ela é o "mestre" de recuperação.

---

## 👑 Endpoints do Painel Admin

Todos exigem header `Authorization: Bearer SEU_TOKEN` (do login como admin).

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin/users` | Lista todos os usuários cadastrados |
| GET | `/admin/stats` | Total de usuários, premium, MRR estimado |
| PUT | `/admin/users/:id/plan` | Muda plano manualmente (dar premium de cortesia) |
| PUT | `/admin/users/:id/role` | Promove/rebaixa outro usuário a admin |
| PUT | `/admin/users/:id/reset-password` | Reseta senha de qualquer usuário |
| PUT | `/admin/users/:id/reset-analyses` | Zera contador de análises gratuitas |
| DELETE | `/admin/users/:id` | Exclui uma conta (LGPD) |

**Exemplo — ver todos os usuários:**
```bash
curl https://SEU-BACKEND.up.railway.app/admin/users \
  -H "Authorization: Bearer SEU_TOKEN_DE_ADMIN"
```

---

## 📡 Endpoints gerais (não-admin)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cadastro |
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Dados do usuário logado |
| PUT | `/auth/me` | Atualizar nome/telefone/CEP |
| PUT | `/auth/change-password` | Trocar a própria senha (logado) |
| POST | `/auth/forgot-password` | Solicita link de recuperação por email (qualquer usuário) |
| POST | `/auth/reset-with-token` | Define nova senha usando o token recebido por email |
| POST | `/auth/reset-password` | Reset via chave secreta (uso admin/emergência, sem login) |
| DELETE | `/auth/me` | Excluir conta (LGPD) |
| GET | `/analysis/status` | Quantas análises restam |
| POST | `/analysis/consume` | Consome 1 análise |
| POST | `/billing/create-checkout-session` | Link de pagamento Stripe |
| POST | `/billing/create-portal-session` | Gerenciar/cancelar assinatura |

---

## ✅ Testando localmente

```bash
cd cryptobackend
npm install
cp .env.example .env
npm start
```

Depois, teste o login admin:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cezar282010@hotmail.com","password":"Qwerty123"}'
```
