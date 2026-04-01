# Ubuntu DEB Build

VP26 ist jetzt auf einen DEB-Build fuer Ubuntu vorbereitet.

## Format

- Zielpaket: `DEB`
- Build-Befehl im Frontend: `npm run tauri:build:deb`
- Komfort-Skript fuer Ubuntu: `frontend/scripts/build-linux-deb.sh`

## Was fuer Ubuntu vorbereitet wurde

- Autostart registriert die App mit `--tray`, damit VP26 beim Login direkt versteckt im Tray starten kann.
- Tray, Benachrichtigungen und Autostart bleiben plattformneutral beschriftet und sind nicht mehr auf Windows-Text fest verdrahtet.
- Der Sidecar-Build erkennt jetzt Linux-Venvs unter `backend/.venv/bin/python3` oder `backend/.venv/bin/python`.
- Falls noch keine Backend-Venv existiert, legt der Build sie selbst an und installiert `requirements.txt` plus `pyinstaller`.

## Ubuntu-Pakete fuer den Build

Installiere auf dem Ubuntu-Rechner vor dem Build mindestens:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

Danach noch Node.js, Rust und Python 3 bereitstellen.

## Build auf Ubuntu

```bash
cd /pfad/zu/Vp26/frontend
bash ./scripts/build-linux-deb.sh
```

Das erzeugte Paket liegt danach unter:

```bash
frontend/src-tauri/target/release/bundle/deb/
```

## Hinweise

- Fuer moeglichst breite Ubuntu-Kompatibilitaet sollte der Linux-Build auf einer moeglichst alten Basis gebaut werden, nicht nur auf einem sehr neuen Desktop-System.
- Der Tauri-DEB-Bundler traegt die noetigen Laufzeitabhaengigkeiten fuer `libwebkit2gtk-4.1-0`, `libgtk-3-0` und bei Tray-Nutzung `libappindicator3-1` selbst in das Paket ein.
