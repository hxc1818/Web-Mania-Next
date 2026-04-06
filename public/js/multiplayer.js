// /public/js/multiplayer.js
let socket = null;
let multiUid = '', multiUsername = '';
let roomData = null;
let beatmapsCache = [];
let roomAudio = new Audio();
let contextTargetPlayerId = null;

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

function updateRoomAudioVolume() {
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
}
window.addEventListener('blur', updateRoomAudioVolume);
window.addEventListener('focus', updateRoomAudioVolume);

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
        document.getElementById('new-room-name').value = `${savedUsername}的房间`;
        
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
    socket.on('room_list', rooms => {
        document.getElementById('room-list').innerHTML = rooms.map(r => `
            <div class="room-list-item" onclick="joinRoom('${r.id}')">
                <div><b style="font-size:16px;">${r.name}</b> <span style="font-size:12px;color:#aaa;margin-left:10px;">[人数: ${r.players.length}]</span></div>
                <div style="font-weight:600; color:${r.state==='playing'?'#fca5a5':'#6ee7b7'}">${r.state === 'playing' ? '游戏中' : '等待中'}</div>
            </div>
        `).join('');
    });
    socket.on('room_update', r => { roomData = r; updateRoomUI(); });
    socket.on('chat_message', msg => {
        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML += `<div><b style="color:#60a5fa;">${msg.sender}:</b> <span style="color:#ddd">${msg.text}</span></div>`;
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
        window.location.href = 'game.html';
    });
    socket.on('kicked', () => {
        alert('您已被房主踢出。');
        leaveRoom();
    });
    socket.on('room_not_found', () => {
        alert('房间已关闭或不存在。');
        window.history.replaceState({}, '', 'multiplayer.html');
        showScreen('multi-lobby-screen');
    });

    if (targetRoomId) {
        socket.emit('join_room', { roomId: targetRoomId });
        showScreen('multi-room-screen');
    }
}

