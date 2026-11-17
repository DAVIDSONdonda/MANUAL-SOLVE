# TODO

## Écran de sélection tactile

- [ ] L’application affiche une image récupérée depuis l’URL du serveur actif Render ou local.
- [ ] Une grille fixe de 23 colonnes et 14 rangées est superposée précisément sur l’image affichée.
- [ ] L’utilisateur peut sélectionner deux cases ou plus par toucher.
- [ ] Les cellules sélectionnées sont repérées visuellement et le compteur est visible.
- [ ] Le bouton Effacer réinitialise toutes les sélections.

## Connexion et transmission

- [ ] L’application permet de choisir Render ou Local et conserve les URLs configurées.
- [ ] L’action Actualiser vérifie `/api/health` puis récupère la prochaine tâche via la route configurée.
- [ ] Le bouton Envoyer reste désactivé avec moins de deux cases sélectionnées.
- [ ] L’application envoie les coordonnées structurées et affiche une réussite ou une erreur lisible.
- [ ] Le serveur local est documenté pour émulateur Android et téléphone réel.

## Livraison Android

- [ ] Le workflow Codemagic `android-debug` produit un APK de test.
- [ ] Le workflow Codemagic `android-release` produit un AAB signé après configuration de la clé Android.
