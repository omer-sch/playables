// usage: node play.js <html> <W> <H> <outPrefix> [shots=1]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const [,, file, W, H, out, shots='1'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: undefined });
  const mobile = +W < 768;
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: false });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.addInitScript(() => { window.__stores = []; window.open = (u) => { window.__stores.push([Date.now(), u]); return null; }; });
  await p.goto('file://' + file);
  await p.waitForFunction(() => window.__qa && window.__qa.state === 'idle', null, { timeout: 20000 });
  const st = () => p.evaluate(() => window.__qa.state);
  const shot = async (n) => { if (shots === '1') await p.screenshot({ path: `${out}_${n}.png` }); };
  const center = async (sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find(x => { const r = x.getBoundingClientRect(); const cs = getComputedStyle(x); return r.width > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; }); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const checks = [];
  const inView = async (label, sel) => { const r = await p.evaluate((s) => { const out = []; document.querySelectorAll(s).forEach(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width < 2 || cs.display === 'none' || cs.visibility === 'hidden') return; out.push([Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]); }); return out; }, sel);
    const bad = r.filter(x => x[0] < -1 || x[1] < -1 || x[2] > +W + 1 || x[3] > +H + 1); if (!r.length) checks.push(`${label}: MISSING`); else if (bad.length) checks.push(`${label}: OUT ${JSON.stringify(bad[0])}`); };
  await p.waitForTimeout(2600); await shot('1_hook');
  await inView('room', '.scene, .layer-stage');
  let picks = 0, guard = 0, shotCards = false;
  const firstStore = await p.evaluate(() => window.__stores.length);
  while (guard++ < 60) {
    const s = await st();
    if (s === 'endcard' || s === 'earlyCut' || s === 'rating') break;
    if (s === 'idle') {
      const c = await center('.hot-wrap:not(.hot-done) .hot');
      if (!c) { await p.waitForTimeout(300); continue; }
      await p.mouse.click(c[0], c[1]);
      await p.waitForTimeout(700);
    } else if (s === 'catalog') {
      if (!shotCards && picks === 1) { await p.waitForTimeout(1200); await shot('2_cards'); await inView('cards', '.tray-grid > *'); shotCards = true; }
      const cards = await p.evaluate(() => [...document.querySelectorAll('.tray-grid > *')].map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
      const c = cards[(picks * 3 + 1) % cards.length];
      await p.mouse.click(c[0], c[1]); picks++;
      await p.waitForTimeout(1300);
    } else await p.waitForTimeout(250);
  }
  const storesDuringPlay = (await p.evaluate(() => window.__stores.length)) - firstStore;
  await p.waitForTimeout(6000);
  const q = await p.evaluate(() => ({ state: window.__qa.state, early: window.__qa.earlyNodes || null, rating: !!window.__qa.ratingShown, errors: window.__qa.errors }));
  await shot('3_end');
  const scroll = await p.evaluate(() => [Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)]);
  if (scroll[0] > +W + 1 || scroll[1] > +H + 1) checks.push('PAGE SCROLL ' + scroll);
  if (q.rating) { for (const [l, s] of [['logo', '.re-logo'], ['card', '.re-card'], ['pill', '.re-pill'], ['title', '.re-title'], ['download', '.re-cta .cta-image'], ['hand', '.rate-end .ec-hand']]) await inView(l, s); }
  else { for (const [l, s] of [['ecTitle', '#finalScreen .game-title'], ['ecDownload', '#finalScreen .cta-image'], ['hand', '#finalScreen .ec-hand']]) await inView(l, s); }
  // overlaps on rating screen
  const ov = await p.evaluate(() => { const R = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); }; const pairs = [['.re-title', '.re-pill'], ['.re-title', '.re-card'], ['.re-cta .cta-image', '.re-title'], ['.re-logo', '.re-card'], ['#finalScreen .game-title', '#finalScreen .cta-image']]; const o = []; for (const [a, b] of pairs) { const x = R(a), y = R(b); if (!x || !y || !x.width || !y.width) continue; const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top); if (w > 2 && h > 2) o.push(a + ' x ' + b); } return o; });
  ov.forEach(x => checks.push('OVERLAP ' + x));
  const title = await p.evaluate(() => { const t = document.querySelector('.re-title') || document.querySelector('#finalScreen .game-title'); return t && t.textContent; });
  // tap to store
  const cta = await center(q.rating ? '.re-cta .cta-image' : '#finalScreen .cta-image');
  if (cta) { await p.mouse.click(cta[0], cta[1]); await p.waitForTimeout(400); }
  const stores = await p.evaluate(() => window.__stores.length);
  console.log(JSON.stringify({ file: file.split('/').pop(), W, H, picks, ...q, title, storesDuringPlay, storeOnTap: stores - firstStore - storesDuringPlay, checks, errs }));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ file, W, H, fatal: String(e).slice(0, 300) })); process.exit(0); });
