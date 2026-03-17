use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const MAX_LOG_LINES: usize = 500;

pub struct BackendState {
    pub port: Mutex<Option<u16>>,
    pub status: Mutex<String>,
    pub logs: Arc<Mutex<VecDeque<String>>>,
    process: Mutex<Option<Child>>,
}

impl BackendState {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
            status: Mutex::new("starting".to_string()),
            logs: Arc::new(Mutex::new(VecDeque::new())),
            process: Mutex::new(None),
        }
    }

    fn push_log(logs: &Mutex<VecDeque<String>>, line: String) {
        let mut buf = logs.lock().unwrap();
        if buf.len() >= MAX_LOG_LINES {
            buf.pop_front();
        }
        buf.push_back(line);
    }

    pub fn spawn_backend(&self, data_dir: &str) -> Result<(), String> {
        let backend_dir = find_backend_dir()?;
        let python = find_python(&backend_dir)?;
        let main_py = backend_dir.join("main.py");

        let is_bundled = python.file_stem().map(|s| s.to_string_lossy().starts_with("synapse-backend")).unwrap_or(false);

        log::info!(
            "Starting backend: {:?} (bundled={}) --port 0 --data-dir {}",
            python, is_bundled, data_dir
        );

        let mut cmd = Command::new(&python);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
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
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn backend: {}", e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let reader = BufReader::new(stdout);

        // Log stderr in background thread
        if let Some(stderr) = child.stderr.take() {
            let logs = Arc::clone(&self.logs);
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    log::info!("Backend: {}", line);
                    Self::push_log(&logs, line);
                }
            });
        }

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    log::info!("Backend stdout: {}", line);
                    Self::push_log(&self.logs, line.clone());
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

/// Find the backend/ directory.
fn find_backend_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // macOS: Resources dir is sibling to MacOS dir inside .app bundle
            if let Some(macos_dir) = exe_dir.parent() {
                let candidate = macos_dir.join("Resources").join("backend");
                if candidate.join("synapse-backend").exists() || candidate.join("synapse-backend.exe").exists() {
                    return Ok(candidate);
                }
            }
            let candidate = exe_dir.join("backend");
            if candidate.join("main.py").exists() || candidate.join("synapse-backend").exists() || candidate.join("synapse-backend.exe").exists() {
                return Ok(candidate);
            }
        }
    }

    // Dev mode: cwd/../backend (cwd = src-tauri)
    if let Some(parent) = cwd.parent() {
        let candidate = parent.join("backend");
        if candidate.join("main.py").exists() {
            return Ok(candidate);
        }
    }

    let candidate = cwd.join("backend");
    if candidate.join("main.py").exists() {
        return Ok(candidate);
    }

    Err(format!("Cannot find backend/ directory. cwd={:?}", cwd))
}

/// Find Python: prefer bundled exe, then .venv, then system python.
fn find_python(backend_dir: &PathBuf) -> Result<PathBuf, String> {
    let bundled = if cfg!(windows) {
        backend_dir.join("synapse-backend.exe")
    } else {
        backend_dir.join("synapse-backend")
    };
    if bundled.exists() {
        log::info!("Using bundled backend: {:?}", bundled);
        return Ok(bundled);
    }

    let venv_bin = if cfg!(windows) { "Scripts" } else { "bin" };
    let venv_python = backend_dir.join(".venv").join(venv_bin).join(if cfg!(windows) { "python.exe" } else { "python" });
    if venv_python.exists() {
        log::info!("Using venv python: {:?}", venv_python);
        return Ok(venv_python);
    }

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
