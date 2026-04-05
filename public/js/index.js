// /public/js/index.js
let beatmaps = [];
let mapGroups = {};
let selectedMap = null;
let previewAudio = new Audio();
let favorites = JSON.parse(localStorage.getItem('webmania_favorites') || '[]');
let parsedMapCache = {}; 
let currentPreviewAudioPath = "";
let contextTarget = null;
let currentLeaderboard = [];
let currentLocalScores = [];

const isSelector = new URLSearchParams(window.location.search).get('selector') === 'true';

const bgObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        const target = entry.target;
        if (entry.isIntersecting) {
            target.bgTimeout = setTimeout(() => {
                const bg = target.getAttribute('data-bg');
                if (bg) {
                    target.style.backgroundImage = `url("${bg}")`;
                    target.removeAttribute('data-bg'); 
                }
                obs.unobserve(target); 
            }, 150);
        } else {
            if (target.bgTimeout) {
                clearTimeout(target.bgTimeout);
                target.bgTimeout = null;
            }
        }
    });
}, { rootMargin: '200px 0px' });

window.addEventListener('DOMContentLoaded', () => {
    if (isSelector) {
        document.querySelector('.mode-switcher').style.display = 'none';
        document.getElementById('settings-btn').style.display = 'none';
    }

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.removeItem('webmania_multi_role');
    sessionStorage.removeItem('webmania_replay_data');

    const savedPath = localStorage.getItem('wm_folderPath') || '';
    document.getElementById('folder-input').value = savedPath;
    if(savedPath) document.getElementById('path-display').innerText = savedPath;

    const skipSetup = localStorage.getItem('wm_skip_setup') === 'true';

    if (savedPath) {
        if (skipSetup) {
            document.getElementById('setup-screen').classList.remove('active');
            document.getElementById('select-screen').classList.add('active');
            document.getElementById('map-list').innerHTML = '<div style="color:#60a5fa; text-align:center; padding: 50px; font-weight: 600;">正在加载缓存数据...</div>';
        }
        const status = document.getElementById('scan-status');
        if (status) status.innerText = '正在初始化扫描...';
        doScan(false); 
    }
});

// 动态渲染所选K数的键位设定 UI
function renderKeybinds(k) {
    const grid = document.getElementById('keybind-grid');
    grid.innerHTML = '';
    
    // 取出现有的绑定，保证存在
    let binds = userSettings.keyBinds[k] || getDefaultBinds(k);
    userSettings.keyBinds[k] = binds;

    for (let i = 0; i < k; i++) {
        const laneDiv = document.createElement('div');
        laneDiv.style.display = 'flex';
        laneDiv.style.gap = '5px';
        laneDiv.style.alignItems = 'center';

        laneDiv.innerHTML = `
            <span style="color:#aaa;font-size:12px;width:45px;">轨道 ${i + 1}</span>
            <input type="text" id="bind-${k}-${i}-0" class="setting-input keybind-input" readonly placeholder="空" value="${binds[i][0] || ''}" style="cursor: pointer; text-align: center; padding: 10px 5px;">
            <input type="text" id="bind-${k}-${i}-1" class="setting-input keybind-input" readonly placeholder="空" value="${binds[i][1] || ''}" style="cursor: pointer; text-align: center; padding: 10px 5px;">
        `;
        grid.appendChild(laneDiv);
    }

    // 给动态生成的输入框挂上事件监听，实时存入 userSettings 内存中
    grid.querySelectorAll('.keybind-input').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
            e.preventDefault();
            const parts = inp.id.split('-');
            const lane = parseInt(parts[2]);
            const idx = parseInt(parts[3]);
            
            if (e.code === 'Escape' || e.code === 'Backspace') {
                inp.value = '';
                userSettings.keyBinds[k][lane][idx] = '';
            } else {
                inp.value = e.code;
                userSettings.keyBinds[k][lane][idx] = e.code;
            }
        });
        inp.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const parts = inp.id.split('-');
            const lane = parseInt(parts[2]);
            const idx = parseInt(parts[3]);
            inp.value = '';
            userSettings.keyBinds[k][lane][idx] = '';
        });
    });
}

