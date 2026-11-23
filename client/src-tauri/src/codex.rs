//! Codex: finding its program, asking it which skills it has, and switching skills off for new
//! Codex sessions by the Agent the person picks in Lodestar.
//!
//! Codex reads `[[skills.config]]` entries in its config.toml (`name` or `path`, `enabled = false`),
//! the later entry winning, each time a session starts; an open session keeps its skills. Lodestar
//! adds one `{ name, enabled = false }` entry per skill the Agent leaves out, marks each `# lodestar`,
//! and leaves every other line of the file as it was.

use std::{
    fs, io,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use toml_edit::{ArrayOfTables, DocumentMut, InlineTable, Item, Table, Value as TomlValue};

/// The mark after each `[[skills.config]]` header Lodestar writes.
const MARK: &str = "# lodestar";

/// How long Codex gets to start and answer.
const PATIENCE: Duration = Duration::from_secs(30);

/// Windows: start Codex with no console window of its own.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

fn user_home() -> Option<PathBuf> {
    env_value("USERPROFILE").or_else(|| env_value("HOME")).map(PathBuf::from)
}

/// Codex's own folder, by Codex's rule: CODEX_HOME, else `.codex` in the home folder.
pub fn home() -> Option<PathBuf> {
    env_value("CODEX_HOME").map(PathBuf::from).or_else(|| user_home().map(|home| home.join(".codex")))
}

/// How Codex is started: its program, and the arguments before Codex's own.
pub struct Launcher {
    program: PathBuf,
    args: Vec<String>,
}

/// The Codex desktop app keeps its own codex.exe in `%LOCALAPPDATA%\OpenAI\Codex\bin\<build>\`; the newest build is the one it runs.
fn desktop_codex() -> Option<PathBuf> {
    let bin = PathBuf::from(env_value("LOCALAPPDATA")?).join("OpenAI").join("Codex").join("bin");
    let mut builds: Vec<(SystemTime, PathBuf)> = fs::read_dir(bin)
        .ok()?
        .filter_map(|entry| {
            let exe = entry.ok()?.path().join("codex.exe");
            let modified = fs::metadata(&exe).ok()?.modified().ok()?;
            Some((modified, exe))
        })
        .collect();
    builds.sort();
    builds.pop().map(|(_, exe)| exe)
}

/// An npm install puts a `codex.cmd` on PATH and Codex's own program in its package's `vendor` folder.
fn npm_codex(dir: &Path) -> Option<PathBuf> {
    let vendor = dir.join("node_modules").join("@openai").join("codex").join("vendor");
    fs::read_dir(vendor)
        .ok()?
        .filter_map(|entry| Some(entry.ok()?.path().join("codex").join("codex.exe")))
        .find(|exe| exe.is_file())
}

fn path_codex() -> Option<Launcher> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let exe = dir.join(if cfg!(windows) { "codex.exe" } else { "codex" });
        if exe.is_file() {
            return Some(Launcher { program: exe, args: vec![] });
        }
        let shim = dir.join("codex.cmd");
        if cfg!(windows) && shim.is_file() {
            if let Some(exe) = npm_codex(&dir) {
                return Some(Launcher { program: exe, args: vec![] });
            }
            return Some(Launcher {
                program: PathBuf::from("cmd.exe"),
                args: vec!["/D".into(), "/C".into(), shim.to_string_lossy().into_owned()],
            });
        }
    }
    None
}

/// Codex's program: LODESTAR_CODEX names one; else the desktop app's; else one on PATH.
pub fn find() -> Option<Launcher> {
    if let Some(own) = env_value("LODESTAR_CODEX") {
        return Some(Launcher { program: PathBuf::from(own), args: vec![] });
    }
    desktop_codex().map(|program| Launcher { program, args: vec![] }).or_else(path_codex)
}

/// Where Codex is and where its settings are, for the page; null where there is no Codex.
pub fn info() -> Option<Value> {
    let launcher = find()?;
    let home = home()?;
    Some(json!({
        "program": launcher.args.last().cloned().unwrap_or_else(|| launcher.program.to_string_lossy().into_owned()),
        "home": home.to_string_lossy(),
        "config": home.join("config.toml").to_string_lossy(),
    }))
}

