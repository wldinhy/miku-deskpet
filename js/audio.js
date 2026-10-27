// 音效与小曲子：全部用 WebAudio 实时合成，不依赖音频文件
window.Snd = (function () {
  let ctx = null, master = null, enabled = true, voiceOn = true, song = null;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.32;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      master.connect(lp); lp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ f, t0 = 0, dur = 0.15, type = 'sine', vol = 0.3, attack = 0.01, release = 0.08, slideTo, dest }) {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), st = c.currentTime + t0;
    o.type = type;
    o.frequency.setValueAtTime(f, st);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, st + dur);
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(vol, st + attack);
    g.gain.setValueAtTime(vol, st + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, st + dur);
    o.connect(g); g.connect(dest || master);
    o.start(st); o.stop(st + dur + 0.05);
  }

  // 柔和的“人声”：两只略失谐的三角波 + 渐入颤音 + 共振峰
  function vocal(m, t0, dur, dest, vol = 0.2) {
    const c = ac(), st = c.currentTime + t0, f = mtof(m);
    const g = c.createGain(), lp = c.createBiquadFilter(), pk = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 3;
    pk.type = 'peaking'; pk.frequency.value = 950; pk.gain.value = 7; pk.Q.value = 1.2;
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 5.6;
    vg.gain.setValueAtTime(0, st);
    vg.gain.linearRampToValueAtTime(f * 0.013, st + Math.min(dur, 0.4));
    vib.connect(vg);
    [-7, 7].forEach((d) => {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = d;
      vg.connect(o.frequency); o.connect(lp);
      o.start(st); o.stop(st + dur + 0.1);
    });
    lp.connect(pk); pk.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(vol, st + 0.045);
    g.gain.setValueAtTime(vol * 0.85, st + Math.max(0.05, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, st + dur + 0.02);
    vib.start(st); vib.stop(st + dur + 0.1);
  }
  function pluck(m, t0, dest, vol = 0.12, dur = 0.5) {
    tone({ f: mtof(m), t0, dur, type: 'triangle', vol, attack: 0.005, release: dur * 0.9, dest });
  }
  function bell(m, t0, dest, vol = 0.18) {
    tone({ f: mtof(m), t0, dur: 1.4, type: 'sine', vol, attack: 0.005, release: 1.35, dest });
    tone({ f: mtof(m) * 2.76, t0, dur: 0.6, type: 'sine', vol: vol * 0.25, attack: 0.005, release: 0.58, dest });
  }
  function kick(t0, dest) { tone({ f: 120, slideTo: 45, t0, dur: 0.16, vol: 0.35, attack: 0.003, release: 0.14, dest }); }
  function hat(t0, dest) {
    const c = ac(), st = c.currentTime + t0, len = 0.04;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7000; g.gain.value = 0.06;
    s.buffer = buf; s.connect(hp); hp.connect(g); g.connect(dest); s.start(st);
  }

  // 原创小曲（[音高, 拍数]，0 为休止）
  const SONGS = {
    hum: { bpm: 92, voice: 0.14, mel: [[72, 1], [76, 1], [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 2]] },
    sing1: {
      bpm: 96, mel: [[76, 1], [79, 1], [81, 1.5], [79, 0.5], [76, 1], [74, 1], [72, 2],
        [74, 1], [76, 1], [79, 1], [76, 1], [74, 3], [0, 1],
        [76, 1], [79, 1], [81, 1], [84, 1], [83, 1.5], [81, 0.5], [79, 2],
        [77, 1], [76, 1], [74, 1], [76, 1], [72, 3]],
      chords: [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]],
    },
    sing2: {
      bpm: 108, mel: [[72, 0.5], [74, 0.5], [76, 1], [76, 0.5], [79, 0.5], [81, 1], [79, 1], [76, 0.5], [74, 0.5],
        [72, 1], [74, 1], [76, 2], [0, 0.5], [79, 0.5], [81, 0.5], [83, 0.5], [84, 2],
        [83, 0.5], [81, 0.5], [79, 1], [76, 1], [77, 0.5], [76, 0.5], [74, 1], [72, 3]],
      chords: [[48, 55, 64], [43, 50, 59], [45, 52, 60], [41, 48, 57]],
    },
    dance: {
      bpm: 128, beat: true, mel: [[79, 0.5], [79, 0.5], [76, 0.5], [79, 0.5], [81, 1], [79, 1],
        [77, 0.5], [77, 0.5], [74, 0.5], [77, 0.5], [79, 1], [76, 1],
        [79, 0.5], [79, 0.5], [76, 0.5], [79, 0.5], [84, 1], [83, 0.5], [81, 0.5],
        [79, 0.5], [77, 0.5], [76, 0.5], [74, 0.5], [72, 2]],
      chords: [[48, 55, 64], [41, 48, 57], [48, 55, 64], [43, 50, 59]],
    },
    polka: {
      bpm: 150, polka: true, voice: 0.17, mel: [[69, 0.5], [69, 0.5], [72, 0.5], [69, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [71, 0.5],
        [69, 0.5], [69, 0.5], [72, 0.5], [74, 0.5], [76, 1], [74, 1],
        [72, 0.5], [72, 0.5], [74, 0.5], [72, 0.5], [71, 0.5], [69, 0.5], [68, 0.5], [71, 0.5],
        [69, 0.5], [71, 0.5], [72, 0.5], [74, 0.5], [76, 1], [69, 1]],
      bass: [45, 52, 44, 52],
    },
  };

  function stop() {
    if (!song) return;
    try {
      song.g.gain.cancelScheduledValues(ctx.currentTime);
      song.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const g = song.g; setTimeout(() => g.disconnect(), 400);
    } catch {}
    song = null;
  }

  // 返回音符时间表，供口型与音符特效同步
  function play(name) {
    const S = SONGS[name];
    const spb = 60 / S.bpm;
    const notes = [];
    let t = 0;
    S.mel.forEach(([m, b]) => { if (m) notes.push({ t, d: b * spb, m }); t += b * spb; });
    const total = t;
    if (!enabled) return { notes, dur: total };
    stop();
    const c = ac(), g = c.createGain();
    g.gain.value = 1; g.connect(master);
    song = { g };
    notes.forEach((n) => vocal(n.m, n.t + 0.05, n.d * 0.92, g, S.voice || 0.2));
    const beats = Math.ceil(total / spb);
    for (let i = 0; i < beats; i++) {
      const bt = i * spb + 0.05;
      if (S.chords) {
        const ch = S.chords[Math.floor(i / 4) % S.chords.length];
        if (S.beat) { kick(bt, g); hat(bt + spb / 2, g); pluck(ch[0] - 12, bt, g, 0.16, spb * 0.9); }
        pluck(ch[(i % 3) + 0] + 12, bt, g, 0.07, spb * 1.6);
        if (i % 2 === 0) pluck(ch[0], bt, g, 0.1, spb * 2);
      }
      if (S.polka) {
        const b = S.bass[Math.floor(i / 2) % S.bass.length];
        if (i % 2 === 0) { pluck(b - 12, bt, g, 0.2, spb * 0.5); kick(bt, g); }
        else { pluck(b + 12, bt, g, 0.08, spb * 0.4); pluck(b + 16, bt, g, 0.06, spb * 0.4); hat(bt, g); }
      }
    }
    return { notes, dur: total };
  }

  const api = {
    enable(v) { enabled = v; if (!v) stop(); },
    voice(v) { voiceOn = v; },
    unlock() { try { ac(); } catch {} },
    play, stop,
    pop() { if (enabled) tone({ f: 660, slideTo: 990, dur: 0.09, vol: 0.18, type: 'sine' }); },
    blip(h = 0) { if (enabled) tone({ f: 880 + h * 120, dur: 0.06, vol: 0.12, type: 'triangle' }); },
    boing() { if (enabled) tone({ f: 300, slideTo: 720, dur: 0.22, vol: 0.18, type: 'sine', release: 0.15 }); },
    thud() { if (enabled) tone({ f: 140, slideTo: 60, dur: 0.18, vol: 0.3, type: 'sine', release: 0.15 }); },
    whoosh() { if (enabled) tone({ f: 500, slideTo: 1400, dur: 0.3, vol: 0.06, type: 'sawtooth', release: 0.25 }); },
    sparkle() { if (!enabled) return; [84, 88, 91, 96].forEach((m, i) => tone({ f: mtof(m), t0: i * 0.06, dur: 0.25, vol: 0.08, release: 0.22 })); },
    chime() { if (!enabled) return; const c = ac(); [79, 76, 72, 79].forEach((m, i) => bell(m, i * 0.32, master)); return c; },
    fanfare() { if (!enabled) return; [72, 76, 79, 84].forEach((m, i) => bell(m, i * 0.12, master, 0.15)); },
    sad() { if (enabled) tone({ f: 520, slideTo: 330, dur: 0.5, vol: 0.12, type: 'triangle', release: 0.3 }); },
    chomp() { if (enabled) tone({ f: 260, slideTo: 180, dur: 0.07, vol: 0.14, type: 'square', release: 0.05 }); },
    // 倒带：一串越来越快的下行“嘀”声 + 磁带拖慢的滑音
    rewind() {
      if (!enabled) return;
      for (let i = 0; i < 10; i++) tone({ f: 1400 - i * 90, t0: i * 0.05 * (1 - i * 0.05), dur: 0.04, vol: 0.06, type: 'square', attack: 0.003, release: 0.03 });
      tone({ f: 900, slideTo: 120, t0: 0.55, dur: 0.45, vol: 0.1, type: 'sawtooth', release: 0.3 });
    },
    // 变身：上行琶音 + 闪光
    transform() {
      if (!enabled) return;
      [72, 76, 79, 84, 88, 91].forEach((m, i) => tone({ f: mtof(m), t0: i * 0.07, dur: 0.3, vol: 0.09, type: 'triangle', release: 0.25 }));
      [84, 88, 91, 96].forEach((m, i) => tone({ f: mtof(m), t0: 0.5 + i * 0.05, dur: 0.5, vol: 0.06, release: 0.45 }));
    },
    // 收钱：两声清脆的“叮”
    coin() {
      if (!enabled) return;
      [[88, 0], [95, 0.09]].forEach(([m, t]) => { tone({ f: mtof(m), t0: t, dur: 0.35, vol: 0.12, type: 'square', attack: 0.003, release: 0.3 }); tone({ f: mtof(m + 12), t0: t, dur: 0.25, vol: 0.05, attack: 0.003, release: 0.22 }); });
    },
    // 强制平仓警报：急促的双音
    alarm() {
      if (!enabled) return;
      for (let i = 0; i < 4; i++) tone({ f: i % 2 ? 660 : 880, t0: i * 0.13, dur: 0.11, vol: 0.08, type: 'square', attack: 0.003, release: 0.04 });
    },
    // 说话声：每个字一声很轻的“啵”
    say(ch) {
      if (!enabled || !voiceOn || /[\s，。！？…、～\-—.,!?~]/.test(ch)) return;
      const code = ch.charCodeAt(0);
      tone({ f: 620 + (code % 7) * 45, dur: 0.045, vol: 0.05, type: 'square', attack: 0.004, release: 0.03 });
    },
  };
  return api;
})();
