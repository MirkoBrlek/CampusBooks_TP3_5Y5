import {
  etatApp,
  obtenirProfilActif,
  notifierChangementEtat,
  afficherVue,
} from "./app.js";

/**
 * Patron Adapter (TP2 — US #167)
 * IBookMetadataService / GoogleBooksAdapter : isole la récupération des métadonnées
 * par ISBN à partir du référentiel JSON simulé (Google Books API).
 */
class IBookMetadataService {
  rechercherParIsbn() {
    throw new Error("La méthode rechercherParIsbn() doit être implémentée.");
  }
}

class GoogleBooksAdapter extends IBookMetadataService {
  constructor(obtenirCatalogueLivres) {
    super();
    this.obtenirCatalogueLivres = obtenirCatalogueLivres;
  }

  rechercherParIsbn(isbnBrut) {
    const isbnNormalise = normaliserIsbn(isbnBrut);
    const livreTrouve = this.obtenirCatalogueLivres().find(
      (livre) => normaliserIsbn(livre.isbn) === isbnNormalise,
    );

    if (!livreTrouve) {
      return null;
    }

    // Adaptation du format externe vers le modèle interne de l'annonce
    return {
      isbn: isbnNormalise,
      titre: livreTrouve.titre ?? "",
      auteur: livreTrouve.auteur ?? "",
      edition: livreTrouve.edition ?? "",
      couverture: livreTrouve.couverture ?? "",
    };
  }
}

const serviceMetadonnees = new GoogleBooksAdapter(() => etatApp.livres);

const EXTENSIONS_AUTORISEES = [".jpg", ".jpeg", ".png"];
const TAILLE_MAX_PHOTO_OCTETS = 5 * 1024 * 1024; // 5 Mo
const LONGUEUR_MAX_DESCRIPTION = 300;
const PRIX_MIN = 0.01;
const PRIX_MAX = 500;

let initialise = false;

export function initialiserAnnonces() {
  if (initialise) {
    return;
  }

  const formulaire = document.querySelector("#form-annonce");
  const btnRechercherIsbn = document.querySelector("#btn-rechercher-isbn");
  const champIsbn = document.querySelector("#annonce-isbn");
  const champDescription = document.querySelector("#annonce-description");
  const champPhoto = document.querySelector("#annonce-photo");

  btnRechercherIsbn.addEventListener("click", () => {
    executerRechercheIsbn(true);
  });

  champIsbn.addEventListener("input", () => {
    const isbnNettoye = normaliserIsbn(champIsbn.value);
    if (isbnNettoye.length === 10 || isbnNettoye.length === 13) {
      executerRechercheIsbn(false);
    }
  });

  champDescription.addEventListener("input", mettreAJourCompteurDescription);
  champPhoto.addEventListener("change", previsualiserPhoto);
  formulaire.addEventListener("submit", traiterPublicationAnnonce);

  document.addEventListener(
    "campusbooks:etat-change",
    actualiserContexteVendeur,
  );
  document.addEventListener(
    "campusbooks:profil-change",
    actualiserContexteVendeur,
  );

  actualiserContexteVendeur();
  mettreAJourCompteurDescription();
  initialise = true;
}

function normaliserIsbn(valeur) {
  return String(valeur ?? "")
    .replace(/[-\s]/g, "")
    .trim();
}

function estIsbnValide(isbnNormalise) {
  return /^(\d{10}|\d{13})$/.test(isbnNormalise);
}

function lireFichierEnDataUrl(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result);
    lecteur.onerror = () =>
      reject(new Error("Impossible de lire le fichier image."));
    lecteur.readAsDataURL(fichier);
  });
}

function actualiserContexteVendeur() {
  const bandeau = document.querySelector("#bandeau-vendeur-annonce");
  if (!bandeau) {
    return;
  }

  const profil = obtenirProfilActif();
  if (!profil) {
    bandeau.textContent =
      "Aucun utilisateur connecté : sélectionnez ou créez un profil avant de publier.";
    return;
  }

  const campus = etatApp.campus.find((c) => c.id === profil.campusId);
  const nomCampus = campus ? campus.nom : profil.campusId;
  bandeau.textContent = `Vendeur connecté : ${profil.nom} (${profil.role}) — Campus de publication : ${nomCampus}`;
}

function mettreAJourCompteurDescription() {
  const champDescription = document.querySelector("#annonce-description");
  const compteur = document.querySelector("#compteur-description");
  if (!champDescription || !compteur) {
    return;
  }

  const longueur = champDescription.value.length;
  compteur.textContent = `${longueur} / ${LONGUEUR_MAX_DESCRIPTION} caractères`;
  compteur.classList.toggle(
    "compteur-depasse",
    longueur > LONGUEUR_MAX_DESCRIPTION,
  );
}

