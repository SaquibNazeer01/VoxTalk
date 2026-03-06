const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Track users: socketId -> { name, roomId }
const users = {};

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, name } = data;
    socket.join(roomId);
    users[socket.id] = { name: name || 'User', roomId };
    console.log(`${name} (${socket.id}) joined room ${roomId}`);

    // Notify existing users in the room
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
