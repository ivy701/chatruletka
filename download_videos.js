const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'videos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const videos = [
  { name: 'girl1.mp4', url: 'https://assets.mixkit.co/videos/4844/4844-360.mp4' },
  { name: 'girl2.mp4', url: 'https://assets.mixkit.co/videos/4833/4833-360.mp4' },
  { name: 'girl3.mp4', url: 'https://assets.mixkit.co/videos/15909/15909-360.mp4' },
  { name: 'girl4.mp4', url: 'https://assets.mixkit.co/videos/6083/6083-360.mp4' },
  { name: 'girl5.mp4', url: 'https://assets.mixkit.co/videos/6466/6466-360.mp4' }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Downloaded:', dest, (fs.statSync(dest).size / 1024).toFixed(1) + ' KB');
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  for (const v of videos) {
    const p = path.join(dir, v.name);
    console.log('Downloading', v.url, '->', v.name);
    try {
      await download(v.url, p);
    } catch(e) {
      console.error('Failed to download', v.name, e.message);
    }
  }
  console.log('All downloads finished!');
}

run();
