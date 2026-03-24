import fetch from "node-fetch";

let parametre;

export async function init() {

	parametre = {
        hueBridge: Config.modules.PhilipsHue.hueBridge || '',
        user: Config.modules.PhilipsHue.user || '',
    };

    if (!parametre.hueBridge || !parametre.user) {
        console.warn("Configuration Philips Hue manquante !");
        return;
    }
}

export async function action(data, callback) {

	try {
		const client = data.client;
		const command = data.action.command;

		const tblActions = {
			LightOn: () => LightOn(client),
			LightOff: () => LightOff(client),

			"10": () => Luminosite(client, 10),
			"20": () => Luminosite(client, 20),
			"30": () => Luminosite(client, 30),
			"40": () => Luminosite(client, 40),
			"50": () => Luminosite(client, 50),
			"60": () => Luminosite(client, 60),
			"70": () => Luminosite(client, 70),
			"80": () => Luminosite(client, 80),
			"90": () => Luminosite(client, 90),
			"100": () => Luminosite(client, 100),

			Dim: () => Luminosite(client, 30),
			Bright: () => Luminosite(client, 100),
			Warm: () => BlancChaud(client),

			White: () => WhiteColor(client),
			Red: () => Couleur(client, 0, "Rouge"),
			Blue: () => Couleur(client, 45000, "Bleu"),
			Yellow: () => Couleur(client, 12750, "Jaune"),
			Orange: () => Couleur(client, 5000, "Orange"),
			Green: () => Couleur(client, 22000, "Vert"),
			Violet: () => Couleur(client, 45800, "Violet"),
			Magenta: () => Couleur(client, 56000, "Magenta"),

			SunRise: () => SunRise(client),
			DiscoMode: () => DiscoMode(client),
		};

		info("PhilipsHue:", command, L.get("plugin.from"), client);

		if (tblActions[command]) {
			await tblActions[command]();
		} else {
			Avatar.speak("Commande inconnue", client);
		}

	} catch (err) {
		error(err.message);
		if (data.client) Avatar.Speech.end(data.client);
	}

	callback();
}

const tts = Config.modules.PhilipsHue.tts;

async function LightOn(client) {
	if (await isOn(client, "LightOn")) {
		Avatar.speak("La lumière est déjà allumée", client);
		return;
	}
	for (const id of getLights(client, "LightOn")) {
		await setLightState(id, { on: true, sat: 80, bri: 254, hue: 13000});
	}
	Avatar.speak(tts, client);
}


async function LightOff(client) {
	if (!(await isOn(client, "LightOff"))) {
		Avatar.speak("La lumière est déjà éteinte", client);
		return;
	}
	for (const id of getLights(client, "LightOff")) {
		await setLightState(id, { on: false });
	}
	Avatar.speak(tts, client);
}


async function Luminosite(client, valeur) {
	const bri = Math.round((valeur / 100) * 254);
	for (const id of getLights(client, "LightOn")) {
		await setLightState(id, { on: true, bri });
	}
	Avatar.speak("Luminosité ajustée", client);
}


async function WhiteColor(client){
	for (const id of getLights(client, "LightOn")) {
		await setLightState(id, {
			on: true,
			bri: 254,
			ct: 100
		});
	}
	Avatar.speak("Je mets la lumière en blanc", client);
}


async function Couleur(client, hue, colorName, sat = 254) {
	for (const id of getLights(client, "LightOn")) {
		await setLightState(id, { on: true, hue, sat });
	}
	Avatar.speak(`Je mets la lumière en ${colorName}`, client);
}


async function BlancChaud(client) {
	for (const id of getLights(client)) {
		await setLightState(id, { on: true, ct: 370 });
	}
	Avatar.speak("Lumière chaude activée", client);
}


async function SunRise(client){
	Avatar.speak("Je simule un lever de soleil", client);
	const ids = getLights(client, "LightOn");
	for (let bri = 10; bri <= 254; bri += 15) {
		for (const id of ids) {
			await setLightState(id, {
				on: true,
				bri: bri,
				hue: 8000,
				sat: 200,
				transitiontime: 40
			});
		}
		await new Promise(r => setTimeout(r, 4000));
	}
}


async function DiscoMode(client){
	Avatar.speak("Mode disco activé", client);
	const ids = getLights(client, "LightOn");
	for (let i = 0; i < 20; i++) {
		const hue = Math.floor(Math.random() * 65000);
		for (const id of ids) {
			await setLightState(id, {
				on: true,
				bri: 254,
				hue: hue,
				sat: 254,
				transitiontime: 2
			});
		}
		await new Promise(r => setTimeout(r, 800));
	}
}


function getLights(client, command){
	const ids = Config.modules.PhilipsHue.clients[client][command] 
		|| Config.modules.PhilipsHue.clients[client].LightOn;
	return Array.isArray(ids) ? ids : [ids];
}


async function isOn(client, command){
	return await getCurrentState({ action: { command } }, client);
}


async function setLightState(lightId, state) {
	try {
		const url = `http://${parametre.hueBridge}/api/${parametre.user}/lights/${lightId}/state`;
		const response = await fetch(url, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(state),
		});
		if (!response.ok) {
			console.error("HTTP error:", response.status);
			return false;
		}
		let json;
		try {
			json = await response.json();
		} catch {
			console.error("Réponse Hue invalide");
			return false;
		}
		if (Array.isArray(json)) {
			const err = json.find(r => r.error);
			if (err) {
				console.error("Hue error:", err.error.description);
				return false;
			}
		}
		return true;
	} catch (error) {
		console.error("Erreur setLightState:", error.message);
		return false;
	}
}


async function getCurrentState(data, client) {
	try {
		const lightIds = Config.modules.PhilipsHue.clients[client][data.action.command];
		const ids = Array.isArray(lightIds) ? lightIds : [lightIds];
		let states = [];
		for (const lightId of ids) {
			const url = `http://${parametre.hueBridge}/api/${parametre.user}/lights/${lightId}`;
			const response = await fetch(url);
			if (!response.ok) {
				console.error("HTTP error:", response.status);
				continue;
			}
			const json = await response.json();
			if (!json || !json.state) {
				console.error("Réponse Hue invalide");
				continue;
			}
			states.push(json.state.on);
		}
		if (states.length === 0) return null;
		return states.some(s => s === true);
	} catch (error) {
		console.error("Erreur état lampe:", error.message);
		return null;
	}
}
