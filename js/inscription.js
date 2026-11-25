import { etatApp, notifierChangementEtat, afficherVue } from "./app.js";

/**
 * Patron Factory Method (TP2 — US #164)
 * Encapsule l'instanciation des profils Student et Professor sans couplage conditionnel.
 */
class UserCreator {
    creerUtilisateur() {
        throw new Error("La méthode creerUtilisateur() doit être implémentée par une sous-classe.");
    }
}

class StudentCreator extends UserCreator {
    creerUtilisateur({ id, nom, courriel, campusId, numeroEtudiant }) {
        return {
            id,
            nom,
            courriel,
            role: "Student",
            campusId,
            numeroEtudiant
        };
    }
}

class ProfessorCreator extends UserCreator {
    creerUtilisateur({ id, nom, courriel, campusId, departement }) {
        return {
            id,
            nom,
            courriel,
            role: "Professor",
            campusId,
            departement
        };
    }
}

const createursParRole = {
    Student: new StudentCreator(),
    Professor: new ProfessorCreator()
};

const DOMAINES_ACADEMIQUES_AUTORISES = [
    "etu.cegepmontpetit.ca",
    "cegepmontpetit.ca",
    "uqam.ca",
    "usherbrooke.ca",
    "champlaincollege.qc.ca",
    "etsmtl.ca",
    "umontreal.ca",
    "mcgill.ca",
    "concordia.ca",
    "ulaval.ca",
    "uottawa.ca"
];

let initialise = false;

export function initialiserInscription() {
    if (initialise) {
        return;
    }

    const formulaire = document.querySelector("#form-inscription");
    const selectRole = document.querySelector("#inscription-role");

    selectRole.addEventListener("change", basculerChampsRole);
    formulaire.addEventListener("submit", traiterInscription);

    document.addEventListener("campusbooks:etat-change", () => {
        remplirSelecteurCampus();
    });

    basculerChampsRole();
    remplirSelecteurCampus();
    initialise = true;
}

function remplirSelecteurCampus() {
    const selectCampus = document.querySelector("#inscription-campus");
    if (!selectCampus) {
        return;
    }

    const valeurPrecedente = selectCampus.value;
    selectCampus.replaceChildren(new Option("Sélectionner votre établissement à Longueuil", ""));

    for (const etablissement of etatApp.campus) {
        selectCampus.add(new Option(etablissement.nom, etablissement.id));
    }

    const existeEncore = etatApp.campus.some(c => c.id === valeurPrecedente);
    selectCampus.value = existeEncore ? valeurPrecedente : "";
}

function basculerChampsRole() {
    const role = document.querySelector("#inscription-role").value;
    const groupeEtudiant = document.querySelector("#groupe-numero-etudiant");
    const groupeProfesseur = document.querySelector("#groupe-departement");

    const estEtudiant = role === "Student";
    groupeEtudiant.hidden = !estEtudiant;
    groupeProfesseur.hidden = estEtudiant;

    afficherErreurChamp("numero-etudiant", "");
    afficherErreurChamp("departement", "");
}

function estCourrielAcademiqueValide(courriel) {
    const formatGeneral = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formatGeneral.test(courriel)) {
        return false;
    }

    const domaine = courriel.split("@")[1].toLowerCase();

    if (DOMAINES_ACADEMIQUES_AUTORISES.includes(domaine)) {
        return true;
    }

    // Accepte également les domaines universitaires/collégiaux standards (.edu, .qc.ca, cégeps/universités .ca)
    if (domaine.endsWith(".edu") || domaine.endsWith(".qc.ca")) {
        return true;
    }

    return domaine.endsWith(".ca") && /(cegep|college|univ|etu\.)/.test(domaine);
}

function verifierExigencesMotDePasse(motDePasse) {
    const manquantes = [];

    if (motDePasse.length < 8) {
        manquantes.push("au moins 8 caractères");
    }
    if (!/[A-Z]/.test(motDePasse)) {
        manquantes.push("au moins 1 lettre majuscule");
    }
    if (!/[0-9]/.test(motDePasse)) {
        manquantes.push("au moins 1 chiffre");
    }
    if (!/[^A-Za-z0-9\s]/.test(motDePasse)) {
        manquantes.push("au moins 1 caractère spécial (ex. !@#$%)");
    }

    return manquantes;
}

function afficherErreurChamp(nomChamp, message) {
    const elementErreur = document.querySelector(`#erreur-inscription-${nomChamp}`);
    const champ = document.querySelector(`#inscription-${nomChamp}`);

    if (elementErreur) {
        elementErreur.textContent = message;
    }
    if (champ) {
        champ.setAttribute("aria-invalid", message ? "true" : "false");
    }
}

function reinitialiserErreurs() {
    for (const champ of ["nom", "courriel", "mdp", "numero-etudiant", "departement", "campus"]) {
        afficherErreurChamp(champ, "");
    }
}

