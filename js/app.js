import { initialiserCatalogue } from "./catalogue.js";

async function demarrerApplication() {
    const message = document.querySelector("#message-catalogue");

    try {
        const urlDonnees = new URL("../data/normal.json", import.meta.url);
        const reponse = await fetch(urlDonnees);

        if (!reponse.ok) {
            throw new Error(`Chargement des données impossible (${reponse.status})`);
        }

        const donnees = await reponse.json();
        initialiserCatalogue(donnees);
    } catch (erreur) {
        message.textContent = "Impossible de charger les annonces.";
        console.error(erreur);
    }
}

demarrerApplication();