@echo off
REM Atalho: contorna a politica de execucao do PowerShell sem alterar nada na maquina.
REM Uso:  cutover-destino.cmd -TagNova 3.1.0 -TagAnterior 3.0.0 -AcessoLivre
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cutover-destino.ps1" %*
