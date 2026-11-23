const formatPrix = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD"
});

export function initialiserCatalogue({ campus, livres, annonces }) {
    const selecteur = document.querySelector("#campus");
    const grille = document.querySelector("#annonces");
    const message = document.querySelector("#message-catalogue");

    const campusParId = new Map(
        campus.map(etablissement => [etablissement.id, etablissement])
    );

    const livresParIsbn = new Map(
        livres.map(livre => [livre.isbn, livre])
    );

    for (const etablissement of campus) {
        selecteur.add(new Option(etablissement.nom, etablissement.id));
    }

    function afficherAnnonces() {
        const campusChoisi = selecteur.value;
        const annoncesVisibles = annonces.filter(annonce =>
            annonce.estDisponible === true &&
            campusParId.has(annonce.campusId) &&
            (campusChoisi === "" || annonce.campusId === campusChoisi)
        );

        grille.replaceChildren();

        if (annoncesVisibles.length === 0) {
            message.textContent = campusChoisi
                ? "Aucune offre n’est disponible pour ce campus."
                : "Aucune annonce n’est disponible pour le moment.";
            return;
        }

        message.textContent = annoncesVisibles.length === 1
            ? "1 annonce disponible"
            : `${annoncesVisibles.length} annonces disponibles`;

        for (const annonce of annoncesVisibles) {
            const livre = livresParIsbn.get(annonce.isbn);
            const etablissement = campusParId.get(annonce.campusId);

            grille.append(creerCarteAnnonce(annonce, livre, etablissement.nom));
        }
    }

    selecteur.value = "";
    selecteur.addEventListener("change", afficherAnnonces);
    afficherAnnonces();
    selecteur.disabled = false;
}

function creerCarteAnnonce(annonce, livre, nomCampus) {
    const titreLivre = livre?.titre ?? "Livre sans titre";

    const carte = document.createElement("article");
    carte.className = "carte-annonce";

    const contenu = document.createElement("div");
    contenu.className = "contenu-annonce";

    const prix = document.createElement("p");
    prix.className = "prix-annonce";
    prix.textContent = formatPrix.format(annonce.prixCentimes / 100);

    const titre = document.createElement("h2");
    titre.textContent = titreLivre;

    const campus = document.createElement("p");
    campus.className = "campus-annonce";
    campus.textContent = nomCampus;

    const etat = document.createElement("p");
    etat.className = "etat-annonce";
    etat.textContent = annonce.etat;

    contenu.append(prix, titre, campus, etat);
    carte.append(creerGalerieAnnonce(annonce.photos ?? [], titreLivre), contenu);

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
    image.loading = "lazy";
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