// /server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const axios = require('axios');
const http = require('http');
const { exec, spawn } = require('child_process');
const os = require('os');
const net = require('net');
const EventEmitter = require('events');
const crypto = require('crypto');
const { parseBeatmap, estimateStars } = require('./public/js/beatmap.js');

// 创建全局窗口事件控制器
const winControl = new EventEmitter();

let APP_DATA_PATH = os.tmpdir();

const app = express();
const server = http.createServer(app);

// 开启 SharedArrayBuffer 所需的跨域隔离头
// 使用 credentialless 避免屏蔽外部非 CORS 资源的请求（例如 Sayobot API）
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const tempUploadsDir = path.join(os.tmpdir(), 'webmania_uploads');
if (!fs.existsSync(tempUploadsDir)) fs.mkdirSync(tempUploadsDir, { recursive: true });
const upload = multer({ dest: tempUploadsDir });

function parseOsuMetadataFromString(content) {
    const lines = content.split(/\r?\n/);
    let section = '';
    const metadata = {
        mode: 0,
        title: 'Unknown', artist: 'Unknown', creator: 'Unknown', version: 'Normal',
        beatmapId: null, beatmapSetId: null, titleUnicode: '', artistUnicode: '', bg: '', stars: 0, audio: '', bpm: 0,
        od: 5, cs: 4, ar: 5, hp: 5,
        noteCount: 0, holdCount: 0, circles: 0, sliders: 0, spinners: 0, objects: 0
    };
    let mode = 0, circleSize = 4, arExplicit = false;
    
    let inHitObjects = false;
    let objCount = 0;
    let firstTime = -1, lastTime = 0;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[') && line.endsWith(']')) { 
            section = line.substring(1, line.length - 1); 
            inHitObjects = (section === 'HitObjects');
            continue; 
        }
        if (!line || line.startsWith('//')) continue;

        if (section === 'General') {
            if (line.startsWith('Mode:')) mode = parseInt(line.split(':')[1]);
            else if (line.startsWith('AudioFilename:')) metadata.audio = line.substring(line.indexOf(':') + 1).trim();
        }
        else if (section === 'Metadata') {
            if (line.startsWith('Title:')) metadata.title = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('Artist:')) metadata.artist = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('Creator:')) metadata.creator = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('Version:')) metadata.version = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('BeatmapID:')) metadata.beatmapId = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('BeatmapSetID:')) metadata.beatmapSetId = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('TitleUnicode:')) metadata.titleUnicode = line.substring(line.indexOf(':') + 1).trim();
            else if (line.startsWith('ArtistUnicode:')) metadata.artistUnicode = line.substring(line.indexOf(':') + 1).trim();
        } else if (section === 'Difficulty') {
            if (line.startsWith('CircleSize:')) {
                circleSize = parseFloat(line.split(':')[1]);
                metadata.cs = circleSize;
            }
            else if (line.startsWith('OverallDifficulty:')) metadata.od = parseFloat(line.split(':')[1]);
            else if (line.startsWith('ApproachRate:')) {
                metadata.ar = parseFloat(line.split(':')[1]);
                arExplicit = true;
            }
            else if (line.startsWith('HPDrainRate:')) metadata.hp = parseFloat(line.split(':')[1]);
        } else if (section === 'Events') {
            const parts = line.split(',');
            if (parts[0] === '0') {
                if (line.includes('"')) {
                    const match = line.match(/"([^"]+)"/);
                    if (match) metadata.bg = match[1].trim();
                } else if (parts.length >= 3) {
                    metadata.bg = parts[2].trim().replace(/^"/, '').replace(/"$/, '');
                }
            }
        } else if (section === 'TimingPoints') {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const bl = parseFloat(parts[1]);
                if (bl > 0 && metadata.bpm === 0) {
                    metadata.bpm = Math.round(60000 / bl);
                }
            }
        } else if (inHitObjects) {
            const parts = line.split(',');
            if (parts.length >= 4) {
                const time = parseInt(parts[2]);
                const type = parseInt(parts[3]);
                if (!isNaN(time)) {
                    if (firstTime === -1) firstTime = time;
                    lastTime = time;
                    objCount++;
                    if ((type & 128) !== 0) metadata.holdCount++;
                    else metadata.noteCount++;
                }
            }
        }
    }
    if (!arExplicit) metadata.ar = metadata.od;
    metadata.mode = mode;
    metadata.objects = objCount;

    if (mode === 3) {
        if (objCount > 0 && lastTime > firstTime) {
            const drainTime = (lastTime - firstTime) / 1000;
            const nps = objCount / (drainTime > 0 ? drainTime : 1);
            metadata.stars = Math.max(1.0, Math.min(10.0, nps * 0.3 + 0.5));
        }
        return metadata;
    } else if (mode === 0) {
        try {
            const bm = parseBeatmap(content);
            if (!bm.hitObjects || bm.hitObjects.length === 0) return null;
            let circles = 0, sliders = 0, spinners = 0;
            for (const o of bm.hitObjects) {
                if (o.kind === 'circle') circles++;
                else if (o.kind === 'slider') sliders++;
                else if (o.kind === 'spinner') spinners++;
            }
            metadata.circles = circles;
            metadata.sliders = sliders;
            metadata.spinners = spinners;
            metadata.objects = bm.hitObjects.length;
            metadata.bpm = Math.round(bm.mainBpm || metadata.bpm || 120);
            metadata.stars = estimateStars(bm);
            return metadata;
        } catch (e) {
            return null;
        }
    }
    return null;
}

