import { initialiserCatalogue, mettreAJourCatalogue } from "./catalogue.js";
import { initialiserInscription } from "./inscription.js";
import { initialiserAnnonces } from "./annonces.js";
import { initialiserPaiement } from "./paiement.js";

/**
 * État partagé en mémoire pour les 4 User Stories.
 * Les futurs modules (paiement.js) peuvent importer etatApp
 * et appeler notifierChangementEtat() après toute modification.
 */
export const etatApp = {
  fichierActif: "normal.json",
  campus: [],
  utilisateurs: [],
  livres: [],
  annonces: [],
  transactions: [],
  simulationPaiement: {
    cartesRefusees: [],
    simulerPanneStripe: false,
  },
  profilActifId: "",
};

export function obtenirProfilActif() {
  return (
    etatApp.utilisateurs.find((u) => u.id === etatApp.profilActifId) ?? null
  );
}

export function notifierChangementEtat() {
  remplirSelecteurProfil();
  mettreAJourCatalogue(etatApp);
  document.dispatchEvent(
    new CustomEvent("campusbooks:etat-change", { detail: etatApp }),
  );
}

export function afficherVue(nomVue, remonter = true) {
  const sections = document.querySelectorAll(".vue-section");
  const onglets = document.querySelectorAll(".onglet");

  for (const section of sections) {
    section.hidden = section.id !== `vue-${nomVue}`;
  }

  for (const onglet of onglets) {
    const estActif = onglet.dataset.vue === nomVue;
    onglet.classList.toggle("actif", estActif);
    onglet.setAttribute("aria-pressed", String(estActif));
  }

  if (remonter) {
    window.scrollTo(0, 0);
  }
}

function remplirSelecteurProfil() {
  const selectProfil = document.querySelector("#select-profil");
  const campusParId = new Map(etatApp.campus.map((c) => [c.id, c.nom]));
  const precedent = etatApp.profilActifId;

  selectProfil.replaceChildren();

  for (const utilisateur of etatApp.utilisateurs) {
    const nomCampus =
      campusParId.get(utilisateur.campusId) ?? utilisateur.campusId;
    const etiquette = `${utilisateur.nom} (${utilisateur.role} — ${nomCampus})`;
    selectProfil.add(new Option(etiquette, utilisateur.id));
  }

  const existeEncore = etatApp.utilisateurs.some((u) => u.id === precedent);
  etatApp.profilActifId = existeEncore
    ? precedent
    : (etatApp.utilisateurs[0]?.id ?? "");

  selectProfil.value = etatApp.profilActifId;
  selectProfil.disabled = etatApp.utilisateurs.length === 0;
}

async function chargerJeuDonnees(nomFichier) {
  const message = document.querySelector("#message-catalogue");
  message.textContent = `Chargement de ${nomFichier}…`;

  try {
    const urlDonnees = new URL(`../data/${nomFichier}`, import.meta.url);
    const reponse = await fetch(urlDonnees, { cache: "no-store" });

    if (!reponse.ok) {
      throw new Error(`Chargement impossible (${reponse.status})`);
    }

    const donnees = await reponse.json();

    etatApp.fichierActif = nomFichier;
    etatApp.campus = donnees.campus ?? [];
    etatApp.utilisateurs = donnees.utilisateurs ?? [];
    etatApp.livres = donnees.livres ?? [];
    etatApp.annonces = donnees.annonces ?? [];
    etatApp.transactions = donnees.transactions ?? [];
    etatApp.simulationPaiement = donnees.simulationPaiement ?? {
      cartesRefusees: [],
      simulerPanneStripe: false,
    };
    etatApp.profilActifId = etatApp.utilisateurs[0]?.id ?? "";

    notifierChangementEtat();
  } catch (erreur) {
    message.textContent = `Impossible de charger ${nomFichier}.`;
    console.error(erreur);
  }
}

function initialiserNavigation() {
  const onglets = document.querySelectorAll(".onglet");
  for (const onglet of onglets) {
    onglet.addEventListener("click", () => {
      afficherVue(onglet.dataset.vue);
    });
  }

  const liensPied = document.querySelectorAll(".pied-liens a[data-vue]");
  for (const lien of liensPied) {
    lien.addEventListener("click", (event) => {
      event.preventDefault();
      const vue = lien.dataset.vue;
      afficherVue(vue, false);

      const cible = lien.getAttribute("href");
      if (cible && cible !== `#vue-${vue}`) {
        document.querySelector(cible)?.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }
}

function initialiserControlesDemo() {
  const selectDonnees = document.querySelector("#select-donnees");
  const selectProfil = document.querySelector("#select-profil");
  const btnReinitialiser = document.querySelector("#btn-reinitialiser");

  selectDonnees.addEventListener("change", () => {
    chargerJeuDonnees(selectDonnees.value);
  });

  selectProfil.addEventListener("change", () => {
    etatApp.profilActifId = selectProfil.value;
    document.dispatchEvent(
      new CustomEvent("campusbooks:profil-change", {
        detail: obtenirProfilActif(),
      }),
    );
  });

  btnReinitialiser.addEventListener("click", () => {
    chargerJeuDonnees(etatApp.fichierActif);
  });
}

const header = document.querySelector("header");
let dernierScroll = window.scrollY;

window.addEventListener(
  "scroll",
  () => {
    const scrollActuel = window.scrollY;

    if (scrollActuel > dernierScroll && scrollActuel > 80) {
      header.classList.add("header-cache");
    } else if (scrollActuel < dernierScroll) {
      header.classList.remove("header-cache");
    }

    dernierScroll = Math.max(scrollActuel, 0);
  },
  { passive: true },
);

function demarrerApplication() {
  initialiserNavigation();
  initialiserControlesDemo();
  initialiserCatalogue();
  initialiserInscription();
  initialiserAnnonces();
  initialiserPaiement();
  chargerJeuDonnees("normal.json");
}

demarrerApplication();
