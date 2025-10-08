import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = 3000;
/**
 * App HTTP + Socket.IO
 */
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '192.168.0.131:5173' }, // Puerto del cliente en React
  transports: ['websocket'],
});

app.get('/status', (_req, res) => res.status(200).send('ok'));

/**
 * Validadores simples
 */
const isValidUsername = (u: unknown): u is string => {
  if (typeof u !== 'string') return false;
  const username = u.trim();
  // 3–20 chars, letras, números, guion y guion bajo
  return username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(username);
};

const isValidText = (t: unknown): t is string => {
  if (typeof t !== 'string') return false;
  const text = t.trim();
  return text.length > 0 && text.length <= 100;
};

/**
 * Estado en memoria (solo conectados)
 */
const usersBySocket = new Map<string, string>(); // socket.id -> username
const socketsByUser = new Map<string, string>(); // username   -> socket.id

type HelloPayload = { username: string };
type ChatInPayload = { text: string };
type ChatOutPayload = { username: string; text: string; at: number };

io.on('connection', (socket) => {
  console.log(`[io] connection ${socket.id} from ${socket.handshake.address}`);

  let registered = false;
  let username: string | null = null;

  // Exigimos un handshake 'hello' en <= 5s
  const helloTimeout = setTimeout(() => {
    if (!registered) {
      socket.emit('server:error', { code: 'HELLO_TIMEOUT', message: 'Debe enviar hello {username} dentro de 5s.' });
      console.warn(`[io] ${socket.id} hello timeout`);
      socket.disconnect(true);
    }
  }, 5000);

  socket.on('hello', (payload: HelloPayload) => {
    try {
      if (registered) return; // se evita doble alta

      if (!payload || !isValidUsername(payload.username)) {
        socket.emit('server:error', { code: 'INVALID_USERNAME', message: 'Username inválido'});
        // pequeño delay para que el cliente reciba el error antes de cerrar
        return setTimeout(() => socket.disconnect(true), 50);
      }

      const desired = payload.username.trim();
      if (socketsByUser.has(desired)) {
        socket.emit('server:error', { code: 'USERNAME_TAKEN', message: 'Ese nombre ya está en uso' });
        return setTimeout(() => socket.disconnect(true), 50);
      }

      // Registro en memoria
      registered = true;
      username = desired;
      usersBySocket.set(socket.id, username);
      socketsByUser.set(username, socket.id);

      // Respuesta al nuevo
      const connectedUsers = Array.from(socketsByUser.keys());
      socket.emit('welcome', { username, connectedUsers });

      // Notifica a los demás
      socket.broadcast.emit('user_joined', { username });

      console.log(`[io] ${socket.id} registered as "${username}"`);
    } catch (err) {
      console.error('[io] hello handler error', err);
      socket.emit('server:error', { code: 'INTERNAL', message: 'Error interno en hello.' });
    } finally {
      clearTimeout(helloTimeout);
    }
  });

  socket.on('chat:public', (payload: ChatInPayload) => {
    try {
      if (!registered || !username) {
        socket.emit('server:error', { code: 'NOT_REGISTERED', message: 'Primero envía hello {username}.' });
        return;
      }
      if (!payload || !isValidText(payload.text)) {
        socket.emit('server:error', { code: 'INVALID_MESSAGE', message: 'Mensaje vacío o demasiado largo (≤2000).' });
        return;
      }
      const msg: ChatOutPayload = {
        username,
        text: payload.text.trim(),
        at: Date.now(),
      };
      io.emit('chat:public', msg);
    } catch (err) {
      console.error('[io] chat handler error', err);
      socket.emit('server:error', { code: 'INTERNAL', message: 'Error interno enviando mensaje.' });
    }
  });

  socket.on('command:list', () => {
    try {
      const users = Array.from(socketsByUser.keys());
      socket.emit('users:list', { users });
    } catch (err) {
      console.error('[io] command:list error', err);
      socket.emit('server:error', { code: 'INTERNAL', message: 'Error listando usuarios.' });
    }
  });

  socket.on('command:quit', () => {
    try {
      socket.disconnect(true);
    } catch (err) {
      console.error('[io] command:quit error', err);
    }
  });

  socket.on('disconnect', (reason) => {
    clearTimeout(helloTimeout);
    const leftUser = usersBySocket.get(socket.id);
    if (leftUser) {
      usersBySocket.delete(socket.id);
      socketsByUser.delete(leftUser);
      socket.broadcast.emit('user_left', { username: leftUser });
      console.log(`[io] ${socket.id} (${leftUser}) disconnected: ${reason}`);
    } else {
      console.log(`[io] ${socket.id} disconnected before register: ${reason}`);
    }
  });

  //Manejo de errores de socket
  socket.on('error', (err) => {
    console.error(`[io] socket error ${socket.id}`, err);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});