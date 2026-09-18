@echo off
REM ============================================================
REM  QuantAura ? Upload trained models to the production server
REM  Usage: Double-click or run from terminal
REM
REM  Prerequisites:
REM    1. Set SERVER_HOST, SERVER_USER below (or as env vars)
REM    2. Place your SSH private key at %USERPROFILE%\.ssh\quantaura_deploy_key
REM       (export it from GitHub Secret SERVER_SSH_KEY, base64-decode it)
REM    3. OpenSSH must be installed (Windows 10+ has it built in)
REM ============================================================

REM -- Configuration -----------------------------------------------
SET SERVER_HOST=quantaura.tech
SET SERVER_USER=quantaura.tech
SET SSH_KEY=%USERPROFILE%\.ssh\quantaura_deploy_key
SET LOCAL_MODELS=%~dp0saved_models
SET REMOTE_DIR=/home/quantaura.tech/public_html/quantaura-ml/saved_models
REM ----------------------------------------------------------------

ECHO.
ECHO ============================================================
ECHO   QuantAura Model Uploader
ECHO ============================================================
ECHO   From : %LOCAL_MODELS%
ECHO   To   : %SERVER_USER%@%SERVER_HOST%:%REMOTE_DIR%
ECHO   Key  : %SSH_KEY%
ECHO ============================================================
ECHO.

REM Check SSH key exists
IF NOT EXIST "%SSH_KEY%" (
    ECHO [ERROR] SSH key not found at: %SSH_KEY%
    ECHO.
    ECHO To set up:
    ECHO   1. Copy the value of your SERVER_SSH_KEY GitHub secret ^(already base64^)
    ECHO   2. Decode it in PowerShell:
    ECHO      [IO.File]::WriteAllBytes^("%USERPROFILE%\.ssh\quantaura_deploy_key"^, [Convert]::FromBase64String^("PASTE_KEY_HERE"^)^)
    ECHO   3. Run this script again
    ECHO.
    PAUSE
    EXIT /B 1
)

REM Check local models folder
IF NOT EXIST "%LOCAL_MODELS%\" (
    ECHO [ERROR] Local saved_models not found at: %LOCAL_MODELS%
    PAUSE
    EXIT /B 1
)

ECHO [INFO] Ensuring remote directory exists...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "mkdir -p %REMOTE_DIR%"
IF %ERRORLEVEL% NEQ 0 (
    ECHO [ERROR] Could not connect to server. Check SSH key and host.
    PAUSE
    EXIT /B 1
)

ECHO [INFO] Uploading models...
ECHO.

scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no "%LOCAL_MODELS%\lstm_model.keras" "%LOCAL_MODELS%\transformer_model.pt" "%LOCAL_MODELS%\kan_model.pt" "%LOCAL_MODELS%\xgb_model.pkl" "%LOCAL_MODELS%\xgb_feature_names.pkl" "%LOCAL_MODELS%\scaler_lstm.pkl" "%LOCAL_MODELS%\scaler_transformer.pkl" "%LOCAL_MODELS%\scaler_kan.pkl" "%LOCAL_MODELS%\scaler_xgb.pkl" "%LOCAL_MODELS%\model_weights.json" %SERVER_USER%@%SERVER_HOST%:%REMOTE_DIR%/

IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO [ERROR] Upload failed. Check connection and file paths.
    PAUSE
    EXIT /B 1
)

ECHO.
ECHO [INFO] Signalling serve.py to hot-reload models...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "touch %REMOTE_DIR%/../.model_reload_trigger"

ECHO.
ECHO ============================================================
ECHO   SUCCESS -- All models uploaded!
ECHO   serve.py will hot-reload within its next prediction cycle.
ECHO ============================================================
ECHO.
PAUSE
