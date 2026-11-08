/* =====================================================================
   Milo Games — hub et moteur commun
   - Registre des jeux : MiloGames.register({ id, name, logo, card(), mount(frame, api), unmount() })
   - Écran de jeu plein écran (aucun défilement de la page pendant la partie)
   - Particules (canvas), réactions de Milo, sauvegarde dans S.games (localStorage)
   Ajouter un jeu = un nouveau fichier qui appelle MiloGames.register(...)
   ===================================================================== */
(function () {
  'use strict';

  const MG = (window.MiloGames = { games: [], byId: {}, cur: null });

  MG.register = function (g) { MG.games.push(g); MG.byId[g.id] = g; };

  /* ---------- Sauvegarde ---------- */
  MG.data = function (id) {
    if (!S.games) S.games = {};
    return S.games[id] || (S.games[id] = {});
  };
  MG.persist = function () { try { save(); } catch (e) {} };

  /* ---------- Outils ---------- */
  MG.asset = (p) => 'assets/games/' + p;
  MG.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  MG.fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  MG.rng = function (seed) { let a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  MG.reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  MG.icon = (n, cls) => `<svg class="gi ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${GICONS[n] || ''}</svg>`;
  const GICONS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    redo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sound: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    mute: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    pad: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>'
  };

  /* ---------- Sons (Web Audio synthétisé : aucun fichier, volume discret) ---------- */
  const SND = { ctx: null, out: null, noise: null };
  const sndPrefs = () => MG.data('_reglages');
  function tone(f, o) {
    const ac = SND.ctx, t0 = ac.currentTime + (o.t || 0), d = o.d || 0.12, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.1, t0 + (o.a || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(SND.out); osc.start(t0); osc.stop(t0 + d + 0.03);
  }
  function noise(o) {
    const ac = SND.ctx, t0 = ac.currentTime + (o.t || 0), d = o.d || 0.3;
    if (!SND.noise) { const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; SND.noise = b; }
    const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = SND.noise; fl.type = o.type || 'lowpass'; fl.Q.value = o.q || 0.7;
    fl.frequency.setValueAtTime(o.f || 1500, t0); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.1, t0 + (o.a || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(fl); fl.connect(g); g.connect(SND.out); src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.05);
  }
  const NOTE = (s) => 523.25 * Math.pow(2, s / 12);
  const RECIPES = {
    pick: () => tone(640, { f2: 940, d: 0.07, v: 0.07 }),
    place: (p) => { const k = 1 - Math.min(6, p.n || 0) * 0.03; tone(320 * k, { f2: 150 * k, d: 0.12, v: 0.15 }); tone(1400, { d: 0.03, v: 0.025, type: 'triangle' }); },
    invalid: () => { tone(230, { f2: 190, d: 0.09, v: 0.06, type: 'triangle' }); tone(190, { f2: 150, t: 0.08, d: 0.1, v: 0.05, type: 'triangle' }); },
    clear: (p) => { const n = Math.min(5, p.n || 1), up = Math.min(7, p.up || 0), sc = [0, 4, 7, 12, 16, 19]; for (let i = 0; i <= n; i++) tone(NOTE(sc[i] + up), { t: i * 0.05, d: 0.24, v: 0.075 }); tone(NOTE(sc[n] + 24 + up), { t: n * 0.05, d: 0.32, v: 0.03, type: 'triangle' }); noise({ d: 0.22, v: 0.035, f: 5000, f2: 2000, type: 'highpass' }); },
    bigclear: () => { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(NOTE(s), { t: i * 0.06, d: 0.36, v: 0.07 })); noise({ t: 0.3, d: 0.5, v: 0.04, f: 6000, f2: 2500, type: 'highpass' }); },
    record: () => { [0, 4, 7, 12].forEach((s, i) => tone(NOTE(s), { t: i * 0.11, d: i === 3 ? 0.55 : 0.18, v: 0.08, type: 'triangle' })); tone(NOTE(28), { t: 0.4, d: 0.4, v: 0.025 }); },
    over: () => [7, 4, 0, -5].forEach((s, i) => tone(NOTE(s - 12), { t: i * 0.15, d: 0.3, v: 0.07, type: 'triangle' })),
    hop: () => tone(430 * (0.94 + Math.random() * 0.12), { f2: 680, d: 0.075, v: 0.055 }),
    bonk: () => tone(170, { f2: 110, d: 0.11, v: 0.08, type: 'triangle' }),
    star: () => { tone(NOTE(19), { d: 0.12, v: 0.06, type: 'triangle' }); tone(NOTE(24), { t: 0.07, d: 0.28, v: 0.06, type: 'triangle' }); },
    splash: () => { noise({ d: 0.55, v: 0.16, f: 2600, f2: 260 }); tone(520, { f2: 120, d: 0.28, v: 0.05 }); },
    crash: () => { noise({ d: 0.22, v: 0.14, f: 1800, f2: 200 }); tone(150, { f2: 60, d: 0.3, v: 0.14 }); tone(NOTE(24), { t: 0.15, d: 0.12, v: 0.03, type: 'triangle' }); tone(NOTE(28), { t: 0.24, d: 0.12, v: 0.03, type: 'triangle' }); },
    honk: () => { tone(392, { d: 0.12, v: 0.035, type: 'square' }); tone(494, { d: 0.12, v: 0.03, type: 'square' }); },
    whoosh: () => noise({ d: 0.32, v: 0.05, f: 600, f2: 3200, type: 'bandpass', q: 1.2 }),
    unlock: () => { [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(NOTE(s), { t: i * 0.07, d: 0.3, v: 0.06, type: 'triangle' })); },
    tap: () => tone(900, { d: 0.035, v: 0.04, type: 'triangle' }),
    drop: () => tone(560, { f2: 330, d: 0.09, v: 0.06 }),
    pop: (p) => { const lv = p.lv || 0, f = 880 * Math.pow(0.9, lv); tone(f, { f2: f * 1.6, d: 0.1, v: 0.09 }); tone(f * 0.5, { f2: f * 0.42, d: 0.16, v: 0.05 + Math.min(0.06, lv * 0.006), type: 'triangle' }); if (p.chain > 1) tone(NOTE(12 + Math.min(12, p.chain * 2)), { t: 0.05, d: 0.18, v: 0.04, type: 'triangle' }); },
    warn: () => tone(330, { d: 0.07, v: 0.035, type: 'triangle' })
  };
  MG.sfx = {
    get muted() { try { return !!sndPrefs().muted; } catch (e) { return false; } },
    unlock() {
      try {
        if (!SND.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; SND.ctx = new C(); const comp = SND.ctx.createDynamicsCompressor(); SND.out = SND.ctx.createGain(); SND.out.gain.value = 0.6; SND.out.connect(comp); comp.connect(SND.ctx.destination); }
        if (SND.ctx.state === 'suspended') SND.ctx.resume();
      } catch (e) {}
    },
    ctx() { return SND.ctx && SND.ctx.state === 'running' ? SND.ctx : null; },
    out() { return SND.out; },
    play(name, o) { if (!SND.ctx || SND.ctx.state !== 'running' || MG.sfx.muted) return; const f = RECIPES[name]; if (f) try { f(o || {}); } catch (e) {} },
    toggle() { const p = sndPrefs(); p.muted = !p.muted; MG.persist(); document.querySelectorAll('[data-gsnd]').forEach((b) => { b.innerHTML = MG.icon(p.muted ? 'mute' : 'sound'); b.setAttribute('aria-pressed', p.muted ? 'true' : 'false'); }); if (!p.muted) { MG.sfx.unlock(); MG.sfx.play('tap'); } }
  };
  MG.soundBtn = () => `<button class="gclose gsnd" data-gsnd aria-label="Activer ou couper le son" aria-pressed="${MG.sfx.muted}">${MG.icon(MG.sfx.muted ? 'mute' : 'sound')}</button>`;
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (MG.cur) MG.sfx.unlock(); }, { capture: true, passive: true }));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-gsnd]')) { e.preventDefault(); MG.sfx.toggle(); } });

  /* ---------- Particules ---------- */
  class FX {
    constructor(canvas, host) {
      this.cv = canvas; this.host = host; this.ctx = canvas.getContext('2d'); this.p = []; this.run = false;
      this.resize();
      try { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); } catch (e) {}
    }
    resize() {
      const r = this.host.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height; this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    at(el) { const a = el.getBoundingClientRect(), b = this.host.getBoundingClientRect(); return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2]; }
    burst(x, y, color, n = 12, o = {}) {
      if (MG.reduced()) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (o.speed || 4) * (0.35 + Math.random());
        this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up ?? 1.4), g: o.g ?? 0.17, life: 1, decay: 0.016 + Math.random() * 0.022,
          size: (o.size || 6) * (0.5 + Math.random()), color: Array.isArray(color) ? color[i % color.length] : color,
          shape: o.shape || (Math.random() < 0.35 ? 'star' : 'dot'), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
      }
      this.start();
    }
    ring(x, y, color, size = 3) { this.p.push({ x, y, ring: 1, r: 6, sp: 7, life: 1, decay: 0.035, color, size }); this.start(); }
    confetti(n = 90) {
      const cols = ['#8d5cf6', '#3d6df3', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#ffffff'];
      if (MG.reduced()) n = 20;
      for (let i = 0; i < n; i++) this.p.push({ x: Math.random() * this.w, y: -10 - Math.random() * this.h * 0.4, vx: (Math.random() - 0.5) * 2.2, vy: 2 + Math.random() * 3, g: 0.045, life: 1, decay: 0.0055 + Math.random() * 0.003, size: 7 + Math.random() * 6, color: cols[i % cols.length], shape: 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25 });
      this.start();
    }
    start() {
      if (this.run) return; this.run = true;
      const tick = () => { if (!this.run) return; this.step(); if (this.p.length) requestAnimationFrame(tick); else { this.run = false; this.ctx.clearRect(0, 0, this.w, this.h); } };
      requestAnimationFrame(tick);
    }
    step() {
      const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
      this.p = this.p.filter((q) => q.life > 0 && q.y < this.h + 40);
      for (const q of this.p) {
        q.life -= q.decay;
        if (q.ring) { q.r += q.sp; q.sp *= 0.9; c.globalAlpha = Math.max(0, q.life); c.strokeStyle = q.color; c.lineWidth = q.size * q.life + 0.5; c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.stroke(); continue; }
        q.vy += q.g; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
        c.globalAlpha = Math.max(0, Math.min(1, q.life * 1.5)); c.fillStyle = q.color;
        c.save(); c.translate(q.x, q.y); c.rotate(q.rot); const s = q.size;
        if (q.shape === 'star') { c.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.5708, b = a + 0.6283; c.lineTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); c.lineTo(Math.cos(b) * s * 0.26, Math.sin(b) * s * 0.26); } c.closePath(); c.fill(); }
        else if (q.shape === 'rect') c.fillRect(-s / 2, -s / 4, s, s / 2);
        else if (q.shape === 'sq') { c.fillRect(-s / 2, -s / 2, s, s); }
        else { c.beginPath(); c.arc(0, 0, s / 2, 0, 7); c.fill(); }
        c.restore();
      }
      c.globalAlpha = 1;
    }
    destroy() { this.run = false; this.p = []; try { this.ro && this.ro.disconnect(); } catch (e) {} }
  }
  MG.FX = FX;

  /* ---------- Réactions de Milo ---------- */
  MG.react = function (frame, o) {
    const old = frame.querySelector('.greact'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'greact ' + (o.size || 'md');
    el.innerHTML = `${o.face ? `<img src="${A(MILO[o.face] || o.face)}" alt="" draggable="false">` : ''}<b>${o.text || ''}</b>`;
    frame.appendChild(el);
    setTimeout(() => el.classList.add('out'), o.hold || 1050);
    setTimeout(() => el.remove(), (o.hold || 1050) + 420);
  };

  /* ---------- Écran de jeu ---------- */
  MG.open = function (id, opts) {
    const g = MG.byId[id]; if (!g) return;
    MG.close(true);
    const el = document.createElement('div');
    el.className = 'gscreen ' + (g.theme || '');
    el.innerHTML = '<div class="gframe"><canvas class="gfx" aria-hidden="true"></canvas></div>';
    document.getElementById('app').appendChild(el);
    const frame = el.querySelector('.gframe');
    const fx = new FX(el.querySelector('canvas.gfx'), frame);
    // Aucun défilement ni zoom accidentel pendant la partie (sauf zones .gscroll)
    el.addEventListener('touchmove', (e) => { if (!e.target.closest('.gscroll')) e.preventDefault(); }, { passive: false });
    el.addEventListener('gesturestart', (e) => e.preventDefault());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => e.preventDefault());
    const d = MG.data(id);
    d.stats = d.stats || {};
    d.stats.sessions = (d.stats.sessions || 0) + 1; d.lastPlayed = new Date().toISOString(); MG.persist();
    MG.cur = { g, el, frame, fx };
    const api = { fx, data: d, save: MG.persist, react: (o) => MG.react(frame, o), close: () => MG.close(), wait: MG.wait, rng: MG.rng, icon: MG.icon, asset: MG.asset, fmt: MG.fmt };
    g.mount(frame, api, opts || {});
    requestAnimationFrame(() => el.classList.add('in'));
  };
  MG.close = function (instant) {
    const c = MG.cur; if (!c) return;
    MG.cur = null;
    try { c.g.unmount && c.g.unmount(); } catch (e) {}
    c.fx.destroy();
    if (instant) c.el.remove(); else { c.el.classList.remove('in'); setTimeout(() => c.el.remove(), 260); }
    if (typeof route !== 'undefined' && (route === 'jeux' || route === 'accueil')) render();
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && MG.cur && !document.getElementById('modal')) MG.close(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (b) { e.preventDefault(); MG.open(b.dataset.game); }
  });

  /* ---------- Page « Milo Games » ---------- */
  function totals() {
    let sessions = 0;
    MG.games.forEach((g) => { sessions += (MG.data(g.id).stats || {}).sessions || 0; });
    return { sessions };
  }
  MG.view = function () {
    const t = totals();
    const cards = MG.games.map((g) => {
      const c = g.card(MG.data(g.id));
      return `<article class="gcard ${g.theme || ''}">
        <div class="gcard-art"><img src="${MG.asset(g.logo)}" alt="${g.name}" draggable="false">${c.art || ''}</div>
        <div class="gcard-body">
          <p class="gcard-desc">${c.desc}</p>
          <div class="gstats">${c.stats.map(([l, v, i]) => `<div><span>${i ? MG.icon(i) : ''}${l}</span><b>${v}</b></div>`).join('')}</div>
          ${c.progress != null ? `<div class="gprog"><i style="width:${Math.round(c.progress * 100)}%"></i></div><div class="tiny" style="margin-top:6px">${c.progressLabel || ''}</div>` : ''}
          <button class="btn full gplay" data-game="${g.id}">${MG.icon('play')}${c.cta}</button>
        </div></article>`;
    }).join('');
    return `${head('Milo Games')}
      <div class="ghub-hero">
        <div class="grow"><div class="ghub-eyebrow">${MG.icon('pad')}La salle de jeux</div>
          <h2>Une petite partie pendant que tu te reposes ?</h2>
          <p>${t.sessions ? `Tu as lancé ${MG.fmt(t.sessions)} partie${t.sessions > 1 ? 's' : ''}. Tes progrès sont sauvegardés automatiquement.` : `${['Aucun', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit'][MG.games.length] || MG.games.length} jeux, des progrès sauvegardés automatiquement. Joue à ton rythme, jambe au repos.`}</p></div>
        <img src="${A(MILO.n_rire || 'v3_heureux')}" alt="" draggable="false">
      </div>
      <div class="ggrid">${cards}</div>
      <div class="note" style="margin-top:16px">${ic('info')}<span>Pense à faire une pause toutes les 30 minutes et à bouger ce qui est autorisé par ton équipe soignante.</span></div>`;
  };
  MG.homeCard = function () {
    if (!MG.games.length) return '';
    const names = MG.games.map((g) => g.name.replace(/^Milo /, ''));
    const recent = MG.games.slice().sort((a, b) => String(MG.data(b.id).lastPlayed || '').localeCompare(String(MG.data(a.id).lastPlayed || '')))[0];
    const lines = `${MG.games.length} jeux : ${names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : names[0]}${recent && MG.data(recent.id).lastPlayed && recent.homeLine ? '<br>' + recent.homeLine(MG.data(recent.id)) : ''}`;
    return `<button class="card ghome" data-go="jeux">
      <div class="ghome-art"><img src="${MG.asset('logo_salle.webp')}" alt="" draggable="false"></div>
      <div class="grow"><div class="h-card">La salle de jeux</div><div class="tiny">${lines}</div></div>${ic('chevron-right', 'chev')}</button>`;
  };

  /* ---------- Styles communs ---------- */
  const css = `
  .ghub-hero{display:flex;align-items:center;gap:10px;border-radius:24px;padding:18px 18px 18px 20px;background:linear-gradient(115deg,#3f73f4,#6c4cf1 55%,#b06cf5);color:#fff;box-shadow:0 14px 30px rgba(108,76,241,.3);position:relative;overflow:hidden}
  .ghub-hero:after{content:"";position:absolute;right:-50px;top:-70px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.25),transparent 70%)}
  .ghub-hero h2{font-size:21px;font-weight:900;letter-spacing:-.5px;line-height:1.2;margin:6px 0 6px}
  .ghub-hero p{margin:0;font-size:13.5px;opacity:.92;line-height:1.4}
  .ghub-hero img{width:110px;height:110px;object-fit:contain;flex:none;filter:drop-shadow(0 8px 14px rgba(20,10,80,.3));position:relative;z-index:1}
  .ghub-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;opacity:.9}
  .gi{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
  .ggrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
  .gcard{border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 10px 26px rgba(67,47,135,.12);display:flex;flex-direction:column}
  .gcard-art{position:relative;height:190px;display:grid;place-items:center;overflow:hidden}
  .gcard.crush .gcard-art{background:radial-gradient(circle at 30% 20%,#ffd1ec,transparent 55%),radial-gradient(circle at 80% 80%,#c9b6ff,transparent 55%),linear-gradient(160deg,#ffe3f3,#efe4ff)}
  .gcard.blocks .gcard-art{background:radial-gradient(circle at 70% 20%,#7aa7ff,transparent 55%),linear-gradient(160deg,#4c46c9,#6c4cf1)}
  .gcard-art img{height:176px;width:auto;max-width:92%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(30,10,90,.25));transition:transform .5s cubic-bezier(.34,1.6,.5,1)}
  .gcard:hover .gcard-art img{transform:scale(1.04) rotate(-1deg)}
  .gcard-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1}
  .gcard-desc{margin:0;font-size:13.5px;color:var(--muted);line-height:1.45}
  .gstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .gstats div{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:8px 10px;min-width:0}
  .gstats span{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gstats span .gi{width:12px;height:12px;color:var(--violet)}
  .gstats b{display:block;font-size:17px;font-weight:900;letter-spacing:-.3px;margin-top:2px;font-variant-numeric:tabular-nums}
  .gprog{height:8px;border-radius:8px;background:var(--lav-2);overflow:hidden}.gprog i{display:block;height:100%;background:linear-gradient(90deg,#ff7eb3,#9b5cf6);border-radius:8px}
  .gplay{margin-top:auto}.gplay .gi{width:16px;height:16px;fill:currentColor}
  .ghome{width:100%;border:0;text-align:left;display:flex;align-items:center;gap:12px;margin-top:12px;background:linear-gradient(120deg,#fff,#f6f0ff)}
  .ghome-art{display:flex;flex:none}.ghome-art img{width:64px;height:64px;border-radius:18px;object-fit:cover;box-shadow:0 6px 14px rgba(90,50,200,.28),inset 0 0 0 1px rgba(255,255,255,.2)}
  @container app (max-width:760px){.ggrid{grid-template-columns:minmax(0,1fr)}.ghub-hero h2{font-size:19px}.ghub-hero img{width:92px;height:92px}.gcard-art{height:170px}.gcard-art img{height:158px}}

  /* Écran de jeu */
  .gscreen{position:absolute;inset:0;z-index:65;display:flex;justify-content:center;overflow:hidden;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;opacity:0;transform:scale(1.03);transition:opacity .25s ease,transform .3s cubic-bezier(.22,1,.36,1)}
  .gscreen.in{opacity:1;transform:none}
  .gscreen img{-webkit-user-drag:none;user-select:none;pointer-events:none}
  .gframe{position:relative;width:100%;max-width:480px;height:100%;display:flex;flex-direction:column}
  .gfx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:40}
  .gtop{display:flex;align-items:center;gap:10px;padding:12px 14px 6px;position:relative;z-index:5}
  .gclose{width:42px;height:42px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(20,14,50,.55);color:#fff;flex:none;backdrop-filter:blur(8px)}
  .gclose .gi{width:20px;height:20px;stroke-width:2.6}
  .gbtn{border:0;border-radius:30px;padding:14px 22px;font-weight:900;font-size:16px;color:#fff;background:linear-gradient(140deg,#9d66f7,#6c3ff0 55%,#4b63f2);box-shadow:0 8px 20px rgba(108,66,236,.4),inset 0 2px 0 rgba(255,255,255,.3);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .2s}
  .gbtn:active{transform:scale(.95)}.gbtn .gi{width:18px;height:18px}.gbtn .gi[class*=play]{fill:currentColor}
  .gbtn.pink{background:linear-gradient(140deg,#ff8cc6,#f0479a);box-shadow:0 8px 20px rgba(240,71,154,.4),inset 0 2px 0 rgba(255,255,255,.3)}
  .gbtn.ghost{background:rgba(255,255,255,.18);box-shadow:none;border:1.5px solid rgba(255,255,255,.5)}
  .gbtn.light{background:#fff;color:#6c3ff0;box-shadow:0 6px 14px rgba(60,30,140,.18)}
  .greact{position:absolute;left:50%;top:40%;z-index:45;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;animation:greactIn .5s cubic-bezier(.34,1.7,.5,1) both}
  .greact img{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 10px 20px rgba(30,10,90,.35))}
  .greact.lg img{width:150px;height:150px}.greact.sm img{width:86px;height:86px}
  .greact b{font-size:34px;font-weight:900;letter-spacing:-.5px;color:#fff;-webkit-text-stroke:2px #6a2fd8;paint-order:stroke fill;text-shadow:0 4px 0 #4a1fa8,0 8px 18px rgba(40,10,110,.45);white-space:nowrap;margin-top:-6px}
  .greact.lg b{font-size:40px}.greact.sm b{font-size:26px}
  .greact.out{animation:greactOut .4s ease-in forwards}
  @keyframes greactIn{0%{opacity:0;transform:translate(-50%,-30%) scale(.3)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  @keyframes greactOut{to{opacity:0;transform:translate(-50%,-80%) scale(.9)}}
  .gmodal{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,10,60,.45);backdrop-filter:blur(4px);animation:fade .2s}
  .gpanel{width:min(100%,360px);border-radius:30px;padding:22px 20px 20px;text-align:center;background:linear-gradient(180deg,#fff,#f4efff);box-shadow:0 24px 60px rgba(30,10,90,.4);animation:gpop .5s cubic-bezier(.34,1.6,.5,1)}
  .gpanel h3{font-size:26px;font-weight:900;letter-spacing:-.6px;margin:4px 0 4px;color:#2a1f6b}
  .gpanel p{margin:0 0 6px;color:var(--muted);font-size:14px;line-height:1.45}
  .gpanel .mas{width:120px;height:120px;object-fit:contain;margin:-70px auto 0;display:block;filter:drop-shadow(0 10px 16px rgba(30,10,90,.3))}
  .gpanel .acts{display:flex;flex-direction:column;gap:10px;margin-top:16px}
  .gpanel .big{font-size:40px;font-weight:900;letter-spacing:-1px;color:#6c3ff0;font-variant-numeric:tabular-nums}
  @keyframes gpop{0%{transform:scale(.6);opacity:0}100%{transform:none;opacity:1}}
  @media (prefers-reduced-motion:reduce){.gscreen *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  const st = document.createElement('style'); st.id = 'milo-games-css'; st.textContent = css; document.head.appendChild(st);
})();