document.getElementById('select-folder-btn').onclick = async () => {
    const statusEl = document.getElementById('scan-status');
    if (statusEl) statusEl.innerText = '正在打开目录选择器...';
    try {
        const res = await fetch(`${LOCAL_API_URL}/select_folder`);
        const data = await res.json();
        if (data.path) {
            document.getElementById('folder-input').value = data.path;
            document.getElementById('path-display').innerText = data.path;
            localStorage.setItem('wm_folderPath', data.path);
            if (statusEl) statusEl.innerText = '路径已确认。';
        } else {
            throw new Error(data.error || '请求被拒绝');
        }
    } catch (err) {
        const manual = prompt('无法打开文件夹对话框。请输入完整的绝对路径：');
        if (manual) {
            document.getElementById('folder-input').value = manual;
            document.getElementById('path-display').innerText = manual;
            localStorage.setItem('wm_folderPath', manual);
            if (statusEl) statusEl.innerText = '手动路径已保存。';
        } else {
            if (statusEl) statusEl.innerText = '操作已取消。';
        }
    }
};

document.getElementById('set-folder-btn').onclick = async () => {
    try {
        const res = await fetch(`${LOCAL_API_URL}/select_folder`);
        const data = await res.json();
        if (data.path) document.getElementById('set-folder').value = data.path;
    } catch (err) {
        const manual = prompt('无法打开文件夹对话框。请输入完整的绝对路径：');
        if (manual) document.getElementById('set-folder').value = manual;
    }
};

function applySettingsToInputs() {
    document.getElementById('set-offset').value = userSettings.offset;
    document.getElementById('set-speed').value = userSettings.scrollSpeed;
    document.getElementById('set-scale').value = userSettings.trackScale;
    document.getElementById('set-blur').value = userSettings.bgBlur;
    document.getElementById('set-bg-dim').value = userSettings.bgDim;
    document.getElementById('lane-color-1').value = userSettings.laneColors[0] || '#ffffff';
    document.getElementById('lane-color-2').value = userSettings.laneColors[1] || '#34d399';
    document.getElementById('lane-color-3').value = userSettings.laneColors[2] || '#fbbf24';
    document.getElementById('lane-color-4').value = userSettings.laneColors[3] || '#ffffff';

    document.getElementById('set-folder').value = localStorage.getItem('wm_folderPath') || '';
    document.getElementById('set-username').value = localStorage.getItem('wm_username') || '';

    // 初始化键位绑定菜单，默认选中 4K
    const kSelect = document.getElementById('keybind-k-select');
    if (kSelect) {
        kSelect.value = "4";
        renderKeybinds(4);
        kSelect.onchange = (e) => {
            renderKeybinds(parseInt(e.target.value));
        };
    }

    const lastErrorStr = localStorage.getItem('webmania_last_error');
    const applyBtn = document.getElementById('apply-offset-btn');
    
    if (lastErrorStr && parseInt(lastErrorStr) !== 0) {
        const errVal = parseInt(lastErrorStr);
        applyBtn.style.display = 'block';
        applyBtn.innerText = `应用: ${errVal > 0 ? '+'+errVal : errVal}ms`;
        applyBtn.onclick = () => {
            const currentOffset = parseInt(document.getElementById('set-offset').value) || 0;
            document.getElementById('set-offset').value = currentOffset + errVal;
            localStorage.setItem('webmania_last_error', '0'); 
            applyBtn.style.display = 'none';
        };
    } else {
        applyBtn.style.display = 'none';
    }
}

document.getElementById('settings-btn').onclick = () => { 
    document.getElementById('settings-modal').classList.add('show'); 
    applySettingsToInputs(); 
};

document.getElementById('save-settings-btn').onclick = () => {
    // 键位设置(keyBinds)已经在 renderKeybinds 的 onChange 事件中实时更新到了 userSettings 里，只需持久化
    userSettings.offset = parseInt(document.getElementById('set-offset').value) || 0;
    userSettings.scrollSpeed = parseInt(document.getElementById('set-speed').value) || 1000;
    userSettings.trackScale = parseFloat(document.getElementById('set-scale').value) || 1.0;
    userSettings.bgBlur = parseInt(document.getElementById('set-blur').value) || 0;
    userSettings.bgDim = parseInt(document.getElementById('set-bg-dim').value) || 80;
    userSettings.laneColors = [
        document.getElementById('lane-color-1').value,
        document.getElementById('lane-color-2').value,
        document.getElementById('lane-color-3').value,
        document.getElementById('lane-color-4').value
    ];

    localStorage.setItem('webmania_settings', JSON.stringify(userSettings));

    const newUsername = document.getElementById('set-username').value.trim();
    if (newUsername) localStorage.setItem('wm_username', newUsername);

    const newFolder = document.getElementById('set-folder').value.trim();
    const oldFolder = localStorage.getItem('wm_folderPath');
    if (newFolder && newFolder !== oldFolder) {
        localStorage.setItem('wm_folderPath', newFolder);
        document.getElementById('folder-input').value = newFolder;
        showScreen('setup-screen');
        doScan(false); 
    }
    document.getElementById('settings-modal').classList.remove('show');
};

