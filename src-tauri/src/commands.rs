use tauri::State;
use crate::sidecar::BackendState;

#[tauri::command]
pub fn get_backend_port(state: State<BackendState>) -> Result<u16, String> {
    state
        .port
        .lock()
        .unwrap()
        .ok_or_else(|| "Backend not ready".to_string())
}

#[tauri::command]
pub fn get_backend_status(state: State<BackendState>) -> String {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_backend_logs(state: State<BackendState>) -> Vec<String> {
    state.logs.lock().unwrap().iter().cloned().collect()
}
