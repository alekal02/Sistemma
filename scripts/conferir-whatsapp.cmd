@echo off
REM Mostra o webhook do WhatsApp. Nao altera banco nem volume.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0conferir-whatsapp.ps1" %*