function executerRechercheIsbn(afficherErreurSiInvalide) {
  const champIsbn = document.querySelector("#annonce-isbn");
  const statutIsbn = document.querySelector("#statut-isbn");
  const champTitre = document.querySelector("#annonce-titre");
  const champAuteur = document.querySelector("#annonce-auteur");

  const isbnNormalise = normaliserIsbn(champIsbn.value);
  afficherErreurChamp("isbn", "");

  if (!estIsbnValide(isbnNormalise)) {
    statutIsbn.hidden = true;
    if (afficherErreurSiInvalide) {
      afficherErreurChamp(
        "isbn",
        "Format d'ISBN invalide : saisissez exactement 10 ou 13 chiffres.",
      );
    }
    return;
  }

  const metadonnees = serviceMetadonnees.rechercherParIsbn(isbnNormalise);

  if (metadonnees) {
    champTitre.value = metadonnees.titre;
    champAuteur.value = metadonnees.auteur;
    afficherErreurChamp("titre", "");
    afficherErreurChamp("auteur", "");

    statutIsbn.hidden = false;
    statutIsbn.className = "alerte alerte-info";
    statutIsbn.textContent = `Livre reconnu via Google Books (simulé) : « ${metadonnees.titre} » — ${metadonnees.auteur}${metadonnees.edition ? ` (${metadonnees.edition})` : ""}.`;
  } else {
    statutIsbn.hidden = false;
    statutIsbn.className = "alerte alerte-avertissement";
    statutIsbn.textContent =
      "ISBN introuvable dans le catalogue Google Books simulé. Vous pouvez saisir le titre et l'auteur manuellement ci-dessous.";
  }
}

async function previsualiserPhoto() {
  const champPhoto = document.querySelector("#annonce-photo");
  const apercuConteneur = document.querySelector("#apercu-photo-annonce");
  const fichier = champPhoto.files?.[0];

  afficherErreurChamp("photo", "");
  apercuConteneur.replaceChildren();
  apercuConteneur.hidden = true;

  if (!fichier) {
    return;
  }

  const erreurPhoto = validerFichierPhoto(fichier);
  if (erreurPhoto) {
    afficherErreurChamp("photo", erreurPhoto);
    return;
  }

  const dataUrl = await lireFichierEnDataUrl(fichier);

  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = `Aperçu de ${fichier.name}`;

  const legende = document.createElement("span");
  legende.textContent = `${fichier.name} (${(fichier.size / (1024 * 1024)).toFixed(2)} Mo)`;

  apercuConteneur.append(image, legende);
  apercuConteneur.hidden = false;
}

function validerFichierPhoto(fichier) {
  if (!fichier) {
    return "Veuillez téléverser une photo du manuel (.jpg ou .png, max 5 Mo).";
  }

  const nomMinuscule = fichier.name.toLowerCase();
  const extensionValide = EXTENSIONS_AUTORISEES.some((ext) =>
    nomMinuscule.endsWith(ext),
  );

  if (!extensionValide) {
    return "Format de fichier non supporté : téléversez uniquement une image .jpg ou .png.";
  }

  if (fichier.size > TAILLE_MAX_PHOTO_OCTETS) {
    return "Fichier trop volumineux : la taille maximale autorisée est de 5 Mo.";
  }

  return "";
}

