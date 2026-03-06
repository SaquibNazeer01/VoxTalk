document.addEventListener('DOMContentLoaded', () => {

  // ===== DOM =====
  const joinScreen  = document.getElementById('join-screen');
  const roomScreen  = document.getElementById('room-screen');
  const joinBtn     = document.getElementById('join-btn');
  const createBtn   = document.getElementById('create-btn');
  const leaveBtn    = document.getElementById('leave-btn');
  const nameInput   = document.getElementById('username-input');
  const codeInput   = document.getElementById('server-id-input');
  const lcdChannel  = document.getElementById('lcd-channel');
  const lcdStatus   = document.getElementById('lcd-status');
  const lcdUsersCount = document.getElementById('lcd-users-count');
  const lcdTime     = document.getElementById('lcd-time');
  const lcdSignal   = document.getElementById('lcd-signal');
  const lcdMiddle   = document.querySelector('.lcd-middle');
  const ledLight    = document.getElementById('led-light');
  const pttBtn      = document.getElementById('ptt-btn');
  const usersList   = document.getElementById('users-list');
  const logList     = document.getElementById('activity-log');
  const audioBox    = document.getElementById('audio-container');

  // ===== STATE =====
  let socket = null;
  let myId = '';
  let myName = 'Operator';
  let roomId = '';
  let localStream = null;
  const peers = {};
  const audioEls = {};
  const users = {};   // peerId -> { name }

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  // ===== LCD CLOCK =====
  const updateClock = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    lcdTime.textContent = `${h}:${m}:${s}`;
  };
  setInterval(updateClock, 1000);
  updateClock();

  // ===== HELPERS =====
  const log = (msg) => {
    const li = document.createElement('li');
    const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    li.textContent = `${t} ${msg}`;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
    while (logList.children.length > 50) logList.removeChild(logList.firstChild);
  };

  const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const showScreen = (s) => {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    s.classList.add('active');
  };

  const renderUsers = () => {
    usersList.innerHTML = '';
    // self
    const me = document.createElement('li');
    me.className = 'is-me';
    me.id = 'user-me';
    me.innerHTML = `<span class="u-dot"></span>${myName} (You)`;
    usersList.appendChild(me);
    // peers
    Object.keys(users).forEach(pid => {
      const li = document.createElement('li');
      li.id = `user-${pid}`;
      li.innerHTML = `<span class="u-dot"></span>${users[pid].name}`;
      usersList.appendChild(li);
    });
    const count = Object.keys(users).length + 1;
    lcdUsersCount.textContent = `USR: ${count}`;
  };

  // ===== AUDIO =====
  const initAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getAudioTracks().forEach(t => t.enabled = false);
      localStream = stream;
      log('MIC OK');
      return true;
    } catch (e) {
      alert('Microphone required.\n' + e.message);
      return false;
    }
  };

  // ===== WEBRTC =====
  const createPeer = (userId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[userId] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice-candidate', { target: userId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      if (!audioEls[userId]) {
        const a = document.createElement('audio');
        a.autoplay = true;
        audioBox.appendChild(a);
        audioEls[userId] = a;
      }
      audioEls[userId].srcObject = e.streams[0];
    };

    return pc;
  };

  // ===== SOCKET =====
  const connectRoom = (rId) => {
    roomId = rId;
    lcdChannel.textContent = roomId;
    lcdStatus.textContent = 'LINKING...';
    log(`Tuning to CH ${roomId}`);

    socket = io('/');

    socket.on('connect', () => {
      log('Signal linked.');
      lcdStatus.textContent = 'STANDBY';
      lcdSignal.classList.add('active');
      socket.emit('join-room', { roomId, name: myName });
    });

    socket.on('me', (id) => { myId = id; });

    socket.on('user-joined', async (data) => {
      users[data.id] = { name: data.name || 'User' };
      renderUsers();
      log(`+ ${users[data.id].name}`);
      const pc = createPeer(data.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { target: data.id, sdp: offer, name: myName });
    });

    socket.on('offer', async (data) => {
      if (!users[data.source]) { users[data.source] = { name: data.name || 'User' }; renderUsers(); }
      const pc = createPeer(data.source);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { target: data.source, sdp: answer, name: myName });
    });

    socket.on('answer', async (data) => {
      if (!users[data.source]) { users[data.source] = { name: data.name || 'User' }; renderUsers(); }
      const pc = peers[data.source];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    });

    socket.on('ice-candidate', async (data) => {
      const pc = peers[data.source];
      if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
    });

    socket.on('user-talking', (data) => {
      const name = users[data.id]?.name || 'Unknown';
      lcdStatus.textContent = `RX: ${name.toUpperCase()}`;
      lcdMiddle.classList.remove('transmitting');
      lcdMiddle.classList.add('receiving');
      const el = document.getElementById(`user-${data.id}`);
      if (el) el.classList.add('talking');
    });

    socket.on('user-stopped-talking', (data) => {
      lcdStatus.textContent = 'STANDBY';
      lcdMiddle.classList.remove('receiving');
      const el = document.getElementById(`user-${data.id}`);
      if (el) el.classList.remove('talking');
    });

    socket.on('user-left', (userId) => {
      const name = users[userId]?.name || 'User';
      log(`- ${name}`);
      if (peers[userId]) { peers[userId].close(); delete peers[userId]; }
      if (audioEls[userId]) { audioEls[userId].remove(); delete audioEls[userId]; }
      delete users[userId];
      renderUsers();
    });
  };

  // ===== PTT =====
  const startTx = () => {
    if (!localStream || !socket) return;
    localStream.getAudioTracks().forEach(t => t.enabled = true);
    socket.emit('talking', roomId);
    pttBtn.classList.add('active');
    lcdStatus.textContent = 'TX: TRANSMITTING';
    lcdMiddle.classList.remove('receiving');
    lcdMiddle.classList.add('transmitting');
    ledLight.classList.remove('led-on');
    ledLight.classList.add('led-on');
    ledLight.style.background = 'var(--led-red)';
    ledLight.style.boxShadow = '0 0 8px var(--led-red), 0 0 20px rgba(255,34,34,0.3)';
    const me = document.getElementById('user-me');
    if (me) me.classList.add('talking');
  };

  const stopTx = () => {
    if (!localStream || !socket) return;
    localStream.getAudioTracks().forEach(t => t.enabled = false);
    socket.emit('stopped-talking', roomId);
    pttBtn.classList.remove('active');
    lcdStatus.textContent = 'STANDBY';
    lcdMiddle.classList.remove('transmitting');
    ledLight.style.background = '';
    ledLight.style.boxShadow = '';
    const me = document.getElementById('user-me');
    if (me) me.classList.remove('talking');
  };

  // ===== LEAVE =====
  const leave = () => {
    if (socket) { socket.disconnect(); socket = null; }
    Object.keys(peers).forEach(id => { peers[id].close(); delete peers[id]; });
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    audioBox.innerHTML = '';
    Object.keys(users).forEach(k => delete users[k]);
    logList.innerHTML = '<li>Radio powered on...</li>';
    lcdChannel.textContent = '------';
    lcdStatus.textContent = 'STANDBY';
    lcdMiddle.classList.remove('transmitting', 'receiving');
    lcdUsersCount.textContent = 'USR: 1';
    lcdSignal.classList.remove('active');
    usersList.innerHTML = '';
    showScreen(joinScreen);
  };

  // ===== EVENTS =====
  const getName = () => {
    const n = nameInput.value.trim();
    if (!n) { alert('Please enter your callsign (name).'); return null; }
    return n;
  };

  createBtn.addEventListener('click', async () => {
    const n = getName();
    if (!n) return;
    myName = n;
    const ok = await initAudio();
    if (ok) { showScreen(roomScreen); renderUsers(); connectRoom(genCode()); }
  });

  joinBtn.addEventListener('click', async () => {
    const n = getName();
    if (!n) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { alert('Please enter a channel code.'); return; }
    myName = n;
    const ok = await initAudio();
    if (ok) { showScreen(roomScreen); renderUsers(); connectRoom(code); }
  });

  leaveBtn.addEventListener('click', leave);

  // Mouse PTT
  pttBtn.addEventListener('mousedown', startTx);
  pttBtn.addEventListener('mouseup', stopTx);
  pttBtn.addEventListener('mouseleave', stopTx);

  // Touch PTT
  pttBtn.addEventListener('touchstart', e => { e.preventDefault(); startTx(); }, { passive: false });
  pttBtn.addEventListener('touchend', e => { e.preventDefault(); stopTx(); }, { passive: false });
  pttBtn.addEventListener('touchcancel', e => { e.preventDefault(); stopTx(); }, { passive: false });

  // Keyboard PTT (spacebar)
  let spaceHeld = false;
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !spaceHeld && roomScreen.classList.contains('active') && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); spaceHeld = true; startTx();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space' && spaceHeld) {
      e.preventDefault(); spaceHeld = false; stopTx();
    }
  });

});
