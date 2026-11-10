const { chromium, devices } = require('playwright'); const srv = require('./srv')(8780); const OUT = __dirname;
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8780/', { waitUntil: 'networkidle' });
  await p.evaluate(() => MiloGames.open('maze')); await p.waitForTimeout(1000);
  await p.screenshot({ path: OUT + '/a_home.png' });
  await p.click('[data-mz="map"]'); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/b_map.png' });
  await p.click('[data-mz="openworld"][data-w="0"]'); await p.waitForTimeout(700); await p.screenshot({ path: OUT + '/b2_trans.png' }); await p.waitForTimeout(900); await p.screenshot({ path: OUT + '/b3_world.png' });
  await p.click('[data-mz="play"][data-w="0"][data-l="0"]'); await p.waitForTimeout(900); await p.screenshot({ path: OUT + '/c_start.png' });
  // Parcours automatique de tous les niveaux avec la solution du générateur
  const res = await p.evaluate(async () => {
    const dbg = MiloGames.cur.g._debug, out = [];
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    for (let wi = 0; wi < dbg.CONTENT.length; wi++) for (let li = 0; li < dbg.CONTENT[wi].length; li++) {
      if (dbg.CONTENT[wi][li].boss) continue;
      dbg.start(wi, li); await wait(120);
      const G = dbg.G(); dbg.setInv(true);
      G.doors.forEach((d) => { G.grid[d.y][d.x] = ' '; }); G.doors.length = 0;
      const sol = dbg.CONTENT[wi][li].sol; let k = 0, t0 = performance.now();
      while (k < sol.length && performance.now() - t0 < 30000) {
        const g = dbg.G(); if (!g || g.state === 'win') break;
        if (!g.milo.moving && !g.paused) { dbg.launch(+sol[k]); k++; }
        await wait(40);
      }
      for (let i = 0; i < 40 && dbg.G() && dbg.G().state !== 'win'; i++) await wait(50);
      const g = dbg.G(); out.push(`${wi + 1}-${li + 1}:${g ? g.state : 'none'}:${g ? g.got + '/' + g.coinsTotal : ''}:${g ? g.time.toFixed(1) : ''}`);
      await wait(1300); // panneau de fin
    }
    return out;
  });
  console.log(res.join('  '));
  await p.screenshot({ path: OUT + '/d_end.png' });
  console.log('errors', errs);
  await b.close(); srv.close();
})();
