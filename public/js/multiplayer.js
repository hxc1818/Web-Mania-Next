// /public/js/multiplayer.js
let socket = null;
let multiUid = '', multiUsername = '';
let roomData = null;
let beatmapsCache = [];
let roomAudio = new Audio();
let contextTargetPlayerId = null;

let pendingRoomJoinId = null; 
let initialFirstMap = null; 
let isCreatingRoom = false; 
let isNavigatingToGame = false;

// 平滑过渡多人大厅背景音量
function setRoomAudioVolumeSmoothly(targetVol, duration = 300) {
    if(!roomAudio) return;
    if (roomAudio.fadeInterval) clearInterval(roomAudio.fadeInterval);
    const startVol = roomAudio.volume;
    const diff = targetVol - startVol;
    const steps = 15;
    const stepTime = duration / steps;
    let step = 0;
    roomAudio.fadeInterval = setInterval(() => {
        step++;
        let v = startVol + (diff * (step / steps));
        if (v < 0) v = 0; if (v > 1) v = 1;
        roomAudio.volume = v;
        if (step >= steps) {
            clearInterval(roomAudio.fadeInterval);
            roomAudio.volume = targetVol;
        }
    }, stepTime);
}

let roomVolTimeout;
function updateRoomAudioVolume() {
    clearTimeout(roomVolTimeout);
    roomVolTimeout = setTimeout(() => {
        if (!roomAudio) return;
        const mVol = (userSettings.masterVol !== undefined ? userSettings.masterVol : 100) / 100;
        const bgVol = (userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
        const musicVol = (userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
        const currentMaster = document.hasFocus() ? mVol : bgVol;
        
        let targetVol = currentMaster * musicVol * 0.5;
        if (targetVol < 0) targetVol = 0;
        if (targetVol > 1) targetVol = 1;
        
        if (roomAudio.paused || roomAudio.currentTime === 0) {
            roomAudio.volume = targetVol;
        } else {
            setRoomAudioVolumeSmoothly(targetVol);
        }
    }, 150); 
}

window.addEventListener('blur', updateRoomAudioVolume);
window.addEventListener('focus', updateRoomAudioVolume);

window.addEventListener('beforeunload', () => {
    if (!isNavigatingToGame && socket && socket.connected) socket.emit('leave_room');
});

document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        if(!isNavigatingToGame && socket && socket.connected) socket.emit('leave_room');
    });
});

window.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('wm_folderPath')) {
        alert('请先在 Single Player 模式下完成初始化设置。');
        window.location.href = 'index.html';
        return;
    }

    try {
        const folderPath = localStorage.getItem('wm_folderPath');
        const res = await fetch(`${LOCAL_API_URL}/scan`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ folderPath, forceRescan: false }) 
        });
        const data = await res.json();
        if (data.success) beatmapsCache = data.beatmaps || [];
    } catch(e) {}

    const savedUsername = localStorage.getItem('wm_username');
    const urlParams = new URLSearchParams(window.location.search);
    const targetRoom = urlParams.get('room');

    if (savedUsername) {
        document.getElementById('username-input').value = savedUsername;
        if (sessionStorage.getItem('webmania_multi') !== 'true') {
            joinMultiLobby(targetRoom);
        } else if (sessionStorage.getItem('webmania_multi_room')) {
            const r = JSON.parse(sessionStorage.getItem('webmania_multi_room'));
            joinMultiLobby(r.id);
        }
    }
});

document.addEventListener('click', () => { document.getElementById('context-menu').style.display = 'none'; });

document.getElementById('cm-kick').onclick = () => {
    if (!contextTargetPlayerId) return;
    socket.emit('kick_player', contextTargetPlayerId);
};

function showContextMenu(e, targetUid) {
    if (!roomData || roomData.host !== multiUid || targetUid === multiUid) return;
    e.preventDefault();
    contextTargetPlayerId = targetUid;
    const cm = document.getElementById('context-menu');
    cm.style.display = 'block';
    cm.style.left = e.pageX + 'px';
    cm.style.top = e.pageY + 'px';
}

