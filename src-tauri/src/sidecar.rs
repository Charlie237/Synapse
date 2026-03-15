use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

pub struct BackendState {
    pub port: Mutex<Option<u16>>,
    pub status: Mutex<String>,
    process: Mutex<Option<Child>>,
}

impl BackendState {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
            status: Mutex::new("starting".to_string()),
            process: Mutex::new(None),
        }
    }

    pub fn spawn_backend(&self, data_dir: &str) -> Result<(), String> {
        let backend_dir = find_backend_dir()?;
        let python = find_python(&backend_dir)?;
        let main_py = backend_dir.join("main.py");

        // Bundled mode: executable runs directly; dev mode: python main.py
        let is_bundled = python.file_stem().map(|s| s.to_string_lossy().starts_with("synapse-backend")).unwrap_or(false);

        log::info!(
            "Starting backend: {:?} (bundled={}) --port 0 --data-dir {}",
            python, is_bundled, data_dir
        );

        let mut cmd = Command::new(&python);
        if !is_bundled {
            if !main_py.exists() {
                return Err(format!("backend/main.py not found at {:?}", main_py));
            }
            cmd.arg(&main_py);
        }
        let mut child = cmd
            .arg("--port")
            .arg("0")
            .arg("--data-dir")
            .arg(data_dir)
            .current_dir(&backend_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn backend: {}", e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    log::info!("Backend stdout: {}", line);
                    if let Some(port_str) = line.strip_prefix("READY:") {
                        if let Ok(port) = port_str.trim().parse::<u16>() {
                            *self.port.lock().unwrap() = Some(port);
                            *self.status.lock().unwrap() = "ready".to_string();
                            *self.process.lock().unwrap() = Some(child);
                            log::info!("Backend ready on port {}", port);
                            return Ok(());
                        }
                    }
                }
                Err(e) => {
                    log::error!("Error reading backend stdout: {}", e);
                    break;
                }
            }
        }

        *self.status.lock().unwrap() = "error".to_string();
        Err("Backend failed to start (no READY message received)".to_string())
    }

    #[allow(dead_code)]
    pub async fn health_check(&self) -> bool {
        let port = match *self.port.lock().unwrap() {
            Some(p) => p,
            None => return false,
        };

        let url = format!("http://127.0.0.1:{}/api/health", port);
        match reqwest::Client::new()
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    pub fn shutdown(&self) {
        if let Some(mut child) = self.process.lock().unwrap().take() {
            log::info!("Shutting down backend process");
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for BackendState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Find the backend/ directory. In dev mode, cwd is src-tauri/, so parent is project root.
fn find_backend_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;

    // Try: next to the app binary (bundled mode)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidate = exe_dir.join("backend");
            if candidate.join("main.py").exists() || candidate.join("synapse-backend").exists() || candidate.join("synapse-backend.exe").exists() {
                return Ok(candidate);
            }
        }
    }

    // Try: cwd/../backend (dev mode, cwd = src-tauri)
    if let Some(parent) = cwd.parent() {
        let candidate = parent.join("backend");
        if candidate.join("main.py").exists() {
            return Ok(candidate);
        }
    }

    // Try: cwd/backend (if cwd is project root)
    let candidate = cwd.join("backend");
    if candidate.join("main.py").exists() {
        return Ok(candidate);
    }

    Err(format!(
        "Cannot find backend/ directory. cwd={:?}",
        cwd
    ))
}

/// Find Python: prefer .venv in backend dir, then system python3/python.
fn find_python(backend_dir: &PathBuf) -> Result<PathBuf, String> {
    // Check for bundled PyInstaller executable
    let bundled = if cfg!(windows) {
        backend_dir.join("synapse-backend.exe")
    } else {
        backend_dir.join("synapse-backend")
    };
    if bundled.exists() {
        log::info!("Using bundled backend: {:?}", bundled);
        return Ok(bundled);
    }

    // Check .venv/bin/python inside backend dir
    let venv_bin = if cfg!(windows) { "Scripts" } else { "bin" };
    let venv_python = backend_dir.join(".venv").join(venv_bin).join(if cfg!(windows) { "python.exe" } else { "python" });
    if venv_python.exists() {
        log::info!("Using venv python: {:?}", venv_python);
        return Ok(venv_python);
    }

    // Fallback to system python
    for name in ["python3", "python"] {
        if Command::new(name)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return Ok(PathBuf::from(name));
        }
    }

    Err("Python not found. Install Python or create backend/.venv".to_string())
}
