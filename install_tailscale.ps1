$url = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
$dest = "$env:USERPROFILE\Downloads\tailscale-setup.exe"
Invoke-WebRequest -Uri $url -OutFile $dest
Start-Process $dest
