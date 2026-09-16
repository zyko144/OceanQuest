# 🌊 Ocean Quest — Bots Discord

Serveur Discord complet pour le jeu Roblox **Ocean Quest** : salons au style océan, rôles marins, tickets, sécurité, niveaux, mini-jeu de pêche et giveaways.

| Bot | Rôle | Variable |
| --- | --- | --- |
| 🎫 **Ocean Ticket** | Centre des tickets (formulaires, prise en charge, transcripts HTML, notes) | `TICKET_BOT_TOKEN` |
| 🛡️ **Ocean Guard** | Vérification en 1 clic, anti-raid, anti-spam/arnaques/pubs, anti-nuke, logs, modération | `SECURITY_BOT_TOKEN` |
| 🎣 **Ocean Quest** | Bienvenue, règlement, auto-rôles, niveaux, `/pecher`, suggestions, giveaways, annonces, `/setup` | `MAIN_BOT_TOKEN` |

Tant qu'un token est vide, ses modules tournent sur un autre bot (par défaut **Ocean Ticket** fait tout).
Les trois bots tournent dans **un seul service Render**.

## 🚀 Mise en route

1. **Supabase** : ouvre *SQL Editor → New query*, colle [`supabase/schema.sql`](supabase/schema.sql) et clique *Run*.
   Sans ça, les données (tickets, niveaux, avertissements…) sont gardées en mémoire et perdues au redémarrage.
2. **Render** : *Environment → Add from .env*, colle le contenu du fichier `.env` (voir [`.env.example`](.env.example)).
   Build : `npm ci` ・ Start : `npm start` ・ Health check : `/health`.
3. **Discord** : dans *Paramètres du serveur → Rôles*, glisse le rôle du bot **tout en haut**, puis tape `/setup`.

### Ajouter Ocean Guard et Ocean Quest (bots 2 et 3)

