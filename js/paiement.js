import {
  etatApp,
  obtenirProfilActif,
  notifierChangementEtat,
  afficherVue,
} from "./app.js";

/**
 * Patron Adapter (TP2 — US #160)
 * IPaymentGateway / StripePaymentAdapter : isole le traitement des paiements
 * simulés (validation carte, cartes refusées et pannes Stripe configurées dans le JSON).
 */
class IPaymentGateway {
  autoriserPaiement() {
    throw new Error("La méthode autoriserPaiement() doit être implémentée.");
  }
}

class StripePaymentAdapter extends IPaymentGateway {
  constructor(obtenirConfigSimulation) {
    super();
    this.obtenirConfigSimulation = obtenirConfigSimulation;
  }

  autoriserPaiement({ numeroCarte, titulaire, expiration, cvc, montant }) {
    const config = this.obtenirConfigSimulation() ?? {};

    if (config.simulerPanneStripe === true) {
      return {
        succes: false,
        codeErreur: "SERVICE_INDISPONIBLE",
        message:
          "Le service de paiement Stripe est temporairement indisponible. Aucun montant n'a été prélevé. Veuillez réessayer plus tard.",
      };
    }

    const numeroNormalise = normaliserNumeroCarte(numeroCarte);
    const cartesRefusees = (config.cartesRefusees ?? []).map((entree) =>
      normaliserNumeroCarte(
        typeof entree === "string" ? entree : entree?.numero,
      ),
    );

    if (cartesRefusees.includes(numeroNormalise)) {
      return {
        succes: false,
        codeErreur: "CARTE_REFUSEE",
        message:
          "Paiement refusé par l'émetteur de la carte (fonds insuffisants ou carte bloquée). Veuillez utiliser une autre carte.",
      };
    }

    if (!titulaire || !expiration || !cvc || montant <= 0) {
      return {
        succes: false,
        codeErreur: "DONNEES_INVALIDES",
        message: "Les informations de paiement transmises sont incomplètes.",
      };
    }

    return {
      succes: true,
      referenceStripe: `pi_sim_${Date.now().toString(36)}`,
      derniersQuatreChiffres: numeroNormalise.slice(-4),
    };
  }
}

const passerellePaiement = new StripePaymentAdapter(
  () => etatApp.simulationPaiement,
);

const formatPrix = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const LIBELLES_STATUT = {
  EN_SEQUESTRE: "En séquestre",
  SEQUESTRE: "En séquestre",
  EN_ATTENTE: "En séquestre",
  LIBEREE: "Fonds libérés (terminée)",
  COMPLETEE: "Fonds libérés (terminée)",
  REMBOURSEE: "Remboursée",
  ANNULEE: "Annulée / Remboursée",
  ECHOUEE: "Échouée",
};

let initialise = false;

export function initialiserPaiement() {
  if (initialise) {
    return;
  }

  const formulaire = document.querySelector("#form-paiement");
  const selectAnnonce = document.querySelector("#paiement-annonce");
  const champCarte = document.querySelector("#paiement-carte");
  const champExpiration = document.querySelector("#paiement-expiration");

  if (!formulaire || !selectAnnonce) {
    return;
  }

  selectAnnonce.addEventListener("change", () => {
    afficherErreurChamp("annonce", "");
    actualiserRecapitulatif();
  });

  champCarte.addEventListener("input", () => {
    const chiffres = normaliserNumeroCarte(champCarte.value).slice(0, 16);
    champCarte.value = chiffres.replace(/(\d{4})(?=\d)/g, "$1 ");
  });

  champExpiration.addEventListener("input", () => {
    const chiffres = champExpiration.value.replace(/\D/g, "").slice(0, 4);
    champExpiration.value =
      chiffres.length > 2
        ? `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`
        : chiffres;
  });

  formulaire.addEventListener("submit", traiterPaiement);

  document.addEventListener("campusbooks:etat-change", actualiserVuePaiement);
  document.addEventListener("campusbooks:profil-change", actualiserVuePaiement);
  document.addEventListener(
    "campusbooks:selectionner-annonce-paiement",
    (evenement) => {
      const annonceId = evenement.detail?.annonceId;
      actualiserVuePaiement();
      if (annonceId) {
        selectAnnonce.value = annonceId;
        actualiserRecapitulatif();
      }
      afficherVue("paiement");
    },
  );

  actualiserVuePaiement();
  initialise = true;
}

