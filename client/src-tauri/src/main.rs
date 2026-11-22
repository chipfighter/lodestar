// No console window beside the app in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    skill_loadout_lib::run()
}
