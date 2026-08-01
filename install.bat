@echo off
title Image Express - Setup
REM ============================================================================
REM  Image Express one-file installer. Double-click me - that's all.
REM  Downloads everything from GitHub (nothing bundled), installs Git/Node if
REM  missing, and logs EVERY step and error to:
REM      %USERPROFILE%\ImageExpress-setup.log
REM  If setup fails, send that file to support.
REM
REM  (Technical note: the real installer is PowerShell, embedded at the end of
REM   this file after a marker line - this stays ONE portable file.)
REM ============================================================================
set "IX_SETUP_SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0');$i=$s.LastIndexOf('#'+'PS1'+'#');iex $s.Substring($i+5)"
if errorlevel 1 (
    echo.
    echo Setup did not finish. Full log: %USERPROFILE%\ImageExpress-setup.log
    pause
)
exit /b %ERRORLEVEL%
#PS1#
# ============================================================================
#  Image Express - embedded installer body (PowerShell)
# ============================================================================
$ErrorActionPreference = 'Continue'
$RepoUrl    = 'https://github.com/GeekatplayStudio/Image-Express.git'
$LogFile    = Join-Path $env:USERPROFILE 'ImageExpress-setup.log'
$DefaultDir = Join-Path $env:USERPROFILE 'ImageExpress'

# If this file sits inside an existing checkout, install in place.
$ScriptDir = $env:IX_SETUP_SCRIPT_DIR
if ($ScriptDir -and (Test-Path (Join-Path $ScriptDir 'package.json')) -and (Test-Path (Join-Path $ScriptDir 'next.config.ts'))) {
    $DefaultDir = $ScriptDir.TrimEnd('\')
}

# Unattended mode (testing/CI): IMAGEEXPRESS_SETUP_AUTO=1 takes every default.
$Auto = $env:IMAGEEXPRESS_SETUP_AUTO -eq '1'
if ($env:IMAGEEXPRESS_SETUP_DIR) { $DefaultDir = $env:IMAGEEXPRESS_SETUP_DIR }
function Ask([string]$prompt, [string]$default = '') {
    if ($Auto) { Write-Host "$prompt [auto: '$default']"; return $default }
    return Read-Host $prompt
}

try { Stop-Transcript | Out-Null } catch {}
Start-Transcript -Path $LogFile -Append | Out-Null

function Step([string]$msg)  { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok([string]$msg)    { Write-Host "    OK: $msg" -ForegroundColor Green }
function Warn2([string]$msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Fail([string]$msg) {
    Write-Host "`nERROR: $msg" -ForegroundColor Red
    Write-Host "Full log saved to: $LogFile" -ForegroundColor Yellow
    Write-Host 'Please send that file to support so we can fix your install.' -ForegroundColor Yellow
    try { Stop-Transcript | Out-Null } catch {}
    if (-not $Auto) { Read-Host 'Press Enter to close' }
    exit 1
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
    Write-Host '    PATH refreshed from registry.'
}

function Run-Logged([string]$exe, [string[]]$argList, [string]$what) {
    Write-Host "    > $exe $($argList -join ' ')"
    & $exe @argList 2>&1 | ForEach-Object { Write-Host "      $_" }
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}

Write-Host ''
Write-Host '   |\__/|    Image Express - Setup'
Write-Host '  (  o.o  )   Your border collie will now herd the bits into place.'
Write-Host '   /|__|\'
Write-Host ''
Write-Host "Log file: $LogFile"
Write-Host "System: $([Environment]::OSVersion.VersionString), PowerShell $($PSVersionTable.PSVersion)"

$custom = Ask "Install folder [$DefaultDir]"
$InstallDir = if ([string]::IsNullOrWhiteSpace($custom)) { $DefaultDir } else { $custom }
Write-Host "Install folder: $InstallDir"

Step '1/7 Checking Git'
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host '    Git not found - installing via winget (this can take a minute)...'
    try {
        Run-Logged 'winget' @('install','--id','Git.Git','-e','--accept-source-agreements','--accept-package-agreements','--silent') 'winget install Git'
    } catch {
        Fail "Could not install Git automatically ($_). Install it from https://git-scm.com/download/win and re-run."
    }
    Refresh-Path
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { Fail 'Git installed but still not on PATH. Close this window, open a NEW terminal, and re-run the installer.' }
}
Ok "git at $($git.Source) - $(git --version)"

Step '2/7 Checking Node.js (24 or newer)'
function Get-NodeMajor {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 0 }
    $v = (node -v) 2>$null
    if ($v -match '^v(\d+)') { return [int]$Matches[1] }
    return 0
}
function Use-BestNode {
    # Standard install locations, plus the per-version folders that nvm-windows,
    # volta and fnm create - a good Node is often installed but shadowed on PATH.
    $candidates = @(
        (Join-Path $env:ProgramFiles 'nodejs'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs')
    )
    foreach ($root in @($env:NVM_HOME, 'C:\nvm4w', (Join-Path $env:APPDATA 'nvm'))) {
        if ($root -and (Test-Path $root)) {
            $candidates += (Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
        }
    }
    $voltaRoot = Join-Path $env:LOCALAPPDATA 'Volta\tools\image\node'
    if (Test-Path $voltaRoot) {
        $candidates += (Get-ChildItem $voltaRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    }
    $fnmRoot = Join-Path $env:APPDATA 'fnm\node-versions'
    if (Test-Path $fnmRoot) {
        $candidates += (Get-ChildItem $fnmRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'installation' })
    }

    $best = $null
    foreach ($dir in ($candidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'node.exe')) })) {
        $v = (& (Join-Path $dir 'node.exe') -v) 2>$null
        if ($v -match '^v(\d+)\.(\d+)\.(\d+)' -and [int]$Matches[1] -ge 24) {
            $ver = [version]("{0}.{1}.{2}" -f $Matches[1], $Matches[2], $Matches[3])
            if (-not $best -or $ver -gt $best.Version) { $best = [pscustomobject]@{ Dir = $dir; Version = $ver } }
        }
    }
    if ($best) {
        Write-Host "    Using Node v$($best.Version) from $($best.Dir) (an older node was first on PATH)."
        $env:Path = "$($best.Dir);$env:Path"
        return $true
    }
    return $false
}
$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 24) {
    if (-not (Use-BestNode)) {
        Write-Host "    Node.js 24+ not found (found: $nodeMajor) - installing via winget..."
        try {
            Run-Logged 'winget' @('install','--id','OpenJS.NodeJS','-e','--accept-source-agreements','--accept-package-agreements','--silent') 'winget install Node.js'
        } catch {
            Fail "Could not install Node.js automatically ($_). Install Node 24 from https://nodejs.org and re-run."
        }
        Refresh-Path
        [void](Use-BestNode)
    }
    $nodeMajor = Get-NodeMajor
    if ($nodeMajor -lt 24) {
        Fail "Node.js 24+ is still not usable in this session (found major version: $nodeMajor). If you use a Node version manager (nvm, volta), switch it to Node 24+ (e.g. 'nvm install 24' then 'nvm use 24') and re-run this installer."
    }
}
Ok "node $(node -v), npm $(npm -v)"

