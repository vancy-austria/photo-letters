/* Photo Letters - A3 poster generator, plain HTML/JS, no build step. */

/* ---------- constants ---------- */

const MM_PT = 72 / 25.4;
const SIZES = { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 }, A5: { w: 210, h: 148 } }; // landscape
const PAGE_BG = '#ffffff';
const LETTER_BG = '#ededed';                  // shows through where no photo sits
const INK = '#141414';

/* ---------- state ---------- */

const state = {
  line1: 'Thank you',
  line2: 'COACH',
  line3: 'for all the amazing memories',
  font1: 'Pinyon Script',
  font2: 'Playfair Display',
  font3: 'EB Garamond',
  landscape: true,
  size: 'A3',
  tsize1: 'mittel',
  tsize3: 'klein',
  crop: false,
  photos: [],          // { id, name, img, aspect, url }
  items: [],           // { id, photoId, x, y, w, h }  normalized to word bbox
  selItem: null,
  selPhoto: null,
};

let seq = 0;
const uid = () => 'i' + (++seq);

/* ---------- dom ---------- */

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const photosEl = $('photos');
const ghost = $('ghost');

/* ---------- fonts ---------- */

const fontSpec = (family, weight) => (size) => `${weight} ${size}px "${family}"`;

// families that ship only one cut, asking for 900 would fake the bold
const WEIGHT = {
  'Playfair Display': 900,
  'Bodoni Moda': 900,
  'Abril Fatface': 400,
  'Titan One': 400,
  'Rammetto One': 400,
  'Tangerine': 700,
  'Montserrat': 500,
  'Raleway': 500,
};

function specFor(which) {
  if (which === 1) return fontSpec(state.font1, WEIGHT[state.font1] || 400);
  if (which === 2) return fontSpec(state.font2, WEIGHT[state.font2] || 400);
  return fontSpec(state.font3, 500);
}

async function loadFonts() {
  const want = [
    '400 100px "Pinyon Script"', '400 100px "Great Vibes"', '700 100px "Tangerine"',
    '900 100px "Playfair Display"', '900 100px "Bodoni Moda"', '400 100px "Abril Fatface"',
    '400 100px "Titan One"', '400 100px "Rammetto One"',
    '500 100px "Montserrat"', '500 100px "Raleway"', '500 100px "EB Garamond"', '500 100px "Cormorant Garamond"',
  ];
  await Promise.all(want.map((f) => document.fonts.load(f).catch(() => {})));
  await document.fonts.ready;
}

/* ---------- geometry helpers ---------- */

// text size presets, 'klein' of line 3 and 'mittel' of line 1 are the base look
const TEXT_SCALE = {
  1: { klein: 0.7, mittel: 1, gross: 1.3 },
  3: { klein: 1, mittel: 1.35, gross: 1.7 },
};
const textScale = (n) => TEXT_SCALE[n][state['tsize' + n]] || 1;

function pageSize() {
  const base = SIZES[state.size] || SIZES.A3;
  const mm = state.landscape ? base : { w: base.h, h: base.w };
  return { w: mm.w * MM_PT, h: mm.h * MM_PT, mmW: mm.w, mmH: mm.h };
}

function metrics(c, text, spec, size) {
  c.font = spec(size);
  const m = c.measureText(text || ' ');
  return {
    w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
    h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    left: m.actualBoundingBoxLeft,
    asc: m.actualBoundingBoxAscent,
  };
}

function fitSize(c, text, spec, maxW, maxH) {
  if (!text) return 1;
  const m = metrics(c, text, spec, 100);
  if (!m.w || !m.h) return 1;
  return Math.min(maxW / m.w, maxH / m.h) * 100;
}

