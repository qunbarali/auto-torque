use std::{
    fs::OpenOptions,
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    path::Path,
    thread,
    time::Duration,
};

use tauri::Manager;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct NextServer(Option<CommandChild>);

impl Drop for NextServer {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

fn append_runtime_log(path: &Path, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

/// Require at least one exact HTTP(S) origin before opening the server to LAN
/// interfaces. This is intentionally a small fail-closed syntax check; the
/// application performs stricter URL parsing before trusting the origin.
fn has_valid_lan_origin_list(origins: &str) -> bool {
    origins.split(',').any(|entry| {
        let origin = entry.trim();
        let Some((scheme, remainder)) = origin.split_once("://") else {
            return false;
        };
        if scheme != "http" && scheme != "https" {
            return false;
        }

        let authority = remainder.split('/').next().unwrap_or("");
        if authority.is_empty()
            || authority.chars().any(char::is_whitespace)
            || authority.contains(['@', '*', '?', '#'])
        {
            return false;
        }

        let suffix = &remainder[authority.len()..];
        suffix.is_empty() || suffix == "/"
    })
}

/// Probe the application's health endpoint, not just an open port. A different
/// local service can occupy port 3000 and return HTTP 200; require the explicit
/// Auto Torque response marker before allowing the window to navigate.
fn probe_http(port: u16) -> Result<Option<(u16, bool)>, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(300)) {
        Ok(stream) => stream,
        Err(_) => return Ok(None),
    };

    let timeout = Some(Duration::from_secs(2));
    stream
        .set_read_timeout(timeout)
        .map_err(|error| format!("set HTTP probe read timeout: {error}"))?;
    stream
        .set_write_timeout(timeout)
        .map_err(|error| format!("set HTTP probe write timeout: {error}"))?;

    if stream
        .write_all(
            b"GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return Ok(None);
    }

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    if reader.read_line(&mut status_line).is_err() {
        return Ok(None);
    }

    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok());

    let Some(status) = status else {
        return Ok(None);
    };

    let mut is_auto_torque = false;
    loop {
        let mut header_line = String::new();
        match reader.read_line(&mut header_line) {
            Ok(0) | Err(_) => return Ok(None),
            Ok(_) if header_line == "\r\n" || header_line == "\n" => break,
            Ok(_) => {
                if let Some((name, value)) = header_line.split_once(':') {
                    if name.eq_ignore_ascii_case("x-auto-torque-service")
                        && value.trim().eq_ignore_ascii_case("auto-torque")
                    {
                        is_auto_torque = true;
                    }
                }
            }
        }
    }

    Ok(Some((status, is_auto_torque)))
}

