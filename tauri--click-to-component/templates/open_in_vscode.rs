// ─────────────────────────────────────────────────────────────────────────────
// open_in_vscode — Rust side of TauriClickToComponent
// ─────────────────────────────────────────────────────────────────────────────
// Add all four pieces or the command won't exist:
//
// 1) src-tauri/Cargo.toml:
//    tauri-plugin-opener = "2"
//
// 2) imports at top of src-tauri/src/lib.rs:
//    use tauri_plugin_opener::OpenerExt;
//
// 3) in the Builder chain (before .invoke_handler):
//    .plugin(tauri_plugin_opener::init())
//
// 4) in the existing invoke_handler list:
//    tauri::generate_handler![
//        // ...existing commands...
//        open_in_vscode,
//    ]
//
// The `path` payload is `filePath:lineNumber:columnNumber`, e.g.
// "/Users/me/app/src/App.tsx:42:7" — VS Code interprets the :line:col suffix.
// ─────────────────────────────────────────────────────────────────────────────

/// Open a file in VS Code via the vscode:// URL scheme.
/// Used by TauriClickToComponent in dev mode — WKWebView can't navigate
/// vscode:// URLs directly, so the frontend invokes this command instead.
#[tauri::command]
async fn open_in_vscode(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // VS Code wants vscode://file/C:/path on Windows; backslashes break the URL.
    let path = path.replace('\\', "/");
    let url = if path.starts_with('/') {
        format!("vscode://file{}", path)
    } else {
        format!("vscode://file/{}", path)
    };
    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|e| e.to_string())
}

// For a non-VS Code editor, swap the scheme, e.g.:
//   IntelliJ:   format!("idea://open?file={}", path)  // or idea://file...
//   generic:    format!("editor://open?file={}", path)
//   CLI:        run `code --goto <path>` via std::process::Command instead.
