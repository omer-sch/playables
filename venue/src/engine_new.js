;
/* Venue TrendEvent playable engine — CFG-driven, DOM-based, single-file build.
   Grammar mirrors client reference Event_000167: ghost room -> "+" hotspots ->
   3x3 catalog tray -> pick & place -> 5-star payoff -> client end card.
   Requires globals from network head wrapper: GA_ENVIRONMENT, refreshScreenSize,
   createResizeListener, createVisibleListeners, isAdVisible, onReady, openStore,
   addSoundListener. CFG + ASSETS injected by assembler. */
(function () {
  'use strict';
  var QA = (window.__qa = {
    state: 'boot',
    beats: { booted: 0, roomShown: 0, hotspotsShown: 0, catalogOpens: 0, picks: 0, payoff: 0, endcard: 0, ctaFired: 0 },
    lastCta: null, muted: false, errors: []
  });
  window.addEventListener('error', function (e) { QA.errors.push(String(e.message).slice(0, 120)); });

  var A = window.PLAYABLE_ASSETS, C = window.PLAYABLE_CFG;
  var root, scene, roomImg, veil, hotLayer, itemLayer, fxLayer, tray, trayGrid, hand, topBar, endcard, glowEl;
  var extBg = null, progressEl = null, heroEl = null, instrEl = null;
  var picksDone = 0, totalSlots = C.slots.length, activeSlot = null, busy = false, started = false;
  var sideTray = false, sceneSide = 320, sceneTopPx = 0, isLand = false, trayInRoom = false;
  var audio = {}, muted = false, musicStarted = false, idleTimer = null;

  function el(tag, cls, parent) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  /* ---------- audio ---------- */
  function initAudio() {
    ['music', 'open', 'reveal', 'sparkle', 'tick', 'vo'].forEach(function (k) {
      if (!A.audio[k]) return;
      var a = new Audio(A.audio[k]);
      a.preload = 'auto';
      if (k === 'music') { a.loop = true; a.volume = 0.45; }
      else if (k === 'tick') { a.volume = 0.35; }
      else if (k === 'vo') { a.volume = 1; }
      else { a.volume = 0.8; }
      audio[k] = a;
    });
  }
  function play(k) {
    if (muted || !audio[k]) return;
    try {
      if (k === 'music') { if (!musicStarted) { audio.music.play().catch(function(){}); musicStarted = true; } }
      else { audio[k].currentTime = 0; audio[k].play().catch(function(){}); }
    } catch (e) {}
  }
  function setMuted(m) {
    muted = m; QA.muted = m;
    Object.keys(audio).forEach(function (k) { audio[k].muted = m; });
    if (m && audio.music) audio.music.pause();
    else if (!m && musicStarted && audio.music) audio.music.play().catch(function(){});
  }

  /* ---------- layout ---------- */
  function layout() {
    var s = (typeof refreshScreenSize === 'function') ? refreshScreenSize() : { width: innerWidth, height: innerHeight };
    var w = s.width || innerWidth, h = s.height || innerHeight;
    root.style.width = w + 'px'; root.style.height = h + 'px';
    root.style.setProperty('--sw', w + 'px');
    root.style.setProperty('--fw', w + 'px'); root.style.setProperty('--fh', h + 'px');
    document.documentElement.style.setProperty('--fw', w + 'px'); document.documentElement.style.setProperty('--fh', h + 'px');
    var side, sceneLeft, sceneTop;
    if (C.mode === 'layers') {
      /* 2026-09-10 (Omer, from the client's own build): the square room FITS the screen (full width on a phone,
         full height on a desktop), the blurred room fills the rest, cards overlay the bottom of the room. */
      side = Math.min(w, h); if (C.sideTray && w > h * 1.5 && (w - side) / 2 < 190) side = Math.max(Math.round(h * 0.78), Math.min(side, w - 380)); sceneLeft = Math.round((w - side) / 2); sceneTop = Math.round((h - side) / 2);
    } else {
      side = Math.min(w, Math.round(h * 0.66));
      if (w > h) side = h;
      sceneLeft = Math.round((w - side) / 2);
      sceneTop = Math.max(0, Math.round(h * 0.42 - side / 2));
    }
    sceneSide = side; sceneTopPx = sceneTop; isLand = w > h; root.style.setProperty('--side', side + 'px');
    if (heroEl && C.heroInBand) {
      if (!isLand && sceneTop >= 115) { var lb = 50 + (window.__mtg ? 8 : 0), avail = sceneTop - lb - 8 - (window.__reserveTopPill ? 46 : 0), fs = Math.round(Math.min(side * (C.heroScale || 0.105), avail / 3.95)); heroEl.classList.add('hero-band'); if (C.heroStay && instrEl) instrEl.style.display = 'none'; heroEl.style.fontSize = fs + 'px'; heroEl.style.top = Math.round(lb + (avail - fs * 3.9) / 2) + 'px'; heroEl.style.height = 'auto'; }
      else if (isLand && sceneLeft >= 160) { heroEl.classList.add('hero-band'); if (C.heroStay && instrEl) instrEl.style.display = 'none'; var longest = Math.max.apply(null, (C.copy.hero || ['Design']).map(function (t) { return t.length; })); var fsl = Math.round(Math.max(16, Math.min((sceneLeft - 52) / (longest * 0.54), h * 0.075, 34))); heroEl.style.top = Math.round(h / 2 - fsl * 2.6) + 'px'; heroEl.style.height = 'auto'; heroEl.style.left = '12px'; heroEl.style.right = 'auto'; heroEl.style.width = Math.round(sceneLeft - 24) + 'px'; heroEl.style.maxWidth = 'none'; heroEl.style.fontSize = fsl + 'px'; }
    }
    scene.style.width = side + 'px'; scene.style.height = side + 'px';
    scene.style.left = sceneLeft + 'px';
    scene.style.top = sceneTop + 'px';
    /* full-bleed sharp room extension, pixel-aligned to the scene square (no blur) */
    if (extBg && C.ext) {
      var es = side / C.ext.s;
      extBg.style.width = Math.round(C.ext.w * es) + 'px';
      extBg.style.height = Math.round(C.ext.h * es) + 'px';
      extBg.style.left = sceneLeft + 'px';
      extBg.style.top = Math.round(sceneTop - C.ext.y0 * es) + 'px';
    }
    root.className = (w > h ? 'pl-root land' : 'pl-root') + (C.mode === 'layers' ? ' layers' : '') + (tray && tray.classList.contains('tray-open') ? ' choosing' : '') + (C.titleBar === false ? ' no-title' : '') + (hooking ? ' hooking' : '') + (C.calm ? ' calm' : '') + (sideTray ? ' side-tray' : '');
    if (C.mode === 'layers') {
      /* 2026-09-10 (Omer): cards are a fraction of the ROOM, not the window — the client's build has ~14%-of-room
         cards, wide gaps, as many per row as fit, sitting low so the object being changed stays visible. */
      var land = w > h, bandBelow = h - sceneTop - side;
      var card = Math.round(land ? Math.max(64, side * 0.125) : Math.max(58, side * 0.17));
      var gap = Math.round(Math.max(8, side * (land ? 0.04 : 0.025)));
      /* portrait tablets: the band under the centred room is too short for two card rows -> use the desktop
         in-room grid (12.5% cards, 4% gaps) instead of spilling over the room edge */
      /* 9:16 phones: the band is a little short, the tray may overlap the lower room edge (client grammar);
         tablets: two rows would cover whole objects -> in-room desktop grid instead */
      trayInRoom = land || (2 * card + gap + 56 - bandBelow) > card;
      if (trayInRoom && !land) { card = Math.round(Math.max(64, side * 0.125)); gap = Math.round(Math.max(8, side * 0.04)); }
      /* desktop: the grid lives INSIDE the room like the client's build (12.5% cards, 4% gaps -> 6+3) */
      sideTray = !!(C.sideTray && land && sceneLeft >= 150);
      if (sideTray) { card = Math.floor(Math.min(w >= 1000 ? Math.max(64, Math.min(96, h * 0.09)) : 84, (sceneLeft - 32) / 3)); gap = 6; }
      root.classList.toggle('side-tray', sideTray);
      var trayMax = sideTray ? 3 * card + 2 * gap : (trayInRoom ? side : w - 16);
      /* 2026-09-15 (client): rows must be balanced — never 6 + 3. Cap the grid width so 9 options split 5 + 4 (or 3 x 3). */
      var nOpt = 0; C.slots.forEach(function (sl) { nOpt = Math.max(nOpt, (sl.options || []).length); });
      var fit = Math.max(1, Math.floor((trayMax + gap) / (card + gap)));
      if (nOpt > fit) { var rows = Math.ceil(nOpt / fit), per = Math.ceil(nOpt / rows); trayMax = per * card + (per - 1) * gap; }
      /* desktop: tray hugs the lower edge of the room; phone: tray drops into the blurred band under the room */
      var trayBottom = trayInRoom ? Math.max(0, Math.round(bandBelow + side * 0.03)) : 0;
      root.style.setProperty('--band-w', sceneLeft + 'px');
      root.style.setProperty('--card', card + 'px');
      root.style.setProperty('--gap', gap + 'px');
      root.style.setProperty('--tray-max', trayMax + 'px');
      root.style.setProperty('--tray-bottom', trayBottom + 'px');
      /* 2026-11-04 (client: present like the earlier Venue playables): landscape/desktop = ONE row low in the room
         (may run past the room edge on small screens); portrait = balanced grid right under the room, or inside
         the room bottom on tablets. */
      if (!sideTray) {
        var NN = nOpt || 9, bst = null;
        if (land) {
          var big = side >= 700, rowMax = big ? side * 0.96 : Math.min(w - 24, side + 230), capL = side * (big ? 0.105 : 0.155), gr = NN <= 6 ? 0.4 : 0.15;
          var cL = Math.min(capL, rowMax / (NN + (NN - 1) * gr));
          bst = { c: Math.floor(cL), g: Math.round(cL * gr), per: NN, rows: 1 };
          trayBottom = Math.max(0, Math.round(bandBelow + side * 0.03)); trayInRoom = true;
        } else {
          var bandP = h - sceneTop - side, budget = bandP - 24 + (bandP < side * 0.25 ? side * 0.32 : side * 0.03);
          for (var per = 3; per <= 5; per++) {
            var rws = Math.ceil(NN / per); if (NN - per * (rws - 1) < per - 1) continue;
            var cw = (w - 20) / (per + (per - 1) * 0.14), chh = budget / (rws + (rws - 1) * 0.14), cc = Math.min(cw, chh, side * 0.235);
            if (!bst || cc > bst.c) bst = { c: Math.floor(cc), g: Math.round(cc * 0.14), per: per, rows: rws };
          }
          var gh = bst.rows * bst.c + (bst.rows - 1) * bst.g, gTop = Math.min(sceneTop + side + 12, h - 12 - gh);
          trayBottom = Math.max(0, Math.round(h - gTop - gh - 12)); trayInRoom = gTop < sceneTop + side;
        }
        root.style.setProperty('--card', bst.c + 'px'); root.style.setProperty('--gap', bst.g + 'px');
        root.style.setProperty('--tray-max', (bst.per * bst.c + (bst.per - 1) * bst.g) + 'px');
        root.style.setProperty('--tray-bottom', trayBottom + 'px');
      }
    } else {
      root.style.setProperty('--card', Math.round(Math.max(76, Math.min(150, Math.min(w, 520) * 0.245))) + 'px');
    }
    if (C.mode === 'layers') {
      var minX = (-sceneLeft + 26) / side * 100, maxX = (w - sceneLeft - 26) / side * 100;
      C.slots.forEach(function (sl) { if (sl._hot) sl._hot.style.left = Math.max(minX, Math.min(maxX, sl.hot[0])) + '%'; });
    }
    C.slots.forEach(function (s) { if (s._img) applySize(s, s._img); });
  }

  /* ---------- hotspots ---------- */
  function buildHotspots() {
    C.slots.forEach(function (slot, i) {
      var wrap = el('div', 'hot-wrap', hotLayer);
      wrap.style.left = slot.hot[0] + '%';
      wrap.style.top = slot.hot[1] + '%';
      var b = el('div', 'hot', wrap);
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>';
      slot._hot = wrap;
      if (slot.after || C.slots.some(function (o) { return o.mirror === slot.id; })) wrap.classList.add('hot-hidden');
      wrap.addEventListener('pointerdown', function (e) { e.preventDefault(); onHotspot(slot); }, { passive: false });
    });
    QA.beats.hotspotsShown = Date.now();
    root.addEventListener('pointerdown', function (e) {
      if (QA.state === 'catalog' && !(e.target.closest && e.target.closest('.tray,.hot-wrap'))) { tray.classList.remove('tray-wiggle'); void tray.offsetWidth; tray.classList.add('tray-wiggle'); pointHandAtCard(); return; }
      if (QA.state !== 'idle' || busy || !started || scene.contains(e.target) || (e.target.closest && e.target.closest('.tray,.soft-cta,.brand-logo'))) return;
      var nx = C.slots.filter(function (z) { return !z.done && !(z._hot && z._hot.classList.contains('hot-hidden')); })[0];
      if (nx) { nx._hot.classList.remove('hot-nudge'); void nx._hot.offsetWidth; nx._hot.classList.add('hot-nudge'); showChipFor(nx); pointHandAtMarker(nx); }
    });
    scene.addEventListener('pointerdown', function (e) {
      if (QA.state !== 'idle' || busy || (e.target && e.target.closest && e.target.closest('.hot-wrap'))) return;
      var r = scene.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      var best = null, bd = 1e9;
      C.slots.forEach(function (sl) { if (sl.done || (sl._hot && sl._hot.classList.contains('hot-hidden'))) return; var d = Math.hypot(sl.hot[0] - x, sl.hot[1] - y); if (d < bd) { bd = d; best = sl; } });
      if (best && bd <= 12) { e.preventDefault(); onHotspot(best); return; }
      var next = C.slots.filter(function (z) { return !z.done && !(z._hot && z._hot.classList.contains('hot-hidden')); })[0];
      if (!next) return;
      QA.beats.missTaps = (QA.beats.missTaps || 0) + 1;
      next._hot.classList.remove('hot-nudge'); void next._hot.offsetWidth; next._hot.classList.add('hot-nudge');
      showChipFor(next); pointHandAtMarker(next);
    });
  }

  /* ---------- catalog tray ---------- */
  var cozyPicked = false, guidePill = null, trayOpenedAt = 0, trayOpenedPerf = 0, trayClosedAt = 0, pendingSlot = null, lastPickedSlot = null, nodesDone = 0, midFired = {};
  function onHotspot(slot, auto) {
    if (busy) { if (!auto) pendingSlot = slot; return; }
    if (slot.done && auto) return;            /* the guide never reopens a finished object; a person may */
    if (!auto) startMusicOnce();
    hideHand();
    if (activeSlot && activeSlot !== slot) activeSlot._hot.classList.remove('hot-active');
    activeSlot = slot; QA.activeSlot = slot.id;
    slot._hot.classList.add('hot-active');
    trayGrid.innerHTML = '';
    var opts = slot.options.slice(), matchImg = null;
    if (slot.twinOf) { var tw = slotById(slot.twinOf); if (tw && tw._picked) { matchImg = tw._picked.replace(tw.id + '_', slot.id + '_'); opts.sort(function (a, b) { return (b.img === matchImg) - (a.img === matchImg); }); } }
    opts.forEach(function (opt, j) {
      var card = el('div', 'card' + (opt.img === matchImg ? ' card-match' : ''), trayGrid);
      if (opt.img === matchImg && C.matchWord) { var rb = el('div', 'card-ribbon', card); rb.textContent = C.matchWord || 'Match'; }
      else if (slot.tag !== undefined && j === slot.tag && C.tagWord) { var tg = el('div', 'card-ribbon card-tag', card); tg.textContent = C.tagWord; card.classList.add('card-tagged'); }
      var anim = el('div', 'card-anim', card);
      if (opt.color && !opt.thumb) {
        var sw = el('div', 'swatch', anim);
        sw.style.background = opt.color;
      } else {
        var im = el('img', 'card-img', anim);
        im.src = A.thumbs[opt.thumb] || A.items[opt.img];
        im.draggable = false;
      }
      card.addEventListener('pointerdown', function (e) { e.preventDefault(); if (e.timeStamp - trayOpenedPerf < 100) return; onPick(slot, opt, card); }, { passive: false });
    });
    if (C.hand) { clearTimeout(idleTimer); idleTimer = setTimeout(function () { if (QA.state === 'catalog') pointHandAtCard(); }, 6500); }
    /* 2026-09-10 critic: never park the cards on the object being changed — on desktop, a slot in the lower third
       of the room gets the tray under the headline instead (the room's bottom stays visible). */
    if (false && C.mode === 'layers' && trayInRoom && !sideTray && (slot.tray === 'high' || (slot.hot[1] > 62 && slot.tray !== 'low'))) { tray.classList.add('tray-high'); tray.style.top = Math.round(sceneTopPx + sceneSide * 0.13) + 'px'; }
    else { tray.classList.remove('tray-high'); tray.style.top = ''; }
    tray.classList.add('tray-open'); root.classList.add('choosing'); if (guidePill && guidePill !== 'done') guidePill.classList.remove('on'); setTimeout(clampRibbons, 380); trayOpenedAt = Date.now(); trayOpenedPerf = performance.now(); if (softEl) softEl.classList.add('off');
    if (instrEl) { instrEl.classList.add('instr-out'); setTimeout(function () { if (instrEl && instrEl.parentNode) instrEl.parentNode.removeChild(instrEl); instrEl = null; }, 700); }
    if (!auto) play('open');
    QA.beats.catalogOpens++;
    QA.state = 'catalog';
    if (QA.beats.catalogOpens <= (C.cardHandOpens || 99)) pointHandAtCard(); else if (C.chipApproved) pointHandAtMarker(slot); else hideHandOnly();
    if (C.chipApproved) [420, 800, 1200].forEach(function (dl) { setTimeout(function () { if (QA.state !== 'catalog') return; var b = trayGrid.getBoundingClientRect(), pad = 6; var over = function (a) { return a.right > b.left - pad && a.left < b.right + pad && a.bottom > b.top - pad && a.top < b.bottom + pad; }; if (guideChip) guideChip.style.visibility = (over(guideChip.getBoundingClientRect()) || (isLand && sceneSide < 480)) ? 'hidden' : ''; if (slot._hot && over(slot._hot.getBoundingClientRect())) hideHandOnly(); }, dl); }); showChipFor(slot);
  }
  function closeTray() {
    trayClosedAt = Date.now(); if (hand) hand.classList.remove('hand-on');
    if (softEl) { softEl.classList.add('off'); setTimeout(function () { if (softEl && Date.now() - trayClosedAt >= 880 && QA.state !== 'catalog' && !submitted) softEl.classList.remove('off'); }, 900); }
    tray.classList.remove('tray-open'); root.classList.remove('choosing'); if (guidePill && guidePill !== 'done' && nodesDone < 2) setTimeout(function () { if (guidePill && guidePill !== 'done' && !tray.classList.contains('tray-open')) guidePill.classList.add('on'); }, 500);
    if (activeSlot) activeSlot._hot.classList.remove('hot-active');
  }

  /* ---------- environment repaint (client PaintMatCol grammar) ---------- */
  function placePaint(slot, opt, animate) {
    if (!slot._paintEl) {
      var ov = el('div', 'paint-overlay', itemLayer);
      if (slot.mask) {
        ov.style.webkitMaskImage = slot.mask.join(', ');
        ov.style.maskImage = slot.mask.join(', ');
        ov.style.webkitMaskComposite = 'source-in';
        ov.style.maskComposite = 'intersect';
      } else if (slot.region) {
        ov.style.clipPath = 'polygon(' + slot.region.map(function (p) { return p[0] + '% ' + p[1] + '%'; }).join(',') + ')';
        ov.style.webkitClipPath = ov.style.clipPath;
      }
      ov.style.zIndex = slot.z || 2;
      slot._paintEl = ov;
    }
    slot._paintEl.style.backgroundColor = opt.color;
    slot._paintEl.style.opacity = opt.op != null ? opt.op : 0.75;
    if (animate) burst(slot.hot[0], slot.hot[1], 7);
  }

  /* ---------- client layer swap (2026-09-09): every pixel is the client's render ----------
     Each slot owns one full-frame layer (cropped to its alpha bbox). It starts as the client's
     Blank ("undesigned") render and is swapped for the picked Object(+Shadow) render. Nothing is
     scaled, moved, cut or generated: the layer sits exactly where the client rendered it. */
  function layerGeom(key) {
    var b = A.boxes[key], S = C.frameSize || 2048;
    return { left: (b[0] / S * 100) + '%', top: (b[1] / S * 100) + '%',
             width: ((b[2] - b[0]) / S * 100) + '%', height: ((b[3] - b[1]) / S * 100) + '%' };
  }
  function makeLayer(key, src, z) {
    var im = el('img', 'client-layer', itemLayer);
    var g = layerGeom(key);
    im.style.left = g.left; im.style.top = g.top; im.style.width = g.width; im.style.height = g.height;
    im.style.zIndex = z;
    im.setAttribute('data-key', key);
    im.src = src; im.draggable = false;
    return im;
  }
  function swapLayers(slot, nextEls, animate) {
    var prevEls = slot._layers || [];
    slot._layers = nextEls;
    var drop = function () { prevEls.forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); }); };
    if (animate) {
      nextEls.forEach(function (n) {
        /* small objects settle with a soft pop (cozy-cute), large surfaces (walls, floors, towel) dissolve */
        var b = A.boxes[n.getAttribute('data-key')], S = C.frameSize || 2048;
        var big = b && ((b[2] - b[0]) * (b[3] - b[1])) > 0.32 * S * S;
        n.classList.add(big ? 'layer-in' : 'layer-pop');
      });
      prevEls.forEach(function (p) { p.classList.add('layer-out'); });
      setTimeout(drop, 520);
      burst(slot.hot[0], slot.hot[1], 7);
    } else drop();
  }
  function placeLayer(slot, opt, animate) {
    var z = slot.z || 10, els = [];
    if (opt.sh && A.shadows[opt.sh]) els.push(makeLayer(opt.sh, A.shadows[opt.sh], z));   /* client shadow map under its object */
    els.push(makeLayer(opt.img, A.items[opt.img], z));
    swapLayers(slot, els, animate);
  }
  function placeBlanks() {
    C.slots.forEach(function (slot) {
      if (!slot.layer || !slot.blank) return;
      var z = slot.z || 10, els = [];
      if (slot.blankSh && A.shadows[slot.blankSh]) els.push(makeLayer(slot.blankSh, A.shadows[slot.blankSh], z));
      els.push(makeLayer(slot.blank, A.blanks[slot.blank], z));
      slot._layers = els;
    });
  }

  /* ---------- placement (five rules) ---------- */
  function placeItem(slot, opt, animate) {
    if (slot.layer) return placeLayer(slot, opt, animate);
    if (slot.type === 'paint') return placePaint(slot, opt, animate);
    if (slot._itemWrap) itemLayer.removeChild(slot._itemWrap);
    slot._hs = opt.hs || 1;
    slot._ow = opt.w; slot._oh = opt.h;
    var anchor = opt.anchor || slot.anchor;
    var wrap = el('div', 'item-wrap' + (slot.hang ? ' hang' : ''), itemLayer);
    wrap.style.left = anchor[0] + '%';
    wrap.style.top = anchor[1] + '%';
    wrap.style.zIndex = slot.z || 10;
    var inner = el('div', 'item-inner', wrap);
    if (!slot.hang && !slot.flat && !slot.patch) {
      var sh = el('div', 'contact-shadow', inner);
      sh.style.width = Math.round((slot.shadowW || 0.92) * 100) + '%';
      if (slot.shadowOp) sh.style.opacity = slot.shadowOp;
      if (slot.shadowH) sh.style.height = slot.shadowH + '%';
    }
    var img = el('img', 'item-img', inner);
    img.src = A.items[opt.img];
    img.draggable = false;
    applySize(slot, img);
    if (slot.grade) img.style.filter = slot.grade;
    slot._itemWrap = wrap; slot._img = img;
    if (animate) {
      inner.classList.add(slot.patch ? 'pop-patch' : (slot.hang ? 'pop-hang' : 'pop-floor'));
      var hy = slot.hot ? slot.hot[1] : anchor[1] - 8;
      burst(slot.patch ? slot.hot[0] : anchor[0], slot.patch ? hy : (anchor[1] - (slot.hang ? 0 : (slot.flat ? 16 : 4))), 7);
    }
  }

  function applySize(slot, img) {
    var m = slot._hs || 1;
    var h = slot._oh || slot.h, w = slot._ow || slot.w;
    if (h) { img.style.height = Math.round(sceneSide * h * m / 100) + 'px'; img.style.width = 'auto'; }
    else { img.style.width = Math.round(sceneSide * w * m / 100) + 'px'; img.style.height = 'auto'; }
  }

  function onPick(slot, opt, card) {
    if (busy) return;
    var repick = !!slot.done;
    busy = true;
    hideHand();
    var prev = trayGrid.querySelector('.card-sel');
    if (prev) prev.classList.remove('card-sel');
    card.classList.add('card-sel');
    /* layered response: select state + tick now, item lands + sound + sparkles at ~95ms,
       room color step with it, tray close as the trailing beat */
    play('tick');
    setTimeout(function () {
      play('reveal');
      placeItem(slot, opt, true); slot._picked = opt.img; lastPickedSlot = slot; if (card.classList.contains('card-tagged')) { slot._cozy = true; cozyPicked = true; } if (card.classList.contains('card-tagged')) burst(slot.hot[0], slot.hot[1], 14, 200); if (card.querySelector('.card-ribbon:not(.card-tag)')) { burst(slot.hot[0], slot.hot[1], 18, 240); if (C.pairToast && !root.querySelector('.mid-beat')) setTimeout(function () { midBeat({ text: C.pairToast }); }, 350); var tw0 = slotById(slot.twinOf); if (tw0 && tw0.hot) burst(tw0.hot[0], tw0.hot[1], 12, 200); } if (!repick) { nodesDone++; if (C.progressDots) updateDots(); guideStep(); }
      if (slot.mirror) { var tw = slotById(slot.mirror); if (tw) { var mi = opt.img.replace(slot.id + '_', tw.id + '_'), mo = tw.options.filter(function (o) { return o.img === mi; })[0];
        if (mo) { setTimeout(function () { placeItem(tw, mo, true); }, 140); tw._picked = mo.img; if (!tw.done) { tw.done = true; picksDone++; } } } }
      if (!repick) { slot.done = true; picksDone++; slot._hot.classList.add('hot-done'); }
      if (picksDone === 3 && C.logoCta === true) { var blc = root.querySelector('.brand-logo'); if (blc && !blc._cta) { blc._cta = 1; blc.style.pointerEvents = 'auto'; blc.style.cursor = 'pointer'; blc.addEventListener('pointerdown', function (e) { if (submitted) return; e.preventDefault(); e.stopPropagation(); QA.beats.logoCta = (QA.beats.logoCta || 0) + 1; fireCta(); }, { passive: false }); } }
      QA.beats.picks = picksDone; QA.beats.repicks = (QA.beats.repicks || 0) + (repick ? 1 : 0);
      C.slots.forEach(function (o) { if (o.after === slot.id && o._hot) o._hot.classList.remove('hot-hidden'); });
      if (progressEl) {
        var pslot = progressEl.children[picksDone - 1];
        if (pslot) pslot.classList.add('p-on');
      }
      if (!C.noVeil) {
        veil.style.opacity = Math.max(0, 1 - picksDone / totalSlots) * 0.30;
        roomImg.style.filter = 'saturate(' + (0.62 + 0.38 * picksDone / totalSlots) + ') brightness(' + (1.03 - 0.03 * picksDone / totalSlots) + ')';
        if (glowEl) glowEl.style.opacity = Math.max(0.3, 1 - 0.14 * picksDone);
      }
      QA.state = 'idle';
    }, 95);
    setTimeout(function () {
      closeTray();
      busy = false;
      /* 2026-11-11 (Emily via Limor): early-click version — the end card cuts in once the 5th node is done */
      if (C.ending === 'early' && nodesDone >= (C.earlyAfter || 5) && picksDone < totalSlots) { pendingSlot = null; earlyEnd(); return; }
      if (pendingSlot) { var ps = pendingSlot; pendingSlot = null; if (picksDone < totalSlots) { setTimeout(function () { onHotspot(ps); }, 30); return; } }
      if (picksDone >= totalSlots) document.body.classList.add('final');
      if (picksDone >= totalSlots) setTimeout(C.ending === 'rating' ? ratingEnd : (C.ending === 'vote' ? submitBeat : payoff), C.ending === 'vote' ? 600 : (C.ending === 'rating' ? 650 : 850));
      else if (C.autoOpen || C.guideFast) { var mb = midFor(); if (mb) midBeat(mb); setTimeout(function () { pointHandAtNextHotspot(); }, mb ? (mb.light ? 900 : 1500) : 360); }
      else scheduleHand(function () { pointHandAtNextHotspot(); });
    }, 480);
  }

  function slotById(id) { for (var i = 0; i < C.slots.length; i++) if (C.slots[i].id === id) return C.slots[i]; return null; }
  /* mid-session beat (critic round 1): a full-room sparkle sweep + a warm word, no counter, no stars */
  var softEl = null;
  function softCta() {
    if (softEl || !C.softCta) return;
    softEl = el('div', 'soft-cta', root); softEl.innerHTML = C.softClient ? '<div class="cta-image"><span class="cta-label">Download</span><span class="cta-logo" role="img" aria-label="Venue"></span></div>' : '<span>' + C.softCta + '</span>';
    placeSoft();
    var shownAt = Date.now();
    softEl.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); var now = Date.now();
      if (now - shownAt < 900 || now - trayClosedAt < 900 || QA.state === 'catalog' || submitted) return;
      QA.beats.softCta = (QA.beats.softCta || 0) + 1; fireCta(); });
    requestAnimationFrame(function () { softEl.classList.add('on'); });
  }
  function placeSoft() {
    if (!softEl) return;
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect(), below = rr.bottom - sr.bottom;
    if (rr.width > rr.height) { softEl.style.top = 'auto'; return; }
    softEl.style.top = Math.round(below >= 90 ? sr.bottom - rr.top + below * 0.5 - 20 : sr.bottom - rr.top - 54) + 'px';
  }
  function midFor() { var l = C.midBeats || (C.midBeat ? [C.midBeat] : []); for (var i = 0; i < l.length; i++) if (nodesDone >= l[i].after && !midFired[i] && picksDone < totalSlots) { midFired[i] = 1; return l[i]; } return null; }
  function cheerPop(mb) {
    var s = lastPickedSlot; if (!s || !s.hot) return;
    var p = el('div', 'cheer-pop-pill', root); p.textContent = mb.text;
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect(), band = sr.top - rr.top, sideB = sr.left - rr.left;
    p.style.left = Math.round(sr.left - rr.left + sceneSide / 2) + 'px';
    if (rr.width <= rr.height && band >= 90) p.style.top = Math.round(Math.max(logoBottom() + 28, band * 0.58)) + 'px';
    else {
      /* over the room: the first spot that touches no marker, no label and not the piece just placed */
      var blocks = [].slice.call(root.querySelectorAll('.hot-wrap, .tap-chip.chip-on')).filter(function (e) { return getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden'; }).map(function (e) { return e.getBoundingClientRect(); });
      var hx = sr.left + s.hot[0] / 100 * sceneSide, hy = sr.top + s.hot[1] / 100 * sceneSide, hr = sceneSide * 0.12;
      blocks.push({ left: hx - hr, right: hx + hr, top: hy - hr, bottom: hy + hr });
      var pw = Math.max(150, sceneSide * 0.34), ph = 44, best = null;
      [[0.5, 0.08], [0.27, 0.08], [0.73, 0.08], [0.5, 0.92], [0.27, 0.92], [0.73, 0.92], [0.5, 0.5], [0.27, 0.5], [0.73, 0.5]].some(function (c) {
        var cx = sr.left + sceneSide * c[0], cy = sr.top + sceneSide * c[1];
        var box = { left: cx - pw / 2 - 6, right: cx + pw / 2 + 6, top: cy - ph / 2 - 6, bottom: cy + ph / 2 + 6 };
        var free = !blocks.some(function (b) { return b.right > box.left && b.left < box.right && b.bottom > box.top && b.top < box.bottom; });
        if (free) { best = c; return true; } return false;
      });
      var sideW = sr.left - rr.left, oneW = p.offsetWidth + 4;
      if ((!best || best[1] > 0.3) && sideW - 24 >= oneW) { p.style.left = Math.round(sideW / 2) + 'px'; p.style.top = Math.round(Math.max(logoBottom() + 40, rr.height * 0.5)) + 'px'; }
      else if (!best && sideW >= 100) { p.style.left = Math.round(sideW / 2) + 'px'; p.style.top = Math.round(rr.height * 0.5) + 'px'; var k1 = (sideW - 14) / oneW; if (k1 >= 0.7) { p.style.fontSize = (parseFloat(getComputedStyle(p).fontSize) * Math.min(1, k1)).toFixed(1) + 'px'; } else { p.style.whiteSpace = 'normal'; p.style.maxWidth = Math.round(sideW - 12) + 'px'; } p.style.textAlign = 'center'; }
      else { best = best || [0.5, 0.08];
      p.style.left = Math.round(sr.left - rr.left + sceneSide * best[0]) + 'px';
      p.style.top = Math.round(sr.top - rr.top + sceneSide * best[1]) + 'px'; }
    }
    play('sparkle'); burst(s.hot[0], s.hot[1], 8, 140);
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('on'); }); });
    setTimeout(function () { p.classList.remove('on'); }, 1250);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
  }
  function midBeat(mb) {
    if (mb && mb.light) return cheerPop(mb);
    mb = mb || C.midBeat; if (mb.soft) setTimeout(softCta, 2500);
    if (mb.pulse && contestEl) { /* pulse after the pill returns */ }
    if (mb.pulse && contestEl) setTimeout(function () { contestEl.classList.remove('pulse'); void contestEl.offsetWidth; contestEl.classList.add('pulse'); }, 2400);
    var lastL = (lastPickedSlot || {}).label;
    var txt = (mb.echo && lastL) ? mb.echo.replace('{label}', lastL.toLowerCase()) : mb.text;
    var p = el('div', 'mid-beat', root); p.innerHTML = '<div class="headline">' + txt + '</div>';
    var sw = el('div', 'room-sweep', scene); setTimeout(function () { if (sw.parentNode) sw.parentNode.removeChild(sw); }, 900);
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var band = sr.top - rr.top, sideB = rr.right - sr.right;
    if (rr.width > rr.height && sideB >= 150) { p.classList.add('side'); p.style.left = Math.round((sr.left - rr.left) / 2) + 'px'; p.style.maxWidth = Math.round(sr.left - rr.left - 24) + 'px'; p.style.top = Math.round(rr.height * 0.42) + 'px'; }
    else p.style.top = Math.round(band >= 90 ? band * 0.62 - 20 : band + sceneSide * 0.04) + 'px';
    if (contestEl && !contestEl.classList.contains('below')) { contestEl.style.transition = 'opacity .15s'; contestEl.classList.remove('on'); setTimeout(function () { if (contestEl) contestEl.style.transition = ''; }, 2150); setTimeout(function () { if (contestEl && QA.state !== 'submit') contestEl.classList.add('on'); }, 2200); }
    play('sparkle');
    for (var i = 0; i < 6; i++) (function (i) { setTimeout(function () { burst(10 + i * 16, 30 + (i % 2) * 30, 6, 160); }, i * 110); })(i);
    setTimeout(function () { p.classList.add('on'); }, 180);
    setTimeout(function () { p.classList.remove('on'); }, 1900);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 2400);
  }
  /* ---------- sparkles ---------- */
  function burst(xPct, yPct, n, spread) {
    spread = spread || 90;
    for (var i = 0; i < n; i++) {
      (function (i) {
        var p = el('img', 'spark', fxLayer);
        p.src = A.ui.sparkle;
        var ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        var dist = 6 + Math.random() * 9;
        p.style.left = xPct + '%'; p.style.top = yPct + '%';
        p.style.setProperty('--dx', Math.cos(ang) * dist + '%');
        p.style.setProperty('--dy', (Math.sin(ang) * dist - 4) + '%');
        p.style.animationDelay = (Math.random() * spread) + 'ms';
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1250 + spread);
      })(i);
    }
  }

  /* ---------- tutorial hand ---------- */
  function scheduleHand(fn) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(fn, started ? 3800 : (C.hook ? (C.handEarly || 2400) : 700));
  }
  var guideChip = null;
  function hideHand() { clearTimeout(hand._jt);
    clearTimeout(idleTimer); hideHandOnly();
    C.slots.forEach(function (s) { if (s._hot) s._hot.classList.remove('hot-guided'); });
    if (guideChip) guideChip.classList.remove('chip-on');
    var gc = trayGrid.querySelector('.card-guided');
    if (gc) gc.classList.remove('card-guided');
  }
  /* client reference device: the next object's marker flashes + a small label calls the tap.
     The chip is clamped to the visible frame (feedback 2026-08-25: it was cut at the edges). */
  function pointHandAtNextHotspot() {
    var next = C.slots.filter(function (s) { return !s.done && (!s.after || C.slots.filter(function (o) { return o.id === s.after; })[0].done); })[0];
    if (!next) return;
    if (C.autoOpen && (autoArmed || started) && !busy && activeSlot !== next) { onHotspot(next, true); }
    C.slots.forEach(function (s) { s._hot.classList.remove('hot-guided'); });
    next._hot.classList.add('hot-guided');
    showChipFor(next);
    if (activeSlot !== next && picksDone < (C.markerHandPicks || 99)) pointHandAtMarker(next);
  }
  function showChipFor(next) {
    if (!guideChip) guideChip = el('div', 'tap-chip', hotLayer);
    /* the instruction pill already says "tap a +": the chip names the object instead */
    guideChip.textContent = ((activeSlot === next || C.copy.instruction) && next.label) ? (C.lastTouch && C.slots.filter(function (z) { return !z.done; }).length === 1 && !next.done && !(next.twinOf && slotById(next.twinOf) && slotById(next.twinOf).done && next.matchLabel) ? C.lastTouch : (next.twinOf && slotById(next.twinOf) && slotById(next.twinOf).done && next.matchLabel ? next.matchLabel : next.label)) : ((C.copy && C.copy.guide) || 'Tap to style!');
    if (QA.state !== 'catalog') guideChip.style.visibility = '';
    if (C.chipApproved) { guideChip.classList.remove('chip-side2', 'chip-compact', 'chip-left', 'chip-right', 'chip-below'); guideChip.style.left = next.hot[0] + '%'; if (next.hot[1] < 22) { guideChip.classList.add('chip-below'); guideChip.style.top = (next.hot[1] + 7) + '%'; guideChip.classList.add('chip-on'); return; } }
    var flip = next.hot[1] < 22 && !C.chipApproved; /* too close to the top: put the label BESIDE the marker, on the side away from the hand */
    guideChip.classList.remove('chip-below', 'chip-left', 'chip-right');
    if (flip) {
      guideChip.classList.add('chip-side2'); guideChip.style.top = next.hot[1] + '%'; guideChip.style.left = next.hot[0] + '%';
      guideChip.classList.remove('chip-compact');
      var sw0 = scene.getBoundingClientRect().width, mx = next.hot[0] / 100 * sw0;
      var rr0 = root.getBoundingClientRect(), sr0 = scene.getBoundingClientRect();
      var roomLeft = (C.mode === 'layers' ? 0 : rr0.left - sr0.left), roomRight = (C.mode === 'layers' ? sw0 : rr0.right - sr0.left);
      var fitL = function () { return mx - (guideChip.offsetWidth || 120) - 22 >= roomLeft + 6; }, fitR = function () { return mx + 22 + (guideChip.offsetWidth || 120) <= roomRight - 6; };
      if (!fitL() && !fitR()) guideChip.classList.add('chip-compact');
      if (fitL()) guideChip.classList.add('chip-left');
      else if (fitR()) guideChip.classList.add('chip-right');
      else { guideChip.classList.remove('chip-side2'); guideChip.classList.add('chip-below'); guideChip.style.top = (next.hot[1] + 7) + '%'; }
      guideChip.classList.add('chip-on'); return;
    }
    guideChip.classList.remove('chip-side2', 'chip-compact');
    guideChip.style.top = (next.hot[1] - 7) + '%';
    guideChip.style.left = next.hot[0] + '%';
    guideChip.classList.add('chip-on');
    /* clamp horizontally so the pill never leaves the screen */
    var clampChip = function () {
      var sceneR = scene.getBoundingClientRect();
      var rootR = root.getBoundingClientRect();
      var cw = guideChip.offsetWidth || 0;
      var x = next.hot[0] / 100 * sceneR.width;
      /* layers mode: the scene clips its overflow, so the pill must stay inside the ROOM (desktop bands cut it otherwise) */
      var minX = (C.mode === 'layers' ? 0 : (rootR.left - sceneR.left)) + cw / 2 + 8;
      var maxX = (C.mode === 'layers' ? sceneR.width : (rootR.right - sceneR.left)) - cw / 2 - 8;
      x = Math.max(minX, Math.min(maxX, x));
      guideChip.style.left = Math.round(x) + 'px';
    };
    requestAnimationFrame(clampChip); setTimeout(clampChip, 380);
  }
  /* 2026-09-10 (Koren): a human finger shows what to do — it lands on the object, then on a card */
  var handTimer = null;
  function handTo(elTarget, cb) {
    if (!C.hand || !elTarget) return;
    var r = elTarget.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var hw = hand.offsetWidth || 80, hh = hand.offsetHeight || 120;
    var nl = Math.round(r.left - rr.left + r.width / 2 - hw * 0.37), nt = Math.round(r.top - rr.top + r.height / 2 - hh * 0.10);
    var place = function () { hand.style.transition = 'opacity .25s ease'; hand.style.left = nl + 'px'; hand.style.top = nt + 'px'; void hand.offsetWidth; hand.classList.add('hand-on'); setTimeout(function () { hand.style.transition = ''; }, 260); };
    var far = hand.classList.contains('hand-on') && Math.abs((parseFloat(hand.style.left) || 0) - nl) + Math.abs((parseFloat(hand.style.top) || 0) - nt) > 120;
    if (far) { hand.classList.remove('hand-on'); clearTimeout(hand._jt); hand._jt = setTimeout(place, 280); } else if (!hand.classList.contains('hand-on')) place();
    else { hand.style.left = nl + 'px'; hand.style.top = nt + 'px'; hand.classList.add('hand-on'); }
    if (cb) handTimer = setTimeout(cb, 1150);
  }
  function hideHandOnly() { clearTimeout(handTimer); clearTimeout(hand._jt); hand.classList.remove('hand-on'); }
  function pointHandAtMarker(slot) {
    if (!C.hand || !slot || !slot._hot) return;
    if (C.chipApproved && slot.hot[1] < 22) { hideHandOnly(); return; }
    clearTimeout(handTimer);
    handTimer = setTimeout(function () { handTo(slot._hot, function () { handTimer = setTimeout(function () { hideHandOnly(); }, 1600); }); }, C.hook && !started ? (C.handEarly ? 300 : 700) : 300);
  }
  function pointHandAtCard() {
    if (activeSlot && activeSlot._hot) activeSlot._hot.classList.add('hot-guided');
    if (!C.hand) return;
    clearTimeout(handTimer);
    handTimer = setTimeout(function () {
      if (QA.state !== 'catalog') return;
      var cards = trayGrid.querySelectorAll('.card'), tgt = trayGrid.querySelector('.card-tagged') || cards[Math.min(4, cards.length - 1)] || cards[0];
      handTo(tgt, function () { handTimer = setTimeout(function () { hideHandOnly(); }, 1600); });
    }, C.hook && !started ? 900 : 150);
  }

  /* ---------- payoff ---------- */
  function payoff() {
    QA.state = 'payoff';
    QA.beats.payoff = Date.now();
    hideHand();
    hotLayer.style.opacity = 0;
    if (C.mode !== 'layers') topBar.classList.add('bar-out');
    play('sparkle');
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var bandAbove = sr.top - rr.top;
    var starTop = (!isLand && bandAbove >= 110) ? Math.round(bandAbove * 0.5 - sceneSide * 0.075) : (sr.top - rr.top + sceneSide * ((C.starsY || 42) / 100));
    var strip = el('div', 'stars', root);
    strip.style.top = Math.round(starTop) + 'px';
    strip.style.left = Math.round(sr.left - rr.left) + 'px'; strip.style.right = 'auto'; strip.style.width = sceneSide + 'px';
    for (var i = 0; i < 5; i++) {
      (function (i) {
        var st = el('img', 'star', strip);
        st.src = A.ui.star;
        st.style.animationDelay = (180 + i * 260) + 'ms';
        setTimeout(function () { burst(24 + i * 13, (C.starsY || 42) + 4, 5, 220); }, 220 + i * 260);
      })(i);
    }
    burst(50, 44, 10, 220);
    var shower = setInterval(function () {
      burst(12 + Math.random() * 76, 14 + Math.random() * 66, 8, 220);
    }, 200);
    setTimeout(function () { clearInterval(shower); showEndcard(); }, 2600);
  }

  /* ---------- end card (client materials; theme knobs only) ---------- */
  function showEndcard() {
    QA.state = 'endcard';
    QA.beats.endcard = Date.now();
    /* seal the game: the end card fades up over the finished room, then gameplay layers are removed */
    tray.style.display = 'none';
    hand.style.display = 'none';
    setTimeout(function () { scene.style.display = 'none'; topBar.style.display = 'none'; var bl = root.querySelector('.brand-logo'); if (bl) bl.style.display = 'none'; }, 1200);
    endcard.style.display = 'flex'; endcard.classList.add('ec-show');
    if (C.endcardHideBadges) endcard.classList.add('ec-nobadges');
    QA.endcardClient = !!A.endcardHtml;
    requestAnimationFrame(function () { requestAnimationFrame(function () { endcard.classList.add('fade-in'); }); });
    if (audio.music) audio.music.volume = 0.3;
  }

  /* ---------- 2026-11-11 endings (Emily via Limor, Asana Oct26_playable) ----------
     'early'  : the click comes after the 5th node; the player can't finish; Venue's regular end card ("Design your dream home").
     'rating' : the player finishes every node; end card = the client's 5-Star end card look with the score hidden ("?.??").
     No store opening on its own: every store open comes from a player tap on the end screen (network rules). */
  function clearPlayUi() {
    busy = true; hideHand();
    hotLayer.style.transition = 'opacity .35s ease'; hotLayer.style.opacity = 0;
    Array.prototype.forEach.call(root.querySelectorAll('.tap-chip,.mid-beat,.cheer-pop,.gamebar.instruction'), function (n) { n.style.transition = 'opacity .3s ease'; n.style.opacity = 0; });
    if (window.__mtgHide) window.__mtgHide();
  }
  function ecHand(target, host) {
    if (!C.hand || !A.ui.hand || !target) return;
    var h = el('div', 'ec-hand', host); var hi = el('img', '', h); hi.src = A.ui.hand; hi.draggable = false;
    function put() { var tr = target.getBoundingClientRect(), hr = host.getBoundingClientRect(); var lb = target.querySelector('.cta-label'), lr = lb ? lb.getBoundingClientRect() : tr; h.style.left = Math.round(lr.left - hr.left + lr.width * 0.55) + 'px'; h.style.top = Math.round(lr.bottom - hr.top - Math.min(6, lr.height * 0.2)) + 'px'; }
    put(); setTimeout(function () { put(); h.classList.add('on'); }, 60);
    window.addEventListener('resize', function () { setTimeout(put, 60); setTimeout(put, 400); });
    var iv = setInterval(function () { if (!h.parentNode) return clearInterval(iv); put(); }, 500);
  }
  function earlyEnd() {
    if (QA.state === 'endcard' || QA.state === 'earlyCut') return;
    QA.state = 'earlyCut'; QA.beats.earlyCut = Date.now(); QA.earlyNodes = nodesDone;
    root.classList.add('early-cut'); clearPlayUi();
    setTimeout(function () {
      showEndcard();
      var t = endcard.querySelector('.game-title'), cb = endcard.querySelector('.cta-image'); if (t && C.endTitle) t.textContent = C.endTitle;
      /* the client's "Design your dream home" end card: title above the button (also keeps the hand off the text) */
      if (t && cb && t.parentNode === cb.parentNode) { t.parentNode.insertBefore(t, cb); endcard.classList.add('ec-title-first'); }
      setTimeout(function () { ecHand(endcard.querySelector('.cta-image'), endcard); }, 1500);
    }, C.earlyDelay || 700);
  }
  var rateEl = null;
  function ratingEnd() {
    if (rateEl) return;
    QA.state = 'rating'; QA.beats.rating = Date.now(); clearPlayUi();
    flattenScene();
    var fr = scene.querySelector('.flat-room'), src = null;
    try { src = fr ? fr.toDataURL('image/jpeg', 0.93) : null; } catch (e) { QA.errors.push('flat:' + e.message); }
    burst(50, 48, 12, 260);
    setTimeout(function () { buildRating(src); }, 850);
  }
  function buildRating(src) {
    var R = C.rating || {};
    rateEl = el('div', 'rate-end', root);
    el('div', 're-bg', rateEl);
    var wrap = el('div', 're-wrap', rateEl);
    var logo = el('img', 're-logo', wrap); logo.src = A.ui.logo; logo.draggable = false; logo.alt = 'Venue';
    var card = el('div', 're-card', wrap);
    var frame = el('div', 're-frame', card);
    if (src) { var im = el('img', 're-img', frame); im.src = src; im.draggable = false; }
    else { var cl = scene.cloneNode(true); cl.className += ' re-clone'; Array.prototype.forEach.call(cl.querySelectorAll('.hot-wrap,.layer.fx,.tap-chip,.preview-flash'), function (n) { n.parentNode.removeChild(n); }); frame.appendChild(cl); }
    if (A.ui.sparkle) { ['s1', 's2', 's3'].forEach(function (k) { var sp = el('img', 're-spark ' + k, card); sp.src = A.ui.sparkle; sp.draggable = false; }); }
    var pill = el('div', 're-pill', card);
    if (A.ui.star) { var st = el('img', 're-star', pill); st.src = A.ui.star; st.draggable = false; } else { el('span', 're-star-t', pill).textContent = '★'; }
    el('span', 're-q', pill).textContent = R.score || '?.??';
    var side = el('div', 're-side', wrap);
    el('div', 're-title', side).textContent = R.title || "Find out your design's rating";
    var cta = el('div', 'vote-cta client-cta re-cta', side);
    cta.innerHTML = '<div class="cta-image"><span class="cta-label">' + (R.cta || 'Download') + '</span><span class="cta-logo" role="img" aria-label="Venue"></span></div>';
    var shown = Date.now();
    rateEl.addEventListener('pointerdown', function (ev) { ev.preventDefault(); if (Date.now() - shown < 900) return; cta.classList.add('pressed'); setTimeout(function () { cta.classList.remove('pressed'); }, 160); fireCta(); }, { passive: false });
    var bl = root.querySelector('.brand-logo'); if (bl) { bl.style.transition = 'opacity .4s ease'; bl.style.opacity = '0'; }
    reLayout(); window.addEventListener('resize', function () { reLayout(); setTimeout(reLayout, 250); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { rateEl.classList.add('on'); }); });
    setTimeout(function () { cta.classList.add('on'); }, 1300);
    setTimeout(function () { ecHand(cta.querySelector('.cta-image'), rateEl); }, 1900);
    QA.state = 'endcard'; QA.beats.endcard = Date.now(); QA.ratingShown = true;
    if (audio.music) audio.music.volume = 0.3;
    try { if (typeof play === 'function') play('reveal'); } catch (e) {}
  }
  function reLayout() {
    if (!rateEl) return;
    var rr = root.getBoundingClientRect(), W = rr.width, H = rr.height, land = W > H * 1.05;
    rateEl.classList.toggle('re-land', land);
    var c, fs, lw;
    if (land) {
      c = Math.min(H * 0.70, W * 0.42, 820);
      fs = Math.max(20, Math.min(H * 0.062, W * 0.034, 46));
      lw = Math.max(110, Math.min(W * 0.16, H * 0.24, 260));
      rateEl.style.setProperty('--side', Math.round(Math.min(W - c - W * 0.16, c * 1.05, 560)) + 'px');
    } else {
      lw = Math.max(120, Math.min(W * 0.42, H * 0.12, 240));
      fs = Math.max(19, Math.min(W * 0.068, H * 0.036, 40));
      var free = H - lw * 0.42 - fs * 2.6 - fs * 3.1 - 120;
      c = Math.max(160, Math.min(W * 0.80, free, 600));
    }
    rateEl.style.setProperty('--c', Math.round(c) + 'px');
    rateEl.style.setProperty('--fs', fs.toFixed(1) + 'px');
    rateEl.style.setProperty('--lw', Math.round(lw) + 'px');
    rateEl.style.setProperty('--fw', Math.round(land ? Math.min(W, 1400) * 0.62 : W) + 'px');
  }
  var lastFire = 0;
  function fireCta() {
    var nowF = Date.now(); if (nowF - lastFire < 1000) return; lastFire = nowF;
    var ua = navigator.userAgent || '';
    var link = /android/i.test(ua) ? C.store.android : C.store.ios;
    QA.beats.ctaFired = Date.now();
    QA.lastCta = link;
    try {
      if (typeof openStore === 'function') openStore(link);
      else window.open(link, '_blank');
    } catch (e) {
      QA.errors.push('openStore:' + e.message);
      try { window.open(link, '_blank'); } catch (e2) {}
    }
  }


  /* ---------- voting ending v2 (Limor, Asana Oct26_playable, 21 Oct 2026; critic round 1 fixes) ----------
     N nodes -> Submit design -> vote on 3 other designs -> yours vs the one you passed on, tug-of-war that never
     resolves -> "See who wins" -> store. Every step waits for a tap; the hand only guides when idle.
     No numbers anywhere; vote meters are a game animation, not data. Timers only advance while the ad is visible. */
  var voteEl = null, submitEl = null, duelEl = null, submitted = false, contestEl = null;
  var HEART = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M12 21.3l-1.4-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.3z"/></svg>';
  var V = C.vote || {};
  function logoTop() { var bl = root.querySelector('.brand-logo'); if (bl) { bl.style.zIndex = 92; if (V.clean) { bl.style.animation = 'none'; bl.style.transition = 'opacity .3s ease'; bl.style.opacity = '0'; } if (QA.state === 'vote' && C.vote && C.vote.hideLogoOnVote) bl.style.opacity = '0'; var li = bl.querySelector('img'); if (li && A.ui.logoPink) li.src = A.ui.logoPink; } }
  function adVisible() { try { return typeof isAdVisible !== 'function' || isAdVisible() !== false; } catch (e) { return true; } }
  /* the contest framing lives in the top band for the whole design phase */
  function showContest() {
    if (contestEl || !V.contest || C.ending !== 'vote') return;
    contestEl = el('div', 'contest-pill', root);
    contestEl.innerHTML = '<span class="contest-h">' + HEART + '</span><span class="contest-name" data-short="' + (V.contestShort || V.contest) + '">' + V.contest + '</span>' + (C.progressDots ? '<span class="contest-dots"></span>' : '');
    if (C.progressDots) updateDots();
    placeContest();
    requestAnimationFrame(function () { contestEl.classList.add('on'); });
  }
  function guideStep() {
    if (!C.guidePill) return;
    if (nodesDone === 1 && !guidePill) { guidePill = el('div', 'mid-beat guide-pill', root); guidePill.innerHTML = '<div class="headline">' + C.guidePill + '</div>';
      var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect(), band = sr.top - rr.top;
      if (rr.width > rr.height) { guidePill.classList.add('side'); guidePill.style.left = Math.round((sr.left - rr.left) / 2) + 'px'; guidePill.style.top = Math.round(Math.max(rr.height * 0.6, contestEl && contestEl.classList.contains('side') ? contestEl.getBoundingClientRect().bottom - rr.top + 10 + 0 : 0)) + 'px'; guidePill.style.maxWidth = Math.round(sr.left - rr.left - 24) + 'px'; if (contestEl && contestEl.classList.contains('side')) { var cr0 = contestEl.getBoundingClientRect(); guidePill.style.left = Math.round(cr0.left - rr.left + cr0.width / 2) + 'px'; guidePill.style.width = Math.round(cr0.width) + 'px'; guidePill.style.maxWidth = 'none'; guidePill.style.boxSizing = 'border-box'; } }
      else guidePill.style.top = Math.round(band >= 90 ? band * 0.62 - 20 : band + sceneSide * 0.04) + 'px';
      setTimeout(function () { if (guidePill) guidePill.classList.add('on'); }, 700); }
    else if (nodesDone >= 2 && guidePill && guidePill !== 'done') { var g = guidePill; g.classList.remove('on'); setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 400); guidePill = 'done'; }
    if (nodesDone >= 2 && guidePill === null) guidePill = 'done';
    var total = C.slots.filter(function (z) { return !C.slots.some(function (o) { return o.mirror === z.id; }); }).length;
    if (nodesDone === total && contestEl) { var d = contestEl.querySelector('.contest-dots'); if (d) d.classList.add('all'); contestEl.classList.remove('done-pop'); void contestEl.offsetWidth; contestEl.classList.add('done-pop');
      for (var i = 0; i < 6; i++) (function (i) { setTimeout(function () { burst(8 + i * 17, 20 + (i % 3) * 25, 6, 180); }, i * 70); })(i); }
  }
  function updateDots() {
    var d = contestEl && contestEl.querySelector('.contest-dots'); if (!d) return;
    var total = C.slots.filter(function (z) { return !C.slots.some(function (o) { return o.mirror === z.id; }); }).length;
    if (d.children.length !== total) { d.innerHTML = ''; for (var i = 0; i < total; i++) el('i', '', d); }
    Array.prototype.forEach.call(d.children, function (dot, i) { var on = i < nodesDone; if (on && !dot.classList.contains('on')) { dot.classList.add('on', 'pop'); } });
  }
  function logoBottom() { var bl = root.querySelector('.brand-logo'), rr = root.getBoundingClientRect(); return bl ? bl.getBoundingClientRect().bottom - rr.top : 50; }
  function clampRibbons() { var W = root.getBoundingClientRect(); [].forEach.call(tray.querySelectorAll('.card-ribbon'), function (rb) { rb.style.marginLeft = '0px'; var r = rb.getBoundingClientRect(); var over = r.right - (W.right - 6), under = (W.left + 6) - r.left; if (over > 0) rb.style.marginLeft = -Math.ceil(over) + 'px'; else if (under > 0) rb.style.marginLeft = Math.ceil(under) + 'px'; }); }
  setInterval(function () { if (document.body.classList.contains('has-hero') && (!heroEl || !heroEl.parentNode || heroEl.classList.contains('hero-out'))) document.body.classList.remove('has-hero'); }, 150);
  function placeContest() {
    if (!contestEl) return;
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect(), band = sr.top - rr.top;
    var land = rr.width > rr.height, sideBand = rr.right - sr.right;
    contestEl.classList.remove('in-room', 'side', 'below');
    if (land && sideBand >= 150) {
      contestEl.classList.add('side'); var cn = contestEl.querySelector('.contest-name'); if (cn) cn.textContent = V.contest;
      contestEl.style.top = Math.round(rr.height * 0.42) + 'px';
      contestEl.style.left = '12px';
      contestEl.style.width = Math.round(sr.left - rr.left - 24) + 'px'; contestEl.classList.toggle('narrow', sr.left - rr.left - 24 < 170);
    } else if (C.contestBelow && rr.bottom - sr.bottom >= 90) {
      contestEl.style.left = ''; contestEl.classList.add('below');
      contestEl.style.top = Math.round(sr.bottom - rr.top + (rr.bottom - sr.bottom) * 0.5 - 16) + 'px';
    } else if (band >= 70) {
      contestEl.style.left = '';
      contestEl.style.top = Math.round(Math.max(logoBottom() + 8, band >= 110 ? band * 0.58 - 16 : band * 0.5 - 14)) + 'px';
    } else { contestEl.classList.add('in-room'); }
  }
  function handOn(target, dx, dy) {
    /* hand aimed at a point inside target: dx/dy are fractions of the target box (0.5,0.5 = centre) */
    if (!C.hand || !target) return;
    var r = target.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var hw = hand.offsetWidth || 80, hh = hand.offsetHeight || 120;
    var tl0 = Math.round(Math.min(r.left - rr.left + r.width * dx - hw * 0.37, rr.width - hw - 8)), tt0 = Math.round(Math.min(r.top - rr.top + r.height * dy - hh * 0.10, rr.height - hh * 0.97 - 8));
    if (hand.classList.contains('hand-on') && Math.abs((parseFloat(hand.style.left) || 0) - tl0) + Math.abs((parseFloat(hand.style.top) || 0) - tt0) > 120) {
      hand.classList.remove('hand-on'); clearTimeout(hand._jt); hand._jt = setTimeout(function () { handOn(target, dx, dy); }, 280); return;
    }
    var wasOff = !hand.classList.contains('hand-on'); if (wasOff) hand.style.transition = 'opacity .25s ease';
    if (!hand.classList.contains('hand-on')) { hand.style.transition = 'opacity .25s ease'; void hand.offsetWidth; setTimeout(function () { hand.style.transition = ''; }, 30); }
    hand.style.left = Math.round(Math.min(r.left - rr.left + r.width * dx - hw * 0.37, rr.width - hw - 8)) + 'px';
    hand.style.top = Math.round(Math.min(r.top - rr.top + r.height * dy - hh * 0.10, rr.height - hh * 0.97 - 8)) + 'px';
    if (wasOff) { void hand.offsetWidth; setTimeout(function () { hand.style.transition = ''; }, 260); }
    hand.classList.add('hand-on');
  }
  /* one bitmap of the finished room so the Submit crossfade fades a single layer (client pixels, drawn as-is) */
  function flattenScene() {
    try {
      if (submitted || scene.querySelector('.flat-room')) return;
      var w = scene.offsetWidth, h = scene.offsetHeight, br = scene.getBoundingClientRect(), dpr = Math.max(Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, br.width / (w || 1))), Math.min(4, ((roomImg && roomImg.naturalWidth) || 0) / (w || 1)));
      if (!w || !h) return;
      var cv = document.createElement('canvas'); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      var cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.scale(dpr, dpr);
      if (roomImg && roomImg.complete) cx.drawImage(roomImg, roomImg.offsetLeft, roomImg.offsetTop, roomImg.offsetWidth, roomImg.offsetHeight);
      var ls = Array.prototype.slice.call(itemLayer.querySelectorAll('img.client-layer')).map(function (im, i) { return { im: im, z: parseInt(im.style.zIndex || '0', 10), i: i }; });
      ls.sort(function (a, b) { return a.z - b.z || a.i - b.i; });
      for (var k = 0; k < ls.length; k++) { var im = ls[k].im; if (!im.complete || getComputedStyle(im).opacity === '0') continue; cx.globalAlpha = parseFloat(getComputedStyle(im).opacity) || 1; cx.drawImage(im, im.offsetLeft + itemLayer.offsetLeft, im.offsetTop + itemLayer.offsetTop, im.offsetWidth, im.offsetHeight); }
      cx.globalAlpha = 1;
      cv.className = 'flat-room'; cv.style.visibility = 'hidden'; scene.insertBefore(cv, hotLayer);
    } catch (e) { var f = scene.querySelector('.flat-room'); if (f) f.parentNode.removeChild(f); roomImg.style.visibility = ''; itemLayer.style.visibility = ''; }
  }
  function submitBeat() {
    setTimeout(flattenScene, 900);
    if (window.__mtgHide) window.__mtgHide();
    if (A.ui.duels) Object.keys(A.ui.duels).forEach(function (k) { var im = new Image(); im.src = A.ui.duels[k]; if (im.decode) im.decode().catch(function () {}); });
    QA.state = 'submit'; QA.beats.submitShown = Date.now();
    hideHand();
    hotLayer.style.opacity = 0;
    if (contestEl) contestEl.classList.remove('on');
    if (softEl) { softEl.classList.remove('on'); softEl.style.pointerEvents = 'none'; }
    play('sparkle');
    burst(50, 44, 12, 240);
    var sr = scene.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var bandBelow = rr.bottom - sr.bottom, bandAbove = sr.top - rr.top;
    var ready = el('div', 'vote-ready', root);
    var landR = rr.width > rr.height && rr.right - sr.right >= 170;
    ready.innerHTML = '<div class="headline">' + ((landR && V.readyLand) || V.ready || 'Your room is ready!') + '</div>' + (V.readySub ? '<div class="vote-ready-sub">' + ((landR && V.readySubLand) || V.readySub) + '</div>' : '') + (V.readyEcho && lastPickedSlot && !V.clean ? '<div class="vote-ready-echo">' + V.readyEcho.replace('{label}', lastPickedSlot.label.toLowerCase()) + '</div>' : '');
    ready.style.top = Math.round(Math.max(bandAbove >= 110 ? bandAbove * 0.62 - 34 : bandAbove + sceneSide * 0.04, (window.__mtg && rr.height < 700) ? 62 : 0)) + 'px';
    submitEl = el('div', 'vote-submit', root);
    submitEl.innerHTML = '<span>' + (V.submit || 'Submit') + '</span>';
    var btnH = 58;
    submitEl.style.top = Math.round(bandBelow >= btnH + 40 ? sr.bottom - rr.top + Math.min(bandBelow * 0.36, 70) - btnH / 2 + 10 : sr.bottom - rr.top - sceneSide * 0.05 - btnH) + 'px';
    scene.classList.add('pride'); setTimeout(function () { scene.classList.remove('pride'); scene.classList.add('pushin'); }, 60);
    if (rr.width > rr.height && rr.right - sr.right >= 170) { var rb = rr.right - sr.right; submitEl.style.top = Math.round(sr.top - rr.top + sceneSide * 0.5 - 29) + 'px'; submitEl.style.left = Math.round(sr.right - rr.left + rb / 2) + 'px'; submitEl.style.minWidth = '0'; submitEl.style.boxSizing = 'border-box'; submitEl.style.width = Math.min(220, rb - 72) + 'px'; submitEl.style.fontSize = Math.round(Math.max(15, Math.min(23, (Math.min(220, rb - 72)) * 0.095))) + 'px'; submitEl.style.padding = '0 12px'; submitEl.style.fontSize = '18px';
      ready.style.left = Math.round((sr.left - rr.left) / 2) + 'px'; ready.style.top = Math.round(rr.height / 2) + 'px'; ready.classList.add('ready-land'); ready.style.maxWidth = Math.round(sr.left - rr.left - 50) + 'px'; ready.style.width = Math.round(sr.left - rr.left - 50) + 'px'; ready.style.minWidth = '0'; ready.style.whiteSpace = 'normal'; }
    if (V.clean && rr.width > rr.height && rr.width >= 1000) { ready.classList.remove('ready-land'); ready.style.left = Math.round(sr.left - rr.left + sceneSide / 2) + 'px'; ready.style.width = ''; ready.style.minWidth = ''; ready.style.maxWidth = Math.round(sceneSide * 0.86) + 'px'; ready.style.whiteSpace = ''; ready.style.top = Math.round(sr.top - rr.top + sceneSide * 0.05) + 'px';
      var bh2 = 58; submitEl.style.left = Math.round(sr.left - rr.left + sceneSide / 2) + 'px'; submitEl.style.width = ''; submitEl.style.minWidth = ''; submitEl.style.padding = ''; submitEl.style.fontSize = ''; submitEl.style.top = Math.round(sr.bottom - rr.top - sceneSide * 0.06 - bh2) + 'px'; }
    requestAnimationFrame(function () { ready.classList.add('on'); });
    setTimeout(function () { submitEl.classList.add('on'); }, V.submitDelay || 950);
    submitEl.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); onSubmit(ready); }, { passive: false });
    clearTimeout(handTimer);
    handTimer = setTimeout(function () { if (!submitted) handOn(submitEl, 0.88, root.classList.contains('land') ? 0.95 : 0.6); }, 2300);
  }
  function roomCard(parent, cls, label, src) {
    var card = el('div', 'vote-card ' + cls, parent);
    var frame = el('div', 'vote-frame', card);
    if (src) { var im = el('img', 'vote-img', frame); im.src = src; im.draggable = false; }
    else if (V.clean && scene.querySelector('.flat-room')) { var fim = el('img', 'vote-img', frame); fim.draggable = false; fim.src = scene.querySelector('.flat-room').toDataURL('image/jpeg', 0.92); if (window.__preYou) { var ph = window.__preYou._holder; window.__preYou = null; if (ph && ph.parentNode) ph.parentNode.removeChild(ph); } }
    else if (window.__preYou) { var pc = window.__preYou; window.__preYou = null; frame.appendChild(pc); if (pc._holder && pc._holder.parentNode) pc._holder.parentNode.removeChild(pc._holder); }
    else {
      var clone = scene.cloneNode(true);
      var kids = Array.prototype.slice.call(scene.children), ck = Array.prototype.slice.call(clone.children);
      kids.forEach(function (n, i) { if (n === hotLayer || n === fxLayer) ck[i].parentNode.removeChild(ck[i]); });
      var _fr = clone.querySelector('.flat-room'); if (_fr) _fr.parentNode.removeChild(_fr); [].forEach.call(clone.querySelectorAll('img.room, .layer'), function (e) { e.style.visibility = ''; }); clone.className = 'scene vote-scene'; clone.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:1;transform:none;';
      frame.appendChild(clone);
    }
    if (label) { var tag = el('div', 'vote-tag', frame); tag.textContent = label; }
    return { card: card, frame: frame };
  }
  function onSubmit(ready) {
    if (submitted) return; hideHandOnly();
    var early = 450 - (Date.now() - (QA.beats.submitShown || 0));
    if (early > 0) { submitEl.classList.add('pressed'); if (!submitEl._q) { submitEl._q = 1; setTimeout(function () { submitEl._q = 0; onSubmit(ready); }, early); } return; }
    if (!submitEl.classList.contains('on') && !V.submitLive) return;
    if (V.clean) flattenScene();
    submitEl.classList.add('on'); submitted = true;
    var blo = root.querySelector('.brand-logo'); if (blo) blo.style.pointerEvents = 'none';
    if (softEl) { softEl.classList.remove('on'); softEl.style.pointerEvents = 'none'; }
    QA.beats.submitted = Date.now();
    hideHand(); clearTimeout(handTimer);
    play('reveal');
    submitEl.classList.add('pressed');
    burst(50, 96, 8, 160);
    var pairs = (A.ui.duels && V.duels) ? V.duels : [];
    setTimeout(function () { ready.classList.add('quick-out'); ready.classList.remove('on'); submitEl.classList.add('gone'); var fr = scene.querySelector('.flat-room'); if (fr) { fr.style.visibility = 'visible'; roomImg.style.visibility = 'hidden'; itemLayer.style.visibility = 'hidden'; } scene.classList.add('scene-out'); }, 40);
    if (pairs.length) setTimeout(function () { runDuels(pairs, function (lastUnpicked) { showVote(lastUnpicked); }); }, 40);
    else showVote(null);
  }
  /* the "vote" half of Venue's core loop: the player judges other designs of the same room */
  function runDuels(pairs, done) {
    QA.state = 'duel'; QA.beats.duels = 0;
    logoTop();
    [].forEach.call(root.querySelectorAll('.vote-ready'), function (n) { n.classList.add('quick-out'); setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 160); });
    setTimeout(function () { (window.requestIdleCallback || function (f) { f(); })(function () { if (window.__preYou) return; var holder = el('div', 'pre-you', root); var c2 = scene.cloneNode(true);
      var ks = Array.prototype.slice.call(scene.children), cks = Array.prototype.slice.call(c2.children);
      ks.forEach(function (n, i) { if (n === hotLayer || n === fxLayer) cks[i].parentNode.removeChild(cks[i]); });
      var _fr = c2.querySelector('.flat-room'); if (_fr) _fr.parentNode.removeChild(_fr); [].forEach.call(c2.querySelectorAll('img.room, .layer'), function (e) { e.style.visibility = ''; }); c2.className = 'scene vote-scene'; c2.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:1;transform:none;';
      holder.appendChild(c2); c2._holder = holder; window.__preYou = c2; }); }, 950);
    duelEl = el('div', 'vote duel', root);
    var head = el('div', 'vote-head', duelEl);
    var t = el('div', 'vote-title', head); t.textContent = V.duelTitle || 'Tap your favorite!';
    var sub = el('div', 'vote-sub', head); sub.textContent = V.duelSub || '';
    var dots = el('div', 'duel-dots', head);
    if (pairs.length > 1) pairs.forEach(function () { el('i', '', dots); }); else dots.style.display = 'none';
    var row = el('div', 'vote-row', duelEl);
    var dslot = el('div', 'vote-cta-slot', duelEl);
    if (V.duelNote) { var dn = el('div', 'vote-cta-note duel-note', dslot); dn.textContent = V.duelNote; }
    if (V.duelCta) { var dc = el('div', 'vote-cta client-cta duel-cta', dslot); dc.innerHTML = '<div class="cta-image"><span class="cta-label">Download</span><span class="cta-logo" role="img" aria-label="Venue"></span></div>';
      var dcAt = Date.now(); setTimeout(function () { dc.classList.add('on'); }, 900);
      dc.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (Date.now() - dcAt < 900) return; QA.beats.duelCta = (QA.beats.duelCta || 0) + 1; fireCta(); }); }
    layoutVoteEl(duelEl);
    requestAnimationFrame(function () { requestAnimationFrame(function () { duelEl.classList.add('on'); }); });
    var idx = 0, locked = false, idle = null, unpicked = null, cards = [];
    function showPair() {
      locked = true; setTimeout(function () { locked = false; }, V.duelLock || 450); row.innerHTML = ''; QA.beats.duelShown = idx + 1;
      if (dots.children.length) Array.prototype.forEach.call(dots.children, function (d, i) { d.className = i < idx ? 'done' : (i === idx ? 'cur' : ''); });
      var p = pairs[idx];
      cards = [];
      p.forEach(function (key, i) {
        if (i === 1) { var vs = el('div', 'vote-vs', row); vs.innerHTML = '<span>VS</span>'; }
        var rc = roomCard(row, 'duel-card', '', A.ui.duels[key]); rc.key = key;
        var stamp = el('div', 'duel-stamp', rc.frame); stamp.innerHTML = '<span class="duel-h">' + HEART + '</span><b>' + (V.yay || 'Yay!') + '</b>';
        rc.card.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); choose(rc); }, { passive: false });
        cards.push(rc);
      });
      row.classList.remove('in'); void row.offsetWidth; row.classList.add('in');
      clearTimeout(idle);
      /* idle guidance: the hand visits one design, then the other ("pick one") */
      idle = setTimeout(function sweep() {
        if (locked) return;
        handOn(cards[0].frame, 0.55, 0.62);
        idle = setTimeout(function () { if (locked) return; handOn(cards[1].frame, 0.55, 0.62); idle = setTimeout(sweep, 1300); }, 1100);
      }, idx === 0 ? 1500 : 3000);
    }
    function choose(rc) {
      if (locked) return; locked = true; clearTimeout(idle); hideHandOnly();
      play('tick'); setTimeout(function () { play('reveal'); }, 90);
      rc.card.classList.add('duel-picked');
      cards.forEach(function (o) { if (o !== rc) { o.card.classList.add('duel-other'); unpicked = o.key; } });
      if (V.rivalIsFavorite) unpicked = rc.key;
      if (!V.clean) for (var i = 0; i < 7; i++) setTimeout(function () { floatHeart(rc.frame); }, i * 80);
      if (dots.children[idx]) dots.children[idx].className = 'done';
      idx++; QA.beats.duels = idx;
      setTimeout(function () {
        if (idx < pairs.length) { showPair(); }
        else { var dEl = duelEl; dEl.classList.add('vote-out'); setTimeout(function () { if (voteEl) voteEl.classList.remove('vote-nobg'); if (dEl.parentNode) dEl.parentNode.removeChild(dEl); if (duelEl === dEl) duelEl = null; }, 600); done(unpicked); }
      }, V.duelGap || 900);
    }
    showPair();
  }
  function tightVote() { var r = root.getBoundingClientRect(); return r.width > r.height && r.height < 450; }
  function layoutVoteEl(v) {
    var r = root.getBoundingClientRect(), w = r.width, h = r.height, land = w > h * 1.05;
    var cs = land ? (w >= 1000 ? Math.max(Math.min(h * 0.50, w * 0.30), Math.min(h * 0.6, h - 400, w * 0.37)) : Math.min(h * 0.40, w * 0.30)) : Math.min(w * 0.72, h * 0.285, (h - 340) / 2.1);
    v.style.setProperty('--cs', Math.round(cs) + 'px');
    v.style.paddingTop = '0px';
    var fixPad = function () {
      var hd = v.querySelector('.vote-head'); if (!hd) return;
      var need = logoBottom() + 8 - (hd.getBoundingClientRect().top - r.top);
      if (need > 0) v.style.paddingTop = Math.round(need * 2) + 'px';
    };
    v.classList.toggle('vote-land', land);
    v.classList.toggle('vote-compact', land && w < 1000);
    var shortP = !land && h < 700; v.classList.toggle('vote-short', shortP); if (shortP) v.style.setProperty('--cs', Math.round(Math.min(w * 0.46, h * 0.30)) + 'px');
    /* Omer 21 Oct: the two cards sit side by side on phones too */
    if (!land && C.voteSideBySide !== false) { v.classList.add('vote-side'); v.style.setProperty('--cs', Math.round(Math.min((w - 40) / 2.14, shortP ? h * 0.26 : h * 0.30)) + 'px'); v.classList.toggle('vote-tall', !shortP && h >= 700); }
    v.classList.remove('vote-tallfill');
    if (!land && w < 600 && C.voteSideBySide !== false && !shortP) { var csv = Math.round(Math.min((w - 40) / 2.14, 420)); v.style.setProperty('--cs', csv + 'px'); v.style.setProperty('--fh2', Math.round(Math.min(h - 370, csv * 2.1)) + 'px'); v.classList.add('vote-tallfill'); }
    if (land && w < 1000) v.style.setProperty('--cs', Math.round(Math.min(h * 0.52, (w - Math.min(w * 0.36, 260) - 64) / 2.25)) + 'px');
    fixPad();
  }
  function layoutVote() { if (voteEl) layoutVoteEl(voteEl); if (duelEl) layoutVoteEl(duelEl); placeContest(); }
  function showVote(rivalKey) {
    QA.state = 'vote'; hideHandOnly();
    logoTop();
    voteEl = el('div', 'vote' + (duelEl ? ' vote-nobg' : ''), root);
    var head = el('div', 'vote-head', voteEl);
    var t = el('div', 'vote-title', head); t.textContent = V.title || 'Your design is up for voting!';
    var sub = el('div', 'vote-sub' + (V.cheer ? ' vote-sub-cheer' : ''), head); sub.textContent = (tightVote() && V.cheerShort) || V.cheer || V.sub || (V.clean ? '' : 'Who will win?'); if (V.clean) { sub.style.display = 'none'; voteEl.classList.add('vote-clean'); }
    var row = el('div', 'vote-row', voteEl);
    var you = roomCard(row, 'vote-you', V.you || 'Your design');
    if (cozyPicked && C.tagWord) { var cz = el('div', 'vote-cozy', you.frame); cz.textContent = '\u2665 ' + C.tagWord; }
    var vs = el('div', 'vote-vs', row); vs.innerHTML = V.clean ? '<span>?</span>' : '<span>VS</span>'; if (V.clean) vs.classList.add('vote-q');
    var rivalSrc = (rivalKey && A.ui.duels && A.ui.duels[rivalKey]) || A.ui.rival;
    var rival = roomCard(row, 'vote-rival', V.rival || 'Their design', rivalSrc);
    [you, rival].forEach(function (s) {
      if (V.clean) { s.fill = { style: {} }; return; }
      var bar = el('div', 'vote-bar', s.frame);
      var ic = el('div', 'vote-heart', bar); ic.innerHTML = HEART;
      var track = el('div', 'vote-track', bar);
      s.fill = el('div', 'vote-fill', track);
    });
    var ctaSlot = el('div', 'vote-cta-slot', voteEl);
    var cta;
    if (V.clientCta) { cta = el('div', 'vote-cta client-cta', ctaSlot); cta.innerHTML = '<div class="cta-image"><span class="cta-label">' + (V.ctaLabel || 'Download') + '</span><span class="cta-logo" role="img" aria-label="Venue"></span></div>'; }
    else { cta = el('div', 'vote-cta', ctaSlot); cta.innerHTML = '<span>' + (V.cta || 'See who wins') + '</span>'; }
    if (V.ctaNote) { var note = el('div', 'vote-cta-note', ctaSlot); note.textContent = (tightVote() && V.ctaNoteShort) || V.ctaNote; ctaSlot.insertBefore(note, cta); }
    layoutVoteEl(voteEl);
    if (V.clean) [you, rival].forEach(function (s) { var tg = s.frame.querySelector('.vote-tag'); if (tg) { tg.classList.add('tag-under'); s.card.appendChild(tg); } });
    void voteEl.offsetWidth; if (V.clean && duelEl) setTimeout(function () { if (voteEl) voteEl.classList.add('on'); }, 240); else voteEl.classList.add('on');
    QA.beats.vote = Date.now();
    /* scripted tug-of-war, advanced only while the ad is visible; never resolves, never passes 75% */
    var lastCheerT = -9999, lastLead = '', revealT = 0, tms = 0, last = Date.now(), ctaOn = false, armed = false, shownAt = Date.now(), cheer = 0, cheerR = 0, lead = '';
    var revealAt = V.ctaDelay || 3200;
    function level(side, ms) {
      if (ms < 1600) return 0.06 + 0.49 * (ms / 1600);
      if (ms < 2400) return side ? 0.60 : 0.54;
      if (ms < 3200) return side ? 0.60 : 0.64;
      var ph = (ms - 3200) / 1000;
      return 0.65 + 0.07 * Math.sin(ph * 2.2 + (side ? Math.PI : 0)) + (side ? 0 : 0.01);
    }
    var tick = setInterval(function () {
      var now = Date.now(), dt = now - last; last = now;
      if (!adVisible()) return;
      tms += dt;
      var a = Math.min(0.88, Math.min(0.80, level(0, tms)) + cheer), b = Math.min(0.88, Math.min(0.80, level(1, tms)) + cheerR);
      if (revealT && tms - revealT < 1800) b = a + 0.005;                   /* dead heat as the CTA lands */
      else if (revealT) b = a + 0.06 * Math.sin((tms - revealT - 1800) / 1600 * Math.PI);
      if (tms - lastCheerT < 600) b = Math.min(b, a - 0.03); else if (tms - lastCheerT < 1500 && b > a + 0.02) b = a + 0.02;
      cheer = Math.max(0, cheer - dt * 0.000008); cheerR = Math.max(0, cheerR - dt * 0.000008);
      you.fill.style.width = Math.round(a * 100) + '%'; rival.fill.style.width = Math.round(b * 100) + '%';
      var nl = a > b + 0.01 ? 'you' : (b > a + 0.01 ? 'rival' : lead);
      if (nl !== lead) { if (ctaOn) { vs.classList.remove('q-flip'); void vs.offsetWidth; vs.classList.add('q-flip'); } lead = nl; if (!V.clean) { you.card.classList.toggle('vote-lead', lead === 'you'); rival.card.classList.toggle('vote-lead', lead === 'rival'); } }
      if (!V.clean && Math.random() < 0.55) floatHeart(you.frame);
      if (!V.clean && Math.random() < 0.55) floatHeart(rival.frame);
      if (!ctaOn && tms >= revealAt) reveal();
    }, 140);
    function reveal() {
      if (ctaOn) return; ctaOn = true; revealT = tms;
      sub.textContent = (tightVote() && V.closeShort) || V.close || (V.clean ? '' : "It's a close one!");
      if (sub.classList.contains('vote-sub-cheer') && (V.close === V.cheer)) { /* same line: keep it still */ } else { sub.classList.remove('vote-sub-cheer'); sub.classList.add('vote-sub-hot'); } if (V.noDots) sub.classList.add('no-dots');
      setTimeout(function () { vs.innerHTML = '<span>?</span>'; vs.classList.add('vote-q'); }, 300);
      if (window.__beforeCta) window.__beforeCta();
      cta.classList.add('on'); var nn = ctaSlot.querySelector('.vote-cta-note'); if (nn) nn.classList.add('on'); QA.beats.voteCta = Date.now(); QA.state = 'voteCta';
      play('sparkle');
      setTimeout(function () { armed = true; }, 300);
      clearTimeout(handTimer); hideHandOnly();
      handTimer = setTimeout(function () { handOn(cta, 0.5, 0.62); }, 700);
    }
    /* taps: first 600 ms ignored; before the CTA a tap on your design cheers it, any other tap jumps to the CTA;
       once the CTA is up, a tap anywhere goes to the store and the client end card follows */
    hideHandOnly();
    handTimer = setTimeout(function () { if (!ctaOn && !cheers) handOn(you.frame, 0.5, 0.55); }, 600);
    var cheers = 0;
    function doCheer(side) {
      lastCheerT = tms; if (side === you) cheer = Math.min(0.20, cheer + 0.05); else cheerR = Math.min(0.20, cheerR + 0.05);
      var bar = side.frame.querySelector('.vote-bar'); if (bar) { bar.classList.remove('bar-pop'); void bar.offsetWidth; bar.classList.add('bar-pop'); }
      play('tick'); cheers++; QA.beats.cheers = cheers;
      side.card.classList.remove('cheer-pop'); void side.card.offsetWidth; side.card.classList.add('cheer-pop');
      for (var i = 0; i < 5; i++) setTimeout(function () { floatHeart(side.frame); }, i * 70);
      if (!ctaOn) { hideHandOnly(); if (tms >= 1400) setTimeout(reveal, 700); else setTimeout(reveal, 2100 - tms); }
    }
    voteEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (Date.now() - shownAt < 600) return;
      if (V.clean && !ctaOn) { reveal(); return; }
      if (you.card.contains(e.target)) { doCheer(you); return; }
      if (rival.card.contains(e.target)) { doCheer(rival); return; }
      if (!ctaOn) { doCheer(you); return; }
      if (!armed) return;
      var cb = cta.getBoundingClientRect(), pad = 16;
      var inCta = e.clientX >= cb.left - pad && e.clientX <= cb.right + pad && e.clientY >= cb.top - pad && e.clientY <= cb.bottom + pad;
      if (!inCta) { cta.classList.remove('nudge'); void cta.offsetWidth; cta.classList.add('nudge'); clearTimeout(handTimer); if (QA.state !== 'voteDone') handOn(cta, 0.5, 0.62); return; }
      cta.classList.add('pressed'); setTimeout(function () { cta.classList.remove('pressed'); }, 140);
      hideHandOnly();
      fireCta();
      if (V.endcard === false) { if (QA.state !== 'voteDone') { QA.state = 'voteDone'; hideHandOnly(); setTimeout(function () { if (V.still) { sub.textContent = V.still; sub.classList.add('no-dots'); var nn2 = ctaSlot.querySelector('.vote-cta-note');  } }, 900); } return; }   /* the vote screen IS the end screen */
      if (!QA.beats.endcard) setTimeout(function () { showEndcard(); var ve = voteEl; setTimeout(function () { clearInterval(tick); if (ve && ve.parentNode) ve.parentNode.removeChild(ve); }, 1300); }, 120);
    }, { passive: false });
  }
  function floatHeart(frame) {
    if (frame.querySelectorAll('.vote-float').length >= 6) return;
    var h = el('div', 'vote-float', frame);
    h.innerHTML = HEART;
    h.style.left = (6 + Math.random() * 22) + '%';
    h.style.animationDuration = (1100 + Math.random() * 700) + 'ms';
    h.style.width = h.style.height = (9 + Math.random() * 9) + '%';
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 1900);
  }
  window.addEventListener('resize', function () { setTimeout(layoutVote, 30); });


  var lastInput = Date.now();
  document.addEventListener('pointerdown', function () { lastInput = Date.now(); }, true);
  setInterval(function () {
    if (!C.idleWatch || hooking || !hand || !QA.beats.roomShown) return;
    var quiet = Date.now() - lastInput;
    if (hand.classList.contains('hand-on')) return;
    var qRoom = nodesDone >= 3 ? 3000 : 4000, qCat = nodesDone >= 3 ? 3500 : 4000;
    if (QA.state === 'idle' && quiet > qRoom && !busy) { pointHandAtNextHotspot(); var nx = C.slots.filter(function (z) { return !z.done && !(z._hot && z._hot.classList.contains('hot-hidden')); })[0]; if (nx) pointHandAtMarker(nx); }
    else if (QA.state === 'catalog' && quiet > qCat) pointHandAtCard();
    else if ((QA.state === 'voteCta' && quiet > 1500) || (QA.state === 'voteDone' && quiet > 8000)) { var vc = document.querySelector('.vote-cta.on'); if (vc) handOn(vc, 0.5, 0.62); }
  }, 1000);
  window.__fireCta = function () { fireCta(); };
  var voPlayed = false, autoArmed = false, hooking = false;
  function startMusicOnce() {
    if (!started) { started = true; setTimeout(showContest, 700); if (instrEl) { instrEl.classList.add('instr-out'); setTimeout(function () { if (instrEl && instrEl.parentNode) instrEl.parentNode.removeChild(instrEl); instrEl = null; }, 700); } }
    play('music');
    /* hook VO (Koren 2026-09-10): the headline is spoken the first time audio is allowed */
    if (C.hook && !voPlayed && audio.vo && QA.state !== 'endcard') { voPlayed = true; if (audio.music) audio.music.volume = 0.25; play('vo'); setTimeout(function () { if (audio.music) audio.music.volume = 0.45; }, 2600); }
  }

  /* End card — client Carousel variant structure, theme knobs only (CFG.endcard). */
  function buildEndcard() {
    var ec = C.endcard;
    endcard.style.setProperty('--ec-bg', ec.bg);
    endcard.style.setProperty('--ec-cta', ec.ctaColor);
    endcard.style.setProperty('--ec-wordmark', 'url("' + A.wordmark + '")');
    /* feedback 2026-08-25: the filtered rotating room backdrop read as "strange colors" --
       clean flat client-derived background instead */
    var imgs = A.endcardImgs;
    for (var row = 0; row < 3; row++) {
      var car = el('div', 'ec-carousel ec-c' + (row + 1), endcard);
      var track = el('div', 'ec-track', car);
      var slice = imgs.filter(function (_, i) { return i % 3 === row; });
      if (!slice.length) slice = imgs;
      for (var rep = 0; rep < 3; rep++) {
        slice.forEach(function (src) {
          var im = el('img', 'ec-img', track);
          im.src = src; im.draggable = false; im.loading = 'eager';
        });
      }
    }
    var content = el('div', 'ec-content', endcard);
    var ctaWrap = el('div', 'ec-cta-wrap', content);
    var cta = el('div', 'ec-cta', ctaWrap);
    cta.innerHTML = '<span class="cta-label">Download</span><span class="cta-logo" role="img" aria-label="Venue"></span>';
    var t = el('div', 'ec-title', content);
    t.textContent = ec.title;
    var r = el('img', 'ec-rating', content);
    r.src = A.storeRating; r.draggable = false;
  }

  /* ---------- build DOM ---------- */
  function build() {
    root = el('div', 'pl-root', document.body);
    /* full-bleed sharp room (outpainted extension of the same photo, no blur) */
    if (C.mode === 'layers') {
      var blurBg2 = el('div', 'blur-bg', root);
      blurBg2.classList.add('refblur'); blurBg2.style.backgroundImage = 'url(' + A.room + ')';
    } else if (A.roomExt && C.ext) {
      extBg = el('img', 'ext-bg', root);
      extBg.src = A.roomExt; extBg.draggable = false;
      root.style.background = 'linear-gradient(90deg, ' + (C.ext.edgeL || '#a38a73') + ', ' + (C.ext.edgeR || '#8a785c') + ')';
      el('div', 'bottom-shade', root);
    } else {
      var blurBg = el('div', 'blur-bg', root);
      blurBg.style.backgroundImage = 'url(' + A.room + ')';
    }

    /* feedback 2026-08-25: one playful headline pill + star progress, nothing else on top */
    topBar = el('div', 'topbar', root);
    /* 2026-09-14 (Limor): the game's logo sits on one side so the game name is clear */
    if (C.logo && A.ui.logo) {
      var logo = el('div', 'brand-logo', root);
      var logoImg = el('img', 'brand-logo-img', logo); logoImg.src = A.ui.logo; logoImg.draggable = false;
    }
    /* 2026-09-14 (Limor): no title pill. If a line is kept it is the instruction "Tap one of the + and start
       designing", and it leaves as soon as the player starts. C.titleBar === false removes the headline. */
    if (C.titleBar !== false) {
      var gamebar = el('div', 'gamebar', topBar);
      gamebar.innerHTML = '<div class="headline"><span class="verb">' + C.copy.verb + '</span> ' + C.copy.rest + '</div>';
    } else if (C.copy.instruction) {
      var instr = el('div', 'gamebar instruction', topBar); instrEl = instr;
      instr.innerHTML = '<div class="headline">' + C.copy.instruction + '</div>';
      root.classList.add('no-title');
    } else root.classList.add('no-title');
    if (C.hook) {
      /* 2026-09-10 (Koren): a hook that says WHY — the headline lands big over the room, word by word, then docks up top */
      topBar.classList.add('bar-wait');
      var hero = el('div', 'hero', root); heroEl = hero; document.body.classList.add('has-hero');
      if (C.heroAccent) hero.style.setProperty('--hero-accent', C.heroAccent);
      var words = (C.copy.hero || [C.copy.verb, C.copy.rest]);
      words.forEach(function (w, i) { var d = el('div', 'hero-w' + (i === 0 ? ' verb' : ''), hero); d.textContent = w; d.style.animationDelay = (C.heroStagger ? 120 + i * C.heroStagger : 250 + i * 260) + 'ms'; });
      hooking = true; root.classList.add('hooking');
      setTimeout(function () { if (!C.heroStay || !hero.classList.contains('hero-band')) hero.classList.add('hero-out'); topBar.classList.remove('bar-wait'); hooking = false; root.classList.remove('hooking'); }, C.heroMs || 2100);
      setTimeout(function () { if (C.heroStay && hero.classList.contains('hero-band') && !hero.classList.contains('hero-out')) return; if (hero.parentNode) hero.parentNode.removeChild(hero); heroEl = null; }, (C.heroMs || 2100) + 600);
      document.addEventListener('pointerdown', function heroTap() { document.removeEventListener('pointerdown', heroTap, true); if (heroEl) { var he = heroEl; he.classList.add('hero-quick'); he.classList.add('hero-out'); setTimeout(function () { if (he.parentNode) he.parentNode.removeChild(he); if (heroEl === he) heroEl = null; }, 500); } hooking = false; root.classList.remove('hooking'); if (topBar) topBar.classList.remove('bar-wait'); }, true);
    }
    /* 2026-09-14 (Limor): no star progress row -- a visible progression device tested badly for the client.
       Stars appear once, at the end, in the payoff. C.progress === false removes the row. */
    if (C.progress !== false) {
      progressEl = el('div', 'progress', topBar);
      for (var pi = 0; pi < totalSlots; pi++) {
        var slotDot = el('div', 'p-slot', progressEl);
        var stImg = el('img', 'p-star', slotDot);
        stImg.src = A.ui.star; stImg.draggable = false;
      }
    }

    scene = el('div', 'scene', root);
    roomImg = el('img', 'room', scene);
    roomImg.src = A.room; roomImg.draggable = false;
    if (!C.noVeil) roomImg.style.filter = 'saturate(0.62) brightness(1.03)';
    itemLayer = el('div', 'layer', scene);
    veil = el('div', 'veil', scene);
    veil.style.opacity = C.noVeil ? 0 : 0.30;
    if (!C.noVeil) glowEl = el('div', 'window-glow', scene);
    hotLayer = el('div', 'layer', scene);
    fxLayer = el('div', 'layer fx', scene);
    hand = el('div', 'hand', root);
    var handImg = el('img', 'hand-img', hand);
    handImg.src = A.ui.hand; handImg.draggable = false;

    tray = el('div', 'tray', root);
    trayGrid = el('div', 'tray-grid', tray);

    if (A.endcardHtml) {
      var holder = el('div', '', root); holder.innerHTML = A.endcardHtml;
      endcard = holder.firstElementChild; endcard.classList.add('endcard');
      var ecImgs = endcard.querySelectorAll('img[data-ec]');
      for (var ei = 0; ei < ecImgs.length; ei++) ecImgs[ei].src = A.endcardTable[Number(ecImgs[ei].getAttribute('data-ec'))];
    } else {
      endcard = el('div', 'endcard', root);
      buildEndcard();
    }
    var ctaGuard = 0;
    var onCtaTap = function (e) {
      e.preventDefault();
      var now = Date.now();
      if (now - ctaGuard < 600 || now - (QA.beats.endcard || 0) < 700) return;
      ctaGuard = now;
      fireCta();
    };
    endcard.addEventListener('pointerdown', onCtaTap, { passive: false });
    endcard.addEventListener('click', onCtaTap, { passive: false });
    /* client layer mode: the ghost state IS the client's Blank renders */
    /* 2026-09-15: decode the guided slot's nine thumbnails up front so the first catalog never shows white frames */
    var firstSlot = C.slots.filter(function (s) { return !s.after; })[0];
    if (firstSlot) firstSlot.options.forEach(function (o) { var im = new Image(); im.src = A.thumbs[o.thumb] || A.items[o.img]; if (im.decode) im.decode().catch(function () {}); });
    ['hand', 'star', 'sparkle'].forEach(function (k) { if (A.ui[k]) { var im = new Image(); im.src = A.ui[k]; } });
    placeBlanks();
    if (C.preview && A.ui.duels && A.ui.duels[C.preview]) {
      var pv = el('img', 'preview-flash', scene); pv.src = A.ui.duels[C.preview]; pv.draggable = false;
      scene.insertBefore(pv, hotLayer);
      setTimeout(function () { pv.classList.add('wipe'); }, C.previewMs || 1000);
      setTimeout(function () { if (pv.parentNode) pv.parentNode.removeChild(pv); }, (C.previewMs || 1000) + 900);
    }
    buildHotspots();
    if (C.vote && (C.vote.contestAtBoot || (innerHeight > innerWidth && (innerHeight - innerWidth) / 2 < 115))) setTimeout(showContest, 60);
    QA.beats.roomShown = Date.now();
    QA.state = 'idle';
    scheduleHand(pointHandAtNextHotspot);
    if (C.autoOpen && C.autoOpenDelay) setTimeout(function () { if (!started) pointHandAtNextHotspot(); }, (C.hook ? 2300 : 600));
    if (C.autoOpen) setTimeout(function () { if (!activeSlot && !busy && !started) { autoArmed = true; pointHandAtNextHotspot(); } }, C.autoOpenDelay || 1500);
  }

  function boot() {
    QA.beats.booted = Date.now();
    initAudio();
    build();
    layout();
    if (typeof createResizeListener === 'function') createResizeListener(layout);
    window.addEventListener('resize', layout);
    if (typeof createVisibleListeners === 'function') createVisibleListeners(function () {
      var vis = true;
      try { vis = isAdVisible(); } catch (e) {}
      if (!vis && audio.music) audio.music.pause();
      else if (vis && musicStarted && !muted && audio.music) audio.music.play().catch(function(){});
    });
    if (typeof addSoundListener === 'function') addSoundListener(function (vol) { setMuted(vol !== null && vol !== undefined && !(Number(vol) > 0)); });
    document.addEventListener('pointerdown', startMusicOnce, { once: true, capture: true });
    document.addEventListener('pointerdown', function () { hideHandOnly(); }, { capture: true });
  }

  if (typeof onReady === 'function') onReady(boot, function(){});
  else boot();
})();
