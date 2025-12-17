#!/usr/bin/env python3
"""
RockBLOCK CIER Logger for Raspberry Pi

Standalone logger that connects to an Iridium 9602/9603 modem,
enables CIER mode, and logs timestamped serial output to file.

Timestamps are derived from Iridium network time (AT-MSSTM).
Output format is compatible with the Site Survey Tool v4.1 importer.
"""

import os
import sys
import time
import glob
import serial
import argparse
from datetime import datetime, timedelta

# Iridium ERA2 epoch: May 11, 2014, 14:23:55 UTC
IRIDIUM_ERA2_EPOCH = datetime(2014, 5, 11, 14, 23, 55)
IRIDIUM_TICK_MS = 90  # Each tick is 90 milliseconds


def find_serial_ports():
    """Discover available serial ports on the system."""
    ports = []

    # USB serial devices
    usb_ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    for port in usb_ports:
        ports.append({'path': port, 'type': 'USB', 'description': f'USB Serial ({os.path.basename(port)})'})

    # Raspberry Pi GPIO serial
    gpio_ports = [
        ('/dev/serial0', 'Primary GPIO serial (pins 14/15)'),
        ('/dev/ttyAMA0', 'PL011 UART'),
        ('/dev/ttyS0', 'Mini UART'),
    ]
    for path, desc in gpio_ports:
        if os.path.exists(path):
            ports.append({'path': path, 'type': 'GPIO', 'description': desc})

    return ports


def find_storage_locations():
    """Discover available storage locations."""
    locations = []

    # Current directory
    locations.append({
        'path': os.getcwd(),
        'type': 'Local',
        'description': f'Current directory ({os.getcwd()})'
    })

    # Home directory
    home = os.path.expanduser('~')
    locations.append({
        'path': home,
        'type': 'Local',
        'description': f'Home directory ({home})'
    })

    # Check for mounted storage (SD cards, USB drives)
    mount_points = ['/media', '/mnt', '/run/media']
    for mount_base in mount_points:
        if os.path.exists(mount_base):
            try:
                for user_dir in os.listdir(mount_base):
                    user_path = os.path.join(mount_base, user_dir)
                    if os.path.isdir(user_path):
                        for device in os.listdir(user_path):
                            device_path = os.path.join(user_path, device)
                            if os.path.isdir(device_path) and os.access(device_path, os.W_OK):
                                locations.append({
                                    'path': device_path,
                                    'type': 'Removable',
                                    'description': f'Mounted storage: {device}'
                                })
            except PermissionError:
                pass

    return locations


def prompt_selection(items, prompt_text, item_formatter):
    """Generic prompt for selecting from a list."""
    if not items:
        return None

    print(f"\n{prompt_text}")
    print("-" * 50)

    for i, item in enumerate(items, 1):
        print(f"  [{i}] {item_formatter(item)}")

    print()

    while True:
        try:
            choice = input("Enter selection (number): ").strip()
            if not choice:
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(items):
                return items[idx]
            print(f"Please enter a number between 1 and {len(items)}")
        except ValueError:
            print("Please enter a valid number")
        except KeyboardInterrupt:
            print("\nCancelled")
            return None


def select_serial_port():
    """Interactive serial port selection."""
    ports = find_serial_ports()

    if not ports:
        print("\nNo serial ports found!")
        print("Make sure your RockBLOCK is connected via USB or GPIO is enabled.")
        manual = input("\nEnter port path manually (or press Enter to exit): ").strip()
        return manual if manual else None

    selected = prompt_selection(
        ports,
        "Available Serial Ports:",
        lambda p: f"{p['description']} - {p['path']}"
    )

    if selected:
        return selected['path']

    manual = input("\nEnter port path manually (or press Enter to exit): ").strip()
    return manual if manual else None


def select_storage_location():
    """Interactive storage location selection."""
    locations = find_storage_locations()

    selected = prompt_selection(
        locations,
        "Available Storage Locations:",
        lambda l: f"[{l['type']}] {l['description']}"
    )

    if selected:
        base_path = selected['path']
    else:
        base_path = input("\nEnter storage path manually: ").strip()
        if not base_path:
            base_path = os.getcwd()

    # Generate default filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_filename = f"cier_log_{timestamp}.log"

    print(f"\nDefault filename: {default_filename}")
    custom = input("Enter custom filename (or press Enter for default): ").strip()

    filename = custom if custom else default_filename
    if not filename.endswith('.log'):
        filename += '.log'

    return os.path.join(base_path, filename)


