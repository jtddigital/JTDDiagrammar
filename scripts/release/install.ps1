# JTDDiagrammar installer for Windows (URS-NF-010). Windows PowerShell 5.1 or PowerShell 7.
#   irm https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File install.ps1 v1.2.3     # a specific release
# Private repository: set GITHUB_TOKEN, or log in with `gh auth login`.
# Overrides: JTD_HOME (install dir), JTD_REPO, JTD_API, JTD_VERSION.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Get-Setting($Name, $Default) { $v = [Environment]::GetEnvironmentVariable($Name); if ($v) { $v } else { $Default } }
function Say($Text) { Write-Host "jtddiagrammar: $Text" }
function Fail($Text) { throw "jtddiagrammar: $Text" }

$Repo = Get-Setting 'JTD_REPO' 'jtddigital/JTDDiagrammar'
$Api = Get-Setting 'JTD_API' 'https://api.github.com'
$JtdHome = Get-Setting 'JTD_HOME' (Join-Path $env:LOCALAPPDATA 'jtddiagrammar')
$Want = if ($args.Count -gt 0) { $args[0] } else { Get-Setting 'JTD_VERSION' 'latest' }
$Asset = 'jtddiagrammar.tar.gz'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js 22.18 or later is required: https://nodejs.org' }
& node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'
if ($LASTEXITCODE -ne 0) { Fail "Node.js 22.18 or later is required (found $(node --version))" }
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { Fail 'tar is required (included with Windows 10 1803 and later)' }

$Token = Get-Setting 'GITHUB_TOKEN' (Get-Setting 'GH_TOKEN' '')
if (-not $Token -and (Get-Command gh -ErrorAction SilentlyContinue)) { $Token = (& gh auth token 2>$null) }
function Get-Headers($Accept) {
  $h = @{ Accept = $Accept; 'X-GitHub-Api-Version' = '2022-11-28' }
  if ($Token) { $h.Authorization = "Bearer $Token" }
  $h
}

$path = if ($Want -eq 'latest') { 'releases/latest' } else { "releases/tags/$Want" }
try { $release = Invoke-RestMethod -Uri "$Api/repos/$Repo/$path" -Headers (Get-Headers 'application/vnd.github+json') -UseBasicParsing }
catch { Fail "cannot read release '$Want' of $Repo (private repository? set GITHUB_TOKEN)" }
$Tag = $release.tag_name
$tar = $release.assets | Where-Object name -eq $Asset
$sum = $release.assets | Where-Object name -eq "$Asset.sha256"
if ($Tag -notmatch '^v[\w.+-]+$' -or -not $tar -or -not $sum) { Fail "release '$Want' has no $Asset" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("jtd-" + [Guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  Say "downloading $Tag"
  $file = Join-Path $tmp $Asset
  Invoke-WebRequest -Uri $tar.url -Headers (Get-Headers 'application/octet-stream') -OutFile $file -UseBasicParsing
  Invoke-WebRequest -Uri $sum.url -Headers (Get-Headers 'application/octet-stream') -OutFile "$file.sha256" -UseBasicParsing
  $expected = ((Get-Content "$file.sha256" -Raw) -split '\s')[0]
  if ((Get-FileHash $file -Algorithm SHA256).Hash -ne $expected.ToUpper()) { Fail 'checksum mismatch; download aborted' }

  $versions = Join-Path $JtdHome 'versions'
  $dest = Join-Path $versions $Tag
  $staging = "$dest.new"
  New-Item -ItemType Directory -Force $versions | Out-Null
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
  New-Item -ItemType Directory $staging | Out-Null
  & tar -xzf $file -C $staging --strip-components=1
  if ($LASTEXITCODE -ne 0) { Fail 'could not extract the release' }

  Say 'installing dependencies'
  Push-Location $staging
  try {
    $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
    $pnpm = @('install', '--prod', '--frozen-lockfile', '--filter', '@jtd/api...', '--reporter=silent')
    if (Get-Command corepack -ErrorAction SilentlyContinue) { & corepack pnpm @pnpm }
    elseif (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm @pnpm }
    else { & npx --yes pnpm@10.28.0 @pnpm }
    if ($LASTEXITCODE -ne 0) { Fail 'dependency install failed (is the npm registry reachable?)' }
  } finally { Pop-Location }

  # `current` is a one-line file naming the active version (no symlink or junction needed).
  $currentFile = Join-Path $JtdHome 'current'
  $prev = if (Test-Path $currentFile) { (Get-Content $currentFile -Raw).Trim() } else { '' }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Move-Item $staging $dest
  Set-Content -Path $currentFile -Value $Tag -NoNewline -Encoding ASCII
  Get-ChildItem $versions -Directory | Where-Object { $_.Name -ne $Tag -and $_.Name -ne $prev } | Remove-Item -Recurse -Force

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
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($userPath -split ';') -contains $bin)) {
    [Environment]::SetEnvironmentVariable('Path', (@($userPath, $bin) | Where-Object { $_ }) -join ';', 'User')
    Say "added $bin to your PATH (new terminals)"
  }

  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'JTDDiagrammar.lnk'
  try {
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($menu)
    $lnk.TargetPath = $shim
    $lnk.Arguments = 'start'
    $lnk.WorkingDirectory = $JtdHome
    $lnk.Description = 'Diagrams from structured text'
    $lnk.Save()
  } catch { Say 'could not create the Start Menu entry; use the jtddiagrammar command' }

  Say "installed $Tag in $JtdHome"
  Say "settings: $config (set ANTHROPIC_API_KEY there to enable AI generation)"
  Say 'run: jtddiagrammar   (or JTDDiagrammar in the Start Menu)'
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