/// The folder Codex is asked from: its own, which no project holds, so that no project's own
/// skills (a repo's `.agents/skills`) are mixed in; the home folder where it has none yet.
fn neutral_dir() -> Option<PathBuf> {
    home().filter(|dir| dir.is_dir()).or_else(user_home)
}

/// Starts `codex app-server`, asks it one thing, and stops it.
fn ask(launcher: &Launcher, method: &str, params: Value) -> Result<Value, String> {
    let mut command = Command::new(&launcher.program);
    command
        .args(&launcher.args)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(dir) = neutral_dir() {
        command.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|error| format!("Codex could not be started ({error})"))?;
    let answer = converse(&mut child, method, params);
    let _ = child.kill();
    let _ = child.wait();
    answer
}

/// The app server's JSON-RPC over stdio, a message per line: initialize, then the question.
fn converse(child: &mut Child, method: &str, params: Value) -> Result<Value, String> {
    let mut stdin = child.stdin.take().ok_or("Codex's input could not be opened")?;
    let stdout = child.stdout.take().ok_or("Codex's output could not be opened")?;
    let (sender, receiver) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let deadline = Instant::now() + PATIENCE;
    let mut send = |message: Value| -> Result<(), String> {
        writeln!(stdin, "{message}")
            .and_then(|()| stdin.flush())
            .map_err(|error| format!("Codex stopped answering ({error})"))
    };
    let wait_for = |id: u64| -> Result<Value, String> {
        loop {
            let left = deadline.checked_duration_since(Instant::now()).ok_or("Codex took too long to answer")?;
            let line = receiver.recv_timeout(left).map_err(|_| "Codex took too long to answer".to_string())?;
            let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
            if message.get("id").and_then(Value::as_u64) != Some(id) || message.get("method").is_some() {
                continue;
            }
            if let Some(error) = message.get("error") {
                let text = error.get("message").and_then(Value::as_str).unwrap_or("an error");
                return Err(format!("Codex answered: {text}"));
            }
            return Ok(message.get("result").cloned().unwrap_or(Value::Null));
        }
    };
    send(json!({
        "id": 1,
        "method": "initialize",
        "params": { "clientInfo": { "name": "lodestar", "version": env!("CARGO_PKG_VERSION") } },
    }))?;
    wait_for(1)?;
    send(json!({ "method": "initialized" }))?;
    send(json!({ "id": 2, "method": method, "params": params }))?;
    wait_for(2)
}

/// Every skill Codex has outside any project, each as Codex describes it, switched off or not.
pub fn skills() -> Result<Value, String> {
    let launcher = find().ok_or("Codex was not found")?;
    let cwd = neutral_dir().ok_or("no home folder")?;
    let result = ask(&launcher, "skills/list", json!({ "cwds": [cwd], "forceReload": true }))?;
    let entry = result.get("data").and_then(|data| data.get(0)).cloned().unwrap_or_else(|| json!({}));

    Ok(json!({
        "skills": entry.get("skills").cloned().unwrap_or_else(|| json!([])),
        "errors": entry.get("errors").cloned().unwrap_or_else(|| json!([])),
    }))
}

// Changing config.toml.

/// config.toml after a switch: its text, the skills Lodestar now switches off, and how many of its old entries went.
#[derive(Debug)]
pub struct Edit {
    pub text: String,
    pub added: Vec<String>,
    pub removed: usize,
}

fn text_of(value: Option<&TomlValue>) -> Option<&str> {
    value.and_then(TomlValue::as_str)
}

/// Whether an entry is Lodestar's: marked so, or, where the mark was lost (the file rewritten by
/// another tool), one that only switches off a skill Lodestar switched off last time.
fn is_ours(marked: bool, name: Option<&str>, has_path: bool, enabled: Option<bool>, previous: &[String]) -> bool {
    marked || (!has_path && enabled == Some(false) && name.is_some_and(|name| previous.iter().any(|one| one == name)))
}

fn is_ours_table(table: &Table, previous: &[String]) -> bool {
    let marked = table.decor().suffix().and_then(|suffix| suffix.as_str()).is_some_and(|suffix| suffix.contains(MARK));
    let name = table.get("name").and_then(Item::as_value);
    let enabled = table.get("enabled").and_then(Item::as_value).and_then(TomlValue::as_bool);
    is_ours(marked, text_of(name), table.contains_key("path"), enabled, previous)
}

