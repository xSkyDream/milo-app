// Migration des sauvegardes : ancienne sauvegarde réelle → v2, idempotence, nouveau joueur
const { chromium, devices } = require('playwright'); const srv = require('./srv')(8784);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8784/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const out = {}, d = MiloGames.data('maze');
    // sauvegarde v1 : mondes 1-2 finis, galaxie (ancien 3) commencée, soleil (ancien 4) 1 niveau
    const lv = {}; for (let l = 0; l < 6; l++) { lv['0-' + l] = { stars: 3 - (l % 2), best: 1000 + l, time: 20 + l, done: 2 }; lv['1-' + l] = { stars: 2, best: 2000 + l, time: 30, done: 1 }; }
    lv['2-0'] = { stars: 3, best: 3000, time: 25, done: 1 }; lv['2-1'] = { stars: 1, best: 3100, time: 40, done: 1 }; lv['3-0'] = { stars: 2, best: 4000, time: 33, done: 1 };
    Object.assign(d, { lv, coins: 1234, owned: { classic: true, neon: true, glacier: true }, skin: 'glacier', last: '2-1', upg: { dur: 2 }, set: { music: 0.3 } });
    const before = JSON.stringify(d); let starsBefore = 0; Object.values(lv).forEach((x) => (starsBefore += x.stars));
    // la carte du hub (appelée avant l'ouverture du jeu) migre déjà
    const g = MiloGames.games ? null : null;
    MiloGames.open('maze'); const D = MiloGames.cur.g._debug, dd = MiloGames.data('maze');
    out.keys = Object.keys(dd.lv).sort(); out.backupN = Object.keys(dd.bak.v1.lv).length; out.v = dd.v; out.last = dd.last;
    let starsAfter = 0; Object.values(dd.lv).forEach((x) => (starsAfter += x.stars)); out.stars = [starsBefore, starsAfter];
    out.keep = { coins: dd.coins, skin: dd.skin, owned: Object.keys(dd.owned), upg: dd.upg, music: dd.set.music };
    out.open = D.WORLDS.map((w, i) => w.id + ':' + (D.worldOpen(i) ? 'ouvert' : D.CONTENT[i].length ? 'verrouillé' : 'bientôt'));
    out.unl = ['ruines:5', 'cosmos:2', 'cosmos:3', 'sables:1', 'sables:2'].map((k) => { const [w, l] = k.split(':'); return k + '=' + D.unlocked(D.WORLDS.findIndex((x) => x.id === w), +l); });
    out.ruines0 = dd.lv['ruines:0'];
    // un ancien appareil réécrit l'ancien format : refusion sans perte
    dd.lv['0-0'] = { stars: 3, best: 9999, time: 12.5, done: 1 }; D.migrate(dd);
    out.refuse = dd.lv['ruines:0']; out.oldLeft = Object.keys(dd.lv).filter((k) => /-/.test(k)); out.backupStill = Object.keys(dd.bak.v1.lv).length;
    out.reward = (D.nextReward() || {}).txt;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // nouveau joueur
  const r2 = await p.evaluate(() => { MiloGames.close(true); const d = MiloGames.data('maze'); Object.keys(d).forEach((k) => delete d[k]); MiloGames.open('maze'); const D = MiloGames.cur.g._debug; return { open: D.WORLDS.filter((w, i) => D.worldOpen(i)).map((w) => w.id), l1: D.unlocked(0, 0), l2: D.unlocked(0, 1), v: MiloGames.data('maze').v }; });
  console.log('nouveau joueur', JSON.stringify(r2));
  console.log('errors', errs); await b.close(); srv.close();
})();
