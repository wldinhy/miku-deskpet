// 水平翻转立绘（侧面图要求朝左）。用法：npx electron tools/flip.js <图片.png> [...]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const files = process.argv.slice(2).filter((f) => f.endsWith('.png'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  for (const f of files) {
    const src = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const png = await win.webContents.executeJavaScript(`(async () => {
      const i = new Image(); i.src = ${JSON.stringify(src)}; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(i, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    fs.writeFileSync(f, Buffer.from(png, 'base64'));
    console.log('flipped', f);
  }
  app.quit();
});
