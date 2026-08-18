const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ══════════════════════════════════════════════
// Envia o email de recuperação de senha com o link único
// ══════════════════════════════════════════════
async function sendPasswordResetEmail(toEmail, userName, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/?resetToken=${resetToken}`;

  if (!resend) {
    // Sem Resend configurado ainda — loga no console para não travar o fluxo em dev/teste
    console.log('⚠️  RESEND_API_KEY não configurado. Link de reset (copie e teste manualmente):');
    console.log(resetUrl);
    return { simulated: true, resetUrl };
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'CryptoTerminal <onboarding@resend.dev>',
      to: toEmail,
      subject: 'Redefinir sua senha — CryptoTerminal',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#07101f;color:#c8d8e8;border-radius:12px">
          <h2 style="color:#00e5a0;margin-bottom:4px">◈ CryptoTerminal</h2>
          <p style="color:#94a3b8;font-size:14px">Olá, ${userName || 'usuário'}!</p>
          <p style="font-size:14px;line-height:1.6">
            Recebemos uma solicitação para redefinir a senha da sua conta.
            Se foi você, clique no botão abaixo. O link expira em <strong>1 hora</strong>.
          </p>
          <div style="text-align:center;margin:28px 0">
            <a href="${resetUrl}" style="background:#00e5a0;color:#000;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;display:inline-block">
              Redefinir minha senha
            </a>
          </div>
          <p style="font-size:12px;color:#475569;line-height:1.6">
            Se você não solicitou isso, pode ignorar este email com segurança — sua senha atual continua válida.
          </p>
          <p style="font-size:11px;color:#334155;margin-top:20px">
            Se o botão não funcionar, copie e cole este link no navegador:<br/>
            <span style="word-break:break-all">${resetUrl}</span>
          </p>
        </div>
      `,
    });
    return { simulated: false };
  } catch (err) {
    console.error('Erro ao enviar email via Resend:', err.message);
    throw err;
  }
}

module.exports = { sendPasswordResetEmail };
