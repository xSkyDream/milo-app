// Bot UI : passe par les VRAIS boutons (défis, niveau secret, modes de jeu) et vérifie que les modes n'écrivent rien dans les niveaux.
// Usage : node t3.js   (sert public/ sur un port local)
const { chromium, devices } = require('playwright'); const srv = require('./srv')(8791); const O = require('os').tmpdir() + '/'; // captures hors du dépôt
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.stack.split('\n').slice(0, 3).join(' | ')));
  await p.goto('http://localhost:8791/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { const d = MiloGames.data('maze'); Object.keys(d).forEach((k) => delete d[k]); d.seenTuto = true; d.coins = 1000; d.lv = {};
    for (let l = 0; l < 15; l++) d.lv['ruines:' + l] = { stars: 2, best: 900, time: 20, done: 1 }; for (let l = 0; l < 5; l++) d.lv['cyber:' + l] = { stars: 1, best: 500, time: 30, done: 1 }; d.col = { ruines: { key: 1 } }; MiloGames.open('maze'); });
  await p.waitForTimeout(600);
  const H = `const D = MiloGames.cur.g._debug, wait = (ms) => new Promise((r) => setTimeout(r, ms)), data = () => MiloGames.data('maze'), q = (s) => document.querySelector(s), click = async (s) => { const e = q(s); if (!e) throw new Error('bouton absent ' + s); e.click(); await wait(250); };
    const solve = async () => { for (let i = 0; i < 40 && (!D.G() || D.G().state !== 'ready' && D.G().state !== 'play'); i++) await wait(100); const G = D.G(); D.setInv(true); const L = G.L, sol = L.sol; let k = 0; const t0 = performance.now(); while (k < sol.length && performance.now() - t0 < 30000) { const g = D.G(); if (g.state === 'win' || g.state === 'dead') break; if (!g.milo.moving && !g.paused) { D.launch(+sol[k]); k++; } await wait(35); } for (let i = 0; i < 80 && D.G().state !== 'win'; i++) await wait(50); await wait(1500); return D.G().state; };
    const waitModal = async (sel) => { for (let i = 0; i < 60 && !q(sel); i++) await wait(100); return !!q(sel); };`;
  const run = (body) => p.evaluate(new Function(`return (async () => { ${H} ${body} })()`));
  // A) boutons Défi et Niveau secret (correctif)
  console.log('A boutons', JSON.stringify(await run(`const out = {}; for (const li of ['d0', 's', '2']) { D.screen('world', { wi: 0 }); await wait(300); await click('[data-mz="play"][data-w="0"][data-l="' + li + '"]'); await wait(900); out[li] = D.G() ? String(D.G().li) : 'RIEN'; } return out;`)));
  // B) écran des modes
  await run(`D.screen('home'); await wait(300); return 1;`); await p.screenshot({ path: O + 'p8_home.png' });
  console.log('B accueil', JSON.stringify(await run(`return { bouton: !!q('[data-mz="modes"]'), pastille: !!q('.mz-dot') };`)));
  await run(`await click('[data-mz="modes"]'); await wait(300); return 1;`); await p.screenshot({ path: O + 'p8_modes.png', fullPage: false });
  const lvBefore = await run(`return JSON.stringify(data().lv);`);
  // C) contre-la-montre (monde 1) avec une chute
  console.log('C chrono', JSON.stringify(await run(`const c0 = data().coins; await click('[data-mz="mode"][data-m="tt"][data-w="0"]'); await wait(900); const steps = [];
    for (let k = 0; k < 5; k++) { if (k === 1) { await wait(300); D.die('test'); await wait(2200); } const st = await solve(); steps.push(st + '@' + D.G().li); if (k < 4) { await waitModal('[data-mz="runnext"]'); await click('[data-mz="runnext"]'); await wait(900); } }
    await waitModal('.mz-runp'); const R = data().modes.tt.ruines; return { steps, titre: q('.mz-runp h3').textContent, record: R, pen: D.RUN().pen, gains: [...document.querySelectorAll('.mz-runp .mz-gain')].map((g) => g.textContent), pieces: data().coins - c0 };`)));
  await p.screenshot({ path: O + 'p8_tt_end.png' });
  // D) sans faute : un coup au 2e niveau = perdu
  console.log('D sans faute', JSON.stringify(await run(`await click('[data-mz="modes"]'); await click('[data-mz="mode"][data-m="nf"][data-w="0"]'); await wait(900); const r1 = await solve(); await waitModal('[data-mz="runnext"]'); await click('[data-mz="runnext"]'); await wait(900);
    const G = D.G(); const regle = G.rule && G.rule.t; G.state = 'play'; G.milo.invT = 0; D.die('Touché'); await waitModal('.mz-runp'); return { r1, regle, coeurs: G.maxHearts, titre: q('.mz-runp h3').textContent, nf: data().modes.nf.ruines };`)));
  // E) survie : cœurs portés, +1 cœur au 3e niveau, puis mort
  console.log('E survie', JSON.stringify(await run(`await click('[data-mz="modes"]'); const c0 = data().coins; await click('[data-mz="mode"][data-m="sv"]'); await wait(900); const hs = [];
    for (let k = 0; k < 3; k++) { const G = D.G(); hs.push('début ' + G.hearts + '/' + G.maxHearts); if (k === 0) G.hearts = 2; if (k === 1) G.hearts = 1; await solve(); await waitModal('[data-mz="runnext"]'); hs.push('après ' + D.RUN().hearts); await click('[data-mz="runnext"]'); await wait(900); }
    const G = D.G(); hs.push('niveau 4 : ' + G.hearts); G.state = 'play'; D.die('fin'); await waitModal('.mz-runp'); return { hs, titre: q('.mz-runp h3').textContent, sv: data().modes.sv, pieces: data().coins - c0 };`)));
  // F) défi du jour : récompense une seule fois
  console.log('F jour', JSON.stringify(await run(`await click('[data-mz="modes"]'); const c0 = data().coins; await click('[data-mz="mode"][data-m="day"]'); await wait(900); const regle = JSON.stringify(D.G().rule); await solve(); await waitModal('.mz-runp'); const g1 = [...document.querySelectorAll('.mz-runp .mz-gain')].map((g) => g.textContent); const c1 = data().coins;
    await click('[data-mz="runagain"]'); await wait(900); await solve(); await waitModal('.mz-runp'); const g2 = [...document.querySelectorAll('.mz-runp .mz-gain')].map((g) => g.textContent); return { regle, gains1: g1, gains2: g2, day: data().modes.day, gain1: c1 - c0 };`)));
  // G) défi de la semaine : étape 1 puis « étape suivante »
  console.log('G semaine', JSON.stringify(await run(`await click('[data-mz="modes"]'); await click('[data-mz="mode"][data-m="week"][data-k="0"]'); await wait(900); const r = JSON.stringify(D.G().rule); await solve(); await waitModal('.mz-runp'); const suiv = !!q('[data-mz="runweeknext"]'); await click('[data-mz="runweeknext"]'); await wait(900); return { regle: r, suivante: suiv, etape: D.RUN().k, week: data().modes.week };`)));
  // H) exploration : invincible, rien n'est écrit dans les niveaux, le boss est refusé
  console.log('H exploration', JSON.stringify(await run(`D.screen('modes'); await wait(300); await click('[data-mz="mode"][data-m="exp"]'); await wait(400); const ban = !!q('.mz-expban');
    D.screen('world', { wi: 0 }); await wait(300); q('[data-mz="play"][data-w="0"][data-l="14"]') && q('[data-mz="play"][data-w="0"][data-l="14"]').click(); await wait(500); const bossRefuse = !D.G();
    D.screen('world', { wi: 1 }); await wait(300); const ban2 = !!q('.mz-expban'); await click('[data-mz="play"][data-w="1"][data-l="5"]'); await wait(900); const G = D.G(); const h0 = G.hearts; G.state = 'play'; G.milo.invT = 0; D.G().milo.invT = 0; await wait(50);
    const avant = data().coins; await solve(); await waitModal('.mz-runp'); return { ban, ban2, bossRefuse, mode: D.RUN() && D.RUN().mode, lave: G.lava, coeurs: h0 + '→' + D.G().hearts, cyber5: data().lv['cyber:5'] || 'non écrit', piecesAjoutees: data().coins - avant, titre: q('.mz-runp h3').textContent };`)));
  await p.screenshot({ path: O + 'p8_exp_end.png' });
  const lvAfter = await run(`return JSON.stringify(data().lv);`);
  console.log('niveaux intacts après tous les modes :', lvBefore === lvAfter);
  // I) partie normale après les modes : enregistrée comme avant
  console.log('I normal', JSON.stringify(await run(`D.screen('world', { wi: 1 }); await wait(300); if (q('.mz-expban')) await click('[data-mz="expoff"]'); await click('[data-mz="play"][data-w="1"][data-l="5"]'); await wait(900); const run0 = D.RUN(); await solve(); await waitModal('.mz-panel.win'); return { run: run0, cyber5: data().lv['cyber:5'], titre: q('.mz-panel h3').textContent };`)));
  // J) captures HUD en course
  await run(`D.screen('modes'); await wait(300); await click('[data-mz="mode"][data-m="tt"][data-w="0"]'); await wait(1200); return 1;`); await p.screenshot({ path: O + 'p8_tt_hud.png' });
  console.log('errors', errs); await b.close(); srv.close();
})();
