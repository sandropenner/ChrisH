use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RecentFilesStore {
    files: Vec<String>,
}

fn store_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not access app data directory: {e}"))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Could not create app data folder: {e}"))?;
    data_dir.push("recent_files.json");
    Ok(data_dir)
}

fn read_store(app: &AppHandle) -> Result<RecentFilesStore, String> {
    let path = store_file_path(app)?;
    if !path.exists() {
        return Ok(RecentFilesStore::default());
    }
    let raw =
        fs::read_to_string(path).map_err(|e| format!("Could not read recent files store: {e}"))?;
    let parsed = serde_json::from_str::<RecentFilesStore>(&raw)
        .map_err(|e| format!("Could not parse recent files store: {e}"))?;
    Ok(parsed)
}

fn write_store(app: &AppHandle, store: &RecentFilesStore) -> Result<(), String> {
    let path = store_file_path(app)?;
    let payload = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Could not encode recent files store: {e}"))?;
    fs::write(path, payload).map_err(|e| format!("Could not write recent files store: {e}"))
}

pub fn list_recent_files(app: &AppHandle) -> Result<Vec<String>, String> {
    Ok(read_store(app)?.files)
}

pub fn store_recent_file(app: &AppHandle, path: String) -> Result<(), String> {
    let mut store = read_store(app)?;
    store.files.retain(|p| p != &path);
    store.files.insert(0, path);
    if store.files.len() > 20 {
        store.files.truncate(20);
    }
    write_store(app, &store)
}
