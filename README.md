# 🌊 Ocean Quest — Bots Discord

Serveur Discord complet pour le jeu Roblox **Ocean Quest** : salons au style océan, rôles marins, tickets, sécurité, niveaux, mini-jeu de pêche et giveaways.

| Bot | Rôle | Variable |
| --- | --- | --- |
| 🎫 **Ocean Ticket** | Centre des tickets (formulaires, prise en charge, transcripts HTML, notes) | `TICKET_BOT_TOKEN` |
| 🛡️ **Ocean Guard** | Vérification captcha, anti-raid, anti-spam/arnaques/pubs, anti-nuke, logs, modération | `SECURITY_BOT_TOKEN` |
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

- **Pêche & niveaux** : `/pecher` `/aquarium` `/rang` `/classement`
- **Communauté** : `/suggestion` `/jouer` `/serveur` `/aide`
- **Tickets** : `/ticket fermer|ajouter|retirer|renommer|panneau|stats`
- **Modération** : `/avertir` `/avertissements` `/retirer-avertissement` `/effacer-avertissements` `/sourdine` `/fin-sourdine` `/expulser` `/bannir` `/debannir` `/purge` `/verrouiller` `/deverrouiller` `/lenteur` `/confinement`
- **Administration** : `/setup` `/annonce` `/giveaway lancer|terminer|relancer` `/suggestion-statut`

## 🛠️ Développement local

```bash
npm install
npm run check   # vérifie tokens, intents, serveur et Supabase
npm run setup   # crée rôles, catégories et salons
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
