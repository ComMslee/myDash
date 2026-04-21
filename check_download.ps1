Get-ChildItem "$env:USERPROFILE\Downloads" | Where-Object { $_.Name -like "tesla_auth*" }