function parseOsuMetadata(filePath) {
    try { return parseOsuMetadataFromString(fs.readFileSync(filePath, 'utf-8')); } catch (e) { return null; }
}

function getFileIgnoreCase(files, extensions) {
    for (const file of files) {
        const lowerFile = file.toLowerCase();
        if (extensions.some(ext => lowerFile.endsWith(ext))) return file;
    }
    return null;
}


function scanSingleFolder(itemPath) {
    const beatmaps = [];
    const normalize = p => p ? p.replace(/\\/g, '/') : null;
    if (!fs.existsSync(itemPath) || !fs.statSync(itemPath).isDirectory()) return beatmaps;

    const files = fs.readdirSync(itemPath);
    const osuFiles = files.filter(f => f.toLowerCase().endsWith('.osu'));
    for (const osuFile of osuFiles) {
        const fullOsuPath = path.join(itemPath, osuFile);
        const meta = parseOsuMetadata(fullOsuPath);
        if (meta) {
            let audioFile = null;
            if (meta.audio) {
                const targetLower = meta.audio.toLowerCase();
                audioFile = files.find(f => f.toLowerCase() === targetLower);
            }
            if (!audioFile) {
                audioFile = getFileIgnoreCase(files, ['.mp3', '.ogg']) || getFileIgnoreCase(files, ['.wav']);
            }

            beatmaps.push({
                id: Buffer.from(fullOsuPath).toString('base64'),
                mode: meta.mode !== undefined ? meta.mode : 3,
                dirPath: normalize(itemPath),
                osuPath: normalize(fullOsuPath),
                title: meta.title,
                artist: meta.artist,
                creator: meta.creator || 'Unknown',
                version: meta.version,
                beatmapId: meta.beatmapId || null,
                cs: meta.cs || 4,
                ar: meta.ar !== undefined ? meta.ar : (meta.od || 5),
                od: meta.od || 5,
                hp: meta.hp !== undefined ? meta.hp : 5,
                stars: meta.stars || 0,
                bpm: meta.bpm || 0,
                noteCount: meta.noteCount || 0,
                holdCount: meta.holdCount || 0,
                circles: meta.circles || 0,
                sliders: meta.sliders || 0,
                spinners: meta.spinners || 0,
                objects: meta.objects || 0,
                audioPath: normalize(audioFile ? path.join(itemPath, audioFile) : null),
                bgPath: normalize(meta.bg ? path.join(itemPath, meta.bg) : null)
            });
        }
    }
    return beatmaps;
}

function clearCache() {
    const cacheFiles = ['webmania_cache.json', 'webmania_cache_v2.json'];
    for (const cf of cacheFiles) {
        const cacheFile = path.join(APP_DATA_PATH, 'Temp', cf);
        if (fs.existsSync(cacheFile)) {
            try { fs.unlinkSync(cacheFile); } catch(e) {}
        }
    }
}