function normaliserNumeroCarte(valeur) {
  return String(valeur ?? "")
    .replace(/[\s-]/g, "")
    .trim();
}

function estDateExpirationValide(valeur) {
  const correspondance = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(
    String(valeur ?? "").trim(),
  );
  if (!correspondance) {
    return { valide: false, raison: "Format attendu : MM/AA (ex. 08/28)." };
  }

  const mois = Number.parseInt(correspondance[1], 10);
  const annee = 2000 + Number.parseInt(correspondance[2], 10);
  const maintenant = new Date();
  const anneeCourante = maintenant.getFullYear();
  const moisCourant = maintenant.getMonth() + 1;

  if (
    annee < anneeCourante ||
    (annee === anneeCourante && mois < moisCourant)
  ) {
    return { valide: false, raison: "Cette carte bancaire est expirée." };
  }

  return { valide: true, raison: "" };
}

function obtenirMontantAnnonce(annonce) {
  if (!annonce) {
    return 0;
  }
  if (typeof annonce.prix === "number") {
    return annonce.prix;
  }
  return (annonce.prixCentimes ?? 0) / 100;
}

function obtenirMontantTransaction(tx) {
  if (typeof tx.montant === "number") {
    return tx.montant;
  }
  return (tx.montantCentimes ?? 0) / 100;
}

function obtenirTitreAnnonce(annonce) {
  if (!annonce) {
    return "Manuel inconnu";
  }
  if (annonce.titre) {
    return annonce.titre;
  }
  const livre = etatApp.livres.find((l) => l.isbn === annonce.isbn);
  return livre?.titre ?? "Manuel sans titre";
}

function obtenirNomUtilisateur(utilisateurId) {
  const utilisateur = etatApp.utilisateurs.find((u) => u.id === utilisateurId);
  return utilisateur
    ? utilisateur.nom
    : (utilisateurId ?? "Utilisateur inconnu");
}

function obtenirNomCampus(campusId) {
  const campus = etatApp.campus.find((c) => c.id === campusId);
  return campus ? campus.nom : (campusId ?? "");
}

function estEnSequestre(statut) {
  return (
    statut === "EN_SEQUESTRE" ||
    statut === "SEQUESTRE" ||
    statut === "EN_ATTENTE"
  );
}

function actualiserVuePaiement() {
  actualiserBandeauAcheteur();
  actualiserIndicateurSimulation();
  remplirSelecteurAnnonces();
  actualiserRecapitulatif();
  afficherTransactions();
}

function actualiserBandeauAcheteur() {
  const bandeau = document.querySelector("#bandeau-acheteur-paiement");
  if (!bandeau) {
    return;
  }

  const profil = obtenirProfilActif();
  if (!profil) {
    bandeau.textContent =
      "Aucun utilisateur connecté : sélectionnez ou créez un profil avant de procéder au paiement.";
    return;
  }

  const nomCampus = obtenirNomCampus(profil.campusId);
  bandeau.textContent = `Acheteur connecté : ${profil.nom} (${profil.role}) — Campus : ${nomCampus}`;
}

function actualiserIndicateurSimulation() {
  const bandeauSim = document.querySelector("#info-simulation-paiement");
  if (!bandeauSim) {
    return;
  }

  const config = etatApp.simulationPaiement ?? {};
  const messages = [];

  if (config.simulerPanneStripe) {
    messages.push(
      "Panne Stripe simulée active (tous les paiements échoueront).",
    );
  }

  if (
    Array.isArray(config.cartesRefusees) &&
    config.cartesRefusees.length > 0
  ) {
    const numeros = config.cartesRefusees
      .map((c) => (typeof c === "string" ? c : c?.numero))
      .filter(Boolean);
    if (numeros.length > 0) {
      messages.push(
        `Carte(s) configurée(s) comme refusée(s) : ${numeros.join(", ")}.`,
      );
    }
  }

  if (messages.length === 0) {
    bandeauSim.hidden = true;
    return;
  }

  bandeauSim.hidden = false;
  bandeauSim.className = config.simulerPanneStripe
    ? "alerte alerte-avertissement"
    : "alerte alerte-info";
  bandeauSim.textContent = `Mode simulation (${etatApp.fichierActif}) — ${messages.join(" ")}`;
}

