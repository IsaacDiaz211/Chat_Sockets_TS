use chrono::Timelike;
use rust_socketio::{ClientBuilder, Payload, TransportType};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Write};

#[derive(Debug, Deserialize)]
struct WelcomePayload {
    username: String,
    connectedUsers: Vec<String>,
}

fn read_line(prompt: &str, default: Option<&str>) -> String {
    let mut s = String::new();
    let def_txt = default.unwrap_or("");
    print!(
        "{}{}",
        prompt,
        if def_txt.is_empty() {
            ""
        } else {
            &format!(" [{}]", def_txt)
        }
    );
    print!(": ");
    let _ = io::stdout().flush();
    io::stdin().read_line(&mut s).expect("stdin");
    let t = s.trim().to_string();
    if t.is_empty() {
        def_txt.to_string()
    } else {
        t
    }
}

fn parse_payload_to_json(p: Payload) -> Option<Value> {
    match p {
        Payload::String(s) => serde_json::from_str::<Value>(&s).ok(),
        Payload::Binary(b) => {
            let s = String::from_utf8_lossy(&b);
            serde_json::from_str::<Value>(&s).ok()
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    //Pedimos IP/host, puerto y username
    println!("=== Cliente CLI en Rust para Chat por Socket.IO ===");

    let host = read_line("Host/IP del servidor", Some("192.168.0.131"));
    let port = read_line("Puerto", Some("3000"));
    let username = loop {
        let u = read_line("Username (3–20, a-z0-9_-)", None);
        let ok = !u.is_empty()
            && u.len() >= 3
            && u.len() <= 20
            && u.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if ok {
            break u;
        } else {
            println!("→ Formato inválido. Intenta de nuevo.");
        }
    };

    let url = format!("http://{}:{}", host, port);
    println!("Conectando a {} …", url);

    //Armamos el cliente y registramos listeners
    let mut connected_ok = false;

    let socket = ClientBuilder::new(url.as_str())
       .transport_type(TransportType::Websocket)
        // Evento estándar de conexión del cliente
        .on("connect", |_, _| {
            println!("→ Conexión TCP/WS establecida. Enviando handshake…");
        })
        // Nuestro handshake de bienvenida del servidor
        .on("welcome", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                if let Ok(w) = serde_json::from_value::<WelcomePayload>(v) {
                    println!(
                        "✅ Conexión exitosa como \"{}\". Usuarios conectados: {}",
                        w.username,
                        if w.connectedUsers.is_empty() {
                            "—".to_string()
                        } else {
                            w.connectedUsers.join(", ")
                        }
                    );
                } else {
                    println!("(welcome) payload inesperado");
                }
            } else {
                println!("(welcome) payload no JSON");
            }
        })
        // Mensajes públicos
        .on("chat:public", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                let user = v.get("username").and_then(|x| x.as_str()).unwrap_or("¿?");
                let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
                let at = v.get("at").and_then(|x| x.as_i64()).unwrap_or(0);
                let ts = if at > 0 {
                    let dt = chrono::NaiveDateTime::from_timestamp_opt(at / 1000, 0)
                        .unwrap_or_else(|| chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap());
                    let time = dt.time();
                    format!("{:02}:{:02}", time.hour(), time.minute())
                } else {
                    "--:--".to_string()
                };
                println!("[{}] {}: {}", ts, user, text);
            }
        })
        // Listado de usuarios
        .on("users:list", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                if let Some(arr) = v.get("users").and_then(|x| x.as_array()) {
                    let users: Vec<String> = arr
                        .iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect();
                    println!("👥 Conectados: {}", if users.is_empty() { "—".into() } else { users.join(", ") });
                } else {
                    println!("(users:list) payload inesperado");
                }
            }
        })
        // Notificaciones de entrada/salida
        .on("user_joined", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                let u = v.get("username").and_then(|x| x.as_str()).unwrap_or("¿?");
                println!("➕ {} se unió", u);
            }
        })
        .on("user_left", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                let u = v.get("username").and_then(|x| x.as_str()).unwrap_or("¿?");
                println!("➖ {} salió", u);
            }
        })
        // Errores que emite tu servidor (server:error)
        .on("server:error", |payload, _| {
            if let Some(v) = parse_payload_to_json(payload) {
                let code = v.get("code").and_then(|x| x.as_str()).unwrap_or("UNKNOWN");
                let msg = v.get("message").and_then(|x| x.as_str()).unwrap_or("");
                eprintln!("⚠️  server:error [{}] {}", code, msg);
            } else {
                eprintln!("⚠️  server:error (payload no JSON)");
            }
        })
        // Desconexión del cliente
        .on("disconnect", |p, _| {
            match p {
                Payload::String(s) => eprintln!("🔌 Desconectado: {}", s),
                Payload::Binary(_) => eprintln!("🔌 Desconectado (binario)"),
            }
        })
        .connect()?;

    // 3) Enviamos el "hello" (handshake) con el username
    socket.emit("hello", json!({ "username": username }))?;
    connected_ok = true;

    println!("———\nEscribe mensajes y Enter para enviar.");
    println!("Comandos: /listar  (lista usuarios) | /quitar (sale)\n———");

    // 4) Loop de stdin para enviar mensajes o comandos
    let mut line = String::new();
    loop {
        line.clear();
        let _ = io::stdout().flush();
        io::stdin().read_line(&mut line)?;
        let txt = line.trim();
        if txt.is_empty() {
            continue;
        }

        if txt == "/listar" {
            socket.emit("command:list", json!({}))?;
            continue;
        }
        if txt == "/quitar" {
            socket.emit("command:quit", json!({}))?;
            break;
        }

        // mensaje público
        socket.emit("chat:public", json!({ "text": txt }))?;
    }

    // 5) Cierre ordenado
    if connected_ok {
        let _ = socket.disconnect();
    }
    println!("Hasta luego.");
    Ok(())
}
