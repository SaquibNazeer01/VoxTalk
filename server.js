const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to provide TURN credentials to clients
app.get('/api/ice-servers', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Track users: socketId -> { name, roomId }
const users = {};

// Get list of user IDs in a room (excluding the requesting socket)
const getRoomMembers = (roomId, excludeId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];
  return [...room].filter(id => id !== excludeId);
};

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, name } = data;
    socket.join(roomId);
    users[socket.id] = { name: name || 'User', roomId };
    console.log(`${name} (${socket.id}) joined room ${roomId}`);

    // Send the existing members list to the new joiner
    const existingMembers = getRoomMembers(roomId, socket.id).map(id => ({
      id,
      name: users[id]?.name || 'User'
    }));
    socket.emit('room-members', existingMembers);

    // Notify existing users about the new joiner
    socket.to(roomId).emit('user-joined', { id: socket.id, name });
    socket.emit('me', socket.id);
  });

  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      source: socket.id,
      sdp: data.sdp,
      name: data.name || users[socket.id]?.name || 'User'
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      source: socket.id,
      sdp: data.sdp,
      name: data.name || users[socket.id]?.name || 'User'
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      source: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('talking', (roomId) => {
    socket.to(roomId).emit('user-talking', {
      id: socket.id,
      name: users[socket.id]?.name || 'User'
    });
  });

  socket.on('stopped-talking', (roomId) => {
    socket.to(roomId).emit('user-stopped-talking', {
      id: socket.id
    });
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit('user-left', socket.id);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id, users[socket.id]?.name);
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`VoxTalk Server running → http://localhost:${PORT}`);
});
