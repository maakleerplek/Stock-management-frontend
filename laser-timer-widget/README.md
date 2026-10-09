# Laser Timer (Windows)

A small always-on-top window in the top-right corner of the lasercutter PC. It shows the live laser time from the laser service. It turns orange when a job is done and the time isn't on a session yet, red after 5 minutes, and a click opens the full Lasercutter page to assign and pay.

- The UI is the stock app's `#laser-widget` page (`src/LaserWidget.tsx`), so changes to it go live without reinstalling.
- It starts at login, can't be closed (Alt+F4 and the close button do nothing), and only runs once.
- **Quit (volunteers): Ctrl+Alt+Shift+Q.**

## Install
The install files are on the HTL NAS in `1) STAFF/Ruben/laser-timer/`.
1. GitHub → Actions → *Laser Timer (Windows)* → latest run → download `laser-timer-windows` and put the `Laser Timer_*_x64-setup.exe` next to `install-laser-timer.ps1`.
2. Only if the server moved: add a `config.json` there (see `config.example.json`). The default is `https://10.72.3.68:8086`.
3. On the lasercutter PC, as the normal user: `powershell -ExecutionPolicy Bypass -File install-laser-timer.ps1`. It installs silently, starts it, and adds a watchdog task that starts it again within a minute if it gets killed.

For maintenance, quitting with the shortcut is only temporary because of the watchdog. To stop it for real: `Unregister-ScheduledTask -TaskName 'Laser Timer watchdog'`.

## Develop
`cd src-tauri && cargo run` (Linux works too, except always-on-top/positioning under Wayland). Build the installer on Windows with `npx @tauri-apps/cli@2 build --bundles nsis`, or let CI do it.

The webviews ignore certificate errors, because the stock server uses a self-signed certificate on the HTL network. Drop `--ignore-certificate-errors` in `src-tauri/src/main.rs` once it moves to a real `*.maakleerplek.be` domain.
