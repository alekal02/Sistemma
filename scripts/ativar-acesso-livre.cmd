@echo off
REM Atalho: contorna a politica de execucao do PowerShell sem alterar nada na maquina.
REM Uso:  ativar-acesso-livre.cmd            liga a entrada sem senha
REM       ativar-acesso-livre.cmd -Desligar  volta a exigir senha
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-acesso-livre.ps1" %*
