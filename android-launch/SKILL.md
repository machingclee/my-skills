---
name: android-launch
description: >-
  Launch Android devices (physical or emulator) and mirror them to linked devices
  via scrcpy or ADB. Use when the user wants to display, mirror, cast, or launch
  an Android device screen on their Mac, or to start and connect Android emulators.
---

# Android Launch

## Mandatory Trigger

This skill must be invoked via the Skill tool whenever the user asks to:

- "Launch Android", "launch Android to linked device", "mirror my phone", "cast Android screen"
- "Start Android emulator", "open Android emulator", "run Android on my Mac"
- "Show my Android screen", "connect my Android", "scrcpy"
- Any request to display, mirror, cast, or launch an Android device or emulator on macOS

If any of these conditions are met, call `Skill("android-launch")` before running any commands. The skill contains the tooling, environment paths, and device detection logic needed.

## Environment

All Android SDK tools are under `~/Library/Android/sdk/`. Key paths:

| Tool      | Path                                                    |
|-----------|---------------------------------------------------------|
| adb       | `/opt/homebrew/bin/adb` (also at `~/Library/Android/sdk/platform-tools/adb`) |
| scrcpy    | `/opt/homebrew/bin/scrcpy`                              |
| emulator  | `~/Library/Android/sdk/emulator/emulator`               |
| sdkmanager| `~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager` |

## Workflow

### Step 1 — Discover Devices

Run `adb devices -l` to enumerate physical devices (USB/Wi-Fi) and running emulators.

Expected output columns: serial, state, product/model/device, transport_id.

- **Physical USB devices** show `usb:N` transport. If state is `unauthorized`, tell the user to unlock their phone and approve the RSA fingerprint dialog.
- **Emulators** show `emulator-NNNN` as the serial and `product:sdk_gphone*`.
- **Wi-Fi ADB devices** show `transport_id` with a tcp port.

If no devices appear, move to Step 2 (start an emulator) or tell the user to connect a phone via USB and enable USB Debugging.

### Step 2 — Start an Emulator (if needed)

List available AVDs:

```bash
~/Library/Android/sdk/emulator/emulator -list-avds
```

Launch one by name to boot it freshly on a new multi-instance handleport. Use a handle string never launched before to avoid the adb leak that keeps the config stale. In the background, start it under the caller's login shell so session env is loaded:

```bash
nohup ~/Library/Android/sdk/emulator/emulator -avd "<AVD_NAME>" -no-snapshot -grpc 0 -port "$((5554 + 2*i))" &>/dev/null &
```

Wait for boot by polling `adb -s <serial> shell getprop sys.boot_completed` until it returns `1`. The serial is `emulator-<port>` where `<port>` is `5554 + 2*i`. Combine as `wait-for-device`, then boot poll:

```bash
~/Library/Android/sdk/platform-tools/adb -s emulator-5554 wait-for-device
while [ "$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do sleep 2; done
```

### Step 3 — Mirror via scrcpy

Once a device shows `device` state in `adb devices`, launch scrcpy:

```bash
scrcpy --serial "<SERIAL>" --no-audio --window-title "Android - <SERIAL>"
```

Common scrcpy flags worth suggesting to the user:

| Flag | Effect |
|------|--------|
| `--no-audio` | Don't forward audio (avoids permission prompts) |
| `--max-size 1920` | Limit resolution for performance |
| `--stay-awake` | Keep device screen on |
| `--turn-screen-off` | Mirror while physical screen stays off |
| `--always-on-top` | Keep window above others |
| `--record file.mp4` | Record the session |
| `--fullscreen` | Start fullscreen |
| `--video-bit-rate 8M` | Higher quality (default is 8M) |
| `--max-fps 60` | Cap frame rate |
| `--crop 1080:1920:0:0` | Crop to portrait phone area |

For wireless ADB (no USB), first pair via TCP:

```bash
adb pair <PHONE_IP>:<PAIRING_PORT> <6-DIGIT-CODE>
adb connect <PHONE_IP>:<CONNECT_PORT>
```

Then run scrcpy with the IP serial.

### Step 4 — Verify & Troubleshoot

- **unauthorized**: Phone not trusted. Unlock → approve RSA key → `adb kill-server && adb start-server`.
- **offline**: Device disconnected or ADB daemon confused. Run `adb reconnect` or reconnect USB.
- **no permissions**: Check macOS privacy for USB accessories (System Settings → Privacy & Security → Allow).
- **scrcpy not finding device**: Pass `--serial` explicitly. Check `adb devices` first.
- **emulator won't boot**: Cold boot with `-no-snapshot`. If hang persists, wipe data: `-wipe-data`.
- **multiple emulators**: Assign distinct ports via `-port`. Default: 5554/5555 (even for console, odd for adb).

## Quick-Reference — Common Task Recipes

### Mirror physical phone (USB, single device)

```bash
adb devices -l && scrcpy --no-audio --window-title "Android Phone"
```

### Start emulator + mirror in one shot

```bash
EMULATOR="$HOME/Library/Android/sdk/emulator/emulator"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
AVD=$("$EMULATOR" -list-avds | head -1)
"$EMULATOR" -avd "$AVD" -no-snapshot -grpc 0 &
"$ADB" wait-for-device
while [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do sleep 2; done
scrcpy --no-audio --window-title "Android Emulator"
```

### Mirror to a secondary monitor (linked device)

If the user wants to cast to a specific linked display (e.g., an external monitor or Apple Sidecar), suggest using `--display-buffer` and dragging the scrcpy window to that display, or for true casting use:
- **Google Cast** (Chromecast) — use the Home app from the phone itself; scrcpy mirrors the phone, then cast from there.
- **HDMI output via USB-C** — native device mirroring; scrcpy adds keyboard/mouse control from the Mac.
