# Optional overrides: explicit parameters > environment variables > `.rebuild-electron.env` > defaults.
param(
    [string]$PythonPath,
    [string]$VcVarsPath,
    [ValidateSet("x86","x64","x86_x64","x64_x86")] [string]$Architecture
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".rebuild-electron.env"
$envSettings = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }

        $splitIndex = $line.IndexOf("=")
        if ($splitIndex -lt 0) {
            return
        }

        $key = $line.Substring(0, $splitIndex).Trim()
        $value = $line.Substring($splitIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ($key) {
            $envSettings[$key] = $value
        }
    }
}

$defaultPython = Join-Path $scriptDir ".venv\Scripts\python.exe"
$defaultVcVars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$defaultArch = "x64"

function Resolve-Value($paramValue, $envVarName, $envKey, $defaultValue) {
    if ($paramValue) {
        return $paramValue
    }

    # `$env:$envVarName` is a parse error: the env: drive needs a literal name, so an
    # indirect lookup has to go through the API.
    $envVarValue = [Environment]::GetEnvironmentVariable($envVarName)
    if ($envVarValue) {
        return $envVarValue
    }

    if ($envSettings.ContainsKey($envKey) -and $envSettings[$envKey]) {
        return $envSettings[$envKey]
    }

    return $defaultValue
}

$PythonPath = Resolve-Value $PythonPath "REBUILD_ELECTRON_PYTHON" "PYTHON_PATH" $defaultPython
$VcVarsPath = Resolve-Value $VcVarsPath "REBUILD_ELECTRON_VCVARS" "VCVARS_PATH" $defaultVcVars
$Architecture = Resolve-Value $Architecture "REBUILD_ELECTRON_ARCH" "ARCH" $defaultArch

Write-Verbose "Using Python: $PythonPath"
Write-Verbose "Using vcvarsall: $VcVarsPath"
Write-Verbose "Architecture: $Architecture"


if (-not (Test-Path $VcVarsPath)) {
    Write-Error "vcvarsall.bat not found at '$VcVarsPath'. Install VS 2022 Build Tools or override the path."
    return
}

if (-not (Test-Path $PythonPath)) {
    Write-Error "Python executable not found at '$PythonPath'. Run 'npm run setup:python' to create the project venv, or override PYTHON_PATH."
    return
}

# node-gyp's bundled gyp still does `from distutils.version import StrictVersion`, and
# distutils was removed from the stdlib in Python 3.12. setuptools re-provides it, so the
# interpreter is useless to node-gyp without it. Fail here with a clear message instead of
# letting gyp die with a bare ModuleNotFoundError halfway through the build.
& $PythonPath -c "import distutils.version" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "'$PythonPath' has no distutils (Python 3.12+ removed it). Run: & '$PythonPath' -m pip install setuptools"
    return
}

$env:npm_config_python = $PythonPath

$command = "`"$VcVarsPath`" $Architecture && npm run rebuild:electron"
Write-Host "Running build environment: vcvarsall ($Architecture) + npm run rebuild:electron..."
cmd /c $command
$rebuildExit = $LASTEXITCODE

# electron-rebuild has just replaced better_sqlite3.node with a build for Electron's ABI
# (NODE_MODULE_VERSION 99 on Electron 16), but the marker that `rebuild:native` keeps still
# claims the Node ABI. Left alone, the next `npm start` would compare marker == Node ABI,
# decide nothing needs rebuilding, and load the Electron binary into Node -- which fails
# with an ERR_DLOPEN_FAILED / NODE_MODULE_VERSION mismatch.
#
# Recording a non-numeric value is enough: it can never equal `process.versions.modules`,
# so the Node side always rebuilds, and the file says what the binary actually is when you
# are staring at it wondering. On failure the binary is in an unknown state, so drop the
# marker entirely and let the next Node run rebuild from scratch.
$marker = Join-Path $scriptDir "node_modules\.better-sqlite3-node-module-version"
if (Test-Path (Split-Path -Parent $marker)) {
    if ($rebuildExit -eq 0) {
        Set-Content -Path $marker -Value "electron"
    }
    else {
        Remove-Item $marker -ErrorAction SilentlyContinue
    }
}

exit $rebuildExit
