use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use chrono::Utc;

pub fn looks_like_pdf(bytes: &[u8]) -> bool {
    bytes.starts_with(b"%PDF-")
}

fn ensure_pdf_output_path(target_path: &Path) -> Result<(), String> {
    let ext = target_path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if ext != "pdf" {
        return Err("Output path must end with .pdf".to_string());
    }
    Ok(())
}

fn timestamp() -> String {
    Utc::now().format("%Y%m%d%H%M%S").to_string()
}

fn temp_file_path(target_path: &Path) -> PathBuf {
    let file_name = target_path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("document.pdf");
    let tmp_name = format!("{file_name}.tmp.{}", timestamp());
    target_path.with_file_name(tmp_name)
}

fn backup_file_path(target_path: &Path) -> PathBuf {
    let stem = target_path
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("document");
    let backup_name = format!("{stem}.bak.{}.pdf", timestamp());
    target_path.with_file_name(backup_name)
}

pub fn safe_write_pdf(
    target_path: &Path,
    pdf_bytes: &[u8],
    create_backup: bool,
) -> Result<(), String> {
    ensure_pdf_output_path(target_path)?;
    if !looks_like_pdf(pdf_bytes) {
        return Err("Save aborted: generated output is not a valid PDF stream.".to_string());
    }
    let parent = target_path
        .parent()
        .ok_or_else(|| "Save aborted: could not determine output folder.".to_string())?;
    if !parent.exists() {
        return Err("Save aborted: output folder does not exist.".to_string());
    }

    let tmp_path = temp_file_path(target_path);
    let mut tmp_file =
        File::create(&tmp_path).map_err(|e| format!("Could not create temp file: {e}"))?;
    tmp_file
        .write_all(pdf_bytes)
        .map_err(|e| format!("Could not write temp file: {e}"))?;
    tmp_file
        .sync_all()
        .map_err(|e| format!("Could not flush temp file to disk: {e}"))?;
    drop(tmp_file);

    let mut backup_created = None::<PathBuf>;
    if target_path.exists() && create_backup {
        let backup_path = backup_file_path(target_path);
        fs::copy(target_path, &backup_path)
            .map_err(|e| format!("Could not create backup file: {e}"))?;
        backup_created = Some(backup_path);
    }

    if target_path.exists() {
        fs::remove_file(target_path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("Could not replace existing file: {e}")
        })?;
    }

    if let Err(err) = fs::rename(&tmp_path, target_path) {
        if let Some(backup_path) = backup_created.as_ref() {
            if backup_path.exists() {
                let _ = fs::copy(backup_path, target_path);
            }
        }
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Could not finalize save operation: {err}"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Read};

    use super::safe_write_pdf;

    fn sample_pdf_bytes() -> Vec<u8> {
        b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF".to_vec()
    }

    #[test]
    fn writes_pdf_to_target() {
        let tmp_dir = tempfile::tempdir().expect("temp dir");
        let output = tmp_dir.path().join("out.pdf");
        safe_write_pdf(&output, &sample_pdf_bytes(), true).expect("save ok");
        assert!(output.exists());
    }

    #[test]
    fn rejects_invalid_pdf_signature() {
        let tmp_dir = tempfile::tempdir().expect("temp dir");
        let output = tmp_dir.path().join("out.pdf");
        let result = safe_write_pdf(&output, b"not-pdf", true);
        assert!(result.is_err());
    }

    #[test]
    fn creates_backup_on_overwrite() {
        let tmp_dir = tempfile::tempdir().expect("temp dir");
        let output = tmp_dir.path().join("existing.pdf");
        fs::write(&output, sample_pdf_bytes()).expect("seed file");
        safe_write_pdf(&output, &sample_pdf_bytes(), true).expect("save ok");

        let mut backup_found = false;
        for entry in fs::read_dir(tmp_dir.path()).expect("read dir") {
            let file_name = entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .to_string();
            if file_name.contains(".bak.") {
                backup_found = true;
            }
        }
        assert!(backup_found);

        let mut out = Vec::<u8>::new();
        fs::File::open(output)
            .expect("open")
            .read_to_end(&mut out)
            .expect("read");
        assert!(out.starts_with(b"%PDF-"));
    }
}
