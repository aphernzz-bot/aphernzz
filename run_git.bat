@echo off
cd /d "C:\Users\USUARIO HP\Documents\Angel\web\aphernzz"
del /f /q ".git\index.lock" 2>nul
git config user.email "aphernzz@gmail.com"
git config user.name "Angel"
git add demos/dr-mendoza.html
git commit -m "feat(dr-mendoza): hero split-layout verde con pill-nav responsive"
git push origin master
echo.
echo === Listo! Presiona cualquier tecla para cerrar ===
pause
