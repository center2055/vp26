use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::{WebviewUrl, WindowConfig};
use tauri::{Manager, WindowEvent};

const BOOTSTRAP_SCRIPT: &str = r#"
const style = document.createElement('style');
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    background: #111827;
    color: #f3f4f6;
  }
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 38%),
      linear-gradient(180deg, #162033 0%, #111827 100%);
  }
  body {
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .vp26-boot {
    width: min(560px, calc(100vw - 48px));
    padding: 32px 30px;
    border-radius: 24px;
    background: rgba(15, 23, 42, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(18px);
  }
  .vp26-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(30, 41, 59, 0.9);
    color: #cbd5e1;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .vp26-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #60a5fa, #f97316);
    box-shadow: 0 0 18px rgba(96, 165, 250, 0.55);
  }
  h1 {
    margin: 22px 0 10px;
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1.04;
    letter-spacing: -0.04em;
  }
  p {
    margin: 0;
    color: #cbd5e1;
    font-size: 15px;
    line-height: 1.65;
  }
  .vp26-state {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-top: 22px;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(30, 41, 59, 0.7);
    color: #e5e7eb;
    font-size: 14px;
  }
  .vp26-spinner {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 2px solid rgba(148, 163, 184, 0.26);
    border-top-color: #60a5fa;
    animation: vp26-spin 0.9s linear infinite;
  }
  .vp26-detail {
    margin-top: 18px;
    color: #94a3b8;
    font-size: 13px;
    white-space: pre-wrap;
  }
  .vp26-boot.is-error .vp26-state {
    background: rgba(127, 29, 29, 0.32);
    color: #fecaca;
  }
  .vp26-boot.is-error .vp26-spinner {
    animation: none;
    border: 0;
    width: 14px;
    height: 14px;
    background: #fb7185;
    box-shadow: 0 0 0 6px rgba(251, 113, 133, 0.18);
  }
  @keyframes vp26-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
document.head.append(style);
document.title = 'VP26';
const BOOT_MARKUP = `
  <section class="vp26-boot" id="vp26-boot">
    <div class="vp26-badge">
      <span class="vp26-dot"></span>
      <span>VP26 Native Shell</span>
    </div>
    <h1 id="vp26-headline">Die App startet.</h1>
    <p id="vp26-copy">Die native Shell bereitet die Oberflaeche vor und prueft den Einstiegspfad.</p>
    <div class="vp26-state" id="vp26-state">
      <span class="vp26-spinner" aria-hidden="true"></span>
      <span id="vp26-state-text">Oberflaeche wird verbunden...</span>
    </div>
    <p class="vp26-detail" id="vp26-detail">Falls die App absichtlich aus einem Dev-Build gestartet wurde, bleibt dieser Startscreen kontrolliert sichtbar statt eine rohe Browser-Fehlerseite anzuzeigen.</p>
  </section>
`;
const applyBootState = (mode, headline, detail) => {
  const root = document.getElementById('vp26-boot');
  const head = document.getElementById('vp26-headline');
  const state = document.getElementById('vp26-state-text');
  const body = document.getElementById('vp26-copy');
  const info = document.getElementById('vp26-detail');
  if (!root || !head || !state || !body || !info) {
    return false;
  }
  root.classList.toggle('is-error', mode === 'error');
  head.textContent = headline;
  state.textContent = mode === 'error' ? 'Start abgebrochen' : 'Oberflaeche wird verbunden...';
  body.textContent = mode === 'error'
    ? 'VP26 bleibt auf dem nativen Startscreen, weil der eigentliche Renderer nicht sicher geladen werden konnte.'
    : 'Die native Shell bereitet die Oberflaeche vor und prueft den Einstiegspfad.';
  info.textContent = detail;
  return true;
};
const mountBootUi = () => {
  if (!document.body) {
    return false;
  }
  document.body.innerHTML = BOOT_MARKUP;
  const pending = window.__VP26_BOOT_PENDING__;
  if (pending) {
    applyBootState(pending.mode, pending.headline, pending.detail);
  }
  return true;
};
window.__VP26_BOOT__ = {
  setState(mode, headline, detail) {
    window.__VP26_BOOT_PENDING__ = { mode, headline, detail };
    applyBootState(mode, headline, detail);
  }
};
if (!mountBootUi()) {
  document.addEventListener('DOMContentLoaded', () => {
    mountBootUi();
  }, { once: true });
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (mountBootUi() || attempts > 120) {
      window.clearInterval(timer);
    }
  }, 16);
}
"#;

