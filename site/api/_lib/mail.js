/**
 * Envio de e-mail pelo Resend (https://resend.com), só com fetch.
 * Configure RESEND_API_KEY e MAIL_FROM nas variáveis de ambiente.
 * Sem isso, mailConfigured() devolve false e o site avisa em vez de fingir.
 */
export function mailConfigured() { return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM); }

export async function enviarEmail({ para, assunto, html }) {
  if (!mailConfigured()) throw new Error('envio de e-mail não configurado');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [para], subject: assunto, html })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d && d.message) || 'falha ao enviar e-mail');
  return d;
}

/** Modelo do código de autorização de novo dispositivo. */
export function emailCodigoDispositivo({ codigo, ip, quando }) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#0d1330;padding:32px;color:#fff">
    <div style="max-width:520px;margin:0 auto;background:#111a3d;border:1px solid #1e2a5a;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:22px;color:#fff">Novo acesso à sua conta Pokeworld</h1>
      <p style="margin:0 0 24px;color:#b9c2e0;font-size:14px;line-height:1.5">
        Alguém tentou entrar na sua conta a partir de um computador que ainda não conhecemos.
        Se foi você, use o código abaixo para autorizar este aparelho.
      </p>
      <div style="background:#0a0f2b;border:1px solid #243163;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#fcd05c">${codigo}</div>
        <div style="font-size:12px;color:#8b95bb;margin-top:8px">O código vale por 15 minutos</div>
      </div>
      <p style="margin:0;color:#8b95bb;font-size:12px;line-height:1.5">
        Tentativa em ${quando}${ip ? ` · IP ${ip}` : ''}.<br>
        Se não foi você, ignore este e-mail e troque sua senha em Segurança.
      </p>
    </div>
  </div>`;
}

/** Modelo do código para redefinir a senha esquecida. */
export function emailCodigoSenha({ codigo, ip, quando }) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#0d1330;padding:32px;color:#fff">
    <div style="max-width:520px;margin:0 auto;background:#111a3d;border:1px solid #1e2a5a;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:22px;color:#fff">Redefinir sua senha Pokeworld</h1>
      <p style="margin:0 0 24px;color:#b9c2e0;font-size:14px;line-height:1.5">
        Recebemos um pedido para trocar a senha da sua conta. Use o código abaixo
        na página de recuperação para escolher uma senha nova.
      </p>
      <div style="background:#0a0f2b;border:1px solid #243163;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#fcd05c">${codigo}</div>
        <div style="font-size:12px;color:#8b95bb;margin-top:8px">O código vale por 15 minutos</div>
      </div>
      <p style="margin:0;color:#8b95bb;font-size:12px;line-height:1.5">
        Pedido feito em ${quando}${ip ? ` · IP ${ip}` : ''}.<br>
        Se não foi você, ignore este e-mail: sua senha continua a mesma.
      </p>
    </div>
  </div>`;
}
