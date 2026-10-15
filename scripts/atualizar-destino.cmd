@echo off
REM Atalho: contorna a politica de execucao do PowerShell sem alterar nada na maquina.
REM Uso:  atualizar-destino.cmd
REM       atualizar-destino.cmd -SoLimpar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar-destino.ps1" %*
