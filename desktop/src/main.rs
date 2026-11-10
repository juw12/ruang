// Ruang desktop: the same offline web app, packaged as a native Windows window (WebView2).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Ruang");
}
