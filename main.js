// 主进程：透明置顶窗口、拖拽/抛掷/下落/散步物理、右键菜单、托盘、存档
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// 沿用旧的 appId，安装新版时能直接覆盖升级旧版
app.setAppUserModelId('com.miku.deskpet');

let win = null, tray = null;
let settings = {}, menuState = {};
// 布局由渲染进程上报：窗口宽高、脚底距窗口底部、头顶距窗口顶部、角色半宽
let L = { w: 300, h: 560, feet: 12, top: 280, half: 55 };
const pos = { x: 0, y: 0 };
const vel = { x: 0, y: 0 };
let mode = 'idle';          // idle | drag | fall | throw | walk | rewind
let drag = null, walkTarget = 0, walkSpeed = 1.2, fallT = 0, hideTimer = null;
const hist = [];
// 最近 20 秒的位置轨迹，供「轮回重来」倒放
const trail = [];
let dragStartT = 0, rew = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dataPath = () => path.join(app.getPath('userData'), 'deskpet-data.json');
// 旧版（Miku Deskpet）的存档：第一次启动新版时搬过来
function migrate() {
  if (fs.existsSync(dataPath())) return;
  const old = [path.join(app.getPath('userData'), 'miku-data.json'), path.join(app.getPath('appData'), 'Miku Deskpet', 'miku-data.json')];
  const src = old.find((p) => fs.existsSync(p));
  if (src) try { fs.mkdirSync(path.dirname(dataPath()), { recursive: true }); fs.copyFileSync(src, dataPath()); } catch {}
}
// 角色名：托盘提示、通知等处使用
const CHARA_NAME = { classic: '初音未来', rinne: '初音未来', kurumi: '福贺久留美', furina: '芙宁娜' };
function readData() { try { return JSON.parse(fs.readFileSync(dataPath(), 'utf8')); } catch { return {}; } }
function writeData(patch) {
  try { fs.writeFileSync(dataPath(), JSON.stringify(Object.assign(readData(), patch))); } catch {}
}
function send(ch, d) { if (win && !win.isDestroyed()) win.webContents.send(ch, d); }

function area() {
  const p = { x: Math.round(pos.x + L.w / 2), y: Math.round(pos.y + L.h / 2) };
  return screen.getDisplayNearestPoint(p).workArea;
}
function limits() {
  const wa = area();
  return {
    minX: wa.x - L.w / 2 + L.half,
    maxX: wa.x + wa.width - L.w / 2 - L.half,
    minY: wa.y - L.top,
    ground: wa.y + wa.height - L.h + L.feet,
  };
}
function place() {
  if (!win || win.isDestroyed()) return;
  win.setBounds({ x: Math.round(pos.x), y: Math.round(pos.y), width: L.w, height: L.h });
}

function velocity() {
  if (hist.length < 2) return { x: 0, y: 0 };
  const a = hist[0], b = hist[hist.length - 1];
  const ticks = Math.max(1, (b.t - a.t) / 16);
  return { x: (b.x - a.x) / ticks, y: (b.y - a.y) / ticks };
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const bx = pos.x, by = pos.y;
  const lim = limits();
  const c = screen.getCursorScreenPoint();

  if (mode === 'drag') {
    pos.x = c.x - drag.ox; pos.y = c.y - drag.oy;
    hist.push({ x: pos.x, y: pos.y, t: Date.now() });
    while (hist.length > 6) hist.shift();
  } else if (mode === 'throw') {
    vel.y += 0.9; vel.x *= 0.995;
    pos.x += vel.x; pos.y += vel.y;
    if (pos.x < lim.minX) { pos.x = lim.minX; vel.x = Math.abs(vel.x) * 0.6; send('bump', 'wall'); }
    if (pos.x > lim.maxX) { pos.x = lim.maxX; vel.x = -Math.abs(vel.x) * 0.6; send('bump', 'wall'); }
    if (pos.y < lim.minY) { pos.y = lim.minY; vel.y = Math.abs(vel.y) * 0.5; send('bump', 'ceil'); }
    if (pos.y >= lim.ground) {
      pos.y = lim.ground;
      if (vel.y > 7) { vel.y = -vel.y * 0.42; vel.x *= 0.7; send('bump', 'floor'); }
      else { mode = 'idle'; send('landed', { hard: true }); }
    }
  } else if (mode === 'fall') {
    fallT++;
    vel.y = Math.min(vel.y + 0.05, 2.4);
    pos.y += vel.y;
    pos.x = clamp(pos.x + Math.sin(fallT / 28) * 0.7, lim.minX, lim.maxX);
    if (pos.y >= lim.ground) { pos.y = lim.ground; mode = 'idle'; send('landed', { hard: false }); }
  } else if (mode === 'rewind') {
    rew.i = Math.min(rew.path.length - 1, rew.i + rew.step);
    pos.x = rew.path[rew.i].x; pos.y = rew.path[rew.i].y;
    if (rew.i >= rew.path.length - 1) { mode = 'idle'; rew = null; send('rewound'); }
  } else if (mode === 'walk') {
    const d = walkTarget - pos.x;
    if (Math.abs(d) <= walkSpeed) { pos.x = walkTarget; mode = 'idle'; send('walk-end'); }
    else pos.x += Math.sign(d) * walkSpeed;
  }

  if (pos.x !== bx || pos.y !== by) place();
  if (mode !== 'rewind') {
    const now = Date.now();
    trail.push({ x: pos.x, y: pos.y, t: now });
    while (trail.length && now - trail[0].t > 20000) trail.shift();
  }
  send('tick', {
    cx: c.x, cy: c.y, wx: pos.x, wy: pos.y, dx: pos.x - bx, dy: pos.y - by, mode,
    onGround: Math.abs(pos.y - lim.ground) < 3,
  });
}

