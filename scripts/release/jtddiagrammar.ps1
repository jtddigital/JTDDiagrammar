# JTDDiagrammar launcher for Windows (URS-NF-011).
#   jtddiagrammar [start] [--port N] [--no-open]   start the app and open it in the browser
#   jtddiagrammar update [vX.Y.Z]                  install the latest (or a given) release
#   jtddiagrammar restart [--port N] [--no-open]   stop the running app and start it again
#   jtddiagrammar stop                              stop the running app
#   jtddiagrammar version
#   jtddiagrammar uninstall [--keep-config]      remove the app, its shortcuts and its PATH entry
$ErrorActionPreference = 'Stop'
$OnWindows = $env:OS -eq 'Windows_NT'
$App = Split-Path -Parent $PSScriptRoot
if (-not $env:JTD_HOME) { $env:JTD_HOME = Split-Path -Parent (Split-Path -Parent $App) }

$rest = @($args)
$cmd = 'start'
if ($rest.Count -gt 0 -and -not "$($rest[0])".StartsWith('-')) { $cmd = $rest[0]; $rest = @($rest | Select-Object -Skip 1) }

function Test-Up($Url) {
  try { (Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}

# The running server's version and start time, or $null if none answers. Retried: the first web request
# in Windows PowerShell 5.1 can stall for seconds (proxy detection).
function Get-Health($Url) {
  for ($try = 0; $try -lt 3; $try++) {
    try { return (Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 300 }
  }
  $null
}

# The server this launcher started, so a later run can stop or restart it.
$PidFile = Join-Path $env:JTD_HOME 'server.pid'
function Stop-Server {
  if (-not (Test-Path $PidFile)) { return $false }
  $id = 0
  [void][int]::TryParse((Get-Content $PidFile -Raw).Trim(), [ref]$id)
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  if (-not $id -or -not (Get-Process -Id $id -ErrorAction SilentlyContinue)) { return $false }
  Stop-Process -Id $id -Force
  return $true
}

switch ($cmd) {
  'version' { Get-Content (Join-Path $App 'VERSION') }
  'update' { & (Join-Path $App 'bin\install.ps1') @rest }
  'stop' { if (Stop-Server) { 'JTDDiagrammar stopped' } else { 'JTDDiagrammar is not running' } }
  'restart' {
    [void](Stop-Server)
    Start-Sleep -Seconds 1
    & $PSCommandPath start @rest
    exit $LASTEXITCODE
  }
  'uninstall' {
    $keep = $rest -contains '--keep-config'
    if ($OnWindows) {
      foreach ($folder in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
        Remove-Item (Join-Path $folder 'JTDDiagrammar.lnk') -ErrorAction SilentlyContinue
      }
      $bin = Join-Path $env:JTD_HOME 'bin'
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      [Environment]::SetEnvironmentVariable('Path', (($userPath -split ';') | Where-Object { $_ -and $_ -ne $bin }) -join ';', 'User')
    }
    $config = Join-Path $env:JTD_HOME 'config.env'
    $doomed = Get-ChildItem $env:JTD_HOME -Force | Where-Object { -not ($keep -and $_.FullName -eq $config) }
    if ($OnWindows) {
      # cmd.exe still has the running .cmd shim open: delete once this process has exited.
      $list = ($doomed | ForEach-Object { if ($_.PSIsContainer) { "rmdir /s /q `"$($_.FullName)`"" } else { "del /f /q `"$($_.FullName)`"" } }) -join ' & '
      $tail = if ($keep) { '' } else { " & rmdir /q `"$($env:JTD_HOME)`"" }
      Start-Process cmd -ArgumentList "/c ping -n 3 127.0.0.1 >nul & $list$tail" -WindowStyle Hidden
    } else {
      $doomed | Remove-Item -Recurse -Force
      if (-not $keep) { Remove-Item $env:JTD_HOME -Force }
    }
    if ($keep) { "JTDDiagrammar removed; kept $config" } else { 'JTDDiagrammar removed' }
  }
  'start' {
    $config = Join-Path $env:JTD_HOME 'config.env'
    if (Test-Path $config) {
      foreach ($line in Get-Content $config) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), 'Process') }
      }
    }
    if (-not $env:PORT) { $env:PORT = '8080' }
    if (-not $env:HOST) { $env:HOST = '127.0.0.1' }
    $env:NODE_ENV = 'production'
    $open = $true
    for ($i = 0; $i -lt $rest.Count; $i++) {
      switch ($rest[$i]) {
        '--port' { $env:PORT = $rest[++$i] }
        '--no-open' { $open = $false }
        default { Write-Error "unknown option: $($rest[$i])"; exit 2 }
      }
    }
    $url = "http://localhost:$($env:PORT)"
    # Probe over IPv4: on Windows, localhost tries ::1 first, and each refused attempt costs seconds.
    $probe = if ($env:HOST -in @('127.0.0.1', '0.0.0.0', 'localhost')) { "http://127.0.0.1:$($env:PORT)" } else { $url }
    $installed = (Get-Content (Join-Path $App 'VERSION')).Trim()
    $health = Get-Health $probe
    if ($health) {
      # Already running: reuse it, unless it is an older version or config.env changed since it started.
      $changed = 0
      if (Test-Path $config) { $changed = [DateTimeOffset]::new((Get-Item $config).LastWriteTimeUtc).ToUnixTimeMilliseconds() }
      if ($health.version -eq $installed -and [long]$health.startedAt -ge $changed) { "already running at $url"; if ($open) { Start-Process $url }; exit 0 }
      $why = 'settings in config.env changed'
      if ($health.version -ne $installed) { $why = "$(if ($health.version) { $health.version } else { 'an older version' }) is running, $installed is installed" }
      if (-not (Stop-Server)) {
        Write-Host "JTDDiagrammar is already running at $url, but $why."
        Write-Host 'Close the window it runs in (or press Ctrl+C there), then run jtddiagrammar again.'
        exit 1
      }
      "Restarting: $why"
      for ($i = 0; $i -lt 20 -and (Test-Up $probe); $i++) { Start-Sleep -Milliseconds 500 }
    }
    $server = Join-Path $App 'packages\api\src\server.ts'
    $node = Start-Process node -ArgumentList "`"$server`"" -NoNewWindow -PassThru
    Set-Content -Path $PidFile -Value $node.Id
    try {
      for ($i = 0; $i -lt 60 -and -not (Test-Up $probe); $i++) {
        if ($node.HasExited) { Write-Error 'the server failed to start'; exit 1 }
        Start-Sleep -Milliseconds 500
      }
      "JTDDiagrammar $installed at $url (Ctrl+C or close this window to stop)"
      if ($open) { Start-Process $url }
      $node.WaitForExit()
    } finally {
      if (-not $node.HasExited) { Stop-Process -Id $node.Id -Force }
      if ((Test-Path $PidFile) -and (Get-Content $PidFile -Raw).Trim() -eq "$($node.Id)") { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
    }
  }
  default { Get-Content $PSCommandPath | Select-Object -Skip 1 -First 7 | ForEach-Object { $_ -replace '^# ?', '' }; exit 2 }
}
