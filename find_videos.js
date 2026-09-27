const https = require('https');
const fs = require('fs');

async function getPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const pages = [
    'https://mixkit.co/free-stock-video/girl-talking/',
    'https://mixkit.co/free-stock-video/woman-talking-to-camera/',
    'https://mixkit.co/free-stock-video/webcam/'
  ];
  let all = [];
  for (const p of pages) {
    try {
      const html = await getPage(p);
      const matches = html.match(/https:\/\/assets\.mixkit\.co\/videos\/[^\"]+?\.mp4/g);
      if (matches) all.push(...matches);
    } catch(e) {
      console.error(e.message);
    }
  }
  const unique = [...new Set(all)];
  console.log('FOUND ' + unique.length + ' videos:');
  console.log(JSON.stringify(unique.slice(0, 15), null, 2));
}

main();
