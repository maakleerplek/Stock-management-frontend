"""UDP relay on the laser PC: ESP32 -> stock server, ACKs back.

The ESP32 on the laser has the laser PC's address burnt in (10.72.3.66:5005).
This relay takes that port, forwards every packet to the laser service on the
stock server and sends the server's replies (the heartbeat ACKs) back to the
ESP32, so nothing on the ESP32 has to be reflashed.

    py esp_relay.py 10.72.3.68

Standard library only. Stop the old LC-logger server first: it listens on the
same port.
"""
import json
import os
import socket
import sys
import time

PORT = 5005
server = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('LASER_SERVER', '10.72.3.68'), PORT)


def log(msg):
    print(time.strftime('%H:%M:%S'), msg, flush=True)


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(('0.0.0.0', PORT))
    log(f'relay: listening on UDP {PORT}, forwarding to {server[0]}:{server[1]}')

    esp = None
    last_heartbeat_log = 0.0
    while True:
        try:
            data, addr = sock.recvfrom(1024)
        except ConnectionResetError:
            # Windows reports an ICMP "port unreachable" from an earlier send
            # as an error on the next receive. Harmless: just keep going.
            continue
        if addr[0] == server[0]:
            if esp:
                sock.sendto(data, esp)
            continue

        if esp != addr:
            log(f'ESP32 at {addr[0]}:{addr[1]}')
        esp = addr
        sock.sendto(data, server)
        try:
            msg = json.loads(data.decode())
        except ValueError:
            log(f'unreadable packet: {data[:60]!r}')
            continue
        if 'state' in msg:
            log(f'laser {msg["state"]}')
        elif msg.get('type') == 'heartbeat' and time.time() - last_heartbeat_log > 60:
            log('heartbeat (logged once a minute)')
            last_heartbeat_log = time.time()


if __name__ == '__main__':
    try:
        main()
    except OSError as e:
        log(f'cannot open UDP {PORT}: {e}. Is the old LC-logger server still running?')
        input('Press Enter to close.')
