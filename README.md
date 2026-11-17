# Grid Click 23x14

Application Android Expo/React Native qui charge une image depuis Render ou un serveur local, affiche une grille tactile de **23 colonnes × 14 rangées**, permet de sélectionner plusieurs cellules, puis envoie leurs coordonnées au serveur.

## Lancer localement

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm dev
```

L’application utilise Expo Web sur le port 8081 et l’API du starter sur le port 3000. Pour un téléphone réel, utilisez l’adresse IP du Mac mini, par exemple `http://192.168.1.20:3000`. Pour l’émulateur Android, `http://10.0.2.2:3000` pointe vers le Mac hôte.

## Protocole HTTP attendu

Les routes sont configurables depuis le bouton réglages. Les valeurs par défaut sont :

```text
GET  /api/health
GET  /api/next
POST /api/clicks
```

`GET /api/next` peut renvoyer `204 No Content` s’il n’y a aucune tâche. Sinon, la réponse JSON doit contenir un identifiant et une image sous l’un de ces noms : `imageDataUrl`, `imageUrl`, `dataUrl` ou `image`.

Exemple :

```json
{
  "id": "task-123",
  "imageDataUrl": "data:image/png;base64,...",
  "prompt": "Sélectionner les éléments demandés"
}
```

Après la sélection, l’application envoie :

```json
{
  "taskId": "task-123",
  "grid": { "columns": 23, "rows": 14 },
  "clicks": [
    {
      "column": "C",
      "row": 4,
      "columnIndex": 3,
      "rowIndex": 4,
      "xRatio": 0.1087,
      "yRatio": 0.25
    }
  ],
  "coordinates": [
    {
      "column": "C",
      "row": 4,
      "columnIndex": 3,
      "rowIndex": 4,
      "xRatio": 0.1087,
      "yRatio": 0.25
    }
  ]
}
```

Les indices `columnIndex` et `rowIndex` commencent à 1. Les colonnes vont de `A` à `W`, et les rangées de 1 à 14. Le champ `{id}` peut être utilisé dans la route d’envoi, par exemple `/api/result/{id}`.

## Compilation Codemagic

Le fichier [`codemagic.yaml`](./codemagic.yaml) contient deux workflows :

- `android-debug` produit un APK de test sans signature de production ;
- `android-release` produit un AAB signé avec le groupe de signature Codemagic `gridclick_keystore`.

Dans Codemagic, connectez le dépôt, sélectionnez `codemagic.yaml`, puis configurez le groupe de signature Android nommé `gridclick_keystore`. Pour publier sur Google Play, associez également les variables et identifiants Google Play dans le groupe `google_play`. Le workflow utilise `instance_type: mac_mini_m2`.

Avant d’utiliser un serveur local sur un téléphone réel, autorisez le port 3000 sur le Mac mini et faites écouter le serveur sur `0.0.0.0`, pas uniquement sur `127.0.0.1`. Pour un serveur Render, utilisez HTTPS.