function setupMultiSocketEvents(targetRoomId = null) {
    socket.on('login_failed', (err) => {
        const errDiv = document.getElementById('login-error');
        errDiv.style.display = 'block';
        errDiv.innerText = err;
        showScreen('multi-login-screen');
        socket.disconnect();
        socket = null;
    });

    socket.on('error_msg', (msg) => { alert(msg); });

    socket.on('room_list', rooms => {
        document.getElementById('room-list').innerHTML = rooms.map(r => `
            <div class="room-card" onclick="attemptJoinRoom('${r.id}', ${r.hasPassword})">
                <div class="room-header">
                    <div class="room-name">${r.name}</div>
                    <div class="room-status ${r.state === 'playing' ? 'rs-playing' : 'rs-waiting'}">
                        ${r.state === 'playing' ? '游戏中' : '等待中'}
                    </div>
                </div>
                <div class="room-meta">
                    <div>
                        ${r.hasPassword ? '<span class="locked-badge">[加密]</span>' : ''}
                        <span>人数: ${r.playersCount} / ${r.maxPlayers}</span>
                    </div>
                </div>
            </div>
        `).join('');
    });
    
    socket.on('room_joined_success', rid => {
        closeCreateRoomModal();
        closePasswordModal();
        window.history.replaceState({}, '', `multiplayer.html?room=${rid}`);
        showScreen('multi-room-screen');
    });

    socket.on('room_update', r => { roomData = r; updateRoomUI(); });

    socket.on('chat_message', msg => {
        const chatBox = document.getElementById('chat-messages');
        const isSelf = msg.sender === multiUsername;
        const alignClass = isSelf ? 'self' : 'other';
        
        chatBox.innerHTML += `
            <div class="chat-msg-wrap ${alignClass}">
                <div class="chat-sender">${msg.sender}</div>
                <div class="chat-bubble">${msg.text}</div>
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    socket.on('game_started', (updatedRoomData) => {
        roomData = updatedRoomData;
        const me = roomData.players.find(p => p.uid === multiUid);
        sessionStorage.setItem('webmania_multi', 'true');
        sessionStorage.setItem('webmania_multi_room', JSON.stringify(roomData));
        sessionStorage.setItem('webmania_multi_uid', multiUid);
        sessionStorage.setItem('webmania_multi_role', (me.status === 'ready' || me.status === 'playing') ? 'player' : 'spectator');
        
        if (roomData.mapQueue.length > 0) {
            const currentMapInfo = roomData.mapQueue[0];
            const foundMap = beatmapsCache.find(b => b.title === currentMapInfo.title && b.version === currentMapInfo.version);
            if (foundMap) sessionStorage.setItem('webmania_current_map', JSON.stringify(foundMap));
        }
        roomAudio.pause();
        isNavigatingToGame = true; 
        window.location.href = 'game.html';
    });

    socket.on('kicked', () => { alert('您已被房主踢出房间。'); leaveRoom(); });

    socket.on('room_not_found', () => {
        alert('房间已关闭或不存在。');
        window.history.replaceState({}, '', 'multiplayer.html');
        showScreen('multi-lobby-screen');
    });

    if (targetRoomId) {
        socket.emit('join_room', { roomId: targetRoomId });
    }
}

function joinMultiLobby(targetRoomId = null) {
    const name = document.getElementById('username-input').value;
    if (!name) return alert('请输入昵称。');
    localStorage.setItem('wm_username', name);
    document.getElementById('new-room-name').value = `${name} 的游戏房间`;
    multiUsername = name;
    
    if (!socket || !socket.connected) {
        socket = new CustomSocket();
        socket.on('connect', () => socket.emit('join_multi', { username: name, uid: sessionStorage.getItem('webmania_multi_uid') || Math.random().toString(36).substr(2,9) }));
        socket.on('multi_joined', data => { 
            multiUid = data.uid; multiUsername = data.username; 
            sessionStorage.setItem('webmania_multi_uid', multiUid); 
            document.getElementById('login-error').style.display = 'none';
            if (!targetRoomId) showScreen('multi-lobby-screen'); 
        });
        setupMultiSocketEvents(targetRoomId);
    }
}

function showCreateRoomModal() {
    document.getElementById('create-room-overlay').style.display = 'flex';
    document.getElementById('new-room-pass').value = '';
    initialFirstMap = null;
    document.getElementById('create-room-map-name').innerText = '尚未选择初始谱面';
}
function closeCreateRoomModal() { document.getElementById('create-room-overlay').style.display = 'none'; }

function openCreateRoomMapSelector() {
    isCreatingRoom = true;
    document.getElementById('select-overlay').style.display = 'flex';
    const iframe = document.getElementById('select-iframe');
    // 修复逻辑：检查当前 src 是否是选谱页面，如果为空或无效则重新加载
    const currentSrc = iframe.src || '';
    if (currentSrc === '' || currentSrc === 'about:blank' || !currentSrc.includes('index.html')) {
        iframe.src = 'index.html?selector=true';
    }
}

function createRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    if (!name) return alert("房间名不能为空");
    if (!initialFirstMap) return alert("必须选择一张谱面才能创建房间");
    const pwd = document.getElementById('new-room-pass').value.trim();
    const maxP = parseInt(document.getElementById('new-room-max').value);
    
    socket.emit('create_room', { 
        name, password: pwd || null, maxPlayers: isNaN(maxP)? 8 : Math.max(2, Math.min(32, maxP)),
        firstMap: initialFirstMap
    });
}

function attemptJoinRoom(id, hasPassword) {
    if (hasPassword) {
        pendingRoomJoinId = id;
        document.getElementById('password-overlay').style.display = 'flex';
        document.getElementById('join-room-pass').value = '';
    } else {
        socket.emit('join_room', { roomId: id });
    }
}
function closePasswordModal() { document.getElementById('password-overlay').style.display = 'none'; pendingRoomJoinId = null; }
function submitJoinPassword() {
    const pwd = document.getElementById('join-room-pass').value.trim();
    if(pendingRoomJoinId) socket.emit('join_room', { roomId: pendingRoomJoinId, password: pwd });
}

function leaveRoom() {
    window.history.replaceState({}, '', 'multiplayer.html');
    if (socket) socket.emit('leave_room');
    roomAudio.pause();
    showScreen('multi-lobby-screen');
}

function sendChat() {
    const input = document.getElementById('chat-input'); const text = input.value.trim();
    if (text) { socket.emit('send_chat', text); input.value = ''; }
}

function checkLocalMap(mapInfo) {
    if (!mapInfo || beatmapsCache.length === 0) return false;
    return beatmapsCache.some(b => b.title === mapInfo.title && b.version === mapInfo.version);
}

function updateRoomUI() {
    if (!roomData) return;
    const isHost = roomData.host === multiUid;
    const me = roomData.players.find(p => p.uid === multiUid) || {};
    
    const queueList = document.getElementById('map-queue-list');
    if (roomData.mapQueue.length === 0) {
        queueList.innerHTML = '<div style="color:#666; text-align:center; padding: 40px; font-weight: bold;">当前队列为空，快去添加谱面吧！</div>';
    } else {
        queueList.innerHTML = roomData.mapQueue.map((m, i) => {
            const canDelete = isHost || m.adderUid === multiUid;
            const hasLocal = checkLocalMap(m);
            return `
            <div class="queue-item">
                <div class="queue-item-info">
                    <span style="font-weight:800; font-size:15px; color:#fff;">[0${i+1}] ${m.title}</span>
                    <span style="font-size:13px; color:#ccc; margin-top:2px;">${m.artist} // ${m.version}</span>
                    <span style="font-size:11px; color:#60a5fa; margin-top:4px; font-weight:bold;">[提供者: ${m.adderName || '房主'}]</span>
                </div>
                <div class="queue-item-actions">
                    ${!hasLocal && m.url ? `<div class="osu-btn osu-btn-sm" onclick="downloadMapFromQueue(${i})">下载文件</div>` : ''}
                    ${canDelete ? `<div class="osu-btn osu-btn-sm danger" onclick="socket.emit('remove_from_queue', ${i})">移除</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const currentMap = roomData.mapQueue.length > 0 ? roomData.mapQueue[0] : null;
    let mapHasAudio = false;

    if (currentMap) {
        if (me.status !== 'spectating' && me.status !== 'downloading' && me.status !== 'ready' && me.status !== 'playing') {
            if (checkLocalMap(currentMap)) {
                if (me.status !== 'idle') socket.emit('change_status', 'idle');
            } else {
                if (me.status !== 'nomap') socket.emit('change_status', 'nomap');
            }
        }
        
        if (checkLocalMap(currentMap)) {
            const localMap = beatmapsCache.find(b => b.title === currentMap.title && b.version === currentMap.version);
            if (localMap && localMap.audioPath) {
                mapHasAudio = true;
                const srcPath = `${LOCAL_API_URL}/file?path=${encodeURIComponent(localMap.audioPath)}`;
                if (roomAudio.src !== srcPath && roomAudio.src !== window.location.origin + srcPath) {
                    roomAudio.src = srcPath;
                    roomAudio.loop = true;
                    updateRoomAudioVolume();
                    roomAudio.play().catch(e=>{});
                } else if (roomAudio.paused) {
                    updateRoomAudioVolume();
                    roomAudio.play().catch(e=>{});
                }
            }
        }
    } else {
        if (me.status !== 'spectating' && me.status !== 'idle') socket.emit('change_status', 'idle');
    }

    if (!mapHasAudio) { roomAudio.pause(); roomAudio.src = ""; }

    const statusNames = { 'idle': '等待中', 'spectating':'观战中', 'nomap':'缺少谱面', 'downloading':'下载中', 'ready':'已准备', 'playing':'游戏中', 'finished':'已完成' };
    document.getElementById('player-list').innerHTML = roomData.players.map(p => `
        <div class="player-item" oncontextmenu="showContextMenu(event, '${p.uid}')">
            <div class="player-info">
                ${p.uid === roomData.host ? '<span class="host-badge">房主</span>' : ''}
                <b style="font-size:15px; color:#fff;">${p.name}</b>
                ${p.isOffline ? '<span style="color:#ef4444; font-size:12px; font-weight:bold;">[离线]</span>' : ''}
            </div>
            <span class="status-badge st-${p.status}">${statusNames[p.status] || p.status} ${p.status==='downloading'&&p.downloadProgress?`(${p.downloadProgress}%)`:''}</span>
        </div>
    `).join('');

    if (roomData.chat) {
        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML = roomData.chat.map(msg => {
            const isSelf = msg.sender === multiUsername;
            const alignClass = isSelf ? 'self' : 'other';
            return `
                <div class="chat-msg-wrap ${alignClass}">
                    <div class="chat-sender">${msg.sender}</div>
                    <div class="chat-bubble">${msg.text}</div>
                </div>
            `;
        }).join('');
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    const actBtn = document.getElementById('btn-action');
    const specBtn = document.getElementById('btn-spectate');
    
    actBtn.onmousedown = null; actBtn.onmouseup = null; actBtn.onmouseleave = null;

    if (roomData.state === 'playing') {
        specBtn.style.display = 'none';
        if (isHost && me.status !== 'playing') {
            actBtn.innerText = '长按结束比赛';
            actBtn.className = 'osu-btn danger';
            
            let forceEndTimer;
            actBtn.onmousedown = () => {
                actBtn.innerText = '结束中...';
                forceEndTimer = setTimeout(() => {
                    socket.emit('force_end_game');
                    actBtn.innerText = '已发送结束指令';
                }, 1000);
            };
            actBtn.onmouseup = actBtn.onmouseleave = () => {
                clearTimeout(forceEndTimer);
                if (actBtn.innerText === '结束中...') actBtn.innerText = '长按结束比赛';
            };
        } else {
            actBtn.innerText = '加入观战';
            actBtn.className = 'osu-btn';
            actBtn.onclick = () => {
                sessionStorage.setItem('webmania_multi', 'true');
                sessionStorage.setItem('webmania_multi_room', JSON.stringify(roomData));
                sessionStorage.setItem('webmania_multi_uid', multiUid);
                sessionStorage.setItem('webmania_multi_role', 'spectator');
                if (currentMap) {
                    const foundMap = beatmapsCache.find(b => b.title === currentMap.title && b.version === currentMap.version);
                    if (foundMap) sessionStorage.setItem('webmania_current_map', JSON.stringify(foundMap));
                }
                roomAudio.pause();
                isNavigatingToGame = true;
                window.location.href = 'game.html';
            };
        }
    } else {
        specBtn.style.display = 'flex';
        specBtn.innerText = me.status === 'spectating' ? '停止观战' : '切换观战';
        specBtn.onclick = () => socket.emit('change_status', me.status === 'spectating' ? 'idle' : 'spectating');
        specBtn.className = me.status === 'spectating' ? 'osu-btn' : 'osu-btn secondary';

        if (!currentMap) {
            actBtn.innerText = '等待队列添加谱面';
            actBtn.className = 'osu-btn secondary';
            actBtn.onclick = null;
        } else if (me.status === 'nomap') {
            if (currentMap.url) {
                actBtn.innerText = '一键下载谱面';
                actBtn.className = 'osu-btn';
                actBtn.onclick = () => executeDownload(currentMap);
            } else {
                actBtn.innerText = '无法获取 (房主未分享)';
                actBtn.className = 'osu-btn danger';
                actBtn.onclick = null;
            }
        } else if (me.status === 'spectating' && !checkLocalMap(currentMap)) {
            if (currentMap.url) {
                actBtn.innerText = '下载谱面以实时观战';
                actBtn.className = 'osu-btn';
                actBtn.onclick = () => executeDownload(currentMap);
            } else {
                actBtn.innerText = '无法观战 (未找到本地谱面)';
                actBtn.className = 'osu-btn danger';
                actBtn.onclick = null;
            }
        } else if (me.status === 'downloading') {
            actBtn.innerText = '正在极速下载中...';
            actBtn.className = 'osu-btn';
            actBtn.onclick = null;
        } else if (me.status === 'idle' || me.status === 'finished') {
            actBtn.innerText = '准备就绪';
            actBtn.className = 'osu-btn success';
            actBtn.onclick = () => socket.emit('change_status', 'ready');
        } else if (me.status === 'ready' || me.status === 'spectating') {
            if (isHost) {
                actBtn.innerText = '强制开始游戏';
                actBtn.className = 'osu-btn danger';
                actBtn.onclick = () => socket.emit('start_game');
            } else {
                actBtn.innerText = me.status === 'ready' ? '取消准备状态' : '正在等待房主';
                actBtn.className = me.status === 'ready' ? 'osu-btn' : 'osu-btn secondary';
                actBtn.onclick = me.status === 'ready' ? () => socket.emit('change_status', 'idle') : null;
            }
        }
    }
}

async function executeDownload(mapInfo) {
    if (!mapInfo || !mapInfo.url) return;
    const previousStatus = roomData.players.find(p => p.uid === multiUid)?.status;
    socket.emit('change_status', 'downloading');
    const sts = document.getElementById('upload-status');
    try {
        sts.innerText = "开始从远程服务器高速下载...";
        const res = await fetch(mapInfo.url);
        if (!res.ok) throw new Error('文件已损坏或从服务器丢失');

        const contentLength = +res.headers.get('Content-Length');
        const reader = res.body.getReader();
        let receivedLength = 0;
        let chunks = [];

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength) {
                const prog = Math.round((receivedLength / contentLength) * 100);
                socket.emit('download_progress', prog);
            }
        }

        const blob = new Blob(chunks);
        sts.innerText = "正在本地静默解压文件...";
        const fd = new FormData();
        fd.append('file', blob, 'map.osz');
        fd.append('folderPath', localStorage.getItem('wm_folderPath'));
        
        await fetch(`${LOCAL_API_URL}/upload`, { method: 'POST', body: fd });
        
        sts.innerText = "正在同步更新本地数据库...";
        const scanRes = await fetch(`${LOCAL_API_URL}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: localStorage.getItem('wm_folderPath'), forceRescan: true }) });
        const scanData = await scanRes.json();
        if(scanData.success) beatmapsCache = scanData.beatmaps || [];

        sts.innerText = "操作完成。"; 
        setTimeout(() => sts.innerText = "", 2000);
        socket.emit('change_status', previousStatus === 'spectating' ? 'spectating' : 'idle'); 
    } catch (e) { 
        sts.innerText = "发生异常: " + e.message; 
        socket.emit('change_status', 'nomap'); 
    }
}

