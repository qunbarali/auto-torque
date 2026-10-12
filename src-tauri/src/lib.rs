use std::{net::TcpStream, thread, time::Duration};
use tauri::Manager;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct NextServer(Option<CommandChild>);

impl Drop for NextServer {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

/// Wait up to ~45 s for the embedded Next.js server (cold start can be slow).
fn wait_for_server(port: u16) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 450; // 450 * 100 ms = 45 s
    for attempt in 0..MAX_ATTEMPTS {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        if attempt > 0 && attempt % 50 == 0 {
            eprintln!("Still waiting for Auto Torque server on port {port}… ({attempt})");
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "Auto Torque server did not become ready on 127.0.0.1:{port} within 45 s"
    ))
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
                    .map_err(|e| format!("resource_dir: {e}"))?;
                let server = resource_dir.join("runtime").join("server.js");
                if !server.exists() {
                    return Err(format!(
                        "Missing bundled Auto Torque server: {}",
                        server.display()
                    )
                    .into());
                }

                let data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| format!("app_data_dir: {e}"))?;
                std::fs::create_dir_all(&data_dir)
                    .map_err(|e| format!("create data dir: {e}"))?;

                let database = data_dir.join("auto_torque.sqlite");
                let legacy_database = data_dir.join("torqvoice.sqlite");

                // Adopt legacy database if present
                if !database.exists() && legacy_database.exists() {
                    std::fs::copy(&legacy_database, &database).map_err(|e| {
                        format!("Could not adopt existing SQLite database: {e}")
                    })?;
                    for suffix in ["-wal", "-shm"] {
                        let old = data_dir.join(format!("torqvoice.sqlite{suffix}"));
                        let new = data_dir.join(format!("auto_torque.sqlite{suffix}"));
                        if old.exists() {
                            let _ = std::fs::copy(&old, &new);
                        }
                    }
                }

                if !database.exists() {
                    let seed = resource_dir.join("runtime").join("seed.sqlite");
                    if !seed.exists() {
                        return Err(format!(
                            "Missing SQLite seed database: {}",
                            seed.display()
                        )
                        .into());
                    }
                    std::fs::copy(&seed, &database).map_err(|e| {
                        format!("Could not initialize SQLite database: {e}")
                    })?;
                }

                let sidecar = app
                    .shell()
                    .sidecar("auto-torque-node")
                    .map_err(|e| format!("Could not locate Node sidecar: {e}"))?
                    .args([server.to_string_lossy().as_ref()])
                    .env("HOSTNAME", "127.0.0.1")
                    .env("PORT", "3000")
                    .env(
                        "DATABASE_URL",
                        format!("file:{}", database.display()),
                    )
                    .env(
                        "AUTO_TORQUE_DATA_DIR",
                        data_dir.to_string_lossy().to_string(),
                    )
                    .env(
                        "AUTO_TORQUE_RUNTIME_DIR",
                        resource_dir
                            .join("runtime")
                            .to_string_lossy()
                            .to_string(),
                    );

                let (mut rx, child) = sidecar
                    .spawn()
                    .map_err(|e| format!("Could not start Auto Torque server: {e}"))?;

                // Drain stdout/stderr so a chatty Next.js process cannot block
                tauri::async_runtime::spawn(async move {
                    while rx.recv().await.is_some() {}
                });

                wait_for_server(3000)?;
                app.manage(NextServer(Some(child)));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Auto Torque");
}