/* Layout of the three lines, in PDF points. */
function layout(c) {
  const p = pageSize();
  const margin = p.w * 0.055;
  const maxW = p.w - margin * 2;

  const blocks = [];

  const s1 = state.line1 ? fitSize(c, state.line1, specFor(1), Math.min(maxW, maxW * 0.78 * textScale(1)), p.h * 0.20 * textScale(1)) : 0;
  const s2 = state.line2 ? fitSize(c, state.line2, specFor(2), maxW, p.h * 0.46) : 0;
  const s3 = state.line3 ? fitSize(c, state.line3, specFor(3), Math.min(maxW, maxW * 0.70 * textScale(3)), p.h * 0.075 * textScale(3)) : 0;

  const m1 = state.line1 ? metrics(c, state.line1, specFor(1), s1) : null;
  const m2 = state.line2 ? metrics(c, state.line2, specFor(2), s2) : null;
  const m3 = state.line3 ? metrics(c, state.line3, specFor(3), s3) : null;

  const gap1 = p.h * 0.030;
  const gap2 = p.h * 0.040;
  const total = (m1 ? m1.h : 0) + (m1 && m2 ? gap1 : 0) + (m2 ? m2.h : 0) +
                (m2 && m3 ? gap2 : 0) + (m3 ? m3.h : 0);

  let top = (p.h - total) / 2;
  const cx = p.w / 2;

  if (m1) {
    blocks.push({ kind: 'text', text: state.line1, spec: specFor(1), size: s1,
      x: cx - m1.w / 2 + m1.left, baseline: top + m1.asc });
    top += m1.h + (m2 ? gap1 : 0);
  }
  let word = null;
  if (m2) {
    const x = cx - m2.w / 2 + m2.left;
    const baseline = top + m2.asc;
    word = { text: state.line2, spec: specFor(2), size: s2, x, baseline,
      bx: x - m2.left, by: baseline - m2.asc, bw: m2.w, bh: m2.h };
    top += m2.h + (m3 ? gap2 : 0);
  }
  if (m3) {
    blocks.push({ kind: 'text', text: state.line3, spec: specFor(3), size: s3,
      x: cx - m3.w / 2 + m3.left, baseline: top + m3.asc });
  }
  return { page: p, blocks, word };
}

/* ---------- drawing ---------- */

/* source rect for an item: cover fit, then zoom + pan (crop) */
function srcRect(img, w, h, it) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const ra = w / h;
  let sw = iw, sh = ih;
  if (iw / ih > ra) sw = ih * ra; else sh = iw / ra;
  const z = (it && it.zoom) || 1;
  sw /= z; sh /= z;
  const px = it && it.px != null ? it.px : 0.5;
  const py = it && it.py != null ? it.py : 0.5;
  return { sw, sh, sx: (iw - sw) * px, sy: (ih - sh) * py, rx: iw - sw, ry: ih - sh };
}

function drawCover(c, img, x, y, w, h, it) {
  const s = srcRect(img, w, h, it);
  c.drawImage(img, s.sx, s.sy, s.sw, s.sh, x, y, w, h);
}

const photoById = (id) => state.photos.find((p) => p.id === id);

/* Render the whole poster into ctx. ctx must already be scaled by `s`. */
function render(c, s, L) {
  const { page, blocks, word } = L;

  c.fillStyle = PAGE_BG;
  c.fillRect(0, 0, page.w, page.h);

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = INK;
  for (const b of blocks) {
    c.font = b.spec(b.size);
    c.fillText(b.text, b.x, b.baseline);
  }

  if (!word) return;

  // photo collage clipped by the word shape, on its own buffer
  const mw = Math.max(1, Math.ceil(word.bw * s));
  const mh = Math.max(1, Math.ceil(word.bh * s));
  const buf = document.createElement('canvas');
  buf.width = mw;
  buf.height = mh;
  const bc = buf.getContext('2d');
  bc.setTransform(s, 0, 0, s, 0, 0);
  bc.translate(-word.bx, -word.by);

  for (const it of state.items) {
    const p = photoById(it.photoId);
    if (!p) continue;
    const r = itemRect(it, word);
    drawCover(bc, p.img, r.x, r.y, r.w, r.h, it);
    bc.strokeStyle = 'rgba(255,255,255,.85)';
    bc.lineWidth = Math.max(0.6, 1.4 / s);
    bc.strokeRect(r.x, r.y, r.w, r.h);
  }

  bc.font = word.spec(word.size);
  bc.textAlign = 'left';
  bc.textBaseline = 'alphabetic';

  bc.globalCompositeOperation = 'destination-in';
  bc.fillStyle = '#000';
  bc.fillText(word.text, word.x, word.baseline);

  bc.globalCompositeOperation = 'destination-over';
  bc.fillStyle = LETTER_BG;
  bc.fillText(word.text, word.x, word.baseline);

  c.drawImage(buf, word.bx, word.by, word.bw, word.bh);

  c.font = word.spec(word.size);
  c.lineWidth = Math.max(0.4, word.size * 0.006);
  c.strokeStyle = INK;
  c.strokeText(word.text, word.x, word.baseline);
}

