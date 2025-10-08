import React, { useMemo, useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  Divider,
  theme,
  notification,
} from "antd";
import { UserOutlined, LoginOutlined, MessageOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { connect, disconnect } from "../utils/socket";

const { Title, Text } = Typography;

// 3–20 chars, letras, números, guion y guion bajo
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<{ username: string }>();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [api, contextHolder] = notification.useNotification();
  const { token } = theme.useToken();

  const isValid = useMemo(() => USERNAME_REGEX.test(username.trim()), [username]);

  const handleFinish = async ({ username }: { username: string }) => {
    const clean = username.trim();
    if (!USERNAME_REGEX.test(clean)) return;
    setSubmitting(true);
    try {
      // conecta al servidor y espera el 'welcome'
      await connect(clean);
      sessionStorage.setItem("chat.username", clean);
      // si todo está bien, se dirige a /chat y pasamos el username en location.state
      navigate("/chat", { state: { username: clean }, replace: true });
    } catch (err: any) {
      api.error({
        message: "No se pudo conectar",
        description: err?.message ?? "Fallo de conexión/handshake",
      });
      // limpia cualquier socket a medio abrir
      disconnect();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(135deg, #0B1220 0%, #0E1B2E 40%, #0F2342 100%)",
      }}
    >
      {contextHolder}
      <Card
        style={{
          width: "min(400px, 90vw)",
          background: "rgba(13, 25, 48, 0.75)",
          backdropFilter: "blur(6px)",
          borderColor: "rgba(255,255,255,0.06)",
          margin: 12,
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "rgba(37, 99, 235, 0.15)",
                marginBottom: 12,
              }}
            >
              <MessageOutlined style={{ fontSize: 26, color: token.colorPrimary }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>
              Ingresá al chat
            </Title>
            <Text type="secondary">Elegí un nombre visible para la sala global</Text>
          </div>

          <Divider style={{ margin: "8px 0", borderColor: "rgba(255,255,255,0.08)" }} />

          <Form
            form={form}
            layout="vertical"
            initialValues={{ username: "" }}
            onFinish={handleFinish}
            requiredMark={false}
          >
            <Form.Item
              label="Nombre de usuario"
              name="username"
              validateStatus={username && !isValid ? "error" : undefined}
              help={
                username && !isValid
                  ? "Usa 3–20 caracteres: letras, números, guion o guion bajo"
                  : "3–20 caracteres. Ej: isaac_dev"
              }
              rules={[
                { required: true, message: "Ingresa un nombre" },
                {
                  validator: (_, v) =>
                    !v || USERNAME_REGEX.test(String(v).trim())
                      ? Promise.resolve()
                      : Promise.reject(new Error("Formato inválido")),
                },
              ]}
            >
              <Input
                size="large"
                maxLength={20}
                allowClear
                placeholder="p. ej. isaac_dev"
                prefix={<UserOutlined />}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                disabled={submitting}
              />
            </Form.Item>

            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              htmlType="submit"
              block
              disabled={!isValid || submitting}
              loading={submitting}
            >
              Entrar
            </Button>
          </Form>

          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Este chat no requiere autenticación. Tu nombre debe ser único entre los conectados.
              Todos los datos serán recopilados y vendidos a Tencent para mejorar la experiencia del usuario.
              Recomendamos compartir datos de tarjetas de crédito o débito para mejorar la funcionalidad del chat.
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default Login;