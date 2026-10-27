// 功能面板：番茄钟、待办、定时提醒、猜拳、今日运势、好感度、说明、FX 模拟盘（久留美）、歌剧院审判（芙宁娜）；以及各种定时提醒
window.Feat = (function () {
  let M = null, openName = null;
  const $p = () => document.getElementById('panel');
  const today = () => new Date().toLocaleDateString('zh-CN');
  const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LV = [[0, '初次见面'], [20, '有点熟悉'], [60, '好朋友'], [150, '亲密伙伴'], [300, '最重要的人'], [600, '心意相通']];
  function level(a) {
    let i = 0;
    while (i + 1 < LV.length && a >= LV[i + 1][0]) i++;
    const next = LV[i + 1];
    return { i, name: LV[i][1], cur: LV[i][0], next: next ? next[0] : null };
  }

  // ---------- 番茄钟 ----------
  function pomo() { return M.S.pomo; }
  function pomoRemain() {
    const P = pomo();
    if (P.phase === 'idle') return M.S.settings.pomoWork * 60000;
    return P.paused != null ? P.paused : P.end - Date.now();
  }
  function pomoStart() {
    const P = pomo();
    if (P.phase === 'idle') {
      P.phase = 'work'; P.end = Date.now() + M.S.settings.pomoWork * 60000; P.paused = null;
      M.say(pick(M.L.pomoStart)); M.play('nod');
    } else if (P.paused != null) {
      P.end = Date.now() + P.paused; P.paused = null; M.say('继续！');
    } else {
      P.paused = P.end - Date.now(); M.say('先暂停一下～');
    }
    M.save(); refresh();
  }
  function pomoReset() {
    Object.assign(pomo(), { phase: 'idle', end: 0, paused: null });
    M.setBadge(null); M.save(); refresh();
  }
  function pomoTick() {
    const P = pomo();
    if (P.phase === 'idle') { const b = fxBadge(); M.setBadge(b && b[0], b && b[1]); return; }
    const left = pomoRemain();
    M.setBadge(`${P.phase === 'work' ? '专注' : '休息'} ${mmss(left)}${P.paused != null ? ' ‖' : ''}`, P.phase);
    if (P.paused != null || left > 0) return;
    if (P.phase === 'work') {
      const d = today();
      if (P.day !== d) { P.day = d; P.count = 0; }
      P.count++; M.S.stats.pomos++;
      P.phase = 'break'; P.end = Date.now() + M.S.settings.pomoBreak * 60000;
      M.wake(); M.play('cheer'); Snd.fanfare(); M.fx('star', 3); M.addAff(4);
      M.say(pick(M.L.pomoDone), { dur: 5 });
      M.notify('番茄钟', `专注完成！休息 ${M.S.settings.pomoBreak} 分钟吧～`);
    } else {
      P.phase = 'idle';
      M.wake(); M.play('wave'); Snd.chime();
      M.say(pick(M.L.breakDone), { dur: 4 });
      M.notify('番茄钟', '休息结束，继续加油！');
    }
    M.save();
  }
  const pomoLabel = () => {
    const P = M && pomo();
    if (!P || P.phase === 'idle') return '';
    return `${P.phase === 'work' ? '专注中' : '休息中'} ${mmss(pomoRemain())}`;
  };

  // ---------- 定时类提醒 ----------
  const timers = { water: Date.now(), sit: Date.now(), hour: new Date().getHours() };
  function remindersTick() {
    const s = M.S.settings, nowMs = Date.now();
    // 自定义提醒
    const due = M.S.reminders.filter((r) => r.due <= nowMs);
    if (due.length) {
      M.S.reminders = M.S.reminders.filter((r) => r.due > nowMs);
      due.forEach((r, i) => setTimeout(() => {
        M.wake(); M.play('wave'); Snd.chime();
        M.say(`提醒你：${r.text}`, { dur: 8 });
        M.notify(`${M.chara().name} 提醒你`, r.text);
      }, i * 4000));
      M.save(); refresh();
    }
    const busy = M.busy();
    // 喝水
    if (s.water && nowMs - timers.water > s.water * 60000 && !busy) {
      timers.water = nowMs;
      M.wake(); M.play('drink'); M.say(pick(M.L.water), { dur: 5 });
    }
    // 久坐
    if (s.sitRemind && nowMs - timers.sit > s.sitRemind * 60000 && !busy) {
      timers.sit = nowMs;
      M.wake(); M.play('stretch'); M.say(pick(M.L.sitLong), { dur: 5 });
      M.notify('该活动一下啦', '已经坐了很久了，站起来走走吧～');
    }
    // 整点报时
    const d = new Date();
    if (d.getHours() !== timers.hour && d.getMinutes() === 0) {
      timers.hour = d.getHours();
      if (s.hourly) {
        const h = d.getHours();
        const extra = h === 12 ? '午饭时间到啦～' : h === 18 ? '该吃晚饭咯！' : h >= 23 || h < 5 ? '很晚了，早点休息吧…' :
          h === 8 ? '新的一天，加油！' : h === 15 ? '来点下午茶吧？' : '';
        Snd.chime();
        if (h === 15 && M.chara().id === 'furina') { M.wake(); M.doAct('drink'); M.say(pick(M.L.tea), { dur: 5 }); return; }
        if (M.mode() !== 'sleep') M.play('wave');
        M.say(`${h} 点啦～${extra}`, { dur: 5 });
      }
    } else if (d.getMinutes() !== 0) timers.hour = d.getHours();
  }

  // ---------- FX 模拟盘（久留美） ----------
  // 行情是随机游走 + 偶尔的“指标发布”跳空，纯属虚构，只用来和久留美一起玩
  const FX_START = 300000, FX_GOAL = 20000000, CANDLE = 5;
  const fxm = { price: 150, n: 0, candles: [], drift: 0, hotT: 0, coldT: 0, lastRatio: 0 };
  const yen = (v) => (v < 0 ? '-' : '') + '¥' + Math.round(Math.abs(v)).toLocaleString('en-US');
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) / 1.22; };
  const fxS = () => M.S.fx;
  function fxStep(quiet) {
    if (Math.random() < 0.03) fxm.drift = (Math.random() * 2 - 1) * 0.004;
    let d = gauss() * 0.012 + fxm.drift, news = false;
    if (!quiet && Math.random() < 1 / 160) { d += (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.14); news = true; }
    const p = Math.max(90, Math.min(220, fxm.price + d));
    if (fxm.n % CANDLE === 0) { fxm.candles.push({ o: fxm.price, h: Math.max(fxm.price, p), l: Math.min(fxm.price, p), c: p }); if (fxm.candles.length > 46) fxm.candles.shift(); }
    else { const c = fxm.candles[fxm.candles.length - 1]; c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p; }
    fxm.price = p; fxm.n++;
    return news;
  }
  const fxPL = () => { const P = fxS().pos; return P ? P.side * (fxm.price - P.entry) * P.units : 0; };
  function fxOpen(side) {
    const F = fxS();
    if (F.pos || F.cash < 1000) return;
    const margin = Math.floor(F.cash * F.frac), units = (margin * F.lev) / fxm.price;
    F.cash -= margin;
    // 点差 0.3 钱
    F.pos = { side, margin, units, lev: F.lev, entry: fxm.price + side * 0.003 };
    fxm.lastRatio = 0; fxm.hotT = fxm.coldT = Date.now();
    M.fxReact(side > 0 ? 'buy' : 'sell');
    if (F.frac >= 1 || F.lev >= 100) setTimeout(() => M.fxReact('frenzy'), 2200);
    M.save(); refresh();
  }
  function fxClose(forced) {
    const F = fxS(), P = F.pos;
    if (!P) return;
    const pl = forced ? Math.max(-P.margin, fxPL()) : fxPL();
    F.cash = Math.max(0, F.cash + P.margin + pl);
    F.pos = null; F.trades++;
    if (pl > 0) { F.wins++; F.best = Math.max(F.best, pl); } else F.worst = Math.min(F.worst, pl);
    if (forced) { F.losscuts++; M.fxReact('losscut'); M.notify('强制平仓', `保证金维持率跌破 50%，亏损 ${yen(-pl)}`); }
    else M.fxReact(pl > 0 ? 'profit' : 'loss');
    if (pl > 0) M.addAff(1);
    if (F.cash >= FX_GOAL && !F.goal) { F.goal = true; setTimeout(() => M.fxReact('goal'), 3000); }
    M.save(); refresh();
  }
  function fxTick() {
    const F = fxS();
    if (!F || (!F.pos && openName !== 'fx')) return;
    const news = fxStep();
    if (F.pos) {
      const P = F.pos, ratio = fxPL() / P.margin;
      if (1 + ratio <= 0.5) { fxClose(true); return; }
      const t = Date.now();
      if (news) M.fxReact('news');
      else if (ratio > 0.3 && ratio > fxm.lastRatio + 0.15 && t - fxm.hotT > 20000) { fxm.hotT = t; fxm.lastRatio = ratio; M.fxReact('hot'); }
      else if (ratio < -0.2 && ratio < fxm.lastRatio - 0.1 && t - fxm.coldT > 20000) { fxm.coldT = t; fxm.lastRatio = ratio; M.fxReact('cold'); }
    } else if (news && Math.random() < 0.5) M.fxReact('news');
    if (openName === 'fx') refresh();
  }
  function fxBadge() {
    const F = M && fxS();
    if (!F || !F.pos || M.chara().id !== 'kurumi') return null;
    const pl = fxPL();
    return [`${F.pos.side > 0 ? '多' : '空'} ${fxm.price.toFixed(3)}  ${pl >= 0 ? '+' : ''}${yen(pl)}`, pl >= 0 ? 'up' : 'down'];
  }
  function fxDraw(cv) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, C = fxm.candles, P = fxS().pos;
    g.clearRect(0, 0, W, H);
    if (!C.length) return;
    let lo = Math.min(...C.map((c) => c.l)), hi = Math.max(...C.map((c) => c.h));
    if (P) { lo = Math.min(lo, P.entry); hi = Math.max(hi, P.entry); }
    const pad = (hi - lo) * 0.12 + 0.01; lo -= pad; hi += pad;
    const y = (v) => H - ((v - lo) / (hi - lo)) * H, cw = W / 46;
    g.strokeStyle = 'rgba(160,120,140,.18)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H * i) / 4); g.lineTo(W, (H * i) / 4); g.stroke(); }
    C.forEach((c, i) => {
      const x = i * cw + cw / 2, up = c.c >= c.o;
      g.strokeStyle = g.fillStyle = up ? '#ee6f9c' : '#6aa7d8';
      g.beginPath(); g.moveTo(x, y(c.h)); g.lineTo(x, y(c.l)); g.stroke();
      const top = y(Math.max(c.o, c.c)), h = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
      g.fillRect(x - cw * 0.32, top, cw * 0.64, h);
    });
    if (P) {
      g.setLineDash([4, 3]); g.strokeStyle = P.side > 0 ? '#e0507f' : '#3f86c4';
      g.beginPath(); g.moveTo(0, y(P.entry)); g.lineTo(W, y(P.entry)); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#5a3d63'; g.beginPath(); g.arc(W - cw / 2, y(fxm.price), 3, 0, Math.PI * 2); g.fill();
  }

  // ---------- 歌剧院审判（芙宁娜） ----------
  function judge(text) {
    const V = window.VERDICT_FURINA, x = text.slice(0, 24);
    const r = Math.random(), kind = r < 0.5 ? 'guilty' : r < 0.88 ? 'innocent' : 'dramatic';
    const line = pick(V[kind]).replace('{x}', x);
    M.S.stats.verdicts = (M.S.stats.verdicts || 0) + 1;
    M.doAct('verdict');
    setTimeout(() => {
      if (kind === 'guilty') { M.play('verdict'); Snd.boing(); }
      else if (kind === 'innocent') { M.play('rejoice'); Snd.fanfare(); M.fx('heart', 3); M.addAff(1); }
      else { M.play('cry'); Snd.sad(); }
      M.say(line, { dur: 6 });
      const box = $p().querySelector('.vd-res');
      if (box) { box.textContent = line; box.className = 'vd-res ' + kind; }
      M.save(); refresh();
    }, 1500);
  }

  // ---------- 面板 ----------
  const PANELS = {
    verdict: {
      title: '歌剧院审判',
      html: () => `
        <div class="hint">说出你的“罪状”，由芙宁娜来宣判！</div>
        <form class="row"><input class="grow" maxlength="24" placeholder="比如：今天又熬夜了"><button class="pri">宣判！</button></form>
        <div class="vd-res">⚖ 等待开庭……</div>
        <div class="hint vd-n"></div>`,
      bind(b) {
        const inp = b.querySelector('input');
        b.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          const t = inp.value.trim();
          if (!t) return;
          inp.value = '';
          b.querySelector('.vd-res').textContent = '⚖ 审判进行中……';
          b.querySelector('.vd-res').className = 'vd-res';
          judge(t);
        };
        setTimeout(() => inp.focus(), 50);
      },
      update(b) { b.querySelector('.vd-n').textContent = `已开庭 ${M.S.stats.verdicts || 0} 次`; },
    },

    fx: {
      title: 'FX 模拟盘 · USD/JPY',
      html: () => `
        <div class="fx-head"><span class="fx-price">150.000</span><span class="fx-chg"></span></div>
        <canvas class="fx-chart" width="500" height="190"></canvas>
        <div class="fx-acct"><span>资金</span><b class="fx-cash"></b><span>持仓</span><b class="fx-pos"></b><span>浮动盈亏</span><b class="fx-pl"></b></div>
        <div class="row center small">仓位
          <select data-f="frac"><option value="0.1">10%</option><option value="0.3">30%</option><option value="0.5">50%</option><option value="1">全部</option></select>
          杠杆 <select data-f="lev"><option value="5">5 倍</option><option value="10">10 倍</option><option value="25">25 倍</option><option value="100">100 倍</option><option value="1000">1000 倍</option></select></div>
        <div class="row center fx-btns"><button data-a="buy" class="buy">做多</button><button data-a="sell" class="sell">做空</button><button data-a="close">平仓</button><button data-a="reset" class="hidden">从 30 万重来</button></div>
        <div class="bar"><i></i></div>
        <div class="hint fx-goal"></div>
        <div class="hint fx-note">行情为随机模拟，仅供娱乐，不构成任何投资建议</div>`,
      bind(b) {
        b.querySelectorAll('select').forEach((sel) => {
          sel.value = String(fxS()[sel.dataset.f]);
          sel.onchange = () => {
            fxS()[sel.dataset.f] = +sel.value; M.save();
            if (sel.dataset.f === 'lev' && +sel.value >= 100) M.fxReact('lev');
          };
        });
        b.querySelector('.fx-btns').onclick = (e) => {
          const a = e.target.closest('button') && e.target.closest('button').dataset.a;
          if (a === 'buy') fxOpen(1);
          else if (a === 'sell') fxOpen(-1);
          else if (a === 'close') fxClose(false);
          else if (a === 'reset') { Object.assign(fxS(), { cash: FX_START, pos: null }); M.fxReact('reset'); M.save(); refresh(); }
        };
      },
      update(b) {
        const F = fxS(), P = F.pos, pl = fxPL(), C = fxm.candles, first = C.length ? C[0].o : fxm.price;
        b.querySelector('.fx-price').textContent = fxm.price.toFixed(3);
        const chg = fxm.price - first, ce = b.querySelector('.fx-chg');
        ce.textContent = `${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(3)}`; ce.className = 'fx-chg ' + (chg >= 0 ? 'up' : 'down');
        b.querySelector('.fx-cash').textContent = yen(F.cash + (P ? P.margin : 0));
        b.querySelector('.fx-pos').textContent = P ? `${P.side > 0 ? '多' : '空'} ${P.entry.toFixed(3)} · ${P.lev}倍` : '空仓';
        const ple = b.querySelector('.fx-pl');
        ple.textContent = P ? `${pl >= 0 ? '+' : ''}${yen(pl)}（维持率 ${Math.round((1 + pl / P.margin) * 100)}%）` : '—';
        ple.className = 'fx-pl ' + (!P ? '' : pl >= 0 ? 'up' : 'down');
        b.querySelector('[data-a=buy]').disabled = b.querySelector('[data-a=sell]').disabled = !!P || F.cash < 1000;
        b.querySelector('[data-a=close]').disabled = !P;
        b.querySelector('[data-a=reset]').classList.toggle('hidden', !!P || F.cash >= 1000);
        const tot = F.cash + (P ? P.margin + pl : 0);
        b.querySelector('.bar i').style.width = Math.min(100, (tot / FX_GOAL) * 100).toFixed(2) + '%';
        b.querySelector('.fx-goal').textContent = `目标 2000 万 · 已达成 ${((tot / FX_GOAL) * 100).toFixed(2)}% · 交易 ${F.trades} 次 · 胜 ${F.wins} · 强平 ${F.losscuts}`;
        fxDraw(b.querySelector('.fx-chart'));
      },
    },

    pomo: {
      title: '番茄钟',
      html: () => `
        <div class="pomo">
          <svg viewBox="0 0 100 100" class="ring"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg"/></svg>
          <div class="pomo-c"><div class="pomo-t">25:00</div><div class="pomo-p">准备好了吗</div></div>
        </div>
        <div class="row center"><button data-a="start" class="pri">开始</button><button data-a="reset">重置</button></div>
        <div class="row center small">专注
          <select data-k="pomoWork">${[15, 20, 25, 30, 45, 50].map((v) => `<option value="${v}">${v}</option>`).join('')}</select> 分 · 休息
          <select data-k="pomoBreak">${[3, 5, 10, 15].map((v) => `<option value="${v}">${v}</option>`).join('')}</select> 分</div>
        <div class="hint pomo-n"></div>`,
      bind(b) {
        b.querySelector('[data-a=start]').onclick = pomoStart;
        b.querySelector('[data-a=reset]').onclick = pomoReset;
        b.querySelectorAll('select').forEach((s) => {
          s.value = M.S.settings[s.dataset.k];
          s.onchange = () => { M.S.settings[s.dataset.k] = +s.value; M.save(); refresh(); };
        });
      },
      update(b) {
        const P = pomo(), left = pomoRemain();
        const total = (P.phase === 'break' ? M.S.settings.pomoBreak : M.S.settings.pomoWork) * 60000;
        b.querySelector('.pomo-t').textContent = mmss(left);
        b.querySelector('.pomo-p').textContent = P.phase === 'idle' ? '准备好了吗' : P.paused != null ? '暂停中' : P.phase === 'work' ? '专注中' : '休息中';
        const fg = b.querySelector('.fg'), C = 2 * Math.PI * 44;
        fg.style.strokeDasharray = C;
        fg.style.strokeDashoffset = P.phase === 'idle' ? 0 : C * (1 - left / total);
        fg.classList.toggle('brk', P.phase === 'break');
        b.querySelector('[data-a=start]').textContent = P.phase === 'idle' ? '开始' : P.paused != null ? '继续' : '暂停';
        b.querySelectorAll('select').forEach((s) => (s.disabled = P.phase !== 'idle'));
        b.querySelector('.pomo-n').textContent = `今天完成了 ${P.day === today() ? P.count : 0} 个番茄 · 累计 ${M.S.stats.pomos} 个`;
      },
    },

    todo: {
      title: '待办便签',
      html: () => `
        <form class="row"><input class="grow" maxlength="60" placeholder="要做什么呢？"><button class="pri">添加</button></form>
        <ul class="list todos"></ul><div class="hint todo-n"></div>`,
      bind(b) {
        const inp = b.querySelector('input');
        b.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          const t = inp.value.trim();
          if (!t) return;
          M.S.todos.push({ id: Date.now(), text: t, done: false });
          inp.value = ''; M.save(); refresh(); M.play('nod');
        };
        b.querySelector('.todos').onclick = (e) => {
          const li = e.target.closest('li');
          if (!li) return;
          const id = +li.dataset.id, item = M.S.todos.find((x) => x.id === id);
          if (!item) return;
          if (e.target.closest('.del')) M.S.todos = M.S.todos.filter((x) => x.id !== id);
          else if (e.target.closest('label')) {
            e.preventDefault();
            item.done = !item.done;
            if (item.done) { M.play('cheer'); Snd.sparkle(); M.say(pick(M.L.todoDone)); M.addAff(1); }
          }
          M.save(); refresh();
        };
        setTimeout(() => inp.focus(), 50);
      },
      update(b) {
        const ul = b.querySelector('.todos');
        ul.innerHTML = M.S.todos.map((x) => `
          <li data-id="${x.id}" class="${x.done ? 'done' : ''}"><label><span class="chk"></span><span class="txt">${esc(x.text)}</span></label><button class="del" title="删除">×</button></li>`).join('')
          || '<li class="empty">还没有待办～写点什么吧</li>';
        const done = M.S.todos.filter((x) => x.done).length;
        b.querySelector('.todo-n').textContent = M.S.todos.length ? `完成 ${done} / ${M.S.todos.length}` : '';
      },
    },

    remind: {
      title: '定时提醒',
      html: () => `
        <form class="row"><input type="number" class="mins" min="1" max="1440" value="10"><span>分钟后提醒我</span></form>
        <form class="row rf"><input class="grow txt" maxlength="40" placeholder="提醒内容，比如：关火！"><button class="pri">好</button></form>
        <ul class="list rems"></ul>`,
      bind(b) {
        const go = (e) => {
          e.preventDefault();
          const mins = Math.max(1, Math.min(1440, +b.querySelector('.mins').value || 10));
          const text = b.querySelector('.txt').value.trim() || '时间到啦！';
          M.S.reminders.push({ id: Date.now(), due: Date.now() + mins * 60000, text });
          b.querySelector('.txt').value = '';
          M.say(pick(M.L.remindAdd)); M.play('nod'); M.save(); refresh();
        };
        b.querySelectorAll('form').forEach((f) => (f.onsubmit = go));
        b.querySelector('.rems').onclick = (e) => {
          const li = e.target.closest('li');
          if (li && e.target.closest('.del')) { M.S.reminders = M.S.reminders.filter((r) => r.id !== +li.dataset.id); M.save(); refresh(); }
        };
      },
      update(b) {
        const list = [...M.S.reminders].sort((a, c) => a.due - c.due);
        b.querySelector('.rems').innerHTML = list.map((r) => `
          <li data-id="${r.id}"><span class="when">${mmss(r.due - Date.now())}</span><span class="txt">${esc(r.text)}</span><button class="del">×</button></li>`).join('')
          || '<li class="empty">暂时没有提醒</li>';
      },
    },

    rps: {
      title: '猜拳',
      html: () => `
        <div class="hint">和 ${M.chara().name} 猜拳吧！</div>
        <div class="row center rps"><button data-c="0">石头</button><button data-c="1">剪刀</button><button data-c="2">布</button></div>
        <div class="rps-res"><span class="hand you">?</span><span class="vs">VS</span><span class="hand me">?</span></div>
        <div class="hint rps-n"></div>`,
      bind(b) {
        const N = ['石头', '剪刀', '布'], G = ['石', '剪', '布'];
        let busy = false;
        b.querySelector('.rps').onclick = (e) => {
          const btn = e.target.closest('button');
          if (!btn || busy) return;
          busy = true;
          const you = +btn.dataset.c, me = Math.floor(Math.random() * 3);
          const youEl = b.querySelector('.you'), meEl = b.querySelector('.me');
          youEl.textContent = G[you];
          M.play('rps'); M.say('石头、剪刀……');
          let i = 0;
          const iv = setInterval(() => { meEl.textContent = G[i++ % 3]; Snd.blip(i % 3); }, 90);
          setTimeout(() => {
            clearInterval(iv);
            meEl.textContent = G[me];
            const st = M.S.stats;
            if (you === me) { st.rpsDraw++; M.play('tilt'); M.say(`布…啊不，我也出了${N[me]}！平局～再来！`); }
            else if ((me - you + 3) % 3 === 1) { st.rpsWin++; M.play('sad'); Snd.sad(); M.say(`我出了${N[me]}…呜，你赢了！`); M.addAff(1); }
            else { st.rpsLose++; M.play('cheer'); Snd.fanfare(); M.say(`我出了${N[me]}！是我赢啦～嘿嘿`); M.addAff(1); }
            M.save(); refresh(); busy = false;
          }, 900);
        };
      },
      update(b) {
        const s = M.S.stats;
        b.querySelector('.rps-n').textContent = `战绩：你赢 ${s.rpsWin} · 平 ${s.rpsDraw} · ${M.chara().name} 赢 ${s.rpsLose}`;
      },
    },

    fortune: {
      title: '今日运势',
      html: () => `<div class="fortune"></div>`,
      bind() {},
      update(b) {
        const f = M.S.fortune, box = b.querySelector('.fortune');
        if (!f || f.date !== today()) {
          box.innerHTML = `<div class="hint">每天可以抽一次签哦～</div><div class="row center"><button class="pri draw">抽一签</button></div>`;
          box.querySelector('.draw').onclick = drawFortune;
          return;
        }
        box.innerHTML = `
          <div class="omikuji g${f.gi}"><div class="grade">${f.grade}</div></div>
          <dl><dt>幸运色</dt><dd>${f.color}</dd><dt>幸运物</dt><dd>${f.item}</dd><dt>宜</dt><dd>${f.good}</dd><dt>忌</dt><dd>${f.bad}</dd></dl>
          <div class="hint">${fortune().say[f.grade]}</div>`;
      },
    },

    status: {
      title: '好感度与记录',
      html: () => `<div class="status"></div>`,
      bind() {},
      update(b) {
        const S = M.S, lv = level(S.affection), st = S.stats;
        const pct = lv.next ? ((S.affection - lv.cur) / (lv.next - lv.cur)) * 100 : 100;
        const days = Math.floor((Date.now() - st.first) / 86400000) + 1;
        b.querySelector('.status').innerHTML = `
          <div class="lv"><span class="lvname">${lv.name}</span><span class="lvnum">♥ ${S.affection}</span></div>
          <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="hint">${lv.next ? `距离下一阶段还差 ${lv.next - S.affection}` : '已经是最高等级啦！'}</div>
          <div class="grid">
            <span>相伴天数</span><b>${days}</b><span>摸头</span><b>${st.pats}</b>
            <span>戳戳</span><b>${st.pokes}</b><span>被扔出去</span><b>${st.throws}</b>
            ${M.chara().id === 'furina'
              ? `<span>请吃蛋糕</span><b>${st.feeds}</b><span>唱歌</span><b>${st.songs}</b>
                 <span>审判</span><b>${st.verdicts || 0}</b>`
              : M.chara().id === 'kurumi'
              ? `<span>请吃饭团</span><b>${st.feeds}</b><span>FX 交易</span><b>${S.fx.trades}</b>
                 <span>强制平仓</span><b>${S.fx.losscuts}</b><span>最大盈利</span><b>${yen(S.fx.best)}</b>`
              : `<span>唱歌</span><b>${st.songs}</b><span>喂葱</span><b>${st.feeds}</b>
                 <span>轮回重来</span><b>${st.retries || 0}</b>`}
            <span>番茄</span><b>${st.pomos}</b><span>猜拳</span><b>${st.rpsWin + st.rpsLose + st.rpsDraw}</b>
          </div>`;
      },
    },

    help: {
      title: '使用说明',
      html: () => M.chara().id === 'furina' ? `
        <ul class="help">
          <li><b>单击头</b> 摸摸头 · 鼠标在头上来回蹭也可以</li>
          <li><b>单击脸颊</b> 戳脸 · <b>单击身体</b> 戳一下（连戳会挠痒） · <b>单击腿</b> 跳一下</li>
          <li><b>双击</b> 转个圈 · <b>按住拖动</b> 拎起来，用力摔下去她会先哭、再逞强</li>
          <li><b>右键 → 互动</b> 登台致意、召唤沙龙成员、万众狂欢、逞强、唱歌跳舞、请她吃蛋糕、陪她喝下午茶……</li>
          <li><b>右键 → 小功能 → 歌剧院审判</b> 输入你的“罪状”，听她宣判有罪还是无罪</li>
          <li><b>下午茶</b> 每天下午三点她会邀请你喝下午茶（需开启整点报时）</li>
          <li><b>谢幕之后</b> 夜晚她会独自坐在聚光灯下</li>
          <li>托盘图标：左键 显示/隐藏，右键 菜单</li>
        </ul>` : M.chara().id === 'kurumi' ? `
        <ul class="help">
          <li><b>单击头</b> 摸摸头 · 鼠标在头上来回蹭也可以</li>
          <li><b>单击脸颊</b> 戳脸 · <b>单击身体</b> 戳一下（连戳会挠痒） · <b>单击腿</b> 跳一下</li>
          <li><b>双击</b> 转个圈 · <b>按住拖动</b> 拎起来，用力摔下去会“强制平仓”</li>
          <li><b>右键 → 互动</b> 看看行情、啃 FX 教材、向 K 线祈祷、暴走模式、请她吃饭团……</li>
          <li><b>右键 → 小功能 → FX 模拟盘</b> 用打工攒的 30 万虚拟本金和她一起做多做空，目标 2000 万。行情随机生成，仅供娱乐</li>
          <li><b>深夜盯盘</b> 晚上她会裹着开衫守在电脑前</li>
          <li>番茄钟、待办、提醒、猜拳、运势和初音一样可以用</li>
          <li>托盘图标：左键 显示/隐藏，右键 菜单</li>
        </ul>` : `
        <ul class="help">
          <li><b>单击头</b> 摸摸头 · 鼠标在头上来回蹭也可以</li>
          <li><b>单击脸颊</b> 戳脸 · <b>单击身体</b> 戳一下（连戳会挠痒）</li>
          <li><b>单击双马尾</b> 拽头发（会生气哦） · <b>单击腿</b> 跳一下</li>
          <li><b>双击</b> 转个圈</li>
          <li><b>按住拖动</b> 拎起来；用力甩出去会被抛飞、撞墙反弹</li>
          <li><b>右键</b> 打开菜单：唱歌、甩葱、跳舞、喂葱、番茄钟、待办、提醒、猜拳、运势、设置……</li>
          <li><b>月夜模式</b> 在月亮前漂浮 · 可设为入夜自动切换</li>
          <li><b>角色 / 皮肤</b> 即刻轮回皮肤可以变身、放星星魔法、「轮回重来」倒回 8 秒前；也可以换成福贺久留美、芙宁娜</li>
          <li>长时间不理她会打瞌睡，点一下就醒了</li>
          <li>托盘图标：左键 显示/隐藏，右键 菜单</li>
        </ul>`,
      bind() {},
    },
  };

  const fortune = () => ({ kurumi: window.FORTUNE_KURUMI, furina: window.FORTUNE_FURINA }[M.chara().id] || FORTUNE);
  function drawFortune() {
    const FORTUNE = fortune();
    const tot = FORTUNE.grades.reduce((a, g) => a + g[1], 0);
    let r = Math.random() * tot, gi = 0;
    while (r > FORTUNE.grades[gi][1]) { r -= FORTUNE.grades[gi][1]; gi++; }
    const grade = FORTUNE.grades[gi][0];
    M.S.fortune = { date: today(), grade, gi, color: pick(FORTUNE.colors), item: pick(FORTUNE.items), good: pick(FORTUNE.good), bad: pick(FORTUNE.bad) };
    M.play('think');
    M.say('唔……让我看看……');
    Snd.blip();
    setTimeout(() => {
      refresh();
      if (gi <= 1) { M.play('cheer'); Snd.fanfare(); M.fx('star', 3); }
      else if (gi === 5) { M.play('pat'); Snd.sad(); }
      else { M.play('nod'); Snd.sparkle(); }
      M.say(FORTUNE.say[grade], { dur: 5 });
      M.save();
    }, 1400);
  }

  function refresh() {
    if (!openName) return;
    const P = PANELS[openName];
    if (P.update) P.update($p().querySelector('.body'));
  }

  return {
    init(m) {
      M = m;
      $p().querySelector('.close').onclick = () => this.close();
      if (!M.S.pomo) M.S.pomo = { phase: 'idle', end: 0, paused: null, day: '', count: 0 };
      M.S.fx = Object.assign({ cash: FX_START, pos: null, frac: 0.3, lev: 10, trades: 0, wins: 0, best: 0, worst: 0, losscuts: 0, goal: false }, M.S.fx || {});
      // 有未平仓位时，让行情从开仓价附近接着走
      if (M.S.fx.pos) fxm.price = M.S.fx.pos.entry;
      for (let i = 0; i < 46 * CANDLE; i++) fxStep(true);
    },
    open(name) {
      const P = PANELS[name];
      if (!P) return;
      openName = name;
      const p = $p();
      p.classList.remove('hidden');
      p.dataset.name = name;
      p.querySelector('.title').textContent = P.title;
      const body = p.querySelector('.body');
      body.innerHTML = P.html();
      P.bind(body);
      refresh();
      if (name === 'fortune' && !(M.S.fortune && M.S.fortune.date === today())) M.say('要抽签吗？');
      if (name === 'status') M.say(level(M.S.affection).i >= 3 ? '嘿嘿，我们很要好呢～' : '要多多和我玩哦！');
    },
    close() { openName = null; $p().classList.add('hidden'); },
    isOpen: () => !!openName,
    tick() { fxTick(); pomoTick(); remindersTick(); if (openName === 'pomo' || openName === 'remind') refresh(); },
    pomoLabel,
    fxLabel: () => { const pl = M && fxS() && fxS().pos ? fxPL() : null; return pl == null ? '' : `持仓中 ${pl >= 0 ? '+' : ''}${yen(pl)}`; },
    fxHolding: () => !!(M && fxS() && fxS().pos),
    focusing: () => M && pomo().phase === 'work' && pomo().paused == null,
    level,
  };
})();
