# Creates the project-local Python venv that node-gyp uses to build the native modules
# (better-sqlite3, lzma-native). Python never runs project code here -- it is a build tool.
#
# Why a venv at all: node-gyp shells out to whatever `python` resolves to, so the build
# silently depends on machine-wide state. Pinning it to .venv makes the toolchain part of
# the repo instead of part of the machine.
[CmdletBinding()]
param(
    # Pin to the *versioned* scoop path, never `current`. `current` is a junction: the day
    # scoop repoints it to 3.13 the venv would load a 3.13 stdlib through a 3.12 python.exe
    # and break in confusing ways. A versioned path instead dies with an obvious error.
    [string]$BasePython = "$env:USERPROFILE\scoop\apps\python\3.12.1\python.exe",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$venv = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $BasePython)) {
    Write-Error "Base Python not found at '$BasePython'. Install it (scoop install python) or pass -BasePython."
    return
}

if (Test-Path $venv) {
    if (-not $Force) {
        Write-Host "$venv already exists. Re-run with -Force to recreate it."
        return
    }
    Write-Host "Removing existing venv..."
    Remove-Item -Recurse -Force $venv
}

Write-Host "Creating venv with $BasePython ..."
& $BasePython -m venv $venv
if ($LASTEXITCODE -ne 0) { Write-Error "venv creation failed."; return }

# setuptools is not optional. node-gyp's bundled gyp imports `distutils.version`, and
# distutils left the stdlib in Python 3.12 (PEP 632); setuptools re-provides it. Without
# this the build dies with "ModuleNotFoundError: No module named 'distutils'".
# The Dockerfiles install setuptools for exactly the same reason.
Write-Host "Installing build tooling (setuptools provides distutils for node-gyp)..."
& $venvPython -m pip install --upgrade --quiet pip setuptools
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed."; return }

& $venvPython -c "import distutils.version" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Error "distutils still unavailable in the venv."; return }

Write-Host ""
Write-Host "Ready: $venvPython" -ForegroundColor Green
& $venvPython --version
Write-Host "npm run rebuild:native and rebuild-electron.ps1 will pick this up automatically."
