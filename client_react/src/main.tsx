import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1d4ed8",
          colorBgBase: "#0b1220",
          colorTextBase: "#e6e9ef",
          borderRadius: 12,
        },
        components: {
          Card: { colorBgContainer: "rgba(13,25,48,0.75)" },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);