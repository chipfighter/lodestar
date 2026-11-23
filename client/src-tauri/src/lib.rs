//! The tray client's shell: the data folder it shares with the plugin, the
//! tray icon, and the window, which hides to the tray instead of closing.

use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent, Wry,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_opener::OpenerExt;

/// The files the client shares with the plugin; no other name in the folder is read or written.
const FILES: [&str; 4] = ["library.json", "claude-code-skills.json", "next-session.json", "client.json"];

/// What the login item starts the app with: it waits in the tray, its window hidden.
const MINIMIZED: &str = "--minimized";

/// Whether the window stays hidden when the page first asks to show it (a start at login).
struct StartHidden(AtomicBool);

/// Keeps the watcher on the data folder alive for as long as the app runs.
struct DataWatcher(#[allow(dead_code)] Mutex<Option<RecommendedWatcher>>);

/// The tray menu's rows, whose labels follow the app's language.
struct TrayItems {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

/// The folder shared with the plugin, by the plugin's rule: SKILL_LOADOUT_HOME, else `.skill-loadout` in the home folder.
fn shared_dir() -> Option<PathBuf> {
    if let Some(own) = env_value("SKILL_LOADOUT_HOME") {
        return Some(PathBuf::from(own));
    }
    env_value("USERPROFILE")
        .or_else(|| env_value("HOME"))
        .map(|home| PathBuf::from(home).join(".skill-loadout"))
}

fn file_path(name: &str) -> Result<PathBuf, String> {
    if !FILES.contains(&name) {
        return Err(format!("not a data file: {name}"));
    }
    shared_dir().map(|dir| dir.join(name)).ok_or_else(|| "no home folder".to_string())
}

/// Writes the text beside the file, then swaps it in, so that no reader (the plugin) ever sees it half written.
fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut temp = path.as_os_str().to_owned();
    temp.push(format!(".{}.tmp", std::process::id()));
    let temp = PathBuf::from(temp);
    fs::write(&temp, text)?;
    let mut last = None;
    // A reader holding the file open can make the swap fail for a moment.
    for attempt in 1..=5 {
        match fs::rename(&temp, path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last = Some(error);
                std::thread::sleep(Duration::from_millis(40 * attempt));
            }
        }
    }
    let _ = fs::remove_file(&temp);
    Err(last.unwrap_or_else(|| io::Error::other("the file could not be replaced")))
}

#[tauri::command]
fn data_dir() -> Option<String> {
    shared_dir().map(|dir| dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_data(name: String) -> Result<Option<String>, String> {
    match fs::read_to_string(file_path(&name)?) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn write_data(name: String, text: String) -> Result<(), String> {
    write_atomic(&file_path(&name)?, &text).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_data(name: String) -> Result<(), String> {
    match fs::remove_file(file_path(&name)?) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = shared_dir().ok_or("no home folder")?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

/// The page asks for the window once it has drawn; a start at login keeps it in the tray.
#[tauri::command]
fn show_main(app: AppHandle, hidden: State<'_, StartHidden>) {
    if !hidden.0.swap(false, Ordering::SeqCst) {
        show_window(&app);
    }
}

/// The window's title and the tray menu's rows, in the language the page shows.
#[tauri::command]
fn set_labels(app: AppHandle, items: State<'_, TrayItems>, title: String, open: String, quit: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|error| error.to_string())?;
    }
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&title)).map_err(|error| error.to_string())?;
    }
    items.open.set_text(open).map_err(|error| error.to_string())?;
    items.quit.set_text(quit).map_err(|error| error.to_string())
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Lodestar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Lodestar")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(TrayItems { open, quit });
    Ok(())
}

/// Tells the page when a shared file changes on disk, whoever changed it.
fn watch_data(app: &AppHandle) -> Option<RecommendedWatcher> {
    let dir = shared_dir()?;
    fs::create_dir_all(&dir).ok()?;
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        for path in &event.paths {
            if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                if FILES.contains(&name) {
                    let _ = handle.emit("data-changed", name);
                }
            }
        }
    })
    .ok()?;
    watcher.watch(&dir, RecursiveMode::NonRecursive).ok()?;
    Some(watcher)
}

/// client.json: the plugin's card mentions the client once it knows the client is here.
fn note_client(app: &AppHandle) {
    let Ok(path) = file_path("client.json") else { return };
    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as u64)
        .unwrap_or(0);
    let info = serde_json::json!({
        "app": "lodestar",
        "version": app.package_info().version.to_string(),
        "path": std::env::current_exe().map(|exe| exe.to_string_lossy().into_owned()).unwrap_or_default(),
        "startedAt": started,
    });
    if let Ok(text) = serde_json::to_string_pretty(&info) {
        let _ = write_atomic(&path, &format!("{text}\n"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_minimized = std::env::args().any(|arg| arg == MINIMIZED);
    tauri::Builder::default()
        // A second start shows the running one's window instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![MINIMIZED])))
        .plugin(tauri_plugin_opener::init())
        .manage(StartHidden(AtomicBool::new(is_minimized)))
        .invoke_handler(tauri::generate_handler![
            data_dir,
            read_data,
            write_data,
            remove_data,
            open_data_dir,
            show_main,
            set_labels
        ])
        .setup(|app| {
            build_tray(app)?;
            let handle = app.handle().clone();
            app.manage(DataWatcher(Mutex::new(watch_data(&handle))));
            note_client(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window leaves the app in the tray; the tray menu quits it.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("the app failed to start");
}
