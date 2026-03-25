use std::{fs, path::Path, process::Command};

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

#[tauri::command]
pub fn create_temp_pdf_path(prefix: Option<String>) -> Result<String, String> {
    let safe_prefix = prefix
        .unwrap_or_else(|| "chris-print".to_string())
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>();
    let filename = format!(
        "{}-{}.pdf",
        safe_prefix,
        chrono::Utc::now().format("%Y%m%d-%H%M%S-%3f")
    );
    let path = std::env::temp_dir().join(filename);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_path_in_default_app(path: String) -> Result<(), String> {
    let candidate = Path::new(&path);
    if !candidate.exists() {
        return Err("The print file could not be opened because it does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to launch default PDF viewer: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch default PDF viewer: {e}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch default PDF viewer: {e}"))?;
    }

    Ok(())
}