fn is_ours_inline(table: &InlineTable, previous: &[String]) -> bool {
    let enabled = table.get("enabled").and_then(TomlValue::as_bool);
    is_ours(false, text_of(table.get("name")), table.contains_key("path"), enabled, previous)
}

/// One comment line, whatever `text` holds: control characters (a line break among them, which
/// would end the comment and let the rest be read as settings) are taken out, and it starts with `#`.
fn comment_line(text: &str) -> String {
    let flat: String = text.chars().filter(|c| !c.is_control()).collect();
    let flat = flat.trim();
    if flat.starts_with('#') {
        flat.to_string()
    } else {
        format!("# {flat}")
    }
}

/// Every key the file sets, as a dotted path, but those under `skills.config`, which are Lodestar's to change.
fn key_paths(doc: &DocumentMut) -> std::collections::BTreeSet<String> {
    fn walk_value(value: &TomlValue, at: &str, paths: &mut std::collections::BTreeSet<String>) {
        match value {
            TomlValue::InlineTable(table) => {
                for (key, inner) in table.iter() {
                    let path = format!("{at}.{key:?}");
                    paths.insert(path.clone());
                    walk_value(inner, &path, paths);
                }
            }
            TomlValue::Array(array) => {
                for (index, inner) in array.iter().enumerate() {
                    walk_value(inner, &format!("{at}[{index}]"), paths);
                }
            }
            _ => {}
        }
    }
    fn walk_item(item: &Item, at: &str, paths: &mut std::collections::BTreeSet<String>) {
        if at == "\"skills\".\"config\"" {
            return;
        }
        match item {
            Item::Table(table) => {
                for (key, inner) in table.iter() {
                    let path = if at.is_empty() { format!("{key:?}") } else { format!("{at}.{key:?}") };
                    paths.insert(path.clone());
                    walk_item(inner, &path, paths);
                }
            }
            Item::ArrayOfTables(tables) => {
                for (index, table) in tables.iter().enumerate() {
                    for (key, inner) in table.iter() {
                        let path = format!("{at}[{index}].{key:?}");
                        paths.insert(path.clone());
                        walk_item(inner, &path, paths);
                    }
                }
            }
            Item::Value(value) => walk_value(value, at, paths),
            Item::None => {}
        }
    }
    let mut paths = std::collections::BTreeSet::new();
    walk_item(doc.as_item(), "", &mut paths);
    paths.remove("\"skills\".\"config\"");
    paths.remove("\"skills\"");
    paths
}

/// The highest place any table of the file has, so that new tables go after all of them.
fn last_position(table: &Table) -> isize {
    let mut last = table.position().unwrap_or(0);
    for (_, item) in table.iter() {
        match item {
            Item::Table(inner) => last = last.max(last_position(inner)),
            Item::ArrayOfTables(tables) => {
                for inner in tables.iter() {
                    last = last.max(last_position(inner));
                }
            }
            _ => {}
        }
    }
    last
}

