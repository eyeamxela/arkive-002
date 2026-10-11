//! A private local process for the separately built Personal Node application.
//! The cloud window cannot obtain this process's owner token or open its picker.
use serde::{Deserialize, Serialize};
use std::{io::{BufRead, BufReader, Read}, path::PathBuf, process::{Child, Command, Stdio}, sync::{mpsc, Mutex}, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Clone, Deserialize, Serialize)]
pub struct Connection { pub port: u16, pub token: String }
pub struct NodeProcess { child: Child, connection: Connection }
#[derive(Default)]
pub struct PersonalNode(pub Mutex<Option<NodeProcess>>);

impl PersonalNode {
    pub fn stop(&self) {
        if let Ok(mut process) = self.0.lock() {
            if let Some(mut running) = process.take() {
                // EOF asks the child to flush and release its exclusive Brain lock.
                drop(running.child.stdin.take());
                for _ in 0..100 {
                    if matches!(running.child.try_wait(), Ok(Some(_))) { return; }
                    std::thread::sleep(Duration::from_millis(50));
                }
                let _ = running.child.kill(); let _ = running.child.wait();
            }
        }
    }
}
impl Drop for PersonalNode { fn drop(&mut self) { self.stop(); } }

fn permit(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "Cannot verify this window".to_string())?;
    let local = match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) => true,
        ("http" | "https", Some("tauri.localhost"), None) => true,
        ("http", Some("127.0.0.1"), Some(1420)) if cfg!(debug_assertions) => true,
        _ => false,
    };
    if window.label() != "personal" || !local || url.path() != "/local.html" {
        return Err("Personal-node commands are restricted to the local Personal window".into());
    }
    Ok(())
}

fn runtime_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let node = root.join(".desktop-runtime/node");
        let script = root.join("personal-node/server.mjs");
        if node.is_file() && script.is_file() { return Ok((node, script)); }
    }
    let resources = app.path().resource_dir().map_err(|_| "Cannot locate app resources".to_string())?;
    let node = resources.join("runtime/node");
    let script = resources.join("personal-node/server.mjs");
    if !node.is_file() || !script.is_file() { return Err("Bundled personal-node runtime is missing. Run the Personal build preparation.".into()); }
    Ok((node, script))
}

#[tauri::command]
pub fn personal_node_connection(window: WebviewWindow, app: AppHandle, state: tauri::State<'_, PersonalNode>) -> Result<Connection, String> {
    permit(&window)?;
    let mut slot = state.0.lock().map_err(|_| "Node state unavailable".to_string())?;
    if let Some(running) = slot.as_mut() {
        if running.child.try_wait().map_err(|_| "Cannot inspect node process".to_string())?.is_none() { return Ok(running.connection.clone()); }
        *slot = None;
    }
    let (node, script) = runtime_paths(&app)?;
    let data = app.path().app_data_dir().map_err(|_| "Cannot locate private app data".to_string())?.join("brain");
    let mut child = Command::new(node).arg(script).arg("--desktop").arg("--data-dir").arg(data)
        .env("ARKIVE_HOST", "127.0.0.1").env("ARKIVE_PORT", "0")
        .env("ARKIVE_ALLOWED_ORIGINS", "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://127.0.0.1:1420")
        .env_remove("NODE_OPTIONS").env_remove("ARKIVE_TOKEN").env_remove("ARKIVE_SYNC_TOKEN")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|_| "Could not start the bundled personal node".to_string())?;
    let output = child.stdout.take().ok_or_else(|| "Node startup channel unavailable".to_string())?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(output).take(4096).read_line(&mut line).map(|_| line);
        let _ = tx.send(result);
    });
    let connection = rx.recv_timeout(Duration::from_secs(30)).ok().and_then(Result::ok)
        .and_then(|line| serde_json::from_str::<Connection>(&line).ok())
        .filter(|c| c.port > 0 && c.token.len() >= 32 && c.token.len() <= 256);
    match connection {
        Some(connection) => { *slot = Some(NodeProcess { child, connection: connection.clone() }); Ok(connection) }
        None => { let _ = child.kill(); let _ = child.wait(); Err("Personal node did not start. Check that the data directory is writable and the runtime is intact.".into()) }
    }
}

#[tauri::command]
pub fn pick_brain_folder(window: WebviewWindow) -> Result<Option<String>, String> {
    permit(&window)?;
    #[cfg(target_os = "macos")]
    {
        // Fixed AppleScript, no path or user input is ever interpolated into code.
        let output = Command::new("/usr/bin/osascript").args(["-e", "try", "-e", "POSIX path of (choose folder with prompt \"Choose a folder for read-only Arkive indexing\")", "-e", "on error number -128", "-e", "return \"\"", "-e", "end try"])
            .output().map_err(|_| "Could not open the system folder picker".to_string())?;
        if !output.status.success() { return Err("Folder selection did not finish".into()); }
        let value = String::from_utf8(output.stdout).map_err(|_| "Folder path is not valid UTF-8".to_string())?.trim().to_string();
        if value.is_empty() { return Ok(None); }
        let path = PathBuf::from(&value);
        if !path.is_absolute() || !path.is_dir() { return Err("Choose an existing folder".into()); }
        Ok(Some(value))
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Native folder picker currently supports macOS. Enter a folder path in the interface.".into()) }
}
