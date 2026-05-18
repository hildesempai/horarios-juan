@echo off
title Horarios Clinica - Sistema de Turnos
color 0A

echo.
echo  =====================================================
echo    HORARIOS CLINICA ^| Sistema de Gestion de Turnos
echo  =====================================================
echo.

:: Verificar que Node.js esta instalado
set NODE_EXE=node
set NPM_CMD=npm
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set NODE_EXE="%ProgramFiles%\nodejs\node.exe"
        set NPM_CMD="%ProgramFiles%\nodejs\npm.cmd"
    ) else (
        color 0E
        echo  [INFO] Node.js no esta instalado en el equipo.
        echo  [INFO] Descargando el instalador automaticamente (v22 LTS)...
        echo.
        powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'"
        
        if not exist "%TEMP%\nodejs.msi" (
            color 0C
            echo  [ERROR] No se pudo descargar Node.js.
            echo  Descargalo manualmente desde: https://nodejs.org
            pause
            exit /b 1
        )
        
        echo  [INFO] Instalando Node.js... (Aprueba los permisos de Administrador si aparecen)
        msiexec.exe /i "%TEMP%\nodejs.msi" /passive /norestart
        
        if exist "%ProgramFiles%\nodejs\node.exe" (
            color 0A
            echo  [OK] Node.js se instalo correctamente!
            echo.
            set NODE_EXE="%ProgramFiles%\nodejs\node.exe"
            set NPM_CMD="%ProgramFiles%\nodejs\npm.cmd"
            del /q "%TEMP%\nodejs.msi"
        ) else (
            color 0C
            echo  [ERROR] La instalacion automatica fallo.
            echo  Instala Node.js manualmente desde: https://nodejs.org
            pause
            exit /b 1
        )
    )
)

:: Ir al directorio del proyecto (donde esta este .bat)
cd /d "%~dp0"

:: Verificar que las dependencias esten instaladas
if not exist "node_modules" (
    echo  [INFO] Primera ejecucion detectada. Instalando dependencias...
    echo.
    call %NPM_CMD% install
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo  [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
    echo.
)

:: Inicializar la base de datos si no existe
if not exist "data\horarios.db" (
    echo  [INFO] Base de datos no encontrada. Inicializando...
    echo.
    %NODE_EXE% init-db.js
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo  [ERROR] Fallo la inicializacion de la base de datos.
        pause
        exit /b 1
    )
    echo.
)

:: Matar cualquier proceso previo en el puerto 3000
echo  [INFO] Verificando puerto 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  [OK] Todo listo. Iniciando servidor...
echo.
echo  -------------------------------------------------------
echo   Abre tu navegador en:  http://localhost:3000
echo   Usuario: admin
echo   Contrasena: admin
echo  -------------------------------------------------------
echo.
echo  [Presiona Ctrl+C para detener el servidor]
echo.

:: Abrir el navegador automaticamente despues de 2 segundos
start /b "" cmd /c "ping 127.0.0.1 -n 3 >nul && start http://localhost:3000"

:: Arrancar el servidor
%NODE_EXE% server.js

echo.
echo  [INFO] Servidor detenido.
pause
