@echo off
REM Wrapper to start the Gezyne LIS using PowerShell script
SET SCRIPT_DIR=%~dp0
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%start-lis.ps1"
