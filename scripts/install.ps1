[CmdletBinding()]
param(
  [ValidateSet("minimal","default","full")][string]$Preset,
  [ValidateSet("safe","balanced","autonomous")][string]$Permissions,
  [Nullable[bool]]$OpenWebUI,
  [switch]$NonInteractive,
  [switch]$Repair
)
$ErrorActionPreference = "Stop"
function Select-Menu([string]$Title,[array]$Items,[int]$Default=1) {
  Write-Host ""; Write-Host $Title -ForegroundColor Cyan
  for($i=0;$i -lt $Items.Count;$i++){ $mark=if($i+1 -eq $Default){" (recommended)"}else{""};Write-Host ("  [{0}] {1}{2}" -f ($i+1),$Items[$i].Label,$mark);Write-Host ("      "+$Items[$i].Description) -ForegroundColor DarkGray }
  while($true){$answer=Read-Host ("Choose [default {0}]" -f $Default);if([string]::IsNullOrWhiteSpace($answer)){return $Items[$Default-1].Value};$number=0;if([int]::TryParse($answer,[ref]$number)-and $number-ge 1-and $number-le $Items.Count){return $Items[$number-1].Value};Write-Warning "Enter a number from 1 to $($Items.Count)."}
}
function Confirm-Choice([string]$Prompt,[bool]$Default=$true){$suffix=if($Default){"[Y/n]"}else{"[y/N]"};while($true){$answer=Read-Host "$Prompt $suffix";if([string]::IsNullOrWhiteSpace($answer)){return $Default};if($answer-match '^[Yy]') {return $true};if($answer-match '^[Nn]'){return $false}}}
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host "       CORVUS INTERACTIVE INSTALLER" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor DarkCyan
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js 22+ is required. Install it from https://nodejs.org/"}
$major=[int]((& node -p "process.versions.node.split('.')[0]").Trim());if($major-lt 22){throw "Node.js 22+ is required (found $major)."}
if(-not $Preset){if($NonInteractive){$Preset="full"}else{$Preset=Select-Menu "Feature bundle" @(@{Label="Minimal";Value="minimal";Description="Core, filesystem, shell and WebUI."},@{Label="Default";Value="default";Description="Recommended developer setup with memory, skills, delegation and MCP."},@{Label="Full";Value="full";Description="All features, including browser, scheduler, channels, inbound webhooks, execution nodes and MCP server."}) 3}}
if(-not $Permissions){if($NonInteractive){$Permissions="balanced"}else{$Permissions=Select-Menu "Permission policy" @(@{Label="Safe";Value="safe";Description="High-risk operations require approval."},@{Label="Balanced";Value="balanced";Description="Read-only actions run freely; writes, process and network ask."},@{Label="Autonomous";Value="autonomous";Description="Allows all configured capabilities. Use only on an isolated machine."}) 2}}
if($null-eq $OpenWebUI){$OpenWebUI=if($NonInteractive){$false}else{Confirm-Choice "Open the WebUI after installation?" $true}}
Write-Host "";Write-Host "Installation plan" -ForegroundColor Cyan;Write-Host "  Bundle:      $Preset";Write-Host "  Permissions: $Permissions";Write-Host "  Open WebUI:  $OpenWebUI"
if(-not $NonInteractive-and-not(Confirm-Choice "Continue with installation?" $true)){Write-Host "Installation canceled.";exit 0}
$repo=Split-Path -Parent $PSScriptRoot;$homeRoot=if($env:CORVUS_HOME){$env:CORVUS_HOME}else{Join-Path $HOME '.corvus'};$backup=$null;$previousVersion=$null
try{$previousVersion=(& npm list -g corvus --json 2>$null|ConvertFrom-Json).dependencies.corvus.version}catch{}
if(Test-Path $homeRoot){$backup=Join-Path $homeRoot ('backups\pre-install-'+(Get-Date -Format 'yyyyMMdd-HHmmss'));New-Item -ItemType Directory -Path $backup -Force|Out-Null;foreach($name in @('config.json','corvus.db','bundle.json','secrets.enc.json')){$source=Join-Path $homeRoot $name;if(Test-Path $source){Copy-Item $source $backup -Force}};Write-Host "Backup created: $backup"}
Push-Location $repo
try{
  Write-Host "[1/6] Building Corvus..." -ForegroundColor Cyan;npm run build;if($LASTEXITCODE-ne 0){throw "Corvus build failed"}
  Write-Host "[2/6] Verifying release files..." -ForegroundColor Cyan;npm run release:manifest;if($LASTEXITCODE-ne 0){throw "Release manifest generation failed"};$manifest=Get-Content (Join-Path $repo 'dist\release-manifest.json') -Raw|ConvertFrom-Json;foreach($file in $manifest.files){$actual=(Get-FileHash (Join-Path $repo ('dist\'+$file.path)) -Algorithm SHA256).Hash.ToLower();if($actual-ne $file.sha256){throw "Release checksum mismatch: $($file.path)"}}
  Write-Host "[3/6] Installing global command..." -ForegroundColor Cyan;npm install -g .;if($LASTEXITCODE-ne 0){throw "Global install failed"}
  Write-Host "[4/6] Applying feature bundle..." -ForegroundColor Cyan;& corvus bundle apply $Preset;if($LASTEXITCODE-ne 0){throw "Bundle apply failed"}
  Write-Host "[5/6] Applying permission policy..." -ForegroundColor Cyan;& corvus permission preset $Permissions;if($LASTEXITCODE-ne 0){throw "Permission preset failed"}
  Write-Host "[6/6] Running diagnostics..." -ForegroundColor Cyan;$doctor=& corvus doctor --json;if($LASTEXITCODE-ne 0){throw "Corvus doctor failed after installation"};Write-Host $doctor
  Write-Host "Corvus installed successfully." -ForegroundColor Green;Write-Host "Data directory: $homeRoot";Write-Host "Run: corvus --web-only"
  if($OpenWebUI){Start-Process corvus -ArgumentList "--web-only";Write-Host "WebUI is starting in a separate process."}
}catch{Write-Error $_;if($previousVersion){Write-Warning "Restoring corvus@$previousVersion";npm install -g ("corvus@"+$previousVersion)|Out-Null};if($backup){Write-Warning "Restoring user data from $backup";foreach($name in @('config.json','corvus.db','bundle.json','secrets.enc.json')){$saved=Join-Path $backup $name;if(Test-Path $saved){Copy-Item $saved (Join-Path $homeRoot $name) -Force}}};throw}finally{Pop-Location}
