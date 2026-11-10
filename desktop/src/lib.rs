// Ruang app shell: the same offline web app in a native window.
// Windows: WebView2 window. Android: system WebView activity (Tauri 2 mobile).

use tauri::{WebviewUrl, WebviewWindowBuilder};

// wry's own defaults (no mini menu, no SmartScreen ping); kept when we pass our own args.
#[cfg(windows)]
const DEFAULT_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[cfg(windows)]
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()));
            #[cfg(desktop)]
            let builder = builder
                .title("Ruang - room photo to 3D planner")
                .inner_size(1360.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .center()
                .disable_drag_drop_handler();
            #[cfg(windows)]
            let builder = builder.additional_browser_args(&browser_args());
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ruang");
}
