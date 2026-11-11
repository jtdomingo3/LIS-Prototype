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
  ; Never overwrite an existing clinical database during upgrades
  IfFileExists "$INSTDIR\lis-data.db" skip_seed_db
  IfFileExists "$INSTDIR\installer-resources\lis-data.db" 0 skip_seed_db
    CopyFiles /SILENT "$INSTDIR\installer-resources\lis-data.db" "$INSTDIR\lis-data.db"
  skip_seed_db:
  ; Copy non-database resources (tools, scripts, helper executables)
  CopyFiles /SILENT "$INSTDIR\installer-resources\*.exe" "$INSTDIR\"
  CopyFiles /SILENT "$INSTDIR\installer-resources\*.bat" "$INSTDIR\"
  CopyFiles /SILENT "$INSTDIR\installer-resources\*.cmd" "$INSTDIR\"
!macroend

!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM "Gezyne LIS Server.exe" /T'
  nsExec::Exec 'taskkill /F /IM laboratory-information-system.exe /T'
  nsExec::Exec 'taskkill /F /IM start-lis.exe /T'
  nsExec::Exec 'cmd /c pm2 delete lis-app'
!macroend
