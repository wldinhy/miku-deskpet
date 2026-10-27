// 把一个目录下的立绘拼成总览图，方便检查。用法：npx electron tools/contact-sheet.js <目录> <输出.png> [单张高度]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const [dir, out, h = '260'] = process.argv.slice(-3);
app.whenReady().then(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  const imgs = files.map((f) => ({ name: f.replace('.png', ''), data: 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const png = await win.webContents.executeJavaScript(`(async () => {
    const list = ${JSON.stringify(imgs)}, H = ${+h}, cols = 6;
    const els = await Promise.all(list.map(async (o) => { const i = new Image(); i.src = o.data; await i.decode(); return i; }));
    const W = Math.round(H * 0.68), c = document.createElement('canvas');
    c.width = W * cols; c.height = (H + 18) * Math.ceil(list.length / cols);
    const g = c.getContext('2d');
    g.fillStyle = '#2a2d3a'; g.fillRect(0, 0, c.width, c.height);
    g.font = '13px sans-serif'; g.fillStyle = '#ddd'; g.textAlign = 'center';
    els.forEach((im, k) => {
      const x = (k % cols) * W, y = Math.floor(k / cols) * (H + 18), s = Math.min(H / im.height, W / im.width);
      g.drawImage(im, x + (W - im.width * s) / 2, y, im.width * s, im.height * s);
      g.fillText(list[k].name, x + W / 2, y + H + 13);
    });
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  fs.writeFileSync(out, Buffer.from(png, 'base64'));
  console.log('written', files.length);
  app.quit();
});
