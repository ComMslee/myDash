Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" | Select-Object *Docker*
Get-Service -Name "Tailscale" | Select-Object Name, Status, StartType