function itemRect(it, word) {
  return { x: word.bx + it.x * word.bw, y: word.by + it.y * word.bh,
    w: it.w * word.bw, h: it.h * word.bh };
}

/* ---------- preview ---------- */

let view = { s: 1, L: null };
let viewZoom = 1;

function setZoom(z) {
  viewZoom = Math.min(4, Math.max(1, z));
  $('zVal').textContent = Math.round(viewZoom * 100) + '%';
  draw();
}
$('zIn').addEventListener('click', () => setZoom(viewZoom * 1.25));
$('zOut').addEventListener('click', () => setZoom(viewZoom / 1.25));
$('zReset').addEventListener('click', () => setZoom(1));
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(viewZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

function draw() {
  const p = pageSize();
  const cssW = (canvas.parentElement.clientWidth - 16) * viewZoom;
  const cssH = cssW * (p.h / p.w);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.min((cssW / p.w) * dpr, 4000 / p.w);

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(p.w * s);
  canvas.height = Math.round(p.h * s);

  ctx.setTransform(s, 0, 0, s, 0, 0);
  const L = layout(ctx);
  render(ctx, s, L);
  view = { s, L, cssW };

  drawOverlay(ctx, s, L);
}

function drawOverlay(c, s, L) {
  const word = L.word;
  if (!word) return;
  const hair = 1.5 / (s / (view.cssW ? 1 : 1));

  for (const it of state.items) {
    const isSel = it.id === state.selItem;
    const isPhotoSel = state.selPhoto && it.photoId === state.selPhoto;
    if (!isSel && !isPhotoSel) continue;
    const r = itemRect(it, word);
    c.save();
    c.lineWidth = Math.max(1, 2.5 / s) * (isSel ? 1.4 : 1);
    c.strokeStyle = isSel ? '#7bb661' : '#ff9b3d';
    c.setLineDash(isSel ? [] : [8 / s, 6 / s]);
    c.strokeRect(r.x, r.y, r.w, r.h);
    c.setLineDash([]);
    if (isSel) {
      const hr = Math.max(7, 11 / s);
      c.fillStyle = '#7bb661';
      c.beginPath();
      c.arc(r.x + r.w, r.y + r.h, hr, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
}

/* ---------- photo list ---------- */

function usageCount(photoId) {
  return state.items.filter((i) => i.photoId === photoId).length;
}

function renderPhotos() {
  const has = state.photos.length > 0;
  $('btnFill').hidden = !has;
  $('btnClear').hidden = state.items.length === 0;
  $('btnClear').textContent = `Alle Fotos (${state.items.length}) aus Text entfernen`;
  updateCounts();
  photosEl.innerHTML = '';
  for (const p of state.photos) {
    const el = document.createElement('div');
    el.className = 'thumb';
    const n = usageCount(p.id);
    if (n) { el.classList.add('used'); el.dataset.count = String(n); }
    if (state.selPhoto === p.id) el.classList.add('active');
    el.innerHTML = `<img src="${p.url}" alt=""><div class="x" title="löschen">&times;</div>`;
    el.addEventListener('pointerdown', (e) => startThumbDrag(e, p, el));
    el.querySelector('.x').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      removePhoto(p.id);
    });
    photosEl.appendChild(el);
  }
}

function removePhoto(id) {
  state.photos = state.photos.filter((p) => p.id !== id);
  state.items = state.items.filter((i) => i.photoId !== id);
  if (state.selPhoto === id) state.selPhoto = null;
  state.selItem = null;
  syncSel();
  renderPhotos();
  draw();
}

const upload = { busy: false, i: 0, n: 0, note: '', timer: 0 };

function updateCounts() {
  const el = $('counts');
  el.hidden = !state.photos.length && !upload.busy && !upload.note;
  el.textContent = '';
  if (upload.busy) {
    const sp = document.createElement('span');
    sp.className = 'spin';
    el.append(sp);
  }
  let t = `Fotos hochgeladen: ${state.photos.length}`;
  if (upload.note) t += ` (${upload.note})`;
  t += `. Fotos im Text: ${state.items.length}.`;
  if (upload.busy) t += ` ${upload.i}/${upload.n} hochladen`;
  el.append(t);
}

async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  clearTimeout(upload.timer);
  Object.assign(upload, { busy: true, i: 0, n: list.length, note: '' });
  updateCounts();
  let skipped = 0;
  for (const f of list) {
    upload.i++;
    updateCounts();
    // same name, size and date = same file, skip it
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (state.photos.some((p) => p.key === key)) { skipped++; continue; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { continue; }
    state.photos.push({ id: uid(), name: f.name, key, img, url,
      aspect: img.naturalWidth / img.naturalHeight });
  }
  upload.busy = false;
  if (skipped) {
    upload.note = skipped === 1 ? '1 Duplikat übersprungen' : `${skipped} Duplikate übersprungen`;
    upload.timer = setTimeout(() => { upload.note = ''; updateCounts(); }, 6000);
  }
  renderPhotos();
  draw();
}

/* ---------- random fill ---------- */

function coverageGrid(word, cols, rows) {
  // low res mask of the word to know which grid cells sit on real letters
  const W = 360;
  const H = Math.max(1, Math.round(W * (word.bh / word.bw)));
  const m = document.createElement('canvas');
  m.width = W; m.height = H;
  const mc = m.getContext('2d');
  const k = W / word.bw;
  mc.setTransform(k, 0, 0, k, 0, 0);
  mc.translate(-word.bx, -word.by);
  mc.fillStyle = '#000';
  mc.font = word.spec(word.size);
  mc.textAlign = 'left';
  mc.textBaseline = 'alphabetic';
  mc.fillText(word.text, word.x, word.baseline);

  const data = mc.getImageData(0, 0, W, H).data;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const x0 = Math.floor((cIdx / cols) * W), x1 = Math.ceil(((cIdx + 1) / cols) * W);
      const y0 = Math.floor((r / rows) * H), y1 = Math.ceil(((r + 1) / rows) * H);
      let on = 0, all = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          all++;
          if (data[(y * W + x) * 4 + 3] > 40) on++;
        }
      }
      cells.push({ col: cIdx, row: r, cov: all ? on / all : 0 });
    }
  }
  return cells;
}

