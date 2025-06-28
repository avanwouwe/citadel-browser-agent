Remove-Item -Path "bin" -Force -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "dist" -Force -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "build" -Force -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "obj" -Force -Recurse -ErrorAction SilentlyContinue

$PYTHON_PATH = "$env:LOCALAPPDATA\Programs\Python\Python313"

& "$PYTHON_PATH\Scripts\pip" install --upgrade pyinstall

& "$PYTHON_PATH\Scripts\pyinstaller" --clean --optimize 2 --onefile ../citadel-browser-agent

dotnet build -c Release -p:Platform=x64