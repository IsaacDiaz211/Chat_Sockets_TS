import { io, Socket } from "socket.io-client";

export type WelcomePayload = { username: string; connectedUsers: string[] };
export type ChatOutPayload = { username: string; text: string; at: number };

type ServerToClientEvents = {
  welcome: (p: WelcomePayload) => void;
  "chat:public": (p: ChatOutPayload) => void;
  "users:list": (p: { users: string[] }) => void;
  user_joined: (p: { username: string }) => void;
  user_left: (p: { username: string }) => void;
  "server:error": (p: { code: string; message: string }) => void;
};

type ClientToServerEvents = {
  hello: (p: { username: string }) => void;
  "chat:public": (p: { text: string }) => void;
  "command:list": () => void;
  "command:quit": () => void;
};

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let intendedUsername = "";

const defaultUrl = (): string => {
  const env = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;
  if (env && env.trim()) return env;
  const host = "192.168.0.131";
  return `http://${host}:3000`;
};

const ensureSocket = (url?: string) => {
  if (socket) return socket;
  socket = io(url ?? defaultUrl(), {
    transports: ["websocket"],
    autoConnect: false,
  });
  return socket;
};

export const connect = (username: string, url?: string): Promise<WelcomePayload> => {
  intendedUsername = username.trim();
  const s = ensureSocket(url);

  return new Promise<WelcomePayload>((resolve, reject) => {
    const onWelcome = (payload: WelcomePayload) => {
      cleanup();
      resolve(payload);
    };
    const onConnectError = (err: any) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("connect_error"));
    };
    const onServerError = (e: { code: string; message: string }) => {
      if (e.code === "USERNAME_TAKEN" || e.code === "INVALID_USERNAME" || e.code === "HELLO_TIMEOUT") {
        cleanup();
        reject(new Error(e.message));
      }
    };
    const onConnect = () => {
      s.emit("hello", { username: intendedUsername });
    };
    const cleanup = () => {
      s.off("welcome", onWelcome);
      s.off("connect_error", onConnectError);
      s.off("server:error", onServerError);
      s.off("connect", onConnect);
    };

    s.on("connect", onConnect);
    s.once("welcome", onWelcome);
    s.once("connect_error", onConnectError);
    s.on("server:error", onServerError);

    if (!s.connected) s.connect();
    else s.emit("hello", { username: intendedUsername });
  });
};

export const disconnect = () => {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
};

export const sendMessage = (text: string) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  s.emit("chat:public", { text });
};

export const requestUsers = () => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  s.emit("command:list");
};

export const quit = () => {
  const s = socket;
  if (!s) return;
  s.emit("command:quit");
};

export const onChat = (cb: (m: ChatOutPayload) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  s.on("chat:public", cb);
  return () => s.off("chat:public", cb);
};

export const onUsersList = (cb: (users: string[]) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  const handler = (p: { users: string[] }) => cb(p.users);
  s.on("users:list", handler);
  return () => s.off("users:list", handler);
};

export const onUserJoined = (cb: (username: string) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  const handler = (p: { username: string }) => cb(p.username);
  s.on("user_joined", handler);
  return () => s.off("user_joined", handler);
};

export const onUserLeft = (cb: (username: string) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  const handler = (p: { username: string }) => cb(p.username);
  s.on("user_left", handler);
  return () => s.off("user_left", handler);
};

export const onServerError = (cb: (err: { code: string; message: string }) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  s.on("server:error", cb);
  return () => s.off("server:error", cb);
};

export const onDisconnect = (cb: (reason: string) => void) => {
  const s = socket;
  if (!s) throw new Error("Socket no inicializado");
  s.on("disconnect", cb);
  return () => s.off("disconnect", cb);
};

export const isConnected = () => !!socket && socket.connected;
export const getCurrentUsername = () => intendedUsername || "";