/// config.toml's text with Lodestar's old entries taken out and one entry per name in `names` put
/// in at the end, the first one under `note`. The person's own entries and everything else stay.
pub fn edit_config(text: &str, previous: &[String], names: &[String], note: &str) -> Result<Edit, String> {
    let mut doc: DocumentMut = text.parse().map_err(|error: toml_edit::TomlError| {
        let first = error.to_string().lines().next().unwrap_or_default().to_string();
        format!("Codex's config.toml can't be read, so it was left alone ({first})")
    })?;
    let after = last_position(doc.as_table()) + 1;
    let mut removed = 0;
    let mut is_inline = false;

    if let Some(skills) = doc.get_mut("skills") {
        let skills = skills.as_table_like_mut().ok_or("Codex's config.toml has `skills` as something other than a table")?;
        if let Some(config) = skills.get_mut("config") {
            match config {
                Item::ArrayOfTables(tables) => {
                    let ours: Vec<usize> =
                        tables.iter().enumerate().filter(|(_, table)| is_ours_table(table, previous)).map(|(at, _)| at).collect();
                    for at in ours.into_iter().rev() {
                        tables.remove(at);
                        removed += 1;
                    }
                }
                Item::Value(TomlValue::Array(array)) => {
                    is_inline = true;
                    let ours: Vec<usize> = array
                        .iter()
                        .enumerate()
                        .filter(|(_, value)| value.as_inline_table().is_some_and(|table| is_ours_inline(table, previous)))
                        .map(|(at, _)| at)
                        .collect();
                    for at in ours.into_iter().rev() {
                        array.remove(at);
                        removed += 1;
                    }
                }
                _ => return Err("Codex's config.toml has `skills.config` as something other than a list".into()),
            }
            let is_empty = match skills.get("config") {
                Some(Item::ArrayOfTables(tables)) => tables.is_empty(),
                Some(Item::Value(TomlValue::Array(array))) => array.is_empty(),
                _ => false,
            };
            if is_empty && names.is_empty() {
                skills.remove("config");
            }
        }
        if skills.is_empty() && names.is_empty() {
            doc.remove("skills");
        }
    }

    if !names.is_empty() {
        if doc.get("skills").is_none() {
            let mut skills = Table::new();
            skills.set_implicit(true);
            doc.insert("skills", Item::Table(skills));
        }
        let skills = doc
            .get_mut("skills")
            .and_then(Item::as_table_like_mut)
            .ok_or("Codex's config.toml has `skills` as something other than a table")?;
        if is_inline {
            let Some(Item::Value(TomlValue::Array(array))) = skills.get_mut("config") else {
                return Err("Codex's config.toml changed shape while it was being edited".into());
            };
            for name in names {
                let mut entry = InlineTable::new();
                entry.insert("name", name.as_str().into());
                entry.insert("enabled", false.into());
                array.push(entry);
            }
        } else {
            if skills.get("config").is_none() {
                skills.insert("config", Item::ArrayOfTables(ArrayOfTables::new()));
            }
            let Some(Item::ArrayOfTables(tables)) = skills.get_mut("config") else {
                return Err("Codex's config.toml changed shape while it was being edited".into());
            };
            for (at, name) in names.iter().enumerate() {
                let mut entry = Table::new();
                entry.insert("name", toml_edit::value(name.as_str()));
                entry.insert("enabled", toml_edit::value(false));
                entry.set_position(Some(after + at as isize));
                entry.decor_mut().set_suffix(format!(" {MARK}"));
                if at == 0 && !note.trim().is_empty() {
                    entry.decor_mut().set_prefix(format!("\n{}\n", comment_line(note)));
                }
                tables.push(entry);
            }
        }
    }

    let edited = doc.to_string();
    check(text, &edited, names)?;

    Ok(Edit { text: edited, added: names.to_vec(), removed })
}

/// Reads the edited text back as Codex will: every name is switched off by the last word on it,
/// and no setting outside `skills.config` was added, dropped or moved.
fn check(original: &str, text: &str, names: &[String]) -> Result<(), String> {
    let doc: DocumentMut = text.parse().map_err(|_| "the edited config.toml would not read back; it was left alone".to_string())?;
    let before: DocumentMut = original.parse().map_err(|_| "Codex's config.toml can't be read, so it was left alone".to_string())?;
    if key_paths(&before) != key_paths(&doc) {
        return Err("the edit would have changed Codex settings other than its skill switches; config.toml was left alone".into());
    }
    let mut last: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    if let Some(config) = doc.get("skills").and_then(|skills| skills.get("config")) {
        let mut note = |name: Option<&str>, enabled: Option<bool>| {
            if let (Some(name), Some(enabled)) = (name, enabled) {
                last.insert(name.to_string(), enabled);
            }
        };
        match config {
            Item::ArrayOfTables(tables) => {
                for table in tables.iter() {
                    note(
                        text_of(table.get("name").and_then(Item::as_value)),
                        table.get("enabled").and_then(Item::as_value).and_then(TomlValue::as_bool),
                    );
                }
            }
            Item::Value(TomlValue::Array(array)) => {
                for table in array.iter().filter_map(TomlValue::as_inline_table) {
                    note(text_of(table.get("name")), table.get("enabled").and_then(TomlValue::as_bool));
                }
            }
            _ => {}
        }
    }
    if names.iter().all(|name| last.get(name) == Some(&false)) {
        Ok(())
    } else {
        Err("the edited config.toml would not switch off every skill it should; it was left alone".into())
    }
}

