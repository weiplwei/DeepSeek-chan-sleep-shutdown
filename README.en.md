# deepseek-chan-sleep-shutdown

Shut down Windows automatically after DeepSeek Harness tasks complete —
night & moon edition, with a sleepy DeepSeek-chan whale mascot.
Zero-dependency plugin for the DeepSeek Harness web profile.

Run long tasks (batch migrations, model generation, overnight jobs)? Click the
whale-mascot button in the bottom-right corner and let DeepSeek-chan wait with
you, then drift off: the computer shuts down once the tasks finish — with a
cancellable countdown.

[中文](README.md)

## Mascot & design

- **Whale-mascot capsule button** with embedded mascot images
  (```assets/mascot-awake.webp``` awake / ```assets/mascot-sleep.webp``` sleeping)
  - Idle: awake mascot + "任务完成后关机" (Shutdown after task)
  - Armed: sleeping mascot + "已开启·任务完成后关机" (Armed)
- **Deep-night palette**: #1a1c2e base, #8b8ff5 accent, #ffd166 moon crescent;
  glassmorphism + soft glow
- **Armed motion**: breathing-glow CSS animation + glowing moon + floating "Zzz"
- **Countdown**: conic-gradient progress ring drawn around the button's outer
  edge; remaining seconds shown live on the button
- **Graceful degradation**: if the mascot images fail to load (onerror), the
  button silently degrades to a pure text capsule — everything keeps working

## Features

- **Draggable**: drag it anywhere; the position is remembered (localStorage,
  clamped to the viewport)
- **Auto-dodge**: when another plugin's corner popup overlaps the button, it
  steps aside and returns once the popup is gone
- **Cancellable countdown**: when the task completes, a 60 s banner (night-styled
  card) shows the remaining seconds with a **Cancel shutdown** button
  (```POST /cancel``` → ```shutdown /a```), anchored to the button's position
- **New-task interrupt**: starting a new task during the countdown aborts the
  shutdown while keeping the mode armed
- **Cancel exits the mode**
- **Success-only**: a batch with ```agent/error``` is skipped (banner notice)
- **Multi-session aware**: "task complete" = all root sessions idle
- **SPA self-heal**: a 500 ms interval re-attaches the button/banner if a
  front-end re-render dropped them

## Install

npm (once published):

```sh
dsh plugin --profile web add deepseek-chan-sleep-shutdown
```

or from GitHub:

```sh
dsh plugin --profile web add github:weiplwei/DeepSeek-chan-sleep-shutdown
```

Restart DSH, then refresh the page (Ctrl+R) if the button does not appear.

## Usage

1. Click the whale button — DeepSeek-chan falls asleep, the button breathes
   (armed). Drag it anywhere.
2. Run your tasks.
3. All root sessions idle with no errors → progress ring + remaining seconds on
   the button, countdown banner above it.
4. Click "取消关机 / Cancel shutdown" to abort; or let it run out — the computer
   shuts down.

## Config

Edit the profile's ```cordis.patch.yml```:

```yaml
- id: deepseek-chan-sleep-shutdown
  config:
    countdownSec: 60      # countdown seconds (10–600, default 60)
    marginSec: 5          # extra seconds on the OS shutdown /t (0–60, default 5)
    onlyOnSuccess: true   # shutdown only on a clean batch
```

## Behavior

| Item | Detail |
|---|---|
| Trigger | after arming, all root sessions go idle |
| Success check | no ```agent/error``` in the batch (when ```onlyOnSuccess: true```) |
| Countdown | ```countdownSec``` s, conic-gradient ring + live banner |
| OS command | ```shutdown /s /t <countdownSec + marginSec>``` at countdown start |
| Cancel | GUI button (exits mode) / new task during countdown (keeps mode) |
| State | ```GET http://127.0.0.1:<port>/api/deepseek-chan-sleep-shutdown/state``` |
| Images | ```GET /api/deepseek-chan-sleep-shutdown/img/sleep.webp```, ```/img/awake.webp``` (long cache; 404 when missing) |

## Log

```$DSH_HOME/deepseek-chan-sleep-shutdown.log``` — mount, arm, trigger, and cancel events.

## Local verification (test/harness, no real DSH needed)

```sh
node test/harness/server.js
# open the printed URL in a browser to see the full mascot UI with mock state
```

See ```test/harness/README.md```.

## Limitations

- **Windows only** (```shutdown.exe```); inert with a log line elsewhere.
- Mode state is in-memory: DSH restart resets it to off.
- The button appears after a page refresh (script injected per index response).
- Missing mascot images degrade the button to text-only (no error, no impact).

## Uninstall

```sh
dsh plugin --profile web remove deepseek-chan-sleep-shutdown
```

## Credits

- Server logic based on [dsh-shutdown-after-task](https://github.com/virggle/dsh-shutdown-after-task) (MIT)
- Event wiring modeled after [yang040709/dsh-win-toast-notify](https://github.com/yang040709/dsh-win-toast-notify) (MIT)

## License

MIT
