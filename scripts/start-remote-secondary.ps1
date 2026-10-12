param(
  [Parameter(Mandatory = $true)]
  [string]$AppPath,

  [Parameter(Mandatory = $true)]
  [string]$HostUrl
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $AppPath -PathType Leaf)) {
  throw "Auto Torque executable not found: $AppPath"
}

try {
  $uri = [System.Uri]::new($HostUrl)
} catch {
  throw "HostUrl must be a full URL such as http://192.168.1.20:3000"
}

if ($uri.Scheme -notin @("http", "https") -or $uri.UserInfo -or $uri.AbsolutePath -ne "/" -or $uri.Query -or $uri.Fragment) {
  throw "Use an HTTP(S) origin only, without credentials, path, query, or fragment."
}

$hostName = $uri.DnsSafeHost -replace '^\[|\]
$isLocalName = $hostName.EndsWith(".local", [System.StringComparison]::OrdinalIgnoreCase)
$ip = $null
$isPrivateIp = $false
if ([System.Net.IPAddress]::TryParse($hostName, [ref]$ip)) {
  if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
    $bytes = $ip.GetAddressBytes()
    $isPrivateIp = (
      $bytes[0] -eq 10 -or
      ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
      ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or
      ($bytes[0] -eq 169 -and $bytes[1] -eq 254)
    )
  } elseif ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
    $bytes = $ip.GetAddressBytes()
    $isPrivateIp = (($bytes[0] -band 0xFE) -eq 0xFC) -or (($bytes[0] -eq 0xFE) -and (($bytes[1] -band 0xC0) -eq 0x80))
  }
}

if (-not ($isLocalName -or $isPrivateIp)) {
  throw "HostUrl must use a private LAN IP address or a .local hostname."
}

$env:AUTO_TORQUE_REMOTE_URL = $uri.GetLeftPart([System.UriPartial]::Authority)
$env:AUTO_TORQUE_LAN_HOST = "false"
$env:AUTO_TORQUE_LAN_ORIGINS = ""
Write-Host "Starting Auto Torque in REMOTE-ONLY mode: $env:AUTO_TORQUE_REMOTE_URL"
Write-Host "Local SQLite initialization and the local server are skipped by this build."
Start-Process -FilePath $AppPath

$isLocalName = $hostName.EndsWith(".local", [System.StringComparison]::OrdinalIgnoreCase)
$ip = $null
$isPrivateIp = $false
if ([System.Net.IPAddress]::TryParse($hostName, [ref]$ip)) {
  if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
    $bytes = $ip.GetAddressBytes()
    $isPrivateIp = (
      $bytes[0] -eq 10 -or
      ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
      ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or
      ($bytes[0] -eq 169 -and $bytes[1] -eq 254)
    )
  } elseif ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
    $bytes = $ip.GetAddressBytes()
    $isPrivateIp = (($bytes[0] -band 0xFE) -eq 0xFC) -or (($bytes[0] -eq 0xFE) -and (($bytes[1] -band 0xC0) -eq 0x80))
  }
}

if (-not ($isLocalName -or $isPrivateIp)) {
  throw "HostUrl must use a private LAN IP address or a .local hostname."
}

$env:AUTO_TORQUE_REMOTE_URL = $uri.GetLeftPart([System.UriPartial]::Authority)
$env:AUTO_TORQUE_LAN_HOST = "false"
$env:AUTO_TORQUE_LAN_ORIGINS = ""
Write-Host "Starting Auto Torque in REMOTE-ONLY mode: $env:AUTO_TORQUE_REMOTE_URL"
Write-Host "Local SQLite initialization and the local server are skipped by this build."
Start-Process -FilePath $AppPath