function joinMultiLobby(targetRoomId = null) {
    const name = document.getElementById('username-input').value;
    if (!name) return alert('请输入昵称。');
    localStorage.setItem('wm_username', name);
    document.getElementById('new-room-name').value = `${name}的房间`;
    
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

function createRoom() {
    const name = document.getElementById('new-room-name').value || (multiUsername.split('#')[0] + "的房间");
    socket.emit('create_room', { name, isPrivate: false });
    showScreen('multi-room-screen');
}

function joinRoom(id) {
    window.history.replaceState({}, '', `multiplayer.html?room=${id}`);
    socket.emit('join_room', { roomId: id });
    showScreen('multi-room-screen');
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
        queueList.innerHTML = '<div style="color:#666; text-align:center; padding: 20px;">队列为空</div>';
    } else {
        queueList.innerHTML = roomData.mapQueue.map((m, i) => `
            <div class="queue-item">
                <div class="queue-item-info">
                    <span style="font-weight:700; font-size:14px; color:#fff;">[0${i+1}] ${m.title}</span>
                    <span style="font-size:12px; color:#aaa;">${m.artist} // ${m.version}</span>
                </div>
                ${isHost ? `<div class="queue-item-remove" onclick="socket.emit('remove_from_queue', ${i})">删除</div>` : ''}
            </div>
        `).join('');
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
            <span style="font-size:14px; color:#eee;">${p.uid === roomData.host ? '<span style="color:#fbbf24">[房主]</span> ' : ''}<b>${p.name}</b></span>
            <span class="status-badge st-${p.status}">${statusNames[p.status] || p.status} ${p.isOffline ? '(离线)' : ''}</span>
        </div>
    `).join('');

    if (roomData.chat) {
        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML = roomData.chat.map(msg => `<div><b style="color:#60a5fa;">${msg.sender}:</b> <span style="color:#ddd">${msg.text}</span></div>`).join('');
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    const actBtn = document.getElementById('btn-action');
    const specBtn = document.getElementById('btn-spectate');

    if (roomData.state === 'playing') {
        specBtn.style.display = 'none';
        actBtn.innerText = '加入观战';
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
            window.location.href = 'game.html';
        };
        actBtn.style.background = '#8b5cf6'; actBtn.style.color = '#fff';
    } else {
        specBtn.style.display = 'block';
        specBtn.innerText = me.status === 'spectating' ? '停止观战' : '观战';
        specBtn.onclick = () => socket.emit('change_status', me.status === 'spectating' ? 'idle' : 'spectating');
        specBtn.style.color = me.status === 'spectating' ? '#c4b5fd' : '#ccc';
        specBtn.style.borderColor = me.status === 'spectating' ? '#8b5cf6' : 'rgba(255,255,255,0.2)';
        specBtn.style.background = me.status === 'spectating' ? 'rgba(139, 92, 246, 0.1)' : 'transparent';

        if (!currentMap) {
            actBtn.innerText = '等待选择谱面';
            actBtn.onclick = null;
            actBtn.style.background = '#4b5563'; actBtn.style.color = '#fff';
        } else if (me.status === 'nomap') {
            if (currentMap.url) {
                actBtn.innerText = '下载谱面';
                actBtn.onclick = downloadMap;
                actBtn.style.background = '#3b82f6'; actBtn.style.color = '#fff';
            } else {
                actBtn.innerText = '房主未分享该谱面';
                actBtn.onclick = null;
                actBtn.style.background = '#ef4444'; actBtn.style.color = '#fff';
            }
        } else if (me.status === 'spectating' && !checkLocalMap(currentMap)) {
            if (currentMap.url) {
                actBtn.innerText = '下载谱面以观战';
                actBtn.onclick = downloadMap;
                actBtn.style.background = '#3b82f6'; actBtn.style.color = '#fff';
            } else {
                actBtn.innerText = '无法观战 (缺少谱面)';
                actBtn.onclick = null;
                actBtn.style.background = '#ef4444'; actBtn.style.color = '#fff';
            }
        } else if (me.status === 'downloading') {
            actBtn.innerText = '下载中...';
            actBtn.onclick = null;
            actBtn.style.background = '#3b82f6'; actBtn.style.color = '#fff';
        } else if (me.status === 'idle') {
            actBtn.innerText = '准备';
            actBtn.onclick = () => socket.emit('change_status', 'ready');
            actBtn.style.background = '#10b981'; actBtn.style.color = '#fff';
        } else if (me.status === 'ready' || me.status === 'spectating') {
            if (isHost) {
                actBtn.innerText = '强制开始';
                actBtn.onclick = () => socket.emit('start_game');
                actBtn.style.background = '#d946ef'; actBtn.style.color = '#fff';
            } else {
                actBtn.innerText = me.status === 'ready' ? '取消准备' : '等待房主';
                actBtn.onclick = me.status === 'ready' ? () => socket.emit('change_status', 'idle') : null;
                actBtn.style.background = me.status === 'ready' ? '#f59e0b' : '#4b5563'; 
                actBtn.style.color = '#fff'; 
            }
        }
    }
    window.history.replaceState({}, '', `multiplayer.html?room=${roomData.id}`);
}

async function downloadMap() {
    if (!roomData || roomData.mapQueue.length === 0) return;
    const currentMap = roomData.mapQueue[0];
    if (!currentMap.url) return;

    const previousStatus = roomData.players.find(p => p.uid === multiUid)?.status;
    socket.emit('change_status', 'downloading');
    const sts = document.getElementById('upload-status');
    try {
        sts.innerText = "正在从远程服务器下载...";
        const res = await fetch(currentMap.url); 
        if (!res.ok) throw new Error('文件损坏或丢失');
        const blob = await res.blob();
        
        sts.innerText = "正在本地解压文件...";
        const fd = new FormData();
        fd.append('file', blob, 'map.osz');
        fd.append('folderPath', localStorage.getItem('wm_folderPath'));
        
        await fetch(`${LOCAL_API_URL}/upload`, { method: 'POST', body: fd });
        
        sts.innerText = "正在同步本地数据库...";
        const scanRes = await fetch(`${LOCAL_API_URL}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: localStorage.getItem('wm_folderPath'), forceRescan: true }) });
        const scanData = await scanRes.json();
        if(scanData.success) beatmapsCache = scanData.beatmaps || [];

        sts.innerText = "完成。"; 
        setTimeout(() => sts.innerText = "", 2000);
        socket.emit('change_status', previousStatus === 'spectating' ? 'spectating' : 'idle'); 
    } catch (e) { 
        sts.innerText = "错误: " + e.message; 
        socket.emit('change_status', 'nomap'); 
    }
}

