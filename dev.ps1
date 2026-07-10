# Starts the whole dev stack, each part in its own terminal window:
#   - API      -> http://localhost:8000   (uvicorn --reload: restarts itself on backend edits)
#   - Frontend -> http://localhost:5173   (vite dev server)
#
# To restart something: close its window (or Ctrl+C inside it), then rerun .\dev.ps1
# (it's safe to rerun with one window still open — the survivor just fails to
#  bind its port in the new window, and you can close that duplicate).

$root = $PSScriptRoot
# Prefer a real PowerShell 7 install if present, fall back to Windows PowerShell.
# (Deliberately not just `Get-Command pwsh`: on this machine that resolves to the
# Microsoft Store package's app-execution alias, which Start-Process launches with
# a virtualized/reset PATH - `npm` etc. then fail to resolve in the spawned window.)
$shell = if (Test-Path "$env:ProgramFiles\PowerShell\7\pwsh.exe") {
    "$env:ProgramFiles\PowerShell\7\pwsh.exe"
} else {
    "powershell"
}

Start-Process $shell -WorkingDirectory $root -ArgumentList @(
    "-NoExit", "-Command",
    ".\venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --reload-dir backend"
)

Start-Process $shell -WorkingDirectory (Join-Path $root "frontend") -ArgumentList @(
    "-NoExit", "-Command", "npm run dev"
)

Write-Host ""
Write-Host "  API      ->  http://localhost:8000"
Write-Host "  Frontend ->  http://localhost:5173"
Write-Host ""
Write-Host "  If Vite reports a port other than 5173, another dev server is already"
Write-Host "  running somewhere - close it, or the API's CORS will block that copy."