app.post('/api/kiosk', (req, res) => {
    winControl.emit('set-kiosk', req.body.kiosk);
    res.json({ success: true });
});

app.post('/api/sys_config', (req, res) => {
    try {
        const configPath = path.join(APP_DATA_PATH, 'sys_config.json');
        fs.writeFileSync(configPath, JSON.stringify(req.body));
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/open_folder', (req, res) => {
    try {
        const { shell } = require('electron');
        const folderPath = req.query.path;
        if (folderPath && fs.existsSync(folderPath)) {
            shell.openPath(folderPath);
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// 视频转码缓存处理接口
app.get('/api/check_video_cache', (req, res) => {
    const videoPath = req.query.path;
    if (!videoPath) return res.json({ cached: false });
    
    const cacheDir = path.join(APP_DATA_PATH, 'Temp', 'video_cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const hash = crypto.createHash('md5').update(videoPath).digest('hex');
    const cachedPath = path.join(cacheDir, hash + '.mp4');
    if (fs.existsSync(cachedPath)) {
        res.json({ cached: true, cachedPath: cachedPath });
    } else {
        res.json({ cached: false });
    }
});

app.post('/api/cache_video', upload.single('video'), (req, res) => {
    const videoPath = req.body.originalPath;
    if (!videoPath || !req.file) return res.status(400).json({ error: 'bad request' });
    
    const cacheDir = path.join(APP_DATA_PATH, 'Temp', 'video_cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const hash = crypto.createHash('md5').update(videoPath).digest('hex');
    const cachedPath = path.join(cacheDir, hash + '.mp4');
    
    try {
        fs.copyFileSync(req.file.path, cachedPath);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, cachedPath: cachedPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/local_scores', (req, res) => {
    try {
        const { folderPath, mapId, scoreData, mode } = req.body;
        if (!folderPath || !fs.existsSync(folderPath)) throw new Error('无效的文件夹路径');

        const scoresDir = path.join(APP_DATA_PATH, 'Temp', 'scores');
        if (!fs.existsSync(scoresDir)) fs.mkdirSync(scoresDir, { recursive: true });

        const scoreFile = path.join(scoresDir, `${mapId}.json`);
        let scores = [];
        if (fs.existsSync(scoreFile)) {
            scores = JSON.parse(fs.readFileSync(scoreFile, 'utf-8'));
        }
        
        scoreData.id = 'rep_' + Date.now().toString() + '_' + Math.floor(Math.random()*1000);
        scoreData.date = Date.now();
        scoreData.mode = mode !== undefined ? Number(mode) : (scoreData.mode !== undefined ? Number(scoreData.mode) : 3);
        
        scores.push(scoreData);
        scores.sort((a, b) => b.score - a.score);
        
        fs.writeFileSync(scoreFile, JSON.stringify(scores));

        const indexFile = path.join(scoresDir, 'index.json');
        let index = {};
        if (fs.existsSync(indexFile)) {
            index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        }
        index[mapId] = scores.length;
        fs.writeFileSync(indexFile, JSON.stringify(index));

        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/local_scores', (req, res) => {
    try {
        const { folderPath, mapId, mode } = req.query;
        if (!folderPath || !fs.existsSync(folderPath)) return res.json({ success: true, scores: [] });

        const scoreFile = path.join(APP_DATA_PATH, 'Temp', 'scores', `${mapId}.json`);
        if (fs.existsSync(scoreFile)) {
            let scores = JSON.parse(fs.readFileSync(scoreFile, 'utf-8'));
            if (mode !== undefined && mode !== '') {
                const targetMode = Number(mode);
                scores = scores.filter(s => (s.mode !== undefined ? Number(s.mode) : 3) === targetMode);
            }
            res.json({ success: true, scores: scores });
        } else {
            res.json({ success: true, scores: [] });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/dir_samples', (req, res) => {
    try {
        const { dirPath, excludeAudio } = req.query;
        if (!dirPath || !fs.existsSync(dirPath)) return res.json({ success: true, files: [] });
        const exLower = excludeAudio ? path.basename(excludeAudio).toLowerCase() : '';
        const sampleFiles = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const ent of entries) {
            if (ent.isFile() && /\.(wav|ogg|mp3)$/i.test(ent.name)) {
                if (exLower && ent.name.toLowerCase() === exLower) continue;
                try {
                    const st = fs.statSync(path.join(dirPath, ent.name));
                    if (st.size <= 3 * 1024 * 1024) {
                        sampleFiles.push(ent.name);
                    }
                } catch (e) {}
            }
        }
        res.json({ success: true, files: sampleFiles });
    } catch (e) {
        res.json({ success: false, files: [] });
    }
});

app.post('/api/delete_map', (req, res) => {
    const { dirPath } = req.body;
    try {
        if (!dirPath || !fs.existsSync(dirPath)) throw new Error('未找到目录');
        fs.rmSync(dirPath, { recursive: true, force: true });
        clearCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/rename_map', (req, res) => {
    const { dirPath, newName } = req.body;
    try {
        if (!dirPath || !fs.existsSync(dirPath)) throw new Error('未找到目录');
        const parentDir = path.dirname(dirPath);
        const newPath = path.join(parentDir, newName.replace(/[^a-zA-Z0-9 \-_]/g, ''));
        fs.renameSync(dirPath, newPath);
        clearCache();
        res.json({ success: true, newPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/select_folder', async (req, res) => {
    // 优先调用 Electron 原生现代选择器 (Windows 原生 IFileOpenDialog，支持地址栏、侧边栏和路径粘贴)
    try {
        let electronObj = null;
        try {
            const el = require('electron');
            if (el && typeof el === 'object' && el.dialog) {
                electronObj = el;
            }
        } catch(e) {}

        if (electronObj && electronObj.dialog) {
            let defaultPath = req.query.current;
            if (!defaultPath || !fs.existsSync(defaultPath)) {
                // 自动尝试寻找常见的默认 osu! Songs 路径
                const localAppData = process.env.LOCALAPPDATA;
                if (localAppData) {
                    const osuSongs = path.join(localAppData, 'osu!', 'Songs');
                    if (fs.existsSync(osuSongs)) defaultPath = osuSongs;
                }
            }

            const win = electronObj.BrowserWindow 
                ? (electronObj.BrowserWindow.getFocusedWindow() || electronObj.BrowserWindow.getAllWindows()[0] || null) 
                : null;

            const result = await electronObj.dialog.showOpenDialog(win || undefined, {
                title: '请选择 osu! Songs 文件夹',
                defaultPath: defaultPath,
                properties: ['openDirectory', 'dontAddToRecent'],
                buttonLabel: '选择此文件夹'
            });

            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return res.status(400).json({ error: '已取消' });
            }
            return res.json({ path: result.filePaths[0] });
        }
    } catch(err) {
        console.warn('Electron 原生选择器启动异常，尝试降级处理:', err);
    }

    // 非 Electron 或异常情况下的系统对话框降级处理
    const platform = os.platform();
    if (platform === 'darwin') {
        exec(`osascript -e 'POSIX path of (choose folder with prompt "请选择 osu! Songs 文件夹")'`, (err, stdout) => {
            if (err) return res.status(400).json({ error: '已取消' });
            res.json({ path: stdout.trim() });
        });
    } else if (platform === 'win32') {
        // 使用 Windows 现代通用文件对话框 (IFileDialog) 降级方案
        const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = '请选择 osu! Songs 文件夹'; $f.ValidateNames = $false; $f.CheckFileExists = $false; $f.CheckPathExists = $true; $f.FileName = '选择此文件夹'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ [System.IO.Path]::GetDirectoryName($f.FileName) }`;
        exec(`powershell -command "${ps}"`, (err, stdout) => {
            if (err || !stdout.trim()) return res.status(400).json({ error: '已取消' });
            res.json({ path: stdout.trim() });
        });
    } else {
        res.status(400).json({ error: '当前操作系统不支持自动窗口' });
    }
});

app.post('/api/scan', (req, res) => {
    const { folderPath, forceRescan } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) return res.status(400).json({ error: '无效的路径' });

    const tempDir = path.join(APP_DATA_PATH, 'Temp');
    const cacheFile = path.join(tempDir, 'webmania_cache_v2.json');

    if (!forceRescan && fs.existsSync(cacheFile)) {
        try {
            const cachedData = fs.readFileSync(cacheFile, 'utf-8');
            const beatmaps = JSON.parse(cachedData);
            return res.json({ success: true, count: beatmaps.length, beatmaps, cached: true });
        } catch (err) {}
    }

    const beatmaps = [];

    try {
        const items = fs.readdirSync(folderPath);
        for (const item of items) {
            const itemPath = path.join(folderPath, item);
            if (item === 'Temp') continue; 

            if (fs.statSync(itemPath).isDirectory()) {
                const bms = scanSingleFolder(itemPath);
                beatmaps.push(...bms);
            }
        }
        
        try {
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(beatmaps));
        } catch(err) {}

        res.json({ success: true, count: beatmaps.length, beatmaps, cached: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const folderPath = req.body.folderPath;
        if (!folderPath || !fs.existsSync(folderPath)) throw new Error('目标文件夹不存在');
        if (!req.file || !fs.existsSync(req.file.path)) throw new Error('上传文件无效');

        const zip = new AdmZip(req.file.path);

        let originalname = req.file.originalname;
        try {
            const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
            if (!decoded.includes('\ufffd') && decoded !== originalname) {
                originalname = decoded;
            }
        } catch(e) {}

        let metaTitle = '';
        let metaArtist = '';
        let metaBeatmapSetId = '';
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
            if (entry.entryName.toLowerCase().endsWith('.osu') && !entry.isDirectory) {
                try {
                    const osuText = entry.getData().toString('utf8');
                    const meta = parseOsuMetadataFromString(osuText);
                    if (meta) {
                        if (!metaTitle && meta.title && meta.title !== 'Unknown') metaTitle = meta.title;
                        if (!metaArtist && meta.artist && meta.artist !== 'Unknown') metaArtist = meta.artist;
                        if (!metaBeatmapSetId && meta.beatmapSetId) metaBeatmapSetId = meta.beatmapSetId;
                    }
                    if (metaTitle && metaArtist) break;
                } catch(e) {}
            }
        }

        let rawFolderName = '';
        if (metaTitle) {
            rawFolderName = `${metaBeatmapSetId && metaBeatmapSetId !== '-1' ? metaBeatmapSetId + ' ' : ''}${metaArtist ? metaArtist + ' - ' : ''}${metaTitle}`;
        } else {
            rawFolderName = originalname.replace(/\.osz$/i, '');
        }

        let folderName = rawFolderName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
        folderName = folderName.replace(/^\.+/, '').replace(/\.+$/, '').trim();
        if (!folderName) folderName = 'Map_' + Date.now();

        const targetPath = path.join(folderPath, folderName);
        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
        zip.extractAllTo(targetPath, true);
        fs.unlinkSync(req.file.path);

        const newBeatmaps = scanSingleFolder(targetPath);
        const normalize = p => p ? p.replace(/\\/g, '/') : null;
        const normTarget = normalize(targetPath);

        // 增量更新谱面缓存
        const tempDir = path.join(APP_DATA_PATH, 'Temp');
        const cacheFile = path.join(tempDir, 'webmania_cache_v2.json');
        let cachedBeatmaps = [];
        if (fs.existsSync(cacheFile)) {
            try {
                cachedBeatmaps = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                cachedBeatmaps = cachedBeatmaps.filter(b => b.dirPath !== normTarget);
            } catch(e) {
                cachedBeatmaps = [];
            }
        }
        cachedBeatmaps.push(...newBeatmaps);
        try {
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(cachedBeatmaps));
        } catch(e) {}

        res.json({
            success: true,
            dirName: folderName,
            dirPath: normTarget,
            newBeatmaps: newBeatmaps,
            count: newBeatmaps.length,
            title: metaTitle || folderName
        });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

const getRandomSid = (min = 1, max = 2000000) => Math.floor(Math.random() * (max - min + 1)) + min;

app.get('/api/sayobot_random', async (req, res) => {
    try {
        const finalMaps = [];
        let attempts = 0;
        const targetCount = 10;
        const maxAttempts = 1000;
        const batchSize = 15;

        while (finalMaps.length < targetCount && attempts < maxAttempts) {
            const promises = [];
            
            for (let i = 0; i < batchSize; i++) {
                attempts++;
                const randomSid = getRandomSid();
                const url = `https://api.sayobot.cn/v2/beatmapinfo?0=${randomSid}`;
                promises.push(axios.get(url, { timeout: 3000 }).catch(() => null));
            }
            
            const results = await Promise.all(promises);
            
            for (const result of results) {
                if (finalMaps.length >= targetCount) break;
                if (result && result.data && result.data.status === 0 && result.data.data) {
                    const detailData = result.data.data;
                    if (detailData.bid_data) {
                        const validDiffs = detailData.bid_data.filter(d => d.mode === 0 || d.mode === 3);
                        if (validDiffs.length > 0) {
                            if (!finalMaps.find(m => m.sid === detailData.sid)) {
                                const randomDiff = validDiffs[Math.floor(Math.random() * validDiffs.length)];
                                detailData.selected_diff = randomDiff;
                                finalMaps.push(detailData);
                            }
                        }
                    }
                }
            }
        }
        
        if (finalMaps.length > 0) res.json({ success: true, data: finalMaps });
        else res.status(500).json({ error: "无法获取足够的谱面" });
    } catch (e) {
        res.status(500).json({ error: "Sayobot API 错误: " + e.message });
    }
});

app.post('/api/download_sayobot', async (req, res) => {
    const { sid, folderPath } = req.body;
    if (!sid || !folderPath) return res.status(400).json({ error: "参数缺失" });
    try {
        const tempFilePath = path.join(os.tmpdir(), `temp_${sid}.osz`);
        const writer = fs.createWriteStream(tempFilePath);
        
        const response = await axios({
            method: 'GET',
            url: `https://txy1.sayobot.cn/beatmaps/download/full/${sid}`,
            responseType: 'stream'
        });
        
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const zip = new AdmZip(tempFilePath);
        const targetPath = path.join(folderPath, `Sayobot_${sid}`);
        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
        zip.extractAllTo(targetPath, true);
        fs.unlinkSync(tempFilePath);
        
        clearCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/pack_map', (req, res) => {
    try {
        const { dirPath } = req.body;
        if (!dirPath || !fs.existsSync(dirPath)) {
            return res.status(400).json({ error: '未找到目录' });
        }
        const zip = new AdmZip();
        zip.addLocalFolder(dirPath);
        const buffer = zip.toBuffer();
        
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="packed_map.osz"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(404).send('未找到文件');
    
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).send('未找到文件');
    
    res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) res.status(err.status || 500).end();
    });
});

app.get('/api/video_stream', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(404).send('未找到视频');
    
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) return res.status(404).send('未找到视频');

    const hwAccel = req.query.hwAccel === 'true';

    res.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive'
    });

    const args = hwAccel ? [
        '-hwaccel', 'auto',
        '-i', absolutePath,
        '-f', 'mpegts',
        '-codec:v', 'mpeg1video',
        '-b:v', '1500k',
        '-r', '30',
        '-vf', 'scale=-1:720,format=yuv420p',
        '-bf', '0',
        '-muxdelay', '0.001',
        '-threads', '0',
        '-an',
        '-'
    ] : [
        '-i', absolutePath,
        '-f', 'mpegts',
        '-codec:v', 'mpeg1video',
        '-b:v', '1500k',
        '-r', '30',
        '-vf', 'scale=-1:720,format=yuv420p',
        '-bf', '0',
        '-muxdelay', '0.001',
        '-threads', '0',
        '-an',
        '-'
    ];

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stdout.pipe(res);
    ffmpeg.on('close', () => res.end());
    req.on('close', () => ffmpeg.kill('SIGKILL'));
});

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => {
                tester.once('close', () => resolve(true)).close();
            })
            .listen(port);
    });
}

async function startServer(initialPort, userDataPath) {
    if (userDataPath) {
        APP_DATA_PATH = userDataPath;
    }
    
    let port = initialPort;
    while (!(await isPortAvailable(port))) {
        console.log(`端口 ${port} 已被占用，正在尝试 ${port + 1}...`);
        port++;
    }

    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`本地 Electron 后端运行在端口 ${port}`);
            resolve(port);
        });
    });
}

module.exports = { startServer, winControl };