function remplirSelecteurAnnonces() {
  const selectAnnonce = document.querySelector("#paiement-annonce");
  if (!selectAnnonce) {
    return;
  }

  const selectionPrecedente = selectAnnonce.value;
  const annoncesDisponibles = etatApp.annonces.filter(
    (a) => a.estDisponible === true,
  );

  selectAnnonce.replaceChildren(
    new Option("Sélectionner un manuel disponible…", ""),
  );

  for (const annonce of annoncesDisponibles) {
    const titre = obtenirTitreAnnonce(annonce);
    const montant = formatPrix.format(obtenirMontantAnnonce(annonce));
    const campus = obtenirNomCampus(annonce.campusId);
    const etiquette = `${titre} — ${montant} (${campus})`;
    selectAnnonce.add(new Option(etiquette, annonce.id));
  }

  const existeEncore = annoncesDisponibles.some(
    (a) => a.id === selectionPrecedente,
  );
  selectAnnonce.value = existeEncore ? selectionPrecedente : "";
  selectAnnonce.disabled = annoncesDisponibles.length === 0;
}

function actualiserRecapitulatif() {
  const conteneur = document.querySelector("#recapitulatif-commande");
  const selectAnnonce = document.querySelector("#paiement-annonce");
  if (!conteneur || !selectAnnonce) {
    return;
  }

  const annonce = etatApp.annonces.find(
    (a) => a.id === selectAnnonce.value && a.estDisponible === true,
  );

  if (!annonce) {
    conteneur.hidden = true;
    conteneur.replaceChildren();
    return;
  }

  const profil = obtenirProfilActif();
  const montant = obtenirMontantAnnonce(annonce);
  const estPropreAnnonce = profil && profil.id === annonce.vendeurId;

  conteneur.hidden = false;
  conteneur.replaceChildren();

  const titre = document.createElement("h3");
  titre.textContent = obtenirTitreAnnonce(annonce);

  const liste = document.createElement("ul");
  liste.className = "liste-recapitulatif";

  const lignes = [
    ["Vendeur", obtenirNomUtilisateur(annonce.vendeurId)],
    ["Campus", obtenirNomCampus(annonce.campusId)],
    ["Point de remise", annonce.pointRemise || "À convenir sur le campus"],
    ["Prix du manuel", formatPrix.format(montant)],
    ["Protection séquestre", "Incluse (fonds bloqués jusqu'à la remise)"],
    ["Total à autoriser", formatPrix.format(montant)],
  ];

  for (const [libelle, valeur] of lignes) {
    const item = document.createElement("li");
    const labelSpan = document.createElement("span");
    labelSpan.textContent = libelle;
    const valStrong = document.createElement("strong");
    valStrong.textContent = valeur;
    item.append(labelSpan, valStrong);
    liste.append(item);
  }

  conteneur.append(titre, liste);

  if (estPropreAnnonce) {
    const avertissement = document.createElement("p");
    avertissement.className = "alerte alerte-avertissement";
    avertissement.textContent =
      "Vous êtes le vendeur de cette annonce. Changez de profil actif pour simuler un achat.";
    conteneur.append(avertissement);
  }
}

