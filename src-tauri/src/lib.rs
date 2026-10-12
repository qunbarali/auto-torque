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

/// Probe an HTTP response, not just an open TCP port. A listening port alone
/// does not mean Next.js has finished starting or can render the application.
fn probe_http(port: u16) -> Result<Option<u16>, String> {
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
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
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

    Ok(status)
}

/// Wait up to ~45 s for the bundled Next.js server. Require a successful or
/// redirect HTTP response before allowing the desktop window to navigate.
fn wait_for_server(port: u16, log_path: &Path) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 450; // 450 * 100 ms = 45 s
    let mut last_status = None;

    for attempt in 0..MAX_ATTEMPTS {
        match probe_http(port) {
            Ok(Some(status @ 200..=399)) => {
                append_runtime_log(
                    log_path,
                    &format!("HTTP readiness check succeeded: status={status}, port={port}"),
                );
                return Ok(());
            }
            Ok(Some(status)) => {
                last_status = Some(status);
                if status >= 500 {
                    let message = format!(
                        "Next.js returned HTTP {status} on 127.0.0.1:{port}; refusing to open a blank window"
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
                    "Still waiting for Next.js on port {port} (attempt {attempt}/{}; last HTTP status: {last_status:?})",
                    MAX_ATTEMPTS
                ),
            );
        }
        thread::sleep(Duration::from_millis(100));
    }

    let message = format!(
        "Auto Torque server did not return a successful HTTP response on 127.0.0.1:{port} within 45 s (last status: {last_status:?})"
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
                    .env("HOSTNAME", "127.0.0.1")
                    .env("PORT", "3000")
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