window.downloadMapFromQueue = function(index) {
    if (!roomData) return;
    executeDownload(roomData.mapQueue[index]);
};

async function getFileHash(fileOrBlob) {
    const buffer = await fileOrBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const dropZone = document.getElementById('drop-zone');
dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; dropZone.style.background = 'rgba(59, 130, 246, 0.15)'; dropZone.style.color = '#fff'; };
dropZone.ondragleave = e => { e.preventDefault(); dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; dropZone.style.background = 'rgba(0,0,0,0.2)'; dropZone.style.color = '#aaa'; };
dropZone.ondrop = async e => {
    e.preventDefault(); dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; dropZone.style.background = 'rgba(0,0,0,0.2)'; dropZone.style.color = '#aaa';
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.osz')) return;
    const sts = document.getElementById('upload-status');
    
    try {
        sts.innerText = "正在解析并导入到本地曲库...";
        const localFd = new FormData();
        localFd.append('file', file);
        localFd.append('folderPath', localStorage.getItem('wm_folderPath'));
        const localRes = await fetch(`${LOCAL_API_URL}/upload`, { method: 'POST', body: localFd });
        const localData = await localRes.json();
        
        if (!localData.success) throw new Error("本地解压发生错误: " + localData.error);
        const extractDirName = localData.dirName;

        const scanRes = await fetch(`${LOCAL_API_URL}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: localStorage.getItem('wm_folderPath'), forceRescan: true }) });
        const scanData = await scanRes.json();
        if(scanData.success) beatmapsCache = scanData.beatmaps || [];

        sts.innerText = "正在与远程服务器进行校验同步...";
        const hashHex = await getFileHash(file);
        
        const checkRes = await fetch(`${REMOTE_API_URL}/check_map_hash?hash=${hashHex}`);
        const checkData = await checkRes.json();

        if (!checkData.exists) {
            const fd = new FormData(); 
            fd.append('file', file);
            fd.append('hash', hashHex); 
            const upRes = await fetch(`${REMOTE_API_URL}/upload_room_map`, { method: 'POST', body: fd });
            const upData = await upRes.json();
            if (!upData.success) throw new Error(upData.error);
        }

        sts.innerText = "上传成功！请在弹出的选择器中选择想要游玩的难度。";
        setTimeout(() => sts.innerText = "", 3000);

        isCreatingRoom = false;
        document.getElementById('select-overlay').style.display = 'flex';
        const iframe = document.getElementById('select-iframe');
        iframe.src = `index.html?selector=true&filterDir=${encodeURIComponent(extractDirName)}`;

    } catch (e) { sts.innerText = "系统错误: " + e.message; }
};

function openMultiMapSelector() {
    isCreatingRoom = false;
    document.getElementById('select-overlay').style.display = 'flex';
    const iframe = document.getElementById('select-iframe');
    const currentSrc = iframe.src || '';
    // 修复：逻辑改进，确保每次点击如果当前不是基础选谱页，都重新加载
    if (currentSrc === '' || currentSrc === 'about:blank' || currentSrc.includes('filterDir') || !currentSrc.includes('index.html')) {
        iframe.src = 'index.html?selector=true';
    }
}

function closeMapSelector() { 
    document.getElementById('select-overlay').style.display = 'none'; 
    const iframe = document.getElementById('select-iframe');
    // 使用 about:blank 更稳健地清除内容
    iframe.src = 'about:blank'; 
}

window.addEventListener('message', async e => {
    if (e.data && e.data.type === 'select_map') {
        const map = e.data.map;
        closeMapSelector();

        if (isCreatingRoom) {
            isCreatingRoom = false;
            try {
                const packRes = await fetch(`${LOCAL_API_URL}/pack_map`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dirPath: map.dirPath }) });
                if (!packRes.ok) throw new Error("引擎打包过程失败");
                const blob = await packRes.blob();
                const hashHex = await getFileHash(blob);
                const checkRes = await fetch(`${REMOTE_API_URL}/check_map_hash?hash=${hashHex}`);
                const checkData = await checkRes.json();
                let finalUrl = null;
                if (checkData.exists) finalUrl = checkData.data.url;
                else {
                    const fd = new FormData(); fd.append('file', blob, 'map.osz'); fd.append('hash', hashHex);
                    const upRes = await fetch(`${REMOTE_API_URL}/upload_room_map`, { method: 'POST', body: fd });
                    finalUrl = (await upRes.json()).url;
                }
                initialFirstMap = { title: map.title, artist: map.artist, version: map.version, url: finalUrl, id: map.id };
                document.getElementById('create-room-map-name').innerText = `当前选中首张谱面: ${map.title} // ${map.version}`;
            } catch (err) {
                alert("初始化首张谱面时发生异常: " + err.message);
                initialFirstMap = { title: map.title, artist: map.artist, version: map.version, url: null, id: map.id };
                document.getElementById('create-room-map-name').innerText = `已选中本地谱面 (尚未分享给其他人): ${map.title} // ${map.version}`;
            }
            return;
        }

        const sts = document.getElementById('upload-status');
        sts.innerText = "正在打包本地谱面以验证并同步...";

        try {
            const packRes = await fetch(`${LOCAL_API_URL}/pack_map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dirPath: map.dirPath })
            });
            
            if (!packRes.ok) throw new Error("本地引擎打包异常");
            const blob = await packRes.blob();

            sts.innerText = "正在查询远程服务器资源库...";
            const hashHex = await getFileHash(blob);

            const checkRes = await fetch(`${REMOTE_API_URL}/check_map_hash?hash=${hashHex}`);
            const checkData = await checkRes.json();

            let finalUrl = null;

            if (checkData.exists) {
                sts.innerText = "触发服务器秒传！正在将谱面加入队列...";
                finalUrl = checkData.data.url;
            } else {
                sts.innerText = "正在上传文件到远程服务器，请稍后...";
                const fd = new FormData();
                fd.append('file', blob, 'map.osz');
                fd.append('hash', hashHex);
                
                const upRes = await fetch(`${REMOTE_API_URL}/upload_room_map`, { method: 'POST', body: fd });
                const upData = await upRes.json();
                if(upData.success) { finalUrl = upData.url; } else { throw new Error(upData.error); }
            }

            sts.innerText = "已成功加入等待队列！";
            socket.emit('add_map_to_queue', { title: map.title, artist: map.artist, version: map.version, url: finalUrl, id: map.id });
            setTimeout(() => sts.innerText = "", 2000);
        } catch (err) {
            sts.innerText = "网络分享异常: " + err.message;
            socket.emit('add_map_to_queue', { title: map.title, artist: map.artist, version: map.version, url: null, id: map.id });
        }
    }
});