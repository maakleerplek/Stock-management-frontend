# ESP32 relay (laser PC, Windows)

The ESP32 on the laser sends to the laser PC (10.72.3.66, UDP 5005). This relay
passes that on to the stock server, so the Lasercutter tab sees the real laser.

1. Stop the old LC-logger server: Services (`services.msc`), or `nssm stop <name>`
   in an admin prompt. It uses the same port.
2. Download `esp_relay.py` and `start_relay.bat` from
   `https://<stock server>:8086/laser/relay/` into one folder.
3. Double-click `start_relay.bat`. Allow Python through the Windows firewall
   when it asks (private network). Keep the window open.
4. Within 10 s the window shows `ESP32 at ...`; firing the laser shows `laser ON`.

Back to the old setup: close the window and start the LC-logger service again.
The server address is the argument in `start_relay.bat` (now 10.72.3.68, the
tempserver; later htl-server).