#[derive(Default)]
struct NativeShellState {
  close_to_tray: Mutex<bool>,
}

#[tauri::command]
fn should_start_in_tray() -> bool {
  should_launch_hidden()
}

#[tauri::command]
fn set_close_to_tray(
  enabled: bool,
  state: tauri::State<'_, NativeShellState>,
) -> Result<(), String> {
  let mut close_to_tray = state
    .close_to_tray
    .lock()
    .map_err(|error| error.to_string())?;
  *close_to_tray = enabled;
  Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
  app.exit(0);
}

fn should_launch_hidden() -> bool {
  std::env::args().any(|argument| argument == "--tray")
}

fn hide_window_to_tray(window: &tauri::WebviewWindow) -> Result<(), String> {
  window
    .set_skip_taskbar(true)
    .map_err(|error| error.to_string())?;
  window.hide().map_err(|error| error.to_string())?;
  Ok(())
}

fn show_window(window: &tauri::WebviewWindow) -> Result<(), String> {
  window
    .set_skip_taskbar(false)
    .map_err(|error| error.to_string())?;
  window.show().map_err(|error| error.to_string())?;
  window.unminimize().map_err(|error| error.to_string())?;
  window.set_focus().map_err(|error| error.to_string())?;
  Ok(())
}

fn with_main_window<T>(
  app: &tauri::AppHandle,
  action: impl FnOnce(&tauri::WebviewWindow) -> Result<T, String>,
) -> Result<T, String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "Hauptfenster nicht gefunden.".to_string())?;
  action(&window)
}

#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
  with_main_window(&app, hide_window_to_tray)
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
  with_main_window(&app, show_window)
}

fn main_window_config(app: &tauri::AppHandle) -> Result<WindowConfig, String> {
  app.config()
    .app
    .windows
    .iter()
    .find(|window| window.label == "main")
    .cloned()
    .or_else(|| app.config().app.windows.first().cloned())
    .ok_or_else(|| "Fensterkonfiguration fuer 'main' fehlt.".to_string())
}

fn build_main_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let mut config = main_window_config(app.handle())?;
  config.url = WebviewUrl::External("about:blank".parse()?);

  if should_launch_hidden() {
    config.visible = false;
    config.skip_taskbar = true;
    config.focus = false;
  }

  tauri::WebviewWindowBuilder::from_config(app, &config)?
    .background_color(tauri::webview::Color(15, 23, 36, 255))
    .initialization_script(BOOTSTRAP_SCRIPT)
    .build()?;

  Ok(())
}

fn resolve_main_window_target(
  _app: &tauri::AppHandle,
  window_config: &WindowConfig,
) -> Result<tauri::webview::Url, String> {
  match &window_config.url {
    WebviewUrl::External(url) | WebviewUrl::CustomProtocol(url) => Ok(url.clone()),
    WebviewUrl::App(path) => {
      #[cfg(dev)]
      let base = _app
        .config()
        .build
        .dev_url
        .clone()
        .ok_or_else(|| "Dev-URL fehlt in der Tauri-Konfiguration.".to_string())?;

      #[cfg(not(dev))]
      let base: tauri::webview::Url = "http://tauri.localhost/"
        .parse()
        .map_err(|error| format!("Interne App-URL konnte nicht geparst werden: {error}"))?;

      if path.to_str() == Some("index.html") {
        Ok(base)
      } else {
        base.join(&path.to_string_lossy())
          .map_err(|error| format!("Fensterziel konnte nicht aufgeloest werden: {error}"))
      }
    }
    _ => Err("Nicht unterstuetzter Webview-URL-Typ in der Fensterkonfiguration.".to_string()),
  }
}

fn needs_local_target_probe(url: &tauri::webview::Url) -> bool {
  matches!(url.scheme(), "http" | "https")
    && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
}

fn wait_for_target(url: &tauri::webview::Url) -> Result<(), String> {
  if !needs_local_target_probe(url) {
    return Ok(());
  }

  let host = url
    .host_str()
    .ok_or_else(|| "Lokaler Zielhost konnte nicht gelesen werden.".to_string())?;
  let port = url
    .port_or_known_default()
    .ok_or_else(|| format!("Lokaler Zielport fuer {url} fehlt."))?;
  let addresses = (host, port)
    .to_socket_addrs()
    .map_err(|error| format!("Lokaler Zielhost {host}:{port} konnte nicht aufgeloest werden: {error}"))?
    .collect::<Vec<_>>();

  if addresses.is_empty() {
    return Err(format!("Lokaler Zielhost {host}:{port} liefert keine gueltige Adresse."));
  }

  for _ in 0..18 {
    let reachable = addresses.iter().any(|address| {
      TcpStream::connect_timeout(address, Duration::from_millis(300)).is_ok()
    });

    if reachable {
      return Ok(());
    }

    thread::sleep(Duration::from_millis(250));
  }

  Err(format!(
    "{url} antwortet nicht. Dieser Start erwartet eine laufende Entwicklungsoberflaeche. Starte den Build ueber `npm run tauri:dev` oder verwende das gebuendelte NSIS/MSI-Paket."
  ))
}

