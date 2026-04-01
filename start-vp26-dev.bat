@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%BACKEND_DIR%\requirements.txt" (
  echo [VP26] Backend-Konfiguration nicht gefunden.
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo [VP26] Frontend-Konfiguration nicht gefunden.
  exit /b 1
)

if not exist "%BACKEND_PYTHON%" (
  echo [VP26] Erstelle Python-Venv...
  py -3 -m venv "%BACKEND_DIR%\.venv"
  if errorlevel 1 exit /b 1

  echo [VP26] Installiere Backend-Abhaengigkeiten...
  call "%BACKEND_PYTHON%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
  if errorlevel 1 exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [VP26] Installiere Frontend-Abhaengigkeiten...
  call npm install --prefix "%FRONTEND_DIR%"
  if errorlevel 1 exit /b 1
)

echo [VP26] Beende alte Listener auf 8010/5173...
powershell -NoProfile -Command ^
  "$ports = 8010, 5173; foreach ($port in $ports) { " ^
  "  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | " ^
  "  Select-Object -ExpandProperty OwningProcess -Unique | " ^
  "  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } " ^
  "}"

echo [VP26] Starte Backend und Frontend...
start "VP26 Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && ""%BACKEND_PYTHON%"" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload --reload-dir app"
start "VP26 Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

echo [VP26] Backend:  http://127.0.0.1:8010
echo [VP26] Frontend: http://127.0.0.1:5173

endlocal
