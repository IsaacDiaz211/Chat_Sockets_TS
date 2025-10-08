import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Layout,
  Typography,
  Input,
  Button,
  Space,
  List,
  Badge,
  Popover,
  Divider,
  notification,
  theme,
  Grid,
} from "antd";
import { SendOutlined, UsergroupAddOutlined, LogoutOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import type { ChatOutPayload } from "../utils/socket";
import {
  isConnected,
  getCurrentUsername,
  disconnect,
  sendMessage,
  requestUsers,
  quit,
  onChat,
  onUsersList,
  onUserJoined,
  onUserLeft,
  onServerError,
  onDisconnect,
} from "../utils/socket";

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

type RouteState = { username?: string };

type Message =
  | ({ kind: "chat" } & ChatOutPayload)
  | { kind: "system"; text: string; at: number };

const fmtTime = (t: number) => {
  const d = new Date(t);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: RouteState };
  const locationUsername = state?.username;
  const storedUsername = sessionStorage.getItem("chat.username") || "";
  const username = useMemo(
    () => locationUsername || storedUsername || getCurrentUsername(),
    [locationUsername, storedUsername]
  );

  const [api, contextHolder] = notification.useNotification();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // < md = mobile

  const [users, setUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!username || !isConnected()) navigate("/", { replace: true });
  }, [username, navigate]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!isConnected()) return;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onChat((msg) => setMessages((m) => [...m, { kind: "chat", ...msg }])),
      onUsersList((u) => setUsers(u)),
      onUserJoined((u) => {
        setUsers((prev) => (prev.includes(u) ? prev : [...prev, u]));
        setMessages((m) => [...m, { kind: "system", text: `${u} se unió`, at: Date.now() }]);
      }),
      onUserLeft((u) => {
        setUsers((prev) => prev.filter((x) => x !== u));
        setMessages((m) => [...m, { kind: "system", text: `${u} salió`, at: Date.now() }]);
      }),
      onServerError((e) => api.error({ message: "Error del servidor", description: e.message })),
      onDisconnect((reason) => {
        setMessages((m) => [
          ...m,
          { kind: "system", text: `Desconectado (${reason})`, at: Date.now() },
        ]);
        navigate("/", { replace: true });
      })
    );

    requestUsers();
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usersContent = useMemo(
    () => (
      <div style={{ maxWidth: 260, maxHeight: "50vh", overflowY: "auto" }}>
        <Text strong>Conectados</Text>
        <Divider style={{ margin: "8px 0" }} />
        <Space direction="vertical" size={6}>
          {users.length === 0 ? (
            <Text type="secondary">Nadie conectado.</Text>
          ) : (
            users.map((u) => (
              <Text key={u} style={{ wordBreak: "break-word" }}>
                • {u}
              </Text>
            ))
          )}
        </Space>
      </div>
    ),
    [users]
  );

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    if (t === "/listar") {
      requestUsers();
      setText("");
      return;
    }
    if (t === "/quitar") {
      quit();
      setText("");
      sessionStorage.removeItem("chat.username");
      return;
    }
    try {
      sendMessage(t);
      setText("");
    } catch (e: any) {
      api.error({ message: "No se pudo enviar", description: e?.message ?? "Error desconocido" });
    }
  };

  return (
    <Layout
      style={{
        minHeight: "100svh",
        background: "linear-gradient(135deg, #0B1220 0%, #0E1B2E 40%, #0F2342 100%)",
        display: "flex",
      }}
    >
      {contextHolder}

      <Header
        style={{
          background: "rgba(10,16,28,0.6)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          {/* Lado izquierdo: título + usuario */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>
              {isMobile ? "Chat" : "Sala global"}
            </Title>
            {!isMobile && <Text type="secondary">Conectado como</Text>}
            <Text
              strong
              style={{
                maxWidth: isMobile ? "40vw" : 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={username}
            >
              {username}
            </Text>
          </div>

          <Space wrap>
            
            <Popover content={usersContent} trigger="click" placement="bottomRight">
              <Button
                ghost
                icon={<UsergroupAddOutlined />}
                style={{ borderColor: "rgba(255,255,255,0.2)" }}
              >
                <Badge
                  count={users.length}
                  overflowCount={99}
                  style={{ backgroundColor: token.colorPrimary }}
                />
              </Button>
            </Popover>
            <Button
              danger
              ghost
              icon={<LogoutOutlined />}
              onClick={() => {
                try {
                  quit();
                } finally {
                  sessionStorage.removeItem("chat.username");
                  disconnect();
                  navigate("/", { replace: true });
                }
              }}
            >
              {!isMobile && "Salir"}
            </Button>
          </Space>
        </div>
      </Header>

      <Content style={{ padding: "12px 12px 0", display: "flex", flexDirection: "column" }}>
        <div
          ref={listRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: 12,
            background: "rgba(13,25,48,0.50)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
          }}
        >
          <List
            dataSource={messages}
            renderItem={(item) =>
              item.kind === "system" ? (
                <List.Item style={{ border: "none", padding: "6px 8px" }}>
                  <Text type="secondary" style={{ fontStyle: "italic", wordBreak: "break-word" }}>
                    [{fmtTime(item.at)}] {item.text}
                  </Text>
                </List.Item>
              ) : (
                <List.Item style={{ border: "none", padding: "6px 8px", alignItems: "flex-start" }}>
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    <Text style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Text strong style={{ wordBreak: "break-word" }}>{item.username}</Text>
                      <Text type="secondary">· {fmtTime(item.at)}</Text>
                    </Text>
                    <Text style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {item.text}
                    </Text>
                  </Space>
                </List.Item>
              )
            }
          />
        </div>
      </Content>

      <Footer style={{ background: "transparent", paddingTop: 12 }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder='Escribí un mensaje…'
            size="large"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={handleSend}
            maxLength={2000}
            allowClear
          />
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!isConnected() || text.trim().length === 0}
          >
            {!isMobile && "Enviar"}
          </Button>
        </Space.Compact>
      </Footer>
    </Layout>
  );
};

export default Chat;