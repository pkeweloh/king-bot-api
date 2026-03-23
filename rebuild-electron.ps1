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

$defaultPython = "C:\Program Files\Python37\python.exe"
$defaultVcVars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$defaultArch = "x64"

function Resolve-Value($paramValue, $envVarName, $envKey, $defaultValue) {
    if ($paramValue) {
        return $paramValue
    }

    if ($env:$envVarName) {
        return $env:$envVarName
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
    Write-Error "Python executable not found at '$PythonPath'. Please point to a Python 3.7 install."
    return
}

$env:npm_config_python = $PythonPath

$command = "`"$VcVarsPath`" $Architecture && npm run rebuild:electron"
Write-Host "Running build environment: vcvarsall ($Architecture) + npm run rebuild:electron..."
cmd /c $command
