# JTDDiagrammar installer for Windows (URS-NF-010, URS-NF-013). Windows PowerShell 5.1 or PowerShell 7.
#   irm https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File install.ps1 v1.2.3     # a specific release
# Private repository: set GITHUB_TOKEN, or log in with `gh auth login`.
# Overrides: JTD_HOME (install dir), JTD_REPO, JTD_API, JTD_VERSION; JTD_NO_SHORTCUTS=1 skips shortcuts.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$OnWindows = $env:OS -eq 'Windows_NT'
if ($OnWindows) { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 }

function Get-Setting($Name, $Default) { $v = [Environment]::GetEnvironmentVariable($Name); if ($v) { $v } else { $Default } }
function Say($Text) { Write-Host "jtddiagrammar: $Text" }
function Fail($Text) { throw "jtddiagrammar: $Text" }

$Repo = Get-Setting 'JTD_REPO' 'jtddigital/JTDDiagrammar'
$Api = Get-Setting 'JTD_API' 'https://api.github.com'
$JtdHome = if ($env:JTD_HOME) { $env:JTD_HOME } else { Join-Path $env:LOCALAPPDATA 'jtddiagrammar' }
$Want = if ($args.Count -gt 0) { $args[0] } else { Get-Setting 'JTD_VERSION' 'latest' }
$Asset = 'jtddiagrammar.tar.gz'

# Node.js 22.18+ runs the app. Missing or too old: install the current LTS with winget.
# Compared here, not with `node -e`: Windows PowerShell 5.1 strips double quotes from native arguments.
function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = [version]((& node --version) -replace '^v', '' -replace '-.*$', '')
  $v -ge [version]'22.18'
}
if (-not (Test-Node)) {
  if (-not ($OnWindows -and (Get-Command winget -ErrorAction SilentlyContinue))) { Fail 'Node.js 22.18 or later is required: https://nodejs.org' }
  Say 'installing Node.js LTS with winget'
  & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Test-Node)) { Fail 'Node.js could not be installed; install it from https://nodejs.org and run this again' }
}
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { Fail 'tar is required (included with Windows 10 1803 and later)' }

$Token = Get-Setting 'GITHUB_TOKEN' (Get-Setting 'GH_TOKEN' '')
if (-not $Token -and (Get-Command gh -ErrorAction SilentlyContinue)) { $Token = (& gh auth token 2>$null) }
function Get-Headers($Accept) {
  $h = @{ Accept = $Accept; 'X-GitHub-Api-Version' = '2022-11-28' }
  if ($Token) { $h.Authorization = "Bearer $Token" }
  $h
}

# .NET directly: Get-FileHash lives in a 5.1 script module that fails to load when 5.1 is started from PowerShell 7.
function Get-Sha256($Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try { -join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) } finally { $stream.Dispose(); $sha.Dispose() }
}

