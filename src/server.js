import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => socket.join(`session:${sessionId}`));
});
server.listen(env.port, () => console.log(`Сервер работает localhost: ${env.port}`));
