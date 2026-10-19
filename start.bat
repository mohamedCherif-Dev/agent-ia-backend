@echo off
echo ===================================================
echo     Demarrage de l'Agent IA Local (Ollama + Backend)
echo ===================================================

echo [1/3] Verification et lancement d'Ollama...
start "" ollama serve

echo [2/3] Démarrage du serveur Node.js Backend...
start "" cmd /k "npm run dev"

echo [3/3] Attente de l'initialisation du serveur...
timeout /t 3 /nobreak > nul

echo [4/4] Ouverture du tableau de bord Web...
start http://localhost:3000

echo ===================================================
echo   L'application est prête sur http://localhost:3000
echo ===================================================