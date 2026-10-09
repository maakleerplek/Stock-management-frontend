//! Laser Timer: the stock app's Lasercutter page (#laser) in an always-on-top bar
//! along the right edge of the lasercutter PC. It can't be closed (only by ending
//! the process) and starts at login. Everything else is the website.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, thread, time::Duration};

use serde::Deserialize;
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Fullscreen apps and some laser software take the top spot; take it back this often.
const ON_TOP_EVERY: Duration = Duration::from_secs(2);
const DEFAULT_SERVER: &str = "https://10.72.1.246:8086";

// Tauri's default WebView2 args, plus the stock server's self-signed certificate.
const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --ignore-certificate-errors";

/// config.json next to the exe, e.g. `{ "server": "https://10.72.1.246:8086", "width": 400 }`.
/// `width` is the bar's width in logical pixels.
#[derive(Deserialize)]
#[serde(default)]
struct Config {
    server: String,
    width: f64,
}

impl Default for Config {
    fn default() -> Self {
        Config { server: DEFAULT_SERVER.into(), width: 400.0 }
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

/// The bar takes the right edge of the primary monitor, top to taskbar. On Windows
/// it is an app bar: the screen strip is reserved, so maximized windows stop next to it.
fn dock_right(w: &WebviewWindow, c: &Config) -> tauri::Result<()> {
    let Some(monitor) = w.primary_monitor()? else { return Ok(()) };
    let area = monitor.work_area();
    let width = (c.width * monitor.scale_factor()) as i32;
    // Right edge of the monitor itself: the work area already leaves out other app bars.
    let right = monitor.position().x + monitor.size().width as i32;
    let (top, bottom) = (area.position.y, area.position.y + area.size.height as i32);
    #[cfg(windows)]
    let (left, top, right, bottom) = appbar::register(w.hwnd()?.0 as _, right - width, top, right, bottom);
    #[cfg(not(windows))]
    let left = right - width;
    w.set_size(PhysicalSize::new((right - left) as u32, (bottom - top) as u32))?;
    w.set_position(PhysicalPosition::new(left, top))
}

#[cfg(windows)]
mod appbar {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::{
        Foundation::{HWND, RECT},
        UI::Shell::{SHAppBarMessage, ABE_RIGHT, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA},
    };

    fn data(hwnd: HWND) -> APPBARDATA {
        let mut abd: APPBARDATA = unsafe { zeroed() };
        abd.cbSize = size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;
        abd
    }

    /// Reserve the strip against the screen edge. Windows would move us left of
    /// other right-edge bars, and a killed Laser Timer leaves its bar behind until
    /// Explorer restarts, so we keep our own left/right and only take its top/bottom.
    pub fn register(hwnd: HWND, left: i32, top: i32, right: i32, bottom: i32) -> (i32, i32, i32, i32) {
        let mut abd = data(hwnd);
        unsafe {
            SHAppBarMessage(ABM_NEW, &mut abd);
            abd.uEdge = ABE_RIGHT;
            abd.rc = RECT { left, top, right, bottom };
            SHAppBarMessage(ABM_QUERYPOS, &mut abd);
            abd.rc.left = left;
            abd.rc.right = right;
            SHAppBarMessage(ABM_SETPOS, &mut abd);
        }
        (left, abd.rc.top, right, abd.rc.bottom)
    }

    /// Give the strip back to the other windows.
    pub fn remove(hwnd: HWND) {
        let mut abd = data(hwnd);
        unsafe { SHAppBarMessage(ABM_REMOVE, &mut abd) };
    }
}

fn main() {
    tauri::Builder::default()
        // Starting it again only brings the widget back.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("widget") {
                let _ = w.show();
            }
        }))
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

            // loader/index.html waits until the server answers, then goes to #laser.
            let widget = WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
                .title("Laser timer")
                .inner_size(config.width, 600.0)
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
            dock_right(&widget, &config)?;
            widget.show()?;

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
        .build(tauri::generate_context!())
        .expect("laser timer failed to start")
        .run(|_app, _event| {
            #[cfg(windows)]
            if let tauri::RunEvent::Exit = _event {
                if let Some(Ok(hwnd)) = _app.get_webview_window("widget").map(|w| w.hwnd()) {
                    appbar::remove(hwnd.0 as _);
                }
            }
        });
}