/// codex.json: which Agent Lodestar last set for Codex, and the skills it switched off for it.
fn read_record(path: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else { return vec![] };
    let Ok(record) = serde_json::from_str::<Value>(&text) else { return vec![] };
    record
        .get("names")
        .and_then(Value::as_array)
        .map(|names| names.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .unwrap_or_default()
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|since| since.as_millis() as u64).unwrap_or(0)
}

/// Makes new Codex sessions load the Agent's skills (`agent` null: every skill): switches off `names`
/// in Codex's config.toml, takes out what Lodestar switched off before, and notes it in codex.json.
pub fn apply(data_dir: &Path, agent: Option<String>, names: Vec<String>) -> Result<Value, String> {
    let home = home().ok_or("no home folder")?;
    let config = home.join("config.toml");
    let record = data_dir.join("codex.json");
    let previous = read_record(&record);
    // The Agent's name goes in a comment: one line, with nothing in it that could end the comment early.
    let note = match &agent {
        Some(name) => {
            let shown: String = name.chars().filter(|c| !c.is_control()).take(80).collect();
            comment_line(&format!(
                "Lodestar: new Codex sessions use the Agent \"{shown}\". Switch it in Lodestar; it rewrites the entries marked lodestar."
            ))
        }
        None => String::new(),
    };
    let mut backup: Option<PathBuf> = None;
    for _ in 0..3 {
        let before = match fs::read_to_string(&config) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(format!("Codex's config.toml can't be read ({error})")),
        };
        let edit = edit_config(&before, &previous, &names, &note)?;
        if edit.text != before {
            let copy = home.join("config.toml.lodestar-backup");
            if !before.is_empty() && !copy.exists() {
                fs::write(&copy, &before).map_err(|error| format!("config.toml could not be backed up ({error})"))?;
                backup = Some(copy);
            }
            // Codex (or a person) may have saved the file meanwhile: then start over from what it holds now.
            if fs::read_to_string(&config).unwrap_or_default() != before {
                continue;
            }
            crate::write_atomic(&config, &edit.text).map_err(|error| format!("Codex's config.toml could not be saved ({error})"))?;
        }
        let noted = json!({
            "version": 1,
            "agent": agent,
            "names": edit.added,
            "appliedAt": now_ms(),
            "config": config.to_string_lossy(),
        });
        let text = serde_json::to_string_pretty(&noted).map_err(|error| error.to_string())?;
        crate::write_atomic(&record, &format!("{text}\n")).map_err(|error| format!("codex.json could not be saved ({error})"))?;

        return Ok(json!({
            "switchedOff": edit.added.len(),
            "removed": edit.removed,
            "config": config.to_string_lossy(),
            "backup": backup.map(|path| path.to_string_lossy().into_owned()),
        }));
    }
    Err("Codex's config.toml kept changing while Lodestar was saving it; try again".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|one| one.to_string()).collect()
    }

    const NOTE: &str = "# Lodestar: test";

    const PERSONS: &str = r#"# My Codex settings.
model = "gpt-5"

[desktop]
appearanceTheme = "system"

# Turned off in Codex's Skills page.
[[skills.config]]
path = 'C:\Users\me\.codex\skills\old\SKILL.md'
enabled = false