function afficherErreurChamp(nomChamp, message) {
  const elementErreur = document.querySelector(`#erreur-annonce-${nomChamp}`);
  const champ = document.querySelector(`#annonce-${nomChamp}`);

  if (elementErreur) {
    elementErreur.textContent = message;
  }
  if (champ) {
    champ.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function reinitialiserErreurs() {
  for (const champ of [
    "isbn",
    "titre",
    "auteur",
    "prix",
    "etat",
    "description",
    "photo",
  ]) {
    afficherErreurChamp(champ, "");
  }
}

async function traiterPublicationAnnonce(evenement) {
  evenement.preventDefault();
  reinitialiserErreurs();

  const zoneResultat = document.querySelector("#resultat-annonce");
  const profil = obtenirProfilActif();

  if (!profil) {
    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-erreur";
    zoneResultat.textContent =
      "Vous devez être connecté avec un profil actif pour publier une annonce.";
    return;
  }

  const isbnNormalise = normaliserIsbn(
    document.querySelector("#annonce-isbn").value,
  );
  const titre = document.querySelector("#annonce-titre").value.trim();
  const auteur = document.querySelector("#annonce-auteur").value.trim();
  const prixBrut = document.querySelector("#annonce-prix").value.trim();
  const etat = document.querySelector("#annonce-etat").value;
  const description = document
    .querySelector("#annonce-description")
    .value.trim();
  const pointRemise = document.querySelector("#annonce-remise").value.trim();
  const fichierPhoto =
    document.querySelector("#annonce-photo").files?.[0] ?? null;

  let formulaireValide = true;

  if (!estIsbnValide(isbnNormalise)) {
    afficherErreurChamp(
      "isbn",
      "L'ISBN est obligatoire et doit contenir exactement 10 ou 13 chiffres.",
    );
    formulaireValide = false;
  }

  if (titre.length < 2) {
    afficherErreurChamp(
      "titre",
      "Le titre du manuel est obligatoire (minimum 2 caractères).",
    );
    formulaireValide = false;
  }

  if (auteur.length < 2) {
    afficherErreurChamp(
      "auteur",
      "Le nom de l'auteur est obligatoire (minimum 2 caractères).",
    );
    formulaireValide = false;
  }

  const prixNumerique = Number.parseFloat(prixBrut);
  if (prixBrut === "" || Number.isNaN(prixNumerique)) {
    afficherErreurChamp(
      "prix",
      "Veuillez indiquer un prix de vente valide en dollars.",
    );
    formulaireValide = false;
  } else if (prixNumerique < PRIX_MIN || prixNumerique > PRIX_MAX) {
    afficherErreurChamp(
      "prix",
      "Le prix doit être compris entre 0,01 $ et 500,00 $.",
    );
    formulaireValide = false;
  }

  const etatsValides = ["NEUF", "TRES_BON", "BON", "ACCEPTABLE"];
  if (!etatsValides.includes(etat)) {
    afficherErreurChamp(
      "etat",
      "Veuillez sélectionner l'état physique du manuel.",
    );
    formulaireValide = false;
  }

  if (description.length > LONGUEUR_MAX_DESCRIPTION) {
    afficherErreurChamp(
      "description",
      `La description dépasse la limite de ${LONGUEUR_MAX_DESCRIPTION} caractères (${description.length} saisis).`,
    );
    formulaireValide = false;
  }

  const erreurPhoto = validerFichierPhoto(fichierPhoto);
  if (erreurPhoto) {
    afficherErreurChamp("photo", erreurPhoto);
    formulaireValide = false;
  }

  if (!formulaireValide) {
    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-erreur";
    zoneResultat.textContent =
      "L'annonce n'a pas été publiée. Corrigez les erreurs indiquées sous les champs concernés.";
    return;
  }

  const dataUrlPhoto = await lireFichierEnDataUrl(fichierPhoto);
  const prixArrondi = Math.round(prixNumerique * 100) / 100;

  const nouvelleAnnonce = {
    id: `annonce-${Date.now()}`,
    isbn: isbnNormalise,
    titre,
    auteur,
    vendeurId: profil.id,
    campusId: profil.campusId,
    prix: prixArrondi,
    etat,
    description,
    pointRemise: pointRemise || "À convenir sur le campus",
    photoNom: fichierPhoto.name,
    photos: [dataUrlPhoto],
    estDisponible: true,
  };

  etatApp.annonces.unshift(nouvelleAnnonce);
  notifierChangementEtat();

  document.querySelector("#form-annonce").reset();
  document.querySelector("#statut-isbn").hidden = true;
  const apercu = document.querySelector("#apercu-photo-annonce");
  apercu.replaceChildren();
  apercu.hidden = true;
  mettreAJourCompteurDescription();

  const campusObj = etatApp.campus.find((c) => c.id === profil.campusId);
  const nomCampus = campusObj ? campusObj.nom : profil.campusId;

  zoneResultat.hidden = false;
  zoneResultat.className = "alerte alerte-succes";
  zoneResultat.replaceChildren();

  const titreConfirmation = document.createElement("strong");
  titreConfirmation.textContent = `Annonce publiée avec succès : « ${nouvelleAnnonce.titre} » (${prixArrondi.toFixed(2)} $) !`;

  const detailConfirmation = document.createElement("p");
  detailConfirmation.textContent = `Votre manuel est maintenant visible dans le catalogue du campus ${nomCampus}.`;

  const boutonVoirCatalogue = document.createElement("button");
  boutonVoirCatalogue.type = "button";
  boutonVoirCatalogue.className = "bouton-primaire";
  boutonVoirCatalogue.textContent = "Voir mon annonce dans le catalogue";
  boutonVoirCatalogue.addEventListener("click", () => {
    const selectCampus = document.querySelector("#campus");
    if (selectCampus) {
      selectCampus.value = profil.campusId;
      selectCampus.dispatchEvent(new Event("change"));
    }
    afficherVue("catalogue");
  });

  zoneResultat.append(
    titreConfirmation,
    detailConfirmation,
    boutonVoirCatalogue,
  );
}
