// Ruang desktop: the same offline web app, packaged as a native Windows window (WebView2).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

// wry's own defaults (no mini menu, no SmartScreen ping); kept when we pass our own args.
const DEFAULT_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

fn browser_args() -> String {
    let mut args = String::from(DEFAULT_BROWSER_ARGS);
    // Test hook: RUANG_DEVTOOLS_PORT=9333 opens WebView2 remote debugging for tests/desktop_smoke.py.
    if let Ok(port) = std::env::var("RUANG_DEVTOOLS_PORT") {
        if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) {
            args.push_str(&format!(" --remote-debugging-port={port}"));
        }
    }
    args
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Ruang - room photo to 3D planner")
                .inner_size(1360.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .center()
                .disable_drag_drop_handler()
                .additional_browser_args(&browser_args())
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ruang");
}
