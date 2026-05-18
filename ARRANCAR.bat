@echo off
title Horarios Clinica - Sistema de Turnos
color 0A

echo.
echo  =====================================================
echo    HORARIOS CLINICA ^| Sistema de Gestion de Turnos
echo  =====================================================
echo.

:: Verificar que Node.js esta instalado
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo  Descargalo desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Ir al directorio del proyecto (donde esta este .bat)
cd /d "%~dp0"

:: Verificar que las dependencias esten instaladas
if not exist "node_modules" (
    echo  [INFO] Primera ejecucion detectada. Instalando dependencias...
    echo.
    npm install
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
    node init-db.js
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
node server.js

echo.
echo  [INFO] Servidor detenido.
pause