function autoFill() {
  const L = layout(ctx);
  if (!L.word || !state.photos.length) return;
  const word = L.word;
  const n = state.photos.length;
  const A = word.bw / word.bh;

  // one cell per photo, cells roughly photo shaped, so the whole word gets covered
  const TARGET_AR = 1.25;
  const rows = Math.max(1, Math.round(Math.sqrt((n * TARGET_AR) / A)));
  const cols = Math.ceil(n / rows);

  const cells = coverageGrid(word, cols, rows)
    .sort((a, b) => b.cov - a.cov)
    .slice(0, n);

  const pool = state.photos.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const cw = 1 / cols, ch = 1 / rows;
  state.items = cells.map((cell, i) => {
    const grow = 1.1 + Math.random() * 0.14;
    const w = cw * grow, h = ch * grow;
    const jx = (Math.random() - 0.5) * cw * 0.1;
    const jy = (Math.random() - 0.5) * ch * 0.1;
    return {
      id: uid(),
      photoId: pool[i].id,
      x: cell.col * cw - (w - cw) / 2 + jx,
      y: cell.row * ch - (h - ch) / 2 + jy,
      w, h, py: 0.1,
    };
  });

  state.selItem = null;
  syncSel();
  renderPhotos();
  draw();
}

/* ---------- pointer interaction on canvas ---------- */

function canvasToPt(e) {
  const r = canvas.getBoundingClientRect();
  const p = pageSize();
  return { x: ((e.clientX - r.left) / r.width) * p.w, y: ((e.clientY - r.top) / r.height) * p.h };
}

let drag = null;

const capture = (id) => { try { canvas.setPointerCapture(id); } catch { /* ignore */ } };

canvas.addEventListener('pointerdown', (e) => {
  const L = view.L || layout(ctx);
  if (!L.word) return;
  const pt = canvasToPt(e);
  const r = canvas.getBoundingClientRect();
  const ptPerPx = pageSize().w / r.width;
  const grab = 16 * ptPerPx;

  // resize handle of the selected item wins
  const sel = state.items.find((i) => i.id === state.selItem);
  if (sel) {
    const rc = itemRect(sel, L.word);
    if (Math.hypot(pt.x - (rc.x + rc.w), pt.y - (rc.y + rc.h)) < grab) {
      capture(e.pointerId);
      drag = { mode: 'resize', id: sel.id, startW: sel.w, startH: sel.h,
        startDiag: Math.hypot(pt.x - rc.x, pt.y - rc.y) || 1, ox: rc.x, oy: rc.y };
      return;
    }
  }

  // crop mode: drag inside the selected frame pans the photo
  if (sel && state.crop) {
    const rc = itemRect(sel, L.word);
    if (pt.x >= rc.x && pt.x <= rc.x + rc.w && pt.y >= rc.y && pt.y <= rc.y + rc.h) {
      capture(e.pointerId);
      drag = { mode: 'pan', id: sel.id, sx: pt.x, sy: pt.y,
        px: sel.px != null ? sel.px : 0.5, py: sel.py != null ? sel.py : 0.5 };
      return;
    }
  }

  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    const rc = itemRect(it, L.word);
    if (pt.x >= rc.x && pt.x <= rc.x + rc.w && pt.y >= rc.y && pt.y <= rc.y + rc.h) {
      capture(e.pointerId);
      state.selItem = it.id;
      state.selPhoto = it.photoId;
      state.items.splice(i, 1);
      state.items.push(it);
      drag = { mode: 'move', id: it.id, dx: pt.x - rc.x, dy: pt.y - rc.y };
      syncSel();
      renderPhotos();
      draw();
      return;
    }
  }

  state.selItem = null;
  syncSel();
  draw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const L = view.L;
  const word = L.word;
  const it = state.items.find((i) => i.id === drag.id);
  if (!it) return;
  const pt = canvasToPt(e);

  if (drag.mode === 'pan') {
    const p = photoById(it.photoId);
    const rc = itemRect(it, word);
    const s = srcRect(p.img, rc.w, rc.h, it);
    const k = s.sw / rc.w; // source px per pt
    if (s.rx > 0) it.px = Math.min(1, Math.max(0, drag.px - ((pt.x - drag.sx) * k) / s.rx));
    if (s.ry > 0) it.py = Math.min(1, Math.max(0, drag.py - ((pt.y - drag.sy) * k) / s.ry));
  } else if (drag.mode === 'move') {
    it.x = (pt.x - drag.dx - word.bx) / word.bw;
    it.y = (pt.y - drag.dy - word.by) / word.bh;
  } else {
    const d = Math.hypot(pt.x - drag.ox, pt.y - drag.oy);
    const f = Math.max(0.15, d / drag.startDiag);
    it.w = drag.startW * f;
    it.h = drag.startH * f;
  }
  draw();
  syncSel(true);
});

const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------- drag a thumbnail onto the canvas ---------- */

let thumbDrag = null;

let lastTap = { id: null, t: 0 };

