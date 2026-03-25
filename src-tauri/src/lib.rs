mod commands;
mod recent_files;
mod save_pipeline;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_open_pdf,
            commands::read_pdf_bytes,
            commands::pick_save_pdf,
            commands::safe_write_pdf,
            commands::list_recent_files,
            commands::store_recent_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
