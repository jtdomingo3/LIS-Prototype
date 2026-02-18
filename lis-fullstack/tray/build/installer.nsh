; NSIS include fragment for Gezyne LIS Server installer
; This file is referenced by electron-builder via nsis.include
; You can extend this to create service registration steps, copy extra resources,
; or run the server executable with seed options after installation.

; Example: copy installer-resources into installation folder
!macro customInstall
  ; $INSTDIR is the installation directory
  SetOutPath "$INSTDIR"
  ; If bundled installer-resources exist, copy them to the install dir
  CopyFiles /SILENT "$INSTDIR\installer-resources\*" "$INSTDIR\"
!macroend

; Example uninstall cleanup can be added similarly
!macro customUnInstall
  ; no-op placeholder
!macroend
