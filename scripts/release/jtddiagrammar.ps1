# JTDDiagrammar launcher for Windows (URS-NF-011).
#   jtddiagrammar [start] [--port N] [--no-open]   start the app and open it in the browser
#   jtddiagrammar update [vX.Y.Z]                  install the latest (or a given) release
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

switch ($cmd) {
  'version' { Get-Content (Join-Path $App 'VERSION') }
  'update' { & (Join-Path $App 'bin\install.ps1') @rest }
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
    if (Test-Up $url) { "already running at $url"; if ($open) { Start-Process $url }; exit 0 }
    $server = Join-Path $App 'packages\api\src\server.ts'
    $node = Start-Process node -ArgumentList "`"$server`"" -NoNewWindow -PassThru
    try {
      for ($i = 0; $i -lt 60 -and -not (Test-Up $url); $i++) {
        if ($node.HasExited) { Write-Error 'the server failed to start'; exit 1 }
        Start-Sleep -Milliseconds 500
      }
      "JTDDiagrammar $((Get-Content (Join-Path $App 'VERSION')).Trim()) at $url (Ctrl+C or close this window to stop)"
      if ($open) { Start-Process $url }
      $node.WaitForExit()
    } finally {
      if (-not $node.HasExited) { Stop-Process -Id $node.Id -Force }
    }
  }
  default { Get-Content $PSCommandPath | Select-Object -Skip 1 -First 5 | ForEach-Object { $_ -replace '^# ?', '' }; exit 2 }
}