def select_baud_rate():
    """Select baud rate for serial connection."""
    rates = [19200, 9600, 38400, 57600, 115200]

    print("\nBaud Rate (default 19200 for RockBLOCK):")
    print("-" * 50)
    for i, rate in enumerate(rates, 1):
        default = " (default)" if rate == 19200 else ""
        print(f"  [{i}] {rate}{default}")

    choice = input("\nEnter selection (or press Enter for default): ").strip()

    if not choice:
        return 19200

    try:
        idx = int(choice) - 1
        if 0 <= idx < len(rates):
            return rates[idx]
    except ValueError:
        pass

    return 19200


def iridium_time_to_datetime(hex_value):
    """Convert Iridium system time (AT-MSSTM hex response) to datetime.

    MSSTM returns hex value representing 90ms ticks since Iridium ERA2 epoch.
    """
    try:
        # Convert from hex to decimal (count of 90ms intervals)
        interval_count = int(hex_value.strip(), 16)

        # Calculate total milliseconds since epoch
        total_milliseconds = interval_count * IRIDIUM_TICK_MS

        # Create timedelta and add to epoch
        time_delta = timedelta(milliseconds=total_milliseconds)
        decoded_time = IRIDIUM_ERA2_EPOCH + time_delta

        return decoded_time
    except (ValueError, TypeError):
        return None


def send_command(ser, command, timeout=2):
    """Send AT command and return response lines."""
    ser.reset_input_buffer()
    ser.write(f"{command}\r".encode())
    time.sleep(0.2)

    response_lines = []
    end_time = time.time() + timeout

    while time.time() < end_time:
        if ser.in_waiting:
            line = ser.readline().decode('ascii', errors='ignore').strip()
            if line:
                response_lines.append(line)
                if line in ['OK', 'ERROR', 'READY']:
                    break
        else:
            time.sleep(0.05)

    return response_lines


def get_iridium_time(ser):
    """Get current time from Iridium network."""
    response = send_command(ser, "AT-MSSTM", timeout=5)

    for line in response:
        if "-MSSTM:" in line:
            hex_time = line.split(":")[1].strip()
            if hex_time and hex_time != "no network service":
                return iridium_time_to_datetime(hex_time)

    return None


