# Install Image Express on your Mac

You need **macOS 13 Ventura or later**. The desktop app includes its own runtime.
You do not need Terminal, Node.js, Git, Homebrew, or Apple developer tools.

## 1. Download

Open the [official Downloads page](https://github.com/GeekatplayStudio/Image-Express/releases).
Choose the newest published release and expand **Assets** if the files are hidden.

| Your Mac | Download the file ending in |
|---|---|
| Apple chip (any M-series chip) | **arm64.dmg** |
| Intel processor | **x64.dmg** |

Not sure? Click **Apple menu → About This Mac**. Look for **Chip** or **Processor**.
The macOS version is shown there too.

**Choose a `.dmg`, not “Source code” or a `.zip`.** ZIPs are for the automatic updater.
If no published release contains a Mac `.dmg`, the installer is not available yet.
Please wait for the signed release; downloading the source code is not an installation.

## 2. Install and open

1. Open **Finder → Downloads** and double-click the downloaded `.dmg`.
2. Double-click **Image Express** in the window that opens.
3. Click **Open** if macOS asks whether to open an app downloaded from the internet.
4. Click **Install and Open**. If your Mac asks for permission to install in Applications,
   approve it using your Mac password or Touch ID. The installed app opens automatically.

You can also **drag Image Express onto Applications** in that window, then open
**Finder → Applications → Image Express**. If a previous copy is running, quit it
with **⌘Q** before replacing it. Your projects and settings are stored separately.

Once the app opens, eject the Image Express disk in Finder. You can delete the `.dmg`.

## 3. Open it next time with one click

While Image Express is open, Control-click its icon in the Dock and choose
**Options → Keep in Dock**. From then on, **click the Dock icon** to open it.
You can also double-click it in **Applications**. You do not need to open the download again.

## First use

Follow the setup wizard. You can skip optional AI connections and start editing.
Cloud AI features need your own provider account/key. Local AI engines and models
are separate, optional downloads; they are not needed to open the editor.

## If your Mac shows a warning

**“Downloaded from the internet. Are you sure you want to open it?”**
This is the normal first-open confirmation. Check that you downloaded from the official
release page, then click **Open**.

**“Developer cannot be verified” / “Apple could not verify…”**
The public release should be signed and notarized. First download the newest official
release again. If it is still blocked, [report it](https://github.com/GeekatplayStudio/Image-Express/issues)
with the release number, macOS version, and exact message. For an older unsigned build
that you have independently verified and choose to trust, Apple's per-app approval is
**Apple menu → System Settings → Privacy & Security → Open Anyway**, after trying to open
the app once. Confirm the prompt. A managed Mac may not permit this.

**“Damaged”, “will damage your computer”, or a malware warning**
Stop and report the exact message. Do not turn off Gatekeeper, disable antivirus,
or run commands to remove download protection. An open-source license does not guarantee safety.

[Apple's current instructions for safely opening apps](https://support.apple.com/102445)
explain these different messages. Control-click → Open is not a reliable override on recent macOS.

## If installation or launch fails

- **Installation was not completed:** try the drag-to-Applications method above.
  On a work/school Mac, ask your administrator if installation is restricted.
- **App is not supported:** check macOS 13+ and download the file for your chip.
- **Window does not appear:** open Applications → Image Express. If it is already running,
  choose **Image Express → Quit Image Express**, then reopen it.
- **Need help:** report the app version, macOS version, chip, and the exact message at
  [GitHub Issues](https://github.com/GeekatplayStudio/Image-Express/issues).
  Logs are in `~/Library/Application Support/Image Express/logs/`.
  In Finder, choose **Go → Go to Folder** and paste that path.
  Review logs before sharing them; do not include API keys or personal projects.

## Updates and uninstall

The desktop app checks GitHub Releases for updates, downloads available updates,
and offers a restart to apply them. Save your work before restarting.
You can also install the newer `.dmg` over the existing app after quitting it.
There is no Terminal update command for the desktop app.

To uninstall, quit Image Express and move it from **Applications** to the Trash.
Your saved work remains in `~/Library/Application Support/Image Express/` so reinstalling
can recover it. Deleting that folder permanently deletes the app's local data; back it up first.