fn update_boot_screen(window: &tauri::WebviewWindow, mode: &str, headline: &str, detail: &str) {
  let script = format!(
    "window.__VP26_BOOT_PENDING__ = {{ mode: {mode}, headline: {headline}, detail: {detail} }}; window.__VP26_BOOT__ && window.__VP26_BOOT__.setState({mode}, {headline}, {detail});",
    mode = serde_json::to_string(mode).unwrap_or_else(|_| "\"error\"".to_string()),
    headline = serde_json::to_string(headline)
      .unwrap_or_else(|_| "\"VP26 konnte nicht starten.\"".to_string()),
    detail = serde_json::to_string(detail).unwrap_or_else(|_| "\"Unbekannter Fehler.\"".to_string()),
  );

  let _ = window.eval(script);
}

fn launch_main_window(app: tauri::AppHandle) {
  thread::spawn(move || {
    thread::sleep(Duration::from_millis(60));

    let Some(window) = app.get_webview_window("main") else {
      return;
    };

    let window_config = match main_window_config(&app) {
      Ok(config) => config,
      Err(error) => {
        update_boot_screen(
          &window,
          "error",
          "Fensterstart fehlgeschlagen.",
          &error,
        );
        return;
      }
    };

    let target = match resolve_main_window_target(&app, &window_config) {
      Ok(target) => target,
      Err(error) => {
        update_boot_screen(
          &window,
          "error",
          "Startziel konnte nicht bestimmt werden.",
          &error,
        );
        return;
      }
    };

    if let Err(error) = wait_for_target(&target) {
      update_boot_screen(
        &window,
        "error",
        "Lokale Oberflaeche nicht erreichbar.",
        &error,
      );
      return;
    }

    if let Err(error) = window.navigate(target.clone()) {
      update_boot_screen(
        &window,
        "error",
        "Renderer konnte nicht geladen werden.",
        &format!(
          "Die Navigation nach {target} ist fehlgeschlagen: {error}. Die App bleibt deshalb absichtlich auf dem nativen Startscreen."
        ),
      );
    }
  });
}

fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let open_item = MenuItemBuilder::with_id("show", "VP26 oeffnen").build(app)?;
  let quit_item = MenuItemBuilder::with_id("quit", "Beenden").build(app)?;
  let menu = MenuBuilder::new(app)
    .items(&[&open_item, &quit_item])
    .build()?;

  let mut builder = TrayIconBuilder::with_id("vp26-tray")
    .menu(&menu)
    .tooltip("VP26")
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "show" => {
        let _ = with_main_window(app, show_window);
      }
      "quit" => {
        app.exit(0);
      }
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        let _ = with_main_window(tray.app_handle(), show_window);
      }
    });

  if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/icon.png")) {
    builder = builder.icon(icon);
  } else if let Some(icon) = app.default_window_icon().cloned() {
    builder = builder.icon(icon);
  }

  builder.build(app)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(NativeShellState::default())
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }

      if let WindowEvent::CloseRequested { api, .. } = event {
        let should_hide = window
          .app_handle()
          .state::<NativeShellState>()
          .close_to_tray
          .lock()
          .map(|state| *state)
          .unwrap_or(false);

        if should_hide {
          api.prevent_close();
          if let Some(main_window) = window.app_handle().get_webview_window("main") {
            let _ = hide_window_to_tray(&main_window);
          }
        }
      }
    })
    .setup(|app| {
      #[cfg(desktop)]
      app.handle().plugin(
        tauri_plugin_autostart::Builder::new()
          .args(["--tray"])
          .app_name("VP26")
          .build(),
      )?;

      build_main_window(app)?;
      build_tray(app)?;
      launch_main_window(app.handle().clone());

      Ok(())
    })
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
      should_start_in_tray,
      set_close_to_tray,
      quit_app,
      hide_to_tray,
      show_main_window
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
