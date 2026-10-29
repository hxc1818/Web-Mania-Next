/*
 * Audio engine: music playback through Web Audio (sample-accurate clock),
 * procedurally synthesised default hitsounds, and beatmap custom samples
 * (including HitObject custom filenames, SampleSet indexed files, and Storyboard [Events] Samples).
 */
(function () {
  'use strict';
  const SET_NAMES = { 1: 'normal', 2: 'soft', 3: 'drum' };

  // ---------------------------------------------------------- tiny DSP helpers for default samples
  function makeBuffer(ctx, seconds, fn) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.floor(seconds * sr));
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    fn(d, sr);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    return buf;
  }
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  function highpass(d, sr, fc) {
    const rc = 1 / (2 * Math.PI * fc), dt = 1 / sr, a = rc / (rc + dt);
    let py = 0, px = 0;
    for (let i = 0; i < d.length; i++) { const x = d[i]; py = a * (py + x - px); px = x; d[i] = py; }
  }
  function lowpass(d, sr, fc) {
    const rc = 1 / (2 * Math.PI * fc), dt = 1 / sr, a = dt / (rc + dt);
    let y = 0;
    for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
  }

  function synthDefaults(ctx) {
    const S = {};
    const variants = {
      normal: { tone: 1, noise: 1, hp: 2500 },
      soft: { tone: 0.75, noise: 0.45, hp: 1200 },
      drum: { tone: 0.5, noise: 0.7, hp: 800 },
    };
    for (const [set, v] of Object.entries(variants)) {
      S[set + '-hitnormal'] = makeBuffer(ctx, 0.12, (d, sr) => {
        if (set === 'drum') {
          let ph = 0;
          for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            ph += 2 * Math.PI * (55 + 140 * Math.exp(-t * 40)) / sr;
            d[i] = Math.sin(ph) * Math.exp(-t * 28) + rnd() * 0.25 * Math.exp(-t * 90);
          }
          return;
        }
        const f = 1400 * v.tone;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 60) * 0.6 + rnd() * v.noise * Math.exp(-t * 110);
        }
        highpass(d, sr, v.hp * 0.3);
      });
      S[set + '-hitwhistle'] = makeBuffer(ctx, 0.32, (d, sr) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const f = (set === 'soft' ? 1500 : 2300) * (1 + 0.012 * Math.sin(2 * Math.PI * 28 * t));
          ph += 2 * Math.PI * f / sr;
          const env = Math.min(1, t * 200) * Math.exp(-t * 11);
          d[i] = (Math.sin(ph) + 0.25 * Math.sin(ph * 2)) * env;
        }
      });
      S[set + '-hitfinish'] = makeBuffer(ctx, 1.1, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = rnd() * Math.exp(-t * (set === 'drum' ? 6 : 3.5)) + Math.sin(2 * Math.PI * 520 * t) * 0.15 * Math.exp(-t * 4);
        }
        highpass(d, sr, set === 'soft' ? 2500 : 4000);
      });
      S[set + '-hitclap'] = makeBuffer(ctx, 0.2, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let env = 0;
          for (const o of [0, 0.011, 0.022]) if (t >= o) env += Math.exp(-(t - o) * (o === 0.022 ? 35 : 180));
          d[i] = rnd() * env;
        }
        highpass(d, sr, 900); lowpass(d, sr, set === 'soft' ? 3000 : 5000);
      });
      S[set + '-slidertick'] = makeBuffer(ctx, 0.05, (d, sr) => {
        for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 3200 * v.tone * t) * Math.exp(-t * 120) * 0.5; }
      });
    }
    S['combobreak'] = makeBuffer(ctx, 0.45, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        ph += 2 * Math.PI * (420 - 300 * t) / sr;
        d[i] = (Math.sin(ph) > 0 ? 1 : -1) * 0.4 * Math.exp(-t * 6);
      }
      lowpass(d, sr, 1800);
    });
    S['spinnerbonus'] = makeBuffer(ctx, 0.25, (d, sr) => {
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (1200 + 1600 * t) * t) * Math.exp(-t * 12); }
    });
    return S;
  }

  class AudioEngine {
    constructor(existingCtx) {
      this.ctx = existingCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.defaults = synthDefaults(this.ctx);
      this.mapSamples = new Map(); // lowercase name (with or without ext) -> AudioBuffer | null (silent)
      this.enableHitSounds = true;
      this.ignoreMapSamples = false;
    }
    setMaster(v) {
      if (this.master && this.master.gain) this.master.gain.value = v;
    }
    setMusic(v) {
      if (this.musicGain && this.musicGain.gain) this.musicGain.gain.value = v;
    }
    setEffect(v) {
      if (this.sfxGain && this.sfxGain.gain) this.sfxGain.gain.value = v;
    }
    setVolumes(master, music, sfx) {
      if (master !== undefined) this.setMaster(master);
      if (music !== undefined) this.setMusic(music);
      if (sfx !== undefined) this.setEffect(sfx);
    }
    async resume() { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); }
    async decode(arrayBuffer) {
      if (!arrayBuffer) return null;
      try {
        return await this.ctx.decodeAudioData(arrayBuffer);
      } catch (e) {
        return null;
      }
    }
    /**
     * Load custom samples from a beatmap folder.
     * Supports:
     * - loadMapSamples(dirPath, fileNames, apiUrl)
     * - loadMapSamples(fileNames, fetchFile)
     */
    async loadMapSamples(arg1, arg2, arg3) {
      this.mapSamples = new Map();
      let fileNames = [];
      let fetchFile = null;

      if (typeof arg1 === 'string' && Array.isArray(arg2)) {
        const dirPath = arg1;
        fileNames = arg2;
        const apiUrl = (typeof arg3 === 'string' && arg3) ? arg3 : (typeof LOCAL_API_URL !== 'undefined' ? LOCAL_API_URL : '/api');
        fetchFile = async name => {
          const fullPath = dirPath.replace(/[/\\]+$/, '') + '/' + name.replace(/^[/\\]+/, '');
          const res = await fetch(`${apiUrl}/file?path=${encodeURIComponent(fullPath)}`);
          if (!res.ok) return null;
          return await res.arrayBuffer();
        };
      } else if (Array.isArray(arg1) && typeof arg2 === 'function') {
        fileNames = arg1;
        fetchFile = arg2;
      }

      if (!fetchFile || !Array.isArray(fileNames) || fileNames.length === 0) return;

      const wanted = fileNames.filter(n => typeof n === 'string' && /\.(wav|ogg|mp3)$/i.test(n));
      await Promise.all(wanted.map(async name => {
        const cleanName = name.replace(/\\/g, '/').toLowerCase();
        const keyNoExt = cleanName.replace(/\.(wav|ogg|mp3)$/, '');
        const baseName = cleanName.split('/').pop();
        const baseNoExt = baseName.replace(/\.(wav|ogg|mp3)$/, '');
        try {
          const ab = await fetchFile(name);
          if (!ab || ab.byteLength <= 64) {
            this.mapSamples.set(cleanName, null);
            this.mapSamples.set(keyNoExt, null);
            this.mapSamples.set(baseName, null);
            this.mapSamples.set(baseNoExt, null);
            return;
          }
          const decoded = await this.decode(ab);
          if (decoded) {
            this.mapSamples.set(cleanName, decoded);
            this.mapSamples.set(keyNoExt, decoded);
            this.mapSamples.set(baseName, decoded);
            this.mapSamples.set(baseNoExt, decoded);
          }
        } catch (e) {
          // ignore undecodable sample
        }
      }));
    }
    play(buffer, volume, when) {
      if (!this.enableHitSounds || !buffer || volume <= 0) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const g = this.ctx.createGain();
        g.gain.value = volume;
        src.connect(g); g.connect(this.sfxGain);
        src.start(when || 0);
      } catch (e) {}
    }
    /** Play an explicit sample file by filename (e.g. from [Events] Sample or HitObject filename) */
    playSampleFile(filename, volume = 1) {
      if (!this.enableHitSounds || !filename) return false;
      const clean = filename.replace(/\\/g, '/').toLowerCase();
      const noExt = clean.replace(/\.(wav|ogg|mp3)$/, '');
      if (this.mapSamples.has(clean)) {
        this.play(this.mapSamples.get(clean), volume);
        return true;
      }
      if (this.mapSamples.has(noExt)) {
        this.play(this.mapSamples.get(noExt), volume);
        return true;
      }
      return false;
    }
    /** resolve a sample like ('soft','hitwhistle', index) honoring beatmap custom samples */
    resolve(setName, type, index) {
      if (!this.ignoreMapSamples) {
        if (index >= 1) {
          const key = `${setName}-${type}${index > 1 ? index : ''}`;
          if (this.mapSamples.has(key)) return { buf: this.mapSamples.get(key) };
        }
        const baseKey = `${setName}-${type}`;
        if (this.mapSamples.has(baseKey)) return { buf: this.mapSamples.get(baseKey) };
      }
      return { buf: this.defaults[`${setName}-${type}`] };
    }
    /**
     * Play an osu! hitsound.
     * @param {number} bits hitSound bitmask (2 whistle, 4 finish, 8 clap)
     */
    hitsound(normalSet, additionSet, bits, index, volume, filename) {
      if (!this.enableHitSounds) return;
      if (filename && this.playSampleFile(filename, volume)) {
        return;
      }
      const ns = SET_NAMES[normalSet] || 'normal';
      const as = SET_NAMES[additionSet] || ns;
      this.play(this.resolve(ns, 'hitnormal', index).buf, volume);
      if (bits & 2) this.play(this.resolve(as, 'hitwhistle', index).buf, volume);
      if (bits & 4) this.play(this.resolve(as, 'hitfinish', index).buf, volume);
      if (bits & 8) this.play(this.resolve(as, 'hitclap', index).buf, volume);
    }
    tick(normalSet, index, volume) {
      if (!this.enableHitSounds) return;
      this.play(this.resolve(SET_NAMES[normalSet] || 'normal', 'slidertick', index).buf, volume);
    }
    effect(name, volume = 1) {
      if (!this.enableHitSounds) return;
      this.play(this.defaults[name], volume);
    }
  }

  window.AudioEngine = AudioEngine;
})();