function afficherErreurChamp(nomChamp, message) {
  const elementErreur = document.querySelector(`#erreur-paiement-${nomChamp}`);
  const champ = document.querySelector(`#paiement-${nomChamp}`);

  if (elementErreur) {
    elementErreur.textContent = message;
  }
  if (champ) {
    champ.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function reinitialiserErreurs() {
  for (const champ of ["annonce", "titulaire", "carte", "expiration", "cvc"]) {
    afficherErreurChamp(champ, "");
  }
}

function traiterPaiement(evenement) {
  evenement.preventDefault();
  reinitialiserErreurs();

  const zoneResultat = document.querySelector("#resultat-paiement");
  const profil = obtenirProfilActif();

  if (!profil) {
    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-erreur";
    zoneResultat.textContent =
      "Vous devez être connecté avec un profil actif pour effectuer un paiement.";
    return;
  }

  const annonceId = document.querySelector("#paiement-annonce").value;
  const titulaire = document.querySelector("#paiement-titulaire").value.trim();
  const numeroCarte = normaliserNumeroCarte(
    document.querySelector("#paiement-carte").value,
  );
  const expiration = document
    .querySelector("#paiement-expiration")
    .value.trim();
  const cvc = document.querySelector("#paiement-cvc").value.trim();

  const annonce = etatApp.annonces.find(
    (a) => a.id === annonceId && a.estDisponible === true,
  );

  let formulaireValide = true;

  if (!annonce) {
    afficherErreurChamp(
      "annonce",
      "Veuillez sélectionner une annonce disponible à acheter.",
    );
    formulaireValide = false;
  } else if (annonce.vendeurId === profil.id) {
    afficherErreurChamp(
      "annonce",
      "Impossible d'acheter votre propre annonce. Sélectionnez un autre profil actif.",
    );
    formulaireValide = false;
  }

  if (titulaire.length < 2) {
    afficherErreurChamp(
      "titulaire",
      "Veuillez indiquer le nom complet figurant sur la carte.",
    );
    formulaireValide = false;
  }

  if (!/^\d{16}$/.test(numeroCarte)) {
    afficherErreurChamp(
      "carte",
      "Le numéro de carte doit contenir exactement 16 chiffres.",
    );
    formulaireValide = false;
  }

  const validationExp = estDateExpirationValide(expiration);
  if (!validationExp.valide) {
    afficherErreurChamp("expiration", validationExp.raison);
    formulaireValide = false;
  }

  if (!/^\d{3,4}$/.test(cvc)) {
    afficherErreurChamp("cvc", "Le code CVC doit contenir 3 ou 4 chiffres.");
    formulaireValide = false;
  }

  if (!formulaireValide) {
    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-erreur";
    zoneResultat.textContent =
      "Le paiement n'a pas été envoyé. Corrigez les erreurs indiquées ci-dessus.";
    return;
  }

  const montant = obtenirMontantAnnonce(annonce);
  const reponsePasserelle = passerellePaiement.autoriserPaiement({
    numeroCarte,
    titulaire,
    expiration,
    cvc,
    montant,
  });

  if (!reponsePasserelle.succes) {
    zoneResultat.hidden = false;
    zoneResultat.className = "alerte alerte-erreur";
    zoneResultat.textContent = `${reponsePasserelle.message} (Code : ${reponsePasserelle.codeErreur})`;
    return;
  }

  // Blocage des fonds en séquestre et retrait de l'annonce du catalogue
  annonce.estDisponible = false;

  const codeRemise = String(Math.floor(100000 + Math.random() * 900000));
  const nouvelleTransaction = {
    id: `tx-${Date.now()}`,
    reference: reponsePasserelle.referenceStripe,
    annonceId: annonce.id,
    titreAnnonce: obtenirTitreAnnonce(annonce),
    acheteurId: profil.id,
    vendeurId: annonce.vendeurId,
    campusId: annonce.campusId,
    montant,
    statut: "EN_SEQUESTRE",
    codeRemise,
    derniersQuatreChiffres: reponsePasserelle.derniersQuatreChiffres,
    dateCreation: new Date().toISOString(),
  };

  etatApp.transactions.unshift(nouvelleTransaction);
  notifierChangementEtat();

  document.querySelector("#form-paiement").reset();
  actualiserRecapitulatif();

  zoneResultat.hidden = false;
  zoneResultat.className = "alerte alerte-succes";
  zoneResultat.replaceChildren();

  const titreSucces = document.createElement("strong");
  titreSucces.textContent = `Paiement autorisé (${formatPrix.format(montant)}) — Fonds placés en séquestre !`;

  const detailSucces = document.createElement("p");
  detailSucces.textContent = `Référence : ${nouvelleTransaction.reference} · Code de remise en main propre : ${codeRemise}. L'annonce a été retirée du catalogue. Confirmez la réception ci-dessous une fois le livre en main pour libérer les fonds au vendeur.`;

  zoneResultat.append(titreSucces, detailSucces);
}

function libererSequestre(transactionId) {
  const tx = etatApp.transactions.find((t) => t.id === transactionId);
  if (!tx || !estEnSequestre(tx.statut)) {
    return;
  }

  tx.statut = "LIBEREE";
  tx.dateResolution = new Date().toISOString();
  notifierChangementEtat();

  const zoneResultat = document.querySelector("#resultat-paiement");
  zoneResultat.hidden = false;
  zoneResultat.className = "alerte alerte-succes";
  zoneResultat.textContent = `Réception confirmée : ${formatPrix.format(obtenirMontantTransaction(tx))} ont été libérés vers le compte de ${obtenirNomUtilisateur(tx.vendeurId)}.`;
}

function rembourserSequestre(transactionId) {
  const tx = etatApp.transactions.find((t) => t.id === transactionId);
  if (!tx || !estEnSequestre(tx.statut)) {
    return;
  }

  tx.statut = "REMBOURSEE";
  tx.dateResolution = new Date().toISOString();

  // Remettre l'annonce disponible dans le catalogue
  const annonceAssociee = etatApp.annonces.find((a) => a.id === tx.annonceId);
  if (annonceAssociee) {
    annonceAssociee.estDisponible = true;
  }

  notifierChangementEtat();

  const zoneResultat = document.querySelector("#resultat-paiement");
  zoneResultat.hidden = false;
  zoneResultat.className = "alerte alerte-info";
  zoneResultat.textContent = `Transaction annulée : ${formatPrix.format(obtenirMontantTransaction(tx))} remboursés à ${obtenirNomUtilisateur(tx.acheteurId)}. L'annonce est de nouveau disponible dans le catalogue.`;
}

function afficherTransactions() {
  const liste = document.querySelector("#liste-transactions");
  if (!liste) {
    return;
  }

  liste.replaceChildren();

  if (!etatApp.transactions || etatApp.transactions.length === 0) {
    const vide = document.createElement("p");
    vide.className = "aide-champ";
    vide.textContent = "Aucune transaction enregistrée pour le moment.";
    liste.append(vide);
    return;
  }

  for (const tx of etatApp.transactions) {
    const annonce = etatApp.annonces.find((a) => a.id === tx.annonceId);
    const titre = tx.titreAnnonce ?? obtenirTitreAnnonce(annonce);
    const montant = formatPrix.format(obtenirMontantTransaction(tx));

    const carte = document.createElement("article");
    carte.className = "carte-transaction";

    const entete = document.createElement("div");
    entete.className = "entete-transaction";

    const titreEl = document.createElement("h3");
    titreEl.textContent = `${titre} — ${montant}`;

    const badge = document.createElement("span");
    badge.className = `badge-statut statut-${String(tx.statut ?? "").toLowerCase()}`;
    badge.textContent = LIBELLES_STATUT[tx.statut] ?? tx.statut;

    entete.append(titreEl, badge);

    const details = document.createElement("p");
    details.className = "details-transaction";
    const segments = [
      `Acheteur : ${obtenirNomUtilisateur(tx.acheteurId)}`,
      `Vendeur : ${obtenirNomUtilisateur(tx.vendeurId)}`,
    ];
    if (tx.codeRemise) {
      segments.push(`Code remise : ${tx.codeRemise}`);
    }
    if (tx.derniersQuatreChiffres) {
      segments.push(`Carte •••• ${tx.derniersQuatreChiffres}`);
    }
    details.textContent = segments.join(" · ");

    carte.append(entete, details);

    if (estEnSequestre(tx.statut)) {
      const actions = document.createElement("div");
      actions.className = "actions-transaction";

      const btnConfirmer = document.createElement("button");
      btnConfirmer.type = "button";
      btnConfirmer.className = "bouton-primaire";
      btnConfirmer.textContent = "Confirmer la réception (libérer les fonds)";
      btnConfirmer.addEventListener("click", () => libererSequestre(tx.id));

      const btnRembourser = document.createElement("button");
      btnRembourser.type = "button";
      btnRembourser.className = "bouton-secondaire";
      btnRembourser.textContent = "Annuler et rembourser";
      btnRembourser.addEventListener("click", () => rembourserSequestre(tx.id));

      actions.append(btnConfirmer, btnRembourser);
      carte.append(actions);
    }

    liste.append(carte);
  }
}
