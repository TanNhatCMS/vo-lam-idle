@echo off
rem Chay local OTA server (test -PotaLocal) — tách rời process de song ton
rem qua chen bash. Phuc vu repo root tai http://10.0.2.2:8000 (emulator).
rem Log: tools\ota_server.log
start "ota-server" cmd /c "python tools\local_ota_server.py > tools\ota_server.log 2>&1"
