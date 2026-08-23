/* ---- EM-01 Slime Mold (physarum) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['physarum'] = function (canvas, seed) {
  // Caps: trail grid <= 100k cells (~316x316 equiv), agents <= 28k (~1/3 of cells).
  // 2 sim sub-steps per frame; inner loop is trig-free (headings stored as unit vectors).
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var rng = mulberry32(seed | 0);
  var ctx = canvas.getContext('2d');
  var CELL_CAP = 100000, AGENT_CAP = 28000, TWO_PI = Math.PI * 2;
  var gw = 0, gh = 0, trail = null, tmp = null, img = null, off = null, offCtx = null;
  var N = 0, ax = null, ay = null, adx = null, ady = null;
  var running = false, rafId = 0;
  // Sensing / motion parameters (sensor + rotation angles re-rolled on each reseed).
  var SD = 8, SS = 1.15, DEP = 1.0, DECAY = 0.93, TRAIL_MAX = 3.5, CLAMP = 10;
  var cS = 0, sS = 0, cR = 0, sR = 0;
  function rollParams() {
    var sa = 0.40 + 0.20 * rng();   // sensor angle 0.40-0.60 rad
    var ra = 0.30 + 0.18 * rng();   // rotation angle 0.30-0.48 rad
    SD = 6.5 + 2.5 * rng();         // sensor distance 6.5-9 px
    cS = Math.cos(sa); sS = Math.sin(sa);
    cR = Math.cos(ra); sR = Math.sin(ra);
  }
  // Ember -> amber -> gold -> white-hot color LUT.
  var LUT = new Uint8Array(256 * 3);
  (function () {
    var stops = [[0, 6, 3, 2], [0.16, 56, 16, 5], [0.4, 168, 66, 10],
                 [0.66, 252, 158, 36], [0.85, 255, 212, 104], [1, 255, 250, 226]];
    for (var i = 0; i < 256; i++) {
      var t = i / 255, j = 1;
      while (j < stops.length - 1 && stops[j][0] < t) j++;
      var a = stops[j - 1], b = stops[j], f = (t - a[0]) / (b[0] - a[0]);
      LUT[i * 3] = a[1] + (b[1] - a[1]) * f;
      LUT[i * 3 + 1] = a[2] + (b[2] - a[2]) * f;
      LUT[i * 3 + 2] = a[3] + (b[3] - a[3]) * f;
    }
  })();
  function sample(x, y) {
    var xi = x | 0, yi = y | 0;
    if (xi < 0) xi += gw; else if (xi >= gw) xi -= gw;
    if (yi < 0) yi += gh; else if (yi >= gh) yi -= gh;
    return trail[yi * gw + xi];
  }
  function scatter() {
    var mode = (rng() * 3) | 0, cx = gw * 0.5, cy = gh * 0.5, rad = Math.min(gw, gh);
    for (var i = 0; i < N; i++) {
      var a = rng() * TWO_PI, x, y, h;
      if (mode === 0) {           // uniform scatter
        x = rng() * gw; y = rng() * gh; h = rng() * TWO_PI;
      } else if (mode === 1) {    // orbiting ring
        var r = rad * (0.28 + 0.06 * rng());
        x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r;
        h = a + (rng() < 0.5 ? 1 : -1) * Math.PI * 0.5;
      } else {                    // collapsing core
        var r2 = rad * 0.24 * Math.sqrt(rng());
        x = cx + Math.cos(a) * r2; y = cy + Math.sin(a) * r2;
        h = a + Math.PI;
      }
      ax[i] = x; ay[i] = y; adx[i] = Math.cos(h); ady[i] = Math.sin(h);
    }
  }
  function diffuse() {
    var d = DECAY / 9;
    for (var y = 0; y < gh; y++) {
      var yu = (y === 0 ? gh - 1 : y - 1) * gw, yc = y * gw, yd = (y === gh - 1 ? 0 : y + 1) * gw;
      for (var x = 0; x < gw; x++) {
        var xl = x === 0 ? gw - 1 : x - 1, xr = x === gw - 1 ? 0 : x + 1;
        var v = (trail[yu + xl] + trail[yu + x] + trail[yu + xr] +
                 trail[yc + xl] + trail[yc + x] + trail[yc + xr] +
                 trail[yd + xl] + trail[yd + x] + trail[yd + xr]) * d;
        tmp[yc + x] = v > CLAMP ? CLAMP : v;
      }
    }
    var sw = trail; trail = tmp; tmp = sw;
  }
  function step() {
    if (!trail) return;
    for (var i = 0; i < N; i++) {
      var x = ax[i], y = ay[i], dx = adx[i], dy = ady[i];
      var f = sample(x + dx * SD, y + dy * SD);
      var l = sample(x + (dx * cS - dy * sS) * SD, y + (dy * cS + dx * sS) * SD);
      var r = sample(x + (dx * cS + dy * sS) * SD, y + (dy * cS - dx * sS) * SD);
      var s;
      if (f >= l && f >= r) s = 0;                         // front strongest: hold course
      else if (l > f && r > f) s = rng() < 0.5 ? sR : -sR; // flanked: random turn
      else s = l > r ? sR : -sR;                           // steer toward stronger side
      if (s !== 0) {
        var ndx = dx * cR - dy * s, ndy = dy * cR + dx * s;
        var k = (3 - (ndx * ndx + ndy * ndy)) * 0.5;       // cheap unit renorm
        dx = ndx * k; dy = ndy * k;
      }
      x += dx * SS; y += dy * SS;
      if (x < 0) x += gw; else if (x >= gw) x -= gw;
      if (y < 0) y += gh; else if (y >= gh) y -= gh;
      ax[i] = x; ay[i] = y; adx[i] = dx; ady[i] = dy;
      trail[(y | 0) * gw + (x | 0)] += DEP;
    }
    diffuse();
  }
  function render() {
    if (!trail || !img) return;
    var data = img.data, n = gw * gh, sc = 255 / TRAIL_MAX;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var t = trail[i] * sc, ci = t >= 255 ? 255 : t | 0, k = ci * 3;
      data[j] = LUT[k]; data[j + 1] = LUT[k + 1]; data[j + 2] = LUT[k + 2]; data[j + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }
  function resize() {
    var cw = canvas.clientWidth, chh = canvas.clientHeight;
    if (!cw || !chh) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    var asp = cw / chh;
    var ngw = Math.round(Math.sqrt(CELL_CAP * asp)), ngh = Math.round(ngw / asp);
    if (ngw * ngh > CELL_CAP) {
      var fsc = Math.sqrt(CELL_CAP / (ngw * ngh));
      ngw = Math.floor(ngw * fsc); ngh = Math.floor(ngh * fsc);
    }
    ngw = Math.max(48, Math.min(400, ngw)); ngh = Math.max(48, Math.min(400, ngh));
    if (ngw === gw && ngh === gh) return;
    gw = ngw; gh = ngh;
    var cells = gw * gh;
    trail = new Float32Array(cells); tmp = new Float32Array(cells);
    off = off || document.createElement('canvas');
    off.width = gw; off.height = gh;
    offCtx = off.getContext('2d');
    img = offCtx.createImageData(gw, gh);
    N = Math.min(AGENT_CAP, (cells / 3) | 0);
    ax = new Float32Array(N); ay = new Float32Array(N);
    adx = new Float32Array(N); ady = new Float32Array(N);
    scatter();
  }
  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    step(); step();
    render();
  }
  var api = {
    step: step,
    render: render,
    start: function () {
      if (running) return;
      if (!trail) resize();
      running = true;
      rafId = requestAnimationFrame(loop);
    },
    stop: function () {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    },
    resize: resize,
    perturb: function (nx, ny) {
      if (!trail) return;
      var gx = nx * gw, gy = ny * gh;
      var R = Math.max(3, Math.round(Math.min(gw, gh) * 0.03));
      for (var oy = -R; oy <= R; oy++) {
        for (var ox = -R; ox <= R; ox++) {
          var d2 = ox * ox + oy * oy;
          if (d2 > R * R) continue;
          var xi = (((gx | 0) + ox) % gw + gw) % gw;
          var yi = (((gy | 0) + oy) % gh + gh) % gh;
          var idx = yi * gw + xi, add = 6 * (1 - Math.sqrt(d2) / (R + 1));
          trail[idx] = Math.min(CLAMP, trail[idx] + add);
        }
      }
      var AR = Math.min(gw, gh) * 0.35;
      for (var i = 0; i < N; i++) {
        var vx = gx - ax[i], vy = gy - ay[i];
        var dd = Math.sqrt(vx * vx + vy * vy);
        if (dd < AR && dd > 1) { adx[i] = vx / dd; ady[i] = vy / dd; }
      }
    },
    reseed: function () {
      if (!trail) resize();
      if (!trail) return;
      rollParams();
      trail.fill(0); tmp.fill(0);
      scatter();
    },
    destroy: function () {
      api.stop();
      trail = tmp = img = off = offCtx = ax = ay = adx = ady = null;
      N = 0; gw = gh = 0;
    }
  };
  rollParams();
  resize();
  return api;
};

/* ---- EM-02 Reaction–Diffusion (Gray–Scott model) (reaction) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['reaction'] = function (canvas, seed) {
  'use strict';
  // Gray-Scott reaction-diffusion.
  // Caps: internal grid <= 260x260 (base 200 on the short side), 10 sub-steps per frame.
  // ~40-60k cell updates per sub-step; comfortably 60fps on a 2019 Intel iGPU laptop.
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var rand = mulberry32(seed | 0);
  var ctx = canvas.getContext('2d');
  var Du = 0.16, Dv = 0.08, DT = 1.0, F = 0.037, K = 0.060, SUBSTEPS = 10;
  var gw = 0, gh = 0;
  var U = null, V = null, U2 = null, V2 = null;
  var off = document.createElement('canvas');
  var offCtx = off.getContext('2d');
  var img = null;
  var rafId = 0, running = false;
  var lut = new Uint8Array(256 * 3);

  // Smooth multi-stop ramp: deep teal -> green -> amber -> warm coral (V ~ 0..0.4).
  (function buildLUT() {
    var stops = [
      [0.00,   5,  15,  24],
      [0.28,   8,  82, 100],
      [0.55,  34, 180, 118],
      [0.80, 235, 186,  80],
      [1.00, 255, 104,  92]
    ];
    for (var q = 0; q < 256; q++) {
      var t = q / 255, a = stops[0], b = stops[stops.length - 1];
      for (var s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
      }
      var span = b[0] - a[0] || 1;
      var f = (t - a[0]) / span;
      f = f * f * (3 - 2 * f); // smoothstep within each segment
      lut[q * 3]     = (a[1] + (b[1] - a[1]) * f) | 0;
      lut[q * 3 + 1] = (a[2] + (b[2] - a[2]) * f) | 0;
      lut[q * 3 + 2] = (a[3] + (b[3] - a[3]) * f) | 0;
    }
  })();

  function seedPatches() {
    if (!U) return;
    U.fill(1); V.fill(0);
    var n = 5 + ((rand() * 6) | 0);
    for (var p = 0; p < n; p++) {
      var px = (rand() * gw) | 0, py = (rand() * gh) | 0;
      var s = 3 + ((rand() * 5) | 0);
      for (var y = -s; y <= s; y++) {
        var gy = ((py + y) % gh + gh) % gh;
        for (var x = -s; x <= s; x++) {
          var gx = ((px + x) % gw + gw) % gw;
          V[gy * gw + gx] = 1;
        }
      }
    }
  }

  function resize() {
    var w = canvas.clientWidth | 0, h = canvas.clientHeight | 0;
    if (!w || !h || !off) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    // Grid keeps cells square-ish: 200 on the short side, both axes capped at 260.
    var ngw, ngh, aspect = w / h;
    if (aspect >= 1) { ngh = 200; ngw = Math.min(260, Math.round(200 * aspect)); }
    else { ngw = 200; ngh = Math.min(260, Math.round(200 / aspect)); }
    ngw = Math.max(64, ngw); ngh = Math.max(64, ngh);
    if (ngw !== gw || ngh !== gh) {
      gw = ngw; gh = ngh;
      U = new Float32Array(gw * gh); V = new Float32Array(gw * gh);
      U2 = new Float32Array(gw * gh); V2 = new Float32Array(gw * gh);
      off.width = gw; off.height = gh;
      img = offCtx.createImageData(gw, gh);
      seedPatches();
    }
    ctx.imageSmoothingEnabled = true; // canvas.width reset clears this; soft organic scaling
  }

  function step() {
    if (!U) return;
    var y, x, yn, yp, xn, xp, r, rn, rp, i, u, v, lapU, lapV, uvv, nu, nv;
    for (y = 0; y < gh; y++) {
      yn = y === 0 ? gh - 1 : y - 1;
      yp = y === gh - 1 ? 0 : y + 1;
      r = y * gw; rn = yn * gw; rp = yp * gw;
      for (x = 0; x < gw; x++) {
        xn = x === 0 ? gw - 1 : x - 1;
        xp = x === gw - 1 ? 0 : x + 1;
        i = r + x;
        u = U[i]; v = V[i];
        lapU = -u + 0.2 * (U[rn + x] + U[rp + x] + U[r + xn] + U[r + xp])
                  + 0.05 * (U[rn + xn] + U[rn + xp] + U[rp + xn] + U[rp + xp]);
        lapV = -v + 0.2 * (V[rn + x] + V[rp + x] + V[r + xn] + V[r + xp])
                  + 0.05 * (V[rn + xn] + V[rn + xp] + V[rp + xn] + V[rp + xp]);
        uvv = u * v * v;
        nu = u + (Du * lapU - uvv + F * (1 - u)) * DT;
        nv = v + (Dv * lapV + uvv - (F + K) * v) * DT;
        U2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        V2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    var t = U; U = U2; U2 = t;
    t = V; V = V2; V2 = t;
  }

  function render() {
    if (!V || !img) return;
    var d = img.data, n = gw * gh, i, q, j;
    for (i = 0; i < n; i++) {
      q = (V[i] * 637.5) | 0; // 255 / 0.4
      if (q > 255) q = 255;
      j = i << 2;
      var l = q * 3;
      d[j] = lut[l]; d[j + 1] = lut[l + 1]; d[j + 2] = lut[l + 2]; d[j + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function start() {
    if (running) return;
    running = true;
    var frame = function () {
      if (!running) return;
      for (var i = 0; i < SUBSTEPS; i++) step();
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function perturb(nx, ny) {
    if (!V || !gw) return;
    nx = nx < 0 ? 0 : nx > 1 ? 1 : nx;
    ny = ny < 0 ? 0 : ny > 1 ? 1 : ny;
    var cx = nx * (gw - 1), cy = ny * (gh - 1);
    var rad = Math.max(3, gw * 0.035), r2 = rad * rad;
    var x0 = Math.floor(cx - rad), x1 = Math.ceil(cx + rad);
    var y0 = Math.floor(cy - rad), y1 = Math.ceil(cy + rad);
    for (var y = y0; y <= y1; y++) {
      var gy = ((y % gh) + gh) % gh, dy = y - cy;
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          V[gy * gw + (((x % gw) + gw) % gw)] = 1;
        }
      }
    }
  }

  function reseed() {
    rand(); // advance the stream so successive reseeds always differ
    seedPatches();
  }

  function destroy() {
    stop();
    U = V = U2 = V2 = null;
    img = null; offCtx = null; off = null;
  }

  resize();

  return { step: step, render: render, start: start, stop: stop,
           resize: resize, perturb: perturb, reseed: reseed, destroy: destroy };
};

/* ---- EM-03 Particle Life (particles) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['particles'] = function (canvas, seed) {
  'use strict';
  // Particle Life — CAPS: N = 1300 particles, K = 6 species.
  // Uniform grid bucketing (cell size >= rMax) keeps the force pass
  // O(n * local neighbors); 2 sub-steps per frame.
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var rng = mulberry32(seed | 0);
  var ctx = canvas.getContext('2d');
  var N = 1300, K = 6, BETA = 0.3, FRICTION = 0.88;
  var hues = [352, 38, 95, 165, 205, 280];
  var px = new Float32Array(N), py = new Float32Array(N);
  var vx = new Float32Array(N), vy = new Float32Array(N);
  var sp = new Uint8Array(N);
  var mat = new Float32Array(K * K);
  var W = 0, H = 0, dpr = 1, rMax = 100, forceK = 0.5, vMax = 8;
  var gw = 1, gh = 1, cw = 1, chh = 1;
  var cellCount = null, cellStart = null, cellPtr = null, cellOf = null, order = null;
  var sprites = null;
  var rafId = 0, running = false;

  function randMatrix() {
    for (var i = 0; i < K * K; i++) mat[i] = rng() * 2 - 1;
  }
  function scatter() {
    for (var i = 0; i < N; i++) {
      px[i] = rng() * W; py[i] = rng() * H;
      vx[i] = 0; vy[i] = 0;
      sp[i] = Math.min(K - 1, (rng() * K) | 0);
    }
  }
  function makeSprites() {
    sprites = [];
    for (var s = 0; s < K; s++) {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'hsla(' + hues[s] + ',100%,88%,1)');
      grad.addColorStop(0.25, 'hsla(' + hues[s] + ',100%,62%,0.95)');
      grad.addColorStop(1, 'hsla(' + hues[s] + ',100%,55%,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      sprites.push(c);
    }
  }
  function rebuildGridArrays() {
    gw = Math.max(1, Math.floor(W / rMax));
    gh = Math.max(1, Math.floor(H / rMax));
    cw = W / gw; chh = H / gh;
    cellCount = new Int32Array(gw * gh);
    cellStart = new Int32Array(gw * gh + 1);
    cellPtr = new Int32Array(gw * gh);
    cellOf = new Int32Array(N);
    order = new Int32Array(N);
  }
  function buildGrid() {
    cellCount.fill(0);
    for (var i = 0; i < N; i++) {
      var cx = Math.min(gw - 1, Math.max(0, (px[i] / cw) | 0));
      var cy = Math.min(gh - 1, Math.max(0, (py[i] / chh) | 0));
      var c = cy * gw + cx;
      cellOf[i] = c;
      cellCount[c]++;
    }
    var acc = 0, M = gw * gh;
    for (var c2 = 0; c2 < M; c2++) { cellStart[c2] = acc; cellPtr[c2] = acc; acc += cellCount[c2]; }
    cellStart[M] = acc;
    for (var j = 0; j < N; j++) order[cellPtr[cellOf[j]]++] = j;
  }
  function step() {
    if (!W || !H) return;
    buildGrid();
    var r2max = rMax * rMax, hw = W * 0.5, hh = H * 0.5;
    // On a degenerate grid (< 3 columns/rows) shrink the offset range so the
    // wrapped neighbor scan visits each cell exactly once (no double-counted forces).
    var oxMax = gw > 2 ? 1 : gw - 2, oyMax = gh > 2 ? 1 : gh - 2;
    for (var i = 0; i < N; i++) {
      var fx = 0, fy = 0;
      var xi = px[i], yi = py[i], si = sp[i] * K;
      var cx = Math.min(gw - 1, (xi / cw) | 0), cy = Math.min(gh - 1, (yi / chh) | 0);
      for (var oy = -1; oy <= oyMax; oy++) {
        var ncy = (cy + oy + gh) % gh;
        for (var ox = -1; ox <= oxMax; ox++) {
          var ncx = (cx + ox + gw) % gw;
          var c = ncy * gw + ncx, e = cellStart[c + 1];
          for (var k = cellStart[c]; k < e; k++) {
            var j = order[k];
            if (j === i) continue;
            var dx = px[j] - xi; if (dx > hw) dx -= W; else if (dx < -hw) dx += W;
            var dy = py[j] - yi; if (dy > hh) dy -= H; else if (dy < -hh) dy += H;
            var r2 = dx * dx + dy * dy;
            if (r2 >= r2max || r2 < 1e-6) continue;
            var r = Math.sqrt(r2), x = r / rMax, f;
            if (x < BETA) f = x / BETA - 1;
            else f = mat[si + sp[j]] * (1 - Math.abs(2 * x - 1 - BETA) / (1 - BETA));
            var s = f * forceK / r;
            fx += dx * s; fy += dy * s;
          }
        }
      }
      var nvx = (vx[i] + fx) * FRICTION, nvy = (vy[i] + fy) * FRICTION;
      var v2 = nvx * nvx + nvy * nvy;
      if (v2 > vMax * vMax) { var m = vMax / Math.sqrt(v2); nvx *= m; nvy *= m; }
      vx[i] = nvx; vy[i] = nvy;
    }
    for (var p = 0; p < N; p++) {
      var nx = px[p] + vx[p], ny = py[p] + vy[p];
      if (nx < 0) nx += W; else if (nx >= W) nx -= W;
      if (ny < 0) ny += H; else if (ny >= H) ny -= H;
      // NaN / overshoot safety net (comparison is false for NaN):
      px[p] = (nx >= 0 && nx < W) ? nx : rng() * W;
      py[p] = (ny >= 0 && ny < H) ? ny : rng() * H;
    }
  }
  function render() {
    if (!W || !H || !sprites) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var ds = Math.max(6, 9 * dpr), hd = ds * 0.5;
    for (var i = 0; i < N; i++) ctx.drawImage(sprites[sp[i]], px[i] - hd, py[i] - hd, ds, ds);
    ctx.globalCompositeOperation = 'source-over';
  }
  function resize() {
    var cliW = canvas.clientWidth, cliH = canvas.clientHeight;
    if (!cliW || !cliH) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var nw = Math.max(2, Math.round(cliW * dpr));
    var nh = Math.max(2, Math.round(cliH * dpr));
    var hadSize = W > 0 && H > 0;
    if (hadSize && (nw !== W || nh !== H)) {
      var sx = nw / W, sy = nh / H;
      for (var i = 0; i < N; i++) { px[i] *= sx; py[i] *= sy; }
    }
    canvas.width = nw; canvas.height = nh;
    W = nw; H = nh;
    rMax = Math.min(130, Math.max(50, 0.09 * Math.min(W, H)));
    rMax = Math.max(24, Math.min(rMax, W / 3, H / 3)); // grid >= 3x3 except on tiny canvases (handled in step)
    forceK = rMax * 0.005;
    vMax = rMax * 0.08;
    rebuildGridArrays();
    if (!hadSize) scatter();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
  function perturb(nx, ny) {
    if (!W || !H) return;
    var cxp = nx * W, cyp = ny * H;
    var R = rMax * 2.2, R2 = R * R, hw = W * 0.5, hh = H * 0.5;
    for (var i = 0; i < N; i++) {
      var dx = px[i] - cxp; if (dx > hw) dx -= W; else if (dx < -hw) dx += W;
      var dy = py[i] - cyp; if (dy > hh) dy -= H; else if (dy < -hh) dy += H;
      var r2 = dx * dx + dy * dy;
      if (r2 >= R2 || r2 < 1e-4) continue;
      var r = Math.sqrt(r2), fall = 1 - r / R, s = rMax * 0.08 * fall;
      var ux = dx / r, uy = dy / r;
      vx[i] += ux * s - uy * s * 0.7; // radial blast + swirl
      vy[i] += uy * s + ux * s * 0.7;
    }
  }
  function reseed() {
    randMatrix();
    scatter();
    if (W && H) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  }
  function start() {
    if (running) return;
    running = true;
    var frame = function () {
      if (!running) return;
      step(); step(); // 2 sub-steps per frame
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  function destroy() {
    stop();
    W = 0; H = 0; // step/render become no-ops
    px = py = vx = vy = null; sp = null; mat = null;
    cellCount = cellStart = cellPtr = cellOf = order = null;
    sprites = null;
  }

  makeSprites();
  randMatrix();
  resize(); // scatters on first successful sizing

  return { step: step, render: render, start: start, stop: stop, resize: resize, perturb: perturb, reseed: reseed, destroy: destroy };
};

/* ---- EM-04 Strange Attractor (Clifford / de Jong map) (attractor) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['attractor'] = function (canvas, seed) {
  'use strict';
  // Perf caps: 60,000 map iterations per step(); tone-map is one linear pass over the
  // backing buffer (DPR capped at 1.5) through a 1024-entry packed-color LUT and a
  // 4096-entry log table. Comfortable on a UHD 630-class 2019 laptop.
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rand = mulberry32(seed | 0);
  var ctx = canvas.getContext('2d');
  var POINTS = 60000;
  var W = 0, H = 0;
  var dens = null, img = null, px32 = null;
  var a = 0, b = 0, c = 0, d = 0;
  var x = 0.1, y = 0.1;
  var maxD = 1;
  var running = false, rafId = 0;
  var xmin = -3, xmax = 3, ymin = -3, ymax = 3, sx = 1, sy = 1, ox = 0, oy = 0;

  var isLE = (function () { var buf = new ArrayBuffer(4); new Uint32Array(buf)[0] = 0xff; return new Uint8Array(buf)[0] === 0xff; })();
  function pack(r, g, bl) { return isLE ? (((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0) : (((r << 24) | (g << 16) | (bl << 8) | 255) >>> 0); }
  var BG = pack(8, 7, 24);
  var LUT = new Uint32Array(1024);
  (function () {
    // deep indigo -> electric blue -> cyan -> white
    var stops = [[0, 14, 10, 48], [0.3, 63, 40, 175], [0.6, 34, 150, 228], [0.85, 120, 235, 255], [1, 255, 255, 255]];
    for (var i = 0; i < 1024; i++) {
      var t = i / 1023, k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var s0 = stops[k], s1 = stops[k + 1];
      var f = (t - s0[0]) / (s1[0] - s0[0]); f = f < 0 ? 0 : f > 1 ? 1 : f;
      LUT[i] = pack((s0[1] + (s1[1] - s0[1]) * f) | 0, (s0[2] + (s1[2] - s0[2]) * f) | 0, (s0[3] + (s1[3] - s0[3]) * f) | 0);
    }
  })();
  var logT = new Float32Array(4096);
  (function () { for (var i = 0; i < 4096; i++) logT[i] = Math.log1p(i); })();

  var testGrid = new Uint8Array(48 * 48);
  function qualityTest(pa, pb, pc, pd) {
    // Reject fixed points / short cycles: demand broad coarse-grid coverage and extent.
    testGrid.fill(0);
    var tx = 0.1, ty = 0.1, count = 0;
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (var i = 0; i < 3000; i++) {
      var nx = Math.sin(pa * ty) + pc * Math.cos(pa * tx);
      var ny = Math.sin(pb * tx) + pd * Math.cos(pb * ty);
      tx = nx; ty = ny;
      if (i < 100) continue;
      if (tx < mnx) mnx = tx; if (tx > mxx) mxx = tx;
      if (ty < mny) mny = ty; if (ty > mxy) mxy = ty;
      var gx = (((tx + 3) / 6) * 48) | 0; gx = gx < 0 ? 0 : gx > 47 ? 47 : gx;
      var gy = (((ty + 3) / 6) * 48) | 0; gy = gy < 0 ? 0 : gy > 47 ? 47 : gy;
      var gi = gy * 48 + gx;
      if (!testGrid[gi]) { testGrid[gi] = 1; count++; }
    }
    return { ok: count > 130 && (mxx - mnx) > 1.4 && (mxy - mny) > 1.4, bounds: [mnx, mxx, mny, mxy] };
  }

  function setBounds(bd) {
    var mx = (bd[1] - bd[0]) * 0.06 + 1e-6, my = (bd[3] - bd[2]) * 0.06 + 1e-6;
    xmin = bd[0] - mx; xmax = bd[1] + mx; ymin = bd[2] - my; ymax = bd[3] + my;
    updateTransform();
  }
  function updateTransform() {
    if (!W || !H) return;
    var spanX = xmax - xmin, spanY = ymax - ymin;
    var s = Math.min(W / spanX, H / spanY);
    sx = s; sy = s;
    ox = (W - s * spanX) / 2 - xmin * s;
    oy = (H - s * spanY) / 2 - ymin * s;
  }

  function clearDensity() { if (dens) dens.fill(0); maxD = 1; }

  function pickParams() {
    var t = null;
    for (var tries = 0; tries < 200; tries++) {
      a = rand() * 4 - 2; b = rand() * 4 - 2; c = rand() * 4 - 2; d = rand() * 4 - 2;
      t = qualityTest(a, b, c, d);
      if (t.ok) break;
    }
    setBounds(t.bounds);
    x = rand() * 0.2 - 0.1; y = rand() * 0.2 - 0.1;
  }

  function step() {
    if (!dens || !W) return;
    var la = a, lb = b, lc = c, ld = d, lx = x, ly = y;
    var D = dens, md = maxD, w = W, h = H, ssx = sx, ssy = sy, oox = ox, ooy = oy;
    for (var i = 0; i < POINTS; i++) {
      var nx = Math.sin(la * ly) + lc * Math.cos(la * lx);
      var ny = Math.sin(lb * lx) + ld * Math.cos(lb * ly);
      lx = nx; ly = ny;
      var pxx = (lx * ssx + oox) | 0, pyy = (ly * ssy + ooy) | 0;
      if (pxx >= 0 && pxx < w && pyy >= 0 && pyy < h) {
        var di = pyy * w + pxx, v = D[di] + 1;
        D[di] = v;
        if (v > md) md = v;
      }
    }
    if (isFinite(lx) && isFinite(ly)) { x = lx; y = ly; } else { x = 0.1; y = 0.1; }
    maxD = md;
  }

  function render() {
    if (!img || !W) return;
    var inv = 1023 / Math.log1p(maxD < 1 ? 1 : maxD);
    var D = dens, P = px32, L = LUT, LT = logT, bg = BG, n = W * H;
    for (var i = 0; i < n; i++) {
      var v = D[i];
      if (v === 0) { P[i] = bg; continue; }
      var lg = v < 4096 ? LT[v] : Math.log1p(v);
      var ti = (lg * inv) | 0;
      P[i] = L[ti > 1023 ? 1023 : ti];
    }
    ctx.putImageData(img, 0, 0);
  }

  function resize() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (w === W && h === H && dens) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    dens = new Uint32Array(W * H);
    img = ctx.createImageData(W, H);
    px32 = new Uint32Array(img.data.buffer);
    maxD = 1;
    updateTransform();
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    var frame = function () {
      if (!running) return;
      step();
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function clampP(v) { return v < -2.3 ? -2.3 : v > 2.3 ? 2.3 : v; }

  function perturb(nx, ny) {
    if (typeof nx !== 'number' || typeof ny !== 'number' || !isFinite(nx) || !isFinite(ny)) return;
    var na = clampP(a + (nx - 0.5) * 0.28);
    var nb = clampP(b + (ny - 0.5) * 0.28);
    var nc = clampP(c + (ny - 0.5) * 0.22);
    var nd = clampP(d + (nx - 0.5) * 0.22);
    var t = qualityTest(na, nb, nc, nd);
    if (!t.ok) return; // nudge would collapse the attractor; keep current shape
    a = na; b = nb; c = nc; d = nd;
    setBounds(t.bounds);
    clearDensity();
  }

  function reseed() {
    pickParams();
    clearDensity();
  }

  function destroy() {
    stop();
    dens = null; img = null; px32 = null;
  }

  pickParams();
  resize();

  return { step: step, render: render, start: start, stop: stop, resize: resize, perturb: perturb, reseed: reseed, destroy: destroy };
};

/* ---- EM-05 Dendritic Growth (dla) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['dla'] = function (canvas, seed) {
  'use strict';
  // CAPS: 300x300 grid (90k cells), 600 walkers, 8000 walker-steps per tick.
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var rand = mulberry32(seed | 0);

  var GW = 300, GH = 300, N = GW * GH;
  var cx = GW >> 1, cy = GH >> 1;
  var maxPossible = Math.min(cx, cy) - 2;
  var NW = 600, STEPS = 8000;

  var occ = new Uint8Array(N);      // occupancy
  var age = new Uint32Array(N);     // growth counter at freeze time
  var wx = new Int16Array(NW), wy = new Int16Array(NW);
  var growth = 0, maxR = 0, spawnR = 8, killR = 24, killR2 = killR * killR;

  var ctx = canvas.getContext('2d');
  var off = document.createElement('canvas');
  off.width = GW; off.height = GH;
  var octx = off.getContext('2d');
  var img = octx.createImageData(GW, GH);
  var px = img.data;

  // Frost ramp LUT: deep blue -> azure -> cyan -> white (indexed by relative age)
  var LUT = new Uint8Array(256 * 3);
  (function () {
    var stops = [[8, 24, 80], [25, 85, 190], [80, 200, 255], [240, 252, 255]];
    var pos = [0, 0.38, 0.72, 1];
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < 2 && t > pos[k + 1]) k++;
      var u = (t - pos[k]) / (pos[k + 1] - pos[k]);
      LUT[i * 3]     = stops[k][0] + (stops[k + 1][0] - stops[k][0]) * u;
      LUT[i * 3 + 1] = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * u;
      LUT[i * 3 + 2] = stops[k][2] + (stops[k + 1][2] - stops[k][2]) * u;
    }
  })();

  function stick(x, y) {
    var i = y * GW + x;
    if (occ[i]) return;
    occ[i] = 1;
    age[i] = ++growth;
    var dx = x - cx, dy = y - cy;
    var r = Math.sqrt(dx * dx + dy * dy);
    if (r > maxR) {
      maxR = r;
      spawnR = Math.min(maxR + 8, maxPossible);
      killR = Math.max(spawnR + 16, maxR + 12);
      killR2 = killR * killR;
    }
  }

  function respawn(i) {
    var a = rand() * 6.283185307179586;
    var x = cx + Math.round(Math.cos(a) * spawnR);
    var y = cy + Math.round(Math.sin(a) * spawnR);
    wx[i] = x < 1 ? 1 : (x > GW - 2 ? GW - 2 : x);
    wy[i] = y < 1 ? 1 : (y > GH - 2 ? GH - 2 : y);
  }

  function step() {
    if (!occ) return;
    var wi = 0;
    for (var s = 0; s < STEPS; s++) {
      var i = wi;
      wi = (wi + 1 === NW) ? 0 : wi + 1;
      var x = wx[i], y = wy[i];
      var r = (rand() * 4) | 0;
      if (r === 0) x++; else if (r === 1) x--; else if (r === 2) y++; else y--;
      if (x < 1 || x > GW - 2 || y < 1 || y > GH - 2) { respawn(i); continue; }
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > killR2) { respawn(i); continue; }
      var j = y * GW + x;
      if (occ[j]) { stick(wx[i], wy[i]); respawn(i); continue; }  // stepped onto ice: freeze where it was
      if (occ[j - 1] || occ[j + 1] || occ[j - GW] || occ[j + GW]) { stick(x, y); respawn(i); continue; }
      wx[i] = x; wy[i] = y;
    }
  }

  function render() {
    if (!occ) return;
    var inv = 255 / (growth || 1);
    for (var i = 0, p = 0; i < N; i++, p += 4) {
      if (occ[i]) {
        var t = (age[i] * inv) | 0;
        if (t > 255) t = 255;
        var q = t * 3;
        px[p] = LUT[q]; px[p + 1] = LUT[q + 1]; px[p + 2] = LUT[q + 2]; px[p + 3] = 255;
      } else {
        px[p] = 3; px[p + 1] = 6; px[p + 2] = 18; px[p + 3] = 255;
      }
    }
    // faint specks: the live walkers (never on occupied cells)
    for (var w = 0; w < NW; w++) {
      var pw = (wy[w] * GW + wx[w]) * 4;
      px[pw] = 36; px[pw + 1] = 70; px[pw + 2] = 140;
    }
    octx.putImageData(img, 0, 0);
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.fillStyle = '#030612';
    ctx.fillRect(0, 0, W, H);
    var sc = Math.min(W / GW, H / GH);
    var dw = GW * sc, dh = GH * sc;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  var raf = 0, running = false;
  function frame() {
    if (!running) return;
    step();
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function resize() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    // Grid buffers stay at fixed resolution so the crystal survives resizes;
    // only the canvas backing store is reallocated here.
  }

  function perturb(nx, ny) {
    if (!occ) return;
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    // invert the contain-scaled blit so the seed lands under the pointer
    var sc = Math.min(W / GW, H / GH);
    var gx = Math.round((nx * W - (W - GW * sc) / 2) / sc);
    var gy = Math.round((ny * H - (H - GH * sc) / 2) / sc);
    gx = gx < 1 ? 1 : (gx > GW - 2 ? GW - 2 : gx);
    gy = gy < 1 ? 1 : (gy > GH - 2 ? GH - 2 : gy);
    stick(gx, gy);
  }

  function reseed() {
    if (!occ) return;
    occ.fill(0);
    age.fill(0);
    growth = 0; maxR = 0; spawnR = 8; killR = 24; killR2 = killR * killR;
    rand(); // advance the stream so successive reseeds diverge
    stick(cx, cy);
    for (var i = 0; i < NW; i++) respawn(i);
  }

  function destroy() {
    stop();
    occ = null; age = null; wx = null; wy = null;
    img = null; px = null; octx = null; off = null;
  }

  reseed();
  resize();

  return { step: step, render: render, start: start, stop: stop, resize: resize, perturb: perturb, reseed: reseed, destroy: destroy };
};

/* ---- EM-06 Spiral Waves (cyclic) ---- */
window.PIECES = window.PIECES || {};
window.PIECES['cyclic'] = function (canvas, seed) {
  'use strict';
  // Cyclic cellular automaton (Greenberg-Hastings family): N=14 states,
  // Moore 8-neighborhood, threshold=1, toroidal wrap, double-buffered.
  // CAPS: grid <= 70,000 cells (<= 320 per side), 1 CA step per frame
  // (~0.6M byte compares/frame) -- comfortably smooth on a 2019 UHD630 laptop.
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var rand = mulberry32(seed | 0);
  var N = 14;            // states in the cycle
  var CAP = 70000;       // max cell count
  var ctx = canvas.getContext('2d');
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var gw = 0, gh = 0, grid = null, buf = null, img = null;
  var pal = new Uint8Array(N * 3);
  var rafId = 0, running = false;

  function hslByte(h, s, l, out, o) {
    h = h - Math.floor(h);
    var ch = [0, 8, 4];
    for (var i = 0; i < 3; i++) {
      var k = (ch[i] + h * 12) % 12;
      var a = s * Math.min(l, 1 - l);
      out[o + i] = Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    }
  }
  function buildPalette() {
    var hue0 = rand(); // seed-dependent rotation of the color wheel
    for (var i = 0; i < N; i++) {
      var t = i / N; // smooth cyclic hue ramp; gentle lightness swell adds depth
      hslByte(hue0 + t, 0.95, 0.5 + 0.1 * Math.sin(t * Math.PI * 2), pal, i * 3);
    }
  }

  function randomize() {
    for (var i = 0; i < gw * gh; i++) grid[i] = (rand() * N) | 0;
  }
  function setGrid(w, h) {
    var ng = new Uint8Array(w * h), old = grid, ow = gw, oh = gh;
    gw = w; gh = h; grid = ng; buf = new Uint8Array(w * h);
    if (old && ow > 0) { // nearest-neighbor resample so resize keeps the spirals
      for (var y = 0; y < h; y++) {
        var sy = ((y * oh / h) | 0) * ow;
        for (var x = 0; x < w; x++) ng[y * w + x] = old[sy + ((x * ow / w) | 0)];
      }
    } else randomize();
    off.width = w; off.height = h;
    img = octx.createImageData(w, h);
  }

  function resize() {
    if (!off) return;
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    var w = Math.max(32, Math.min(320, Math.round(Math.sqrt(CAP * cw / ch))));
    var h = Math.max(32, Math.min(320, Math.round(w * ch / cw)));
    while (w * h > CAP) { if (w > h) w--; else h--; }
    if (w !== gw || h !== gh) setGrid(w, h);
  }

  function step() {
    if (!grid) return;
    var g = grid, b = buf, w = gw, h = gh;
    for (var y = 0; y < h; y++) {
      var yc = y * w;
      var ym = (y === 0 ? h - 1 : y - 1) * w;
      var yp = (y === h - 1 ? 0 : y + 1) * w;
      for (var x = 0; x < w; x++) {
        var xm = x === 0 ? w - 1 : x - 1;
        var xp = x === w - 1 ? 0 : x + 1;
        var s = g[yc + x], n = s + 1 === N ? 0 : s + 1;
        // threshold = 1: advance iff ANY Moore neighbor already holds next state
        b[yc + x] = (g[ym + xm] === n || g[ym + x] === n || g[ym + xp] === n ||
                     g[yc + xm] === n || g[yc + xp] === n ||
                     g[yp + xm] === n || g[yp + x] === n || g[yp + xp] === n) ? n : s;
      }
    }
    grid = b; buf = g;
  }

  function render() {
    if (!grid || !img) return;
    var d = img.data, g = grid, n = gw * gh;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var p = g[i] * 3;
      d[j] = pal[p]; d[j + 1] = pal[p + 1]; d[j + 2] = pal[p + 2]; d[j + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function perturb(nx, ny) {
    if (!grid) return;
    nx = Math.min(1, Math.max(0, nx)); ny = Math.min(1, Math.max(0, ny));
    var cx = Math.min(gw - 1, (nx * gw) | 0), cy = Math.min(gh - 1, (ny * gh) | 0);
    var r = Math.max(4, (Math.min(gw, gh) * 0.07) | 0);
    var base = (rand() * N) | 0;
    for (var dy = -r; dy <= r; dy++) {
      var yy = ((cy + dy) % gh + gh) % gh;
      for (var dx = -r; dx <= r; dx++) {
        var d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        var xx = ((cx + dx) % gw + gw) % gw;
        // concentric state rings plus a dash of noise: reliably nucleates spirals
        var s = (base + ((Math.sqrt(d2) * (N / r)) | 0)) % N;
        grid[yy * gw + xx] = rand() < 0.15 ? (rand() * N) | 0 : s;
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    if (!grid) resize();
    var frame = function () {
      if (!running) return;
      if (!grid) resize();
      step();
      render();
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function reseed() {
    buildPalette(); // fresh wheel rotation each reseed
    if (grid) randomize(); else rand();
  }
  function destroy() {
    stop();
    grid = buf = img = null;
    octx = null; off = null;
  }

  buildPalette();
  resize();
  return { step: step, render: render, start: start, stop: stop, resize: resize,
           perturb: perturb, reseed: reseed, destroy: destroy };
};