1. [Developer Portal](https://discord.com/developers/applications) → *New Application* (nom : `Ocean Guard`, puis `Ocean Quest`).
2. Onglet *Bot* → *Reset Token* → copie le token dans `SECURITY_BOT_TOKEN` / `MAIN_BOT_TOKEN` sur Render.
3. Toujours dans *Bot*, active **Server Members Intent** et **Message Content Intent**.
4. Invite le bot : `https://discord.com/oauth2/authorize?client_id=ID_DU_BOT&permissions=8&scope=bot%20applications.commands`
5. Redémarre le service Render, puis `/setup` : chaque bot reprend ses panneaux et ses commandes.

## 🧭 Commandes

- **Pêche & niveaux** : `/pecher` `/aquarium` `/aquariumig` `/rang` `/classement`
- **Boutique** : `/boutique` `/inventaire`
- **Roblox** : `/lier` `/profil` `/delier` `/jouer`
- **Communauté** : `/suggestion` `/serveur` `/aide`
- **Tickets** : `/ticket fermer|ajouter|retirer|renommer|panneau|stats`
- **Modération** : `/avertir` `/avertissements` `/retirer-avertissement` `/effacer-avertissements` `/sourdine` `/fin-sourdine` `/expulser` `/bannir` `/debannir` `/purge` `/verrouiller` `/deverrouiller` `/lenteur` `/confinement`
- **Administration** : `/tableau-de-bord` `/setup` `/annonce` `/giveaway lancer|terminer|relancer` `/recompense-roblox ajouter|retirer|liste|synchroniser` `/suggestion-statut`

## 🛒 Boutique à doublons

Les doublons gagnés avec `/pecher` s'échangent dans `/boutique` (catalogue dans `src/lib/shop.js`) :

| Catégorie | Objets | Effet |
| --- | --- | --- |
| 🎣 Cannes (permanentes) | Renforcée 750 · Capitaine 3 000 · Trident 15 000 | Attente -20 % / -35 % / -50 %, raretés boostées |
| 🪱 Appâts (par lot) | Vers ×10 · Crevettes ×5 · Abyssaux ×3 | Plus de Rares / ×2 Épiques / ×3 Légendaires et Mythiques |
| 🥅 Filets ×20 | 300 | Un filet est utilisé seulement s'il évite un déchet |
| 🎨 Couleurs | Corail, Lagon, Abysses 5 000 · Or 8 000 | Rôle de couleur, choisi dans `/inventaire` |

Inventaires et achats sont rangés dans `guild_config` (`boutique:…`) : aucune table à créer.

## 🎮 Jeu Roblox en direct

- **Détection du jeu** : automatique dès que les serveurs du jeu contactent le bot (en-tête `Roblox-Id` ajouté par Roblox). Sinon `ROBLOX_GAME_URL` ou `ROBLOX_PLACE_ID`.
- **Joueurs en ligne** : salon vocal `🎮︱ᴇɴ ᴍᴇʀ : N` et statut d'Ocean Quest, mis à jour toutes les 2 min.
- **Mises à jour** : quand le jeu est republié, annonce dans `#mises-a-jour` avec l'image du jeu et le ping 🆕 Nouvelle Marée.
- **Liaison vérifiée** (`/lier`) : le joueur choisit son pseudo (les joueurs en jeu sont proposés), puis clique **dans le jeu** sur l'animal affiché sur Discord. Rien à écrire sur Roblox. Secours sans lancer le jeu : 4 mots marins dans la description Roblox. Rôle 🔗 Matelot Roblox.
- **Récompenses** (`/recompense-roblox`) : rôle donné pour un badge, un game pass ou un nombre d'espèces à l'index, revérifié toutes les 30 min.
- **Scripts du jeu** : [`roblox/LiaisonDiscord.server.lua`](roblox/LiaisonDiscord.server.lua) (ServerScriptService) et [`roblox/LiaisonDiscord.client.lua`](roblox/LiaisonDiscord.client.lua) (LocalScript dans StarterPlayerScripts). Ils affichent la fenêtre de liaison et mettent l'attribut `DiscordRelie` sur chaque joueur pour une récompense en jeu.
- **API du jeu** (en-tête `X-Ocean-Secret`) : `POST /roblox/lien/attente` `{ joueurs: [{ userId, pseudo, affichage }] }` → demandes à afficher · `POST /roblox/lien/confirmer` `{ id, userId, choix | refus }` · `GET /roblox/lien/<userId>` → `{ relie }`.

## 📊 Tableau de bord

`https://oceanquest.onrender.com/dashboard` : aperçu, tickets, modération, économie et Roblox, en lecture seule.
Connexion : le staff tape `/tableau-de-bord` et reçoit un lien personnel (5 min, usage unique) qui ouvre une session de 12 h. Le rôle staff est revérifié à chaque visite. Aucun mot de passe à configurer.

## 🐡 Aquarium IG (`/aquariumig`)

Le jeu Roblox envoie toutes les minutes l'index des joueurs en ligne au bot, qui en tire un GIF d'aquarium avec les 3 meilleurs poissons.

- **Salon** : `#aquarium-ig`, créé au démarrage du bot s'il manque.
- **Réception** : `POST /roblox/aquarium` avec l'en-tête `X-Ocean-Secret`. La clé vient de `AQUARIUM_SECRET`, sinon elle est créée une fois et gardée dans `guild_config` (`aquarium_ig:secret`).
- **Corps** : `{ "joueurs": [{ "userId", "pseudo", "affichage", "especes", "totalEspeces", "poissons": [{ "nom", "rarete", "rang", "poids", "valeur", "mutation", "image", "couleur" }] }] }`. Les poissons sont classés par `rang` (rareté), puis valeur, puis poids.
- **Côté jeu** : script serveur `AquariumDiscord` et *Game Settings → Security → Allow HTTP Requests*.

## 🛠️ Développement local

```bash
npm install
npm run check   # vérifie tokens, intents, serveur et Supabase
npm run setup   # crée rôles, catégories et salons
npm run panels  # met à jour les panneaux (règlement, tickets…) puis s'arrête
npm start       # lance les bots + serveur web
```

## 📁 Structure

```
src/
  index.js              lanceur multi-bots
  web.js                serveur HTTP (Render) + auto-ping
  config.js             variables d'environnement
  lib/layout.js         plan du serveur : rôles, salons, permissions
  lib/fonts.js          polices Unicode du thème océan
  lib/db.js             Supabase (+ repli mémoire)
  setup/buildServer.js  construction idempotente du serveur
  bots/ticket/          Ocean Ticket
  bots/security/        Ocean Guard
  bots/main/            Ocean Quest
supabase/schema.sql     tables à créer
```

Pour changer un nom de salon, un rôle ou le style des polices : modifie `src/lib/layout.js` ou `theme` dans `src/lib/fonts.js`, puis `/setup`.
Évite de renommer à la main les salons clés (logs, tickets, vérification…) : les bots les retrouvent par leur nom.