document.getElementById('settings-force-scan-btn').onclick = async () => {
    const sts = document.getElementById('settings-scan-status');
    const btn = document.getElementById('settings-force-scan-btn');
    sts.style.color = '#60a5fa';
    sts.innerText = '深度扫描中... 请稍候，这可能需要一些时间。';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    
    await doScan(true);
    
    sts.style.color = '#34d399';
    sts.innerText = '扫描完成！';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    
    setTimeout(() => sts.innerText = '', 3000);
};

async function doScan(forceRescan = false) {
    const path = document.getElementById('folder-input').value;
    const status = document.getElementById('scan-status');
    if (!path.trim()) { if (status) status.innerText = '错误：路径为空'; return; }
    if (status) status.innerText = forceRescan ? '深度扫描中...' : '正在读取缓存...';
    
    try {
        const res = await fetch(`${LOCAL_API_URL}/scan`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ folderPath: path, forceRescan }) 
        });
        const data = await res.json();
        
        if (data.success) { 
            beatmaps = data.beatmaps || [];
            localStorage.setItem('wm_folderPath', path);
            localStorage.setItem('wm_skip_setup', 'true');
            
            mapGroups = {};
            beatmaps.forEach(bm => {
                const key = `${bm.artist} - ${bm.title}`;
                if (!mapGroups[key]) mapGroups[key] = [];
                mapGroups[key].push(bm);
            });

            renderMapList();
            
            const activeScreenId = document.querySelector('.screen.active')?.id;
            if (activeScreenId === 'setup-screen' || activeScreenId === 'select-screen') {
                if (activeScreenId === 'setup-screen') showScreen('select-screen');
                
                const lastMapStr = sessionStorage.getItem('webmania_current_map');
                let restored = false;
                if (lastMapStr && beatmaps.length > 0) {
                    const lastMap = JSON.parse(lastMapStr);
                    const targetMap = beatmaps.find(b => b.id === lastMap.id);
                    if (targetMap) {
                        restored = true;
                        setTimeout(() => {
                            const keys = Object.keys(mapGroups);
                            for (let key of keys) {
                                if (mapGroups[key].find(m => m.id === targetMap.id)) {
                                    const header = document.querySelector(`.map-group-header[data-key="${key.replace(/"/g, '&quot;')}"]`);
                                    if (header) {
                                        const groupEl = header.parentElement;
                                        document.querySelectorAll('.map-group').forEach(el => {
                                            el.classList.remove('expanded');
                                            if (el.querySelector('.map-diff-list')) el.querySelector('.map-diff-list').style.gridTemplateRows = '0fr';
                                        });
                                        
                                        groupEl.classList.add('expanded');
                                        const diffList = groupEl.querySelector('.map-diff-list');
                                        if(diffList) diffList.style.gridTemplateRows = '1fr';

                                        setTimeout(() => {
                                            const diffItem = document.querySelector(`.map-diff-item[data-id="${targetMap.id}"]`);
                                            if (diffItem) {
                                                selectedMap = null; 
                                                selectMap(targetMap, diffItem);
                                                diffItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }
                                        }, 250);
                                    }
                                    break;
                                }
                            }
                        }, 100);
                    }
                }
                
                if (!restored) {
                    const firstGroupEl = document.querySelector('.map-group-header');
                    if (firstGroupEl) firstGroupEl.click();
                }
            }
            if (status) {
                status.innerText = `已加载 ${beatmaps.length} 张谱面。`;
                status.style.color = '#34d399';
            }
        } else { 
            if (status) { status.style.color = '#ef4444'; status.innerText = '错误：扫描失败。'; }
        }
    } catch (e) { 
        if (status) { status.style.color = '#ef4444'; status.innerText = `错误：${e.message}`; }
    }
}

