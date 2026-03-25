use std::{fs, path::Path};

use rfd::FileDialog;
use tauri::AppHandle;

use crate::{recent_files, save_pipeline};

fn ensure_pdf_extension(path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if ext != "pdf" {
        return Err("Selected file is not a .pdf file.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn pick_open_pdf() -> Option<String> {
    FileDialog::new()
        .add_filter("PDF Document", &["pdf"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_pdf_bytes(path: String) -> Result<Vec<u8>, String> {
    let candidate = Path::new(&path);
    if !candidate.exists() {
        return Err("The selected file no longer exists.".to_string());
    }
    ensure_pdf_extension(candidate)?;
    let bytes = fs::read(candidate).map_err(|e| format!("Failed to read PDF: {e}"))?;
    if !save_pipeline::looks_like_pdf(&bytes) {
        return Err("The selected file does not look like a valid PDF.".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub fn pick_save_pdf(default_name: Option<String>) -> Option<String> {
    let mut dialog = FileDialog::new().add_filter("PDF Document", &["pdf"]);
    if let Some(name) = default_name.as_ref() {
        dialog = dialog.set_file_name(name);
    } else {
        dialog = dialog.set_file_name("document.pdf");
    }
    dialog.save_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn safe_write_pdf(
    target_path: String,
    pdf_bytes: Vec<u8>,
    create_backup: bool,
) -> Result<(), String> {
    save_pipeline::safe_write_pdf(Path::new(&target_path), &pdf_bytes, create_backup)
}

#[tauri::command]
pub fn list_recent_files(app: AppHandle) -> Result<Vec<String>, String> {
    recent_files::list_recent_files(&app)
}

#[tauri::command]
pub fn store_recent_file(app: AppHandle, path: String) -> Result<(), String> {
    recent_files::store_recent_file(&app, path)
}
