/*
 * osu!standard gameplay engine for Web-Mania-Next
 * Ported from std/public/js/game.js and adapted for unified HUD, replay, BGA & audio.
 */
(function () {
  'use strict';
  const B = window.OsuBeatmap;
  const { clamp } = B;
  const TAU = Math.PI * 2;
  const DEFAULT_COLOURS = [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]];
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (c, d, t) => [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t)];
  const STD_JUDGE_STYLES = { geki: ['#8ef', '激'], katu: ['#7f7', '喝'], '300': ['#8cf', '300'], '100': ['#7f7', '100'], '50': ['#fc6', '50'], miss: ['#f44', '✕'] };

  class OsuStdEngine {
    /**
     * @param {object} o {canvas, audio, beatmap (parsed), musicBuffer, stars, leaderboard, isReplay, replayEvents, onEnd(result)}
     */
    constructor(o) {
      Object.assign(this, o);
      this.audioCtx = this.audio.ctx;
      this.masterGain = this.audio.master;
      this.musicGain = this.audio.musicGain;
      this.sfxGain = this.audio.sfxGain;

      const d = this.beatmap.difficulty;
      this.cs = d.CircleSize;
      this.ar = d.ApproachRate;
      this.od = d.OverallDifficulty;
      this.hpRating = d.HPDrainRate;
      this.rate = 1;
      this.radius = B.csToRadius(this.cs);
      this.preempt = B.arToPreempt(this.ar);
      this.fadeIn = 400 * Math.min(1, this.preempt / 450);
      this.win = B.odWindows(this.od);
      this.colours = this.beatmap.colours.filter(Boolean).length ? this.beatmap.colours.filter(Boolean) : DEFAULT_COLOURS;
      this.objects = B.preparePlay(this.beatmap, { radius: this.radius, preempt: this.preempt, flipY: false });
      this.timing = this.beatmap.timing;
      this.breaks = this.beatmap.breaks || [];
      this.mapSamples = (this.beatmap.samples || []).slice().sort((a, b) => a.time - b.time);

      // spinner requirements
      const spinsPerSec = this.od < 5 ? lerp(3, 5, this.od / 5) : lerp(5, 7.5, (this.od - 5) / 5);
      for (const ob of this.objects) {
        if (ob.kind === 'spinner') ob.required = Math.max(1, Math.floor((ob.endTime - ob.time) / 1000 * spinsPerSec * 0.5));
      }

      // score V1 multipliers (uses un-modded values like stable)
      const first = this.objects[0], last = this.objects[this.objects.length - 1];
      this.firstTime = first ? first.time : 0;
      this.lastTime = last ? last.endTime : 0;
      let drain = (this.lastTime - this.firstTime) - this.breaks.reduce((s, b) => s + (b.end - b.start), 0);
      drain = Math.max(1, drain / 1000);
      this.diffMult = Math.round((d.HPDrainRate + d.CircleSize + d.OverallDifficulty + clamp(this.objects.length / drain * 8, 0, 16)) / 38 * 5);
      this.modMult = 1;

      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this.fpsUpdateTime = 0;

      this.reset();
      this._bind();
      this._resize();
    }

    reset() {
      for (const o of this.objects) {
        o.judged = false; o.result = -1; o.hitTime = 0; o.shake = -1e9;
        if (o.kind === 'slider') {
          o.headJudged = false; o.headResult = 0; o.tracking = false; o.trackStart = -1e9; o.trackEnd = -1e9;
          o.nestedIdx = 0; o.hitCount = 0; o.cache = null; o.cacheProg = -1;
          for (const n of o.nested) { n.hit = null; }
        }
        if (o.kind === 'spinner') { o.rotation = 0; o.visualRot = 0; o.lastAngle = null; o.spins = 0; o.bonus = 0; o.rpmHist = []; }
      }
      this.score = 0; this.combo = 0; this.maxCombo = 0;
      this.counts = { 300: 0, 100: 0, 50: 0, 0: 0, geki: 0, katu: 0, sliderBreaks: 0 };
      this.hp = 1; this.failed = false; this.finished = false;
      this.effects = []; this.judgeTexts = []; this.errors = []; this.allErrors = [];
      this.events = []; this.held = new Set(); this.keyCounts = { K1: 0, K2: 0, M1: 0, M2: 0 };
      this.firstIdx = 0; this.lastStep = null; this.lastClock = -Infinity;
      this.trail = []; this.cursor = this.cursor || { x: 256, y: 192 };
      this.paused = false; this.isPaused = false; this.isRunning = false; this.pauseTime = 0;
      this.comboPerfect = true; this.comboKatu = true;
      this.startTime = Math.min(0, -this.beatmap.general.AudioLeadIn, this.firstTime - this.preempt - 1200);
      this.endAt = this.lastTime + 1500;
      this.nextSampleIdx = 0;
      this.inBreakVisual = false;
      this.recordedEvents = [];
      this.lastMoveRecordTime = -Infinity;
      this.replayIdx = 0;
      this.state = {
        failed: false,
        scoreV2: 0,
        combo: 0,
        acc: 100
      };
    }

    // ============================================================ clock & audio
    _ctxNow() {
      const ctx = this.audio.ctx;
      if (ctx.getOutputTimestamp) {
        const ts = ctx.getOutputTimestamp();
        if (ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
      return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    }
    now() {
      if (this.paused || this.failed) return this.pauseTime;
      const offset = (typeof userSettings !== 'undefined' && userSettings.offset) ? userSettings.offset : 0;
      const t = (this._ctxNow() - this.t0) * 1000 * this.rate - offset * this.rate;
      this.lastClock = Math.max(this.lastClock, t);
      return this.lastClock;
    }
    getTime() {
      return this.now();
    }
    _startMusicAt(mapTime) {
      const ctx = this.audio.ctx;
      if (this.src) { try { this.src.stop(); } catch (e) { /* ignore */ } this.src.disconnect(); }
      const src = ctx.createBufferSource();
      src.buffer = this.musicBuffer;
      src.playbackRate.value = this.rate;
      src.connect(this.audio.musicGain);
      const at = ctx.currentTime + 0.06;
      if (mapTime >= 0) { src.start(at, mapTime / 1000); this.t0 = at - mapTime / 1000 / this.rate; }
      else { src.start(at - mapTime / 1000 / this.rate, 0); this.t0 = at - mapTime / 1000 / this.rate; }
      this.src = src;
      this.lastClock = mapTime - 100;

      // Sync storyboard sample index
      this.nextSampleIdx = 0;
      while (this.nextSampleIdx < this.mapSamples.length && this.mapSamples[this.nextSampleIdx].time < mapTime) {
        this.nextSampleIdx++;
      }

      // Sync video player if present
      if (window.videoPlayer) {
        const decoderVideo = document.getElementById('decoder-video');
        if (decoderVideo && decoderVideo.src && mapTime > 0) {
          try { decoderVideo.currentTime = mapTime / 1000; } catch (e) {}
        }
        window.videoPlayer.play();
      }
    }
    start() {
      this.reset();
      window.isStdGameplayActive = true;
      const customCursor = document.getElementById('wmn-custom-cursor');
      if (customCursor) customCursor.style.display = 'none';
      this.audio.resume().then(() => {
        this._startMusicAt(this.startTime);
        this.running = true;
        this.isRunning = true;
        this._raf = requestAnimationFrame(this._frame);
      });
    }
    skip() {
      const target = this.firstTime - this.preempt - 1200;
      if (this.now() < target - 500) this._startMusicAt(target);
    }
    pause() {
      if (this.paused || this.finished || this.failed) return;
      this.pauseTime = this.now();
      this.paused = true;
      this.isPaused = true;
      window.isStdGameplayActive = false;
      this.audio.ctx.suspend();
      if (window.videoPlayer) window.videoPlayer.pause();

      const pauseScreen = document.getElementById('pause-screen');
      if (pauseScreen) pauseScreen.classList.add('active');
      const pauseTitle = document.getElementById('pause-title');
      if (pauseTitle) pauseTitle.style.display = 'block';
      const pauseBtns = document.getElementById('pause-buttons');
      if (pauseBtns) pauseBtns.style.display = 'flex';
      const countdownText = document.getElementById('pause-countdown-text');
      if (countdownText) countdownText.style.display = 'none';
    }
    resumeFromCountdown() {
      if (!this.paused) return;
      this.audio.ctx.resume().then(() => {
        this.paused = false;
        this.isPaused = false;
        this.lastClock = this.pauseTime;
        window.isStdGameplayActive = true;
        const customCursor = document.getElementById('wmn-custom-cursor');
        if (customCursor) customCursor.style.display = 'none';
        if (window.videoPlayer && typeof window.videoPlayer.play === 'function') {
          window.videoPlayer.play();
        }
      });
    }
    quit() {
      this.destroy();
    }
    destroy() {
      this.running = false;
      this.isRunning = false;
      window.isStdGameplayActive = false;
      if (window.onWmnCursorMove === this._onWmnMove) {
        window.onWmnCursorMove = null;
      }
      cancelAnimationFrame(this._raf);
      if (this.src) {
        try { this.src.stop(); } catch (e) { /* ignore */ }
        try { this.src.disconnect(); } catch (e) { /* ignore */ }
      }
      this._unbind();
      if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume().catch(() => {});
    }

    // ============================================================ input
    _updateCursorFromScreen(clientX, clientY) {
      if (this.paused || this.failed || this.isReplay) return;
      this.cursor = this.toField(clientX, clientY);
      if (this.running) {
        const t = this.now();
        if (t - this.lastMoveRecordTime >= 8) {
          this.lastMoveRecordTime = t;
          this.recordedEvents.push({ type: 'move', time: t, x: Math.round(this.cursor.x * 10) / 10, y: Math.round(this.cursor.y * 10) / 10 });
        }
      }
    }

    _bind() {
      this._frame = this._frame.bind(this);
      this._onWmnMove = (cx, cy) => this._updateCursorFromScreen(cx, cy);
      window.onWmnCursorMove = this._onWmnMove;

      this._onMove = e => {
        if (document.pointerLockElement) return;
        this._updateCursorFromScreen(e.clientX, e.clientY);
      };
      this._onDown = e => {
        if (this.paused || this.failed) return;
        const u = Math.max(0.6, this.H / 900);
        const cx = document.pointerLockElement ? (this.cursor.x * this.scale + this.offX) : e.clientX;
        const cy = document.pointerLockElement ? (this.cursor.y * this.scale + this.offY) : e.clientY;
        if (e.button === 0 && this.now() < this.firstTime - this.preempt - 1700 &&
            cx >= this.W - 200 * u && cx <= this.W - 20 * u &&
            cy >= this.H - 110 * u && cy <= this.H - 60 * u) {
          this.skip();
          return;
        }
        if (this.isReplay) return;
        const k = e.button === 0 ? 'M1' : e.button === 2 ? 'M2' : null;
        if (!k || (typeof userSettings !== 'undefined' && userSettings.disableClick)) return;
        if (!document.pointerLockElement) {
          this._updateCursorFromScreen(e.clientX, e.clientY);
        }
        this._press(k);
      };
      this._onUp = e => {
        if (this.isReplay) return;
        const k = e.button === 0 ? 'M1' : e.button === 2 ? 'M2' : null;
        if (k) this._release(k);
      };
      this._onKeyDown = e => {
        if (e.code === 'Space') { e.preventDefault(); this.skip(); return; }
        if (e.repeat || this.paused || this.failed || this.isReplay) return;
        const keys = (typeof userSettings !== 'undefined' && userSettings.stdKeyBinds) ? userSettings.stdKeyBinds : ['KeyZ', 'KeyX'];
        const k = e.code === keys[0] ? 'K1' : e.code === keys[1] ? 'K2' : null;
        if (k) { e.preventDefault(); this._press(k); }
      };
      this._onKeyUp = e => {
        if (this.isReplay) return;
        const keys = (typeof userSettings !== 'undefined' && userSettings.stdKeyBinds) ? userSettings.stdKeyBinds : ['KeyZ', 'KeyX'];
        const k = e.code === keys[0] ? 'K1' : e.code === keys[1] ? 'K2' : null;
        if (k) this._release(k);
      };
      this._onCtx = e => e.preventDefault();
      this._onResize = () => this._resize();
      this._onBlurFocus = () => {
        if (!this.masterGain || !this.masterGain.gain) return;
        const mVol = (typeof userSettings !== 'undefined' && userSettings.masterVol !== undefined ? userSettings.masterVol : 100) / 100;
        const bgVol = (typeof userSettings !== 'undefined' && userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
        const targetVol = document.hasFocus() ? mVol : bgVol;
        try {
          if (this.audioCtx && this.audioCtx.state === 'running') {
            this.masterGain.gain.setTargetAtTime(targetVol, this.audioCtx.currentTime, 0.2);
          } else {
            this.masterGain.gain.value = targetVol;
          }
        } catch (e) {}
      };
      window.addEventListener('pointermove', this._onMove);
      this.canvas.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointerup', this._onUp);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('contextmenu', this._onCtx);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('blur', this._onBlurFocus);
      window.addEventListener('focus', this._onBlurFocus);
    }
    _unbind() {
      window.removeEventListener('pointermove', this._onMove);
      this.canvas.removeEventListener('pointerdown', this._onDown);
      window.removeEventListener('pointerup', this._onUp);
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('contextmenu', this._onCtx);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('blur', this._onBlurFocus);
      window.removeEventListener('focus', this._onBlurFocus);
    }
    _press(k, forcedTime = null, fx = null, fy = null) {
      if (this.held.has(k)) return;
      this.held.add(k);
      this.keyCounts[k] = (this.keyCounts[k] || 0) + 1;
      const t = forcedTime !== null ? forcedTime : this.now();
      const x = fx !== null ? fx : this.cursor.x;
      const y = fy !== null ? fy : this.cursor.y;
      this.events.push({ time: t, x, y, down: true });
      if (!this.isReplay && forcedTime === null) {
        this.recordedEvents.push({ type: 'down', key: k, time: t, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      }
    }
    _release(k, forcedTime = null) {
      this.held.delete(k);
      if (!this.isReplay && forcedTime === null) {
        this.recordedEvents.push({ type: 'up', key: k, time: this.now() });
      }
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.dpr = dpr; this.W = w; this.H = h;
      this.scale = Math.min(h * 0.8 / 384, w * 0.8 / 512);
      this.offX = (w - 512 * this.scale) / 2;
      this.offY = (h - 384 * this.scale) / 2 + h * 0.02;
      for (const o of this.objects) if (o.kind === 'slider') { o.cache = null; o.cacheProg = -1; }
    }
    toField(cx, cy) { return { x: (cx - this.offX) / this.scale, y: (cy - this.offY) / this.scale }; }

    // ============================================================ geometry helpers
    headPos(o) { return { x: o.x + (o.ox || 0), y: o.y + (o.oy || 0) }; }
    ballPos(o, t) {
      const tt = clamp(t, o.time, o.endTime);
      let p = (tt - o.time) / o.spanDuration;
      let span = Math.floor(p);
      if (span >= o.spans) span = o.spans - 1;
      let f = p - span;
      if (span % 2 === 1) f = 1 - f;
      const q = o.path.at(f * o.path.length);
      return { x: q.x + o.ox, y: q.y + o.oy };
    }
    _endPos(o) {
      if (o.kind === 'slider') return this.ballPos(o, o.endTime);
      if (o.kind === 'spinner') return { x: 256, y: 192 };
      return this.headPos(o);
    }
    _isBreak(t) { return this.breaks.some(b => t >= b.start && t <= b.end); }

    // ============================================================ scoring
    _addJudgement(result, x, y, t, obj, isSliderFinal) {
      if (result > 0) {
        const comboMult = Math.max(this.combo - 1, 0);
        this.score += result + Math.floor(result * comboMult * this.diffMult * this.modMult / 25);
        if (!isSliderFinal) this._comboUp();
      } else {
        this._comboBreak();
      }
      this.counts[result]++;
      if (result !== 300) this.comboPerfect = false;
      if (result === 50 || result === 0) this.comboKatu = false;
      // geki/katu at end of combo
      const next = this.objects[obj.index + 1];
      let label = result === 0 ? 'miss' : String(result);
      if (!next || next.newCombo || next.kind === 'spinner') {
        if (result > 0 && this.comboPerfect) { this.counts.geki++; if (result === 300) label = 'geki'; }
        else if (result > 0 && this.comboKatu) { this.counts.katu++; if (result === 100) label = 'katu'; }
        this.comboPerfect = true;
        this.comboKatu = true;
      }
      // HP
      const hpr = this.hpRating;
      const gain = result === 300 ? 0.035 - 0.0015 * hpr : result === 100 ? 0.012 - 0.0006 * hpr : result === 50 ? -0.002 * hpr : -(0.04 + 0.014 * hpr);
      this._hp(gain);
      this.judgeTexts.push({ x, y, t, label });

      this.state.scoreV2 = Math.round(this.score);
      this.state.combo = this.combo;
      this.state.acc = this.accuracy() * 100;
    }
    _comboUp() { this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo; }
    _comboBreak() {
      if (this.combo >= 20) this.audio.effect('combobreak', 0.6);
      this.combo = 0;
    }
    _hp(delta) {
      this.hp = clamp(this.hp + delta, 0, 1);
      if (this.hp <= 0 && !this.isReplay && !this.failed && !this.finished) this._fail();
    }
    _fail() {
      this.pauseTime = this.now();
      this.failed = true;
      this.state.failed = true;
      window.isStdGameplayActive = false;
      if (window.videoPlayer) window.videoPlayer.pause();
      if (this.src) {
        const p = this.src.playbackRate, now = this.audio.ctx.currentTime;
        p.setValueAtTime(this.rate, now);
        p.linearRampToValueAtTime(0.05, now + 1.6);
        this.audio.musicGain.gain.setValueAtTime(this.audio.musicGain.gain.value, now);
        this.audio.musicGain.gain.linearRampToValueAtTime(0, now + 1.8);
        const g = this.audio.musicGain, vol = (typeof userSettings !== 'undefined' && userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
        setTimeout(() => { try { this.src.stop(); } catch (e) { /* ignore */ } g.gain.cancelScheduledValues(0); g.gain.value = vol; }, 1900);
      }
      this.failTime = performance.now();
      setTimeout(() => {
        if (!this.failed) return;
        const failScreen = document.getElementById('fail-screen');
        if (failScreen) failScreen.classList.add('active');
      }, 650);
    }
    _sound(o, bits, edgeSet, t) {
      const tp = this.timing.at(t + 2);
      const smp = o.sample || {};
      const normal = (edgeSet && edgeSet.normalSet) || smp.normalSet || tp.sampleSet;
      const add = (edgeSet && edgeSet.additionSet) || smp.additionSet || normal;
      const index = smp.index || tp.sampleIndex;
      const vol = (smp.volume || tp.volume) / 100;
      this.audio.hitsound(normal, add, bits, index, vol, smp.filename);
    }

    // ============================================================ simulation
    _click(t, x, y) {
      const objs = this.objects;
      for (let i = this.firstIdx; i < objs.length; i++) {
        const o = objs[i];
        if (o.time - this.preempt > t) break;
        if (o.kind === 'spinner') continue;
        const headDone = o.kind === 'circle' ? o.judged : o.headJudged;
        if (headDone) continue;
        const h = this.headPos(o);
        if (Math.hypot(x - h.x, y - h.y) > this.radius) continue;
        // note-lock: earlier objects with unjudged heads block this one
        for (let j = this.firstIdx; j < i; j++) {
          const p = objs[j];
          if (p.kind === 'spinner') continue;
          if (!(p.kind === 'circle' ? p.judged : p.headJudged)) { o.shake = t; return; }
        }
        const off = t - o.time;
        const a = Math.abs(off);
        let res;
        if (a <= this.win.w300) res = 300; else if (a <= this.win.w100) res = 100; else if (a <= this.win.w50) res = 50;
        else if (off < 0) { o.shake = t; return; } else return;
        this.errors.push({ off, t, res });
        this.allErrors.push(off);
        if (this.errors.length > 60) this.errors.shift();
        if (o.kind === 'circle') {
          o.judged = true; o.result = res; o.hitTime = t;
          this._addJudgement(res, h.x, h.y, t, o);
          this._sound(o, o.hitSound, null, o.time);
        } else {
          o.headJudged = true; o.headResult = res; o.hitTime = t;
          o.tracking = true; o.trackStart = t;
          o.hitCount++;
          this.score += 30; this._comboUp(); this._hp(0.01);
          this._sound(o, o.edgeSounds[0], o.edgeSets[0], o.time);
          for (let k = 0; k < o.nestedIdx; k++) {
            const n = o.nested[k];
            if (!n.hit && Math.hypot(x - (n.x + o.ox), y - (n.y + o.oy)) <= this.radius * 2.4) {
              n.hit = true; o.hitCount++;
              if (n.kind === 'tick') { this.score += 10; this._comboUp(); }
              else { this.score += 30; this._comboUp(); }
            }
          }
        }
        return;
      }
    }

    _step(t, cx, cy, held) {
      const objs = this.objects;
      const prevT = this.lastStep == null ? t : this.lastStep;
      this.lastStep = t;
      // HP drain (outside breaks, during the map)
      if (!this.failed && t > this.firstTime && t < this.lastTime && !this._isBreak(t)) {
        this._hp(-(t - prevT) / 1000 * (0.012 + 0.0075 * this.hpRating));
      }
      for (let i = this.firstIdx; i < objs.length; i++) {
        const o = objs[i];
        if (o.time - this.preempt > t) break;
        if (o.kind === 'circle') {
          if (!o.judged && t > o.time + this.win.w50) {
            o.judged = true; o.result = 0; o.hitTime = t;
            const h = this.headPos(o);
            this._addJudgement(0, h.x, h.y, t, o);
          }
        } else if (o.kind === 'slider') this._stepSlider(o, t, cx, cy, held);
        else this._stepSpinner(o, t, prevT, cx, cy, held);
      }
      while (this.firstIdx < objs.length) {
        const o = objs[this.firstIdx];
        if (o.judged && t > o.endTime + 1200) this.firstIdx++; else break;
      }
    }

    _stepSlider(o, t, cx, cy, held) {
      if (o.judged) return;
      if (!o.headJudged && t > o.time + this.win.w50) {
        o.headJudged = true; o.headResult = 0;
        this._comboBreak();
        const h = this.headPos(o);
        this.judgeTexts.push({ x: h.x, y: h.y, t, label: 'miss', small: true });
        this._hp(-0.02 - 0.006 * this.hpRating);
      }
      if (t >= o.time && t <= o.endTime) {
        const b = this.ballPos(o, t);
        const d = Math.hypot(cx - b.x, cy - b.y);
        const rad = o.tracking ? this.radius * 2.4 : this.radius;
        const tr = held && d <= rad;
        if (tr && !o.tracking) o.trackStart = t;
        if (!tr && o.tracking) o.trackEnd = t;
        o.tracking = tr;
      }
      while (o.nestedIdx < o.nested.length && o.nested[o.nestedIdx].time <= t) {
        const n = o.nested[o.nestedIdx++];
        n.hit = o.tracking;
        const px = n.x + o.ox, py = n.y + o.oy;
        if (n.hit) {
          o.hitCount++;
          if (n.kind === 'tick') { this.score += 10; this._comboUp(); this._hp(0.01); this._tickSound(o, n.time); }
          else { this.score += 30; this._comboUp(); this._hp(0.015); this._sound(o, o.edgeSounds[n.edge], o.edgeSets[n.edge], n.kind === 'tail' ? o.endTime : n.time); }
          if (n.kind !== 'tick') this.effects.push({ kind: 'edge', x: px, y: py, t, obj: o });
        } else {
          if (n.kind !== 'tail') { this._comboBreak(); this.counts.sliderBreaks++; this._hp(-0.02 - 0.005 * this.hpRating); }
          if (n.kind !== 'tail') this.judgeTexts.push({ x: px, y: py, t, label: 'miss', small: true });
        }
      }
      if (t >= o.endTime && o.nestedIdx >= o.nested.length && o.headJudged) {
        const total = 1 + o.nested.length;
        const r = o.hitCount / total;
        const res = r >= 1 ? 300 : r >= 0.5 ? 100 : r > 0 ? 50 : 0;
        o.judged = true; o.result = res; o.hitTime = t; o.tracking = false;
        const e = this._endPos(o);
        this._addJudgement(res, e.x, e.y, t, o, true);
      }
    }

    _tickSound(o, t) {
      const tp = this.timing.at(t + 2);
      const smp = o.sample || {};
      this.audio.tick(smp.normalSet || tp.sampleSet, smp.index || tp.sampleIndex, (smp.volume || tp.volume) / 100 * 0.8);
    }

    _stepSpinner(o, t, prevT, cx, cy, held) {
      if (o.judged) return;
      if (t >= o.time && t <= o.endTime) {
        const ang = Math.atan2(cy - 192, cx - 256);
        if (o.lastAngle != null && held) {
          let dA = ang - o.lastAngle;
          while (dA > Math.PI) dA -= TAU;
          while (dA < -Math.PI) dA += TAU;
          const maxD = 0.05 * Math.max(0, t - prevT);
          dA = clamp(dA, -maxD, maxD);
          o.rotation += Math.abs(dA);
          o.visualRot += dA;
          const spins = Math.floor(o.rotation / TAU);
          while (o.spins < spins) {
            o.spins++;
            if (o.spins > o.required) { o.bonus++; this.score += 1000; this.audio.effect('spinnerbonus', 0.5); this._hp(0.01); }
            else { this.score += 100; this._hp(0.005); }
          }
        }
        o.lastAngle = ang;
        o.rpmHist.push({ t, r: o.rotation });
        while (o.rpmHist.length > 2 && t - o.rpmHist[0].t > 500) o.rpmHist.shift();
      }
      if (t > o.endTime) {
        const prog = o.rotation / TAU / o.required;
        const res = prog >= 1 ? 300 : prog >= 0.9 ? 100 : prog >= 0.75 ? 50 : 0;
        o.judged = true; o.result = res; o.hitTime = t;
        if (res > 0) this._sound(o, o.hitSound, null, o.endTime);
        this._addJudgement(res, 256, 192, t, o);
      }
    }

    update() {
      let t = this.now();

      // Play storyboard [Events] Sample events
      while (this.nextSampleIdx < this.mapSamples.length && this.mapSamples[this.nextSampleIdx].time <= t) {
        const s = this.mapSamples[this.nextSampleIdx++];
        if (t - s.time < 250 && !this.paused && !this.failed) {
          this.audio.playSampleFile(s.filename, (s.volume || 100) / 100);
        }
      }

      if (this.isReplay && this.replayEvents) {
        while (this.replayIdx < this.replayEvents.length && this.replayEvents[this.replayIdx].time <= t) {
          const ev = this.replayEvents[this.replayIdx++];
          if (ev.type === 'move') {
            this.cursor = { x: ev.x, y: ev.y };
          } else if (ev.type === 'down') {
            this.cursor = { x: ev.x, y: ev.y };
            this._press(ev.key || 'K1', ev.time, ev.x, ev.y);
          } else if (ev.type === 'up') {
            this._release(ev.key || 'K1', ev.time);
          }
        }
      }

      const evs = this.events; this.events = [];
      for (const e of evs) {
        this._step(Math.max(e.time, this.lastStep == null ? e.time : this.lastStep), e.x, e.y, true);
        this._click(e.time, e.x, e.y);
      }

      this._step(t, this.cursor.x, this.cursor.y, this.held.size > 0);
      if (!this.finished && !this.failed && t > this.endAt) {
        this.finished = true;
        window.isStdGameplayActive = false;
        if (this.allErrors.length > 0 && !this.isReplay) {
          const sum = this.allErrors.reduce((a, b) => a + b, 0);
          const err = Math.round(sum / this.allErrors.length);
          localStorage.setItem('webmania_last_error', err);
          if (typeof userSettings !== 'undefined' && userSettings.autoOffset) {
            userSettings.offset = (userSettings.offset || 0) + err;
            localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
          }
        }
        setTimeout(() => this.onEnd && this.onEnd(this.result()), 300);
      }
      return t;
    }

    accuracy() {
      const c = this.counts;
      const total = c[300] + c[100] + c[50] + c[0];
      return total ? (300 * c[300] + 100 * c[100] + 50 * c[50]) / (300 * total) : 1;
    }
    grade() {
      const c = this.counts, total = c[300] + c[100] + c[50] + c[0];
      if (!total) return 'SS';
      const p300 = c[300] / total, p50 = c[50] / total;
      if (p300 === 1) return 'SS';
      if (p300 > 0.9 && p50 <= 0.01 && c[0] === 0) return 'S';
      if ((p300 > 0.8 && c[0] === 0) || p300 > 0.9) return 'A';
      if ((p300 > 0.7 && c[0] === 0) || p300 > 0.8) return 'B';
      if (p300 > 0.6) return 'C';
      return 'D';
    }
    calculateUR() {
      if (!this.errors || this.errors.length === 0) return 0;
      let sum = 0;
      for (const e of this.errors) sum += e.off;
      const mean = sum / this.errors.length;
      let vSum = 0;
      for (const e of this.errors) vSum += (e.off - mean) * (e.off - mean);
      return Math.sqrt(vSum / this.errors.length) * 10;
    }
    calculatePP() {
      const c = this.counts;
      const total = c[300] + c[100] + c[50] + c[0];
      if (!total) return 0;
      const acc = this.accuracy();
      const stars = this.stars || 4.0;
      const basePP = Math.pow(5 * Math.max(1, stars / 0.0675) - 4, 3) / 100000;
      const comboRatio = Math.min(1, this.maxCombo / Math.max(1, this.objects.length));
      const missPenalty = Math.pow(0.97, c[0]);
      const accFactor = Math.pow(acc, 5.5);
      return Math.max(0, Math.round(basePP * (0.3 + 0.7 * comboRatio) * missPenalty * accFactor));
    }
    result() {
      return {
        mode: 0,
        failed: this.failed,
        acc: this.accuracy() * 100,
        score: Math.round(this.score),
        pp: this.calculatePP(),
        ur: this.calculateUR(),
        combo: this.maxCombo,
        grade: this.failed ? 'F' : this.grade(),
        stats: {
          max: this.counts.geki,
          p300: this.counts[300],
          p200: this.counts.katu,
          p100: this.counts[100],
          p50: this.counts[50],
          miss: this.counts[0]
        }
      };
    }

    // ============================================================ main loop
    _frame() {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._frame);

      const hrTime = performance.now();
      if (typeof userSettings !== 'undefined' && userSettings.fpsLimit && userSettings.fpsLimit !== 'unlimited') {
        const targets = { 'vsync': 60, '2x': 120, '4x': 240, '8x': 480 };
        const targetFps = targets[userSettings.fpsLimit] || 60;
        if (hrTime - this.lastFrameTime < (1000 / targetFps) - 1.5) {
          return;
        }
      }
      if (typeof userSettings !== 'undefined' && userSettings.showFps) {
        this.frameCount++;
        if (hrTime - this.fpsUpdateTime >= 1000) {
          const fpsEl = document.getElementById('fps-counter');
          if (fpsEl) fpsEl.innerText = this.frameCount + ' FPS';
          this.frameCount = 0;
          this.fpsUpdateTime = hrTime;
        }
      }
      this.lastFrameTime = hrTime;

      const t = this.update();
      this.render(t);
    }

    draw(t) {
      this.render(t);
    }

    // ============================================================ rendering
    render(t) {
      const ctx = this.canvas.getContext('2d');
      const { W, H, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const inBreak = this._isBreak(t);
      if (inBreak !== this.inBreakVisual) {
        this.inBreakVisual = inBreak;
        const bgEl = document.getElementById('game-bg');
        const vidEl = document.getElementById('bg-video-canvas');
        const baseDim = (100 - ((typeof userSettings !== 'undefined' && userSettings.bgDim !== undefined) ? userSettings.bgDim : 80)) / 100;
        const blurPx = (typeof userSettings !== 'undefined' && userSettings.bgBlur > 0) ? ` blur(${userSettings.bgBlur}px)` : '';
        if (inBreak) {
          const breakBright = Math.min(1, baseDim + 0.15);
          if (bgEl) bgEl.style.filter = `brightness(${breakBright})${blurPx}`;
          if (vidEl && vidEl.style.display !== 'none') vidEl.style.filter = `brightness(${breakBright})`;
        } else {
          if (bgEl) bgEl.style.filter = `brightness(${baseDim})${blurPx}`;
          if (vidEl && vidEl.style.display !== 'none') vidEl.style.filter = `brightness(${baseDim})`;
        }
      }

      const tp = this.timing.at(t);
      if (tp.kiai) {
        const beat = ((t - tp.beatOffset) / tp.beatLength) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.05 * (1 - (beat < 0 ? beat + 1 : beat))})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.save();
      ctx.translate(this.offX, this.offY);
      ctx.scale(this.scale, this.scale);
      this._drawFollowPoints(ctx, t);
      // visible objects: earlier objects drawn on top -> iterate backwards
      const objs = this.objects;
      let last = this.firstIdx;
      while (last < objs.length && objs[last].time - this.preempt <= t) last++;
      for (let i = last - 1; i >= this.firstIdx; i--) {
        const o = objs[i];
        if (o.kind === 'circle') this._drawHitCircleObj(ctx, o, t);
        else if (o.kind === 'slider') this._drawSlider(ctx, o, t);
      }
      for (let i = last - 1; i >= this.firstIdx; i--) if (objs[i].kind === 'spinner') this._drawSpinner(ctx, objs[i], t);
      this._drawEffects(ctx, t);
      this._drawJudgements(ctx, t);
      ctx.restore();

      this._drawCursor(ctx, t);
      this._drawHUD(ctx, t, inBreak);
    }

    _colour(o) { return this.colours[o.comboIndex % this.colours.length]; }

    _approachAlpha(o, t) {
      const appear = o.time - this.preempt;
      return clamp((t - appear) / this.fadeIn, 0, 1);
    }

    _drawCircle(ctx, x, y, col, alpha, num, scale = 1) {
      if (alpha <= 0) return;
      const r = this.radius * scale;
      ctx.globalAlpha = alpha;
      // shadow
      ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      // body
      const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.35)));
      g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.25)));
      ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, TAU);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = r * 0.13; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, TAU); ctx.stroke();
      if (num != null) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${r * 0.78}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = r * 0.08; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText(num, x, y + r * 0.04);
        ctx.fillText(num, x, y + r * 0.04);
      }
      ctx.globalAlpha = 1;
    }

    _drawApproach(ctx, x, y, col, o, t) {
      if (t > o.time) return;
      const p = clamp((o.time - t) / this.preempt, 0, 1);
      const r = this.radius * (1 + 3 * p) * 0.94;
      ctx.globalAlpha = clamp((t - (o.time - this.preempt)) / Math.min(this.preempt, this.fadeIn * 2), 0, 0.9);
      ctx.lineWidth = this.radius * 0.09;
      ctx.strokeStyle = rgb(mix(col, [255, 255, 255], 0.2));
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    _shakeOffset(o, t) {
      const d = t - o.shake;
      if (d < 0 || d > 200) return 0;
      return Math.sin(d / 200 * Math.PI * 6) * 6 * (1 - d / 200);
    }

    _drawHitCircleObj(ctx, o, t) {
      const h = this.headPos(o);
      const col = this._colour(o);
      if (o.judged) {
        const d = t - o.hitTime;
        if (o.result > 0) {
          if (d < 240) {
            const k = d / 240;
            this._drawCircle(ctx, h.x, h.y, col, 1 - k, null, 1 + 0.4 * easeOut(k));
          }
        } else if (d < 150) {
          this._drawCircle(ctx, h.x, h.y, col, (1 - d / 150) * this._approachAlpha(o, o.time) * 0.8, o.comboNumber);
        }
        return;
      }
      const a = this._approachAlpha(o, t);
      const sx = h.x + this._shakeOffset(o, t);
      this._drawCircle(ctx, sx, h.y, col, a, o.comboNumber);
      this._drawApproach(ctx, sx, h.y, col, o, t);
    }

    _renderSliderBody(o, prog) {
      const s = this.scale * this.dpr;
      const r = this.radius;
      const pts = prog >= 1 ? o.path.points : o.path.slice(0, o.path.length * prog);
      if (!o.bbox) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of o.path.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        o.bbox = { x0: x0 - r - 4, y0: y0 - r - 4, x1: x1 + r + 4, y1: y1 + r + 4 };
      }
      const bb = o.bbox;
      const w = Math.max(1, Math.ceil((bb.x1 - bb.x0) * s)), h = Math.max(1, Math.ceil((bb.y1 - bb.y0) * s));
      let cv = o.cache;
      if (!cv || cv.width !== w || cv.height !== h) {
        cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
        o.cache = cv;
      }
      const c = cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      c.setTransform(s, 0, 0, s, -bb.x0 * s, -bb.y0 * s);
      c.lineCap = 'round'; c.lineJoin = 'round';
      const path = () => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); if (pts.length === 1) c.lineTo(pts[0].x + 0.01, pts[0].y); };
      path();
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = r * 2.06; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = r * 1.92; c.stroke();
      const col = this._colour(o);
      const edge = mix(col, [0, 0, 0], 0.55), centre = mix(col, [0, 0, 0], 0.15);
      const N = 8;
      for (let k = 0; k < N; k++) {
        const f = k / (N - 1);
        c.strokeStyle = rgb(mix(edge, centre, f));
        c.lineWidth = r * 1.72 * (1 - f * 0.75);
        c.stroke();
      }
    }

    _drawSlider(ctx, o, t) {
      const col = this._colour(o);
      const appear = o.time - this.preempt;
      let bodyAlpha = clamp((t - appear) / this.fadeIn, 0, 1);
      if (o.judged) {
        const d = t - o.hitTime;
        if (d > 240) return;
        bodyAlpha *= 1 - d / 240;
      }
      const snaking = (typeof userSettings === 'undefined' || userSettings.snakingSliders !== false);
      const prog = !snaking ? 1 : clamp((t - appear) / (this.preempt / 3), 0, 1);
      if (!o.cache || o.cacheProg !== prog) { this._renderSliderBody(o, prog); o.cacheProg = prog; }
      if (bodyAlpha > 0) {
        const bb = o.bbox;
        ctx.globalAlpha = bodyAlpha * 0.85;
        ctx.drawImage(o.cache, bb.x0 + o.ox, bb.y0 + o.oy, bb.x1 - bb.x0, bb.y1 - bb.y0);
        ctx.globalAlpha = 1;
      }
      const head = this.headPos(o);
      const end = o.path.at(o.path.length);
      const endP = { x: end.x + o.ox, y: end.y + o.oy };
      const active = t >= o.time && !o.judged;

      // ticks
      if (!o.judged && bodyAlpha > 0) {
        ctx.fillStyle = '#fff';
        const curSpan = t < o.time ? 0 : Math.floor((t - o.time) / o.spanDuration);
        for (let i = o.nestedIdx; i < o.nested.length; i++) {
          const n = o.nested[i];
          if (n.kind !== 'tick' || n.span !== curSpan) continue;
          const appearT = curSpan === 0 ? appear + (n.time - o.time) / 2 : o.time + curSpan * o.spanDuration - 150;
          const ta = clamp((t - appearT) / 150, 0, 1) * bodyAlpha;
          if (ta <= 0) continue;
          ctx.globalAlpha = ta;
          ctx.beginPath(); ctx.arc(n.x + o.ox, n.y + o.oy, this.radius * 0.13, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // reverse arrows + end circle
      if (!o.judged && bodyAlpha > 0) {
        const curSpan = t < o.time ? 0 : Math.floor((t - o.time) / o.spanDuration);
        const remaining = o.spans - 1 - curSpan;
        const farEnd = curSpan % 2 === 0 ? endP : head;
        if (prog >= 1) this._drawCircle(ctx, farEnd.x, farEnd.y, col, bodyAlpha * 0.9, null);
        if (remaining > 0 && prog >= 1) {
          const pts = o.path.points;
          let ang;
          if (curSpan % 2 === 0) { const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 3)]; ang = Math.atan2(b.y - a.y, b.x - a.x); }
          else { const a = pts[0], b = pts[Math.min(pts.length - 1, 2)]; ang = Math.atan2(b.y - a.y, b.x - a.x); }
          const pulse = 1 + 0.15 * (1 - (((t - o.time) % 300 + 300) % 300) / 300);
          this._drawArrow(ctx, farEnd.x, farEnd.y, ang, this.radius * 0.55 * pulse, bodyAlpha);
          if (remaining > 1) {
            const nearEnd = curSpan % 2 === 0 ? head : endP;
            if (t >= o.time) {
              const ang2 = curSpan % 2 === 0 ? Math.atan2(pts[Math.min(pts.length - 1, 2)].y - pts[0].y, pts[Math.min(pts.length - 1, 2)].x - pts[0].x)
                : Math.atan2(pts[Math.max(0, pts.length - 3)].y - pts[pts.length - 1].y, pts[Math.max(0, pts.length - 3)].x - pts[pts.length - 1].x);
              this._drawCircle(ctx, nearEnd.x, nearEnd.y, col, bodyAlpha * 0.9, null);
              this._drawArrow(ctx, nearEnd.x, nearEnd.y, ang2, this.radius * 0.55 * pulse, bodyAlpha);
            }
          }
        }
      }
      // ball + follow circle
      if (active) {
        const b = this.ballPos(o, t);
        if (o.tracking) {
          const k = clamp((t - o.trackStart) / 150, 0, 1);
          ctx.globalAlpha = k;
          ctx.lineWidth = this.radius * 0.12; ctx.strokeStyle = 'rgba(255,190,60,0.95)';
          ctx.beginPath(); ctx.arc(b.x, b.y, this.radius * lerp(1, 2.4, easeOut(k)), 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (t - o.trackEnd < 150) {
          const k = (t - o.trackEnd) / 150;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = this.radius * 0.12; ctx.strokeStyle = 'rgba(255,190,60,0.95)';
          ctx.beginPath(); ctx.arc(b.x, b.y, this.radius * lerp(2.4, 1.8, k), 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(b.x, b.y, this.radius * 0.82, 0, TAU);
        ctx.fillStyle = rgb(mix(col, [255, 255, 255], 0.15)); ctx.fill();
        ctx.lineWidth = this.radius * 0.12; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      // head circle
      if (!o.headJudged) {
        const a = this._approachAlpha(o, t);
        const sx = head.x + this._shakeOffset(o, t);
        this._drawCircle(ctx, sx, head.y, col, a, o.comboNumber);
        this._drawApproach(ctx, sx, head.y, col, o, t);
      } else if (o.headResult > 0) {
        const d = t - o.hitTime;
        if (d < 240 && d >= 0) this._drawCircle(ctx, head.x, head.y, col, 1 - d / 240, null, 1 + 0.4 * easeOut(d / 240));
      }
    }

    _drawArrow(ctx, x, y, ang, size, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.6); ctx.lineTo(size * 0.4, 0); ctx.lineTo(-size * 0.3, size * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    _drawSpinner(ctx, o, t) {
      const appear = o.time - this.preempt;
      let a = clamp((t - appear) / 300, 0, 1);
      if (o.judged) { const d = t - o.hitTime; if (d > 300) return; a *= 1 - d / 300; }
      const cx = 256, cy = 192;
      ctx.globalAlpha = a;
      const R = 170;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, TAU); ctx.fill();
      const prog = clamp(o.rotation / TAU / o.required, 0, 1);
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = prog >= 1 ? '#7fffd4' : '#66ccff';
      ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
      if (t >= o.time) {
        const rem = clamp(1 - (t - o.time) / (o.endTime - o.time), 0, 1);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, R * rem), 0, TAU); ctx.stroke();
      }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.visualRot);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(TAU / 6);
        ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(R - 25, 0); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (t < o.time) { ctx.font = 'bold 36px "Segoe UI", Arial'; ctx.fillText('SPIN!', cx, cy - 60); }
      if (prog >= 1 && !o.judged) { ctx.font = 'bold 22px "Segoe UI", Arial'; ctx.fillText('CLEAR!', cx, cy - 60); }
      if (o.bonus > 0) { ctx.font = 'bold 30px "Segoe UI", Arial'; ctx.fillText(String(o.bonus * 1000), cx, cy + 70); }
      const h = o.rpmHist;
      if (h.length > 1) {
        const dt = h[h.length - 1].t - h[0].t;
        const rpm = dt > 0 ? (h[h.length - 1].r - h[0].r) / TAU / dt * 60000 / this.rate : 0;
        ctx.font = '16px "Segoe UI", Arial';
        ctx.fillText(`${Math.round(rpm)} RPM`, cx, 384 + 6);
      }
      ctx.globalAlpha = 1;
    }

    _drawFollowPoints(ctx, t) {
      const objs = this.objects;
      ctx.fillStyle = '#fff';
      for (let i = Math.max(1, this.firstIdx); i < objs.length; i++) {
        const b = objs[i], a = objs[i - 1];
        if (b.time - this.preempt - 200 > t) break;
        if (b.newCombo || a.kind === 'spinner' || b.kind === 'spinner') continue;
        if (t > b.time) continue;
        const p0 = this._endPos(a), p1 = this.headPos(b);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len < this.radius * 3) continue;
        const ang = Math.atan2(dy, dx);
        const t0 = a.endTime, t1 = b.time;
        for (let d = this.radius * 1.5; d < len - this.radius * 1.5; d += 32) {
          const f = d / len;
          const tApp = t0 - this.preempt + (t1 - t0) * f;
          const tGone = t0 + (t1 - t0) * f;
          if (t < tApp || t > tGone + 150) continue;
          let al = clamp((t - tApp) / 200, 0, 1);
          if (t > tGone) al *= 1 - (t - tGone) / 150;
          ctx.globalAlpha = al * 0.7;
          ctx.save();
          ctx.translate(p0.x + dx * f, p0.y + dy * f); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(4, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawEffects(ctx, t) {
      this.effects = this.effects.filter(e => t - e.t < 240);
      for (const e of this.effects) {
        const k = (t - e.t) / 240;
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.lineWidth = this.radius * 0.1; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, this.radius * (0.9 + 0.5 * easeOut(k)), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    _drawJudgements(ctx, t) {
      let writeIdx = 0;
      for (let i = 0; i < this.judgeTexts.length; i++) {
        const j = this.judgeTexts[i];
        if (t - j.t < 800 && t >= j.t - 50) {
          this.judgeTexts[writeIdx++] = j;
        }
      }
      this.judgeTexts.length = writeIdx;

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const hide300 = (typeof userSettings !== 'undefined' && userSettings.hide300 === true);
      for (let i = 0; i < this.judgeTexts.length; i++) {
        const j = this.judgeTexts[i];
        const k = (t - j.t) / 800;
        if ((j.label === '300' || j.label === 'geki') && hide300) continue;
        const style = STD_JUDGE_STYLES[j.label] || ['#fff', j.label];
        const scale = 1 + 0.15 * easeOut(Math.min(1, k * 4));
        const y = j.y + (j.label === 'miss' ? 20 * k : 0);
        ctx.save();
        ctx.translate(j.x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = j.small ? 'bold 14px "Segoe UI", Arial' : 'bold 26px "Segoe UI", Arial';
        ctx.fillStyle = style[0];
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(style[1], 0, 0); ctx.fillText(style[1], 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _drawCursor(ctx) {
      const c = this.cursor;
      const x = c.x * this.scale + this.offX, y = c.y * this.scale + this.offY;
      const now = performance.now();
      this.trail.push({ x, y, n: now });
      while (this.trail.length && now - this.trail[0].n > 120) this.trail.shift();
      const cursorSize = (typeof userSettings !== 'undefined' && userSettings.cursorSize) ? userSettings.cursorSize : 1.0;
      const cursorTrail = (typeof userSettings === 'undefined' || userSettings.cursorTrail !== false);
      const sz = Math.max(8, this.scale * 14 * cursorSize);
      if (cursorTrail) {
        for (let i = 0; i < this.trail.length - 1; i++) {
          const p = this.trail[i];
          const k = 1 - (now - p.n) / 120;
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.5 * k, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      const pressed = this.held.size > 0 ? 1.2 : 1;
      ctx.beginPath(); ctx.arc(x, y, sz * 0.6 * pressed, 0, TAU);
      ctx.fillStyle = 'rgba(255,211,77,0.9)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, sz * 0.15, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    }

    _drawHUD(ctx, t, inBreak) {
      const { W, H } = this;
      const uiScale = (typeof userSettings !== 'undefined' && userSettings.uiScale) ? userSettings.uiScale : 1.0;
      const u = Math.max(0.6, H / 900) * uiScale;
      ctx.textBaseline = 'alphabetic';

      // HP bar
      const hw = W * 0.38, hh = 12 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(16 * u, 16 * u, hw, hh);
      const hpCol = this.hp < 0.2 ? '#ff4d4d' : '#ffffff';
      ctx.fillStyle = hpCol; ctx.fillRect(16 * u, 16 * u, hw * this.hp, hh);

      // Top-right Score + ACC + Progress Pie + PP/UR/Rank
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
      ctx.font = `bold ${40 * u}px "Segoe UI", Consolas, monospace`;
      ctx.fillText(String(Math.round(this.score)).padStart(8, '0'), W - 16 * u, 52 * u);
      ctx.font = `bold ${24 * u}px "Segoe UI", Arial`;
      ctx.fillText((this.accuracy() * 100).toFixed(2) + '%', W - 16 * u, 84 * u);

      // Progress pie
      const prog = clamp((t - this.firstTime) / Math.max(1, this.lastTime - this.firstTime), 0, 1);
      const pcx = W - 160 * u, pcy = 76 * u, pr = 11 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, TAU); ctx.stroke();
      ctx.fillStyle = t < this.firstTime ? 'rgba(120,255,120,0.7)' : 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(pcx, pcy);
      if (t < this.firstTime) {
        const k = clamp((this.firstTime - t) / Math.max(1, this.firstTime - this.startTime), 0, 1);
        ctx.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      } else {
        ctx.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      }
      ctx.fill();

      // PP & UR & Rank
      ctx.font = `bold ${15 * u}px "Segoe UI", Arial`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`PP ${this.calculatePP()}   UR ${this.calculateUR().toFixed(2)}`, W - 16 * u, 110 * u);
      if (!this.isReplay && this.leaderboard && this.leaderboard.length > 0 && this.score > 0) {
        let rank = 1;
        for (const s of this.leaderboard) { if (this.score < s._realScore) rank++; }
        ctx.font = `bold ${26 * u}px "Segoe UI", Arial`;
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('#' + rank, W - 16 * u, 140 * u);
      }

      // Combo bottom-left
      ctx.textAlign = 'left';
      ctx.font = `bold ${48 * u}px "Segoe UI", Arial`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(this.combo + 'x', 18 * u, H - 14 * u);
      ctx.fillStyle = '#fff'; ctx.fillText(this.combo + 'x', 16 * u, H - 16 * u);

      // Key overlay
      const keys = ['K1', 'K2', 'M1', 'M2'];
      ctx.textAlign = 'center'; ctx.font = `bold ${13 * u}px "Segoe UI", Arial`;
      keys.forEach((k, i) => {
        const bx = W - 50 * u, by = H / 2 - 90 * u + i * 46 * u;
        const on = this.held.has(k);
        ctx.fillStyle = on ? 'rgba(255,211,77,0.9)' : 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx - 20 * u, by - 20 * u, 40 * u, 40 * u);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
        ctx.strokeRect(bx - 20 * u, by - 20 * u, 40 * u, 40 * u);
        ctx.fillStyle = on ? '#000' : '#fff';
        ctx.fillText(this.keyCounts[k] ? String(this.keyCounts[k]) : k, bx, by + 5 * u);
      });

      // Hit error bar
      if (typeof userSettings === 'undefined' || userSettings.hitErrorMeter !== false) {
        const ex = W / 2, ey = H - 22 * u, scaleE = 1.4 * u;
        const w50 = this.win.w50 * scaleE, w100 = this.win.w100 * scaleE, w300 = this.win.w300 * scaleE;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#d9a74a'; ctx.fillRect(ex - w50, ey - 3 * u, w50 * 2, 6 * u);
        ctx.fillStyle = '#57e313'; ctx.fillRect(ex - w100, ey - 3 * u, w100 * 2, 6 * u);
        ctx.fillStyle = '#32bce7'; ctx.fillRect(ex - w300, ey - 3 * u, w300 * 2, 6 * u);
        ctx.fillStyle = '#fff'; ctx.fillRect(ex - 1, ey - 12 * u, 2, 24 * u);
        for (const e of this.errors) {
          const age = t - e.t;
          if (age > 8000 || age < 0) continue;
          ctx.globalAlpha = clamp(1 - age / 8000, 0, 1) * 0.9;
          ctx.fillStyle = e.res === 300 ? '#32bce7' : e.res === 100 ? '#57e313' : '#d9a74a';
          ctx.fillRect(ex + e.off * scaleE - 1.5, ey - 10 * u, 3, 20 * u);
        }
        ctx.globalAlpha = 1;
        if (this.errors.length) {
          const avg = this.errors.slice(-20).reduce((s, e) => s + e.off, 0) / Math.min(20, this.errors.length);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.moveTo(ex + avg * scaleE, ey - 14 * u); ctx.lineTo(ex + avg * scaleE - 5 * u, ey - 21 * u); ctx.lineTo(ex + avg * scaleE + 5 * u, ey - 21 * u); ctx.fill();
        }
      }

      // Skip / Break
      ctx.textAlign = 'center';
      if (t < this.firstTime - this.preempt - 1700 && !this.paused && !this.failed) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W - 200 * u, H - 110 * u, 180 * u, 50 * u);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${22 * u}px "Segoe UI", Arial`;
        ctx.fillText('SKIP ▶ (Space)', W - 110 * u, H - 77 * u);
      }
      if (inBreak) {
        const br = this.breaks.find(b => t >= b.start && t <= b.end);
        if (br) {
          const rem = Math.ceil((br.end - t) / 1000);
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `bold ${34 * u}px "Segoe UI", Arial`;
          ctx.fillText(String(rem), W / 2, H / 2);
          ctx.font = `${18 * u}px "Segoe UI", Arial`;
          ctx.fillText('Break', W / 2, H / 2 + 30 * u);
        }
      }

      // Quick retry bar
      if (typeof retryProgress !== 'undefined' && retryProgress > 0) {
        const rw = 360 * u;
        const rx = (W - rw) / 2, ry = H / 2 - 45 * u;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(rx, ry, rw, 90 * u);
        const bw = rw * 0.8 * (retryProgress / 100);
        const bx = rx + rw * 0.1, by = H / 2 + 10 * u;
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(bx, by, bw, 8 * u);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${20 * u}px "Segoe UI", Arial`;
        ctx.fillText('快速重试...', W / 2, by - 14 * u);
      }

      // Fail red tint
      if (this.failed) {
        const k = clamp((performance.now() - this.failTime) / 800, 0, 1);
        ctx.fillStyle = `rgba(80,0,0,${0.5 * k})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  window.OsuStdEngine = OsuStdEngine;
})();