/* double click / double tap on a thumbnail: put photo in the middle of the word */
function insertCentered(photo) {
  const L = view.L || layout(ctx);
  if (!L.word) return;
  const r = canvas.getBoundingClientRect();
  const jit = () => (Math.random() - 0.5) * r.width * 0.2;
  dropPhotoAt(photo, { clientX: r.left + r.width / 2 + jit(), clientY: r.top + r.height * 0.5 + jit() * 0.3 });
}

function startThumbDrag(e, photo, el) {
  e.preventDefault();
  const now = Date.now();
  if (lastTap.id === photo.id && now - lastTap.t < 400) {
    lastTap = { id: null, t: 0 };
    state.selPhoto = photo.id;
    insertCentered(photo);
    return;
  }
  state.selPhoto = photo.id;
  state.selItem = null;
  renderPhotos();
  draw();

  thumbDrag = { photo, moved: false, pointerId: e.pointerId };
  ghost.style.backgroundImage = `url(${photo.url})`;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';

  const move = (ev) => {
    if (ev.pointerId !== thumbDrag.pointerId) return;
    thumbDrag.moved = true;
    ghost.hidden = false;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    ghost.hidden = true;
    const r = canvas.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right &&
                   ev.clientY >= r.top && ev.clientY <= r.bottom;
    if (inside) dropPhotoAt(photo, { clientX: ev.clientX, clientY: ev.clientY });
    else if (!thumbDrag.moved) lastTap = { id: photo.id, t: Date.now() };
    thumbDrag = null;
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function dropPhotoAt(photo, e) {
  const L = view.L || layout(ctx);
  if (!L.word) return;
  const word = L.word;
  const pt = canvasToPt(e);
  const A = word.bw / word.bh;
  const w = 0.22;
  const h = (w * A) / photo.aspect;
  const it = { id: uid(), photoId: photo.id,
    x: (pt.x - word.bx) / word.bw - w / 2,
    y: (pt.y - word.by) / word.bh - h / 2, w, h, py: 0.1 };
  state.items.push(it);
  state.selItem = it.id;
  state.selPhoto = photo.id;
  syncSel();
  renderPhotos();
  draw();
}

/* tap on canvas with a chosen photo and nothing hit -> place it there */
canvas.addEventListener('dblclick', (e) => {
  if (!state.selPhoto) return;
  const p = photoById(state.selPhoto);
  if (p) dropPhotoAt(p, e);
});

/* drop image files straight onto the page */
['dragover', 'drop'].forEach((t) => document.addEventListener(t, (e) => {
  e.preventDefault();
  if (t === 'drop' && e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
}));

/* ---------- selected item panel ---------- */

function syncSel(sizeOnly) {
  const box = $('sel');
  const it = state.items.find((i) => i.id === state.selItem);
  if (!it) { box.hidden = true; state.crop = false; return; }
  box.hidden = false;
  const p = photoById(it.photoId);
  $('selName').textContent = p ? p.name : 'Foto';
  $('selSize').value = String(Math.round(it.w * 100));
  $('selZoom').value = String(Math.round((it.zoom || 1) * 100));
  $('selCrop').checked = !!state.crop;
  $('zoomWrap').hidden = !state.crop;
  if (sizeOnly) return;
}

$('selCrop').addEventListener('change', (e) => {
  state.crop = e.target.checked;
  syncSel();
  draw();
});

$('selZoom').addEventListener('input', (e) => {
  const it = state.items.find((i) => i.id === state.selItem);
  if (!it) return;
  it.zoom = Number(e.target.value) / 100;
  draw();
});

$('selSize').addEventListener('input', (e) => {
  const it = state.items.find((i) => i.id === state.selItem);
  if (!it) return;
  const f = Number(e.target.value) / 100 / it.w;
  it.w *= f;
  it.h *= f;
  draw();
});

$('selDel').addEventListener('click', () => {
  state.items = state.items.filter((i) => i.id !== state.selItem);
  state.selItem = null;
  syncSel();
  renderPhotos();
  draw();
});

$('selFront').addEventListener('click', () => {
  const i = state.items.findIndex((x) => x.id === state.selItem);
  if (i < 0) return;
  const [it] = state.items.splice(i, 1);
  state.items.push(it);
  draw();
});

/* ---------- controls ---------- */

for (const [id, key] of [['line1', 'line1'], ['line2', 'line2'], ['line3', 'line3']]) {
  $(id).addEventListener('input', (e) => { state[key] = e.target.value; draw(); });
}
for (const n of [1, 3]) {
  $('tsize' + n).addEventListener('change', (e) => { state['tsize' + n] = e.target.value; draw(); });
}
$('size').addEventListener('change', (e) => { state.size = e.target.value; draw(); });
for (const [id, key] of [['font1', 'font1'], ['font2', 'font2'], ['font3', 'font3']]) {
  $(id).addEventListener('change', (e) => { state[key] = e.target.value; draw(); });
}

$('file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('btnFill').addEventListener('click', autoFill);
$('btnClear').addEventListener('click', () => {
  state.items = [];
  state.selItem = null;
  syncSel();
  renderPhotos();
  draw();
});
$('orient').addEventListener('change', (e) => {
  state.landscape = !e.target.checked;
  draw();
});

window.addEventListener('resize', draw);

/* ---------- PDF export ---------- */

const latin1 = (s) => {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
  return a;
};
const f2 = (n) => (Math.round(n * 100) / 100).toString();

function buildPdf(jpeg, iw, ih, ptW, ptH) {
  const parts = [];
  let len = 0;
  const offsets = [0];
  const push = (d) => {
    const b = typeof d === 'string' ? latin1(d) : d;
    parts.push(b);
    len += b.length;
  };
  const obj = () => offsets.push(len);

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  obj(); push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(); push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(); push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(ptW)} ${f2(ptH)}] ` +
    `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`);

  const content = `q ${f2(ptW)} 0 0 ${f2(ptH)} 0 0 cm /Im0 Do Q\n`;
  obj(); push(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  obj(); push(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');

  const xrefAt = len;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}

async function exportPdf() {
  const dpi = Number($('dpi').value);
  const p = pageSize();
  const pxW = Math.round((p.mmW / 25.4) * dpi);
  const pxH = Math.round((p.mmH / 25.4) * dpi);
  const s = pxW / p.w;

  const out = document.createElement('canvas');
  out.width = pxW;
  out.height = pxH;
  const oc = out.getContext('2d');
  oc.setTransform(s, 0, 0, s, 0, 0);
  render(oc, s, layout(oc));

  const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.94));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = buildPdf(jpeg, pxW, pxH, p.w, p.h);

  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdf);
  a.download = `${(state.line2 || 'poster').replace(/[^\w-]+/g, '_')}-${state.size}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('btnPdf').addEventListener('click', async () => {
  $('busy').hidden = false;
  $('btnPdf').disabled = true;
  try { await exportPdf(); } finally {
    $('busy').hidden = true;
    $('btnPdf').disabled = false;
  }
});

/* ---------- go ---------- */

// browsers restore form values after a reload, so take the dom as truth
for (const k of ['line1', 'line2', 'line3', 'font1', 'font2', 'font3']) state[k] = $(k).value;
state.landscape = !$('orient').checked;
state.size = $('size').value;
state.tsize1 = $('tsize1').value;
state.tsize3 = $('tsize3').value;

loadFonts().then(() => {
  renderPhotos();
  draw();
});
draw();

/* ---------- help modal ---------- */

const help = $('help');
const HELP_KEY = 'photo-letters-hide-help';
const toggleHelp = (on) => {
  help.hidden = !on;
  if (!on) {
    try { $('helpHide').checked ? localStorage.setItem(HELP_KEY, '1') : localStorage.removeItem(HELP_KEY); } catch { /* private mode */ }
  }
};
try { if (!localStorage.getItem(HELP_KEY)) toggleHelp(true); else $('helpHide').checked = true; } catch { toggleHelp(true); }
$('btnInfo').addEventListener('click', () => toggleHelp(true));
$('helpClose').addEventListener('click', () => toggleHelp(false));
help.addEventListener('click', (e) => { if (e.target === help) toggleHelp(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !help.hidden) toggleHelp(false); });
