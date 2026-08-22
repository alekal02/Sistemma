@echo off
REM Atalho: contorna a politica de execucao do PowerShell sem alterar nada na maquina.
REM Uso:  backup-destino.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-destino.ps1" %*
