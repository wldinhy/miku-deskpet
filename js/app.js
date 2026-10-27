// 渲染进程主逻辑：立绘切换 + 位移/挤压/翻转动画、交互、自主行为
(function () {
  const api = window.api || mockApi();
  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now() / 1000;
  const bell = (u) => Math.sin(Math.PI * clamp(u, 0, 1));
  const today = () => new Date().toLocaleDateString('zh-CN');

  // ---------- 存档 ----------
  const DEFAULTS = {
    scale: 1, opacity: 1, top: true, walk: true, gravity: true, sound: true, voice: true, hourly: true,
    quiet: false, autoNight: false, night: false, launch: false, water: 45, sitRemind: 60, sleepAfter: 5, skin: 'rinne',
    pomoWork: 25, pomoBreak: 5,
  };
  const S = {
    settings: { ...DEFAULTS }, affection: 0, todos: [], reminders: [], fortune: null, pomo: null,
    stats: { pats: 0, pokes: 0, throws: 0, songs: 0, feeds: 0, pomos: 0, rpsWin: 0, rpsLose: 0, rpsDraw: 0, retries: 0, first: Date.now(), lastDay: '' },
  };
  // 角色与皮肤：一个角色可以有多套皮肤
  const CHARAS = {
    miku: { id: 'miku', name: 'Miku', full: '初音未来' },
    kurumi: { id: 'kurumi', name: '久留美', full: '福贺久留美' },
    furina: { id: 'furina', name: '芙宁娜', full: '芙宁娜' },
  };
  const SKIN_CHARA = { classic: 'miku', rinne: 'miku', kurumi: 'kurumi', furina: 'furina' };
  const chara = () => CHARAS[SKIN_CHARA[S.settings.skin] || 'miku'];
  const isKurumi = () => chara().id === 'kurumi';
  const isFurina = () => chara().id === 'furina';
  // 夜晚模式里坐在地上（久留美盯盘、芙宁娜谢幕后），不在空中飘
  const nightGrounded = () => isKurumi() || isFurina();
  // 台词：当前皮肤有专属台词就用专属的，否则沿用通用台词
  const SKIN_LINES = { rinne: () => window.LINES_RINNE, kurumi: () => window.LINES_KURUMI, furina: () => window.LINES_FURINA };
  const L = new Proxy({}, { get: (_, k) => { const x = SKIN_LINES[S.settings.skin]; return (x && x()[k]) || LINES[k] || []; } });
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => api.send('save', JSON.parse(JSON.stringify(S))), 600);
  }

  // ---------- 姿态（数值项会平滑过渡） ----------
  const BASE = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, flip: 1, pivot: 0.45, sway: 0.012 };
  const cur = { ...BASE, sprite: 'front' };
  const tgt = {};
  let T = 0, lastT = 0;

  function jumpPose(p, t, h) {
    if (t < 0.15) { const k = t / 0.15; p.sy = 1 - 0.1 * k; p.sx = 1 + 0.06 * k; }
    else if (t < 0.75) { const u = (t - 0.15) / 0.6; p.y = -h * 4 * u * (1 - u); p.sy = 1.04; p.sx = 0.97; }
    else { const k = 1 - clamp((t - 0.75) / 0.2, 0, 1); p.sy = 1 - 0.08 * k; p.sx = 1 + 0.05 * k; }
  }
  function noteFx(a) {
    if (!a.notes) return;
    a.ni = a.ni || 0;
    while (a.ni < a.notes.length && a.notes[a.ni].t <= a.t) {
      if (a.ni % 2 === 0) fx('note', 0.5 + rand(-0.42, 0.42), 0.08 + rand(-0.06, 0.12));
      a.ni++;
    }
  }

  // ---------- 动作 ----------
  const ACTS = {
    wave: { dur: 2.2, pose(p, t) { p.sprite = 'wave'; p.y = -Math.abs(Math.sin(t * 5)) * 3; p.rot = Math.sin(t * 5) * 1.5; } },
    pat: { dur: 1.8, pose(p, t) { p.sprite = 'happy'; p.sy = 1 - 0.025 * Math.abs(Math.sin(t * 6)); p.rot = Math.sin(t * 4) * 2.5; } },
    pokeCheek: { dur: 1.6, pose(p, t) { p.sprite = 'pout'; const k = t < 0.25 ? bell(t / 0.25) : 0; p.sx = 1 + 0.05 * k; p.sy = 1 - 0.04 * k; p.rot = -2.5; } },
    pokeBody: { dur: 1.1, fast: true, pose(p, t) { p.sprite = 'surprised'; const k = t < 0.4 ? bell(t / 0.4) : 0; p.y = -16 * k; p.sy = 1 + 0.04 * k; } },
    tickle: { dur: 2, fast: true, pose(p, t) { p.sprite = 'happy'; p.rot = Math.sin(t * 28) * 3; p.y = -Math.abs(Math.sin(t * 14)) * 3; } },
    tailPull: { dur: 1.7, pose(p, t, a) { p.sprite = 'pout'; p.rot = 6 * (a.side || 1); p.x = -4 * (a.side || 1); } },
    jump: { dur: 0.95, fast: true, pose(p, t) { p.sprite = t > 0.15 && t < 0.75 ? 'cheer' : 'front'; jumpPose(p, t, 50); } },
    spin: { dur: 1.3, fast: true, direct: ['sx'], pose(p, t) {
      const u = Math.min(1, t / 1.1), a = u * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      p.sprite = c > 0.45 ? 'front' : c < -0.45 ? 'back' : 'side';
      p.flip = p.sprite === 'side' ? (s > 0 ? 1 : -1) : 1;
      p.sx = 0.82 + 0.18 * Math.abs(Math.cos(a * 2));
      p.y = -28 * Math.sin(u * Math.PI); p.sway = 0.03;
    } },
    dance: { dur: 7, music: true, pose(p, t, a) {
      const b = t * Math.PI * (128 / 60), s = Math.sin(b);
      p.sprite = 'dance'; p.flip = Math.sin(b / 2) >= 0 ? 1 : -1;
      p.rot = s * 4; p.y = -Math.abs(s) * 8; p.sy = 1 - 0.03 * Math.abs(Math.cos(b)); p.sway = 0.028;
      noteFx(a);
    } },
    sing: { dur: 8, music: true, pose(p, t, a) {
      p.sprite = 'sing'; p.rot = Math.sin(t * 1.6) * 2.5; p.y = -Math.abs(Math.sin(t * 3.2)) * 2; p.sway = 0.02;
      noteFx(a);
    } },
    hum: { dur: 4.2, music: true, pose(p, t, a) { p.sprite = 'happy'; p.rot = Math.sin(t * 2) * 2; noteFx(a); } },
    leek: { dur: 6, music: true, pose(p, t, a) {
      const b = t * Math.PI * 2 * (150 / 60), s = Math.sin(b);
      p.sprite = 'leek'; p.flip = Math.sin(b / 4) >= 0 ? 1 : -1;
      p.rot = s * 5; p.y = -Math.abs(Math.sin(b / 2)) * 6; p.sway = 0.03;
      noteFx(a);
    } },
    stretch: { dur: 2.6, pose(p, t) { p.sprite = 'stretch'; const k = bell(t / 2.6); p.sy = 1 + 0.03 * k; p.sx = 1 - 0.015 * k; } },
    yawn: { dur: 2.4, pose(p, t) { p.sprite = 'stretch'; const k = bell(t / 2.4); p.sy = 1 + 0.02 * k; } },
    lookAround: { dur: 3.4, pose(p, t) {
      if (t < 1.3) { p.sprite = 'side'; p.flip = 1; } else if (t < 2.6) { p.sprite = 'side'; p.flip = -1; } else p.sprite = 'front';
    } },
    tilt: { dur: 2.2, pose(p, t) { p.sprite = t < 1.6 ? 'think' : 'front'; p.rot = t < 1.9 ? 5 : 0; } },
    shy: { dur: 2.8, pose(p, t) { p.sprite = 'shy'; p.rot = -2 + Math.sin(t * 3) * 1; p.sx = 1 - 0.01 * Math.sin(t * 6); } },
    cheer: { dur: 1.9, fast: true, pose(p, t) { p.sprite = 'cheer'; jumpPose(p, ((t % 0.95) / 0.95) * 0.95, 26); p.sway = 0.03; } },
    sad: { dur: 2.6, pose(p, t) { p.sprite = 'sad'; p.sy = 0.985; p.y = 1; p.rot = Math.sin(t * 9) * 0.5; } },
    dizzy: { dur: 2.8, pose(p, t) { const k = 1 - t / 2.8; p.sprite = 'dizzy'; p.rot = Math.sin(t * 4) * 7 * k; p.x = Math.sin(t * 3) * 4 * k; } },
    land: { dur: 0.45, fast: true, direct: ['sx', 'sy'], pose(p, t) { p.sprite = 'surprised'; const k = bell(t / 0.45); p.sy = 1 - 0.15 * k; p.sx = 1 + 0.1 * k; } },
    softLand: { dur: 0.4, fast: true, pose(p, t) { const k = bell(t / 0.4); p.sy = 1 - 0.06 * k; p.sx = 1 + 0.04 * k; } },
    wake: { dur: 2.4, pose(p, t) { p.sprite = t < 1 ? 'sleep' : t < 1.8 ? 'stretch' : 'front'; } },
    eat: { dur: 3.2, pose(p, t, a) {
      p.sprite = 'eat';
      const bite = Math.floor(t * 5) % 2;
      p.sy = 1 - 0.015 * bite; p.y = bite;
      if (bite && !a.lastBite) Snd.chomp();
      a.lastBite = bite;
    } },
    drink: { dur: 3, pose(p, t) { p.sprite = 'drink'; p.rot = -1.5 * bell(t / 3); } },
    rps: { dur: 1.6, pose(p, t) { p.sprite = 'think'; p.y = -Math.abs(Math.sin(t * 9)) * (t < 0.9 ? 4 : 0); } },
    think: { dur: 3, pose(p, t) { p.sprite = 'think'; p.rot = Math.sin(t * 1.5) * 1.5; } },
    surprised: { dur: 1.2, fast: true, pose(p, t) { p.sprite = 'surprised'; p.y = t < 0.3 ? -8 * bell(t / 0.3) : 0; } },
    transform: { dur: 1.8, fast: true, direct: ['sx'], pose(p, t) {
      const u = t / 1.8;
      p.sprite = 'transform'; p.y = -26 * bell(u); p.sx = 0.82 + 0.18 * Math.abs(Math.cos(t * 9)); p.sway = 0.04;
    } },
    magic: { dur: 2.2, pose(p, t, a) {
      p.sprite = 'magic'; p.rot = Math.sin(t * 3) * 1.5; p.y = -Math.abs(Math.sin(t * 4)) * 2;
      if (!a.fired && t > 0.35) { a.fired = 1; starShot(); }
    } },
    retry: { dur: 1.7, pose(p, t) {
      p.sprite = 'retry';
      p.glitch = t < 1.2 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 9)) : Math.max(0, 1 - (t - 1.2) / 0.5);
      p.rot = t < 1.2 ? Math.sin(t * 20) * 1.5 : 0;
    } },
    glitchBlip: { dur: 0.4, pose(p, t) { p.glitch = 0.8 * bell(t / 0.4); } },
    nod: { dur: 1.1, pose(p, t) { p.sprite = 'happy'; p.sy = 1 - Math.max(0, Math.sin(t * 11)) * 0.02; } },
    // 久留美
    chart: { dur: 3.4, pose(p, t) { p.sprite = 'phone'; p.rot = Math.sin(t * 1.2) * 1; p.y = t > 2.3 && t < 2.6 ? -5 * bell((t - 2.3) / 0.3) : 0; } },
    study: { dur: 3.6, pose(p, t) { p.sprite = 'study'; p.sy = 1 - Math.max(0, Math.sin(t * 2.2)) * 0.012; p.rot = Math.sin(t * 0.9) * 1.2; } },
    buy: { dur: 1.9, fast: true, pose(p, t) { p.sprite = 'buy'; jumpPose(p, Math.min(t, 0.95), 34); p.sway = 0.03; } },
    sell: { dur: 1.9, pose(p, t) { p.sprite = 'sell'; const k = t < 0.3 ? bell(t / 0.3) : 0; p.sy = 1 - 0.06 * k; p.sx = 1 + 0.04 * k; p.rot = -1.5; } },
    profit: { dur: 2.8, fast: true, pose(p, t, a) {
      p.sprite = 'profit'; jumpPose(p, ((t % 0.9) / 0.9) * 0.95, 20); p.sway = 0.03;
      if (!a.fired) { a.fired = 1; for (let i = 0; i < 8; i++) setTimeout(() => fx('yen', 0.5 + rand(-0.45, 0.45), 0.1 + rand(-0.08, 0.2)), i * 90); }
    } },
    losscut: { dur: 3.4, pose(p, t) { p.sprite = 'losscut'; p.x = Math.sin(t * 30) * 2.5 * Math.max(0, 1 - t / 0.8); p.sy = 1 - 0.012 * Math.abs(Math.sin(t * 4)); } },
    frenzy: { dur: 2.6, fast: true, pose(p, t) { p.sprite = 'frenzy'; p.x = Math.sin(t * 38) * 1.2; p.rot = Math.sin(t * 6) * 2; p.y = -Math.abs(Math.sin(t * 9)) * 3; p.sway = 0.03; } },
    pray: { dur: 3, pose(p, t) { p.sprite = 'pray'; p.sy = 1 - 0.015 * Math.abs(Math.sin(t * 3)); p.rot = Math.sin(t * 2) * 1; } },
    // 芙宁娜
    bow: { dur: 2.4, pose(p, t) { p.sprite = 'bow'; const k = bell(clamp((t - 0.3) / 1.4, 0, 1)); p.rot = -3 * k; p.sy = 1 - 0.03 * k; p.pivot = 0.2; } },
    salon: { dur: 3, pose(p, t, a) {
      p.sprite = 'salon'; p.y = -Math.abs(Math.sin(t * 3)) * 4; p.rot = Math.sin(t * 2) * 1.5; p.sway = 0.03;
      if (!a.fired) { a.fired = 1; for (let i = 0; i < 6; i++) setTimeout(() => fx('bubble', 0.5 + rand(-0.48, 0.48), 0.2 + rand(-0.1, 0.4)), i * 120); }
    } },
    rejoice: { dur: 2.6, fast: true, pose(p, t, a) {
      p.sprite = 'cheer'; jumpPose(p, ((t % 0.9) / 0.9) * 0.95, 28); p.sway = 0.035;
      if (!a.fired) { a.fired = 1; for (let i = 0; i < 10; i++) setTimeout(() => fx(i % 2 ? 'star' : 'confetti', 0.5 + rand(-0.5, 0.5), rand(-0.05, 0.3)), i * 80); }
    } },
    cry: { dur: 3, pose(p, t) { p.sprite = 'cry'; p.y = -Math.abs(Math.sin(t * 7)) * 2; p.rot = Math.sin(t * 13) * 1.2; } },
    brave: { dur: 2.8, pose(p, t) { p.sprite = 'brave'; p.x = Math.sin(t * 46) * 0.9; p.sy = 1.01; } },
    verdict: { dur: 2.2, fast: true, pose(p, t) { p.sprite = 'verdict'; const k = t < 0.35 ? bell(t / 0.35) : 0; p.x = 6 * k; p.sx = 1 + 0.03 * k; } },
    rain: { dur: 5, pose(p, t, a) {
      p.sprite = 'sad'; p.sy = 0.99; p.sway = 0.005;
      a.dt = (a.dt || 0) + 1; if (a.dt % 9 === 0) fx('rain', 0.5 + rand(-0.6, 0.6), rand(-0.3, 0.1));
    } },
  };

  // ---------- 状态（持续） ----------
  let mode = 'idle', modeT = 0, action = null, walkDir = 1, sitUntil = 0, thrownRot = 0, shake = 0;
  const sv = { x: 0, y: 0 };
  const MODES = {
    idle: { pose(p) { p.sprite = 'front'; } },
    walk: { pose(p, t) {
      if (S.settings.night) { nightPose(p, t); p.flip = walkDir > 0 ? -1 : 1; return; }
      // 单帧步幅图 + 连贯的小跳步：落地挤压、腾空拉伸、身体前倾
      const ph = t * Math.PI * 2.8, b = Math.abs(Math.sin(ph));
      p.sprite = 'walk1'; p.flip = walkDir > 0 ? -1 : 1;
      p.y = -b * 5; p.sy = 0.975 + 0.04 * b; p.sx = 1.015 - 0.02 * b;
      p.rot = walkDir * 2.5 + Math.sin(ph * 2) * 0.8; p.pivot = 0.1; p.sway = 0.02; p.fast = true;
    } },
    held: { pose(p, t) {
      p.sprite = shake > 60 ? 'dizzy' : 'held'; p.pivot = 0.92; p.fast = true;
      p.rot = clamp(sv.x * 0.9, -26, 26) + Math.sin(t * 5) * 2; p.sway = 0.02;
    } },
    fall: { pose(p, t) { p.sprite = 'held'; p.rot = Math.sin(t * 1.3) * 6; p.pivot = 0.8; p.sway = 0.035; } },
    thrown: { pose(p, t, dt) {
      thrownRot += (sv.x >= 0 ? 1 : -1) * (Math.abs(sv.x) + Math.abs(sv.y)) * 0.9 * dt * 60;
      p.sprite = 'held'; p.rot = thrownRot; p.pivot = 0.5; p.direct = ['rot']; p.sway = 0.03;
    } },
    sit: { pose(p, t) { p.sprite = 'sit'; p.rot = Math.sin(t * 0.8) * 1; } },
    sleep: { pose(p, t) { p.sprite = 'sleep'; p.sy = 1 + Math.sin(t * 1.2) * 0.012; p.sway = 0.006; } },
    float: { pose(p, t) { nightPose(p, t); } },
  };
  function nightPose(p, t) {
    // 久留美的夜晚是在电脑前熬夜盯盘，不飘
    if (nightGrounded()) { p.sprite = 'night'; p.sy = 1 + 0.006 * Math.sin(t * 1.6); p.sway = 0.004; return; }
    p.sprite = 'night'; p.y = -14 + Math.sin(t * 1.3) * 7; p.rot = Math.sin(t * 0.7) * 2; p.pivot = 0.7; p.sway = 0.022;
  }
  function setMode(m) {
    if (mode === m) return;
    if (mode === 'thrown') { cur.rot = ((cur.rot % 360) + 540) % 360 - 180; thrownRot = 0; }
    mode = m; modeT = 0;
    if (m === 'sit') sitUntil = now() + rand(25, 60);
  }

  function play(name, o = {}) {
    const def = ACTS[name];
    if (!def) return false;
    if ((mode === 'held' || mode === 'thrown') && !o.any) return false;
    if (action && action.def.music && !o.keepMusic) Snd.stop();
    action = Object.assign({ name, def, t: 0, dur: def.dur }, o);
    return true;
  }
  function stopAction() { if (action && action.def.music) Snd.stop(); action = null; }
  function endAction() {
    const a = action;
    action = null;
    if (typeof a.then === 'function') a.then();
    else if (a.then) play(a.then);
  }

  // ---------- 气泡 / 特效 ----------
  let talkUntil = 0, bubbleTimer = null, typeTimer = null, lastSay = 0;
  function say(text, o = {}) {
    if (!text) return;
    if (o.chatter && (S.settings.quiet || Feat.focusing())) return;
    const b = $('#bubble'), el = b.querySelector('.text');
    clearTimeout(bubbleTimer); clearInterval(typeTimer);
    b.classList.remove('hidden'); b.classList.remove('out');
    el.textContent = '';
    const chars = [...text];
    let i = 0;
    typeTimer = setInterval(() => {
      if (i >= chars.length) { clearInterval(typeTimer); return; }
      el.textContent += chars[i]; Snd.say(chars[i]); i++;
    }, 50);
    talkUntil = now() + chars.length * 0.05;
    lastSay = now();
    bubbleTimer = setTimeout(hideBubble, (o.dur || Math.max(2.6, chars.length * 0.18 + 1.4)) * 1000);
  }
  function hideBubble() {
    const b = $('#bubble');
    b.classList.add('out');
    bubbleTimer = setTimeout(() => b.classList.add('hidden'), 300);
  }
  const GLYPH = { heart: '♥︎', note: () => pick(['♪', '♫', '♬']), star: '✦', spark: '✧', z: 'z', bang: '!', q: '?', dots: '…', yen: '¥', up: '▲', down: '▼', drop: '💧', bubble: '○', confetti: () => pick(['❖', '◆', '✦']), rain: '│' };
  // qx/qy：相对角色包围盒的位置（0..1）
  function fx(kind, qx, qy) {
    const p = Chara.at(qx, qy);
    const d = document.createElement('div');
    const g = GLYPH[kind];
    d.className = `fx fx-${kind}`;
    d.textContent = typeof g === 'function' ? g() : g;
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
    d.style.setProperty('--dx', rand(-26, 26).toFixed(0) + 'px');
    $('#fx').appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }
  function burst(kind, n) {
    for (let i = 0; i < n; i++) setTimeout(() => fx(kind, 0.5 + rand(-0.3, 0.3), 0.06 + rand(-0.05, 0.1)), i * 140);
  }
  let badgeEl = null;
  function setBadge(text, phase) {
    badgeEl = badgeEl || $('#badge');
    if (!text) { badgeEl.classList.add('hidden'); return; }
    badgeEl.classList.remove('hidden');
    badgeEl.textContent = text;
    badgeEl.classList.toggle('brk', phase === 'break');
    badgeEl.dataset.phase = phase || '';
  }

  // ---------- 好感度 ----------
  const affCool = {};
  function addAff(n, key) {
    if (key) { if (now() - (affCool[key] || -99) < 4) return; affCool[key] = now(); }
    const before = Feat.level(S.affection).i;
    S.affection = Math.max(0, S.affection + n);
    const after = Feat.level(S.affection).i;
    if (after > before) {
      setTimeout(() => { play('cheer'); Snd.fanfare(); burst('heart', 5); say(`好感度提升到「${Feat.level(S.affection).name}」啦！`, { dur: 5 }); }, 1800);
    }
    save();
  }
  const highAff = () => S.affection >= 150;

  // ---------- 交互动作 ----------
  function pat() {
    if (action && action.name === 'pat') action.t = Math.min(action.t, 0.3);
    else play('pat');
    burst('heart', 2);
    if (now() - lastSay > 2.5) say(pick(highAff() && Math.random() < 0.5 ? L.patHigh : L.pat));
    S.stats.pats++; addAff(1, 'pat');
  }
  function pokeCheek() { play('pokeCheek'); Snd.blip(2); say(pick(L.pokeCheek)); S.stats.pokes++; save(); }
  function pokeBody() { play('pokeBody'); Snd.boing(); fx('bang', 0.72, 0.08); say(pick(L.pokeBody)); S.stats.pokes++; save(); }
  function tickle() { play('tickle'); burst('spark', 3); say(pick(L.tickle)); addAff(1, 'tickle'); }
  function tailPull(side) { play('tailPull', { side: side || 1 }); Snd.sad(); say(pick(L.tail)); addAff(-1, 'tail'); }
  function sing() {
    stopAction();
    const r = Snd.play(pick(['sing1', 'sing2']));
    play('sing', { dur: r.dur + 0.6, notes: r.notes, keepMusic: true, then: () => { say(pick(L.singEnd)); addAff(1); } });
    say(pick(L.sing), { dur: 2.2 });
    S.stats.songs++; save();
  }
  function musicAct(act, song, lines) {
    stopAction();
    const r = Snd.play(song);
    play(act, { dur: r.dur + 0.3, notes: r.notes, keepMusic: true });
    say(pick(lines), { dur: 2.2 });
  }
  function hum() {
    stopAction();
    const r = Snd.play('hum');
    play('hum', { dur: r.dur + 0.4, notes: r.notes, keepMusic: true });
  }
  let feedLog = [];
  function feed() {
    feedLog = feedLog.filter((t) => Date.now() - t < 3600e3);
    if (feedLog.length >= 6) { play('shy'); say(pick(L.feedFull)); return; }
    feedLog.push(Date.now());
    play('eat', { then: () => burst('heart', 2) });
    burst('spark', 2);
    say(pick(L.feed));
    S.stats.feeds++; addAff(2);
  }
  function goSleep() { stopAction(); setMode('sleep'); say(pick(L.sleep), { dur: 3 }); }
  function wakeUp(silent) {
    if (mode !== 'sleep') return;
    setMode(S.settings.night ? 'float' : 'idle');
    if (!silent) { play('wake'); say(pick(L.wake)); }
  }
  function sit() { stopAction(); setMode('sit'); say(pick(L.sit)); }
  function standUp() { setMode(S.settings.night ? 'float' : 'idle'); play('jump'); say(pick(L.stand)); }

  // ---------- 「即刻轮回」主题 ----------
  let transformUntil = 0;
  const rinne = () => S.settings.skin === 'rinne';
  function flash() {
    const f = $('#flash'), c = Chara.at(0.5, 0.45);
    f.style.left = c.x + 'px'; f.style.top = c.y + 'px';
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  function starShot() {
    Snd.sparkle();
    for (let i = 0; i < 7; i++) setTimeout(() => fx('star', 0.5 + rand(-0.45, 0.45), 0.25 + rand(-0.15, 0.25)), i * 70);
  }
  function transform() {
    stopAction();
    if (!rinne()) { play('cheer'); burst('star', 4); Snd.fanfare(); return; }
    if (Chara.form === 'm') { transformUntil = now() + 180; play('magic'); say(pick(L.magic)); return; }
    play('transform');
    Snd.transform();
    say(pick(L.transform), { dur: 2.4 });
    setTimeout(() => { Chara.setForm('m'); transformUntil = now() + 180; }, 750);
    burst('spark', 4);
  }
  function untransform(silent) {
    if (Chara.form !== 'm') return;
    Chara.setForm('u');
    transformUntil = 0;
    if (!silent) { play('wave'); say(pick(L.untransform)); }
  }
  function retry(auto) {
    stopAction();
    if (mode === 'walk') api.send('stop-walk');
    setMode(S.settings.night ? 'float' : 'idle');
    play('retry');
    Snd.rewind();
    say(pick(auto ? L.retryAuto : L.retry), { dur: 2.6 });
    setTimeout(() => api.send('rewind', { mode: auto ? 'drag' : 'time' }), 450);
    S.stats.retries++; save();
  }
  Chara.onFormSwap(() => { flash(); burst('star', 4); });

  // ---------- 「FX战士久留美」主题 ----------
  // FX 模拟盘（features.js）通过它让久留美做出反应
  function fxReact(kind) {
    if (['held', 'thrown', 'fall'].includes(mode)) return;
    if (mode === 'sleep') wakeUp(true);
    if (mode === 'walk') { api.send('stop-walk'); setMode(S.settings.night ? 'float' : 'idle'); }
    if (mode === 'sit') setMode('idle');
    lastActivity = now();
    const R = {
      buy: ['buy', L.buy, () => { Snd.pop(); burst('up', 3); }],
      sell: ['sell', L.sell, () => { Snd.pop(); burst('down', 3); }],
      profit: ['profit', L.profit, () => Snd.coin()],
      loss: ['sad', L.loss, () => Snd.sad()],
      losscut: ['losscut', L.losscut, () => { Snd.alarm(); burst('drop', 3); }],
      hot: ['cheer', L.fxHot, () => burst('up', 2)],
      cold: ['pray', L.fxCold, () => burst('drop', 1)],
      news: ['surprised', L.fxNews, () => { Snd.boing(); fx('bang', 0.72, 0.08); }],
      frenzy: ['frenzy', L.frenzy, () => burst('yen', 3)],
      lev: ['think', L.fxLev, () => {}],
      reset: ['study', L.fxReset, () => {}],
      goal: ['cheer', L.fxGoal, () => { Snd.fanfare(); burst('yen', 6); burst('star', 4); }],
    }[kind];
    if (!R) return;
    stopAction(); play(R[0]); say(pick(R[1]), { dur: 3.2 }); R[2]();
  }

  const ACT_FN = {
    transform: () => transform(),
    untransform: () => untransform(),
    magic: () => { play('magic'); say(pick(L.magic)); addAff(1, 'magic'); },
    retry: () => retry(false),
    wave: () => { play('wave'); say(pick(L.wave)); },
    sing, feed,
    leek: () => musicAct('leek', 'polka', L.leek),
    dance: () => musicAct('dance', 'dance', L.dance),
    spin: () => { play('spin'); Snd.whoosh(); say(pick(L.spin)); },
    jump: () => { play('jump'); Snd.boing(); },
    stretch: () => { play('stretch'); say(pick(L.stretch)); },
    sit: () => sit(),
    sleep: () => goSleep(),
    drink: () => { play('drink'); say(pick(L.drink)); addAff(1, 'drink'); },
    chart: () => { play('chart'); say(pick(L.chart)); },
    study: () => { play('study'); say(pick(L.study)); addAff(1, 'study'); },
    pray: () => { play('pray'); say(pick(L.pray)); },
    frenzy: () => { play('frenzy'); Snd.boing(); burst('yen', 3); say(pick(L.frenzy)); },
    bow: () => { play('bow'); Snd.fanfare(); setTimeout(() => burst('heart', 3), 900); say(pick(L.bow)); addAff(1, 'bow'); },
    salon: () => { play('salon'); Snd.sparkle(); say(pick(L.salon)); },
    rejoice: () => { play('rejoice'); Snd.fanfare(); say(pick(L.rejoice)); },
    brave: () => { play('brave'); say(pick(L.brave)); },
    cry: () => { play('cry'); Snd.sad(); burst('drop', 2); say(pick(L.cry)); },
    verdict: () => { play('verdict'); Snd.boing(); say(pick(L.verdict)); },
  };
  function doAct(id) {
    if (mode === 'held' || mode === 'thrown' || mode === 'fall') return;
    if (mode === 'walk') { api.send('stop-walk'); setMode(S.settings.night ? 'float' : 'idle'); }
    if (mode === 'sleep' && id !== 'sleep') setMode(S.settings.night ? 'float' : 'idle');
    if (mode === 'sit' && id !== 'sit' && id !== 'sleep') setMode('idle');
    if (S.settings.night && mode === 'float' && (id === 'sit' || id === 'sleep')) setSetting('night', false);
    lastActivity = now();
    (ACT_FN[id] || (() => {}))();
  }

  // ---------- 月夜 ----------
  function setNight(on, announce) {
    document.body.classList.toggle('night', on);
    if (on) {
      if (mode === 'walk') api.send('stop-walk');
      if (['idle', 'sit', 'walk', 'sleep'].includes(mode)) setMode('float');
      if (nightGrounded() && S.settings.gravity) api.send('fall');
      if (announce) { say(pick(L.night)); burst('star', 3); Snd.sparkle(); }
    } else {
      if (mode === 'float') setMode('idle');
      if (S.settings.gravity) api.send('fall');
      if (announce) say(pick(L.day));
    }
  }
  function buildStars() {
    const m = $('#moon');
    const stars = [[-0.5, -0.1, 1], [0.48, 0.05, 0.8], [-0.42, 0.45, 0.7], [0.52, 0.55, 1], [-0.15, -0.18, 0.6], [0.3, -0.12, 0.6], [-0.55, 0.25, 0.8], [0.4, 0.8, 0.7], [-0.4, 0.85, 0.9]];
    m.innerHTML = stars.map(([x, y, s], i) => `<span class="star" style="--x:${x};--y:${y};--s:${s};animation-delay:${(i * 0.37).toFixed(2)}s">✦</span>`).join('');
  }

  // ---------- 布局 ----------
  let sc = 1, unit = 290;
  function layout() {
    sc = S.settings.scale;
    unit = Math.round(290 * sc);
    Chara.setUnit(unit);
    const W = Math.round(Math.max(340, unit * 1.12 + 40)), H = Math.round(unit + 250);
    document.documentElement.style.setProperty('--sc', sc);
    document.documentElement.style.setProperty('--unit', unit + 'px');
    api.send('layout', { w: W, h: H, feet: 8, top: H - unit - 8, half: Math.round(unit * 0.22) });
  }

  // ---------- 交互输入 ----------
  let ignoring = true, down = null, hoverStart = 0, lastShy = 0, pokeTimes = [];
  const rub = { d: 0, x: null, y: null, t: 0 };
  function hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest('.ui')) return { ui: true };
    return Chara.partAt(x, y);
  }
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.send('ignore', v); } }

  document.addEventListener('mousemove', (e) => {
    lastActivity = now();
    if (down) {
      if (!down.moved && Math.hypot(e.screenX - down.sx, e.screenY - down.sy) > 5) startDrag();
      return;
    }
    const h = hitTest(e.clientX, e.clientY);
    setIgnore(!h);
    document.body.classList.toggle('grab', !!(h && h.part));
    if (h && h.part) {
      if (!hoverStart) hoverStart = now();
      if (h.part === 'head' && mode !== 'sleep') {
        const t = now();
        if (rub.x != null && t - rub.t < 0.25) rub.d += Math.hypot(e.clientX - rub.x, e.clientY - rub.y);
        else rub.d = 0;
        rub.x = e.clientX; rub.y = e.clientY; rub.t = t;
        if (rub.d > 280) { rub.d = 0; pat(); }
      }
    } else { hoverStart = 0; rub.x = null; }
  });
  document.addEventListener('mouseleave', () => { if (!down) setIgnore(true); hoverStart = 0; rub.x = null; });
  document.addEventListener('mousedown', (e) => {
    Snd.unlock();
    if (e.button !== 0) return;
    const h = hitTest(e.clientX, e.clientY);
    if (!h || h.ui) return;
    e.preventDefault();
    down = { sx: e.screenX, sy: e.screenY, cx: e.clientX, cy: e.clientY, h, moved: false };
  });
  document.addEventListener('mouseup', () => {
    if (!down) return;
    const d = down;
    down = null;
    if (d.moved) api.send('drag-end', { gravity: S.settings.gravity && !(S.settings.night && !nightGrounded()) });
    else onClick(d.h);
  });
  document.addEventListener('dblclick', (e) => {
    const h = hitTest(e.clientX, e.clientY);
    if (!h || h.ui || mode === 'sleep' || mode === 'sit' || mode === 'float') return;
    if (h.part === 'head' || h.part === 'body') { play('spin'); Snd.whoosh(); if (now() - lastSay > 1) say(pick(L.spin)); }
  });
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const h = hitTest(e.clientX, e.clientY);
    if (h && !h.ui) {
      api.send('menu-state', { pomo: Feat.pomoLabel(), fx: Feat.fxLabel(), form: Chara.form });
      api.send('popup');
    }
  });
  $('#bubble').addEventListener('click', hideBubble);

  function onClick(h) {
    lastActivity = now();
    Snd.pop();
    if (mode === 'sleep') { wakeUp(); return; }
    if (mode === 'sit' && h.part !== 'head') { standUp(); return; }
    if (mode === 'walk') { api.send('stop-walk'); setMode(S.settings.night ? 'float' : 'idle'); }
    if (h.part === 'head') {
      if (cur.sprite === 'front' && h.qy > 0.215 && Math.abs(h.qx - 0.5) < 0.16) return pokeCheek();
      return pat();
    }
    if (h.part === 'tail') return tailPull(h.side);
    if (h.part === 'legs') { play('jump'); Snd.boing(); if (Math.random() < 0.5) say(pick(L.legs)); return; }
    pokeTimes = pokeTimes.filter((t) => now() - t < 2);
    pokeTimes.push(now());
    if (pokeTimes.length >= 4) { pokeTimes = []; return tickle(); }
    pokeBody();
  }

  function startDrag() {
    down.moved = true;
    stopAction();
    shake = 0;
    if (mode === 'walk') api.send('stop-walk');
    api.send('drag-start', { ox: down.cx, oy: down.cy });
    setMode('held');
    Snd.whoosh();
    say(pick(L.held));
  }

  // ---------- 主进程事件 ----------
  let tick = null, lastActivity = now(), heldShakeSaid = false;
  api.on('tick', (d) => {
    if (tick && (d.cx !== tick.cx || d.cy !== tick.cy)) {
      if (now() - lastActivity > 90 && (mode === 'idle' || mode === 'float') && !action) { play('wave'); say(pick(L.back)); }
      lastActivity = now();
    }
    // 自己根据全局鼠标位置做命中判断：桌面在前台时系统不会转发鼠标移动事件
    if (!down) {
      const x = d.cx - d.wx, y = d.cy - d.wy;
      const inside = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
      const h = inside ? hitTest(x, y) : null;
      setIgnore(!h);
      document.body.classList.toggle('grab', !!(h && h.part));
    }
    if (d.dx || d.dy) Chara.push(d.dx, d.dy);
    const px = sv.x, py = sv.y;
    sv.x = sv.x * 0.75 + d.dx * 0.25; sv.y = sv.y * 0.75 + d.dy * 0.25;
    if (mode === 'held') {
      shake = shake * 0.97 + Math.abs(sv.x - px) + Math.abs(sv.y - py);
      if (shake > 70 && !heldShakeSaid) { heldShakeSaid = true; say(pick(L.shake)); }
    } else { shake *= 0.9; heldShakeSaid = false; }
    tick = d;
  });
  api.on('thrown', () => { setMode('thrown'); say(pick(L.thrown)); S.stats.throws++; addAff(-1, 'throw'); });
  api.on('falling', () => { setMode('fall'); if (Math.random() < 0.5) say(pick(L.floatDown)); });
  api.on('flung', () => say(pick(L.flung)));
  api.on('bump', (w) => { Snd.thud(); burst('star', 2); if (w !== 'floor' && now() - lastSay > 1.2) say(pick(L.bump)); });
  api.on('landed', (d) => {
    const shaken = shake > 60;
    setMode(S.settings.night ? 'float' : 'idle');
    if (d.hard && rinne()) { Snd.thud(); play('land', { then: () => retry(true) }); }
    else if (d.hard && isFurina()) { Snd.thud(); play('land', { then: () => play('cry', { then: 'brave' }) }); say(pick(L.hardLand), { dur: 3.5 }); }
    else if (d.hard && isKurumi()) { Snd.thud(); play('land', { then: () => { play('losscut'); Snd.alarm(); } }); say(pick(L.forcedLosscut), { dur: 3.5 }); }
    else if (d.hard) { Snd.thud(); play('land', { then: 'dizzy' }); say(pick(L.dizzy), { dur: 3.5 }); }
    else if (shaken) { play('dizzy'); say(pick(L.dizzy)); }
    else if (!d.stay) { play('softLand'); if (Math.random() < 0.4) say(pick(L.land)); }
  });
  api.on('walk-end', (r) => {
    if (mode === 'walk') setMode(S.settings.night ? 'float' : 'idle');
    if (r === 'edge') walkDir = -walkDir;
  });
  api.on('rewound', () => { play('softLand'); burst('spark', 3); });
  api.on('shown', () => { play('wave'); say(pick(L.back)); });
  api.on('menu', ({ id, v }) => {
    Snd.unlock();
    if (id === 'act') doAct(v);
    else if (id === 'panel') { Feat.open(v); setIgnore(false); }
    else if (id === 'set') setSetting(v.key, v.val);
    else if (id === 'ground') { if (S.settings.night) setSetting('night', false); else api.send('fall'); }
    else if (id === 'hide') { say(pick(L.hide), { dur: 1.6 }); play('wave'); setTimeout(() => api.send('hide', 600000), 1500); }
    else if (id === 'quit') { say(pick(L.bye), { dur: 2 }); play('wave'); save(); setTimeout(() => api.send('quit'), 1600); }
  });

  // ---------- 设置 ----------
  function setSetting(key, val) {
    S.settings[key] = val;
    applySettings(key);
    save();
  }
  function applySettings(changed) {
    const s = S.settings;
    Snd.enable(s.sound); Snd.voice(s.voice);
    api.send('settings', s);
    if (!changed || changed === 'scale') layout();
    if (changed === 'night') setNight(s.night, true);
    if (changed === 'gravity' && s.gravity && !s.night) api.send('fall');
    if (changed === 'walk' && !s.walk && mode === 'walk') { api.send('stop-walk'); setMode('idle'); }
    if (changed === 'sound' && s.sound) Snd.pop();
    if (changed === 'skin') applySkin(true);
  }

  // ---------- 自主行为 ----------
  let nextAuto = rand(5, 9), zzzT = 0, sleepTalkT = rand(40, 80);
  function cursorInfo() {
    if (!tick) return { gx: 0, dist: 9999 };
    const hp = Chara.at(0.5, 0.2);
    const dx = tick.cx - (tick.wx + hp.x), dy = tick.cy - (tick.wy + hp.y);
    return { gx: clamp(dx / 350, -1, 1), dist: Math.hypot(dx, dy) };
  }
  function weighted(list) {
    const tot = list.reduce((a, x) => a + x[1], 0);
    let r = Math.random() * tot;
    for (const [k, w] of list) { if ((r -= w) <= 0) return k; }
    return list[0][0];
  }
  function brain(dt) {
    if (down) return;
    const t = now();
    if (mode === 'sleep') {
      zzzT -= dt;
      if (zzzT <= 0) { zzzT = 1.7; fx('z', 0.66 + rand(-0.03, 0.03), 0.22); }
      sleepTalkT -= dt;
      if (sleepTalkT <= 0) { sleepTalkT = rand(50, 110); if (!S.settings.quiet) say(pick(L.sleepTalk), { dur: 3 }); }
      return;
    }
    if (['held', 'thrown', 'fall', 'walk'].includes(mode) || action) return;

    const idleFor = t - lastActivity;
    if (S.settings.sleepAfter && idleFor > S.settings.sleepAfter * 60 && !Feat.isOpen()) {
      lastActivity = t - S.settings.sleepAfter * 60 + 5;
      if (mode === 'float') setSetting('night', false);
      say(pick(L.sleepy));
      play('yawn', { then: goSleep });
      return;
    }
    if (hoverStart && t - hoverStart > 3.5 && t - lastShy > 25 && mode === 'idle') {
      lastShy = t; play('shy'); say(pick(L.hover)); return;
    }
    if (mode === 'sit' && t > sitUntil) { standUp(); return; }

    nextAuto -= dt;
    if (nextAuto > 0) return;
    nextAuto = rand(7, 16) * (S.settings.quiet ? 1.8 : 1) * (Feat.focusing() ? 2 : 1);
    const near = cursorInfo().dist < 220 * sc;
    const canWalk = S.settings.walk && !Feat.isOpen() && !Feat.focusing();
    let opts;
    const K = isKurumi(), holding = K && Feat.fxHolding();
    if (mode === 'sit') opts = [[K ? 'chat' : 'hum', 1], ['chat', 1.5], ['nothing', 2]];
    else if (mode === 'float') opts = nightGrounded() ? [['chatNight', 1.5], ['hum', isFurina() ? 0.6 : 0], ['nothing', 2]] : [['chatNight', 1], ['hum', 1], ['walk', canWalk ? 1.6 : 0], ['nothing', 1.5]];
    else if (isFurina()) opts = [['walk', canWalk ? 3 : 0], ['lookAround', 1.5], ['chat', 2], ['hum', 1.2], ['bow', 0.5], ['salon', 0.35], ['brave', 0.2],
      ['rain', 0.08], ['stretch', 1], ['tilt', 0.8], ['sit', 0.8], ['wave', near ? 1.5 : 0], ['dance', 0.25], ['spin', 0.4], ['think', 0.6], ['nothing', 1.5]];
    else if (K) opts = [['walk', canWalk && !holding ? 3 : 0], ['lookAround', 1.5], ['chat', 2], ['chart', holding ? 3 : 1.4], ['study', 0.7], ['stretch', 1],
      ['tilt', 0.8], ['sit', 0.8], ['wave', near ? 1.5 : 0], ['pray', holding ? 0.6 : 0.12], ['frenzy', holding ? 0.4 : 0.08], ['spin', 0.2], ['think', 0.6], ['nothing', 1.5]];
    else opts = [['walk', canWalk ? 3 : 0], ['lookAround', 2], ['chat', 2], ['hum', 1.2], ['stretch', 1], ['tilt', 1],
      ['sit', 0.8], ['wave', near ? 1.5 : 0], ['dance', 0.25], ['leek', 0.2], ['spin', 0.3], ['think', 0.6], ['nothing', 1.5]];
    if (rinne() && mode === 'idle') opts.push(['magic', 0.6], ['glitchBlip', 0.5], ['transform', Chara.form === 'u' ? 0.25 : 0]);
    const c = weighted(opts);
    if (c === 'walk') {
      if (Math.random() < 0.35) walkDir = -walkDir;
      stopAction();
      api.send('walk', { dx: walkDir * rand(120, 420) * sc, speed: (S.settings.night ? 0.8 : 1.1) * sc });
      setMode('walk');
    } else if (c === 'chat') say(pick(highAff() && Math.random() < 0.3 ? L.chatterHigh : L.chatter), { chatter: true });
    else if (c === 'chatNight') say(pick(L.night), { chatter: true });
    else if (c === 'hum') { if (S.settings.sound && !Feat.focusing()) hum(); else play('nod'); }
    else if (c === 'sit') sit();
    else if (c === 'wave') { play('wave'); say(pick(L.wave), { chatter: true }); }
    else if (c === 'dance' || c === 'leek') { if (!Feat.focusing() && !S.settings.quiet) doAct(c); }
    else if (c === 'spin') play('spin');
    else if (c === 'magic') { play('magic'); say(pick(L.magic), { chatter: true }); }
    else if (c === 'transform') { if (!Feat.focusing() && !S.settings.quiet) transform(); }
    else if (['chart', 'study', 'pray', 'frenzy', 'bow', 'salon', 'brave', 'rain'].includes(c)) { play(c); if (Math.random() < 0.5) say(pick(L[c]), { chatter: true }); }
    else if (c !== 'nothing') play(c);
  }

  // ---------- 主循环 ----------
  let blinkT = rand(2, 5), blinkPh = 0;
  function frame(ts) {
    const tt = ts / 1000, dt = Math.min(0.05, lastT ? tt - lastT : 0.016);
    lastT = tt; T += dt; modeT += dt;

    const p = Object.assign(tgt, BASE, { sprite: 'front', fast: false, direct: null, glitch: 0 });
    p.sy = 1 + 0.008 * Math.sin(T * 2.1);   // 呼吸
    MODES[mode].pose(p, modeT, dt);
    if (action) {
      action.t += dt;
      p.flip = 1;   // 动作立绘默认朝前，翻转由动作自己决定
      action.def.pose(p, action.t, action, dt);
      if (action.def.fast) p.fast = true;
      if (action.def.direct) p.direct = action.def.direct;
      if (action && action.t >= action.dur) endAction();
    }
    // 闲着时身体微微朝向鼠标
    if (mode === 'idle' && !action) p.rot += cursorInfo().gx * 1.8;

    const k = 1 - Math.exp(-dt * (p.fast ? 28 : 12));
    for (const key in BASE) cur[key] += (p[key] - cur[key]) * k;
    if (p.direct) p.direct.forEach((key) => (cur[key] = p[key]));
    cur.sprite = p.sprite; cur.glitch = p.glitch;

    blinkT -= dt;
    if (blinkT < 0) { blinkPh = 0.13; blinkT = Math.random() < 0.2 ? 0.28 : rand(2.5, 6); }
    if (blinkPh > 0) blinkPh -= dt;
    const talking = now() < talkUntil && Math.floor(T * 9) % 2 === 1;

    Chara.render({ ...cur, blink: blinkPh > 0, talk: talking, warm: S.settings.skin === 'classic' && !S.settings.night ? 0.3 : 0 }, dt);
    brain(dt);
    placeUi();
    requestAnimationFrame(frame);
  }
  function placeUi() {
    const hp = Chara.headTop();
    const b = $('#bubble');
    b.style.left = clamp(hp.x, 125, window.innerWidth - 125) + 'px';
    b.style.top = Math.max(60, hp.y) + 'px';
    if (badgeEl) { const bp = Chara.at(0.5, 1); badgeEl.style.left = bp.x + 'px'; badgeEl.style.top = Math.min(bp.y, window.innerHeight - 30) + 'px'; }
    const m = $('#moon'), mp = Chara.at(0.5, 0.4);
    m.style.left = mp.x + 'px'; m.style.top = mp.y + 'px';
  }

  // ---------- 每秒 ----------
  function skinClass() {
    ['classic', 'rinne', 'kurumi', 'furina'].forEach((k) => document.body.classList.toggle('skin-' + k, S.settings.skin === k));
  }
  async function applySkin(announce) {
    const name = S.settings.skin;
    await Chara.setSkin(name);
    Chara.setForm('u');
    transformUntil = 0;
    skinClass();
    makeTrayIcon();
    if (S.settings.night) setNight(true, false);
    if (announce) { flash(); burst('star', 4); Snd.sparkle(); play('wave'); say(pick(name === 'classic' ? LINES.skinClassic : L.skin)); }
  }

  let lastNightCheck = 0;
  function secondTick() {
    Feat.tick();
    if (Chara.form === 'm' && transformUntil && now() > transformUntil && !['held', 'thrown', 'fall'].includes(mode) && !action) untransform();
    if (S.settings.autoNight && Date.now() - lastNightCheck > 60000) {
      lastNightCheck = Date.now();
      const h = new Date().getHours(), want = h >= 19 || h < 6;
      if (want !== S.settings.night && mode !== 'sleep') setSetting('night', want);
    }
  }

  function greeting() {
    const h = new Date().getHours(), G = L.greet;
    return pick(h < 5 || h >= 23 ? G.late : h < 11 ? G.morning : h < 14 ? G.noon : h < 18 ? G.afternoon : G.evening);
  }
  // 托盘图标：从原图正面裁出脸部
  function makeTrayIcon() {
    const f = Chara.sprite('front');
    if (!f) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fillStyle = '#f6efe2'; g.fill(); g.clip();
    const bh = f.bb.y1 - f.bb.y0, size = bh * 0.22;
    g.drawImage(f.img, (f.bb.x0 + f.bb.x1) / 2 - size / 2, f.bb.y0 + bh * 0.07, size, size, 0, 0, 64, 64);
    api.send('tray-icon', c.toDataURL('image/png'));
  }

  // ---------- 启动 ----------
  async function init() {
    let saved = null;
    try { saved = await api.invoke('load'); } catch {}
    if (saved) {
      Object.assign(S, saved);
      S.settings = { ...DEFAULTS, ...(saved.settings || {}) };
      S.stats = { ...S.stats, ...(saved.stats || {}) };
      S.todos = saved.todos || []; S.reminders = saved.reminders || [];
    }
    Chara.mount($('#pet'));
    await Chara.setSkin(S.settings.skin);
    skinClass();
    buildStars();
    Feat.init(M);
    applySettings();
    api.send('ready');
    makeTrayIcon();
    if (S.settings.night) setNight(true, false);
    setTimeout(() => {
      if (S.stats.lastDay !== today()) {
        const first = !S.stats.lastDay;
        S.stats.lastDay = today();
        addAff(3);
        say(first ? pick(L.hello) : greeting(), { dur: first ? 6 : 4.5 });
      } else say(greeting());
      play('wave');
      save();
    }, 700);
    requestAnimationFrame(frame);
    setInterval(secondTick, 1000);
  }

  const M = {
    L, transform, retry, fxReact, chara,
    S, say, play, save, fx: burst, addAff, setBadge, doAct, set: setSetting,
    walk: (d = 1) => { stopAction(); walkDir = d; api.send('walk', { dx: d * 300 * sc, speed: 1.1 * sc }); setMode('walk'); },
    wake: () => wakeUp(true),
    mode: () => mode,
    busy: () => ['held', 'thrown', 'fall'].includes(mode) || !!(action && action.def.music),
    notify: (title, body) => api.send('notify', { title, body }),
  };
  window.__pet = M;

  // 浏览器预览用的假主进程
  function mockApi() {
    const h = {};
    let mx = 0, my = 0;
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    document.documentElement.classList.add('preview');
    setInterval(() => h.tick && h.tick({ cx: mx, cy: my, wx: 0, wy: 0, dx: 0, dy: 0, mode: 'idle', onGround: true }), 16);
    return {
      send(ch, d) {
        if (ch === 'drag-end') setTimeout(() => h.landed && h.landed({ hard: false }), 50);
        if (ch === 'walk') setTimeout(() => h['walk-end'] && h['walk-end'](), 2500);
        if (ch === 'rewind') setTimeout(() => h.rewound && h.rewound(), 600);
        if (ch === 'save') { try { localStorage.setItem('deskpet', JSON.stringify(d)); } catch {} }
      },
      invoke: async () => { try { return JSON.parse(localStorage.getItem('deskpet')); } catch { return null; } },
      on(ch, fn) { h[ch] = fn; },
    };
  }

  init();
})();
