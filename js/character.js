// 角色渲染：用参考原图 / 生成的立绘作为精灵，WebGL 着色器做头发飘动与惯性
(function () {
  // 皮肤：逻辑动作名 -> 立绘文件。h：可见高度相对“站立高度”的比例；profile：朝左的侧面图；foot：脚底在包围盒中的位置
  const SKINS = {
    classic: {
      dir: 'assets/gen',
      files: {
        idle: { h: 1 }, side: { h: 1, profile: 1 }, back: { h: 0.99 }, night: { h: 1.35, foot: 0.88 },
        wave: { h: 1.02 }, happy: {}, pout: {}, surprised: { h: 1.02 }, sing: {}, leek: { h: 1.2 }, dance: {},
        stretch: { h: 1.1 }, shy: {}, cheer: { h: 1.08 }, sad: { h: 0.98 }, dizzy: {}, eat: {}, drink: {}, think: {},
        sit: { h: 0.72 }, sleep: { h: 0.7 }, held: { h: 1.05 }, walk1: { h: 1, profile: 1 },
      },
      map: { front: 'idle', transform: 'cheer', magic: 'wave', retry: 'think' },
    },
    rinne: {
      dir: 'assets/skins/rinne',
      files: {
        u_idle: {}, u_side: { profile: 1 }, u_back: {}, u_walk: { profile: 1 }, u_wave: { h: 1.02 }, u_happy: {},
        u_pout: {}, u_surprised: { h: 1.02 }, u_shy: {}, u_sad: { h: 0.98 }, u_think: {}, u_sit: { h: 0.72 },
        u_sleep: { h: 0.7 }, u_held: { h: 1.05 }, u_dizzy: {}, u_eat: {}, u_drink: {}, u_stretch: { h: 1.1 },
        m_idle: { h: 1.08 }, m_transform: { h: 1.08 }, m_magic: { h: 1.02 }, m_retry: { h: 1.02 }, m_cheer: { h: 1.12 },
        m_walk: { profile: 1 }, m_wave: { h: 1.12 }, m_dance: { h: 1.06 }, m_sing: {}, m_held: { h: 1.08 },
        m_night: { h: 1.35, foot: 0.88 },
      },
      // 形态 u = 制服，m = 魔法少女；找不到时依次退回制服版、待机图
      forms: {
        u: { front: 'u_idle', side: 'u_side', back: 'u_back', walk1: 'u_walk', wave: 'u_wave', happy: 'u_happy', pout: 'u_pout',
          surprised: 'u_surprised', shy: 'u_shy', sad: 'u_sad', think: 'u_think', sit: 'u_sit', sleep: 'u_sleep',
          held: 'u_held', dizzy: 'u_dizzy', eat: 'u_eat', drink: 'u_drink', stretch: 'u_stretch', night: 'm_night',
          cheer: 'm_cheer', sing: 'm_sing', dance: 'm_dance', leek: 'm_magic', transform: 'm_transform', magic: 'm_magic', retry: 'm_retry' },
        m: { front: 'm_idle', side: 'm_walk', back: 'm_transform', walk1: 'm_walk', wave: 'm_wave', happy: 'm_cheer',
          held: 'm_held', stretch: 'm_cheer', think: 'm_retry' },
      },
    },
    // 福贺久留美：短发波波头，头发飘动幅度小
    kurumi: {
      dir: 'assets/skins/kurumi', hair: 0.35,
      files: {
        idle: {}, side: { profile: 1 }, back: {}, walk: { profile: 1 }, held: { h: 1.05 }, wave: { h: 1.04 }, happy: {}, pout: {},
        surprised: { h: 1.02 }, shy: {}, sad: { h: 0.98 }, dizzy: {}, think: {}, sit: { h: 0.72 }, sleep: { h: 0.72 }, eat: {}, drink: {},
        stretch: { h: 1.12 }, cheer: { h: 1.1 }, phone: {}, buy: { h: 1.1 }, sell: {}, profit: { h: 1.02 }, losscut: { h: 0.72 },
        frenzy: { h: 0.98 }, study: {}, pray: {}, night: { h: 0.8 },
      },
      map: { front: 'idle', walk1: 'walk', transform: 'cheer', magic: 'pray', retry: 'think', leek: 'frenzy', sing: 'happy', dance: 'cheer' },
    },
    // 芙宁娜：魔法偶像造型，长卷发
    furina: {
      dir: 'assets/skins/furina', hair: 0.7,
      files: {
        idle: {}, side: { profile: 1 }, back: {}, walk: { profile: 1 }, held: { h: 1.05 }, wave: { h: 1.04 }, happy: {}, pout: {},
        surprised: { h: 1.03 }, shy: {}, sad: { h: 0.98 }, dizzy: {}, think: {}, sit: { h: 0.72 }, sleep: { h: 0.78 }, eat: {}, drink: {},
        stretch: { h: 1.12 }, cheer: { h: 1.1 }, sing: {}, dance: { h: 1.04 }, bow: {}, salon: { h: 1.06 }, cry: {}, brave: {},
        verdict: { h: 1.02 }, night: { h: 0.9 },
      },
      map: { front: 'idle', walk1: 'walk', transform: 'cheer', magic: 'salon', retry: 'think', leek: 'salon', phone: 'think' },
    },
  };
  const STANDING = ['idle', 'back', 'wave', 'happy', 'pout', 'surprised', 'shy', 'sad', 'think', 'eat', 'drink', 'sing',
    'phone', 'sell', 'study', 'pray', 'profit', 'cry', 'brave', 'bow'];
  let skin = 'classic', form = 'u', onFormSwap = null;

  // 正面图的五官位置（像素坐标），用于眨眼 / 说话叠层；没有标定的图就不做叠层
  const FACES = {
    'assets/gen/idle.png': { eyeL: [442, 333], eyeR: [600, 337], mouth: [518, 397], k: 1.95 },
  };

  const S = {};               // name -> {img, w, h, bb, alpha, aw, ah, tex, scale}
  let canvas, gl, prog, buf, loc = {}, dpr = 1, W = 0, H = 0, unit = 290;
  let cur = null, prev = null, fade = 1, T = 0;
  const hair = { x: 0, v: 0 };
  let last = null;            // 最近一次绘制所用矩阵，供命中测试

  // ---------- 加载 ----------
  function loadImg(src) {
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  function analyze(img, name) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const step = 3, aw = Math.ceil(c.width / step), ah = Math.ceil(c.height / step), alpha = new Uint8Array(aw * ah);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
      const a = d[(y * c.width + x) * 4 + 3];
      alpha[(y / step) * aw + x / step] = a;
      if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    let fx = 0, fn = 0;
    for (let y = Math.floor(y1 - (y1 - y0) * 0.05); y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      if (d[(y * c.width + x) * 4 + 3] > 128) { fx += x; fn++; }
    }
    return { img, canvas: c, ctx: g, w: c.width, h: c.height, bb: { x0, y0, x1: x1 + step, y1: y1 + step }, footCx: fn ? fx / fn : (x0 + x1) / 2, alpha, aw, ah, step, name };
  }

  // 在原图正面上画出“闭眼”和“张嘴”两张变体，用于眨眼和说话
  function faceVariant(base, kind) {
    const FACE = FACES[base.src];
    const c = document.createElement('canvas');
    c.width = base.w; c.height = base.h;
    const g = c.getContext('2d');
    g.drawImage(base.img, 0, 0);
    const skinAt = (x, y) => {
      const p = base.ctx.getImageData(x - 3, y - 1, 7, 3).data, s = [0, 0, 0];
      for (let i = 0; i < p.length; i += 4) { s[0] += p[i]; s[1] += p[i + 1]; s[2] += p[i + 2]; }
      const n = p.length / 4;
      return `rgb(${(s[0] / n) | 0},${(s[1] / n) | 0},${(s[2] / n) | 0})`;
    };
    const k = FACE.k || 1;
    // 以五官中心为原点、按 k 缩放后的局部坐标作画
    const patch = (rx, ry, col, dy = 0) => {
      g.save(); g.filter = `blur(${(2.2 * k).toFixed(1)}px)`; g.fillStyle = col;
      g.beginPath(); g.ellipse(0, dy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
    };
    if (kind === 'blink') {
      [FACE.eyeL, FACE.eyeR].forEach(([x, y], i) => {
        const dir = i === 0 ? -1 : 1;
        const c1 = skinAt(x, y + 17 * k), c2 = skinAt(x - dir * 4 * k, y + 16 * k);
        g.save(); g.translate(x, y); g.scale(k, k);
        patch(23, 14, c1, 1);
        patch(19, 11, c2, 2);
        g.strokeStyle = '#3e4250'; g.lineCap = 'round'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-19, 3); g.quadraticCurveTo(0, 11, 19, 3); g.stroke();
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(dir * 18, 3.5); g.lineTo(dir * 23, 0); g.stroke();
        g.restore();
      });
    } else if (kind === 'talk') {
      const [x, y] = FACE.mouth, col = skinAt(x, y + 9 * k);
      g.save(); g.translate(x, y); g.scale(k, k);
      patch(13, 7, col);
      g.fillStyle = '#b8645f'; g.strokeStyle = '#7d4644'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-7, -2); g.quadraticCurveTo(0, -1, 7, -2);
      g.quadraticCurveTo(5, 8, 0, 8.5); g.quadraticCurveTo(-5, 8, -7, -2); g.fill(); g.stroke();
      g.fillStyle = '#e59f9a'; g.beginPath(); g.ellipse(0, 5.5, 3.6, 2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    return Object.assign({}, base, { img: c, tex: null });
  }

  const loaded = {};
  function load(name = skin) {
    if (loaded[name]) return loaded[name];
    const K = SKINS[name];
    loaded[name] = Promise.all(Object.keys(K.files).map(async (f) => {
      const src = `${K.dir}/${f}.png`, img = await loadImg(src);
      if (!img) return;
      const def = K.files[f], key = `${name}/${f}`, base = f.replace(/^[um]_/, '');
      S[key] = Object.assign(analyze(img, key), { def, src, form: f[1] === '_' ? f[0] : '', standing: STANDING.includes(base) });
      S[key].scale = (def.h || 1) / (S[key].bb.y1 - S[key].bb.y0);
      if (FACES[src]) {
        S[key + '_blink'] = Object.assign(faceVariant(S[key], 'blink'), { scale: S[key].scale });
        S[key + '_talk'] = Object.assign(faceVariant(S[key], 'talk'), { scale: S[key].scale });
      }
    }));
    return loaded[name];
  }
  async function setSkin(name) { if (!SKINS[name]) return; await load(name); skin = name; }
  function setForm(f) { form = f; }
  // 逻辑动作名 -> 已加载的立绘键
  function resolve(n) {
    const K = SKINS[skin], ok = (f) => (f && S[`${skin}/${f}`] ? `${skin}/${f}` : null);
    if (K.forms) {
      return ok(K.forms[form] && K.forms[form][n]) || ok(K.forms.u[n]) || ok(form === 'm' ? 'm_idle' : 'u_idle') || ok('u_idle') || 'classic/idle';
    }
    return ok(K.map[n]) || ok(n) || ok('idle');
  }
  const has = (n) => resolve(n) !== null;

  // ---------- WebGL ----------
  const VS = `
    attribute vec2 a;
    uniform mat3 M;
    varying vec2 uv;
    void main() { uv = a; vec3 p = M * vec3(a, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); }`;
  const FS = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D tex;
    uniform vec4 bb;
    uniform float t, alpha, sway, lag, warm, prof, glitch;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 q = (uv - bb.xy) / (bb.zw - bb.xy);
      float side = abs(q.x - 0.5);
      // 正面图：两侧马尾摆动；侧面图（朝左）：只有身后（右侧）的马尾摆动
      float w = prof > 0.5 ? smoothstep(0.45, 0.68, q.x) * smoothstep(0.08, 0.5, q.y)
                           : smoothstep(0.17, 0.44, side) * smoothstep(0.1, 0.65, q.y);
      float dx = w * (sway * sin(t * 1.6 + q.y * 5.0 + sign(q.x - 0.5) * 0.8) + lag * q.y * q.y);
      vec2 s = vec2(uv.x - dx * (bb.z - bb.x), uv.y);
      // 故障：横向条带随机错位 + RGB 分离
      if (glitch > 0.0) {
        float band = floor(uv.y * 46.0), tick = floor(t * 22.0);
        float on = step(0.62, hash(band * 7.13 + tick));
        s.x += (hash(band * 3.7 + tick * 1.3) - 0.5) * 0.09 * glitch * on;
      }
      if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) { gl_FragColor = vec4(0.0); return; }
      vec4 c = texture2D(tex, s);
      if (glitch > 0.0) {
        vec2 o = vec2(0.014 * glitch, 0.0);
        vec4 cr = texture2D(tex, clamp(s + o, 0.0, 1.0)), cb = texture2D(tex, clamp(s - o, 0.0, 1.0));
        c = vec4(cr.r, c.g, cb.b, max(c.a, max(cr.a, cb.a)));
      }
      c.rgb = mix(c.rgb, c.rgb * vec3(1.02, 1.0, 0.97), warm);
      gl_FragColor = c * alpha;
    }`;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function mount(container) {
    canvas = document.createElement('canvas');
    canvas.id = 'chara';
    container.appendChild(canvas);
    gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // 横向多留一点边，头发外摆时不被裁掉
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.08, 0, 1.08, 0, -0.08, 1, 1.08, 1]), gl.STATIC_DRAW);
    ['a', 'M', 'tex', 'bb', 't', 'alpha', 'sway', 'lag', 'warm', 'prof', 'glitch'].forEach((k) => {
      loc[k] = k === 'a' ? gl.getAttribLocation(prog, k) : gl.getUniformLocation(prog, k);
    });
    gl.enableVertexAttribArray(loc.a);
    gl.vertexAttribPointer(loc.a, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    resize();
    return canvas;
  }
  function texOf(s) {
    if (s.tex) return s.tex;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    s.tex = t;
    return t;
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', () => canvas && resize());

  // ---------- 变换 ----------
  // 3x3 列主序矩阵
  const mul = (a, b) => {
    const r = new Array(9);
    for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) {
      r[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2];
    }
    return r;
  };
  const tr = (x, y) => [1, 0, 0, 0, 1, 0, x, y, 1];
  const scl = (x, y) => [x, 0, 0, 0, y, 0, 0, 0, 1];
  const rotm = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };
  function inv(m) {
    const [a, b, , c, d, , e, f] = m, det = a * d - b * c;
    return [d / det, -b / det, 0, -c / det, a / det, 0, (c * f - d * e) / det, (b * e - a * f) / det, 1];
  }
  const apply = (m, x, y) => ({ x: m[0] * x + m[3] * y + m[6], y: m[1] * x + m[4] * y + m[7] });

  // uv(0..1 图像) -> 窗口像素
  function pixelMatrix(s, st) {
    const k = s.scale * unit;
    const footX = s.def.profile ? s.footCx : (s.bb.x0 + s.bb.x1) / 2, footY = s.bb.y1 - (s.def.foot ? (1 - s.def.foot) * (s.bb.y1 - s.bb.y0) : 0);
    const charH = (s.bb.y1 - s.bb.y0) * k;
    let m = scl(s.w, s.h);                               // uv -> 图像像素
    m = mul(tr(-footX, -footY), m);                      // 以脚底为原点
    m = mul(scl(k * st.sx * st.flip, k * st.sy), m);     // 缩放 / 挤压 / 翻转
    const pv = -(st.pivot ?? 0.5) * unit;
    m = mul(tr(0, -pv), m); m = mul(rotm(st.rot), m); m = mul(tr(0, pv), m);
    m = mul(tr(W / 2 + st.x, H - 8 + st.y), m);
    return { m, charH };
  }
  function clipMatrix(pm) { return mul([2 / W, 0, 0, 0, -2 / H, 0, -1, 1, 1], pm); }

  function draw(s, st, a) {
    const { m } = pixelMatrix(s, st);
    gl.uniformMatrix3fv(loc.M, false, new Float32Array(clipMatrix(m)));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texOf(s));
    gl.uniform1i(loc.tex, 0);
    gl.uniform4f(loc.bb, s.bb.x0 / s.w, s.bb.y0 / s.h, s.bb.x1 / s.w, s.bb.y1 / s.h);
    gl.uniform1f(loc.alpha, a * (st.alpha ?? 1));
    const hk = SKINS[skin].hair ?? 1;
    gl.uniform1f(loc.sway, (st.sway ?? 0.012) * hk);
    gl.uniform1f(loc.lag, hair.x * hk);
    gl.uniform1f(loc.warm, st.warm ?? 0);
    gl.uniform1f(loc.prof, s.def.profile ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return m;
  }

  // st: {sprite, x, y, rot, sx, sy, flip, pivot, sway, blink, talk}
  function render(st, dt) {
    T += dt;
    hair.v += (0 - hair.x) * 0.09; hair.v *= 0.86; hair.x += hair.v;
    hair.x = Math.max(-0.12, Math.min(0.12, hair.x));
    const base = resolve(st.sprite);
    let name = base;
    if (st.talk && S[base + '_talk']) name = base + '_talk';
    if (st.blink && S[base + '_blink']) name = base + '_blink';
    if (!S[base]) return;
    if (!cur) cur = base;
    if (base !== cur) {
      if (onFormSwap && S[cur] && S[cur].form && S[base].form && S[cur].form !== S[base].form) onFormSwap(S[base].form);
      prev = cur; cur = base;
      fade = /walk/.test(prev) && /walk/.test(base) ? 1 : 0;
    }
    fade = Math.min(1, fade + dt / 0.16);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(loc.t, T);
    gl.uniform1f(loc.glitch, st.glitch || 0);
    if (prev && fade < 1 && S[prev]) draw(S[prev], st, 1 - fade);
    const s = S[name] || S[cur];
    if (!s) return;
    const m = draw(s, st, prev && fade < 1 ? fade : 1);
    last = { s, m, inv: inv(m), st };
  }

  function push(dx, dy) { hair.v -= dx * 0.0016 / Math.max(0.5, unit / 290); }

  // ---------- 命中测试 / 定位 ----------
  function sample(s, u, v) {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    const x = Math.floor((u * s.w) / s.step), y = Math.floor((v * s.h) / s.step);
    return s.alpha[y * s.aw + x] || 0;
  }
  function partAt(cx, cy) {
    if (!last) return null;
    const r = canvas.getBoundingClientRect();
    const p = apply(last.inv, cx - r.left, cy - r.top);
    const s = last.s;
    if (sample(s, p.x, p.y) < 60) return null;
    const qx = (p.x * s.w - s.bb.x0) / (s.bb.x1 - s.bb.x0), qy = (p.y * s.h - s.bb.y0) / (s.bb.y1 - s.bb.y0);
    const side = qx - 0.5, flip = last.st.flip < 0 ? -1 : 1;
    const standing = s.standing;
    if (qy < (standing ? 0.3 : 0.38) && Math.abs(side) < 0.3) return { part: 'head', qx, qy };
    if (standing && Math.abs(side) > 0.24 && qy > 0.2) return { part: 'tail', side: Math.sign(side) * flip, qx, qy };
    if (standing && qy > 0.76) return { part: 'legs', qx, qy };
    return { part: 'body', qx, qy };
  }
  // 当前精灵上某个相对位置（bbox 归一化坐标）在窗口中的位置
  function at(qx, qy) {
    if (!last) return { x: W / 2, y: H / 2 };
    const s = last.s, r = canvas.getBoundingClientRect();
    const u = (s.bb.x0 + qx * (s.bb.x1 - s.bb.x0)) / s.w, v = (s.bb.y0 + qy * (s.bb.y1 - s.bb.y0)) / s.h;
    const p = apply(last.m, u, v);
    return { x: p.x + r.left, y: p.y + r.top };
  }
  function headTop() {
    if (!last) return at(0.5, 0);
    const s = last.s, top = s.def.foot ? 0.12 : 0.01;
    return at(0.5, top);
  }
  function setUnit(u) { unit = u; }

  window.Chara = {
    load, setSkin, setForm, mount, render, partAt, at, headTop, push, has, setUnit, resize, sprites: S, FACES,
    sprite: (n) => S[resolve(n)],
    onFormSwap: (fn) => { onFormSwap = fn; },
    get skin() { return skin; },
    get form() { return form; },
  };
})();
