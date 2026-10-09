# Laser Timer (Windows)

The stock app's Lasercutter page (`#laser`) in a bar docked on the right edge of the lasercutter PC, so the laser timer and Assign & pay are always in view.

- **It's just the website.** Change the Lasercutter page in the stock app, deploy, and the PC shows it. No reinstall needed.
- Always on top, full height, 400 px wide. Windows reserves that strip (it is an app bar), so a maximized LightBurn stops next to it.
- It can't be closed or minimized (Alt+F4 and the X do nothing). The only way is ending `laser-timer.exe` in Task Manager. It starts again at the next login.

## Install
The install files are on the HTL NAS in `1) STAFF/Ruben/laser-timer/`.
1. GitHub → Actions → *Laser Timer (Windows)* → latest run → download `laser-timer-windows` and put the `Laser Timer_*_x64-setup.exe` next to `install-laser-timer.ps1`.
2. Optional: a `config.json` there (see `config.example.json`): `server` (default `https://10.72.1.246:8086`) and `width` (default 400, logical pixels). After install it lives in `%LOCALAPPDATA%\Laser Timer\config.json`; restart the app after changing it.
3. On the lasercutter PC, as the normal user: `powershell -ExecutionPolicy Bypass -File install-laser-timer.ps1`.

## Develop
`cd src-tauri && cargo run` (Linux works too, without the app bar). Build the installer on Windows with `npx @tauri-apps/cli@2 build --bundles nsis`, or let CI do it.

The webview ignores certificate errors, because the stock server uses a self-signed certificate on the HTL network. Drop `--ignore-certificate-errors` in `src-tauri/src/main.rs` once it moves to a real `*.maakleerplek.be` domain.
