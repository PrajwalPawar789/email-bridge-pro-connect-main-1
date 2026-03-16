@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-lp-domain.ps1" %*
