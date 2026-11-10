// Bot V2 : joue tous les niveaux des mondes enrichis dans le vrai moteur (Playwright)
// - niveaux : solution du générateur (niveau de la clé : chemin qui passe par la clé)
// - boss : itinéraire vers chaque cible ; défis ; niveau secret (chemin par la relique)
// Usage : node t2.js   (sert public/ sur un port local)
const { chromium, devices } = require('playwright'); const srv = require('./srv')(8790);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.stack.split('\n').slice(0, 4).join(' | '))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8790/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const d = MiloGames.data('maze'); Object.keys(d).forEach((k) => delete d[k]); MiloGames.open('maze'); });
  await p.waitForTimeout(600);
  const res = await p.evaluate(async () => {
    const D = MiloGames.cur.g._debug, out = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const play = async (wi, li, dirs, opts = {}) => {
      D.start(wi, li); await wait(150); const G = D.G(); D.setInv(true);
      G.doors.forEach((d) => { G.grid[d.y][d.x] = ' '; }); G.doors.length = 0;
      const lockedAtStart = !G.exitOpen; if (opts.allcoins) { G.got = G.coinsTotal; }
      let k = 0; const t0 = performance.now();
      while (k < dirs.length && performance.now() - t0 < 40000) { const g = D.G(); if (!g || g.state === 'win' || g.state === 'dead') break; if (!g.milo.moving && !g.paused) { D.launch(+dirs[k]); k++; } await wait(35); }
      for (let i = 0; i < 80 && D.G() && D.G().state !== 'win'; i++) await wait(50);
      const g = D.G(); const r = { lv: `${D.WORLDS[wi].id}:${li}`, state: g.state, key: g.key, relic: g.relic, cr: `${g.crystals}/${g.crTotal}`, chests: g.chests, lockedAtStart, boss: g.boss ? g.boss.hp : null, t: +g.time.toFixed(1) };
      await wait(1400); return r;
    };
    for (const wi of [0, 1]) {
      const L = D.CONTENT[wi];
      for (let li = 0; li < L.length; li++) {
        const lv = L[li];
        if (lv.boss) {
          D.start(wi, li); await wait(200); D.setInv(true); const G = D.G(); const hp0 = G.boss.hp;
          for (const seg of lv.boss.route) { for (const c of seg) { for (let i = 0; i < 60 && D.G().milo.moving; i++) await wait(30); D.launch(+c); await wait(60); } for (let i = 0; i < 60 && D.G().milo.moving; i++) await wait(30); }
          for (let i = 0; i < 80 && D.G().state !== 'win'; i++) await wait(50);
          const g = D.G(); out.push({ lv: `${D.WORLDS[wi].id}:${li} BOSS`, state: g.state, hp: `${hp0}→${g.boss.hp}`, attacks: g.boss.n, t: +g.time.toFixed(1) }); await wait(1500);
        } else out.push(await play(wi, li, lv.ksol || lv.sol));
      }
      for (let k = 0; k < 3; k++) { const lv = D.levelAt(wi, 'd' + k); out.push(await play(wi, 'd' + k, lv.sol, { allcoins: lv.rule.t === 'allcoins' })); }
      out.push(await play(wi, 's', D.levelAt(wi, 's').qsol, { allcoins: false }));
    }
    const d = MiloGames.data('maze');
    return { out, col: d.col, coins: d.coins, unl: { ruinesS: D.unlocked(0, 's'), cyberS: D.unlocked(1, 's'), ruinesD3: D.unlocked(0, 'd2'), cyberOpen: D.worldOpen(1), sablesOpen: D.worldOpen(3) }, pct: [D.worldPct(0), D.worldPct(1)] };
  });
  res.out.forEach((r) => console.log(JSON.stringify(r)));
  console.log('collection', JSON.stringify(res.col)); console.log('pièces', res.coins, 'déblocages', JSON.stringify(res.unl), 'complétion', res.pct);
  console.log('errors', errs);
  await b.close(); srv.close();
})();
