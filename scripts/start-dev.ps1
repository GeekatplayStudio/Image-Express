Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

function Get-RepoNodeProcesses {
    $rootWin = $repoRoot
    $rootPosix = $repoRoot -replace "\\", "/"

    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "node.exe" -and
        $_.CommandLine -and
        ($_.CommandLine -like "*$rootWin*" -or $_.CommandLine -like "*$rootPosix*")
    }
}

function Get-HealthyDevPort {
    $repoNode = Get-RepoNodeProcesses
    if (-not $repoNode) {
        return $null
    }

    $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -in $repoNode.ProcessId -and $_.LocalPort -lt 49152 } |
        Sort-Object LocalPort -Unique |
        Select-Object -ExpandProperty LocalPort

    foreach ($port in $ports) {
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 5
            return $port
        } catch {
            if ($_.Exception.Response) {
                return $port
            }
        }
    }

    return $null
}

function Get-StaleNextProcesses {
    $patterns = @(
        "next\\dist\\bin\\next.* dev",
        "next\\dist\\server\\lib\\start-server\.js",
        "\.next\\dev\\build\\postcss\.js",
        "npm-cli\.js.* run dev"
    )

    Get-RepoNodeProcesses | Where-Object {
        $commandLine = $_.CommandLine
        $patterns | Where-Object { $commandLine -match $_ } | Select-Object -First 1
    }
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    Write-Host "npm was not found in PATH."
    Write-Host "Install Node.js and npm, then try again."
    exit 1
}

$runningPort = Get-HealthyDevPort
if ($runningPort) {
    Write-Host "Image Express is already running at http://localhost:$runningPort"
    exit 0
}

$staleProcesses = @(Get-StaleNextProcesses)
if ($staleProcesses.Count -gt 0) {
    $pids = $staleProcesses | Select-Object -ExpandProperty ProcessId -Unique
    Write-Host ("Cleaning up stale Image Express dev processes: " + ($pids -join ", "))
    $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

$lockPath = Join-Path $repoRoot ".next\dev\lock"
if (Test-Path -LiteralPath $lockPath) {
    Write-Host "Removing stale Next.js lock..."
    Remove-Item -LiteralPath $lockPath -Force
}

Write-Host "Starting Image Express dev server..."
Write-Host "Press Ctrl+C in this window to stop it."
Write-Host ""

& $npmCommand.Source run dev
if ($null -ne $LASTEXITCODE) {
    exit $LASTEXITCODE
}

exit 0
