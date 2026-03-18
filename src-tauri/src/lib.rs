mod commands;
mod sidecar;

use sidecar::BackendState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Determine data directory
            let data_dir = app
                .path()
                .app_data_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| {
                    let home = std::env::var("HOME")
                        .unwrap_or_else(|_| "/tmp".to_string());
                    format!("{}/.synapse", home)
                });

            std::fs::create_dir_all(&data_dir).ok();

            // Spawn backend in a separate thread
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<BackendState>();
                if let Err(e) = state.spawn_backend(&data_dir) {
                    log::error!("Failed to start backend: {}", e);
                    *state.status.lock().unwrap() = "error".to_string();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_port,
            commands::get_backend_status,
            commands::get_backend_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<BackendState>().shutdown();
            }
        });
}
