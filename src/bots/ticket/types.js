// Types de tickets proposés dans le panneau. `staff` = niveau minimum qui voit le ticket.
// Chaque question devient un champ du formulaire (5 max, libellé 45 caractères max).

const roblox = (required = true) => ({ id: 'roblox', label: 'Ton pseudo Roblox', style: 'short', required, max: 40 });

module.exports = [
  {
    id: 'support', emoji: '🛟', label: 'Aide générale', staff: 'helper',
    description: 'Une question sur le jeu, le serveur ou ton compte',
    questions: [
      roblox(false),
      { id: 'details', label: 'Explique ta demande', style: 'paragraph', required: true, max: 1000 },
    ],
  },
  {
    id: 'bug', emoji: '🐛', label: 'Signaler un bug', staff: 'helper',
    description: 'Un poisson qui traverse les murs ? Une canne buggée ?',
    questions: [
      roblox(true),
      { id: 'platform', label: 'Plateforme (PC / Mobile / Console)', style: 'short', required: true, max: 30 },
      { id: 'details', label: 'Que s’est-il passé ?', style: 'paragraph', required: true, max: 1000 },
      { id: 'steps', label: 'Comment reproduire le bug ?', style: 'paragraph', required: false, max: 600 },
    ],
  },
  {
    id: 'report', emoji: '🚨', label: 'Signaler un joueur', staff: 'moderator',
    description: 'Triche, arnaque lors d’un échange, insultes…',
    questions: [
      { id: 'target', label: 'Pseudo Roblox / Discord du joueur', style: 'short', required: true, max: 80 },
      { id: 'details', label: 'Que s’est-il passé ?', style: 'paragraph', required: true, max: 1000 },
      { id: 'proof', label: 'Preuves (liens vidéo / images)', style: 'paragraph', required: false, max: 500 },
    ],
  },
  {
    id: 'purchase', emoji: '💰', label: 'Achats & Robux', staff: 'manager',
    description: 'Game pass, objet ou pack non reçu',
    questions: [
      roblox(true),
      { id: 'item', label: 'Objet / Game Pass concerné', style: 'short', required: true, max: 100 },
      { id: 'details', label: 'Date de l’achat et détails', style: 'paragraph', required: true, max: 800 },
    ],
  },
  {
    id: 'appeal', emoji: '⚖️', label: 'Contester une sanction', staff: 'moderator',
    description: 'Tu penses avoir été sanctionné à tort',
    questions: [
      roblox(false),
      { id: 'sanction', label: 'Sanction reçue (et date)', style: 'short', required: true, max: 100 },
      { id: 'details', label: 'Pourquoi devrait-on la lever ?', style: 'paragraph', required: true, max: 1000 },
    ],
  },
  {
    id: 'partner', emoji: '🤝', label: 'Partenariat & Créateurs', staff: 'manager',
    description: 'YouTubeurs, TikTokeurs, serveurs partenaires',
    questions: [
      { id: 'links', label: 'Tes liens (chaîne, serveur…)', style: 'paragraph', required: true, max: 400 },
      { id: 'audience', label: 'Taille de ta communauté', style: 'short', required: false, max: 60 },
      { id: 'details', label: 'Ta proposition', style: 'paragraph', required: true, max: 1000 },
    ],
  },
  {
    id: 'staff', emoji: '⚓', label: 'Candidature Staff', staff: 'admin',
    description: 'Rejoindre l’équipage des Garde-Côtes',
    questions: [
      { id: 'age', label: 'Ton âge', style: 'short', required: true, max: 3 },
      roblox(true),
      { id: 'availability', label: 'Tes disponibilités', style: 'short', required: true, max: 100 },
      { id: 'experience', label: 'Ton expérience de modération', style: 'paragraph', required: true, max: 800 },
      { id: 'motivation', label: 'Pourquoi toi ?', style: 'paragraph', required: true, max: 1000 },
    ],
  },
];
