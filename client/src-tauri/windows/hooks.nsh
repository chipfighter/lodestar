; Hooks for Lodestar's NSIS installer (bundle > windows > nsis > installerHooks in tauri.conf.json).

; After an upgrade or a reinstall, Explorer can go on showing the icon it cached while the old
; lodestar.exe was gone: a generic one on the desktop shortcut. Telling the shell that file
; associations changed (SHCNE_ASSOCCHANGED) makes it drop its cached icons and draw them again;
; SHCNF_FLUSH waits until it has, so the installer does not exit first.
!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend
