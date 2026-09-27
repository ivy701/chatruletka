const https = require('https');
const token = '8839541776:AAEybPVoYnKdf0VRGb9Nl7Wi-Go32hDNSZY';

https.get(`https://api.telegram.org/bot${token}/getMe`, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Telegram Bot Info:', data));
}).on('error', err => console.error(err));
