/* =====================================================================
   Milo Dash — plateforme rythmique néon, univers Milo
   Milo avance seul : touche pour sauter, maintiens pour enchaîner.
   Orbes de saut, trampolines, portails (vol, gravité, vitesse), scies,
   4 niveaux (fichier dash-levels.js) avec musique synthétisée calée sur
   le tempo, progression en %, étoiles, personnages à débloquer et mode
   entraînement avec points de contrôle.
   Simulation déterministe à pas fixe (240 Hz) : chaque niveau est validé
   par un bot qui le termine (preuve qu'il est faisable).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MiloGames; if (!MG) return;
  const DEFS = window.MILO_DASH_LEVELS || [];

  /* ---------- Physique (unité = 1 bloc, secondes) ---------- */
  const PH = { G: 80, V0: 18.2, PAD: 25.6, ORB: 18.6, MAXV: 30, SHIP_UP: 52, SHIP_G: 46, SHIP_MAX: 9.4, SNAP: 0.34, HW: 0.45, IN: 0.24, HZ: 0.34, SPK_W: 0.16, SPK_H: 0.46, BUF: 0.12, DT: 1 / 240 };
  const SPEEDS = [5.8, 7.2, 9.0, 10.8];
  const T_AIR = 2 * PH.V0 / PH.G;

  /* ---------- Visuels de Milo (remplaçables) ---------- */
  const RUN = { src: 'jump/run.webp', n: 12, fw: 242, fh: 264, ax: 0.55, ay: 0.977 };
  const LIFT = [0, 0.6, 2.6, 3.4, 1.2, 0, 0, 0.6, 2.6, 3.4, 1.8, 0], SQ = [1, 1, 1.015, 1.025, 0.965, 0.99, 1, 1, 1.015, 1.025, 0.97, 0.99]; // rebond / étirement par image (pour 98 de haut)
  const FLY = { vol: ['flap/vol.webp', 0.61, 0.583], haut: ['flap/haut.webp', 0.59, 0.607], bas: ['flap/bas.webp', 0.575, 0.592], ko: ['flap/etourdi.webp', 0.591, 0.603] };
  const PCOL = { ship: '#ff5fd2', cube: '#46f2a0', flip: '#ffd84d', norm: '#55c8ff', s0: '#ffa94d', s1: '#55c8ff', s2: '#7dff6a', s3: '#ff4f8b' };
  const SKINS = [
    { id: 'neon', name: 'Néon', c: ['#8b5cff', '#3fd2ff'], need: null, how: 'Disponible dès le départ' },
    { id: 'aurore', name: 'Aurore', c: ['#ff5fa8', '#ffb35c'], need: { lv: 0 }, how: 'Termine « Envol »' },
    { id: 'glacier', name: 'Glacier', c: ['#5ff0ff', '#e6fbff'], need: { st: 3 }, how: 'Gagne 3 étoiles' },
    { id: 'galaxie', name: 'Galaxie', c: ['#b44dff', '#ff4fd2'], need: { lv: 2 }, how: 'Termine « Gravité »' },
    { id: 'soleil', name: 'Soleil', c: ['#ffd23f', '#ff7a3d'], need: { st: 9 }, how: 'Gagne 9 étoiles' },
    { id: 'prisme', name: 'Prisme', c: null, need: { lv: 3 }, how: 'Termine « Hyperdrive »' }
  ];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  /* =====================================================================
     Construction d'un niveau : le fichier de niveaux place les objets en
     temps musicaux (B.x(temps) = position de Milo sur ce temps).
     ===================================================================== */
  function buildLevel(def, idx) {
    const spb = 60 / def.bpm;
    const sp = (def.speeds || [[0, 1]]).map((a) => a.slice()).sort((a, b) => a[0] - b[0]);
    if (sp[0][0] > 0) sp.unshift([0, 1]);
    const spdAt = (b) => { let s = sp[0][1]; for (const e of sp) { if (e[0] <= b) s = e[1]; else break; } return s; };
    const v = (b) => SPEEDS[spdAt(b)];
    const x = (b) => { let X = 0, pb = 0, s = sp[0][1]; for (const e of sp) { if (e[0] >= b) break; X += (e[0] - pb) * spb * SPEEDS[s]; pb = e[0]; s = e[1]; } return X + (b - pb) * spb * SPEEDS[s]; };
    const ht = (dh, desc, v0) => { v0 = v0 || PH.V0; const d = v0 * v0 - 2 * PH.G * dh; if (d < 0) return NaN; const r = Math.sqrt(d); return (desc ? v0 + r : v0 - r) / PH.G; };
    const objs = [], cams = [], texts = [];
    let nStar = 0;
    const B = {
      bpm: def.bpm, spb, T: T_AIR, G: PH.G, V0: PH.V0, PAD: PH.PAD, ORB: PH.ORB, HW: PH.HW, x, v, ht,
      apex: (b) => x(b) + v(b) * T_AIR / 2,
      land: (b, dh, v0) => x(b) + v(b) * ht(dh || 0, true, v0),
      edge: (b, dh) => { const tr = Math.max(0, ht(Math.max(0, dh - 0.2), false) || 0); return x(b) + PH.HW + v(b) * (tr + T_AIR / 2) / 2; },
      spike: (X, y, dir) => { objs.push({ t: 1, x0: X, x1: X + 1, y: y || 0, dir: dir || 1 }); },
      spikes: (b, n, y, dir) => { n = n || 1; const c = B.apex(b); for (let i = 0; i < n; i++) B.spike(c - n / 2 + i, y, dir); },
      row: (X0, X1, y, dir) => { const n = Math.max(1, Math.floor(X1 - X0 + 0.001)), s = X0 + (X1 - X0 - n) / 2; for (let i = 0; i < n; i++) B.spike(s + i, y, dir); },
      block: (X0, X1, y0, y1) => { objs.push({ t: 0, x0: X0, x1: X1, y0, y1 }); },
      ceil: (X0, X1, y) => B.block(X0, X1, y, y + 30),
      orb: (X, y) => { objs.push({ t: 3, cx: X, cy: y, x0: X - 0.7, x1: X + 0.7 }); },
      pad: (X, y, dir) => { objs.push({ t: 4, cx: X, y: y || 0, dir: dir || 1, x0: X - 0.6, x1: X + 0.6 }); },
      portal: (X, kind, yc, h) => { objs.push({ t: 5, cx: X, cy: yc == null ? 2 : yc, h: h || 7, kind, x0: X - 0.7, x1: X + 1.3 }); },
      saw: (X, y, r) => { r = r || 1; objs.push({ t: 2, cx: X, cy: y, r, x0: X - r, x1: X + r }); },
      star: (X, y) => { objs.push({ t: 6, cx: X, cy: y, n: nStar++, x0: X - 0.7, x1: X + 0.7 }); },
      cam: (X0, X1, yc) => { cams.push({ x0: X0, x1: X1, yc }); },
      text: (X, y, s) => { texts.push({ x: X, y, s }); }
    };
    def.build(B);
    sp.forEach((e) => { if (e[0] > 0) B.portal(x(e[0]), 's' + e[1], e[2] == null ? 2 : e[2], 80); });
    const lenX = x(def.len), gS = {}, gO = {};
    objs.forEach((o, i) => { const g = o.t === 0 ? gS : gO; for (let c = Math.floor(o.x0) - 2; c <= Math.floor(o.x1) + 2; c++) (g[c] || (g[c] = [])).push(i); });
    return { def, idx, objs, gS, gO, cams, texts, lenX, spb, speed0: sp[0][1], nStars: nStar, x, sp, mel: null };
  }

  /* =====================================================================
     Simulation déterministe (pas fixe de 1/240 s)
     ===================================================================== */
  class Sim {
    constructor(L) { this.L = L; this.used = new Uint8Array(L.objs.length); this.ev = null; this.reset(); }
    reset() { this.x = 0; this.y = 0.5; this.vy = 0; this.gs = 1; this.mode = 0; this.spd = this.L.speed0; this.ground = true; this.hold = false; this.buf = 0; this.t = 0; this.n = 0; this.dead = false; this.won = false; this.stars = 0; this.jumps = 0; this.nUsed = 0; this.used.fill(0); }
    clone() { const s = Object.create(Sim.prototype); for (const k in this) s[k] = this[k]; s.used = this.used.slice(); s.ev = null; return s; }
    press() { if (!this.hold) { this.hold = true; this.buf = PH.BUF; } }
    release() { this.hold = false; }
    emit(k, a) { if (this.ev) this.ev.push({ k, a, x: this.x, y: this.y }); }
    die(why) { this.dead = true; this.emit('die', why); }
    use(id) { this.used[id] = 1; this.nUsed++; }
    portal(k) {
      if (k === 'ship') { if (this.mode !== 1) { this.mode = 1; this.vy *= 0.4; } }
      else if (k === 'cube') this.mode = 0;
      else if (k === 'flip') { if (this.gs > 0) { this.gs = -1; this.vy *= 0.5; this.ground = false; } }
      else if (k === 'norm') { if (this.gs < 0) { this.gs = 1; this.vy *= 0.5; this.ground = false; } }
      else if (k[0] === 's') this.spd = +k[1];
    }
    step() {
      if (this.dead || this.won) return;
      const L = this.L, dt = PH.DT;
      this.t += dt; this.n++;
      this.x += SPEEDS[this.spd] * dt;
      if (this.buf > 0) this.buf -= dt;
      let gs = this.gs;
      if (this.mode === 0) {
        if (this.ground && (this.hold || this.buf > 0)) { this.vy = PH.V0 * gs; this.ground = false; this.buf = 0; this.jumps++; this.emit('jump'); }
        this.vy -= PH.G * gs * dt;
        if (this.vy > PH.MAXV) this.vy = PH.MAXV; else if (this.vy < -PH.MAXV) this.vy = -PH.MAXV;
      } else {
        this.vy += (this.hold ? PH.SHIP_UP : -PH.SHIP_G) * gs * dt;
        if (this.vy > PH.SHIP_MAX) this.vy = PH.SHIP_MAX; else if (this.vy < -PH.SHIP_MAX) this.vy = -PH.SHIP_MAX;
      }
      this.y += this.vy * dt;
      const air = !this.ground; this.ground = false;
      if (this.y < 0.5) { this.y = 0.5; if (this.vy < 0) this.vy = 0; if (gs > 0) this.ground = true; }
      if (this.y > 46) return this.die('void');
      const c = Math.floor(this.x), x = this.x, hw = PH.HW;
      const S = L.gS[c];
      if (S) for (let k = 0; k < S.length; k++) {
        const o = L.objs[S[k]];
        if (x + hw <= o.x0 || x - hw >= o.x1 || this.y + 0.5 <= o.y0 || this.y - 0.5 >= o.y1) continue;
        if (gs > 0) {
          if (this.vy <= 0 && this.y - 0.5 >= o.y1 - PH.SNAP) { this.y = o.y1 + 0.5; this.vy = 0; this.ground = true; continue; }
          if (this.mode === 1 && this.vy >= 0 && this.y + 0.5 <= o.y0 + PH.SNAP) { this.y = o.y0 - 0.5; this.vy = 0; continue; }
        } else {
          if (this.vy >= 0 && this.y + 0.5 <= o.y0 + PH.SNAP) { this.y = o.y0 - 0.5; this.vy = 0; this.ground = true; continue; }
          if (this.mode === 1 && this.vy <= 0 && this.y - 0.5 >= o.y1 - PH.SNAP) { this.y = o.y1 + 0.5; this.vy = 0; continue; }
        }
        const i = PH.IN;
        if (x + i > o.x0 && x - i < o.x1 && this.y + i > o.y0 && this.y - i < o.y1) return this.die('wall');
      }
      const O = L.gO[c];
      if (O) for (let k = 0; k < O.length; k++) {
        const id = O[k], o = L.objs[id], y = this.y;
        if (o.t === 1) {
          const cx = o.x0 + 0.5, h = PH.HZ, y0 = o.dir > 0 ? o.y : o.y - PH.SPK_H, y1 = o.dir > 0 ? o.y + PH.SPK_H : o.y;
          if (x + h > cx - PH.SPK_W && x - h < cx + PH.SPK_W && y + h > y0 && y - h < y1) return this.die('spike');
        } else if (o.t === 2) {
          const h = PH.HZ, dx = clamp(o.cx, x - h, x + h) - o.cx, dy = clamp(o.cy, y - h, y + h) - o.cy, r = o.r * 0.8;
          if (dx * dx + dy * dy < r * r) return this.die('saw');
        } else if (!this.used[id]) {
          if (o.t === 3) { const dx = x - o.cx, dy = y - o.cy; if (dx * dx + dy * dy < 1.0 && this.buf > 0) { this.vy = (this.mode ? PH.SHIP_MAX : PH.ORB) * gs; this.buf = 0; this.ground = false; this.use(id); this.emit('orb', id); } }
          else if (o.t === 4) { const f = gs > 0 ? y - 0.5 : y + 0.5; if (o.dir === gs && Math.abs(x - o.cx) < 0.65 && Math.abs(f - o.y) < 0.4) { this.vy = PH.PAD * gs * (this.mode ? 0.4 : 1); this.ground = false; this.use(id); this.emit('pad', id); } }
          else if (o.t === 5) { if (x >= o.cx && x < o.cx + 1.2 && Math.abs(y - o.cy) < o.h / 2) { this.use(id); this.portal(o.kind); gs = this.gs; this.emit('portal', o.kind); } }
          else if (o.t === 6) { const dx = x - o.cx, dy = y - o.cy; if (dx * dx + dy * dy < 1.1) { this.stars |= 1 << o.n; this.use(id); this.emit('star', o.n); } }
        }
      }
      if (air && this.ground) this.emit('land');
      if (x >= L.lenX) { this.won = true; this.emit('win'); }
    }
  }

  /* ---------- Bot de validation : recherche en profondeur avec mémoire ----------
     Décide toutes les 1/60 s (appui ou relâché). Renvoie la suite d'actions qui
     termine le niveau (et ramasse les étoiles si stars = true). */
  function solve(L, o) {
    o = o || {};
    const SEG = 4, MAX = o.max || 8e6, want = o.mask != null ? o.mask : o.stars ? (1 << L.nStars) - 1 : 0;
    const stk = [{ s: o.from ? o.from.clone() : new Sim(L), k: 0, a: 0, p: 0 }], seen = new Set();
    let steps = 0, far = 0;
    while (stk.length) {
      const top = stk[stk.length - 1];
      if (top.k > 1) { stk.pop(); continue; }
      const a = top.k === 0 ? top.p : 1 - top.p; top.k++;
      const s = top.s.clone(); if (a) s.press(); else s.release();
      for (let i = 0; i < SEG && !s.dead && !s.won; i++) s.step();
      steps += SEG; if (s.x > far) far = s.x;
      if (s.won || (o.untilX && s.x >= o.untilX)) { if ((s.stars & want) === want) { const acts = stk.slice(1).map((e) => e.a); acts.push(a); return { ok: true, acts, steps, stars: s.stars, jumps: s.jumps, t: s.t, end: s }; } continue; }
      if (s.dead || (o.byX && s.x > o.byX && (s.stars & want) !== want)) continue;
      const key = (((((s.n >> 2) * 1024 + Math.round(s.y * 12 + 24)) * 128 + Math.round(s.vy * 1.5 + 60)) * 16 + (s.mode * 8 + (s.gs > 0 ? 4 : 0) + (s.hold ? 2 : 0) + (s.ground ? 1 : 0))) * 64 + (s.nUsed & 63)) * 16 + (want ? s.stars : 0);
      if (seen.has(key)) continue; seen.add(key);
      stk.push({ s, k: 0, a, p: s.mode === 1 ? a : 0 });
      if (steps > MAX) return { ok: false, far, steps };
    }
    return { ok: false, far, steps };
  }

  /* =====================================================================
     Musique : synthèse en direct, programmée sur le temps de jeu
     (chaque niveau : tonalité, grille d'accords, sections d'intensité)
     ===================================================================== */
  const hz = (s) => 110 * Math.pow(2, s / 12);
  function melody(L) {
    if (L.mel) return L.mel;
    const M = L.def.music, R = MG.rng(M.seed || 1), out = new Array(64).fill(null);
    const SC = []; [-12, 0, 12, 24].forEach((o) => [0, 2, 3, 5, 7, 8, 10].forEach((s) => SC.push(s + o)));
    const RH = [[0, 3, 6, 8, 10, 12], [0, 2, 4, 7, 10, 12, 14], [0, 4, 6, 8, 11, 12], [0, 3, 6, 10, 12, 14], [0, 6, 8, 10, 14]];
    let last = 7;
    for (let bar = 0; bar < 4; bar++) {
      const ch = M.prog[bar % M.prog.length], tri = ch[1] === 'M' ? [0, 4, 7] : [0, 3, 7];
      const rh = RH[Math.floor(R() * RH.length)];
      rh.forEach((p, j) => {
        const np = j + 1 < rh.length ? rh[j + 1] : 16, dur = Math.min(4, np - p);
        let n;
        if (j === 0 || R() < 0.55) { const c = []; [0, 12].forEach((o) => tri.forEach((t) => c.push(ch[0] + t + o))); c.sort((a, b) => Math.abs(a - last) - Math.abs(b - last)); n = c[Math.floor(R() * 2)]; }
        else { let k = 0, bd = 99; SC.forEach((s, i) => { if (Math.abs(s - last) < bd) { bd = Math.abs(s - last); k = i; } }); n = SC[clamp(k + (R() < 0.5 ? -1 : 1), 0, SC.length - 1)]; }
        n = clamp(n, -3, 19); out[bar * 16 + p] = [n, dur]; last = n;
      });
    }
    return (L.mel = out);
  }
  const Music = {
    on: false, bus: null, ac: null, L: null, M: null, i: 0, t0: 0, lat: 0, sd: 0.1, noise: null,
    start(L, from) {
      this.stop(true);
      const ac = MG.sfx.ctx && MG.sfx.ctx(); if (!ac || MG.sfx.muted || !L || !L.def.music) return false;
      this.ac = ac; this.L = L; this.M = L.def.music; this.sd = L.spb / 4;
      if (!this.noise || this.noise.sampleRate !== ac.sampleRate) { const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } this.noise = b; }
      const now = ac.currentTime, bus = ac.createGain();
      bus.gain.setValueAtTime(0.0001, now); bus.gain.exponentialRampToValueAtTime(this.M.vol || 0.8, now + 0.04); bus.connect(MG.sfx.out()); this.bus = bus;
      this.lat = Math.min(0.15, (ac.outputLatency || 0) + (ac.baseLatency || 0));
      this.t0 = now - this.lat - from; this.i = Math.max(0, Math.ceil(from / this.sd - 1e-6)); this.on = true;
      melody(L); return true;
    },
    stop(fast) {
      const b = this.bus, ac = this.ac; this.on = false; this.bus = null; if (!b) return;
      try { const n = ac.currentTime; b.gain.cancelScheduledValues(n); b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), n); b.gain.exponentialRampToValueAtTime(0.0001, n + (fast ? 0.04 : 0.35)); } catch (e) {}
      setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 600);
    },
    update(g) {
      if (!this.on) return;
      if (MG.sfx.muted || !MG.sfx.ctx()) { this.stop(); return; }
      const now = this.ac.currentTime, drift = now - this.lat - (this.t0 + g);
      if (Math.abs(drift) > 0.05) this.t0 += drift;
      let n = 0;
      while (this.i * this.sd < g + 0.25 && n++ < 48) { const T = this.t0 + this.i * this.sd; if (T > now - 0.04) this.note(this.i, Math.max(T, now)); this.i++; }
    },
    inten(bar) { let I = 1; for (const s of this.M.sec) { if (s[0] <= bar) I = s[1]; else break; } return I; },
    note(i, T) {
      const M = this.M, bar = Math.floor(i / 16), p = i % 16, I = this.inten(bar), sd = this.sd;
      if (i / 4 > this.L.def.len + 8) return;
      const ch = M.prog[bar % M.prog.length], R = (M.root || 0) + ch[0], tri = ch[1] === 'M' ? [0, 4, 7] : [0, 3, 7];
      if (p === 0 && bar > 0 && I > this.inten(bar - 1)) this.crash(T);
      if (I >= 1 && p % 4 === 0) this.kick(T);
      if (I >= 2 && (p === 4 || p === 12)) this.clap(T);
      if (I >= 1 && p % 4 === 2) this.hat(T, 0.06, 0.07);
      else if (I >= 3 && p % 2 === 1) this.hat(T, 0.025, 0.035);
      else if (I === 0 && p % 4 === 0) this.hat(T, 0.05, 0.03);
      if (I >= 1) {
        const bp = M.bass || 'eighth', hit = bp === 'offbeat' ? p % 4 === 2 : bp === 'roll' ? true : p % 2 === 0;
        if (hit) { const oct = bp === 'roll' ? (p % 4 === 2 ? 12 : 0) : (p % 8 === 6 ? 12 : 0); this.bass(T, hz(R + oct), sd * (bp === 'roll' ? 0.9 : 1.7)); }
      }
      if (I >= 2) { const st = M.arpRate === 8 ? 2 : 1; if (p % st === 0) { const seq = M.arp || [0, 1, 2, 3], k = seq[(p / st) % seq.length], tone = tri[k % 3] + 12 * Math.floor(k / 3); this.arp(T, hz(R + 24 + tone), sd * st * 0.9); } }
      if (I >= 3 && p === 0) this.pad(T, R, tri, sd * 16);
      if (I >= 4) { const m = this.L.mel[(bar % 4) * 16 + p]; if (m) this.lead(T, hz((M.root || 0) + 24 + m[0]), sd * m[1]); }
    },
    osc(type, f, T, d, vol, fc, f2, atk) {
      const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, T); if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + d * 0.7);
      g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(vol, T + (atk || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, T + d);
      let n = o;
      if (fc) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(fc, T); fl.frequency.exponentialRampToValueAtTime(Math.max(120, fc * 0.3), T + d); o.connect(fl); n = fl; }
      n.connect(g); g.connect(this.bus); o.start(T); o.stop(T + d + 0.03);
    },
    nz(T, d, vol, type, f, q) {
      const ac = this.ac, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
      g.gain.setValueAtTime(vol, T); g.gain.exponentialRampToValueAtTime(0.0001, T + d);
      s.connect(fl); fl.connect(g); g.connect(this.bus); s.start(T, (this.i * 0.137) % 0.5, d + 0.05);
    },
    kick(T) { this.osc('sine', 200, T, 0.22, 0.8, 0, 46); this.nz(T, 0.018, 0.16, 'highpass', 2800); },
    clap(T) { this.nz(T, 0.14, 0.2, 'bandpass', 1500, 0.9); this.nz(T + 0.012, 0.1, 0.12, 'bandpass', 2300, 0.9); },
    hat(T, d, v) { this.nz(T, d, v, 'highpass', 7600, 0.6); },
    crash(T) { this.nz(T, 1.2, 0.08, 'highpass', 5000, 0.4); },
    bass(T, f, d) { this.osc('sawtooth', f, T, d, 0.15, f * 5); },
    arp(T, f, d) { this.osc(this.M.wave || 'square', f, T, d, 0.04, this.M.bright || 2600); },
    pad(T, R, tri, d) { tri.forEach((t) => this.osc('triangle', hz(R + 12 + t), T, d, 0.028, 0, 0, 0.3)); },
    lead(T, f, d) { this.osc('sawtooth', f, T, d * 0.95, 0.045, 3400); this.osc('triangle', f * 2, T, d * 0.6, 0.02); }
  };

  /* =====================================================================
     Rendu néon (canvas 2D, sprites pré-rendus, aucune ombre en direct)
     ===================================================================== */
  let api = null, root = null, cv = null, ctx = null, ro = null, raf = 0, rTimer = 0, last = 0, msgT = 0;
  const V = { cw: 0, ch: 0, dpr: 1, bs: 30, K: 30, base: 400, px: 2.5, vw: 11 };
  const IMG = {}, BUILT = [];
  let SPR = {}, BG = {}, sprKey = '', st = null, menu = null, UI = {}, state = 'home', screen = 'home', sel = 0;
  const parts = [], rings = [];

  function loadImgs() {
    const ld = (k, src) => { if (IMG[k]) return; const im = new Image(); im.decoding = 'async'; im.onload = () => (im.ok = true); im.src = src; IMG[k] = im; };
    ld('run', MG.asset(RUN.src));
    Object.keys(FLY).forEach((k) => ld(k, MG.asset(FLY[k][0])));
  }
  const lvl = (i) => BUILT[i] || (BUILT[i] = buildLevel(DEFS[i], i));
  const theme = () => (DEFS[(st ? st.L.idx : sel)] || DEFS[0]).theme;
  function skinOf() { const d = api && api.data; return SKINS.find((s) => s.id === (d && d.skin)) || SKINS[0]; }
  function skinCols(t) { const s = skinOf(); if (s.c) return s.c; const h = (t * 70) % 360; return [`hsl(${h},100%,64%)`, `hsl(${(h + 140) % 360},100%,66%)`]; }

  function mkc(wb, hb) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(wb * V.K)); c.height = Math.max(2, Math.ceil(hb * V.K)); const x = c.getContext('2d'); x.scale(V.K, V.K); return [c, x]; }
  function glow(x, col, w, blur, fill) { x.save(); x.shadowColor = col; x.shadowBlur = blur * V.K; if (fill) { x.fillStyle = col; x.fill(); } else { x.strokeStyle = col; x.lineWidth = w; x.stroke(); } x.restore(); }
  function star5(x, cx, cy, R, r) { x.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.5708, b = a + 0.6283; x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); } x.closePath(); }
  function flipV(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.translate(0, c.height); x.scale(1, -1); x.drawImage(src, 0, 0); return c; }

  function buildSprites() {
    const th = theme(), key = V.K + '|' + th.spike + th.edge + skinOf().id;
    if (key === sprKey) return; sprKey = key; SPR = {};
    // pique (base en bas, origine du sprite décalée de 0,3 / 1,3 bloc)
    { const [c, x] = mkc(1.6, 1.6); x.translate(0.3, 1.3); x.lineJoin = 'round';
      x.beginPath(); x.moveTo(0.05, 0); x.lineTo(0.5, -0.9); x.lineTo(0.95, 0); x.closePath();
      const g = x.createLinearGradient(0, -0.9, 0, 0); g.addColorStop(0, rgba(th.spike, 0.75)); g.addColorStop(0.55, th.spikeIn || '#4a0f5c'); g.addColorStop(1, '#0a0320'); x.fillStyle = g; x.fill();
      glow(x, th.spike, 0.1, 0.4); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 0.025; x.stroke();
      x.beginPath(); x.moveTo(0.5, -0.66); x.lineTo(0.64, -0.3); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 0.05; x.lineCap = 'round'; x.stroke();
      SPR.spike = c; SPR.spikeD = flipV(c); }
    // orbe de saut
    { const [c, x] = mkc(2, 2); x.translate(1, 1);
      const g = x.createRadialGradient(0, 0, 0.1, 0, 0, 0.95); g.addColorStop(0, 'rgba(255,230,120,.55)'); g.addColorStop(1, 'rgba(255,200,60,0)'); x.fillStyle = g; x.fillRect(-1, -1, 2, 2);
      x.beginPath(); x.arc(0, 0, 0.42, 0, 6.283); glow(x, '#ffd84d', 0.12, 0.3);
      x.beginPath(); x.arc(0, 0, 0.27, 0, 6.283); x.fillStyle = 'rgba(255,240,180,.35)'; x.fill();
      star5(x, 0, 0.02, 0.2, 0.09); x.fillStyle = '#fff6c8'; x.fill();
      SPR.orb = c; }
    // trampoline
    { const [c, x] = mkc(1.6, 0.9); x.translate(0.8, 0.75);
      const g = x.createLinearGradient(0, -0.75, 0, 0); g.addColorStop(0, 'rgba(255,216,77,0)'); g.addColorStop(1, 'rgba(255,216,77,.6)'); x.fillStyle = g; x.fillRect(-0.65, -0.75, 1.3, 0.75);
      x.beginPath(); x.ellipse(0, 0, 0.6, 0.34, 0, Math.PI, 0); x.closePath(); x.fillStyle = '#ffd84d'; glow(x, '#ffb020', 0, 0.45, true);
      x.beginPath(); x.ellipse(0, -0.05, 0.3, 0.1, 0, Math.PI, 0); x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 0.05; x.stroke();
      SPR.pad = c; SPR.padD = flipV(c); }
    // portails
    SPR.portal = {};
    Object.keys(PCOL).forEach((k) => {
      const col = PCOL[k], [c, x] = mkc(2, 4); x.translate(1, 2);
      const g = x.createRadialGradient(0, 0, 0.1, 0, 0, 1.8); g.addColorStop(0, rgba(col, 0.28)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(-1, -2, 2, 4);
      x.beginPath(); x.ellipse(0, 0, 0.5, 1.6, 0, 0, 6.283); glow(x, col, 0.16, 0.35);
      x.beginPath(); x.ellipse(0, 0, 0.32, 1.38, 0, 0, 6.283); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 0.05; x.stroke();
      x.fillStyle = '#ffffff'; x.strokeStyle = '#ffffff'; x.lineWidth = 0.09; x.lineCap = 'round'; x.lineJoin = 'round';
      if (k === 'ship') { x.beginPath(); x.moveTo(-0.22, 0.1); x.quadraticCurveTo(0, -0.35, 0.24, -0.1); x.quadraticCurveTo(0.02, -0.05, -0.22, 0.1); x.fill(); }
      else if (k === 'cube') { x.strokeRect(-0.17, -0.17, 0.34, 0.34); }
      else if (k === 'flip' || k === 'norm') { const d = k === 'flip' ? -1 : 1; x.beginPath(); x.moveTo(0, -0.3 * d); x.lineTo(0, 0.3 * d); x.moveTo(-0.16, 0.12 * d); x.lineTo(0, 0.3 * d); x.lineTo(0.16, 0.12 * d); x.stroke(); }
      else { const n = +k[1] + 1; for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * 0.16; x.beginPath(); x.moveTo(ox - 0.06, -0.16); x.lineTo(ox + 0.06, 0); x.lineTo(ox - 0.06, 0.16); x.stroke(); } }
      SPR.portal[k] = c;
    });
    // étoile à collecter
    { const [c, x] = mkc(1.8, 1.8); x.translate(0.9, 0.9);
      const g = x.createRadialGradient(0, 0, 0.1, 0, 0, 0.9); g.addColorStop(0, 'rgba(255,220,90,.5)'); g.addColorStop(1, 'rgba(255,220,90,0)'); x.fillStyle = g; x.fillRect(-0.9, -0.9, 1.8, 1.8);
      star5(x, 0, 0.03, 0.5, 0.22); x.fillStyle = '#ffd23f'; glow(x, '#ffb000', 0, 0.25, true); star5(x, 0, 0.03, 0.5, 0.22); x.lineWidth = 0.06; x.strokeStyle = '#fff3b0'; x.lineJoin = 'round'; x.stroke();
      x.beginPath(); x.arc(-0.12, -0.12, 0.07, 0, 6.283); x.fillStyle = 'rgba(255,255,255,.85)'; x.fill();
      SPR.star = c; }
    // point de contrôle (entraînement)
    { const [c, x] = mkc(1, 1); x.translate(0.5, 0.5); x.beginPath(); x.moveTo(0, -0.34); x.lineTo(0.26, 0); x.lineTo(0, 0.34); x.lineTo(-0.26, 0); x.closePath(); x.fillStyle = '#46f2a0'; glow(x, '#46f2a0', 0, 0.3, true); SPR.cp = c; }
    // aura de Milo (couleur du personnage)
    const aura = (col) => { const [c, x] = mkc(3, 3); const g = x.createRadialGradient(1.5, 1.5, 0.1, 1.5, 1.5, 1.5); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, 3, 3); return c; };
    const sk = skinOf();
    SPR.aura = sk.c ? [aura(sk.c[0])] : ['#ff4f6d', '#ffb347', '#ffe14d', '#5dff8a', '#4fd2ff', '#9b6bff'].map(aura);
    SPR.saw = {};
  }
  function sawSpr(r) {
    if (SPR.saw[r]) return SPR.saw[r];
    const th = theme(), w = r * 2 + 0.6, [c, x] = mkc(w, w); x.translate(w / 2, w / 2);
    x.beginPath(); const n = 10; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 6.283, R = i % 2 ? r * 0.78 : r; x.lineTo(Math.cos(a) * R, Math.sin(a) * R); } x.closePath();
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, th.spikeIn || '#4a0f5c'); g.addColorStop(1, '#0a0320'); x.fillStyle = g; x.fill(); glow(x, th.spike, 0.08, 0.3);
    x.beginPath(); x.arc(0, 0, r * 0.32, 0, 6.283); x.strokeStyle = th.spike; x.lineWidth = 0.08; x.stroke();
    x.beginPath(); x.moveTo(-r * 0.14, 0); x.lineTo(r * 0.14, 0); x.moveTo(0, -r * 0.14); x.lineTo(0, r * 0.14); x.strokeStyle = '#ffffff'; x.lineWidth = 0.07; x.stroke();
    return (SPR.saw[r] = c);
  }
  function buildBg() {
    const th = theme(), W = Math.ceil(V.cw * V.dpr), H = Math.ceil(V.ch * V.dpr), Bd = V.base * V.dpr, K = V.K;
    BG = { key: th.name + W + 'x' + H };
    const sky = ctx.createLinearGradient(0, 0, 0, H); th.sky.forEach((c, i) => sky.addColorStop(i / (th.sky.length - 1), c)); BG.sky = sky;
    const gr = ctx.createLinearGradient(0, 0, 0, H * 0.4); gr.addColorStop(0, th.ground[0]); gr.addColorStop(1, th.ground[1]); BG.ground = gr;
    // étoiles lointaines
    { const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(Bd); const x = c.getContext('2d'), R = MG.rng(3);
      for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.55})`; const s = (0.6 + R() * 1.3) * V.dpr; x.beginPath(); x.arc(R() * W, R() * Bd * 0.9, s, 0, 6.283); x.fill(); }
      BG.stars = c; }
    // silhouettes lointaines (raccord horizontal)
    { const TW = Math.ceil(W * 1.5), TH = Math.ceil(Bd * 0.72), c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d'), R = MG.rng(th.seed || 5);
      const line = th.far2 || th.edge, fill = th.farFill || 'rgba(20,8,60,.55)';
      x.lineJoin = 'round'; x.lineCap = 'round';
      const both = (fn) => { fn(0); fn(-TW); fn(TW); };
      if (th.far === 'peaks') {
        [[0.55, 0.5, 3], [0.3, 0.75, 4]].forEach(([hh, al, n], li) => {
          const pts = []; const m = n * 2; for (let i = 0; i <= m; i++) pts.push([i / m * TW, TH - (i % 2 ? TH * hh * (0.6 + R() * 0.4) : TH * hh * 0.12 * R())]);
          pts[m][1] = pts[0][1];
          both((o) => { x.beginPath(); x.moveTo(o, TH); pts.forEach((p) => x.lineTo(p[0] + o, p[1])); x.lineTo(o + TW, TH); x.closePath(); x.fillStyle = fill; x.fill(); x.globalAlpha = al; x.strokeStyle = line; x.lineWidth = (2 - li * 0.6) * V.dpr; x.stroke(); x.globalAlpha = 1; });
        });
      } else if (th.far === 'rings') {
        for (let i = 0; i < 5; i++) { const cx = (i + R() * 0.6) / 5 * TW, cy = TH * (0.2 + R() * 0.55), r = K * (1.4 + R() * 2.6); both((o) => { for (let j = 0; j < 3; j++) { x.globalAlpha = 0.2 - j * 0.05; x.strokeStyle = j % 2 ? line : th.spike; x.lineWidth = 1.6 * V.dpr; x.beginPath(); x.arc(cx + o, cy, r * (1 - j * 0.28), 0, 6.283); x.stroke(); } }); }
        x.globalAlpha = 1;
      } else if (th.far === 'hex') {
        for (let i = 0; i < 14; i++) { const cx = R() * TW, cy = TH * (0.1 + R() * 0.8), r = K * (0.6 + R() * 1.8), rot = R(); both((o) => { x.beginPath(); for (let j = 0; j < 6; j++) { const a = rot + j * 1.0472; x.lineTo(cx + o + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fillStyle = fill; x.fill(); x.globalAlpha = 0.5; x.strokeStyle = j2(i) ? th.spike : line; x.lineWidth = 1.6 * V.dpr; x.stroke(); x.globalAlpha = 1; }); }
      } else {
        let px = 0; while (px < TW) { const w = K * (1 + R() * 2.2), h = TH * (0.25 + R() * 0.65), gx = px; both((o) => { x.fillStyle = fill; x.fillRect(gx + o, TH - h, w, h); x.globalAlpha = 0.55; x.strokeStyle = line; x.lineWidth = 1.4 * V.dpr; x.strokeRect(gx + o + 0.5, TH - h + 0.5, w - 1, h); x.globalAlpha = 0.35; x.fillStyle = th.spike; for (let wy = TH - h + K * 0.5; wy < TH - K * 0.4; wy += K * 0.7) for (let wx = gx + K * 0.3; wx < gx + w - K * 0.3; wx += K * 0.55) if (R() < 0.35) x.fillRect(wx + o, wy, K * 0.18, K * 0.22); x.globalAlpha = 1; }); px += w + K * (0.2 + R() * 0.9); }
      }
      BG.far = c; }
    function j2(i) { return i % 3 === 0; }
  }
  function layout() {
    if (!root) return;
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === V.cw && h === V.ch && dpr === V.dpr && BG.sky) return;
    V.cw = w; V.ch = h; V.dpr = dpr; V.bs = Math.min(w / 11, h / 15); V.K = V.bs * dpr; V.base = Math.round(h * 0.67); V.vw = w / V.bs; V.px = Math.min(2.7, V.vw * 0.24);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    sprKey = ''; buildSprites(); buildBg(); ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    V.font = getComputedStyle(root).fontFamily;
    root.style.setProperty('--floor', V.base + 'px');
  }
  function refreshTheme() { sprKey = ''; buildSprites(); buildBg(); }

  /* ---------- Scène (partie en cours ou décor des menus) ---------- */
  function newRender() { return { rot: 0, spin: 0, rate: 0, sx: 1, sy: 1, runPh: 0, trail: [], flap: 0, emit: 0, ko: null }; }
  function scene() { return st && state !== 'home' && state !== 'levels' && state !== 'skins' ? st : menu; }
  function makeMenu() { menu = { L: { objs: [], gS: {}, gO: {}, cams: [], texts: [], lenX: 1e9, spb: 0.5, idx: sel }, sim: { x: 0, y: 0.5, vy: 0, gs: 1, mode: 0, ground: true, t: 0, used: [], hold: false }, camX: 0, camY: 0, R: newRender(), t: 0, cps: [], menu: true, shake: 0, flash: 0, deadT: -1, wonT: -1 }; }

  const W2S = (S, x, y) => [(x - S.camX) * V.K + S.ox, V.base * V.dpr - (y - S.camY) * V.K + S.oy];
  let stamp = 0;
  const BL = [], OB = [];
  function draw(S) {
    const c = ctx, K = V.K, W = cv.width, H = cv.height, th = theme(), Bd = V.base * V.dpr;
    const sim = S.sim, beat = S.menu ? S.t / 0.5 : sim.t / S.L.spb, ph = beat - Math.floor(beat), pulse = Math.exp(-ph * 5);
    S.pulse = pulse;
    let ox = 0, oy = 0; if (S.shake > 0 && !MG.reduced()) { const a = S.shake * S.shake * 0.35 * K; ox = (Math.random() * 2 - 1) * a; oy = (Math.random() * 2 - 1) * a; }
    S.ox = ox; S.oy = oy;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = BG.sky; c.fillRect(0, 0, W, H);
    const floorY = Bd + S.camY * K + oy;
    // étoiles + silhouettes (parallaxe)
    const sX = -((S.camX * K * 0.04) % W); c.drawImage(BG.stars, sX, -S.camY * K * 0.02); c.drawImage(BG.stars, sX + W, -S.camY * K * 0.02);
    const fw = BG.far.width, fX = -(((S.camX * K * 0.14) % fw) + fw) % fw, fY = floorY - BG.far.height + S.camY * K * 0.75;
    c.globalAlpha = 0.85 + pulse * 0.15; c.drawImage(BG.far, fX + ox * 0.3, fY); c.drawImage(BG.far, fX + fw + ox * 0.3, fY); c.globalAlpha = 1;
    // formes au milieu (parallaxe 0,35) qui battent la mesure
    c.lineWidth = 0.06 * K; c.strokeStyle = th.mid || th.edge;
    const mp = S.camX * 0.35, m0 = Math.floor(mp / 6) - 1;
    for (let k = m0; k < m0 + V.vw / 6 + 3; k++) {
      const hsh = Math.sin(k * 12.9898) * 43758.5453, rnd = hsh - Math.floor(hsh), sx = (k * 6 - mp) * K + ox * 0.6, sy = floorY - (3 + rnd * 7 - S.camY * 0.65) * K, s = (0.5 + rnd * 0.7) * K * (1 + pulse * 0.08);
      c.globalAlpha = 0.16 + pulse * 0.1; c.save(); c.translate(sx, sy); c.rotate(S.t * (rnd - 0.5) * 0.8 + k);
      c.beginPath(); if (rnd > 0.5) c.rect(-s, -s, 2 * s, 2 * s); else { c.moveTo(0, -s * 1.2); c.lineTo(s * 1.05, s * 0.6); c.lineTo(-s * 1.05, s * 0.6); c.closePath(); } c.stroke(); c.restore();
    }
    c.globalAlpha = 1;
    // sol
    if (floorY < H) {
      c.save(); c.translate(0, floorY); c.fillStyle = BG.ground; c.fillRect(0, 0, W, H - floorY + 2);
      c.strokeStyle = th.edge; c.lineWidth = Math.max(1, 0.035 * K);
      const g0 = Math.floor(S.camX / 2) * 2;
      c.globalAlpha = 0.22; c.beginPath();
      for (let gx = g0; gx < S.camX + V.vw + 2; gx += 2) { const sx = (gx - S.camX) * K + ox; c.moveTo(sx, 0); c.lineTo(sx + (sx - W * 0.5) * 0.35, H - floorY); }
      c.stroke();
      for (let i = 1; i < 6; i++) { c.globalAlpha = 0.2 / i; c.beginPath(); c.moveTo(0, i * i * 0.35 * K); c.lineTo(W, i * i * 0.35 * K); c.stroke(); }
      c.restore();
      c.globalAlpha = 0.3 + pulse * 0.35; c.fillStyle = th.line; c.fillRect(0, floorY - 0.09 * K, W, 0.18 * K);
      c.globalAlpha = 1; c.fillRect(0, floorY - 0.025 * K, W, 0.05 * K);
    }
    if (!S.menu) drawObjects(S, pulse);
    drawTrail(S);
    drawMilo(S, pulse);
    drawParts(S);
    if (S.flash > 0) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = S.flash * 0.55; c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  }
  function drawObjects(S, pulse) {
    const c = ctx, K = V.K, L = S.L, th = theme(), sim = S.sim;
    const c0 = Math.floor(S.camX) - 2, c1 = Math.ceil(S.camX + V.vw) + 2, sp = ++stamp;
    BL.length = 0; OB.length = 0;
    for (let col = c0; col <= c1; col++) {
      const a = L.gS[col]; if (a) for (let k = 0; k < a.length; k++) { const o = L.objs[a[k]]; if (o.ds !== sp) { o.ds = sp; BL.push(o); } }
      const b = L.gO[col]; if (b) for (let k = 0; k < b.length; k++) { const id = b[k], o = L.objs[id]; if (o.ds !== sp) { o.ds = sp; o.id = id; OB.push(o); } }
    }
    const yTop = S.camY + V.base / V.bs + 1, yBot = S.camY - (V.ch - V.base) / V.bs - 1;
    // blocs : remplissage, grille intérieure, contours lumineux
    c.setTransform(K, 0, 0, -K, -S.camX * K + S.ox, V.base * V.dpr + S.camY * K + S.oy);
    c.fillStyle = th.block; c.beginPath();
    for (const o of BL) { const y0 = Math.max(o.y0, yBot), y1 = Math.min(o.y1, yTop); if (y1 > y0) c.rect(o.x0, y0, o.x1 - o.x0, y1 - y0); }
    c.fill();
    c.strokeStyle = th.edge; c.lineWidth = 0.035; c.globalAlpha = 0.18; c.beginPath();
    for (const o of BL) {
      const y0 = Math.max(o.y0, yBot), y1 = Math.min(o.y1, yTop); if (y1 <= y0) continue;
      for (let gx = Math.ceil(o.x0 + 0.01); gx < o.x1 - 0.01; gx++) { c.moveTo(gx, y0); c.lineTo(gx, y1); }
      for (let gy = Math.ceil(y0 + 0.01); gy < y1 - 0.01; gy++) { c.moveTo(o.x0, gy); c.lineTo(o.x1, gy); }
    }
    c.stroke();
    c.globalAlpha = 0.3; c.lineWidth = 0.2; c.beginPath();
    for (const o of BL) { const y0 = Math.max(o.y0, yBot), y1 = Math.min(o.y1, yTop); if (y1 > y0) c.rect(o.x0, y0, o.x1 - o.x0, y1 - y0); }
    c.stroke(); c.globalAlpha = 1; c.lineWidth = 0.06; c.stroke();
    c.strokeStyle = th.line; c.lineWidth = 0.08; c.globalAlpha = 0.75 + pulse * 0.25; c.beginPath();
    for (const o of BL) { if (o.y1 <= yTop && o.y1 >= yBot) { c.moveTo(o.x0, o.y1); c.lineTo(o.x1, o.y1); } if (o.y0 > 0.01 && o.y0 >= yBot && o.y0 <= yTop) { c.moveTo(o.x0, o.y0); c.lineTo(o.x1, o.y0); } }
    c.stroke(); c.globalAlpha = 1;
    // petites croix « Milo » sur les blocs compacts
    c.strokeStyle = th.edge; c.lineWidth = 0.09; c.lineCap = 'round'; c.globalAlpha = 0.35; c.beginPath();
    for (const o of BL) { const w = o.x1 - o.x0, h = o.y1 - o.y0; if (w >= 0.9 && w <= 4 && h >= 0.9 && h <= 4) { const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2; c.moveTo(cx - 0.16, cy); c.lineTo(cx + 0.16, cy); c.moveTo(cx, cy - 0.16); c.lineTo(cx, cy + 0.16); } }
    c.stroke(); c.globalAlpha = 1; c.lineCap = 'butt';
    c.setTransform(1, 0, 0, 1, 0, 0);
    // arrivée
    if (L.lenX < S.camX + V.vw + 4) {
      const [gx] = W2S(S, L.lenX, 0), top = 0, bot = V.base * V.dpr + S.camY * K + S.oy;
      const g = c.createLinearGradient(gx - 2.4 * K, 0, gx + 0.4 * K, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, rgba(th.line, 0.45 + pulse * 0.2));
      c.fillStyle = g; c.fillRect(gx - 2.4 * K, top, 2.8 * K, bot - top);
      c.fillStyle = '#ffffff'; c.fillRect(gx, top, 0.12 * K, bot - top);
      for (let i = 0; i < 6; i++) { const yy = bot - (1.5 + i * 2.2) * K; c.globalAlpha = 0.85; c.fillStyle = i % 2 ? th.spike : th.line; c.fillRect(gx - 0.3 * K, yy - 0.06 * K, 0.6 * K, 0.12 * K); c.fillRect(gx - 0.06 * K, yy - 0.3 * K, 0.12 * K, 0.6 * K); }
      c.globalAlpha = 1;
    }
    // objets
    for (const o of OB) {
      if (o.t === 1) { const [sx, sy] = W2S(S, o.x0, o.y); if (o.dir > 0) c.drawImage(SPR.spike, sx - 0.3 * K, sy - 1.3 * K); else c.drawImage(SPR.spikeD, sx - 0.3 * K, sy - 0.3 * K); }
      else if (o.t === 2) { const [sx, sy] = W2S(S, o.cx, o.cy), img = sawSpr(o.r), a = S.t * 5 * (o.cx % 2 > 1 ? 1 : -1); c.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), sx, sy); c.drawImage(img, -img.width / 2, -img.height / 2); c.setTransform(1, 0, 0, 1, 0, 0); }
      else if (o.t === 3) { const [sx, sy] = W2S(S, o.cx, o.cy), used = sim.used[o.id], s = 2 * K * (used ? 0.8 : 1 + pulse * 0.14); c.globalAlpha = used ? 0.35 : 1; c.drawImage(SPR.orb, sx - s / 2, sy - s / 2, s, s); c.globalAlpha = 1; }
      else if (o.t === 4) { const [sx, sy] = W2S(S, o.cx, o.y); if (o.dir > 0) c.drawImage(SPR.pad, sx - 0.8 * K, sy - 0.75 * K); else c.drawImage(SPR.padD, sx - 0.8 * K, sy - 0.15 * K); }
      else if (o.t === 5) { const img = SPR.portal[o.kind]; if (!img) continue; const [sx, sy] = W2S(S, o.cx, o.cy), sc = 1 + pulse * 0.05; c.globalAlpha = sim.used[o.id] ? 0.55 : 1; c.drawImage(img, sx - img.width * sc / 2, sy - img.height * sc / 2, img.width * sc, img.height * sc); c.globalAlpha = 1; }
      else if (o.t === 6) { if (sim.used[o.id]) continue; const [sx, sy] = W2S(S, o.cx, o.cy + Math.sin(S.t * 3 + o.n) * 0.12), had = S.banked && S.banked[o.n], s = 1.8 * K * (1 + pulse * 0.1); c.globalAlpha = had ? 0.4 : 1; c.drawImage(SPR.star, sx - s / 2, sy - s / 2, s, s); c.globalAlpha = 1; }
    }
    // points de contrôle
    if (S.cps) for (const p of S.cps) { const [sx, sy] = W2S(S, p.s.x, p.s.y); if (sx > -K && sx < cv.width + K) c.drawImage(SPR.cp, sx - 0.5 * K, sy - 0.5 * K); }
    // textes dans le décor
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const txt = (s, wx, wy, size) => { const [sx, sy] = W2S(S, wx, wy); if (sx < -6 * K || sx > cv.width + 6 * K) return; c.font = `900 ${Math.round(size * K)}px ${V.font}`; c.lineWidth = 0.22 * K; c.strokeStyle = rgba(th.edge, 0.55); c.strokeText(s, sx, sy); c.fillStyle = '#ffffff'; c.fillText(s, sx, sy); };
    if (S.attTxt) txt(S.attTxt, 6.4, 5.2, 0.85);
    for (const t of L.texts) txt(t.s, t.x, t.y, 0.6);
  }
  function drawTrail(S) {
    const R = S.R, tr = R.trail, n = tr.length; if (n < 2 || S.deadT >= 0) return;
    const c = ctx, K = V.K, cols = skinCols(S.t);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const k = i / n, [x0, y0] = W2S(S, tr[i - 1][0], tr[i - 1][1]), [x1, y1] = W2S(S, tr[i][0], tr[i][1]);
      c.globalAlpha = k * 0.45; c.strokeStyle = i < n * 0.5 ? cols[1] : cols[0]; c.lineWidth = (0.05 + k * 0.26) * K;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
  }
  function drawMilo(S, pulse) {
    const c = ctx, K = V.K, s = S.sim, R = S.R;
    if (S.deadT >= 0) {
      const ko = R.ko, im = IMG.ko; if (!ko || !im || !im.ok || S.deadT > 0.65) return;
      const [sx, sy] = W2S(S, ko.x, ko.y), H = 1.2 * K, Wd = H * im.width / im.height;
      c.globalAlpha = clamp(1 - S.deadT / 0.65, 0, 1); c.setTransform(1, 0, 0, 1, sx, sy); c.rotate(ko.r); c.drawImage(im, -FLY.ko[1] * Wd, -FLY.ko[2] * H, Wd, H); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; return;
    }
    const [sx, sy] = W2S(S, s.x, s.y);
    const auras = SPR.aura, au = auras[Math.floor(S.t * 3) % auras.length], ar = 3 * K * (1 + pulse * 0.08);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.7; c.drawImage(au, sx - ar / 2, sy - ar / 2, ar, ar); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.setTransform(1, 0, 0, 1, sx, sy); if (s.gs < 0) c.scale(1, -1);
    if (s.mode === 0) {
      const im = IMG.run; if (!im || !im.ok) { c.setTransform(1, 0, 0, 1, 0, 0); return; }
      const H = 1.3 * K, Wd = H * RUN.fw / RUN.fh; let f, bob = 0, sq = 1;
      if (s.ground) { const ph = R.runPh % RUN.n, fr = ph - Math.floor(ph); f = Math.floor(ph); const nx = (f + 1) % RUN.n; bob = (LIFT[f] + (LIFT[nx] - LIFT[f]) * fr) * H / 98; sq = SQ[f] + (SQ[nx] - SQ[f]) * fr; }
      else f = s.vy * s.gs > 0 ? 3 : 10;
      c.translate(0, -bob); c.rotate(R.rot); c.scale(R.sx * (2 - sq), R.sy * sq);
      c.drawImage(im, f * RUN.fw, 0, RUN.fw, RUN.fh, -RUN.ax * Wd, 0.5 * K - RUN.ay * H, Wd, H);
    } else {
      const key = s.hold ? (Math.floor(R.flap * 12) % 2 ? 'haut' : 'bas') : 'vol', im = IMG[key];
      if (im && im.ok) { const H = 1.2 * K, Wd = H * im.width / im.height, a = clamp(s.vy * s.gs / 18, -0.5, 0.5); c.rotate(-a); c.drawImage(im, -FLY[key][1] * Wd, -FLY[key][2] * H, Wd, H); }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawParts(S) {
    const c = ctx, K = V.K;
    c.globalCompositeOperation = 'lighter';
    for (const p of parts) { const k = p.life / p.max, [sx, sy] = W2S(S, p.x, p.y), z = p.size * K * (0.4 + 0.6 * k); c.globalAlpha = Math.min(1, k * 1.5); c.fillStyle = p.col; if (p.rot != null) { c.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), sx, sy); c.fillRect(-z / 2, -z / 2, z, z); c.setTransform(1, 0, 0, 1, 0, 0); } else c.fillRect(sx - z / 2, sy - z / 2, z, z); }
    for (const r of rings) { const k = r.life / r.max, [sx, sy] = W2S(S, r.x, r.y); c.globalAlpha = k * 0.9; c.strokeStyle = r.col; c.lineWidth = r.w * K * k + 1; c.beginPath(); c.arc(sx, sy, r.r * K, 0, 6.283); c.stroke(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function addP(x, y, vx, vy, col, size, life, g, rot) { if (parts.length > 260) return; parts.push({ x, y, vx, vy, col, size, life, max: life, g: g || 0, rot: rot ? Math.random() * 6 : null, vr: (Math.random() - 0.5) * 12 }); }
  function burst(x, y, cols, n, sp, o) { o = o || {}; if (MG.reduced()) n = Math.ceil(n / 2); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = sp * (0.3 + Math.random()); addP(x, y, Math.cos(a) * s + (o.vx || 0), Math.sin(a) * s + (o.vy || 0), cols[i % cols.length], (o.size || 0.2) * (0.6 + Math.random() * 0.8), (o.life || 0.6) * (0.6 + Math.random() * 0.6), o.g || 0, o.rot); } }
  function ring(x, y, col, sp, w, life) { rings.push({ x, y, col, r: 0.3, vr: sp || 9, w: w || 0.15, life: life || 0.45, max: life || 0.45 }); }
  function updFx(S, dt) {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; if (p.rot != null) p.rot += p.vr * dt; }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; if (r.life <= 0) { rings.splice(i, 1); continue; } r.r += r.vr * dt; r.vr *= 1 - dt * 3; }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.6);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 3);
  }
  // animation de Milo (rotation, écrasement, course, traînée, étincelles)
  function animMilo(S, dt) {
    const s = S.sim, R = S.R, cols = skinCols(S.t);
    if (s.mode === 0) {
      if (s.ground) { R.runPh += dt * (S.menu ? 18 : 13 + SPEEDS[s.spd]); const tg = Math.round(R.rot / 6.2832) * 6.2832; R.rot += (tg - R.rot) * (1 - Math.exp(-dt * 28)); }
      else if (R.spin) R.rot += R.rate * dt;
      else R.rot += (0.18 - R.rot) * (1 - Math.exp(-dt * 6));
    } else { R.rot = 0; R.flap += dt; }
    R.sx += (1 - R.sx) * (1 - Math.exp(-dt * 14)); R.sy += (1 - R.sy) * (1 - Math.exp(-dt * 14));
    if (S.deadT < 0) {
      const tx = s.mode === 1 ? s.x - 0.75 : s.x, ty = s.y;
      R.trail.push([tx, ty]); if (R.trail.length > 14) R.trail.shift();
      R.emit -= dt;
      if (R.emit <= 0) {
        if (s.mode === 0 && s.ground) { R.emit = 0.045; addP(s.x - 0.35, s.y - 0.5 * s.gs, -2 - Math.random() * 2, (1 + Math.random() * 2) * s.gs, cols[Math.random() < 0.5 ? 0 : 1], 0.13, 0.35, 6 * s.gs); }
        else if (s.mode === 1) { R.emit = 0.025; addP(s.x - 0.9, s.y - 0.1 * s.gs, -5 - Math.random() * 2, (Math.random() - 0.5) * 1.2, cols[Math.random() < 0.6 ? 0 : 1], s.hold ? 0.22 : 0.14, 0.32); }
        else R.emit = 0.05;
      }
    }
  }

  /* =====================================================================
     Partie
     ===================================================================== */
  const lvData = (i) => { const d = api.data, def = DEFS[i]; return d.levels[def.id]; };
  const unlocked = (i) => i === 0 || !!(lvData(i - 1) && lvData(i - 1).done);
  const totalStars = () => DEFS.reduce((n, def) => n + ((api.data.levels[def.id] || {}).stars || []).filter(Boolean).length, 0);
  const doneCount = () => DEFS.filter((def) => (api.data.levels[def.id] || {}).done).length;
  function skinOpen(sk, d) { d = d || api.data; if (!sk.need) return true; if (sk.need.lv != null) { const def = DEFS[sk.need.lv]; return !!(def && d.levels && d.levels[def.id] && d.levels[def.id].done); } if (sk.need.st != null) return starsIn(d) >= sk.need.st; return false; }
  function starsIn(d) { return DEFS.reduce((n, def) => n + (((d.levels || {})[def.id] || {}).stars || []).filter(Boolean).length, 0); }

  function startLevel(i, practice) {
    sel = i; api.data.sel = i;
    const L = lvl(i);
    st = { L, idx: i, practice: !!practice, sim: null, cps: [], cands: [], cpT: 0, att: 0, camX: 0, camY: 0, R: newRender(), t: 0, shake: 0, flash: 0, deadT: -1, wonT: -1, simReal: 0, inQ: [], auto: null, pct: -1, banked: (lvData(i).stars || []).slice(), respawnT: 0, newBest: false, stepsT: 0 };
    refreshTheme(); parts.length = 0; rings.length = 0;
    closeMenus(); setState('play');
    root.classList.toggle('practice', !!practice);
    UI.lvName.textContent = DEFS[i].name;
    startAttempt();
  }
  function startAttempt() {
    const L = st.L, d = api.data, lv = lvData(st.idx);
    const cp = st.practice && st.cps.length ? st.cps[st.cps.length - 1] : null;
    const s = cp ? cp.s.clone() : new Sim(L);
    s.ev = []; s.hold = held(); s.buf = 0;
    st.sim = s; st.cands = []; st.cpT = 0; st.deadT = -1; st.wonT = -1; st.inQ.length = 0; st.simReal = performance.now(); st.respawnT = s.t; st.jumps0 = s.jumps;
    st.R = newRender(); st.camX = s.x - V.px; st.camY = camTarget(s);
    st.att++;
    if (!st.practice) { lv.att = (lv.att || 0) + 1; d.stats.attempts = (d.stats.attempts || 0) + 1; st.dirty = true; }
    st.attTxt = st.practice ? (cp ? '' : 'Entraînement') : 'Essai ' + (lv.att || st.att);
    if (cp) st.attTxt = '';
    st.runStars = s.stars; updStarsHud();
    Music.start(L, s.t);
    updHud(true);
  }
  function held() { return UI.ptr ? UI.ptr.size > 0 || UI.key : false; }
  function camTarget(s) {
    const z = st.L.cams; for (let i = 0; i < z.length; i++) { const c = z[i]; if (s.x >= c.x0 && s.x <= c.x1) return c.yc - (V.base - V.ch * 0.5) / V.bs; }
    return s.gs > 0 ? Math.max(0, s.y - 5.2) : Math.max(0, s.y - 8.5);
  }
  function stepRun(now, dt) {
    const s = st.sim, L = st.L;
    st.t += dt;
    if (st.deadT >= 0) { st.deadT += dt; if (st.R.ko) { const k = st.R.ko; k.vy -= 30 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.r += k.vr * dt; } if (st.deadT > (st.practice ? 0.6 : 0.75)) startAttempt(); return; }
    if (st.wonT >= 0) { st.wonT += dt; s.x += SPEEDS[s.spd] * dt; s.t += dt; Music.update(s.t); if (s.mode === 0) { s.ground = true; s.y = Math.max(0.5, s.y - 6 * dt); } if (st.wonT > 1.5 && !st.winShown) showWin(); return; }
    let guard = 0; const step = PH.DT * 1000;
    while (st.simReal + step <= now && guard++ < 160) {
      while (st.inQ.length && st.inQ[0].ts <= st.simReal + step) { const e = st.inQ.shift(); if (e.down) s.press(); else s.release(); }
      if (st.auto && s.n % 4 === 0) { const a = st.auto[s.n / 4]; if (a === 1) s.press(); else if (a === 0) s.release(); }
      s.step(); st.simReal += step;
      if (s.dead || s.won) break;
    }
    if (guard >= 160) st.simReal = now;
    events();
    if (st.deadT < 0 && st.wonT < 0) {
      if (!Music.on && !MG.sfx.muted && MG.sfx.ctx()) Music.start(L, s.t);
      Music.update(s.t);
      if (st.practice) {
        st.cpT += dt;
        if (st.cpT > 1.1 && (s.mode === 1 || s.ground)) { st.cpT = 0; st.cands.push({ s: s.clone(), t: s.t }); }
        while (st.cands.length && s.t - st.cands[0].t >= 0.9) st.cps.push(st.cands.shift());
      }
      if (st.attTxt && s.x > 16) st.attTxt = '';
    }
    updHud();
    if (st.dirty && performance.now() - (st.savedAt || 0) > 2500) { st.savedAt = performance.now(); st.dirty = false; api.save(); }
  }
  function events() {
    const s = st.sim, R = st.R, cols = skinCols(st.t), ev = s.ev; if (!ev.length) return;
    for (const e of ev) {
      if (e.k === 'jump') { R.spin = 1; R.rate = 6.2832 / T_AIR * 0.98; R.sx = 0.82; R.sy = 1.2; burst(e.x - 0.2, e.y - 0.5 * s.gs, cols, 5, 2.5, { size: 0.14, life: 0.3, vy: s.gs }); }
      else if (e.k === 'orb') { R.spin = 1; R.rate = 6.2832 / (2 * PH.ORB / PH.G); const o = st.L.objs[e.a]; ring(o.cx, o.cy, '#ffd84d', 10, 0.18); burst(o.cx, o.cy, ['#ffd84d', '#fff3b0', '#ffffff'], 10, 5, { size: 0.16, life: 0.4 }); MG.sfx.play('hop'); }
      else if (e.k === 'pad') { R.spin = 1; R.rate = 6.2832 / (2 * PH.PAD / PH.G); burst(e.x, e.y - 0.5 * s.gs, ['#ffd84d', '#ffb020', '#ffffff'], 12, 4, { size: 0.16, life: 0.45, vy: 4 * s.gs }); MG.sfx.play('whoosh'); }
      else if (e.k === 'portal') { const col = PCOL[e.a] || '#ffffff'; ring(e.x, e.y, col, 12, 0.2, 0.5); burst(e.x, e.y, [col, '#ffffff'], 12, 5, { size: 0.15, life: 0.5 }); MG.sfx.play('whoosh'); R.spin = 0;
        if (!st.seenK) st.seenK = {}; if (!st.seenK[e.a]) { st.seenK[e.a] = 1; const m = { ship: 'Mode vol : maintiens pour monter', flip: 'Gravité inversée !', norm: 'Gravité normale', s2: 'Vitesse ×1,25', s3: 'Vitesse ×1,5', s0: 'Ralenti' }[e.a]; if (m && st.att <= 3) msg(m); } }
      else if (e.k === 'star') { st.runStars = s.stars; burst(e.x, e.y, ['#ffd23f', '#fff3b0', '#ffffff'], 16, 6, { size: 0.2, life: 0.6, rot: true }); ring(e.x, e.y, '#ffd23f', 10, 0.2); MG.sfx.play('star'); updStarsHud(); msg(st.banked[e.a] ? 'Étoile déjà gagnée' : 'Étoile ! Va au bout pour la garder', 'gold'); }
      else if (e.k === 'land') { R.spin = 0; R.sx = 1.25; R.sy = 0.78; burst(e.x, e.y - 0.5 * s.gs, cols, 4, 2, { size: 0.12, life: 0.25, vy: s.gs }); }
      else if (e.k === 'die') die(e);
      else if (e.k === 'win') win();
    }
    ev.length = 0;
  }
  function die(e) {
    const s = st.sim, cols = skinCols(st.t);
    st.deadT = 0; Music.stop(true); MG.sfx.play('crash');
    st.shake = 1; st.flash = 0.7;
    burst(s.x, s.y, cols.concat(['#ffffff']), 30, 9, { size: 0.26, life: 0.75, rot: true, g: 4 });
    ring(s.x, s.y, cols[0], 14, 0.25, 0.5); ring(s.x, s.y, '#ffffff', 8, 0.12, 0.35);
    st.R.ko = { x: s.x, y: s.y, vx: -2.5, vy: 9 * (s.gs > 0 ? 1 : -1), r: 0, vr: -8 };
    const d = api.data, lv = lvData(st.idx), pct = Math.floor(clamp(s.x / st.L.lenX, 0, 1) * 100);
    d.stats.jumps = (d.stats.jumps || 0) + (s.jumps - (st.jumps0 || 0));
    if (st.practice) {
      if (st.cps.length && s.t - st.respawnT < 0.35) st.cps.pop();
      if (pct > (lv.prac || 0)) lv.prac = pct;
    } else if (pct > (lv.best || 0)) { lv.best = pct; if (pct >= 10) { msg('Nouveau record : ' + pct + ' %', 'gold'); setTimeout(() => MG.sfx.play('star'), 120); } }
    st.dirty = true;
  }
  function win() {
    const s = st.sim, d = api.data, lv = lvData(st.idx), def = DEFS[st.idx];
    st.wonT = 0; MG.sfx.play('bigclear'); st.flash = 0.5;
    try { api.fx.confetti(120); } catch (e) {}
    burst(s.x + 1, s.y + 1, ['#ffd23f', '#ffffff', PCOL.ship, PCOL.cube], 30, 9, { size: 0.24, life: 0.9, rot: true });
    d.stats.jumps = (d.stats.jumps || 0) + (s.jumps - (st.jumps0 || 0));
    const before = { skins: SKINS.filter((k) => skinOpen(k)).map((k) => k.id), done: lv.done };
    st.res = { practice: st.practice, newStars: [], att: lv.att || st.att };
    if (st.practice) { lv.prac = 100; }
    else {
      lv.best = 100; lv.done = true; lv.doneAt = lv.doneAt || new Date().toISOString(); d.stats.wins = (d.stats.wins || 0) + 1;
      const arr = lv.stars = Array.from({ length: st.L.nStars }, (_, k) => ((lv.stars || [])[k] ? 1 : 0)); for (let i = 0; i < st.L.nStars; i++) if (s.stars & (1 << i)) { if (!arr[i]) st.res.newStars.push(i); arr[i] = 1; }
      st.res.firstWin = !before.done;
      st.res.newLevel = !before.done && DEFS[st.idx + 1] ? DEFS[st.idx + 1].name : '';
      st.res.newSkins = SKINS.filter((k) => skinOpen(k) && before.skins.indexOf(k.id) < 0).map((k) => k.name);
    }
    st.res.stars = s.stars;
    setTimeout(() => { if (st && st.wonT >= 0) Music.stop(); }, 1400);
    api.save(); st.dirty = false;
  }

  /* =====================================================================
     Interface
     ===================================================================== */
  function setState(s) { state = s; if (root) root.dataset.state = s; }
  function msg(text, cls) { if (!UI.msg) return; UI.msg.textContent = text; UI.msg.className = 'dh-msg' + (cls ? ' ' + cls : ''); void UI.msg.offsetWidth; UI.msg.classList.add('show'); }
  function updHud(force) {
    if (!st || !UI.pct) return;
    const p = Math.floor(clamp(st.sim.x / st.L.lenX, 0, 1) * 100);
    if (p !== st.pct || force) { st.pct = p; UI.pct.textContent = p + ' %'; UI.bar.style.transform = `scaleX(${p / 100})`; }
  }
  function updStarsHud() {
    if (!UI.hstars || !st) return;
    let h = ''; for (let i = 0; i < st.L.nStars; i++) { const got = st.runStars & (1 << i), had = st.banked[i]; h += `<i class="${got ? 'got' : had ? 'had' : ''}">${MG.icon('star')}</i>`; }
    UI.hstars.innerHTML = h;
  }
  const FACE = (f) => `assets/${f}.webp`;
  const fmtDur = (def) => { const s = Math.round(def.len * 60 / def.bpm); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function starRow(arr, n) { let h = ''; for (let i = 0; i < n; i++) h += `<i class="${arr && arr[i] ? 'on' : ''}">${MG.icon('star')}</i>`; return `<span class="dh-srow">${h}</span>`; }
  function homeHTML() {
    const d = api.data, sk = skinOf(), nst = DEFS.reduce((n, def) => n + lvl(DEFS.indexOf(def)).nStars, 0);
    return `<div class="dh-scr dh-home">
      <img class="dh-logo" src="${MG.asset('logo_dash.webp')}" alt="Milo Dash" draggable="false">
      <div class="dh-sheet">
        <div class="dh-chips"><div>${MG.icon('star')}<b>${totalStars()}/${nst}</b><span>Étoiles</span></div><div>${MG.icon('trophy')}<b>${doneCount()}/${DEFS.length}</b><span>Niveaux</span></div><div>${MG.icon('redo')}<b>${MG.fmt(d.stats.attempts || 0)}</b><span>Essais</span></div></div>
        <button class="gbtn dh-big" data-dh="levels">${MG.icon('play')}Jouer</button>
        <button class="gbtn light dh-skinbtn" data-dh="skins"><i class="dh-dot" style="background:${sk.c ? `linear-gradient(135deg,${sk.c[0]},${sk.c[1]})` : 'conic-gradient(#ff4f6d,#ffe14d,#5dff8a,#4fd2ff,#9b6bff,#ff4f6d)'}"></i>Personnage : ${sk.name}</button>
        <p class="dh-tip"><b>Touche</b> pour sauter, <b>maintiens</b> pour enchaîner. Saute sur le rythme !</p>
      </div></div>`;
  }
  function levelsHTML() {
    const d = api.data;
    const cards = DEFS.map((def, i) => {
      const L = lvl(i), lv = d.levels[def.id], open = unlocked(i), th = def.theme;
      return `<article class="dh-lv ${open ? '' : 'locked'} ${lv.done ? 'done' : ''}" style="--a:${th.edge};--b:${th.spike};--c:${th.sky[1]}">
        <div class="dh-lv-top"><img src="${FACE(def.face)}" alt="" draggable="false"><div class="grow"><b>${i + 1}. ${def.name}</b><small>${def.diff} · ${def.bpm} BPM · ${fmtDur(def)}</small></div>${starRow(lv.stars, L.nStars)}</div>
        ${open ? `<div class="dh-lv-bar"><i style="width:${lv.best || 0}%"></i></div>
        <div class="dh-lv-row"><span>${lv.done ? MG.icon('trophy') + 'Terminé' : 'Record ' + (lv.best || 0) + ' %'}</span><span>Entraînement ${lv.prac || 0} %</span><span>${MG.fmt(lv.att || 0)} essai${(lv.att || 0) > 1 ? 's' : ''}</span></div>
        <div class="dh-lv-acts"><button class="gbtn" data-dh="play" data-lv="${i}">${MG.icon('play')}Jouer</button><button class="gbtn ghost" data-dh="practice" data-lv="${i}">Entraînement</button></div>`
        : `<div class="dh-lock">${MG.icon('lock')}Termine « ${DEFS[i - 1].name} » pour débloquer</div>`}
      </article>`;
    }).join('');
    return `<div class="dh-scr dh-panel"><div class="dh-head"><button class="gclose" data-dh="home" aria-label="Retour"><svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><h3>Niveaux</h3><span class="grow"></span><span class="dh-tot">${MG.icon('star')}${totalStars()}</span></div>
      <div class="dh-list gscroll">${cards}<p class="dh-foot">Les étoiles ramassées ne comptent que si tu termines le niveau. L'entraînement place des points de contrôle mais ne débloque rien.</p></div></div>`;
  }
  function skinsHTML() {
    const d = api.data;
    const tiles = SKINS.map((sk) => {
      const open = skinOpen(sk), on = d.skin === sk.id, bg = sk.c ? `radial-gradient(circle at 50% 55%,${rgba(sk.c[0], 0.85)},${rgba(sk.c[1], 0.25)} 62%,transparent 72%)` : 'radial-gradient(circle at 50% 55%,rgba(255,255,255,.5),transparent 70%),conic-gradient(from 30deg,#ff4f6d,#ffe14d,#5dff8a,#4fd2ff,#9b6bff,#ff4f6d)';
      return `<button class="dh-sk ${open ? '' : 'locked'} ${on ? 'on' : ''}" data-dh="skin" data-sk="${sk.id}" ${open ? '' : 'aria-disabled="true"'}>
        <span class="dh-sk-art" style="background:${bg}"><i class="dh-sk-milo"></i>${open ? '' : `<span class="dh-sk-lock">${MG.icon('lock')}</span>`}</span>
        <b>${sk.name}</b><small>${on ? 'Choisi' : open ? 'Toucher pour choisir' : sk.how}</small></button>`;
    }).join('');
    return `<div class="dh-scr dh-panel"><div class="dh-head"><button class="gclose" data-dh="home" aria-label="Retour"><svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><h3>Personnage</h3></div>
      <div class="dh-list gscroll"><p class="dh-sub">Milo garde sa bouille : chaque style change son aura et sa traînée lumineuse.</p><div class="dh-skins">${tiles}</div></div></div>`;
  }
  function showScreen(s) {
    screen = s; st && Music.stop();
    if (s !== 'home' && s !== 'levels' && s !== 'skins') return;
    if (!menu) makeMenu();
    menu.L.idx = sel; refreshTheme();
    setState(s); root.classList.remove('practice');
    UI.menu.innerHTML = s === 'home' ? homeHTML() : s === 'levels' ? levelsHTML() : skinsHTML();
    UI.menu.classList.add('show');
    const m = root.querySelector('.dh-over'); if (m) m.remove();
  }
  function closeMenus() { UI.menu.classList.remove('show'); UI.menu.innerHTML = ''; const m = root.querySelector('.dh-over'); if (m) m.remove(); }
  function pause() { if (state !== 'play' || !st || st.deadT >= 0 || st.wonT >= 0) return; setState('paused'); Music.stop(true); UI.ppct.textContent = `${st.pct} %${st.practice ? ' · entraînement' : ''}`; UI.pprac.textContent = st.practice ? 'Passer en mode normal' : 'Passer en entraînement'; if (st.dirty) { api.save(); st.dirty = false; } }
  function resume() { if (state !== 'paused') return; setState('play'); st.simReal = performance.now(); st.sim.hold = held(); Music.start(st.L, st.sim.t); last = 0; }
  function showWin() {
    st.winShown = true;
    const r = st.res, def = DEFS[st.idx], L = st.L, next = DEFS[st.idx + 1], nextOpen = next && unlocked(st.idx + 1);
    const m = document.createElement('div'); m.className = 'gmodal dh-over';
    let stars = ''; for (let i = 0; i < L.nStars; i++) { const got = r.stars & (1 << i), had = st.banked[i]; stars += `<i class="${got ? 'got' : had ? 'had' : ''} ${r.newStars.indexOf(i) >= 0 ? 'new' : ''}">${MG.icon('star')}</i>`; }
    const unl = []; if (r.newLevel) unl.push(`${MG.icon('trophy')}Nouveau niveau : <b>${r.newLevel}</b>`); (r.newSkins || []).forEach((n) => unl.push(`${MG.icon('star')}Nouveau personnage : <b>${n}</b>`));
    m.innerHTML = r.practice
      ? `<div class="gpanel"><img class="mas" src="${FACE('pl3_joie')}" alt=""><h3>Entraînement réussi !</h3><p>Tu connais tout le parcours de « ${def.name} ». Prêt pour le vrai défi, sans point de contrôle ?</p>
        <div class="acts"><button class="gbtn" data-dh="play" data-lv="${st.idx}">${MG.icon('play')}Jouer en normal</button><button class="gbtn light" data-dh="practice" data-lv="${st.idx}">Refaire l'entraînement</button><button class="gbtn light" data-dh="levels">Niveaux</button></div></div>`
      : `<div class="gpanel"><img class="mas" src="${FACE('pl3_fete')}" alt=""><h3>${r.firstWin ? 'Niveau terminé !' : 'Encore réussi !'}</h3><p>« ${def.name} » à 100 % ${r.att > 1 ? `en ${MG.fmt(r.att)} essais` : 'du premier coup'} !</p>
        <div class="dh-wstars">${stars}</div>
        ${unl.length ? `<div class="dh-unl">${unl.map((u) => `<div>${u}</div>`).join('')}</div>` : ''}
        <div class="acts">${nextOpen ? `<button class="gbtn" data-dh="play" data-lv="${st.idx + 1}">${MG.icon('play')}Niveau suivant</button>` : ''}<button class="gbtn ${nextOpen ? 'light' : ''}" data-dh="play" data-lv="${st.idx}">${MG.icon('redo')}Rejouer</button><button class="gbtn light" data-dh="levels">Niveaux</button></div></div>`;
    root.appendChild(m); setState('won');
    if (!r.practice) setTimeout(() => { MG.sfx.play(r.newStars.length || r.firstWin ? 'record' : 'star'); if (unl.length) setTimeout(() => MG.sfx.play('unlock'), 500); }, 250);
  }

  /* ---------- Entrées ---------- */
  function inputDown() { if (state === 'play' && st && st.deadT < 0 && st.wonT < 0) { st.inQ.push({ ts: performance.now(), down: true }); root.classList.add('moved'); } }
  function inputUp() { if (state === 'play' && st && !held()) st.inQ.push({ ts: performance.now(), down: false }); }
  function onDown(e) {
    if (e.button > 0 || e.target.closest('button, .dh-menu .dh-scr, .gmodal, .dh-pauseov')) return;
    if (e.cancelable) e.preventDefault();
    UI.ptr.add(e.pointerId); inputDown();
  }
  function onUp(e) { if (!UI.ptr.has(e.pointerId)) return; UI.ptr.delete(e.pointerId); inputUp(); }
  function onClick(e) {
    const b = e.target.closest('[data-dh]'); if (!b) return;
    const a = b.dataset.dh;
    if (a !== 'skin') MG.sfx.play('tap');
    if (a === 'levels' || a === 'home' || a === 'skins') { if (st && (state === 'paused' || state === 'won')) { if (st.dirty) api.save(); st = null; } showScreen(a); }
    else if (a === 'play' || a === 'practice') { const i = +b.dataset.lv; if (unlocked(i)) startLevel(i, a === 'practice'); }
    else if (a === 'skin') { const sk = SKINS.find((k) => k.id === b.dataset.sk); if (sk && skinOpen(sk)) { api.data.skin = sk.id; api.save(); MG.sfx.play('pick'); sprKey = ''; buildSprites(); UI.menu.innerHTML = skinsHTML(); } else MG.sfx.play('invalid'); }
    else if (a === 'pause') pause();
    else if (a === 'resume') resume();
    else if (a === 'restart') { setState('play'); st.cps = []; st.att = Math.max(0, st.att); startAttempt(); }
    else if (a === 'toggle') startLevel(st.idx, !st.practice);
    else if (a === 'quit') api.close();
  }
  function onKey(e) {
    if (!root || e.metaKey || e.ctrlKey) return;
    const k = e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    if (e.type === 'keyup') { if (k) { UI.key = false; inputUp(); } return; }
    if (k) { e.preventDefault(); if (e.repeat) return; if (state === 'play') { UI.key = true; inputDown(); } else if (state === 'paused') resume(); }
    else if (e.code === 'KeyP') { state === 'play' ? pause() : resume(); }
  }
  function onVis() { if (document.hidden) pause(); }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!root || !ctx) return;
    if (!last) last = now; let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
    if (!BG.sky) { layout(); if (!BG.sky) return; }
    const S = scene(); if (!S) return;
    if (S === st) {
      if (state === 'play') stepRun(now, dt);
      else if (state === 'won') stepRun(now, dt);
      if (state === 'play' || state === 'won') { animMilo(st, dt); updFx(st, dt); if (st.wonT < 0) st.camX = st.sim.x - V.px; const ty = camTarget(st.sim); st.camY += (ty - st.camY) * (1 - Math.exp(-dt * 4.5)); }
    } else {
      S.t += dt; S.sim.x += 5 * dt; S.sim.t = S.t; S.camX = S.sim.x - V.px; animMilo(S, dt); updFx(S, dt);
    }
    draw(S);
  }

  /* ---------- Module ---------- */
  MG.register({
    id: 'dash', name: 'Milo Dash', logo: 'logo_dash.webp', theme: 'dash',
    mount(frame, a) {
      api = a; const d = api.data; d.v = 1; d.stats = d.stats || {}; d.levels = d.levels || {}; d.skin = d.skin || 'neon';
      DEFS.forEach((def) => { const lv = d.levels[def.id] = Object.assign({ best: 0, prac: 0, done: false, stars: [], att: 0 }, d.levels[def.id] || {}); lv.stars = [0, 1, 2].map((k) => (lv.stars[k] ? 1 : 0)); });
      if (!skinOpen(skinOf())) d.skin = 'neon';
      sel = clamp(d.sel || 0, 0, DEFS.length - 1); if (!unlocked(sel)) sel = 0;
      root = document.createElement('div'); root.className = 'dh-root'; root.dataset.state = 'home';
      root.innerHTML = `<canvas class="dh-cv" role="img" aria-label="Milo Dash"></canvas>
        <div class="dh-hud"><button class="gclose dh-pause" data-dh="pause" aria-label="Pause">${MG.icon('pause')}</button>
          <div class="dh-prog"><div class="dh-track"><i></i></div><b>0 %</b></div>
          <div class="dh-hstars"></div></div>
        <div class="dh-top">${MG.soundBtn()}<button class="gclose" data-dh="quit" aria-label="Quitter">${MG.icon('x')}</button></div>
        <div class="dh-lvname"></div><div class="dh-pchip">Entraînement</div>
        <div class="dh-msg"></div>
        <div class="dh-hint"><b>Touche</b> pour sauter · <b>maintiens</b> pour enchaîner</div>
        <div class="dh-menu"></div>
        <div class="dh-pauseov"><h3>Pause</h3><p class="dh-ppct"></p><div class="dh-pacts"><button class="gbtn" data-dh="resume">${MG.icon('play')}Reprendre</button><button class="gbtn light" data-dh="restart">${MG.icon('redo')}Recommencer</button><button class="gbtn light dh-pprac" data-dh="toggle"></button><button class="gbtn light" data-dh="levels">Niveaux</button><button class="gbtn ghost" data-dh="quit">Quitter le jeu</button></div></div>`;
      frame.insertBefore(root, frame.firstChild);
      cv = root.querySelector('.dh-cv'); ctx = cv.getContext('2d', { alpha: false });
      UI = { pct: root.querySelector('.dh-prog b'), bar: root.querySelector('.dh-track i'), hstars: root.querySelector('.dh-hstars'), msg: root.querySelector('.dh-msg'), menu: root.querySelector('.dh-menu'), ppct: root.querySelector('.dh-ppct'), pprac: root.querySelector('.dh-pprac'), lvName: root.querySelector('.dh-lvname'), ptr: new Set(), key: false };
      loadImgs(); V.cw = V.ch = 0; BG = {}; sprKey = ''; st = null; menu = null; parts.length = 0; rings.length = 0;
      makeMenu(); layout(); showScreen('home');
      try { ro = new ResizeObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(layout, 80); }); ro.observe(root); } catch (e) { window.addEventListener('resize', layout); }
      root.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey); document.addEventListener('visibilitychange', onVis);
      last = 0; raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf); clearTimeout(rTimer); Music.stop(true);
      try { ro && ro.disconnect(); } catch (e) {} ro = null; window.removeEventListener('resize', layout);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); document.removeEventListener('visibilitychange', onVis);
      if (st && st.dirty) api.save();
      root = null; cv = null; ctx = null; st = null; menu = null; UI = {}; BG = {}; SPR = {}; sprKey = ''; parts.length = 0; rings.length = 0;
    },
    card(d) {
      const lv = d.levels || {}, done = DEFS.filter((def) => (lv[def.id] || {}).done).length, att = (d.stats || {}).attempts || 0, stars = starsIn(d);
      const cur = DEFS.find((def) => !(lv[def.id] || {}).done), best = cur ? ((lv[cur.id] || {}).best || 0) : 100;
      return { desc: 'Milo fonce en rythme sur une musique néon : touche pour sauter, traverse portails, orbes et pièges. 4 niveaux à finir à 100 %.',
        art: `<i class="dh-cmilo" aria-hidden="true"></i>`,
        stats: [['Niveaux', `${done}/${DEFS.length}`, 'trophy'], ['Étoiles', `${stars}/${DEFS.length * 3}`, 'star'], ['Essais', MG.fmt(att), 'redo']],
        progress: DEFS.length ? (done + (cur ? best / 100 : 0)) / DEFS.length : 0, progressLabel: cur ? `« ${cur.name} » : record ${best} %` : 'Tous les niveaux sont terminés !',
        cta: att ? (cur ? 'Continuer' : 'Rejouer') : 'Foncer avec Milo' };
    },
    homeLine(d) { const lv = d.levels || {}; return `Milo Dash ${DEFS.filter((def) => (lv[def.id] || {}).done).length}/${DEFS.length} niveaux`; },
    _debug: { DEFS, SPEEDS, PH, Sim, solve, lvl, melody, build: buildLevel, state: () => st, menu: () => menu, Music, auto: (acts) => { if (st) st.auto = acts; }, start: (i, p) => startLevel(i, p), V }
  });

  /* ---------- Styles ---------- */
  const css = `
  .gscreen.dash{background:#0a0526}
  .dh-root{position:absolute;inset:0;overflow:hidden;z-index:1;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent;color:#fff}
  .dh-cv{position:absolute;inset:0;width:100%;height:100%;display:block}
  .dh-root .gclose{background:rgba(20,10,60,.55);color:#fff;border:1px solid rgba(160,140,255,.35);box-shadow:0 0 14px rgba(120,90,255,.25)}
  .dh-top{position:absolute;top:0;right:0;z-index:9;display:flex;gap:8px;padding:12px 14px 6px}
  .dh-root[data-state=play] .dh-top,.dh-root[data-state=won] .dh-top{display:none}
  .dh-hud{position:absolute;left:0;right:0;top:0;z-index:6;display:none;align-items:center;gap:10px;padding:12px 14px 6px;pointer-events:none}
  .dh-root[data-state=play] .dh-hud,.dh-root[data-state=paused] .dh-hud,.dh-root[data-state=won] .dh-hud{display:flex}
  .dh-hud button{pointer-events:auto}
  .dh-prog{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
  .dh-track{flex:1;height:10px;border-radius:10px;background:rgba(255,255,255,.12);border:1px solid rgba(180,160,255,.35);overflow:hidden}
  .dh-track i{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#3fd2ff,#8b5cff,#ff4fd2);box-shadow:0 0 10px rgba(140,100,255,.8)}
  .dh-prog b{min-width:46px;text-align:right;font-weight:900;font-size:15px;font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(140,100,255,.9)}
  .dh-hstars{display:flex;gap:2px}.dh-hstars i{display:block;width:18px;height:18px}
  .dh-hstars .gi{width:18px;height:18px;fill:rgba(255,255,255,.08);stroke:rgba(255,255,255,.4);stroke-width:1.6}
  .dh-hstars i.had .gi{fill:rgba(255,210,63,.35);stroke:#ffd23f}.dh-hstars i.got .gi{fill:#ffd23f;stroke:#fff3b0;filter:drop-shadow(0 0 4px #ffb000)}
  .dh-lvname{position:absolute;left:0;right:0;top:56px;z-index:4;text-align:center;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.55);pointer-events:none;display:none}
  .dh-root[data-state=play] .dh-lvname{display:block}
  .dh-pchip{position:absolute;left:50%;top:76px;transform:translateX(-50%);z-index:4;display:none;padding:4px 12px;border-radius:20px;background:rgba(70,242,160,.16);border:1px solid rgba(70,242,160,.6);color:#9dffd0;font-size:12px;font-weight:900;letter-spacing:.5px;pointer-events:none}
  .dh-root.practice[data-state=play] .dh-pchip,.dh-root.practice[data-state=paused] .dh-pchip{display:block}
  .dh-msg{position:absolute;left:50%;top:19%;z-index:5;transform:translateX(-50%);max-width:92%;text-align:center;font-size:20px;font-weight:900;color:#fff;-webkit-text-stroke:2px #6a2fd8;paint-order:stroke fill;text-shadow:0 0 14px rgba(150,100,255,.9);opacity:0;pointer-events:none}
  .dh-msg.gold{color:#ffe066;-webkit-text-stroke-color:#a55a00;text-shadow:0 0 14px rgba(255,180,0,.8)}
  .dh-msg.show{animation:dhmsg 1.7s cubic-bezier(.3,1.4,.5,1) forwards}
  @keyframes dhmsg{0%{opacity:0;transform:translate(-50%,10px) scale(.6)}14%{opacity:1;transform:translate(-50%,0) scale(1.06)}24%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-12px)}}
  .dh-hint{position:absolute;left:50%;top:calc(var(--floor,64%) + 40px);transform:translateX(-50%);z-index:4;display:none;padding:9px 15px;border-radius:22px;background:rgba(20,10,60,.7);border:1px solid rgba(160,140,255,.45);font-weight:800;font-size:14px;white-space:nowrap;pointer-events:none;animation:dhhint 1.4s ease-in-out infinite}
  .dh-hint b{color:#7fe3ff}
  .dh-root[data-state=play]:not(.moved) .dh-hint{display:block}
  @keyframes dhhint{50%{transform:translateX(-50%) translateY(-4px)}}
  .dh-menu{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:0;transition:opacity .25s}
  .dh-menu.show{opacity:1;pointer-events:auto}
  .dh-scr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center}
  .dh-home{padding:54px 14px max(12px,env(safe-area-inset-bottom,0px))}
  .dh-logo{height:min(calc(var(--floor,64%) - 120px),300px);width:auto;max-width:78%;filter:drop-shadow(0 0 24px rgba(140,90,255,.55));animation:dhlogo 3s ease-in-out infinite}
  @keyframes dhlogo{50%{transform:translateY(-6px) scale(1.015)}}
  .dh-sheet{position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--floor,64%) + 22px);bottom:max(12px,env(safe-area-inset-bottom,0px));width:min(calc(100% - 28px),400px);display:flex;flex-direction:column;gap:9px;overflow:auto}
  .dh-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .dh-chips div{border-radius:16px;padding:7px 4px;text-align:center;background:rgba(20,10,60,.62);border:1px solid rgba(160,140,255,.3);display:flex;flex-direction:column;align-items:center}
  .dh-chips .gi{width:15px;height:15px;color:#ffd23f}.dh-chips b{font-size:18px;font-weight:900;font-variant-numeric:tabular-nums}.dh-chips span{font-size:11px;font-weight:800;color:rgba(255,255,255,.65)}
  .dh-big{font-size:18px;padding:15px 22px;box-shadow:0 0 24px rgba(140,90,255,.6),inset 0 2px 0 rgba(255,255,255,.3)}
  .dh-skinbtn{gap:10px}.dh-dot{width:20px;height:20px;border-radius:50%;flex:none;box-shadow:0 0 10px rgba(255,255,255,.5)}
  .dh-tip{margin:0;text-align:center;font-size:13px;font-weight:700;color:rgba(255,255,255,.75)}.dh-tip b{color:#7fe3ff}
  .dh-panel{background:linear-gradient(180deg,rgba(10,5,38,.9),rgba(10,5,38,.82));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);align-items:stretch}
  .dh-head{display:flex;align-items:center;gap:10px;padding:12px 14px 8px;padding-right:110px}
  .dh-head h3{margin:0;font-size:24px;font-weight:900;letter-spacing:-.4px;text-shadow:0 0 12px rgba(140,100,255,.8)}
  .dh-tot{display:inline-flex;align-items:center;gap:4px;font-weight:900;font-size:16px}.dh-tot .gi{width:17px;height:17px;fill:#ffd23f;stroke:#ffb000}
  .dh-list{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 14px max(16px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px}
  .dh-lv{position:relative;border-radius:22px;padding:12px;background:linear-gradient(150deg,var(--c),rgba(12,6,40,.95) 70%);border:1.5px solid var(--a);box-shadow:0 0 18px color-mix(in srgb,var(--a) 40%,transparent),inset 0 0 20px rgba(0,0,0,.25);flex:none}
  .dh-lv.done{border-color:#ffd23f}
  .dh-lv-top{display:flex;align-items:center;gap:10px}
  .dh-lv-top img{width:50px;height:50px;object-fit:contain;flex:none;filter:drop-shadow(0 0 8px var(--a))}
  .dh-lv-top b{display:block;font-size:18px;font-weight:900}.dh-lv-top small{display:block;font-size:12px;font-weight:800;color:rgba(255,255,255,.7)}
  .dh-srow{display:flex;gap:1px}.dh-srow i{display:block;width:20px;height:20px}.dh-srow .gi{width:20px;height:20px;fill:rgba(255,255,255,.1);stroke:rgba(255,255,255,.35);stroke-width:1.5}.dh-srow i.on .gi{fill:#ffd23f;stroke:#fff3b0;filter:drop-shadow(0 0 4px #ffb000)}
  .dh-lv-bar{height:8px;border-radius:8px;background:rgba(255,255,255,.12);margin:10px 0 6px;overflow:hidden}.dh-lv-bar i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,var(--a),var(--b))}
  .dh-lv-row{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;font-weight:800;color:rgba(255,255,255,.72)}.dh-lv-row span{display:inline-flex;align-items:center;gap:3px}.dh-lv-row .gi{width:13px;height:13px;color:#ffd23f}
  .dh-lv-acts{display:grid;grid-template-columns:1.2fr 1fr;gap:8px;margin-top:10px}.dh-lv-acts .gbtn{padding:11px 10px;font-size:15px}
  .dh-lv.locked{filter:saturate(.35);opacity:.75}
  .dh-lock{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;font-weight:800;color:rgba(255,255,255,.75)}.dh-lock .gi{width:16px;height:16px}
  .dh-foot,.dh-sub{margin:2px 4px;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.6);text-align:center;line-height:1.4}
  .dh-skins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .dh-sk{border:1.5px solid rgba(160,140,255,.3);border-radius:20px;background:rgba(20,10,60,.6);color:#fff;padding:10px 8px 12px;display:flex;flex-direction:column;align-items:center;gap:3px;font:inherit}
  .dh-sk.on{border-color:#7fe3ff;box-shadow:0 0 16px rgba(127,227,255,.5)}
  .dh-sk b{font-size:15px;font-weight:900}.dh-sk small{font-size:11.5px;font-weight:800;color:rgba(255,255,255,.65);text-align:center}
  .dh-sk-art{position:relative;width:96px;height:96px;border-radius:50%;display:grid;place-items:center}
  .dh-sk-milo{width:72px;height:79px;background:url(${MG.asset(RUN.src)}) 0 0/1200% 100% no-repeat;animation:dhrun .6s steps(12) infinite}
  .dh-sk.locked .dh-sk-milo{filter:grayscale(1) brightness(.6)}
  .dh-sk-lock{position:absolute;right:2px;bottom:2px;width:30px;height:30px;border-radius:50%;background:rgba(10,5,38,.9);display:grid;place-items:center}.dh-sk-lock .gi{width:16px;height:16px}
  .dh-pauseov{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;background:rgba(8,4,30,.55);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);text-align:center}
  .dh-root[data-state=paused] .dh-pauseov{display:flex}
  .dh-pauseov h3{font-size:40px;font-weight:900;margin:0;text-shadow:0 0 16px rgba(140,100,255,.9)}
  .dh-pauseov p{margin:0 0 12px;font-weight:800;color:rgba(255,255,255,.8)}
  .dh-pacts{display:flex;flex-direction:column;gap:9px;width:min(100%,280px)}
  .dh-over .gpanel{background:linear-gradient(180deg,#1d1050,#0f0835);border:1.5px solid rgba(160,140,255,.5);box-shadow:0 0 40px rgba(140,90,255,.5)}
  .dh-over .gpanel h3{color:#fff;text-shadow:0 0 12px rgba(140,100,255,.9)}.dh-over .gpanel p{color:rgba(255,255,255,.78)}
  .dh-wstars{display:flex;justify-content:center;gap:8px;margin:10px 0 4px}.dh-wstars i{display:block;width:40px;height:40px}
  .dh-wstars .gi{width:40px;height:40px;fill:rgba(255,255,255,.08);stroke:rgba(255,255,255,.3);stroke-width:1.3}
  .dh-wstars i.had .gi{fill:rgba(255,210,63,.4);stroke:#ffd23f}.dh-wstars i.got .gi{fill:#ffd23f;stroke:#fff3b0;filter:drop-shadow(0 0 6px #ffb000)}
  .dh-wstars i.new{animation:dhstar .7s cubic-bezier(.3,1.7,.5,1) both .3s}
  @keyframes dhstar{0%{transform:scale(0) rotate(-40deg)}100%{transform:none}}
  .dh-unl{display:flex;flex-direction:column;gap:6px;margin:8px 0 2px}.dh-unl div{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:14px;background:rgba(255,210,63,.12);border:1px solid rgba(255,210,63,.45);font-size:13.5px;font-weight:800}.dh-unl .gi{width:16px;height:16px;color:#ffd23f}
  .gcard.dash .gcard-art{background:radial-gradient(circle at 70% 25%,rgba(255,79,210,.45),transparent 50%),linear-gradient(180deg,#120838 0%,#2a0f63 70%,#0d0630 70%)}
  .gcard.dash .gcard-art:after{content:"";position:absolute;left:0;right:0;bottom:30%;height:3px;background:#6ee7ff;box-shadow:0 0 12px #6ee7ff}
  .gcard.dash .gcard-art img{position:relative;z-index:1;margin-left:28%}
  .dh-cmilo{position:absolute;left:5%;bottom:calc(30% - 2px);width:78px;height:85px;z-index:2;background:url(${MG.asset(RUN.src)}) 0 0/1200% 100% no-repeat;animation:dhrun .55s steps(12) infinite;filter:drop-shadow(0 0 10px rgba(140,100,255,.9))}
  @keyframes dhrun{to{background-position:109.0909% 0}}
  @media (prefers-reduced-motion:reduce){.dh-logo,.dh-hint,.dh-cmilo,.dh-sk-milo{animation:none}}
  `;
  const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);
})();
