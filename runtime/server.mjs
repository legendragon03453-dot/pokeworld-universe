import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../site/', import.meta.url));
const routes = new Map([
  ['/api/account', 'account.js'], ['/api/game', 'game.js'],
  ['/api/coupon', 'coupon.js'], ['/api/admin-login', 'admin-login.js'],
  ['/api/checkout', 'pix-checkout.js'], ['/api/stripe-checkout', 'stripe-live-checkout.js'],
  ['/api/webhook/mercadopago', 'webhook/pix-live.js'], ['/api/webhook/stripe', 'webhook/stripe-live.js']
]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.avif': 'image/avif' };
const paymentRoutes = new Set(['/api/checkout', '/api/stripe-checkout', '/api/coupon']);
const redirects = new Map([['/doar','/Donate'],['/doar.html','/Donate'],['/loja','/Donate'],['/loja.html','/Donate'],['/wiki','/'],['/wiki.html','/']]);
function json(res, code, value) {
  res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value));
}
async function body(req, max = 1024 * 1024) {
  if (Number(req.headers['content-length']) > max) throw Object.assign(new Error('body-too-large'), { status: 413 });
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('body-too-large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApp({ gamePixHandler = null, paymentMaintenance = null, root = defaultRoot, apiEnabled = false, paymentsEnabled = false, stripeEnabled = false, stripeWebhookEnabled = false, pixEnabled = false, pixWebhookEnabled = false, emailAuthEnabled = false, accountPreview = false, rankingPreview = false,
  loadHandler = async name => (await import(pathToFileURL(path.join(root, 'api', name)))).default } = {}) {
  const rootPromise = realpath(root);
  let loginWindow = 0, loginAttempts = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
    // Only the local reverse proxy is trusted. It overwrites X-Real-IP.
    const proxy = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const realIp = proxy && isIP(req.headers['x-real-ip'] || '') ? req.headers['x-real-ip'] : req.socket.remoteAddress;
    req.headers['x-forwarded-for'] = realIp || '';
    if (proxy && req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'URL inválida' }); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p.startsWith('.'))) return json(res, 404, { error: 'não encontrado' });
      if (pathname === '/healthz') {
        if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'método não permitido' });
        return json(res, 200, { ok: true, apiEnabled, paymentsEnabled, ...(emailAuthEnabled ? {emailAuthEnabled:true} : {}), ...(accountPreview ? { accountPreview: true } : {}), ...(rankingPreview ? { rankingPreview: true } : {}) });
      }
      const paymentRequest = pathname === '/api/game-pix' || paymentRoutes.has(pathname) ||
        ['/api/webhook/stripe','/api/webhook/mercadopago'].includes(pathname);
      if (paymentRequest && paymentMaintenance) {
        let unavailable = true;
        try { unavailable = await paymentMaintenance(); } catch { /* Fail closed, preserve webhook retries. */ }
        if (unavailable) {
          res.setHeader('Retry-After','30');
          return json(res,503,{error:'Pagamentos temporariamente indisponíveis. Tente novamente.'});
        }
      }
      if (pathname === '/api/game-pix') {
        if (!gamePixHandler) return json(res, 503, {error:'unavailable'});
        if (url.search) return json(res, 400, {error:'invalid_request'});
        await gamePixHandler(req,res);
        return;
      }
      if (pathname.startsWith('/api/')) {
        const name = routes.get(pathname);
        if (!name) return json(res, 404, { error: 'não encontrado' });
        const previewRoute = (accountPreview && pathname === '/api/account') ||
          (rankingPreview && pathname === '/api/game' && req.method === 'GET' &&
           url.searchParams.get('resource') === 'ranking' &&
           ['experiencia', 'guildas'].includes(url.searchParams.get('cat') || 'experiencia'));
        const authRoute = emailAuthEnabled && pathname === '/api/account';
        const stripeRoute = !accountPreview && ((stripeEnabled && ['/api/stripe-checkout','/api/coupon'].includes(pathname)) ||
          ((stripeEnabled || stripeWebhookEnabled) && pathname === '/api/webhook/stripe'));
        const pixRoute = !accountPreview && ((pixEnabled && ['/api/checkout','/api/coupon'].includes(pathname)) ||
          ((pixEnabled || pixWebhookEnabled) && pathname === '/api/webhook/mercadopago'));
        if (!authRoute && !stripeRoute && !pixRoute && ((accountPreview || rankingPreview) ? !previewRoute : (!apiEnabled || (paymentRoutes.has(pathname) && !paymentsEnabled)))) return json(res, 503, { error: 'recurso em homologação' });
        if (!pathname.startsWith('/api/webhook/')) {
          if (req.headers.origin && req.headers.origin !== 'https://pokeworlduniverse.com') return json(res,403,{error:'Origem não autorizada.'});
          if (req.headers['sec-fetch-site'] === 'cross-site') return json(res,403,{error:'Origem não autorizada.'});
        }
        // Webhooks remain available when only new purchases are disabled.
        if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'método não permitido' });
        const query = Object.create(null);
        for (const [key, value] of url.searchParams) {
          if (Object.hasOwn(query, key)) return json(res, 400, { error: 'parâmetro duplicado' });
          query[key] = value;
        }
        const bytes = await body(req, pathname.startsWith('/api/webhook/') ? 262144 : 16384);
        let input = req;
        if (name === 'webhook/stripe-live.js') {
          // Preserve the exact signed bytes; do not JSON-parse Stripe's raw body.
          input = Readable.from([bytes]);
          Object.assign(input, { method: req.method, headers: req.headers, url: req.url, socket: req.socket });
        } else {
          if (bytes.length && !String(req.headers['content-type']).toLowerCase().startsWith('application/json')) return json(res, 415, { error: 'use application/json' });
          try { input.body = bytes.length ? JSON.parse(bytes.toString('utf8')) : {}; }
          catch { return json(res, 400, { error: 'JSON inválido' }); }
          if (!input.body || Array.isArray(input.body) || typeof input.body !== 'object') return json(res,400,{error:'Objeto JSON necessário.'});
        }
        input.query = query;
        if (accountPreview && pathname === '/api/account') {
          if (req.method === 'POST' && input.body?.action !== 'login') return json(res, 403, { error: 'Prévia somente leitura: alterações bloqueadas.' });
          if (req.method === 'POST') {
            if (Date.now() - loginWindow >= 60000) { loginWindow = Date.now(); loginAttempts = 0; }
            if (++loginAttempts > 10) { res.setHeader('Retry-After', '60'); return json(res, 429, { error: 'Aguarde um minuto para tentar novamente.' }); }
          }
          input.previewReadOnly = true;
        }
        res.status = code => { res.statusCode = code; return res; };
        res.json = value => { json(res, res.statusCode, value); return res; };
        res.setHeader('Cache-Control', 'no-store');
        await (await loadHandler(name))(input, res);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'método não permitido' });
      if (redirects.has(pathname)) {
        res.writeHead(pathname.startsWith('/doar') ? 308 : 307, {Location:redirects.get(pathname)+url.search});
        return res.end();
      }
      if (pathname==='/Donate' || pathname==='/donate') pathname='/doar.html';
      if (pathname==='/admin' || pathname==='/admin.html') {
        res.setHeader('X-Robots-Tag','noindex, nofollow');
        res.setHeader('Cache-Control','no-store');
      }
      if (pathname === '/') pathname = '/index.html';
      else if (!path.posix.extname(pathname)) pathname += '.html';
      const relative = pathname.slice(1);
      const ext = path.extname(relative).toLowerCase();
      // Never serve API source, manifests, .env, package files or runtime code.
      const publicPath = !relative.includes('/') ? ['.html', '.css', '.js', '.ico'].includes(ext)
        : /^(assets|fonts)\//.test(relative) && Object.hasOwn(mime, ext);
      if (!publicPath) return json(res, 404, { error: 'não encontrado' });
      const base = await rootPromise;
      const file = await realpath(path.join(base, relative));
      if (!file.startsWith(base + path.sep)) return json(res, 404, { error: 'não encontrado' });
      const info = await stat(file);
      if (!info.isFile()) return json(res, 404, { error: 'não encontrado' });
      res.setHeader('Content-Type', mime[ext]); res.setHeader('Content-Length', info.size);
      if (ext === '.html') {
        const nonce = randomBytes(18).toString('base64');
        const html = (await readFile(file,'utf8')).replace(/<script\b/gi, '<script nonce="'+nonce+'"');
        res.setHeader('Content-Security-Policy', `base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; upgrade-insecure-requests`);
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Length',Buffer.byteLength(html));
        return res.end(req.method==='HEAD' ? undefined : html);
      }
      if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', ext === '.html' || ['.js','.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600');
      // The new map videos seek to specific scenes. Serve byte ranges locally.
      res.setHeader('Accept-Ranges','bytes');
      let start=0,end=info.size-1;
      if (req.headers.range && req.method==='GET') {
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1]&&!match[2])) {res.removeHeader('Content-Length');res.setHeader('Content-Range',`bytes */${info.size}`);return json(res,416,{error:'intervalo inválido'});}
        if (match[1]) {start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
        else start=Math.max(0,info.size-Number(match[2]));
        if (![start,end].every(Number.isSafeInteger)||start>end||start>=info.size) {res.removeHeader('Content-Length');res.setHeader('Content-Range',`bytes */${info.size}`);return json(res,416,{error:'intervalo inválido'});}
        res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);res.setHeader('Content-Length',end-start+1);
      }
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file, {start,end}), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      const code = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error.status || 500;
      if (code === 500) console.error('[server] falha ao atender requisição');
      json(res, code, { error: code === 404 ? 'não encontrado' : 'não foi possível atender a requisição' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5089);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida');
  const {configuredGamePixHandler} = await import('../site/api/_lib/game-pix-runtime.js');
  const gamePixHandler = configuredGamePixHandler();
  const {paymentMaintenance} = await import('../site/api/_lib/payment-maintenance.js');
  const server = createApp({ gamePixHandler, paymentMaintenance: gamePixHandler ? paymentMaintenance : null, pixEnabled: process.env.PWU_PIX_ENABLED === 'true', pixWebhookEnabled: process.env.PWU_PIX_WEBHOOK_ENABLED === 'true', stripeEnabled: process.env.PWU_STRIPE_ENABLED === 'true', stripeWebhookEnabled: process.env.PWU_STRIPE_WEBHOOK_ENABLED === 'true', emailAuthEnabled: process.env.PWU_EMAIL_AUTH_ENABLED === 'true', apiEnabled: process.env.PWU_API_ENABLED === 'true', paymentsEnabled: process.env.PWU_PAYMENTS_ENABLED === 'true', accountPreview: process.env.PWU_ACCOUNT_PREVIEW === 'true', rankingPreview: process.env.PWU_RANKING_PREVIEW === 'true' });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.listen(port, '127.0.0.1', () => console.log(`PWU local: http://127.0.0.1:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref();
  });
}
