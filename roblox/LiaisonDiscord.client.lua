--[[
	LiaisonDiscordClient — LocalScript dans StarterPlayer > StarterPlayerScripts
	Dessine la fenêtre « Relier ton Discord » (aucune interface à créer dans Studio).
	À installer avec LiaisonDiscord.server.lua.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local joueur = Players.LocalPlayer
local remote = ReplicatedStorage:WaitForChild("OceanLiaisonDiscord")

local OCEAN = Color3.fromRGB(7, 24, 47)
local OCEAN_CLAIR = Color3.fromRGB(11, 35, 68)
local LAGON = Color3.fromRGB(0, 180, 216)
local ECUME = Color3.fromRGB(202, 240, 248)
local CORAIL = Color3.fromRGB(239, 71, 111)

local gui

local function creer(classe, proprietes, parent)
	local objet = Instance.new(classe)
	for nom, valeur in pairs(proprietes) do
		objet[nom] = valeur
	end
	objet.Parent = parent
	return objet
end

local function arrondir(objet, rayon)
	creer("UICorner", { CornerRadius = UDim.new(0, rayon) }, objet)
end

local function texte(parent, proprietes, tailleMax)
	local label = creer("TextLabel", {
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamMedium,
		TextColor3 = ECUME,
		TextScaled = true,
		TextWrapped = true,
	}, parent)
	for nom, valeur in pairs(proprietes) do
		label[nom] = valeur
	end
	creer("UITextSizeConstraint", { MaxTextSize = tailleMax or 22 }, label)
	return label
end

local function fermer()
	if gui then
		gui:Destroy()
		gui = nil
	end
end

local function fenetre(titre, hauteur)
	fermer()
	gui = creer("ScreenGui", { Name = "LiaisonDiscord", ResetOnSpawn = false, IgnoreGuiInset = true, DisplayOrder = 50 }, joueur:WaitForChild("PlayerGui"))
	creer("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.45 }, gui)
	local cadre = creer("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.92, 0, 0, hauteur),
		BackgroundColor3 = OCEAN,
	}, gui)
	creer("UISizeConstraint", { MaxSize = Vector2.new(460, 420) }, cadre)
	creer("UIStroke", { Color = LAGON, Thickness = 2 }, cadre)
	arrondir(cadre, 18)
	texte(cadre, { Position = UDim2.new(0, 20, 0, 16), Size = UDim2.new(1, -40, 0, 38), Font = Enum.Font.FredokaOne, Text = titre, TextColor3 = Color3.new(1, 1, 1) }, 32)
	return cadre
end

local function bouton(parent, proprietes)
	local b = creer("TextButton", { AutoButtonColor = true, Font = Enum.Font.GothamBold, TextColor3 = Color3.new(1, 1, 1), TextScaled = true }, parent)
	for nom, valeur in pairs(proprietes) do
		b[nom] = valeur
	end
	arrondir(b, 14)
	return b
end

remote.OnClientEvent:Connect(function(genre, data)
	if genre == "demande" then
		local cadre = fenetre("🔗 Relier ton Discord", 340)
		texte(cadre, {
			Position = UDim2.new(0, 20, 0, 62),
			Size = UDim2.new(1, -40, 0, 70),
			Text = "« " .. data.discord .. " » veut se relier à ton compte.\nSi c'est toi, clique sur l'animal affiché sur Discord :",
		})

		local rangee = creer("Frame", { BackgroundTransparency = 1, Position = UDim2.new(0, 20, 0, 145), Size = UDim2.new(1, -40, 0, 100) }, cadre)
		creer("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			Padding = UDim.new(0, 14),
		}, rangee)
		for _, emoji in ipairs(data.choix) do
			local b = bouton(rangee, { Size = UDim2.new(0, 96, 0, 96), BackgroundColor3 = OCEAN_CLAIR, Text = emoji })
			creer("UIStroke", { Color = LAGON, Thickness = 1, Transparency = 0.4 }, b)
			b.Activated:Connect(function()
				fenetre("⏳ Un instant…", 110)
				remote:FireServer("choix", data.id, emoji)
			end)
		end

		local non = bouton(cadre, {
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 268),
			Size = UDim2.new(0, 230, 0, 46),
			BackgroundColor3 = CORAIL,
			Text = "Ce n'est pas moi",
		})
		non.Activated:Connect(function()
			fenetre("⏳ Un instant…", 110)
			remote:FireServer("refus", data.id)
		end)
	elseif genre == "resultat" then
		local cadre = fenetre(data.ok and "🎉 C'est relié !" or "Oups…", 190)
		texte(cadre, { Position = UDim2.new(0, 20, 0, 66), Size = UDim2.new(1, -40, 0, 100), Text = data.message })
		task.delay(5, fermer)
	end
end)