$path = if ($Want -eq 'latest') { 'releases/latest' } else { "releases/tags/$Want" }
try { $release = Invoke-RestMethod -Uri "$Api/repos/$Repo/$path" -Headers (Get-Headers 'application/vnd.github+json') -UseBasicParsing }
catch { Fail "cannot read release '$Want' of $Repo (private repository? set GITHUB_TOKEN)" }
$Tag = $release.tag_name
$tar = $release.assets | Where-Object name -eq $Asset
$sum = $release.assets | Where-Object name -eq "$Asset.sha256"
if ($Tag -notmatch '^v[\w.+-]+$') { Fail "release '$Want' has an unexpected tag '$Tag'" }
if (-not $tar -or -not $sum) { Fail "release $Tag has no $Asset attached (GitHub's 'Source code' archive is not the app). The Release workflow attaches it: check its run under Actions, or start it with 'Run workflow' for tag $Tag." }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('jtd-' + [Guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  Say "downloading $Tag"
  $file = Join-Path $tmp $Asset
  Invoke-WebRequest -Uri $tar.url -Headers (Get-Headers 'application/octet-stream') -OutFile $file -UseBasicParsing
  Invoke-WebRequest -Uri $sum.url -Headers (Get-Headers 'application/octet-stream') -OutFile "$file.sha256" -UseBasicParsing
  $expected = ((Get-Content "$file.sha256" -Raw) -split '\s')[0]
  if ((Get-Sha256 $file) -ne $expected.ToLower()) { Fail 'checksum mismatch; download aborted' }

  # Install into a fresh folder and never move it afterwards: pnpm links node_modules on Windows with
  # junctions, which hold absolute paths, so a renamed folder would point its packages at the old path.
  $versions = Join-Path $JtdHome 'versions'
  $name = "$Tag-" + [Guid]::NewGuid().ToString('N').Substring(0, 8)
  $dest = Join-Path $versions $name
  New-Item -ItemType Directory -Force $dest | Out-Null
  try {
    & tar -xzf $file -C $dest --strip-components=1
    if ($LASTEXITCODE -ne 0) { Fail 'could not extract the release' }

    Say 'installing dependencies'
    Push-Location $dest
    try {
      $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
      $pnpm = @('install', '--prod', '--frozen-lockfile', '--filter', '@jtd/api...', '--reporter=silent')
      if (Get-Command corepack -ErrorAction SilentlyContinue) { & corepack pnpm @pnpm }
      elseif (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm @pnpm }
      else { & npx --yes pnpm@10.28.0 @pnpm }
      if ($LASTEXITCODE -ne 0) { Fail 'dependency install failed (is the npm registry reachable?)' }
    } finally { Pop-Location }
  } catch {
    Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
    throw
  }

  # `current` is a one-line file naming the active version folder (no symlink or junction needed).
  $currentFile = Join-Path $JtdHome 'current'
  $prev = if (Test-Path $currentFile) { (Get-Content $currentFile -Raw).Trim() } else { '' }
  Set-Content -Path $currentFile -Value $name -NoNewline -Encoding ASCII
  Get-ChildItem $versions -Directory | Where-Object { $_.Name -ne $name -and $_.Name -ne $prev } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  # User settings (API key, port…) live outside the version folders and survive updates.
  $config = Join-Path $JtdHome 'config.env'
  if (-not (Test-Path $config)) { Copy-Item (Join-Path $dest '.env.example') $config }

  $bin = Join-Path $JtdHome 'bin'
  New-Item -ItemType Directory -Force $bin | Out-Null
  $shim = Join-Path $bin 'jtddiagrammar.cmd'
  Set-Content -Path $shim -Encoding ASCII -Value @(
    '@echo off',
    'set "JTD_HOME=%~dp0.."',
    "set `"JTD_REPO=$Repo`"",
    "set `"JTD_API=$Api`"",
    'set /p JTD_VER=<"%JTD_HOME%\current"',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%JTD_HOME%\versions\%JTD_VER%\bin\jtddiagrammar.ps1" %*'
  )

  if ($OnWindows) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (($userPath -split ';') -contains $bin)) {
      [Environment]::SetEnvironmentVariable('Path', (@($userPath, $bin) | Where-Object { $_ }) -join ';', 'User')
      Say "added $bin to your PATH (takes effect in new terminals)"
    }
    if (-not $env:JTD_NO_SHORTCUTS) {
      $shell = New-Object -ComObject WScript.Shell
      foreach ($folder in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
        $lnk = $shell.CreateShortcut((Join-Path $folder 'JTDDiagrammar.lnk'))
        $lnk.TargetPath = $shim
        $lnk.Arguments = 'start'
        $lnk.WorkingDirectory = $JtdHome
        $lnk.Description = 'Start JTDDiagrammar and open it in your browser'
        $lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,1"
        $lnk.Save()
      }
    }
  }

  Say "installed $Tag in $JtdHome"
  Say "settings: $config (set ANTHROPIC_API_KEY there to enable AI generation)"
  Say 'start it from the JTDDiagrammar shortcut (Start Menu or desktop), or run: jtddiagrammar'
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