// ---------- 菜单 ----------
function menuTemplate() {
  const s = settings, st = menuState;
  const cmd = (id, v) => () => send('menu', { id, v });
  const radio = (label, key, val) => ({ label, type: 'radio', checked: s[key] === val, click: cmd('set', { key, val }) });
  const check = (label, key) => ({ label, type: 'checkbox', checked: !!s[key], click: cmd('set', { key, val: !s[key] }) });
  const kurumi = s.skin === 'kurumi', furina = s.skin === 'furina';
  const acts = furina
    ? [['登台致意', 'bow'], ['召唤沙龙成员', 'salon'], ['万众狂欢！', 'rejoice'], ['逞强一下', 'brave'], ['哭给你看', 'cry'], null,
      ['挥挥手', 'wave'], ['唱首歌', 'sing'], ['跳支舞', 'dance'], ['转个圈', 'spin'], ['伸懒腰', 'stretch'], ['坐下休息', 'sit'],
      ['睡个午觉', 'sleep'], ['请她吃蛋糕', 'feed'], ['陪她喝下午茶', 'drink']]
    : kurumi
    ? [['看看行情', 'chart'], ['啃 FX 教材', 'study'], ['向 K 线祈祷', 'pray'], ['进入暴走模式', 'frenzy'], null,
      ['挥挥手', 'wave'], ['转个圈', 'spin'], ['跳一下', 'jump'], ['伸懒腰', 'stretch'], ['坐下休息', 'sit'], ['睡个午觉', 'sleep'],
      ['请她吃饭团', 'feed'], ['递一罐咖啡', 'drink']]
    : [['挥挥手', 'wave'], ['唱首歌', 'sing'], ['甩葱！', 'leek'], ['跳支舞', 'dance'], ['转个圈', 'spin'],
      ['跳一下', 'jump'], ['伸懒腰', 'stretch'], ['坐下休息', 'sit'], ['睡个午觉', 'sleep'], ['喂一根葱', 'feed'], ['递一杯水', 'drink']];
  return [
    { label: '互动', submenu: [
      ...(s.skin === 'rinne' ? [
        { label: st.form === 'm' ? '解除变身' : '变身！', click: cmd('act', st.form === 'm' ? 'untransform' : 'transform') },
        { label: '星星魔法', click: cmd('act', 'magic') },
        { label: '轮回重来（倒回 8 秒前）', click: cmd('act', 'retry') },
        { type: 'separator' },
      ] : []),
      ...acts.map((a) => (a ? { label: a[0], click: cmd('act', a[1]) } : { type: 'separator' })),
    ] },
    { label: '小功能', submenu: [
      ...(kurumi ? [{ label: st.fx ? `FX 模拟盘（${st.fx}）` : 'FX 模拟盘', click: cmd('panel', 'fx') }, { type: 'separator' }] : []),
      ...(furina ? [{ label: '歌剧院审判', click: cmd('panel', 'verdict') }, { type: 'separator' }] : []),
      { label: st.pomo ? `番茄钟（${st.pomo}）` : '番茄钟', click: cmd('panel', 'pomo') },
      { label: '待办便签', click: cmd('panel', 'todo') },
      { label: '定时提醒', click: cmd('panel', 'remind') },
      { type: 'separator' },
      { label: '猜拳', click: cmd('panel', 'rps') },
      { label: '今日运势', click: cmd('panel', 'fortune') },
      { label: '好感度与记录', click: cmd('panel', 'status') },
    ] },
    { type: 'separator' },
    { label: '角色 / 皮肤', submenu: [
      { label: '初音未来', enabled: false },
      radio('　即刻轮回 · いますぐ輪廻', 'skin', 'rinne'), radio('　经典 · 淡彩', 'skin', 'classic'),
      { type: 'separator' },
      { label: '福贺久留美', enabled: false },
      radio('　FX战士 · 白色连衣裙', 'skin', 'kurumi'),
      { type: 'separator' },
      { label: '芙宁娜', enabled: false },
      radio('　魔法偶像 · 舞台装', 'skin', 'furina'),
    ] },
    check(kurumi ? '深夜盯盘' : furina ? '谢幕之后' : '月夜模式', 'night'),
    { label: '设置', submenu: [
      { label: '大小', submenu: [radio('小', 'scale', 0.8), radio('中', 'scale', 1), radio('大', 'scale', 1.25), radio('特大', 'scale', 1.5)] },
      { label: '不透明度', submenu: [radio('100%', 'opacity', 1), radio('85%', 'opacity', 0.85), radio('70%', 'opacity', 0.7), radio('50%', 'opacity', 0.5)] },
      { label: '喝水提醒', submenu: [radio('关闭', 'water', 0), radio('每 30 分钟', 'water', 30), radio('每 45 分钟', 'water', 45), radio('每 60 分钟', 'water', 60)] },
      { label: '久坐提醒', submenu: [radio('关闭', 'sitRemind', 0), radio('每 45 分钟', 'sitRemind', 45), radio('每 60 分钟', 'sitRemind', 60), radio('每 90 分钟', 'sitRemind', 90)] },
      { label: '无人理会时打瞌睡', submenu: [radio('3 分钟后', 'sleepAfter', 3), radio('5 分钟后', 'sleepAfter', 5), radio('10 分钟后', 'sleepAfter', 10), radio('从不', 'sleepAfter', 0)] },
      { type: 'separator' },
      check('总在最前', 'top'),
      check('自由散步', 'walk'),
      check('松手后下落（重力）', 'gravity'),
      check('音效', 'sound'),
      check('说话声', 'voice'),
      check('整点报时', 'hourly'),
      check('安静模式（少说话）', 'quiet'),
      check(kurumi ? '入夜自动开始深夜盯盘' : furina ? '入夜自动谢幕' : '入夜自动切换月夜', 'autoNight'),
      check('开机自启', 'launch'),
    ] },
    { type: 'separator' },
    { label: '回到地面', click: cmd('ground') },
    { label: '躲起来 10 分钟', click: cmd('hide') },
    { label: '使用说明', click: cmd('panel', 'help') },
    { label: '退出', click: cmd('quit') },
  ];
}

