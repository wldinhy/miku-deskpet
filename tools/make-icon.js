// 从正面立绘裁出头像，生成 build/icon.png（256x256，打包用）
// 用法：npx electron tools/make-icon.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const src = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets/gen/idle.png')).toString('base64');
  const data = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const c0 = document.createElement('canvas'); c0.width = img.width; c0.height = img.height;
    const g0 = c0.getContext('2d'); g0.drawImage(img, 0, 0);
    const d = g0.getImageData(0, 0, img.width, img.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
    for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) {
      if (d[(y * img.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const bh = y1 - y0, size = bh * 0.26, cx = (x0 + x1) / 2;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = '#f6efe2'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#8fcfc8'; g.stroke();
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 7, 0, Math.PI * 2); g.clip();
    g.drawImage(img, cx - size / 2, y0 + bh * 0.04, size, size, 0, 0, S, S);
    g.restore();
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build/icon.png'), Buffer.from(data, 'base64'));
  console.log('build/icon.png written');
  app.quit();
});
