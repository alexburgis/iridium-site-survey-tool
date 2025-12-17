# RockBLOCK CIER Logger (Raspberry Pi)

Standalone Python logger for unattended Iridium satellite surveys. Connects to a RockBLOCK/9602/9603 modem, enables CIER mode, and logs timestamped satellite events to file.

## Features

- Interactive CLI for port and storage selection
- Auto-discovers USB and GPIO serial ports
- Auto-discovers mounted storage (SD cards, USB drives)
- Timestamps from Iridium network time (AT-MSSTM)
- Output compatible with Site Survey Tool v4.1 importer

## Requirements

- Raspberry Pi (any model) or Linux system
- Python 3.7+
- RockBLOCK or Iridium 9602/9603 modem

## Installation

```bash
cd logger/pi
pip3 install -r requirements.txt
chmod +x cier_logger.py
```

## Usage

### Interactive Mode

```bash
./cier_logger.py
```

The script will guide you through:
1. Selecting a serial port (USB or GPIO)
2. Choosing baud rate (default 19200)
3. Selecting storage location and filename

### Command Line Mode

```bash
# Specify all options
./cier_logger.py -p /dev/ttyUSB0 -o /media/pi/SDCARD/survey.log -b 19200

# Just specify port (prompts for output location)
./cier_logger.py -p /dev/ttyUSB0

# List available ports
./cier_logger.py --list-ports
```

## Wiring

### USB Connection
Connect RockBLOCK via USB. The port will appear as `/dev/ttyUSB0` or similar.

### GPIO Connection (Raspberry Pi)

| RockBLOCK | Raspberry Pi |
|-----------|--------------|
| TX        | GPIO 15 (RXD) |
| RX        | GPIO 14 (TXD) |
| GND       | GND          |
| 5V IN     | 5V (if powering from Pi) |

Enable serial in `raspi-config`:
```bash
sudo raspi-config
# Interface Options > Serial Port > No (login shell) > Yes (hardware)
sudo reboot
```

GPIO serial appears as `/dev/serial0`.

## Troubleshooting

**No serial ports found**
- Check USB connection
- For GPIO: ensure serial is enabled in raspi-config
- Try `ls /dev/tty*` to see available devices

**Modem not responding**
- Check baud rate (default 19200 for RockBLOCK)
- Ensure modem has power
- Try disconnecting and reconnecting

**Permission denied on serial port**
```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

**No Iridium time available**
- Modem needs clear sky view to sync time
- Logger will use system time as fallback

---

## Log File Specification

For those writing custom loggers on other platforms (Arduino, ESP32, etc.), the log file format must match the following specification to be compatible with the Site Survey Tool v4.1 importer.

### Format

```
[YYYY-MM-DD HH:MM:SS.mmm] +CIEV:<data>
```

### Example Log File

```
# CIER Log - 2025-12-17 09:26:28
# Port: /dev/ttyUSB0 @ 19200 baud
# Time source: Iridium
#
[2025-12-17 09:26:36.663] +CIEV:0,3
[2025-12-17 09:26:36.665] +CIEV:1,1
[2025-12-17 09:26:36.666] +CIEV:2,0
[2025-12-17 09:26:36.669] +CIEV:3,85,8,0,4192,-640,4748
[2025-12-17 09:26:39.029] +CIEV:3,85,2,1,5304,-1200,4644
[2025-12-17 09:26:40.469] +CIEV:3,85,14,1,5312,-1204,4636
```

### Requirements

| Element | Format | Required |
|---------|--------|----------|
| Timestamp | `[YYYY-MM-DD HH:MM:SS.mmm]` | Yes |
| Event | `+CIEV:<indicator>,<values...>` | Yes |
| Header lines | Lines starting with `#` | No (ignored) |
| Blank lines | Empty lines | No (ignored) |

### CIEV Event Types

| Indicator | Format | Description |
|-----------|--------|-------------|
| 0 | `+CIEV:0,<signal>` | Signal strength (0-5) |
| 1 | `+CIEV:1,<avail>` | Service availability (0/1) |
| 2 | `+CIEV:2,<fault>` | Antenna fault (0/1) |
| 3 | `+CIEV:3,<svId>,<beamId>,<svBm>,<x>,<y>,<z>` | Satellite position (ECEF) |

### Satellite Position Data (Indicator 3)

```
+CIEV:3,<svId>,<beamId>,<svBm>,<x>,<y>,<z>
```

| Field | Description |
|-------|-------------|
| svId | Satellite vehicle ID |
| beamId | Beam number |
| svBm | Position type: 1=satellite position, 0=beam landing |
| x, y, z | Satellite position in ECEF coordinates |

**Note**: Only entries with `svBm=1` contain valid satellite position data. Entries with `svBm=0` are beam landings and should be ignored for sky plotting.

### Timestamp Source

For accurate timestamps, query the modem for Iridium network time before enabling CIER:

```
AT-MSSTM
-MSSTM: f27d0dc2

OK
```

Convert the hex value to datetime:
- Epoch: May 11, 2014, 14:23:55 UTC
- Each tick = 90 milliseconds
- `decoded_time = epoch + (hex_to_int(value) * 90ms)`

### Modem Setup Sequence

```
ATE0           # Disable echo
AT             # Test modem
AT-MSSTM       # Get Iridium time
AT+CIER=1,1,1,1,1  # Enable CIER mode (5 parameters)
```

The 5th CIER parameter enables satellite position reporting.