/// Wait up to ~45 s for the bundled Next.js server. Require the expected app
/// identity and a successful or redirect HTTP response before opening the UI.
fn wait_for_server(port: u16, log_path: &Path) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 450; // 450 * 100 ms = 45 s
    let mut last_status = None;

    for attempt in 0..MAX_ATTEMPTS {
        match probe_http(port) {
            Ok(Some((status, true))) if (200..=399).contains(&status) => {
                append_runtime_log(
                    log_path,
                    &format!("HTTP readiness check succeeded: status={status}, port={port}"),
                );
                return Ok(());
            }
            Ok(Some((status, false))) => {
                let message = format!(
                    "Port {port} returned HTTP {status}, but did not identify itself as Auto Torque; refusing to open a blank or unrelated window"
                );
                append_runtime_log(log_path, &message);
                return Err(message);
            }
            Ok(Some((status, true))) => {
                last_status = Some(status);
                if status >= 500 {
                    let message = format!(
                        "Auto Torque health endpoint returned HTTP {status} on 127.0.0.1:{port}; refusing to open a blank window"
                    );
                    append_runtime_log(log_path, &message);
                    return Err(message);
                }
            }
            Ok(None) => {}
            Err(error) => append_runtime_log(log_path, &format!("HTTP readiness probe: {error}")),
        }

        if attempt > 0 && attempt % 50 == 0 {
            append_runtime_log(
                log_path,
                &format!(
                    "Still waiting for Auto Torque on port {port} (attempt {attempt}/{}; last HTTP status: {last_status:?})",
                    MAX_ATTEMPTS
                ),
            );
        }
        thread::sleep(Duration::from_millis(100));
    }

    let message = format!(
        "Auto Torque server did not return a successful, identified HTTP response on 127.0.0.1:{port} within 45 s (last status: {last_status:?})"
    );
    append_runtime_log(log_path, &message);
    Err(message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .map_err(|error| format!("resource_dir: {error}"))?;
                let data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|error| format!("app_data_dir: {error}"))?;
                std::fs::create_dir_all(&data_dir)
                    .map_err(|error| format!("create data dir: {error}"))?;

                let log_path = data_dir.join("runtime.log");
                append_runtime_log(&log_path, "\n--- Auto Torque startup ---");
                append_runtime_log(
                    &log_path,
                    &format!("Resource directory: {}", resource_dir.display()),
                );
                append_runtime_log(&log_path, &format!("Data directory: {}", data_dir.display()));

                let server = resource_dir.join("runtime").join("server.js");
                if !server.is_file() {
                    let message = format!("Missing bundled Auto Torque server: {}", server.display());
                    append_runtime_log(&log_path, &message);
                    return Err(message.into());
                }

                let database = data_dir.join("auto_torque.sqlite");
                let legacy_database = data_dir.join("torqvoice.sqlite");

                // Preserve the legacy database when upgrading older installs.
                if !database.exists() && legacy_database.exists() {
                    std::fs::copy(&legacy_database, &database).map_err(|error| {
                        let message = format!("Could not adopt existing SQLite database: {error}");
                        append_runtime_log(&log_path, &message);
                        message
                    })?;

                    for suffix in ["-wal", "-shm"] {
                        let old = data_dir.join(format!("torqvoice.sqlite{suffix}"));
                        let new = data_dir.join(format!("auto_torque.sqlite{suffix}"));
                        if old.exists() {
                            if let Err(error) = std::fs::copy(&old, &new) {
                                append_runtime_log(
                                    &log_path,
                                    &format!(
                                        "Warning: could not copy legacy SQLite {suffix} sidecar: {error}"
                                    ),
                                );
                            }
                        }
                    }
                }

                if !database.exists() {
                    let seed = resource_dir.join("runtime").join("seed.sqlite");
                    if !seed.is_file() {
                        let message = format!("Missing SQLite seed database: {}", seed.display());
                        append_runtime_log(&log_path, &message);
                        return Err(message.into());
                    }
                    std::fs::copy(&seed, &database).map_err(|error| {
                        let message = format!("Could not initialize SQLite database: {error}");
                        append_runtime_log(&log_path, &message);
                        message
                    })?;
                }

                let database_url = format!(
                    "file:{}",
                    database.to_string_lossy().replace('\\', "/")
                );
                append_runtime_log(&log_path, &format!("Database file: {}", database.display()));
                append_runtime_log(&log_path, &format!("Starting bundled server: {}", server.display()));

                // LAN hosting is opt-in. The default remains loopback-only so
                // an ordinary desktop install is not exposed to the network.
                let lan_host_enabled = std::env::var("AUTO_TORQUE_LAN_HOST")
                    .map(|value| value.eq_ignore_ascii_case("true"))
                    .unwrap_or(false);
                let lan_origins =
                    std::env::var("AUTO_TORQUE_LAN_ORIGINS").unwrap_or_default();

                if lan_host_enabled && !has_valid_lan_origin_list(&lan_origins) {
                    let message = "LAN hosting was requested, but AUTO_TORQUE_LAN_ORIGINS has no valid exact HTTP(S) origin. Configure a value such as http://192.168.1.20:3000 before enabling LAN hosting.".to_string();
                    append_runtime_log(&log_path, &message);
                    return Err(message.into());
                }

                let bind_host = if lan_host_enabled {
                    "0.0.0.0"
                } else {
                    "127.0.0.1"
                };
                append_runtime_log(
                    &log_path,
                    &format!(
                        "Network mode: {}; bind host: {bind_host}; configured LAN origins: {}",
                        if lan_host_enabled { "LAN host" } else { "local-only" },
                        if lan_host_enabled { lan_origins.as_str() } else { "(disabled)" }
                    ),
                );

                let sidecar = app
                    .shell()
                    .sidecar("auto-torque-node")
                    .map_err(|error| {
                        let message = format!("Could not locate Node sidecar: {error}");
                        append_runtime_log(&log_path, &message);
                        message
                    })?
                    .args([server.to_string_lossy().as_ref()])
                    .env("NODE_ENV", "production")
                    .env("NEXT_TELEMETRY_DISABLED", "1")
                    .env("HOSTNAME", bind_host)
                    .env("PORT", "3000")
                    .env("AUTO_TORQUE_LAN_HOST", if lan_host_enabled { "true" } else { "false" })
                    .env("AUTO_TORQUE_LAN_ORIGINS", lan_origins)
                    .env("DATABASE_URL", database_url)
                    .env("AUTO_TORQUE_DATA_DIR", data_dir.to_string_lossy().to_string())
                    .env(
                        "AUTO_TORQUE_RUNTIME_DIR",
                        resource_dir.join("runtime").to_string_lossy().to_string(),
                    );

                let (mut rx, child) = sidecar.spawn().map_err(|error| {
                    let message = format!("Could not start Auto Torque server: {error}");
                    append_runtime_log(&log_path, &message);
                    message
                })?;

                // Persist stdout/stderr in the user's app-data directory. The
                // release binary hides its console, so draining and discarding
                // these events made production-only failures almost impossible
                // to diagnose.
                let sidecar_log_path = log_path.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        let message = match event {
                            CommandEvent::Stdout(line) => {
                                format!("server stdout: {}", String::from_utf8_lossy(&line))
                            }
                            CommandEvent::Stderr(line) => {
                                format!("server stderr: {}", String::from_utf8_lossy(&line))
                            }
                            CommandEvent::Error(error) => format!("server process error: {error}"),
                            CommandEvent::Terminated(payload) => {
                                format!("server process terminated: {payload:?}")
                            }
                            _ => "server emitted an unclassified process event".to_string(),
                        };
                        append_runtime_log(&sidecar_log_path, &message);
                    }
                });

                if let Err(error) = wait_for_server(3000, &log_path) {
                    let _ = child.kill();
                    return Err(error.into());
                }

                app.manage(NextServer(Some(child)));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Auto Torque");
}