Step '3/7 Downloading Image Express from GitHub'
if (Test-Path (Join-Path $InstallDir '.git')) {
    Write-Host '    Existing install found - updating instead of re-downloading...'
    try {
        Run-Logged 'git' @('-C', $InstallDir, 'pull', '--ff-only') 'git pull'
    } catch {
        Warn2 "Update pull failed ($_). Continuing with the existing copy."
    }
} elseif (Test-Path (Join-Path $InstallDir 'package.json')) {
    Write-Host '    App files already present (no git) - continuing with this copy.'
} else {
    try {
        Run-Logged 'git' @('clone','--depth','1', $RepoUrl, $InstallDir) 'git clone'
    } catch {
        Fail "Download failed ($_). Check your network connection and that $RepoUrl is reachable."
    }
}
Ok "app files in $InstallDir"

Set-Location $InstallDir

Step '4/7 Installing dependencies (the longest step - several minutes)'
try {
    Run-Logged 'node' @('scripts/ensure-deps.mjs','--force') 'ensure-deps'
} catch {
    try {
        Run-Logged 'npm' @('install','--no-fund','--no-audit') 'npm install'
    } catch {
        Fail "Dependency install failed ($_). The log above shows the exact npm error."
    }
}
Ok 'dependencies installed'

Step '5/7 Optional local AI engines'
Write-Host '    ComfyUI and Ollama are optional. Nothing large is downloaded unless'
Write-Host '    you say yes, and NO AI models are ever included by default.'
try {
    if ($Auto) { Write-Host '    [auto] skipping interactive AI installer' }
    else { & npm run install:super }
    if ($Auto) { $global:LASTEXITCODE = 0 }
    if ($LASTEXITCODE -ne 0) { Warn2 'Optional AI setup exited with an error - re-run it later with: npm run install:super' }
} catch {
    Warn2 "Optional AI setup failed ($_) - re-run it later with: npm run install:super"
}

Step '5b/7 Verifying the installation'
try {
    Run-Logged 'npm' @('run','qa:install') 'verification'
    Ok 'verification passed'
} catch {
    Warn2 'Verification flagged missing components - if you skipped the optional ComfyUI install above, that is expected and the app runs fine without it.'
}

Step '6/7 Optional extras'
Write-Host '    Image Express is free. Optional theme packs - including animated packs'
Write-Host '    with pixel dragons, aliens, and border collies - support development:'
Write-Host '    https://geekatplay.gumroad.com/'

Step '7/7 Finishing up'
$mkShortcut = Ask 'Create a desktop shortcut? [Y/n]' 'n'
if ($mkShortcut -ne 'n' -and $mkShortcut -ne 'N') {
    try {
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Image Express.lnk'))
        $lnk.TargetPath = Join-Path $InstallDir 'start.bat'
        $lnk.WorkingDirectory = $InstallDir
        $lnk.Description = 'Image Express - AI design studio'
        $lnk.Save()
        Ok 'desktop shortcut created'
    } catch {
        Warn2 "Could not create the shortcut ($_)."
    }
}

Write-Host ''
Ok "Setup complete. Full log: $LogFile"
Write-Host 'The in-app Setup Wizard finishes the rest (storage, cloud, API keys) on first launch.'
$launch = Ask 'Launch Image Express now? [Y/n]' 'n'
try { Stop-Transcript | Out-Null } catch {}
if ($launch -ne 'n' -and $launch -ne 'N') {
    Start-Process -FilePath (Join-Path $InstallDir 'start.bat') -WorkingDirectory $InstallDir
}
Write-Host 'Woof! All done.'
if (-not $Auto) { Read-Host 'Press Enter to close' }