function showWin() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (win && !win.isVisible()) { win.showInactive(); send('shown'); }
}
function hideWin(ms) {
  if (!win) return;
  win.hide();
  if (hideTimer) clearTimeout(hideTimer);
  if (ms) hideTimer = setTimeout(showWin, ms);
}

// ---------- IPC ----------
ipcMain.handle('load', () => readData().state || null);
ipcMain.on('save', (e, state) => writeData({ state }));
ipcMain.on('ignore', (e, v) => win && win.setIgnoreMouseEvents(!!v, { forward: true }));
ipcMain.on('layout', (e, l) => {
  const ow = L.w, oh = L.h;
  L = Object.assign(L, l);
  pos.x += (ow - L.w) / 2; pos.y += oh - L.h;
  place();
});
ipcMain.on('ready', () => {
  const saved = readData().pos;
  const lim = limits();
  if (saved && screen.getAllDisplays().some((d) => {
    const a = d.workArea; return saved.x > a.x - L.w && saved.x < a.x + a.width && saved.y > a.y - L.h && saved.y < a.y + a.height;
  })) { pos.x = saved.x; pos.y = Math.min(saved.y, limits().ground); }
  else { const wa = area(); pos.x = wa.x + wa.width - L.w - 80; pos.y = lim.ground; }
  place();
  win.showInactive();
});
ipcMain.on('drag-start', (e, d) => { drag = d; mode = 'drag'; hist.length = 0; dragStartT = Date.now(); });
// 沿轨迹倒放回去：drag = 回到被拎起之前；time = 回到 8 秒前
ipcMain.on('rewind', (e, { mode: m }) => {
  if (mode === 'drag') return;
  const cutoff = m === 'drag' ? dragStartT - 50 : Date.now() - 8000;
  const path = trail.filter((p) => p.t >= cutoff).map((p) => ({ x: p.x, y: p.y })).reverse();
  if (path.length < 2 || Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y) < 2) { send('rewound'); return; }
  rew = { path, i: 0, step: Math.max(1, Math.ceil(path.length / 75)) };
  mode = 'rewind';
});
ipcMain.on('drag-end', (e, { gravity }) => {
  if (mode !== 'drag') return;
  const v = velocity();
  const lim = limits();
  drag = null;
  if (pos.y > lim.ground) { pos.y = lim.ground; place(); }
  pos.x = clamp(pos.x, lim.minX, lim.maxX);
  if (!gravity) {
    if (Math.hypot(v.x, v.y) > 14) { send('flung'); }
    mode = 'idle'; place(); send('landed', { hard: false, stay: true }); return;
  }
  if (Math.hypot(v.x, v.y) > 9) {
    mode = 'throw'; vel.x = clamp(v.x, -45, 45); vel.y = clamp(v.y, -45, 45); send('thrown');
  } else if (pos.y < lim.ground - 3) {
    mode = 'fall'; vel.x = 0; vel.y = 0.3; fallT = 0; send('falling');
  } else {
    mode = 'idle'; pos.y = lim.ground; place(); send('landed', { hard: false });
  }
});
ipcMain.on('fall', () => {
  if (mode === 'drag') return;
  const lim = limits();
  if (pos.y < lim.ground - 3) { mode = 'fall'; vel.y = 0.3; fallT = 0; send('falling'); }
  else { pos.y = lim.ground; place(); }
});
ipcMain.on('walk', (e, { dx, speed }) => {
  if (mode !== 'idle') { send('walk-end'); return; }
  const lim = limits();
  walkTarget = clamp(pos.x + dx, lim.minX, lim.maxX);
  walkSpeed = speed || 1.2;
  if (Math.abs(walkTarget - pos.x) < 4) { send('walk-end', 'edge'); return; }
  mode = 'walk';
});
ipcMain.on('stop-walk', () => { if (mode === 'walk') mode = 'idle'; });
ipcMain.on('settings', (e, s) => {
  const prev = settings;
  settings = s;
  if (tray) tray.setToolTip(`桌宠 · ${CHARA_NAME[s.skin] || ''}`);
  if (!win) return;
  win.setAlwaysOnTop(!!s.top, 'floating');
  win.setOpacity(s.opacity || 1);
  if (prev.launch !== s.launch && app.isPackaged !== undefined) {
    try {
      app.setLoginItemSettings(app.isPackaged
        ? { openAtLogin: !!s.launch }
        : { openAtLogin: !!s.launch, path: process.execPath, args: [app.getAppPath()] });
    } catch {}
  }
});
ipcMain.on('menu-state', (e, st) => { menuState = st; });
ipcMain.on('popup', () => { if (win) Menu.buildFromTemplate(menuTemplate()).popup({ window: win }); });
ipcMain.on('notify', (e, { title, body }) => {
  try { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); } catch {}
});
ipcMain.on('tray-icon', (e, url) => {
  const img = nativeImage.createFromDataURL(url);
  if (!tray) {
    tray = new Tray(img);
    tray.setToolTip(`桌宠 · ${CHARA_NAME[settings.skin] || ''}`);
    tray.on('click', () => (win.isVisible() ? hideWin() : showWin()));
    tray.on('right-click', () => {
      tray.popUpContextMenu(Menu.buildFromTemplate([
        { label: win.isVisible() ? '隐藏' : '显示', click: () => (win.isVisible() ? hideWin() : showWin()) },
        { type: 'separator' },
        ...menuTemplate(),
      ]));
    });
  } else tray.setImage(img);
});
ipcMain.on('hide', (e, ms) => hideWin(ms));
ipcMain.on('quit', () => app.quit());

// ---------- 启动 ----------
function create() {
  migrate();
  win = new BrowserWindow({
    width: L.w, height: L.h, x: 0, y: 0,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    backgroundColor: '#00000000', title: '桌宠',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');
  win.on('close', () => writeData({ pos: { x: Math.round(pos.x), y: Math.round(pos.y) } }));
  setInterval(tick, 16);
  // “显示桌面”等操作后 Windows 可能把置顶状态弄丢，定期重新声明
  setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible() && settings.top !== false) win.setAlwaysOnTop(true, 'floating');
  }, 3000);

  // 调试：PET_SHOT=路径 时截一张图后退出
  if (process.env.PET_EVAL) {
    setTimeout(() => win.webContents.executeJavaScript(process.env.PET_EVAL).catch(() => {}), 3000);
  }
  if (process.env.PET_SHOT) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.PET_SHOT, img.toPNG());
      app.quit();
    }, +(process.env.PET_SHOT_DELAY || 3500));
  }
}

app.on('second-instance', showWin);
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
