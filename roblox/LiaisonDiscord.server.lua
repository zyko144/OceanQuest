--[[
	LiaisonDiscord — Script dans ServerScriptService

	1) Quand un joueur tape /lier sur Discord, une fenêtre s'ouvre dans le jeu :
	   il clique sur l'animal affiché sur Discord et son compte est relié.
	2) Chaque joueur reçoit l'attribut « DiscordRelie » (true/false) pour lui donner une récompense.

	Installation :
	• Ce script dans ServerScriptService
	• LiaisonDiscord.client.lua en LocalScript dans StarterPlayer > StarterPlayerScripts
	• Game Settings → Security → Allow HTTP Requests : activé
	• SECRET : la même clé que le script AquariumDiscord (jamais envoyée aux joueurs)
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")

local BASE = "https://oceanquest.onrender.com/roblox/lien/"
local SECRET = "COLLE_ICI_LA_CLE_DU_BOT"
local INTERVALLE = 5 -- secondes entre deux vérifications des demandes

local remote = Instance.new("RemoteEvent")
remote.Name = "OceanLiaisonDiscord"
remote.Parent = ReplicatedStorage

local function requete(methode, chemin, corps)
	local ok, reponse = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE .. chemin,
			Method = methode,
			Headers = { ["Content-Type"] = "application/json", ["X-Ocean-Secret"] = SECRET },
			Body = corps and HttpService:JSONEncode(corps) or nil,
		})
	end)
	if not ok or not reponse.Success then
		return nil
	end
	local decode, data = pcall(HttpService.JSONDecode, HttpService, reponse.Body)
	return decode and data or nil
end

-- Le nom Discord vient de l'extérieur du jeu : on le filtre comme tout texte affiché.
local function filtrer(texte, player)
	local ok, resultat = pcall(function()
		return TextService:FilterStringAsync(texte, player.UserId):GetNonChatStringForUserAsync(player.UserId)
	end)
	return ok and resultat or "un compte Discord"
end

local affichees = {} -- [UserId] = id de la demande déjà montrée

task.spawn(function()
	while true do
		local joueurs = {}
		for _, player in ipairs(Players:GetPlayers()) do
			table.insert(joueurs, { userId = player.UserId, pseudo = player.Name, affichage = player.DisplayName })
		end
		if #joueurs > 0 then
			local data = requete("POST", "attente", { joueurs = joueurs })
			for _, demande in ipairs(data and data.demandes or {}) do
				local player = Players:GetPlayerByUserId(demande.userId)
				if player and affichees[player.UserId] ~= demande.id then
					affichees[player.UserId] = demande.id
					remote:FireClient(player, "demande", {
						id = demande.id,
						discord = filtrer(tostring(demande.discord), player),
						choix = demande.choix,
					})
				end
			end
		end
		task.wait(INTERVALLE)
	end
end)

local enCours = {}
remote.OnServerEvent:Connect(function(player, action, id, choix)
	if (action ~= "choix" and action ~= "refus") or typeof(id) ~= "string" or enCours[player] then
		return
	end
	enCours[player] = true
	local data = requete("POST", "confirmer", {
		id = id,
		userId = player.UserId,
		pseudo = player.Name,
		affichage = player.DisplayName,
		choix = typeof(choix) == "string" and choix or "",
		refus = action == "refus",
	})
	enCours[player] = nil
	affichees[player.UserId] = nil -- sans réponse du bot, la fenêtre reviendra au prochain passage
	remote:FireClient(player, "resultat", {
		ok = data ~= nil and data.resultat == "ok",
		message = data and data.message or "📡 Le bot ne répond pas, réessaie dans un instant.",
	})
	if data and data.resultat == "ok" then
		player:SetAttribute("DiscordRelie", true)
	end
end)

Players.PlayerAdded:Connect(function(player)
	local data = requete("GET", tostring(player.UserId))
	if data then
		player:SetAttribute("DiscordRelie", data.relie == true)
	end
	-- 🎁 Récompense : écoute player:GetAttributeChangedSignal("DiscordRelie") et donne pièces, titre, canne…
	--    (une seule fois, à mémoriser dans ton DataStore)
end)

Players.PlayerRemoving:Connect(function(player)
	affichees[player.UserId] = nil
	enCours[player] = nil
end)
