/*
 * osu! beatmap (.osu) parser + slider path generation + stacking + star estimation.
 * Universal: works in the browser (window.OsuBeatmap) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ------------------------------------------------------------------ parsing
  function parseBeatmap(text) {
    const bm = {
      formatVersion: 14,
      general: { AudioFilename: '', AudioLeadIn: 0, PreviewTime: -1, StackLeniency: 0.7, Mode: 0, SampleSet: 'Normal' },
      metadata: {},
      difficulty: { HPDrainRate: 5, CircleSize: 5, OverallDifficulty: 5, ApproachRate: undefined, SliderMultiplier: 1.4, SliderTickRate: 1 },
      colours: [],
      background: null,
      video: null,
      breaks: [],
      samples: [],
      timingPoints: [],
      hitObjects: [],
    };
    text = text.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);
    let section = '';
    const m0 = /osu file format v(\d+)/.exec(lines[0] || '');
    if (m0) bm.formatVersion = +m0[1];

    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const sec = /^\[(\w+)\]$/.exec(line);
      if (sec) { section = sec[1]; continue; }
      switch (section) {
        case 'General': case 'Metadata': case 'Difficulty': case 'Editor': {
          const i = line.indexOf(':');
          if (i < 0) break;
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim();
          const target = section === 'General' ? bm.general : section === 'Metadata' ? bm.metadata : section === 'Difficulty' ? bm.difficulty : null;
          if (!target) break;
          if (section === 'Metadata') target[k] = v;
          else target[k] = v !== '' && !isNaN(+v) ? +v : v;
          break;
        }
        case 'Colours': {
          const mm = /^Combo(\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(line);
          if (mm) bm.colours[+mm[1] - 1] = [+mm[2], +mm[3], +mm[4]];
          break;
        }
        case 'Events': {
          const parts = line.split(',');
          if (parts[0] === '0' && parts[2] && !bm.background) {
            bm.background = parts[2].replace(/"/g, '').trim();
          } else if ((parts[0] === '1' || parts[0] === 'Video') && parts.length >= 3 && !bm.video) {
            bm.video = parts[2].replace(/"/g, '').trim();
          } else if (parts[0] === '2' || parts[0] === 'Break') {
            bm.breaks.push({ start: +parts[1], end: +parts[2] });
          } else if ((parts[0] === '5' || parts[0] === 'Sample') && parts.length >= 4) {
            const sTime = +parts[1];
            const sFilename = parts[3].replace(/"/g, '').trim();
            const sVol = parts.length >= 5 ? +parts[4] : 100;
            if (!isNaN(sTime) && sFilename) {
              bm.samples.push({ time: sTime, filename: sFilename, volume: isNaN(sVol) ? 100 : sVol });
            }
          }
          break;
        }
        case 'TimingPoints': {
          const p = line.split(',');
          if (p.length < 2) break;
          const beatLength = +p[1];
          bm.timingPoints.push({
            time: +p[0],
            beatLength,
            meter: p[2] !== undefined ? +p[2] : 4,
            sampleSet: p[3] !== undefined ? +p[3] : 0,
            sampleIndex: p[4] !== undefined ? +p[4] : 0,
            volume: p[5] !== undefined ? +p[5] : 100,
            uninherited: p[6] !== undefined ? p[6] === '1' : beatLength > 0,
            kiai: p[7] !== undefined ? (+p[7] & 1) === 1 : false,
          });
          break;
        }
        case 'HitObjects': {
          const ho = parseHitObject(line);
          if (ho) bm.hitObjects.push(ho);
          break;
        }
      }
    }
    if (bm.difficulty.ApproachRate === undefined || bm.difficulty.ApproachRate === '') bm.difficulty.ApproachRate = bm.difficulty.OverallDifficulty;
    bm.timingPoints.sort((a, b) => a.time - b.time);
    bm.hitObjects.sort((a, b) => a.time - b.time);
    bm.samples.sort((a, b) => a.time - b.time);
    bm.timing = new TimingInfo(bm);
    computeDerived(bm);
    bm.mainBpm = mainBpm(bm);
    return bm;
  }

  function parseSampleStr(s) {
    const p = (s || '').split(':');
    return { normalSet: +p[0] || 0, additionSet: +p[1] || 0, index: +p[2] || 0, volume: +p[3] || 0, filename: (p[4] || '').replace(/"/g, '').trim() };
  }

  function parseHitObject(line) {
    const p = line.split(',');
    if (p.length < 4) return null;
    const type = +p[3];
    const o = {
      x: +p[0], y: +p[1], time: +p[2], typeBits: type,
      newCombo: (type & 4) !== 0, comboSkip: (type >> 4) & 7,
      hitSound: +p[4] || 0,
    };
    if (type & 1) {
      o.kind = 'circle';
      o.sample = parseSampleStr(p[5]);
    } else if (type & 2) {
      o.kind = 'slider';
      const cp = p[5].split('|');
      o.curveType = cp[0];
      o.controlPoints = [{ x: o.x, y: o.y }];
      for (let i = 1; i < cp.length; i++) {
        const xy = cp[i].split(':');
        if (xy.length === 2) o.controlPoints.push({ x: +xy[0], y: +xy[1] });
      }
      o.spans = Math.max(1, +p[6] || 1);
      o.pixelLength = +p[7] || 0;
      const es = p[8] ? p[8].split('|').map(Number) : [];
      const ess = p[9] ? p[9].split('|').map(s => { const q = s.split(':'); return { normalSet: +q[0] || 0, additionSet: +q[1] || 0 }; }) : [];
      o.edgeSounds = []; o.edgeSets = [];
      for (let i = 0; i <= o.spans; i++) {
        o.edgeSounds.push(es[i] !== undefined ? es[i] : o.hitSound);
        o.edgeSets.push(ess[i] || { normalSet: 0, additionSet: 0 });
      }
      o.sample = parseSampleStr(p[10]);
    } else if (type & 8) {
      o.kind = 'spinner';
      o.endTime = +p[5];
      o.sample = parseSampleStr(p[6]);
      o.x = 256; o.y = 192;
    } else {
      return null; // mania hold notes etc.
    }
    return o;
  }

  // ------------------------------------------------------------------ timing
  class TimingInfo {
    constructor(bm) {
      this.points = bm.timingPoints;
      this.sm = bm.difficulty.SliderMultiplier;
      this.defaultSet = { normal: 1, soft: 2, drum: 3 }[String(bm.general.SampleSet).toLowerCase()] || 1;
      this.firstUninherited = this.points.find(p => p.uninherited) || { beatLength: 500, time: 0, meter: 4 };
    }
    /** index of the last point with time <= t (or 0) */
    _idx(t) {
      const pts = this.points;
      let lo = 0, hi = pts.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return ans;
    }
    at(t) {
      const pts = this.points;
      if (!pts.length) return { beatLength: 500, sv: 1, sampleSet: this.defaultSet, sampleIndex: 0, volume: 100, kiai: false, meter: 4, beatOffset: 0 };
      const i = this._idx(t);
      let unin = null;
      for (let j = i; j >= 0; j--) if (pts[j].uninherited) { unin = pts[j]; break; }
      if (!unin) unin = this.firstUninherited;
      const cur = pts[i];
      const sv = !cur.uninherited && cur.beatLength < 0 ? clamp(-100 / cur.beatLength, 0.1, 10) : 1;
      return {
        beatLength: unin.beatLength, beatOffset: unin.time, meter: unin.meter, sv,
        sampleSet: cur.sampleSet || this.defaultSet, sampleIndex: cur.sampleIndex, volume: cur.volume, kiai: cur.kiai,
      };
    }
  }

  function mainBpm(bm) {
    const un = bm.timingPoints.filter(p => p.uninherited);
    if (!un.length) return 120;
    const end = bm.hitObjects.length ? bm.hitObjects[bm.hitObjects.length - 1].endTime : un[un.length - 1].time;
    const dur = new Map();
    for (let i = 0; i < un.length; i++) {
      const next = i + 1 < un.length ? un[i + 1].time : Math.max(end, un[i].time);
      const bl = Math.round(un[i].beatLength * 1000) / 1000;
      dur.set(bl, (dur.get(bl) || 0) + Math.max(0, next - (i === 0 ? Math.min(un[i].time, 0) : un[i].time)));
    }
    let best = un[0].beatLength, bd = -1;
    for (const [bl, d] of dur) if (d > bd) { bd = d; best = bl; }
    return 60000 / best;
  }

  // ------------------------------------------------------------------ curves
  function bezierPoints(cps) {
    if (cps.length === 1) return [{ ...cps[0] }];
    if (cps.length === 2) return [{ ...cps[0] }, { ...cps[1] }];
    let poly = 0;
    for (let i = 1; i < cps.length; i++) poly += dist(cps[i - 1], cps[i]);
    const steps = clamp(Math.ceil(poly / 2.5), 10, 1000);
    const out = [];
    const n = cps.length;
    const tmpX = new Float64Array(n), tmpY = new Float64Array(n);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      for (let i = 0; i < n; i++) { tmpX[i] = cps[i].x; tmpY[i] = cps[i].y; }
      for (let k = n - 1; k > 0; k--) {
        for (let i = 0; i < k; i++) {
          tmpX[i] += (tmpX[i + 1] - tmpX[i]) * t;
          tmpY[i] += (tmpY[i + 1] - tmpY[i]) * t;
        }
      }
      out.push({ x: tmpX[0], y: tmpY[0] });
    }
    return out;
  }

  function perfectPoints(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-3) return null;
    const aSq = a.x * a.x + a.y * a.y, bSq = b.x * b.x + b.y * b.y, cSq = c.x * c.x + c.y * c.y;
    const cx = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d;
    const cy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d;
    const r = Math.hypot(a.x - cx, a.y - cy);
    if (!isFinite(r) || r > 1e5) return null;
    const t0 = Math.atan2(a.y - cy, a.x - cx);
    let t1 = Math.atan2(c.y - cy, c.x - cx);
    while (t1 < t0) t1 += TAU;
    let dir = 1, range = t1 - t0;
    const ox = c.y - a.y, oy = -(c.x - a.x);
    if (ox * (b.x - a.x) + oy * (b.y - a.y) < 0) { dir = -1; range = TAU - range; }
    const n = range * r < 0.1 ? 2 : Math.max(2, Math.ceil(range * r / 2));
    const out = [];
    for (let i = 0; i < n; i++) {
      const th = t0 + dir * (i / (n - 1)) * range;
      out.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r });
    }
    return out;
  }

  function catmullPoints(cps) {
    const out = [];
    for (let i = 0; i < cps.length - 1; i++) {
      const v1 = i > 0 ? cps[i - 1] : cps[i];
      const v2 = cps[i];
      const v3 = cps[i + 1];
      const v4 = i < cps.length - 2 ? cps[i + 2] : { x: 2 * v3.x - v2.x, y: 2 * v3.y - v2.y };
      for (let c = 0; c < 50; c++) {
        const t = c / 50, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * v2.x + (-v1.x + v3.x) * t + (2 * v1.x - 5 * v2.x + 4 * v3.x - v4.x) * t2 + (-v1.x + 3 * v2.x - 3 * v3.x + v4.x) * t3),
          y: 0.5 * (2 * v2.y + (-v1.y + v3.y) * t + (2 * v1.y - 5 * v2.y + 4 * v3.y - v4.y) * t2 + (-v1.y + 3 * v2.y - 3 * v3.y + v4.y) * t3),
        });
      }
    }
    out.push({ ...cps[cps.length - 1] });
    return out;
  }

  /** Build a SliderPath: polyline trimmed/extended to expected length. */
  function buildPath(type, cps, expectedLength) {
    let pts = [];
    if (type === 'L') {
      pts = cps.map(p => ({ ...p }));
    } else if (type === 'P' && cps.length === 3) {
      pts = perfectPoints(cps[0], cps[1], cps[2]) || bezierPoints(cps);
    } else if (type === 'C') {
      pts = catmullPoints(cps);
    } else {
      let seg = [cps[0]];
      for (let i = 1; i < cps.length; i++) {
        const p = cps[i];
        const prev = cps[i - 1];
        if (p.x === prev.x && p.y === prev.y) {
          if (seg.length > 1) { const b = bezierPoints(seg); if (pts.length) b.shift(); pts.push(...b); }
          seg = [p];
        } else seg.push(p);
      }
      if (seg.length > 1) { const b = bezierPoints(seg); if (pts.length) b.shift(); pts.push(...b); }
      if (!pts.length) pts = [{ ...cps[0] }];
    }
    const clean = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (dist(pts[i], clean[clean.length - 1]) > 1e-6) clean.push(pts[i]);
    pts = clean;
    let cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    let total = cum[cum.length - 1];
    const L = expectedLength > 0 ? expectedLength : total;
    if (pts.length === 1) {
      pts.push({ x: pts[0].x + L, y: pts[0].y }); cum.push(L); total = L;
    }
    if (total > L) {
      let i = 1;
      while (i < cum.length && cum[i] < L) i++;
      const a = pts[i - 1], b = pts[i];
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 0 ? (L - cum[i - 1]) / segLen : 0;
      pts = pts.slice(0, i);
      cum = cum.slice(0, i);
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      cum.push(L);
    } else if (total < L) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const segLen = dist(a, b);
      if (segLen > 0) {
        const ext = L - total;
        b.x += (b.x - a.x) / segLen * ext;
        b.y += (b.y - a.y) / segLen * ext;
        cum[cum.length - 1] = L;
      }
    }
    return new SliderPath(pts, cum);
  }

  class SliderPath {
    constructor(points, cum) {
      this.points = points;
      this.cum = cum;
      this.length = cum[cum.length - 1];
    }
    /** position at distance d along the path */
    at(d) {
      const { points, cum } = this;
      if (d <= 0) return { x: points[0].x, y: points[0].y };
      if (d >= this.length) { const p = points[points.length - 1]; return { x: p.x, y: p.y }; }
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
      const a = points[lo], b = points[hi];
      const seg = cum[hi] - cum[lo];
      const t = seg > 0 ? (d - cum[lo]) / seg : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    /** points of the path between distance d0 and d1 (for snaking) */
    slice(d0, d1) {
      const out = [this.at(d0)];
      for (let i = 0; i < this.cum.length; i++) if (this.cum[i] > d0 && this.cum[i] < d1) out.push(this.points[i]);
      out.push(this.at(d1));
      return out;
    }
  }

  // ------------------------------------------------------------------ derived data (end times etc)
  function computeDerived(bm) {
    const timing = bm.timing;
    const sm = bm.difficulty.SliderMultiplier;
    const tickRate = bm.difficulty.SliderTickRate;
    for (const o of bm.hitObjects) {
      if (o.kind === 'circle') o.endTime = o.time;
      else if (o.kind === 'slider') {
        const tp = timing.at(o.time);
        o.beatLength = tp.beatLength;
        o.sv = tp.sv;
        const pxPerBeat = 100 * sm * tp.sv;
        o.velocity = pxPerBeat / tp.beatLength; // osu!px per ms
        const len = o.pixelLength > 0 ? o.pixelLength : 100;
        o.spanDuration = len / o.velocity;
        o.endTime = o.time + o.spanDuration * o.spans;
        o.tickDistance = bm.formatVersion < 8 ? pxPerBeat / tickRate / tp.sv : pxPerBeat / tickRate;
      }
    }
  }

  /** Expensive per-play data: paths, ticks, stacking. */
  function preparePlay(bm, opts) {
    const flip = !!(opts && opts.flipY);
    const radius = opts.radius;
    const objs = bm.hitObjects.map((src, index) => {
      const o = Object.assign({}, src);
      o.index = index;
      if (flip) o.y = 384 - o.y;
      o.stackHeight = 0;
      if (o.kind === 'slider') {
        const cps = src.controlPoints.map(p => ({ x: p.x, y: flip ? 384 - p.y : p.y }));
        o.path = buildPath(src.curveType, cps, src.pixelLength);
        const L = o.path.length;
        const end = o.path.at(L);
        o.endPos = o.spans % 2 === 1 ? end : { x: o.x, y: o.y };
        o.nested = [];
        const minFromEnd = o.velocity * 10;
        const tickDist = o.tickDistance;
        const tickDs = [];
        if (tickDist > 0 && isFinite(tickDist) && L / tickDist < 1000) {
          for (let d = tickDist; d < L - minFromEnd; d += tickDist) tickDs.push(d);
        }
        for (let s = 0; s < o.spans; s++) {
          const spanStart = o.time + s * o.spanDuration;
          const ds = s % 2 === 0 ? tickDs : tickDs.slice().reverse();
          for (const d of ds) {
            const along = d;
            const tProg = s % 2 === 0 ? d / L : (L - d) / L;
            const p = o.path.at(along);
            o.nested.push({ kind: 'tick', time: spanStart + tProg * o.spanDuration, x: p.x, y: p.y, span: s });
          }
          if (s < o.spans - 1) {
            const p = s % 2 === 0 ? end : { x: o.x, y: o.y };
            o.nested.push({ kind: 'repeat', time: spanStart + o.spanDuration, x: p.x, y: p.y, span: s, edge: s + 1 });
          }
        }
        const tailCheck = Math.max(o.time + (o.endTime - o.time) / 2, o.endTime - 36);
        o.nested.push({ kind: 'tail', time: tailCheck, x: o.endPos.x, y: o.endPos.y, span: o.spans - 1, edge: o.spans });
        o.nested.sort((a, b) => a.time - b.time);
      }
      return o;
    });
    applyStacking(objs, opts.preempt * bm.general.StackLeniency);
    for (const o of objs) {
      const off = -o.stackHeight * radius / 10;
      o.ox = off; o.oy = off;
    }
    let comboIndex = -1, comboNumber = 0, prevSpinner = true;
    for (const o of objs) {
      if (o.newCombo || prevSpinner) { comboIndex += 1 + o.comboSkip; comboNumber = 0; }
      comboNumber++;
      o.comboIndex = Math.max(0, comboIndex);
      o.comboNumber = comboNumber;
      prevSpinner = o.kind === 'spinner';
    }
    return objs;
  }

  function applyStacking(objs, stackThreshold) {
    const STACK_DIST = 3;
    const endPos = o => (o.kind === 'slider' ? o.endPos : o);
    for (let i = objs.length - 1; i > 0; i--) {
      let n = i;
      let oi = objs[i];
      if (oi.stackHeight !== 0 || oi.kind === 'spinner') continue;
      if (oi.kind === 'circle') {
        while (--n >= 0) {
          const on = objs[n];
          if (on.kind === 'spinner') continue;
          if (oi.time - on.endTime > stackThreshold) break;
          if (on.kind === 'slider' && dist(endPos(on), oi) < STACK_DIST) {
            const offset = oi.stackHeight - on.stackHeight + 1;
            for (let j = n + 1; j <= i; j++) {
              const oj = objs[j];
              if (dist(endPos(on), oj) < STACK_DIST) oj.stackHeight -= offset;
            }
            break;
          }
          if (dist(on, oi) < STACK_DIST) {
            on.stackHeight = oi.stackHeight + 1;
            oi = on;
          }
        }
      } else if (oi.kind === 'slider') {
        while (--n >= 0) {
          const on = objs[n];
          if (on.kind === 'spinner') continue;
          if (oi.time - on.time > stackThreshold) break;
          if (dist(endPos(on), oi) < STACK_DIST) {
            on.stackHeight = oi.stackHeight + 1;
            oi = on;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ star estimation (osu!std)
  function estimateStars(bm) {
    const objs = bm.hitObjects;
    if (!objs || objs.length < 2) return 1.0;
    let aim = 0, speed = 0;
    const decayAim = 0.15, decaySpd = 0.3;
    const strains = [];
    let winEnd = objs[0].time + 400, peak = 0;
    for (let i = 1; i < objs.length; i++) {
      const a = objs[i - 1], b = objs[i];
      const dt = Math.max(25, b.time - a.time);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      aim = aim * Math.pow(decayAim, dt / 1000) + Math.pow(d, 0.99) / dt * 26;
      speed = speed * Math.pow(decaySpd, dt / 1000) + (b.kind === 'spinner' ? 0 : 1400 / Math.pow(dt, 0.95));
      peak = Math.max(peak, Math.sqrt(aim) * 1.05 + Math.sqrt(speed) * 0.85);
      if (b.time >= winEnd) {
        strains.push(peak);
        peak = (Math.sqrt(aim) * 1.05 + Math.sqrt(speed) * 0.85) * 0.7;
        winEnd = b.time + 400;
      }
    }
    strains.sort((x, y) => y - x);
    let total = 0, w = 1;
    for (const s of strains) { total += s * w; w *= 0.9; }
    return Math.max(0.5, +(total * 0.032 * (0.85 + 0.03 * (bm.difficulty.CircleSize || 4))).toFixed(2));
  }

  // ------------------------------------------------------------------ difficulty helpers
  function arToPreempt(ar) {
    return ar < 5 ? 1200 + 600 * (5 - ar) / 5 : 1200 - 750 * (ar - 5) / 5;
  }
  function csToRadius(cs) { return 54.4 - 4.48 * cs; }
  function odWindows(od) { return { w300: 80 - 6 * od, w100: 140 - 8 * od, w50: 200 - 10 * od }; }

  const api = { parseBeatmap, preparePlay, buildPath, estimateStars, arToPreempt, csToRadius, odWindows, clamp, dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OsuBeatmap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
