; NSIS include fragment for Gezyne LIS Server installer
; This file is referenced by electron-builder via nsis.include

!macro customInit
  ; Terminate any running server and tray processes before unpacking files
  nsExec::Exec 'taskkill /F /IM "Gezyne LIS Server.exe" /T'
  nsExec::Exec 'taskkill /F /IM laboratory-information-system.exe /T'
  nsExec::Exec 'taskkill /F /IM start-lis.exe /T'
  nsExec::Exec 'cmd /c pm2 delete lis-app'
  Sleep 1000
!macroend

!macro customInstall
  ; $INSTDIR is the installation directory
  SetOutPath "$INSTDIR"
  ; If bundled installer-resources exist, copy them to the install dir
  CopyFiles /SILENT "$INSTDIR\installer-resources\*" "$INSTDIR\"
!macroend

!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM "Gezyne LIS Server.exe" /T'
  nsExec::Exec 'taskkill /F /IM laboratory-information-system.exe /T'
  nsExec::Exec 'taskkill /F /IM start-lis.exe /T'
  nsExec::Exec 'cmd /c pm2 delete lis-app'
!macroend
