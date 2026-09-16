--[[
	LienDiscord — ServerScriptService > Script
	Demande au bot Discord si le joueur a relié son compte avec /lier,
	pour lui donner une récompense en jeu.

	• Game Settings → Security → Allow HTTP Requests : activé
	• SECRET : la même clé que le script AquariumDiscord (guild_config « aquarium_ig:secret »)
	• Ce script tourne côté serveur : la clé n'est jamais envoyée aux joueurs.
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local URL = "https://oceanquest.onrender.com/roblox/lien/"
local SECRET = "COLLE_ICI_LA_CLE_DU_BOT"

-- true / false, ou nil si le bot ne répond pas (Render peut mettre ~30 s à se réveiller)
local function estRelie(player)
	local ok, reponse = pcall(function()
		return HttpService:RequestAsync({
			Url = URL .. player.UserId,
			Method = "GET",
			Headers = { ["X-Ocean-Secret"] = SECRET },
		})
	end)
	if not ok or not reponse.Success then
		return nil
	end
	local decode, data = pcall(HttpService.JSONDecode, HttpService, reponse.Body)
	return decode and data.relie == true
end

local function verifier(player)
	for essai = 1, 3 do
		local relie = estRelie(player)
		if relie ~= nil then
			player:SetAttribute("DiscordRelie", relie)
			if relie then
				-- 🎁 Donne ici la récompense : pièces, titre, canne, badge…
				-- Exemple : player.leaderstats.Coins.Value += 500 (une seule fois, à sauvegarder dans ton DataStore)
			end
			return
		end
		task.wait(10 * essai)
	end
end

Players.PlayerAdded:Connect(function(player)
	task.spawn(verifier, player)
end)