document.getElementById('scan-btn').onclick = () => doScan(false);

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.osz')) {
        const folderPath = document.getElementById('folder-input').value || localStorage.getItem('wm_folderPath');
        if (!folderPath) return alert('未配置路径。');
        
        const sts = document.getElementById('scan-status');
        if (sts) { sts.style.color = '#60a5fa'; sts.innerText = '正在处理 OSZ...'; }
        
        const fd = new FormData();
        fd.append('file', files[0]);
        fd.append('folderPath', folderPath);
        
        try {
            const res = await fetch(`${LOCAL_API_URL}/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) { 
                if (sts) sts.innerText = '安装完成。正在重建缓存...'; 
                doScan(true); 
            } 
            else throw new Error(data.error);
        } catch (err) { 
            if (sts) { sts.style.color = '#ef4444'; sts.innerText = '导入失败：' + err.message; }
        }
    }
});

async function loadSayobotRandom() {
    const diffList = document.getElementById('sayobot-diff-list');
    const inner = document.getElementById('sayobot-list-inner');
    const groupEl = document.getElementById('sayobot-group');
    
    document.querySelectorAll('.map-group').forEach(el => {
        el.classList.remove('expanded');
        if (el.querySelector('.map-diff-list')) el.querySelector('.map-diff-list').style.gridTemplateRows = '0fr';
    });
    
    if (diffList.style.gridTemplateRows === '1fr') {
        diffList.style.gridTemplateRows = '0fr';
        groupEl.classList.remove('expanded');
        return;
    }
    
    groupEl.classList.add('expanded');
    inner.innerHTML = '<div style="padding:15px; color:#60a5fa; font-weight: 600;">正在连接到 Sayobot...</div>';
    diffList.style.gridTemplateRows = '1fr';
    
    try {
        const res = await fetch('/api/sayobot_random');
        const data = await res.json();
        if (data.success && data.data) {
            inner.innerHTML = '';
            data.data.forEach(map => {
                const el = document.createElement('div');
                el.className = 'map-diff-item';
                // 显示包含哪些模式或K数
                const csDisplay = map.selected_diff ? `[${map.selected_diff.CS || map.selected_diff.cs || '?'}K]` : '';
                el.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="font-weight:600; color:#eee;">${map.title}</div>
                        <div style="font-size:12px; color:#aaa;">${map.artist} // ${csDisplay} 难度数: ${map.bid_data ? map.bid_data.length : '?'}</div>
                    </div>
                    <div style="color:#60a5fa; font-size:12px; font-weight:600;">[下载]</div>
                `;
                el.onclick = (e) => { e.stopPropagation(); installSayobotMap(map.sid, map.title, el); };
                inner.appendChild(el);
            });
        } else {
            inner.innerHTML = '<div style="padding:15px; color:#ef4444;">暂无数据。</div>';
        }
    } catch (e) {
        inner.innerHTML = `<div style="padding:15px; color:#ef4444;">网络错误：${e.message}</div>`;
    }
}