[windows]
sandbox = "elevated"
"#;

    #[test]
    fn adds_marked_entries_at_the_end_and_keeps_the_rest() {
        let edit = edit_config(PERSONS, &[], &names(&["a", "b"]), NOTE).unwrap();
        assert!(edit.text.starts_with(PERSONS.trim_end()), "{}", edit.text);
        assert!(edit.text.contains("# Turned off in Codex's Skills page."));
        assert!(edit.text.contains("\n# Lodestar: test\n[[skills.config]] # lodestar\nname = \"a\"\nenabled = false\n"), "{}", edit.text);
        assert_eq!(edit.text.matches(MARK).count(), 2);
        assert_eq!(edit.removed, 0);
    }

    #[test]
    fn a_switch_replaces_only_lodestars_entries() {
        let first = edit_config(PERSONS, &[], &names(&["a", "b"]), NOTE).unwrap();
        let second = edit_config(&first.text, &names(&["a", "b"]), &names(&["c"]), NOTE).unwrap();
        assert_eq!(second.removed, 2);
        assert!(second.text.contains("path = 'C:\\Users\\me\\.codex\\skills\\old\\SKILL.md'"));
        assert!(!second.text.contains("name = \"a\""));
        assert!(second.text.contains("name = \"c\""));
        // Every skill again: the file is as the person had it.
        let back = edit_config(&second.text, &names(&["c"]), &[], NOTE).unwrap();
        assert_eq!(back.text, PERSONS);
    }

    #[test]
    fn an_entry_whose_mark_was_lost_is_known_by_the_record() {
        let text = "[skills]\nconfig = [{ path = 'x', enabled = false }, { name = \"a\", enabled = false }, { name = \"keep\", enabled = false }]\n";
        let edit = edit_config(text, &names(&["a"]), &names(&["b"]), NOTE).unwrap();
        assert_eq!(edit.removed, 1);
        assert!(edit.text.contains("{ path = 'x', enabled = false }"));
        assert!(edit.text.contains("name = \"keep\""));
        assert!(edit.text.contains("name = \"b\""));
        assert!(!edit.text.contains("name = \"a\""));
    }

    #[test]
    fn a_file_with_no_skills_gets_them_and_loses_them_again() {
        let text = "model = \"gpt-5\"\n";
        let edit = edit_config(text, &[], &names(&["a"]), NOTE).unwrap();
        assert!(!edit.text.contains("[skills]\n"), "{}", edit.text);
        assert!(edit.text.contains("[[skills.config]] # lodestar"));
        assert_eq!(edit_config(&edit.text, &names(&["a"]), &[], NOTE).unwrap().text, text);
        assert_eq!(edit_config("", &[], &[], NOTE).unwrap().text, "");
    }

    #[test]
    fn the_persons_own_switch_after_lodestars_stays() {
        let first = edit_config(PERSONS, &[], &names(&["a"]), NOTE).unwrap();
        let theirs = format!("{}[[skills.config]]\nname = \"a\"\nenabled = true\n", first.text);
        let edit = edit_config(&theirs, &names(&["a"]), &names(&["b"]), NOTE).unwrap();
        assert_eq!(edit.removed, 1);
        assert!(edit.text.contains("name = \"a\"\nenabled = true"));
    }

    #[test]
    fn a_name_with_a_line_break_stays_inside_its_comment() {
        // An Agent named so as to end the comment and set Codex's model provider.
        let note = "# Lodestar: the Agent \"x\n[model_providers.evil]\nbase_url = 'http://evil'\r\nmodel = \"y\"";
        let edit = edit_config(PERSONS, &[], &names(&["a"]), note).unwrap();
        let doc: DocumentMut = edit.text.parse().unwrap();
        assert!(doc.get("model_providers").is_none(), "{}", edit.text);
        assert_eq!(doc.get("model").and_then(Item::as_str), Some("gpt-5"));
        let comment = edit.text.lines().find(|line| line.contains("model_providers")).unwrap();
        assert!(comment.starts_with("# Lodestar"), "{comment}");
    }

    #[test]
    fn an_edit_that_changes_any_other_setting_is_refused() {
        let added_key = format!("{PERSONS}model_provider = \"evil\"\n");
        assert!(check(PERSONS, &added_key, &[]).is_err());
        let added_table = format!("{PERSONS}[model_providers.evil]\nbase_url = 'x'\n");
        assert!(check(PERSONS, &added_table, &[]).is_err());
        let fine = edit_config(PERSONS, &[], &names(&["a"]), NOTE).unwrap();
        assert!(check(PERSONS, &fine.text, &names(&["a"])).is_ok());
    }

    #[test]
    fn a_broken_file_is_left_alone() {
        assert!(edit_config("model = ", &[], &names(&["a"]), NOTE).is_err());
        assert!(edit_config("skills = 3\n", &[], &names(&["a"]), NOTE).is_err());
    }
}
