const formatPrix = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const libellesEtat = {
  NEUF: "Neuf",
  TRES_BON: "Très bon état",
  BON: "Bon état",
  ACCEPTABLE: "État acceptable",
};

let etatCourant = { campus: [], livres: [], annonces: [] };
let initialise = false;

export function initialiserCatalogue() {
  if (initialise) {
    return;
  }

  const selecteur = document.querySelector("#campus");
  selecteur.addEventListener("change", afficherAnnonces);
  initialise = true;
}

export function mettreAJourCatalogue({ campus, livres, annonces }) {
  etatCourant = { campus, livres, annonces };

  const selecteur = document.querySelector("#campus");
  const selectionPrecedente = selecteur.value;

  selecteur.replaceChildren(new Option("Tous les campus", ""));

  for (const etablissement of campus) {
    selecteur.add(new Option(etablissement.nom, etablissement.id));
  }

  const campusExiste = campus.some((c) => c.id === selectionPrecedente);
  selecteur.value = campusExiste ? selectionPrecedente : "";
  selecteur.disabled = false;

  afficherAnnonces();
}

function afficherAnnonces() {
  const selecteur = document.querySelector("#campus");
  const grille = document.querySelector("#annonces");
  const message = document.querySelector("#message-catalogue");

  const campusParId = new Map(
    etatCourant.campus.map((etablissement) => [
      etablissement.id,
      etablissement,
    ]),
  );

  const livresParIsbn = new Map(
    etatCourant.livres.map((livre) => [livre.isbn, livre]),
  );

  const campusChoisi = selecteur.value;
  const annoncesVisibles = etatCourant.annonces.filter(
    (annonce) =>
      annonce.estDisponible === true &&
      campusParId.has(annonce.campusId) &&
      (campusChoisi === "" || annonce.campusId === campusChoisi),
  );

  grille.replaceChildren();

  if (annoncesVisibles.length === 0) {
    message.textContent = campusChoisi
      ? "Aucune offre n’est disponible pour ce campus."
      : "Aucune annonce n’est disponible pour le moment.";
    return;
  }

  message.textContent =
    annoncesVisibles.length === 1
      ? "1 annonce disponible"
      : `${annoncesVisibles.length} annonces disponibles`;

  for (const annonce of annoncesVisibles) {
    const livre = livresParIsbn.get(annonce.isbn);
    const etablissement = campusParId.get(annonce.campusId);

    grille.append(creerCarteAnnonce(annonce, livre, etablissement.nom));
  }
}

function obtenirMontant(annonce) {
  if (typeof annonce.prix === "number") {
    return annonce.prix;
  }
  return (annonce.prixCentimes ?? 0) / 100;
}

function obtenirPhotos(annonce, livre) {
  if (Array.isArray(annonce.photos) && annonce.photos.length > 0) {
    return annonce.photos;
  }
  if (annonce.photoNom) {
    return [`./images/annonces/${annonce.photoNom}`];
  }
  if (livre?.couverture) {
    return [`./${livre.couverture}`];
  }
  return [];
}

function creerCarteAnnonce(annonce, livre, nomCampus) {
  const titreLivre = annonce.titre ?? livre?.titre ?? "Livre sans titre";
  const auteurLivre = annonce.auteur ?? livre?.auteur ?? "";

  const carte = document.createElement("article");
  carte.className = "carte-annonce";
  carte.dataset.annonceId = annonce.id;

  const contenu = document.createElement("div");
  contenu.className = "contenu-annonce";

  const prix = document.createElement("p");
  prix.className = "prix-annonce";
  prix.textContent = formatPrix.format(obtenirMontant(annonce));

  const titre = document.createElement("h2");
  titre.textContent = titreLivre;

  contenu.append(prix, titre);

  if (auteurLivre) {
    const auteur = document.createElement("p");
    auteur.className = "auteur-annonce";
    auteur.textContent = auteurLivre;
    contenu.append(auteur);
  }

  const campus = document.createElement("p");
  campus.className = "campus-annonce";
  campus.textContent = nomCampus;

  const etat = document.createElement("p");
  etat.className = "etat-annonce";
  etat.textContent = libellesEtat[annonce.etat] ?? annonce.etat;

  contenu.append(campus, etat);

  if (annonce.pointRemise) {
    const remise = document.createElement("p");
    remise.className = "remise-annonce";
    remise.textContent = `Remise : ${annonce.pointRemise}`;
    contenu.append(remise);
  }

  const boutonAcheter = document.createElement("button");
  boutonAcheter.type = "button";
  boutonAcheter.className = "bouton-primaire bouton-acheter-catalogue";
  boutonAcheter.textContent = "Acheter ce livre";
  boutonAcheter.addEventListener("click", () => {
    document.dispatchEvent(
      new CustomEvent("campusbooks:selectionner-annonce-paiement", {
        detail: { annonceId: annonce.id },
      }),
    );
  });

  contenu.append(boutonAcheter);

  carte.append(
    creerGalerieAnnonce(obtenirPhotos(annonce, livre), titreLivre),
    contenu,
  );
  return carte;
}

function creerGalerieAnnonce(photos, titreLivre) {
  const galerie = document.createElement("div");
  galerie.className = "galerie-annonce";

  const remplacement = document.createElement("p");
  remplacement.className = "photo-indisponible";
  remplacement.textContent = "Aucune photo disponible";
  galerie.append(remplacement);

  if (photos.length === 0) {
    return galerie;
  }

  const image = document.createElement("img");
  image.hidden = true;

  image.addEventListener("load", () => {
    image.hidden = false;
    remplacement.hidden = true;
  });

  image.addEventListener("error", () => {
    image.hidden = true;
    remplacement.hidden = false;
  });

  const compteur = document.createElement("span");
  compteur.className = "compteur-photos";
  compteur.setAttribute("aria-live", "polite");

  let indexPhoto = 0;

  function afficherPhoto() {
    image.alt = `${titreLivre}, photo ${indexPhoto + 1} sur ${photos.length}`;
    image.src = photos[indexPhoto];
    compteur.textContent = `${indexPhoto + 1} / ${photos.length}`;
  }

  galerie.append(image);

  if (photos.length > 1) {
    const precedente = document.createElement("button");
    precedente.type = "button";
    precedente.className = "photo-precedente";
    precedente.textContent = "‹";
    precedente.setAttribute("aria-label", `Photo précédente de ${titreLivre}`);

    precedente.addEventListener("click", () => {
      indexPhoto = (indexPhoto - 1 + photos.length) % photos.length;
      afficherPhoto();
    });

    const suivante = document.createElement("button");
    suivante.type = "button";
    suivante.className = "photo-suivante";
    suivante.textContent = "›";
    suivante.setAttribute("aria-label", `Photo suivante de ${titreLivre}`);

    suivante.addEventListener("click", () => {
      indexPhoto = (indexPhoto + 1) % photos.length;
      afficherPhoto();
    });

    galerie.append(precedente, suivante, compteur);
  }

  afficherPhoto();
  return galerie;
}
