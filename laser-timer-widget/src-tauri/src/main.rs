//! Laser Timer: a small always-on-top window in the top-right corner of the
//! lasercutter PC. It shows the stock app's #laser-widget page, can't be closed,
//! starts at login, and opens the full #laser page when you click it.
//!
//! Quit (volunteers): Ctrl+Alt+Shift+Q.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, thread, time::Duration};

use serde::Deserialize;
use tauri::{
    ipc::CapabilityBuilder, AppHandle, Manager, PhysicalPosition, PhysicalSize, Url, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::ShortcutState;

/// Fullscreen apps and some laser software take the top spot; take it back this often.
const ON_TOP_EVERY: Duration = Duration::from_secs(2);
const QUIT_SHORTCUT: &str = "ctrl+alt+shift+q";
const DEFAULT_SERVER: &str = "https://10.72.1.246:8086";

// All webviews share one WebView2 environment, so they need the same args:
// Tauri's defaults, plus the stock server's self-signed certificate.
const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --ignore-certificate-errors";

/// config.json next to the exe, e.g. `{ "server": "https://10.72.1.246:8086", "width": 440 }`.
/// Sizes are logical pixels; margins are the gap to the top-right corner.
#[derive(Deserialize)]
#[serde(default)]
struct Config {
    server: String,
    width: f64,
    height: f64,
    margin_top: f64,
    margin_right: f64,
}

impl Default for Config {
    fn default() -> Self {
        Config { server: DEFAULT_SERVER.into(), width: 440.0, height: 120.0, margin_top: 0.0, margin_right: 0.0 }
    }
}

fn load_config() -> Config {
    let mut config: Config = std::env::current_exe()
        .ok()
        .and_then(|exe| fs::read_to_string(exe.with_file_name("config.json")).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    config.server = config.server.trim_end_matches('/').into();
    config
}

fn place_top_right(w: &WebviewWindow, c: &Config) -> tauri::Result<()> {
    let Some(monitor) = w.primary_monitor()? else { return Ok(()) };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let size = PhysicalSize::new((c.width * scale) as u32, (c.height * scale) as u32);
    w.set_size(size)?;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - (c.margin_right * scale) as i32;
    let y = area.position.y + (c.margin_top * scale) as i32;
    w.set_position(PhysicalPosition::new(x, y))
}

/// The full laser page in a normal window that people can close. Async: creating
/// a window from a sync command deadlocks on Windows.
#[tauri::command]
async fn open_full(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("full") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let url = Url::parse(&format!("{}/#laser", app.state::<Config>().server)).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(&app, "full", WebviewUrl::External(url))
        .title("Lasercutter")
        .inner_size(1100.0, 800.0)
        .center()
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // Starting it again only brings the widget back.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("widget") {
                let _ = w.show();
            }
        }))
        .invoke_handler(tauri::generate_handler![open_full])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "widget" {
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            let config = load_config();
            let server = config.server.clone();

            app.handle().plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))?;
            if !cfg!(debug_assertions) {
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }
            }
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([QUIT_SHORTCUT])?
                    .with_handler(|app, _, event| {
                        if event.state == ShortcutState::Pressed {
                            app.exit(0);
                        }
                    })
                    .build(),
            )?;

            // The remote widget page may call open_full, nothing else.
            app.add_capability(
                CapabilityBuilder::new("widget-remote")
                    .remote(format!("{server}/*"))
                    .window("widget")
                    .permission("core:default"),
            )?;

            // loader/index.html waits until the server answers, then goes to #laser-widget.
            let widget = WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
                .title("Laser timer")
                .inner_size(config.width, config.height)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .minimizable(false)
                .maximizable(false)
                .closable(false)
                .focused(false)
                .visible(false)
                .initialization_script(&format!("window.LASER_SERVER = {};", serde_json::to_string(&server)?))
                .additional_browser_args(BROWSER_ARGS)
                .build()?;
            place_top_right(&widget, &config)?;
            widget.show()?;
            app.manage(config);

            let handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(ON_TOP_EVERY);
                if let Some(w) = handle.get_webview_window("widget") {
                    let _ = w.show();
                    let _ = w.set_always_on_top(true);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("laser timer failed to start");
}