def setup_modem(ser):
    """Initialize modem and get time. Does NOT enable CIER yet."""
    print("\nInitializing modem...")

    # Disable echo first
    ser.write(b"ATE0\r")
    time.sleep(0.5)
    ser.reset_input_buffer()

    # Basic AT test
    response = send_command(ser, "AT")
    if "OK" not in response:
        print("WARNING: Modem not responding to AT command")
        return None

    print("  OK Modem responding")

    # Get Iridium time
    iridium_dt = get_iridium_time(ser)
    if iridium_dt:
        print(f"  OK Iridium time: {iridium_dt.strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        print("  !! Could not get Iridium time (using system time)")

    return iridium_dt


def enable_cier(ser):
    """Enable CIER mode. Call this right before logging starts."""
    response = send_command(ser, "AT+CIER=1,1,1,1,1")
    return "OK" in response


def check_system_time():
    """Check if system time looks reasonable and warn if not."""
    now = datetime.now()
    # If year is before 2024, time is probably wrong (no RTC, no NTP)
    if now.year < 2024:
        print(f"\n!!  WARNING: System time appears incorrect ({now.strftime('%Y-%m-%d %H:%M:%S')})")
        print("    Your Pi may not have synced with NTP.")
        print("    Options:")
        print("      1. Connect to internet and run: sudo timedatectl set-ntp true")
        print("      2. Set manually: sudo date -s '2025-12-17 09:00:00'")
        print("      3. Continue anyway (timestamps will use Iridium time if available)\n")
        choice = input("Continue with incorrect time? [y/N]: ").strip().lower()
        return choice == 'y'
    return True


def run_logger(port, output_file, baud_rate=19200):
    """Main logging loop."""

    # Check system time first
    if not check_system_time():
        print("Exiting. Please fix system time and retry.")
        return False

    print(f"\nConnecting to {port} at {baud_rate} baud...")

    try:
        ser = serial.Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )
    except serial.SerialException as e:
        print(f"ERROR: Could not open serial port: {e}")
        return False

    print(f"Connected to {port}")

    # Setup modem and get time (but don't enable CIER yet)
    iridium_dt = setup_modem(ser)
    if iridium_dt is None and not send_command(ser, "AT"):
        # setup_modem returns None on failure, but also None if just no time
        # Double-check modem is responsive
        ser.close()
        return False

    # Calculate time offset from Iridium
    if iridium_dt:
        time_offset = (iridium_dt - datetime.now()).total_seconds()
        using_iridium_time = True
    else:
        time_offset = 0
        using_iridium_time = False

    # Open output file FIRST
    print(f"\nLogging to: {output_file}")

    try:
        with open(output_file, 'w') as f:
            # Write header comment
            f.write(f"# CIER Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"# Port: {port} @ {baud_rate} baud\n")
            f.write(f"# Time source: {'Iridium' if using_iridium_time else 'System'}\n")
            f.write("#\n")
            f.flush()

            # NOW enable CIER mode, right before we start reading
            if not enable_cier(ser):
                print("  !! Failed to enable CIER mode")
                ser.close()
                return False
            print("  OK CIER mode enabled")

            print("\n" + "=" * 50)
            print("CIER Logger Active - Press Ctrl+C to stop")
            print("=" * 50 + "\n")

            event_count = 0
            last_time_sync = time.time()

            while True:
                # Periodically sync time with Iridium (every 5 minutes)
                if time.time() - last_time_sync > 300:
                    iridium_dt = get_iridium_time(ser)
                    if iridium_dt:
                        time_offset = (iridium_dt - datetime.now()).total_seconds()
                        using_iridium_time = True
                    last_time_sync = time.time()

                # Read incoming data
                if ser.in_waiting:
                    try:
                        line = ser.readline().decode('ascii', errors='ignore').strip()
                    except:
                        continue

                    if not line:
                        continue

                    # Calculate current timestamp
                    current_time = datetime.now() + timedelta(seconds=time_offset)
                    timestamp = current_time.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

                    # Log all CIEV events
                    if line.startswith("+CIEV:"):
                        event_count += 1

                        # Write timestamped line to log
                        log_line = f"[{timestamp}] {line}"
                        f.write(log_line + "\n")
                        f.flush()

                        # Display to console
                        print(log_line)

                else:
                    time.sleep(0.01)

    except KeyboardInterrupt:
        print(f"\n\nStopping logger...")
        print(f"Total events logged: {event_count}")

    except IOError as e:
        print(f"\nERROR: Could not write to file: {e}")
        return False

    finally:
        # Disable CIER mode
        print("Disabling CIER mode...")
        send_command(ser, "AT+CIER=0")
        ser.close()
        print(f"Log saved to: {output_file}")

    return True


def interactive_setup():
    """Run interactive setup prompts."""
    print("\n" + "=" * 50)
    print("  RockBLOCK CIER Logger - Interactive Setup")
    print("=" * 50)

    # Select serial port
    port = select_serial_port()
    if not port:
        print("No serial port selected. Exiting.")
        return None, None, None

    # Select baud rate
    baud_rate = select_baud_rate()

    # Select storage location
    output_file = select_storage_location()
    if not output_file:
        print("No storage location selected. Exiting.")
        return None, None, None

    return port, output_file, baud_rate


def main():
    parser = argparse.ArgumentParser(
        description='RockBLOCK CIER Logger for Raspberry Pi',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          Interactive setup
  %(prog)s -p /dev/ttyUSB0          Use specific port
  %(prog)s -p /dev/ttyUSB0 -o survey.log -b 19200

Output format:
  Timestamped log file compatible with Site Survey Tool v4.1 importer.

  [2025-12-17 09:04:33.123] +CIEV:0,3
  [2025-12-17 09:04:33.456] +CIEV:3,109,24,1,3716,-824,6052
        """
    )

    parser.add_argument('-p', '--port',
                        help='Serial port (e.g., /dev/ttyUSB0, /dev/serial0)')
    parser.add_argument('-o', '--output',
                        help='Output file path')
    parser.add_argument('-b', '--baud', type=int, default=19200,
                        help='Baud rate (default: 19200)')
    parser.add_argument('-l', '--list-ports', action='store_true',
                        help='List available serial ports and exit')

    args = parser.parse_args()

    # List ports mode
    if args.list_ports:
        ports = find_serial_ports()
        if ports:
            print("Available serial ports:")
            for p in ports:
                print(f"  {p['path']} - {p['description']}")
        else:
            print("No serial ports found")
        return

    # Determine configuration
    if args.port and args.output:
        # Command line mode
        port = args.port
        output_file = args.output
        baud_rate = args.baud
    elif args.port:
        # Port specified, prompt for output
        port = args.port
        baud_rate = args.baud
        output_file = select_storage_location()
        if not output_file:
            return
    else:
        # Full interactive mode
        port, output_file, baud_rate = interactive_setup()
        if not port:
            return

    # Confirm settings
    print("\n" + "-" * 50)
    print("Configuration:")
    print(f"  Serial Port: {port}")
    print(f"  Baud Rate:   {baud_rate}")
    print(f"  Output File: {output_file}")
    print("-" * 50)

    confirm = input("\nStart logging? [Y/n]: ").strip().lower()
    if confirm and confirm != 'y':
        print("Cancelled.")
        return

    # Run logger
    run_logger(port, output_file, baud_rate)


if __name__ == "__main__":
    main()