async function installSayobotMap(sid, title, element) {
    element.innerHTML = `
        <div style="width: 100%;">
            <div style="color:#60a5fa; margin-bottom: 5px;">下载中...</div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                <div style="width: 50%; height: 100%; background: #3b82f6; animation: progressAnim 1s infinite linear;"></div>
            </div>
        </div>
    `;
    try {
        const folderPath = document.getElementById('folder-input').value || localStorage.getItem('wm_folderPath');
        const res = await fetch('/api/download_sayobot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid, folderPath })
        });
        const data = await res.json();
        if (data.success) {
            element.innerHTML = '<div style="color:#34d399; font-weight:600;">成功！正在重建...</div>';
            const scanRes = await fetch(`${LOCAL_API_URL}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath, forceRescan: true }) });
            const scanData = await scanRes.json();
            if (scanData.success) {
                beatmaps = scanData.beatmaps || [];
                mapGroups = {};
                beatmaps.forEach(bm => {
                    const key = `${bm.artist} - ${bm.title}`;
                    if (!mapGroups[key]) mapGroups[key] = [];
                    mapGroups[key].push(bm);
                });
                renderMapList();
                const targetMap = beatmaps.find(b => b.title === title || (b.title && b.title.includes(title)));
                if (targetMap) {
                    selectedMap = null; 
                    const diffItem = document.querySelector(`.map-diff-item[data-id="${targetMap.id}"]`);
                    if (diffItem) { selectMap(targetMap, diffItem); }
                    startGame();
                } else {
                    alert("安装成功，但未能自动选中它。请手动搜索。");
                }
            }
        } else {
            element.innerHTML = `<div style="color:#ef4444;">失败：${data.error}</div>`;
        }
    } catch (e) {
        element.innerHTML = `<div style="color:#ef4444;">错误：${e.message}</div>`;
    }
}

document.addEventListener('click', () => { document.getElementById('context-menu').style.display = 'none'; });

document.getElementById('cm-fav').onclick = () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    const idx = favorites.indexOf(dir);
    if (idx === -1) { favorites.push(dir); } else { favorites.splice(idx, 1); }
    localStorage.setItem('webmania_favorites', JSON.stringify(favorites));
    renderMapList();
};

document.getElementById('cm-rename').onclick = async () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    const newName = prompt("请输入新文件夹名称（仅限字母/数字/空格）：", dir.split('/').pop());
    if (newName && newName.trim()) {
        try {
            const res = await fetch(`${LOCAL_API_URL}/rename_map`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ dirPath: dir, newName })
            });
            const data = await res.json();
            if (data.success) { doScan(true); } else alert("重命名失败: " + data.error);
        } catch(e) { alert("错误: " + e.message); }
    }
};

document.getElementById('cm-delete').onclick = async () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    if (confirm("您确定要永久删除此谱面吗？")) {
        try {
            const res = await fetch(`${LOCAL_API_URL}/delete_map`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ dirPath: dir })
            });
            const data = await res.json();
            if (data.success) { doScan(true); } else alert("删除失败: " + data.error);
        } catch(e) { alert("错误: " + e.message); }
    }
};

function showContextMenu(e, dirPath) {
    e.preventDefault();
    contextTarget = e.currentTarget;
    contextTarget.setAttribute('data-dir', dirPath);
    const cm = document.getElementById('context-menu');
    cm.style.display = 'block';
    cm.style.left = e.pageX + 'px';
    cm.style.top = e.pageY + 'px';
    if (favorites.includes(dirPath)) { document.getElementById('cm-fav').innerText = "取消收藏"; } else { document.getElementById('cm-fav').innerText = "加入收藏"; }
}

document.getElementById('btn-random-map').onclick = () => {
    if (beatmaps.length === 0) return;
    const rndMap = beatmaps[Math.floor(Math.random() * beatmaps.length)];
    const key = `${rndMap.artist} - ${rndMap.title}`;
    const header = document.querySelector(`.map-group-header[data-key="${key.replace(/"/g, '&quot;')}"]`);
    if (header) {
        const groupEl = header.parentElement;
        document.querySelectorAll('.map-group').forEach(el => {
            el.classList.remove('expanded');
            if (el.querySelector('.map-diff-list')) el.querySelector('.map-diff-list').style.gridTemplateRows = '0fr';
        });
        groupEl.classList.add('expanded');
        const diffList = groupEl.querySelector('.map-diff-list');
        if(diffList) diffList.style.gridTemplateRows = '1fr';
        setTimeout(() => {
            const diffItem = document.querySelector(`.map-diff-item[data-id="${rndMap.id}"]`);
            if (diffItem) {
                selectedMap = null; 
                selectMap(rndMap, diffItem);
                diffItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
            }
        }, 250); 
    }
};

function renderMapList() {
    const list = document.getElementById('map-list');
    list.innerHTML = '';
    bgObserver.disconnect(); 
    mapGroups = {};
    beatmaps.forEach(bm => {
        const key = `${bm.artist} - ${bm.title}`;
        if (!mapGroups[key]) mapGroups[key] = [];
        mapGroups[key].push(bm);
    });

    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const sortField = document.getElementById('sort-field')?.value || 'title';
    const sortDir = document.getElementById('sort-dir')?.value || 'asc';

    let groupArray = Object.keys(mapGroups).map(key => {
        const maps = mapGroups[key];
        return {
            key: key, maps: maps, title: maps[0].title.toLowerCase(), artist: maps[0].artist.toLowerCase(),
            maxStars: Math.max(...maps.map(m => m.stars || getFakeStars(m.version))),
            avgBpm: maps.reduce((sum, m) => sum + (m.bpm || 0), 0) / maps.length,
            dirPath: maps[0].dirPath
        };
    });

    if (searchTerm) {
        groupArray = groupArray.filter(g => g.title.includes(searchTerm) || g.artist.includes(searchTerm) || g.maps.some(m => m.version.toLowerCase().includes(searchTerm)));
    }

    groupArray.sort((a, b) => {
        let valA = a[sortField] !== undefined ? a[sortField] : a.maxStars;
        let valB = b[sortField] !== undefined ? b[sortField] : b.maxStars;
        if (sortField === 'bpm') { valA = a.avgBpm; valB = b.avgBpm; }
        const favA = favorites.includes(a.dirPath) ? 1 : 0;
        const favB = favorites.includes(b.dirPath) ? 1 : 0;
        if (favA !== favB) return favB - favA; 
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const randomGroupEl = document.createElement('div');
    randomGroupEl.className = 'map-group';
    randomGroupEl.id = 'sayobot-group';
    randomGroupEl.innerHTML = `
        <div class="map-group-header" onclick="loadSayobotRandom()" style="border-left-color: #3b82f6;">
            <div class="map-group-header-content">
                <div style="font-weight:700; font-size:18px; color:#fff;">获取 Sayobot 谱面</div>
                <div style="font-size:12px; color:#aaa; margin-top:2px;">从网络获取10张随机谱面</div>
            </div>
        </div>
        <div class="map-diff-list" id="sayobot-diff-list" style="grid-template-rows: 0fr;">
            <div class="map-diff-list-inner" id="sayobot-list-inner"></div>
        </div>
    `;
    if (!searchTerm) list.appendChild(randomGroupEl);

    if (groupArray.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = "color:#aaa; text-align:center; padding: 50px;";
        emptyMsg.innerHTML = '未找到匹配项。<br>请调整搜索条件或拖拽 .OSZ 文件导入。';
        list.appendChild(emptyMsg);
        return;
    }

    groupArray.forEach(g => {
        const key = g.key;
        const group = g.maps;
        group.sort((a,b) => (a.stars || getFakeStars(a.version)) - (b.stars || getFakeStars(b.version)));

        const groupEl = document.createElement('div');
        groupEl.className = 'map-group';
        
        const minStar = group[0].stars || getFakeStars(group[0].version);
        const maxStar = group[group.length - 1].stars || getFakeStars(group[group.length - 1].version);
        const starRangeText = minStar.toFixed(2) === maxStar.toFixed(2) ? `${minStar.toFixed(2)} ★` : `${minStar.toFixed(2)} ★ - ${maxStar.toFixed(2)} ★`;
        const isFav = favorites.includes(g.dirPath);

        const header = document.createElement('div');
        header.className = 'map-group-header';
        header.setAttribute('data-key', key); 
        
        if(group[0].bgPath) { header.setAttribute('data-bg', `${LOCAL_API_URL}/file?path=${encodeURIComponent(group[0].bgPath)}`); bgObserver.observe(header); }

        header.innerHTML = `
            <div class="map-group-header-content">
                <div style="font-weight:700; font-size:18px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${isFav ? '<span class="fav-indicator">[收藏]</span> ' : ''}${group[0].title}</div>
                <div style="font-size:12px; color:#ccc; margin-top:2px; text-transform:uppercase;">${group[0].artist} // ${group.length} 个难度</div>
                <div style="font-size:13px; font-weight:700; margin-top:4px; color:${getStarColor(maxStar)};">${starRangeText} ${g.avgBpm > 0 ? ' // BPM: ' + Math.round(g.avgBpm) : ''}</div>
            </div>
        `;
        header.oncontextmenu = (e) => showContextMenu(e, g.dirPath);
        
        const diffList = document.createElement('div');
        diffList.className = 'map-diff-list';
        const diffListInner = document.createElement('div');
        diffListInner.className = 'map-diff-list-inner';

        group.forEach(bm => {
            const stars = bm.stars || getFakeStars(bm.version);
            const starColor = getStarColor(stars);
            const cs = bm.cs || 4; // 动态提取 K数
            const diffItem = document.createElement('div');
            diffItem.className = 'map-diff-item';
            diffItem.setAttribute('data-id', bm.id);
            const grade = history[bm.id] || '';
            
            // 列表中增加 [X K] 提示
            diffItem.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:12px; height:12px; border-radius:3px; background:${starColor}; box-shadow: 0 0 10px ${starColor};"></div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="font-weight:600; color:#eee; font-size: 15px;"><span style="color:#fbbf24; font-weight:800; font-size:12px; margin-right:4px;">[${cs}K]</span>${bm.version}</div>
                        <div style="font-size:12px; color:${starColor}; font-weight:700;">${stars.toFixed(2)} ★</div>
                    </div>
                </div>
                <div class="map-grade ${grade ? 'color-'+grade.toLowerCase() : ''}">${grade}</div>
            `;
            diffItem.onclick = (e) => { e.stopPropagation(); selectMap(bm, diffItem); };
            diffItem.oncontextmenu = (e) => showContextMenu(e, g.dirPath);
            diffListInner.appendChild(diffItem);
        });
        diffList.appendChild(diffListInner);

        header.onclick = () => {
            const isExpanded = groupEl.classList.contains('expanded');
            document.querySelectorAll('.map-group').forEach(el => {
                el.classList.remove('expanded');
                if (el.querySelector('.map-diff-list')) el.querySelector('.map-diff-list').style.gridTemplateRows = '0fr';
            });
            if (!isExpanded) {
                groupEl.classList.add('expanded');
                diffList.style.gridTemplateRows = '1fr';
                const firstItem = diffListInner.querySelector('.map-diff-item');
                if (firstItem) { 
                    selectMap(group[0], firstItem); 
                    setTimeout(() => { firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150); 
                }
            }
        };
        groupEl.appendChild(header); groupEl.appendChild(diffList); list.appendChild(groupEl);
    });
}

async function fetchLeaderboard(beatmapId) {
    const panel = document.getElementById('leaderboard-panel');
    const list = document.getElementById('leaderboard-list');
    if (!beatmapId) { panel.style.display = 'none'; currentLeaderboard = []; return; }
    list.innerHTML = '连接中...';
    panel.style.display = 'flex';
    try {
        const res = await fetch(`${REMOTE_API_URL}/scores/${beatmapId}`);
        const data = await res.json();
        currentLeaderboard = data.scores || [];
        currentLeaderboard.forEach(s => s._realScore = Math.max(Number(s.classic_total_score) || 0, Number(s.total_score) || 0, Number(s.score) || 0));
        currentLeaderboard.sort((a, b) => b._realScore - a._realScore);
        currentLeaderboard = currentLeaderboard.filter(s => s._realScore > 0);

        if (currentLeaderboard.length === 0) list.innerHTML = '<div style="color:#aaa">未找到记录。</div>';
        else {
            list.innerHTML = currentLeaderboard.slice(0, 50).map((s, i) => {
                return `<div class="leaderboard-item"><span>#${i+1} <b style="color:#60a5fa;">${s.user?.username || s.username || 'Unknown'}</b></span><span style="color:#fbbf24; font-weight:600;">${s._realScore.toLocaleString()}</span></div>`;
            }).join('');
        }
    } catch (e) { list.innerHTML = '<div style="color:#ef4444">连接失败</div>'; currentLeaderboard = []; }
}

async function fetchLocalLeaderboard(mapId) {
    const panel = document.getElementById('local-leaderboard-panel');
    const list = document.getElementById('local-leaderboard-list');
    if (!mapId) { panel.style.display = 'none'; currentLocalScores = []; return; }
    list.innerHTML = '正在读取本地数据...';
    panel.style.display = 'flex';
    try {
        const folderPath = localStorage.getItem('wm_folderPath');
        const res = await fetch(`${LOCAL_API_URL}/local_scores?folderPath=${encodeURIComponent(folderPath)}&mapId=${encodeURIComponent(mapId)}`);
        const data = await res.json();
        currentLocalScores = data.scores || [];
        if (currentLocalScores.length === 0) { list.innerHTML = '<div style="color:#aaa">暂无记录</div>'; } 
        else {
            list.innerHTML = currentLocalScores.map((s, i) => {
                const dateObj = new Date(s.date);
                const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
                return `
                <div class="leaderboard-item local-lb-item" style="cursor: pointer; transition: 0.2s;" onclick="playReplay('${s.id}')">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <span><span style="color:#aaa;font-size:12px;">#${i+1}</span> <b style="color:#34d399;">${s.player}</b> <span class="color-${s.grade.toLowerCase()}" style="margin-left:5px; font-weight:800; font-style:italic;">${s.grade}</span></span>
                        <span style="color:#aaa; font-size:11px;">${dateStr} | ACC: ${s.acc.toFixed(2)}% | 连击: ${s.combo}x</span>
                    </div>
                    <span style="color:#fbbf24; font-weight:700; font-size:15px;">${s.score.toLocaleString()}</span>
                </div>`;
            }).join('');
        }
    } catch (e) { list.innerHTML = '<div style="color:#ef4444">读取记录失败。</div>'; currentLocalScores = []; }
}

function playReplay(scoreId) {
    const scoreData = currentLocalScores.find(s => s.id === scoreId);
    if (!scoreData || !selectedMap) return;
    const screen = document.getElementById('select-screen');
    screen.classList.add('transitioning');
    let vol = previewAudio.volume;
    const fadeOut = setInterval(() => {
        if(vol > 0.05) { vol -= 0.05; previewAudio.volume = vol; }
        else { clearInterval(fadeOut); previewAudio.pause(); }
    }, 50);

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.setItem('webmania_current_map', JSON.stringify(selectedMap));
    sessionStorage.setItem('webmania_replay_data', JSON.stringify({ player: scoreData.player, events: scoreData.replay }));
    setTimeout(() => { window.location.href = 'game.html'; }, 1000);
}

async function selectMap(bm, element) {
    if (selectedMap && selectedMap.id === bm.id) { return startGame(); }
    document.querySelectorAll('.map-diff-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedMap = bm;

    const csDisplay = bm.cs || 4;
    document.getElementById('info-title').innerText = bm.title;
    document.getElementById('info-artist').innerText = bm.artist;
    // 增加 [4K] 前缀
    document.getElementById('info-version').innerText = `[${csDisplay}K] ${bm.version}`;
    const stars = bm.stars || getFakeStars(bm.version);
    document.getElementById('info-stars').innerText = `${stars.toFixed(2)} ★`;
    document.getElementById('info-stars').style.color = getStarColor(stars);

    if (bm.bgPath) document.getElementById('select-bg').style.backgroundImage = `url("${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.bgPath)}")`;

    fetchLeaderboard(bm.beatmapId);
    fetchLocalLeaderboard(bm.id);

    try {
        let osuText = parsedMapCache[bm.osuPath];
        if (!osuText) {
            const osuRes = await fetch(`${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.osuPath)}`);
            osuText = await osuRes.text();
            parsedMapCache[bm.osuPath] = osuText;
        }
        const parsed = parseOsuFileLite(osuText);
        document.getElementById('stat-bpm').innerText = parsed.bpm;
        document.getElementById('stat-hp').innerText = parsed.hp;
        document.getElementById('stat-od').innerText = parsed.od; 
        document.getElementById('stat-notes').innerText = parsed.noteCount;
        document.getElementById('stat-holds').innerText = parsed.holdsCount || parsed.holdCount;
        document.getElementById('stat-keys').innerText = (parsed.cs || bm.cs || 4) + 'K';

        if (currentPreviewAudioPath !== bm.audioPath) {
            currentPreviewAudioPath = bm.audioPath;
            if (bm.audioPath) {
                previewAudio.pause();
                previewAudio.src = `${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.audioPath)}`;
                previewAudio.loop = true; 
                previewAudio.onloadedmetadata = () => {
                    if (parsed.previewTime > 0) previewAudio.currentTime = parsed.previewTime / 1000;
                    else if (previewAudio.duration) previewAudio.currentTime = previewAudio.duration / 3;
                };
                previewAudio.oncanplay = () => {
                    previewAudio.volume = 0.5;
                    const playPromise = previewAudio.play();
                    if (playPromise !== undefined) { playPromise.catch(e => {}); }
                    previewAudio.oncanplay = null;
                };
            } else previewAudio.pause();
        } else if (previewAudio.paused && bm.audioPath) {
            previewAudio.play().catch(e=>{});
        }
    } catch(e) {}
}

function parseOsuFileLite(osuText) {
    const lines = osuText.split(/\r?\n/);
    let section = '', bpm = 0, hp = 0, od = 5, cs = 4, previewTime = -1, noteCount = 0, holdCount = 0, beatLengths = [];
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[')) { section = line; continue; }
        if (!line) continue;
        if (section === '[General]' && line.startsWith('PreviewTime:')) previewTime = parseInt(line.split(':')[1].trim());
        else if (section === '[Difficulty]') {
            if (line.startsWith('HPDrainRate:')) hp = parseFloat(line.split(':')[1].trim());
            if (line.startsWith('OverallDifficulty:')) od = parseFloat(line.split(':')[1].trim()); 
            if (line.startsWith('CircleSize:')) cs = parseFloat(line.split(':')[1].trim()); 
        }
        else if (section === '[TimingPoints]') { let parts = line.split(','); if (parts.length >= 2 && parseFloat(parts[1]) > 0) beatLengths.push(parseFloat(parts[1])); } 
        else if (section === '[HitObjects]') {
            const parts = line.split(',');
            if (parts.length >= 5) {
                // 动态计算该按键处于多少轨道
                const column = Math.floor(parseInt(parts[0]) * cs / 512);
                if (column >= 0 && column < cs) { if ((parseInt(parts[3]) & 128) !== 0) holdCount++; else noteCount++; }
            }
        }
    }
    if (beatLengths.length > 0) {
        let mainBL = beatLengths.sort((a,b) => beatLengths.filter(v => v===a).length - beatLengths.filter(v => v===b).length).pop();
        bpm = Math.round(60000 / mainBL);
    }
    return { bpm, hp, od, cs, previewTime, noteCount, holdCount };
}

function startGame() {
    if (!selectedMap) return; 
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selector') === 'true') {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'select_map', map: selectedMap }, '*');
        }
        return;
    }
    const screen = document.getElementById('select-screen');
    screen.classList.add('transitioning');
    let vol = previewAudio.volume;
    const fadeOut = setInterval(() => {
        if(vol > 0.05) { vol -= 0.05; previewAudio.volume = vol; }
        else { clearInterval(fadeOut); previewAudio.pause(); }
    }, 50);

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.setItem('webmania_current_map', JSON.stringify(selectedMap));
    sessionStorage.setItem('webmania_current_leaderboard', JSON.stringify(currentLeaderboard));
    
    setTimeout(() => { window.location.href = 'game.html'; }, 1000); 
}