# Plan — Grid Click 23x14

## Produit

Application Android tactile pour opérateur : elle charge une image depuis Render ou une adresse locale, superpose une grille de 23 colonnes et 14 rangées exactement sur l’image, permet de sélectionner plusieurs cellules, puis transmet les coordonnées structurées au serveur.

## Design choisi

**Style : cockpit sombre compact — probabilité 0,84.**

- **Mouvement :** interface utilitaire inspirée des consoles de contrôle, avec surface bleu nuit, accents turquoise et informations d’état courtes.
- **Principes :** lisibilité en une main, contraste élevé, état réseau toujours visible, action principale évidente.
- **Palette :** le fond sombre réduit les distractions autour de l’image ; le turquoise signale la sélection et les actions confirmées ; le rose est réservé aux erreurs.
- **Mise en page :** en-tête court, source et état au-dessus de l’image, image comme zone dominante, commandes compactes dessous.
- **Signatures :** marqueur carré avec icône de grille, pastilles de sélection au centre des cases, boutons segmentés Render/Local.
- **Interaction :** toucher une case alterne sa sélection ; l’envoi est verrouillé tant que moins de deux cases ne sont pas choisies.
- **Animation :** activité limitée à l’indicateur de chargement et au panneau de réglages ; pas d’animation qui gêne le repérage.
- **Typographie :** hiérarchie sans empattement, titre fort, microcopie courte et secondaire.
- **Positionnement :** outil tactile de sélection de coordonnées, destiné à un usage répétitif et rapide.

## Implémentation

- Expo Router / React Native / TypeScript du starter mobile.
- Écran unique dans `app/(tabs)/index.tsx`.
- Image redimensionnée en `contain` avec calcul du rectangle réellement affiché ; la grille est superposée uniquement sur ce rectangle pour rester alignée malgré le redimensionnement.
- Sélection multiple des 322 cellules par `Pressable`.
- Stockage persistant des URLs et routes avec AsyncStorage.
- Requête de tâche via `GET /api/next` et envoi via `POST /api/clicks`, tous deux configurables.
- Payload comprenant `taskId`, `grid`, `clicks` et `coordinates` avec colonnes `A` à `W`, rangées 1 à 14 et ratios normalisés.
- `codemagic.yaml` avec workflows APK debug et AAB release sur `mac_mini_m2`.

## Structure

- `app/(tabs)/index.tsx` : écran, grille, sélection, réseau et réglages.
- `app/(tabs)/_layout.tsx` : navigation sans onglet visible.
- `app.config.ts` : identité native, permission HTTP local et icônes.
- `codemagic.yaml` : compilation Android Codemagic.
- `README.md` : protocole serveur et instructions de build.