function traiterInscription(evenement) {
    evenement.preventDefault();
    reinitialiserErreurs();

    const nom = document.querySelector("#inscription-nom").value.trim();
    const courriel = document.querySelector("#inscription-courriel").value.trim();
    const motDePasse = document.querySelector("#inscription-mdp").value;
    const role = document.querySelector("#inscription-role").value;
    const numeroEtudiant = document.querySelector("#inscription-numero-etudiant").value.trim();
    const departement = document.querySelector("#inscription-departement").value.trim();
    const campusId = document.querySelector("#inscription-campus").value;
    const zoneResultat = document.querySelector("#resultat-inscription");

    let formulaireValide = true;

    // 1. Validation du nom complet
    if (nom.length < 2) {
        afficherErreurChamp("nom", "Veuillez saisir votre nom complet (minimum 2 caractères).");
        formulaireValide = false;
    }

    // 2. Validation du courriel académique et de son unicité
    if (!courriel) {
        afficherErreurChamp("courriel", "L'adresse courriel académique est obligatoire.");
        formulaireValide = false;
    } else if (!estCourrielAcademiqueValide(courriel)) {
        afficherErreurChamp(
            "courriel",
            "Courriel non académique refusé : utilisez une adresse d'établissement (ex. @etu.cegepmontpetit.ca, @uqam.ca, @usherbrooke.ca)."
        );
        formulaireValide = false;
    } else if (etatApp.utilisateurs.some(u => u.courriel.toLowerCase() === courriel.toLowerCase())) {
        afficherErreurChamp("courriel", "Ce courriel académique est déjà associé à un compte existant.");
        formulaireValide = false;
    }

    // 3. Validation du mot de passe sécurisé
    const exigencesManquantes = verifierExigencesMotDePasse(motDePasse);
    if (exigencesManquantes.length > 0) {
        afficherErreurChamp(
            "mdp",
            `Mot de passe non sécurisé — il manque : ${exigencesManquantes.join(", ")}.`
        );
        formulaireValide = false;
    }

    // 4. Validation du champ propre au rôle (Student vs Professor)
    if (role === "Student") {
        if (!/^\d{7,10}$/.test(numeroEtudiant)) {
            afficherErreurChamp(
                "numero-etudiant",
                "Le numéro d'étudiant est obligatoire (7 à 10 chiffres)."
            );
            formulaireValide = false;
        }
    } else if (role === "Professor") {
        if (departement.length < 2) {
            afficherErreurChamp(
                "departement",
                "Le département d'enseignement est obligatoire (minimum 2 caractères)."
            );
            formulaireValide = false;
        }
    }

    // 5. Validation du campus de Longueuil
    const campusTrouve = etatApp.campus.find(c => c.id === campusId);
    if (!campusTrouve) {
        afficherErreurChamp(
            "campus",
            "Veuillez sélectionner votre établissement dans la zone pilote de Longueuil."
        );
        formulaireValide = false;
    }

    if (!formulaireValide) {
        zoneResultat.hidden = false;
        zoneResultat.className = "alerte alerte-erreur";
        zoneResultat.textContent = "Le compte n'a pas été créé. Corrigez les exigences indiquées sous les champs en rouge.";
        return;
    }

    // 6. Instanciation via le Factory Method (createursParRole)
    const createur = createursParRole[role];
    if (!createur) {
        zoneResultat.hidden = false;
        zoneResultat.className = "alerte alerte-erreur";
        zoneResultat.textContent = "Rôle utilisateur non reconnu.";
        return;
    }

    const nouvelUtilisateur = createur.creerUtilisateur({
        id: `user-${Date.now()}`,
        nom,
        courriel,
        campusId: campusTrouve.id,
        numeroEtudiant,
        departement
    });

    etatApp.utilisateurs.push(nouvelUtilisateur);
    etatApp.profilActifId = nouvelUtilisateur.id;
    notifierChangementEtat();

    // 7. Confirmation visuelle et simulation du courriel de confirmation
    document.querySelector("#form-inscription").reset();
    basculerChampsRole();
    remplirSelecteurCampus();

    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-succes";
    zoneResultat.replaceChildren();

    const titreConfirmation = document.createElement("strong");
    titreConfirmation.textContent = `Compte créé avec succès pour ${nouvelUtilisateur.nom} (${nouvelUtilisateur.role}) !`;

    const detailCourriel = document.createElement("p");
    detailCourriel.textContent = `Un courriel de confirmation a été envoyé à ${nouvelUtilisateur.courriel}. Établissement rattaché : ${campusTrouve.nom}.`;

    const boutonCatalogue = document.createElement("button");
    boutonCatalogue.type = "button";
    boutonCatalogue.className = "bouton-primaire";
    boutonCatalogue.textContent = "Voir les livres de mon campus";
    boutonCatalogue.addEventListener("click", () => {
        const selectCampusCatalogue = document.querySelector("#campus");
        if (selectCampusCatalogue) {
            selectCampusCatalogue.value = campusTrouve.id;
            selectCampusCatalogue.dispatchEvent(new Event("change"));
        }
        afficherVue("catalogue");
    });

    zoneResultat.append(titreConfirmation, detailCourriel, boutonCatalogue);
}