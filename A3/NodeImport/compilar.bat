@echo off
REM =====================================================
REM  NodeImport - Script de compilación
REM =====================================================

echo.
echo  Compilando NodeImport...
echo  ========================
echo.

dotnet build -c Release -r win-x86

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: La compilación falló.
    pause
    exit /b 1
)

echo.
echo  Compilación correcta.
echo.

REM Copiar config.json al directorio de salida
copy /Y config.json bin\Release\net10.0-windows\win-x86\config.json >nul

echo  config.json copiado al directorio de salida.
echo.
echo  Ejecutable en: bin\Release\net10.0-windows\win-x86\NodeImport.exe
echo.
pause