async function getFileHash(fileOrBlob) {
    const buffer = await fileOrBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const dropZone = document.getElementById('drop-zone');
dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; dropZone.style.background = 'rgba(59, 130, 246, 0.1)'; };
dropZone.ondragleave = e => { e.preventDefault(); dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; dropZone.style.background = 'transparent'; };
dropZone.ondrop = async e => {
    e.preventDefault(); dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; dropZone.style.background = 'transparent';
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.osz')) return;
    const sts = document.getElementById('upload-status');
    
    try {
        sts.innerText = "正在检查远程服务器是否已存在该谱面...";
        const hashHex = await getFileHash(file);
        
        const checkRes = await fetch(`${REMOTE_API_URL}/check_map_hash?hash=${hashHex}`);
        const checkData = await checkRes.json();

        if (checkData.exists) {
            sts.innerText = "触发秒传！正在添加谱面至队列...";
            socket.emit('add_map_to_queue', { url: checkData.data.url, title: checkData.data.title, artist: checkData.data.artist, version: checkData.data.version });
            setTimeout(() => sts.innerText = "", 3000);
            return; 
        }

        sts.innerText = "正在上传 .osz 至远程服务器...";
        const fd = new FormData(); 
        fd.append('file', file);
        fd.append('hash', hashHex); 
        
        const res = await fetch(`${REMOTE_API_URL}/upload_room_map`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            sts.innerText = "上传完成，已添加至队列！";
            socket.emit('add_map_to_queue', { url: data.url, title: data.title, artist: data.artist, version: data.version });
            setTimeout(() => sts.innerText = "", 2000);
        } else throw new Error(data.error);
    } catch (e) { sts.innerText = "错误: " + e.message; }
};

function openMultiMapSelector() {
    document.getElementById('select-overlay').style.display = 'flex';
    const iframe = document.getElementById('select-iframe');
    if (!iframe.src) iframe.src = 'index.html?selector=true';
}

function closeMapSelector() { document.getElementById('select-overlay').style.display = 'none'; }

window.addEventListener('message', async e => {
    if (e.data && e.data.type === 'select_map') {
        closeMapSelector();
        const map = e.data.map;
        const sts = document.getElementById('upload-status');
        sts.innerText = "正在打包本地谱面文件夹...";

        try {
            const packRes = await fetch(`${LOCAL_API_URL}/pack_map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dirPath: map.dirPath })
            });
            
            if (!packRes.ok) throw new Error("本地打包失败");
            const blob = await packRes.blob();

            sts.innerText = "正在计算哈希值...";
            const hashHex = await getFileHash(blob);

            sts.innerText = "正在检查远程服务器是否已存在该谱面...";
            const checkRes = await fetch(`${REMOTE_API_URL}/check_map_hash?hash=${hashHex}`);
            const checkData = await checkRes.json();

            let finalUrl = null;

            if (checkData.exists) {
                sts.innerText = "触发秒传！正在添加谱面至队列...";
                finalUrl = checkData.data.url;
            } else {
                sts.innerText = "正在上传已打包的谱面至远程服务器...";
                const fd = new FormData();
                fd.append('file', blob, 'map.osz');
                fd.append('hash', hashHex);
                
                const upRes = await fetch(`${REMOTE_API_URL}/upload_room_map`, { method: 'POST', body: fd });
                const upData = await upRes.json();
                if(upData.success) { finalUrl = upData.url; } else { throw new Error(upData.error); }
            }

            sts.innerText = "已添加至队列！";
            socket.emit('add_map_to_queue', { title: map.title, artist: map.artist, version: map.version, url: finalUrl, id: map.id });
            setTimeout(() => sts.innerText = "", 2000);
        } catch (err) {
            sts.innerText = "分享错误: " + err.message;
            socket.emit('add_map_to_queue', { title: map.title, artist: map.artist, version: map.version, url: null, id: map.id });
        }
    }
});