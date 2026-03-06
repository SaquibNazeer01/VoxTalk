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
  let rtcConfig = null;       // Fetched from server
  const peers = {};           // peerId -> RTCPeerConnection
  const audioEls = {};        // peerId -> HTMLAudioElement
  const users = {};           // peerId -> { name }

  // ===== FETCH TURN CONFIG FROM SERVER =====
  const fetchIceServers = async () => {
    try {
      const res = await fetch('/api/ice-servers');
      const data = await res.json();
      rtcConfig = data;
      console.log('ICE servers loaded:', rtcConfig.iceServers.length, 'servers');
      return true;
    } catch (e) {
      console.error('Failed to fetch ICE servers, using fallback:', e);
      // Fallback - STUN only (may not work behind NAT)
      rtcConfig = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };
      return true;
    }
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
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    // Self
    const me = document.createElement('li');
    me.className = 'is-me';
    me.id = 'user-me';
    me.innerHTML = `<span class="u-dot"></span>${myName} (You)`;
    usersList.appendChild(me);
    // Peers
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      // Mute by default (PTT)
      stream.getAudioTracks().forEach(t => t.enabled = false);
      localStream = stream;
      log('MIC OK');
      return true;
    } catch (e) {
      console.error('Mic error:', e);
      alert('Microphone access is required.\n\n' + e.message);
      return false;
    }
  };

  // Play audio element (handles autoplay restrictions)
  const playAudio = (audioEl) => {
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Autoplay blocked, will retry on user interaction:', err);
        // Retry on next user interaction
        const retryPlay = () => {
          audioEl.play().catch(() => {});
          document.removeEventListener('click', retryPlay);
          document.removeEventListener('touchstart', retryPlay);
        };
        document.addEventListener('click', retryPlay);
        document.addEventListener('touchstart', retryPlay);
      });
    }
  };

  // ===== WEBRTC =====
  const createPeer = (userId) => {
    console.log(`Creating peer connection for ${userId}`);
    const pc = new RTCPeerConnection(rtcConfig);
    peers[userId] = pc;

    // Add local audio tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
        console.log(`Added track: ${track.kind} to peer ${userId}`);
      });
    }

    // Send ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { target: userId, candidate: e.candidate });
      }
    };

    // Monitor connection state
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`ICE state for ${userId}: ${state}`);
      if (state === 'connected' || state === 'completed') {
        log(`Link OK: ${users[userId]?.name || 'peer'}`);
      } else if (state === 'failed') {
        log(`Link FAIL: ${users[userId]?.name || 'peer'}`);
        // Try to restart ICE
        pc.restartIce();
      } else if (state === 'disconnected') {
        log(`Link DROP: ${users[userId]?.name || 'peer'}`);
      }
    };

    // Receive remote audio
    pc.ontrack = (e) => {
      console.log(`Received remote track from ${userId}:`, e.track.kind);
      if (!audioEls[userId]) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute('playsinline', '');
        audioBox.appendChild(audio);
        audioEls[userId] = audio;
      }
      audioEls[userId].srcObject = e.streams[0];
      playAudio(audioEls[userId]);
    };

    return pc;
  };

  // ===== SOCKET / SIGNALING =====
  const connectRoom = (rId) => {
    roomId = rId;
    lcdChannel.textContent = roomId;
    lcdStatus.textContent = 'LINKING...';
    log(`Tuning to CH ${roomId}`);

    socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      log('Signal linked.');
      lcdStatus.textContent = 'STANDBY';
      lcdSignal.classList.add('active');
      socket.emit('join-room', { roomId, name: myName });
    });

    socket.on('me', (id) => {
      myId = id;
      console.log('My ID:', myId);
    });

    // Existing members already in room
    socket.on('room-members', async (members) => {
      console.log('Existing members:', members);
      for (const member of members) {
        users[member.id] = { name: member.name };
        // Initiate connection to each existing member
        const pc = createPeer(member.id);
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          socket.emit('offer', { target: member.id, sdp: offer, name: myName });
          console.log(`Sent offer to existing member ${member.name}`);
        } catch (err) {
          console.error('Error creating offer for existing member:', err);
        }
      }
      renderUsers();
    });

    // New peer joined after me
    socket.on('user-joined', async (data) => {
      console.log('New user joined:', data);
      users[data.id] = { name: data.name || 'User' };
      renderUsers();
      log(`+ ${users[data.id].name}`);
      // Don't initiate offer here — the new joiner will send offers via room-members
    });

    socket.on('offer', async (data) => {
      console.log('Received offer from:', data.source, data.name);
      if (!users[data.source]) {
        users[data.source] = { name: data.name || 'User' };
        renderUsers();
      }
      // If we already have a peer for this user, close it first
      if (peers[data.source]) {
        peers[data.source].close();
        delete peers[data.source];
      }
      const pc = createPeer(data.source);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: data.source, sdp: answer, name: myName });
        console.log('Sent answer to:', data.source);
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('answer', async (data) => {
      console.log('Received answer from:', data.source);
      if (!users[data.source]) {
        users[data.source] = { name: data.name || 'User' };
        renderUsers();
      }
      const pc = peers[data.source];
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log('Set remote description from answer');
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    });

    socket.on('ice-candidate', async (data) => {
      const pc = peers[data.source];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn('ICE candidate error (may be normal):', e.message);
        }
      }
    });

    // Talking indicators
    socket.on('user-talking', (data) => {
      const name = users[data.id]?.name || 'Someone';
      lcdStatus.textContent = `RX: ${name.toUpperCase()}`;
      lcdMiddle.classList.remove('transmitting');
      lcdMiddle.classList.add('receiving');
      const el = document.getElementById(`user-${data.id}`);
      if (el) el.classList.add('talking');

      // Ensure audio is playing (browser autoplay workaround)
      if (audioEls[data.id]) {
        playAudio(audioEls[data.id]);
      }
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

    socket.on('disconnect', () => {
      log('Signal lost. Reconnecting...');
      lcdStatus.textContent = 'NO SIGNAL';
      lcdSignal.classList.remove('active');
    });

    socket.on('reconnect', () => {
      log('Signal restored.');
      lcdStatus.textContent = 'STANDBY';
      lcdSignal.classList.add('active');
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
    await fetchIceServers();
    const ok = await initAudio();
    if (ok) { showScreen(roomScreen); renderUsers(); connectRoom(genCode()); }
  });

  joinBtn.addEventListener('click', async () => {
    const n = getName();
    if (!n) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { alert('Please enter a channel code.'); return; }
    myName = n;
    await fetchIceServers();
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
