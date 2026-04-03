/* ============================================================
   GYMSHARK SYNC — APPLICATION FRONTEND
   Gere l'interface de chat, la navigation entre vues,
   l'historique des conversations et les effets visuels.
   ============================================================ */

const API_BASE = 'http://localhost:3000';

/* ============================================================
   REFERENCES DOM
   ============================================================ */

const racine = document.documentElement;
const body = document.body;
const ecranChargement = document.querySelector(".ecran-chargement");
const vues = document.querySelectorAll(".vue");
const vueChat = document.querySelector('.vue[data-view="chat"]');
const boutonsNavigation = document.querySelectorAll("[data-view-target]");
const boutonsInteractifs = document.querySelectorAll("button");

/* --- Champs de saisie --- */
const champsTexte = document.querySelectorAll(".champ-texte");
const champTexte = document.querySelector(".champ-texte");
const champTexteSecondaire = document.querySelector(".champ-texte-secondaire");
const boutonsEnvoyer = document.querySelectorAll(".bouton-envoyer");
const boutonEnvoyer = document.querySelector(".bouton-envoyer");
const boutonEnvoyerSecondaire = document.querySelector(".bouton-envoyer-secondaire");
const boutonsMicro = document.querySelectorAll(".bouton-micro");
const boiteSaisie = document.querySelector(".boite-saisie");
const boiteSaisieSecondaire = document.querySelector(".boite-saisie-secondaire");

/* --- Elements de contenu --- */
const suggestions = document.querySelectorAll(".suggestion");
const cartesActions = document.querySelectorAll(".carte-action");
const filConversation = document.querySelector(".fil-conversation");
const zoneStatut = document.querySelector(".zone-statut");
const boutonsAction = document.querySelectorAll("[data-action]");
const listeHistorique = document.querySelector(".liste-historique");

/** Contenu initial du fil de conversation (pour le reset). */
const messageInitial = filConversation ? filConversation.innerHTML : "";

/* ============================================================
   ETAT DE L'APPLICATION
   ============================================================ */

let timeoutStatut = null;
let conversationId = localStorage.getItem('currentConversationId') || null;
let enCoursDeReponse = false;
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let reconnaissanceVocale = null;
let ecouteVocaleActive = false;
let champVocalActif = null;
let baseTranscriptionVocale = "";
let transcriptFinal = "";
const STORAGE_KEYS = {
    snapshot: "chatConversationSnapshot",
    draft: "chatDraftMessage",
};

/* ============================================================
   ANIMATIONS D'ENTREE (IntersectionObserver)
   ============================================================ */

const elementsAnimables = document.querySelectorAll(
    ".logo, .bouton-lateral, .section-salutation, .boite-saisie, .suggestion, .carte, .zone-aide .aide-bouton, .entete, .element-liste, .message"
);

for (const [index, element] of elementsAnimables.entries()) {
    element.classList.add("animable");
    element.style.transitionDelay = `${Math.min(index * 36, 240)}ms`;
}

const observateur = new IntersectionObserver(
    (entrees) => {
        for (const entree of entrees) {
            if (entree.isIntersecting) {
                entree.target.classList.add("est-visible");
                observateur.unobserve(entree.target);
            }
        }
    },
    { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
);

for (const element of elementsAnimables) {
    observateur.observe(element);
}

/* ============================================================
   GESTION DU CONVERSATION ID
   ============================================================ */

/**
 * Met a jour l'identifiant de conversation actif
 * et le persiste dans le localStorage.
 *
 * @param {string|null} id - Nouvel identifiant, ou null pour reinitialiser.
 */
function setConversationId(id) {
    conversationId = id;
    if (id) {
        localStorage.setItem('currentConversationId', id);
    } else {
        localStorage.removeItem('currentConversationId');
    }
    sauvegarderSnapshotConversation();
}

/* ============================================================
   BARRE DE STATUT
   ============================================================ */

/**
 * Affiche un message temporaire dans la zone de statut.
 *
 * @param {string} message - Texte a afficher.
 */
function afficherStatut(message) {
    if (!zoneStatut) return;
    zoneStatut.textContent = message;
    zoneStatut.classList.add("est-visible");
    if (timeoutStatut) clearTimeout(timeoutStatut);
    timeoutStatut = setTimeout(() => {
        zoneStatut.classList.remove("est-visible");
    }, 2200);
}

/* ============================================================
   NAVIGATION ENTRE VUES
   ============================================================ */

/**
 * Active une vue par son nom et met a jour l'etat actif des boutons.
 *
 * @param {string} nomVue - Nom de la vue (chat, search, shortcuts, help, docs).
 */
function activerVue(nomVue) {
    for (const vue of vues) {
        vue.classList.toggle("vue-active", vue.dataset.view === nomVue);
    }
    for (const bouton of boutonsNavigation) {
        bouton.classList.toggle("est-actif", bouton.dataset.viewTarget === nomVue);
    }
}

/**
 * Bascule l'interface en mode conversation
 * (masque l'accueil, affiche le fil et la barre fixe).
 */
function activerModeConversation() {
    if (vueChat) vueChat.classList.add("est-en-conversation");
}

/**
 * Reinitialise l'interface a l'etat d'accueil du chat.
 */
function reinitialiserConversation() {
    if (vueChat) vueChat.classList.remove("est-en-conversation");
    if (filConversation) filConversation.innerHTML = messageInitial;
    synchroniserTousLesChamps("");
    setConversationId(null);
    effacerSnapshotConversation();
}

/* ============================================================
   GESTION DES CHAMPS DE SAISIE
   ============================================================ */

/**
 * Joue une micro-animation de mise en avant sur une boite de saisie.
 *
 * @param {HTMLElement} [boite=boiteSaisie] - Element a animer.
 */
function mettreEnAvantChamp(boite = boiteSaisie) {
    if (!boite) return;
    boite.animate(
        [
            { transform: "translateY(0) scale(1)" },
            { transform: "translateY(-1px) scale(1.005)" },
            { transform: "translateY(0) scale(1)" }
        ],
        { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
}

/**
 * Retourne le champ de saisie actuellement actif (principal ou secondaire).
 *
 * @returns {HTMLInputElement} Le champ texte avec le focus.
 */
function obtenirChampActif() {
    if (champTexteSecondaire && document.activeElement === champTexteSecondaire) {
        return champTexteSecondaire;
    }
    return champTexte;
}

/**
 * Synchronise la valeur de tous les champs de saisie.
 *
 * @param {string} valeur - Texte a injecter dans tous les champs.
 */
function synchroniserTousLesChamps(valeur) {
    for (const champ of champsTexte) champ.value = valeur;
    sauvegarderBrouillon(valeur);
    synchroniserEtatSaisie();
}

/**
 * Met a jour la classe CSS "est-active" des boites de saisie
 * en fonction du contenu et du focus.
 */
function synchroniserEtatSaisie() {
    const valeur = obtenirChampActif()?.value?.trim() || champTexte?.value?.trim() || "";
    if (boiteSaisie && champTexte) {
        const estActive = valeur.length > 0 || document.activeElement === champTexte;
        boiteSaisie.classList.toggle("est-active", estActive);
    }
    if (boiteSaisieSecondaire && champTexteSecondaire) {
        const estActive = valeur.length > 0 || document.activeElement === champTexteSecondaire;
        boiteSaisieSecondaire.classList.toggle("est-active", estActive);
    }
}

/**
 * Injecte un texte pre-defini dans le champ de saisie principal
 * et bascule sur la vue chat.
 *
 * @param {string} texte - Prompt a injecter.
 */
function injecterPrompt(texte) {
    if (!champTexte || !texte) return;
    synchroniserTousLesChamps(texte);
    champTexte.focus();
    activerVue("chat");
    mettreEnAvantChamp();
    afficherStatut(`Prompt charge : ${texte}`);
}

/**
 * Active ou desactive tous les champs et boutons d'envoi.
 *
 * @param {boolean} disabled - true pour desactiver, false pour reactiver.
 */
function setInputDisabled(disabled) {
    for (const champ of champsTexte) champ.disabled = disabled;
    for (const bouton of boutonsEnvoyer) bouton.disabled = disabled;
}

/* ============================================================
   SAISIE VOCALE
   ============================================================ */

/**
 * Retourne le champ a utiliser pour la saisie vocale.
 *
 * @returns {HTMLInputElement|null}
 */
function obtenirChampPourVoix() {
    if (document.activeElement === champTexteSecondaire && champTexteSecondaire) {
        return champTexteSecondaire;
    }
    if (document.activeElement === champTexte && champTexte) {
        return champTexte;
    }
    if (vueChat?.classList.contains("est-en-conversation") && champTexteSecondaire) {
        return champTexteSecondaire;
    }
    return champTexte;
}

/**
 * Met a jour l'etat visuel des boutons micro.
 *
 * @param {boolean} estActif
 */
function mettreAJourEtatBoutonsMicro(estActif) {
    for (const bouton of boutonsMicro) {
        bouton.classList.toggle("est-en-ecoute", estActif);
        bouton.setAttribute("aria-pressed", estActif ? "true" : "false");
        bouton.title = estActif ? "Arreter la saisie vocale" : "Demarrer la saisie vocale";
    }
}

/**
 * Fusionne le texte deja present et la transcription courante.
 *
 * @param {string} prefixe
 * @param {string} texte
 * @returns {string}
 */
function composerTexteVocal(prefixe, texte) {
    const base = (prefixe || "").trim();
    const suite = (texte || "").trim();
    if (!base) return suite;
    if (!suite) return base;
    return `${base} ${suite}`;
}

/**
 * Traduit un code erreur de reconnaissance vocale en message utilisateur.
 *
 * @param {string} code
 * @returns {string}
 */
function obtenirMessageErreurVocale(code) {
    if (code === "not-allowed" || code === "service-not-allowed") {
        return "L'acces au microphone a ete refuse.";
    }
    if (code === "no-speech") {
        return "Aucune voix detectee.";
    }
    if (code === "audio-capture") {
        return "Aucun microphone n'a ete detecte.";
    }
    if (code === "network") {
        return "Erreur reseau pendant la saisie vocale.";
    }
    return "La saisie vocale a rencontre un probleme.";
}

/**
 * Initialise l'instance de reconnaissance vocale si disponible.
 *
 * @returns {SpeechRecognition|null}
 */
function initialiserReconnaissanceVocale() {
    if (!SpeechRecognitionAPI) return null;
    if (reconnaissanceVocale) return reconnaissanceVocale;

    reconnaissanceVocale = new SpeechRecognitionAPI();
    reconnaissanceVocale.lang = "fr-FR";
    reconnaissanceVocale.continuous = true;
    reconnaissanceVocale.interimResults = true;
    reconnaissanceVocale.maxAlternatives = 1;

    reconnaissanceVocale.onstart = () => {
        ecouteVocaleActive = true;
        mettreAJourEtatBoutonsMicro(true);
        afficherStatut("Saisie vocale active. Parlez, puis recliquez sur le micro pour arreter.");
    };

    reconnaissanceVocale.onresult = (event) => {
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const resultat = event.results[index];
            const texte = resultat[0]?.transcript || "";
            if (resultat.isFinal) {
                transcriptFinal += `${texte} `;
            } else {
                interimTranscript += texte;
            }
        }

        if (!champVocalActif) return;
        const texte = composerTexteVocal(baseTranscriptionVocale, `${transcriptFinal} ${interimTranscript}`);
        synchroniserTousLesChamps(texte);
        champVocalActif.focus();
    };

    reconnaissanceVocale.onerror = (event) => {
        ecouteVocaleActive = false;
        mettreAJourEtatBoutonsMicro(false);
        afficherStatut(obtenirMessageErreurVocale(event.error));
    };

    reconnaissanceVocale.onend = () => {
        const texteFinal = composerTexteVocal(baseTranscriptionVocale, transcriptFinal);
        if (champVocalActif && texteFinal) {
            synchroniserTousLesChamps(texteFinal);
            champVocalActif.focus();
        }

        ecouteVocaleActive = false;
        mettreAJourEtatBoutonsMicro(false);
        if (transcriptFinal.trim()) {
            afficherStatut("Saisie vocale terminee.");
        }
    };

    return reconnaissanceVocale;
}

/**
 * Demarre ou arrete la saisie vocale.
 */
function basculerSaisieVocale() {
    const reconnaissance = initialiserReconnaissanceVocale();
    if (!reconnaissance) {
        afficherStatut("La saisie vocale n'est pas prise en charge par ce navigateur.");
        return;
    }

    if (ecouteVocaleActive) {
        reconnaissance.stop();
        return;
    }

    champVocalActif = obtenirChampPourVoix();
    if (!champVocalActif) {
        afficherStatut("Aucun champ de saisie disponible.");
        return;
    }

    champVocalActif.focus();
    baseTranscriptionVocale = champVocalActif.value.trim();
    transcriptFinal = "";

    try {
        reconnaissance.start();
    } catch {
        afficherStatut("Impossible de demarrer la saisie vocale pour le moment.");
    }
}

/* ============================================================
   CREATION DE BOUTONS D'ACTION (copier, editer)
   ============================================================ */

/**
 * Cree un bouton d'action avec icone Font Awesome.
 *
 * @param {string}   iconClass - Classe Font Awesome a afficher.
 * @param {string}   title     - Titre au survol.
 * @param {Function} onClick   - Callback au clic.
 * @returns {HTMLButtonElement}
 */
function creerBoutonAction(iconClass, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i>`;
    btn.style.cssText = "width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:999px;color:#888;cursor:pointer;font-size:12px;transition:color 0.2s ease, background 0.2s ease, border-color 0.2s ease, transform 0.2s ease";
    btn.addEventListener("mouseenter", () => {
        btn.style.color = "#f2f3f7";
        btn.style.background = "rgba(255,255,255,0.08)";
        btn.style.borderColor = "rgba(255,255,255,0.14)";
        btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.color = "#888";
        btn.style.background = "rgba(255,255,255,0.03)";
        btn.style.borderColor = "rgba(255,255,255,0.06)";
        btn.style.transform = "";
    });
    btn.addEventListener("click", onClick);
    return btn;
}

/**
 * Cree une barre d'actions (copier, editer...) pour un message.
 * La barre est invisible par defaut et apparait au survol du conteneur.
 *
 * @returns {HTMLDivElement}
 */
function creerBarreActions() {
    const barre = document.createElement("div");
    barre.style.cssText = "display:flex;gap:10px;margin-top:6px;opacity:0;transition:opacity 0.2s ease;pointer-events:none";
    return barre;
}

/**
 * Attache les listeners de survol pour afficher/masquer la barre d'actions.
 *
 * @param {HTMLElement} conteneur   - Element parent (conteneur message).
 * @param {HTMLElement} barreActions - Barre d'actions a afficher/masquer.
 */
function attacherHoverActions(conteneur, barreActions) {
    conteneur.addEventListener("mouseenter", () => {
        barreActions.style.opacity = "1";
        barreActions.style.pointerEvents = "auto";
    });
    conteneur.addEventListener("mouseleave", () => {
        barreActions.style.opacity = "0";
        barreActions.style.pointerEvents = "none";
    });
}

/* ============================================================
   GESTION DES MESSAGES
   ============================================================ */

/**
 * Ajoute un message (utilisateur ou assistant) dans le fil de conversation.
 *
 * @param {string} contenu - Texte du message.
 * @param {string} type    - "utilisateur" ou "assistant".
 * @returns {HTMLElement|null} L'element <article> du message cree.
 */
function ajouterMessage(contenu, type) {
    if (!filConversation || !contenu) return null;

    // Conteneur du message (flex column)
    const conteneurMessage = document.createElement("div");
    conteneurMessage.style.cssText = `display:flex;flex-direction:column;margin-bottom:12px;align-items:${type === "utilisateur" ? "flex-end" : "flex-start"}`;

    // Article du message
    const article = document.createElement("article");
    article.className = `message message-${type}`;
    const paragraphe = document.createElement("p");
    paragraphe.textContent = contenu;
    article.append(paragraphe);
    conteneurMessage.append(article);

    // Barre d'actions (copier + editer pour l'utilisateur)
    const barreActions = creerBarreActions();

    const btnCopier = creerBoutonAction("fa-regular fa-copy", "Copier", () => {
        navigator.clipboard.writeText(contenu)
            .then(() => afficherStatut("Copie!"))
            .catch(() => afficherStatut("Erreur lors de la copie"));
    });
    barreActions.append(btnCopier);

    if (type === "utilisateur") {
        const btnEditer = creerBoutonAction("fa-regular fa-pen-to-square", "Editer", () => {
            editerMessage(contenu, article, conteneurMessage);
        });
        barreActions.append(btnEditer);
    }

    conteneurMessage.append(barreActions);
    attacherHoverActions(conteneurMessage, barreActions);

    filConversation.append(conteneurMessage);
    faireDefilerConversationEnBas();
    sauvegarderSnapshotConversation();
    return article;
}

/**
 * Cree un message assistant vide (placeholder) dans le fil de conversation.
 * Utilise pendant le streaming de la reponse.
 *
 * @returns {HTMLElement|null} L'element <article> cree.
 */
function creerMessageAssistantVide() {
    if (!filConversation) return null;

    const conteneurMessage = document.createElement("div");
    conteneurMessage.style.cssText = "display:flex;flex-direction:column;margin-bottom:12px;align-items:flex-start";

    const article = document.createElement("article");
    article.className = "message message-assistant";
    const paragraphe = document.createElement("p");
    paragraphe.textContent = "";
    article.append(paragraphe);
    conteneurMessage.append(article);

    // Barre d'actions (copier uniquement)
    const barreActions = creerBarreActions();
    const btnCopier = creerBoutonAction("fa-regular fa-copy", "Copier", () => {
        navigator.clipboard.writeText(paragraphe.textContent)
            .then(() => afficherStatut("Copie!"))
            .catch(() => afficherStatut("Erreur lors de la copie"));
    });
    barreActions.append(btnCopier);
    conteneurMessage.append(barreActions);
    attacherHoverActions(conteneurMessage, barreActions);

    filConversation.append(conteneurMessage);
    faireDefilerConversationEnBas();
    sauvegarderSnapshotConversation();
    return article;
}

/**
 * Fait defiler uniquement la zone de conversation.
 *
 * @param {ScrollBehavior} [behavior="smooth"] - Type de scroll.
 */
function faireDefilerConversationEnBas(behavior = "smooth") {
    if (!filConversation) return;
    filConversation.scrollTo({
        top: filConversation.scrollHeight,
        behavior,
    });
}

/**
 * Extrait une version serialisable de la conversation visible.
 *
 * @returns {Array<{ role: string, content: string }>}
 */
function collecterMessagesDepuisDOM() {
    if (!filConversation) return [];

    return Array.from(filConversation.querySelectorAll(".message"))
        .map((element) => {
            const contenu = element.querySelector("p")?.textContent || "";
            const role = element.classList.contains("message-assistant") ? "assistant" : "user";
            return { role, content: contenu };
        })
        .filter((message) => message.content.trim().length > 0);
}

/**
 * Sauvegarde un instantane local de la conversation en cours.
 */
function sauvegarderSnapshotConversation() {
    try {
        const snapshot = {
            conversationId,
            isConversationMode: !!vueChat?.classList.contains("est-en-conversation"),
            messages: collecterMessagesDepuisDOM(),
            savedAt: Date.now(),
        };
        sessionStorage.setItem(STORAGE_KEYS.snapshot, JSON.stringify(snapshot));
    } catch {
        // sessionStorage non disponible
    }
}

/**
 * Supprime l'instantane local de conversation.
 */
function effacerSnapshotConversation() {
    try {
        sessionStorage.removeItem(STORAGE_KEYS.snapshot);
    } catch {
        // sessionStorage non disponible
    }
}

/**
 * Sauvegarde le brouillon courant pour resister aux reloads.
 *
 * @param {string} valeur
 */
function sauvegarderBrouillon(valeur) {
    try {
        if (valeur && valeur.trim()) {
            sessionStorage.setItem(STORAGE_KEYS.draft, valeur);
        } else {
            sessionStorage.removeItem(STORAGE_KEYS.draft);
        }
    } catch {
        // sessionStorage non disponible
    }
}

/**
 * Restaure un instantane local de conversation si disponible.
 *
 * @returns {boolean} true si un instantane a ete restaure.
 */
function restaurerSnapshotConversation() {
    try {
        const brut = sessionStorage.getItem(STORAGE_KEYS.snapshot);
        if (!brut || !filConversation) return false;

        const snapshot = JSON.parse(brut);
        const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
        if (!messages.length) return false;

        filConversation.innerHTML = "";
        for (const message of messages) {
            ajouterMessage(message.content, message.role === "assistant" ? "assistant" : "utilisateur");
        }

        if (snapshot.isConversationMode) {
            activerModeConversation();
        }

        faireDefilerConversationEnBas("auto");

        return true;
    } catch {
        return false;
    }
}

/**
 * Restaure le brouillon en attente s'il existe.
 */
function restaurerBrouillon() {
    try {
        const draft = sessionStorage.getItem(STORAGE_KEYS.draft) || "";
        if (draft) {
            synchroniserTousLesChamps(draft);
        }
    } catch {
        // sessionStorage non disponible
    }
}

/* ============================================================
   EDITION DE MESSAGE
   ============================================================ */

/**
 * Ouvre une modale d'edition pour un message utilisateur.
 * Si le texte est modifie, regenere la reponse de l'assistant.
 *
 * @param {string}      contenuOriginal  - Texte actuel du message.
 * @param {HTMLElement}  articleOriginal  - Element <article> du message.
 * @param {HTMLElement}  conteneurMessage - Conteneur parent du message.
 */
function editerMessage(contenuOriginal, articleOriginal, conteneurMessage) {
    // Overlay semi-transparent
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9998";

    // Boite d'edition
    const boiteEdition = document.createElement("div");
    boiteEdition.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:2px solid #4a7c9e;border-radius:8px;padding:20px;z-index:9999;min-width:400px;box-shadow:0 10px 40px rgba(0,0,0,0.5);color:#fff";

    const titre = document.createElement("h3");
    titre.textContent = "Editer le message";
    titre.style.marginTop = "0";
    boiteEdition.append(titre);

    const textarea = document.createElement("textarea");
    textarea.value = contenuOriginal;
    textarea.style.cssText = "width:100%;height:120px;padding:10px;margin-bottom:12px;border-radius:4px;border:1px solid #4a7c9e;background:#0f3460;color:#fff;font-family:monospace;resize:vertical";
    boiteEdition.append(textarea);

    const btnConteneur = document.createElement("div");
    btnConteneur.style.cssText = "display:flex;gap:10px";

    const btnValider = document.createElement("button");
    btnValider.textContent = "Valider et regenerer";
    btnValider.style.cssText = "padding:10px 16px;background:#00d4ff;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold";

    const btnAnnuler = document.createElement("button");
    btnAnnuler.textContent = "Annuler";
    btnAnnuler.style.cssText = "padding:10px 16px;background:#4a5568;color:#fff;border:none;border-radius:4px;cursor:pointer";

    /** Ferme la modale d'edition. */
    const fermer = () => {
        boiteEdition.remove();
        overlay.remove();
    };

    btnAnnuler.addEventListener("click", fermer);
    overlay.addEventListener("click", fermer);

    btnValider.addEventListener("click", async () => {
        const nouveauTexte = textarea.value.trim();
        if (nouveauTexte && nouveauTexte !== contenuOriginal) {
            fermer();
            // Mettre a jour le message dans le DOM
            const paragraphe = articleOriginal.querySelector("p");
            if (paragraphe) paragraphe.textContent = nouveauTexte;

            // Supprimer la reponse assistant suivante si elle existe
            const nextElement = conteneurMessage.nextElementSibling;
            if (nextElement) {
                const articleSuivant = nextElement.querySelector(".message-assistant");
                if (articleSuivant) nextElement.remove();
            }

            // Regenerer la reponse avec le message modifie
            await envoyerEtStreamer(nouveauTexte, "Reponse regeneree.");
        } else {
            fermer();
        }
    });

    btnConteneur.append(btnValider, btnAnnuler);
    boiteEdition.append(btnConteneur);
    document.body.append(overlay, boiteEdition);

    textarea.focus();
    textarea.select();
}

/* ============================================================
   COMMUNICATION AVEC LE BACKEND (streaming SSE)
   ============================================================ */

/**
 * Lit un flux SSE depuis la reponse fetch et alimente progressivement
 * le paragraphe du message assistant.
 *
 * @param {Response}    response         - Reponse fetch (stream SSE).
 * @param {HTMLElement} articleAssistant  - Element <article> a remplir.
 * @returns {Promise<string>} Texte complet de la reponse.
 */
async function lireStreamSSE(response, articleAssistant) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const paragraphe = articleAssistant ? articleAssistant.querySelector("p") : null;
    let fullReply = '';
    let buffer = '';

    if (paragraphe) paragraphe.textContent = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            if (data === '[DONE]') continue;

            // Extraire les meta (conversationId)
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'meta' && parsed.conversationId) {
                    setConversationId(parsed.conversationId);
                    continue;
                }
            } catch {
                // pas du JSON, c'est du texte brut
            }

            // Accumuler le texte de la reponse
            const texte = data.replace(/\\n/g, '\n');
            fullReply += texte;

            if (paragraphe) {
                paragraphe.textContent = fullReply;
                faireDefilerConversationEnBas();
                sauvegarderSnapshotConversation();
            }
        }
    }

    return fullReply;
}

/**
 * Envoie un message au backend et affiche la reponse en streaming.
 * Fonction partagee par l'envoi normal et la regeneration apres edition.
 *
 * @param {string} message       - Message a envoyer au LLM.
 * @param {string} statutSucces  - Message de statut a afficher en cas de succes.
 */
async function envoyerEtStreamer(message, statutSucces) {
    enCoursDeReponse = true;
    setInputDisabled(true);

    const articleAssistant = creerMessageAssistantVide();
    const paragraphe = articleAssistant ? articleAssistant.querySelector("p") : null;
    if (paragraphe) paragraphe.textContent = "...";

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationId }),
        });

        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }

        const fullReply = await lireStreamSSE(response, articleAssistant);

        if (!fullReply && paragraphe) {
            paragraphe.textContent = "(Pas de reponse du serveur)";
        }

        afficherStatut(statutSucces);
        chargerHistorique();
    } catch (err) {
        if (window.Logger) Logger.error('Erreur chat: ' + err.message, 'app.js');
        if (paragraphe) {
            paragraphe.textContent = `Erreur : ${err.message}. Verifiez que le serveur backend est lance.`;
        }
        afficherStatut("Erreur de connexion au serveur.");
    } finally {
        enCoursDeReponse = false;
        setInputDisabled(false);
    }
}

/**
 * Gere l'envoi d'un message depuis le champ de saisie actif.
 * Valide l'input, bascule en mode conversation, puis streame la reponse.
 */
async function envoyerMessage() {
    if (enCoursDeReponse) return;

    const champActif = obtenirChampActif();
    const boutonActif = document.activeElement === boutonEnvoyerSecondaire ? boutonEnvoyerSecondaire : boutonEnvoyer;

    if (!champActif) return;
    const valeur = champActif.value.trim();
    if (!valeur) {
        champActif.focus();
        afficherStatut("Ecrivez un message avant d'envoyer.");
        return;
    }

    activerModeConversation();

    // Micro-animation du bouton envoyer
    if (boutonActif) boutonActif.style.transform = "scale(0.94)";
    setTimeout(() => {
        if (boutonActif) boutonActif.style.transform = "";
    }, 140);

    ajouterMessage(valeur, "utilisateur");
    synchroniserTousLesChamps("");
    afficherStatut("Message envoye...");

    await envoyerEtStreamer(valeur, "Reponse recue.");

    if (champTexteSecondaire) champTexteSecondaire.focus();
}

/* ============================================================
   HISTORIQUE DES CONVERSATIONS
   ============================================================ */

/**
 * Charge la liste des conversations depuis le backend
 * et met a jour la sidebar.
 */
async function chargerHistorique() {
    if (!listeHistorique) return;
    try {
        const res = await fetch(`${API_BASE}/api/conversations`);
        if (!res.ok) return;
        const conversations = await res.json();
        listeHistorique.innerHTML = '';

        for (const conv of conversations) {
            const btn = document.createElement("button");
            btn.className = "raccourci raccourci-historique";
            btn.dataset.conversationId = conv.id;
            btn.style.cssText = "position:relative;display:flex;align-items:center;justify-content:space-between;width:100%";

            if (conv.id === conversationId) {
                btn.classList.add("est-actif");
            }

            // Texte du titre (tronque)
            const texteBtn = document.createElement("span");
            texteBtn.textContent = conv.title;
            texteBtn.style.cssText = "flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

            // Menu d'actions (supprimer) visible au survol
            const menuActions = document.createElement("div");
            menuActions.style.cssText = "display:flex;gap:6px;opacity:0;transition:opacity 0.2s ease;pointer-events:none";

            const btnSupprimer = creerBoutonSuppressionConversation(conv);
            menuActions.append(btnSupprimer);

            btn.append(texteBtn, menuActions);
            attacherHoverActions(btn, menuActions);
            btn.addEventListener("click", () => chargerConversation(conv.id));
            listeHistorique.append(btn);
        }
    } catch {
        // Serveur non disponible
    }
}

/**
 * Cree le bouton de suppression pour un element d'historique.
 *
 * @param {Object} conv - Objet conversation { id, title }.
 * @returns {HTMLButtonElement}
 */
function creerBoutonSuppressionConversation(conv) {
    const btnSupprimer = document.createElement("button");
    btnSupprimer.textContent = "\u2715";
    btnSupprimer.title = "Supprimer";
    btnSupprimer.style.cssText = "padding:4px 6px;background:transparent;border:none;color:#888;cursor:pointer;font-size:16px;line-height:1;transition:color 0.2s ease;min-width:24px;min-height:24px;display:flex;align-items:center;justify-content:center";

    btnSupprimer.addEventListener("mouseenter", () => { btnSupprimer.style.color = "#ff4444"; });
    btnSupprimer.addEventListener("mouseleave", () => { btnSupprimer.style.color = "#888"; });

    btnSupprimer.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirme = await ouvrirModaleConfirmation({
            titre: "Supprimer la conversation",
            message: `Voulez-vous vraiment supprimer "${conv.title}" ? Cette action est definitive.`,
            texteConfirmation: "Supprimer",
        });
        if (!confirme) return;
        try {
            const res = await fetch(`${API_BASE}/api/conversations/${conv.id}`, { method: 'DELETE' });
            if (res.ok) {
                if (conversationId === conv.id) {
                    setConversationId(null);
                    reinitialiserConversation();
                }
                chargerHistorique();
                afficherStatut("Conversation supprimee");
            }
        } catch (err) {
            if (window.Logger) Logger.error('Erreur suppression: ' + err.message, 'app.js');
            afficherStatut("Erreur lors de la suppression");
        }
    });

    return btnSupprimer;
}

/**
 * Affiche une modale de confirmation custom.
 *
 * @param {Object} options
 * @param {string} options.titre
 * @param {string} options.message
 * @param {string} [options.texteConfirmation="Confirmer"]
 * @returns {Promise<boolean>}
 */
function ouvrirModaleConfirmation({ titre, message, texteConfirmation = "Confirmer" }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modale-overlay";

        const modale = document.createElement("div");
        modale.className = "modale-confirmation";
        modale.setAttribute("role", "dialog");
        modale.setAttribute("aria-modal", "true");
        modale.setAttribute("aria-labelledby", "modale-confirmation-titre");

        const titreElement = document.createElement("h3");
        titreElement.id = "modale-confirmation-titre";
        titreElement.textContent = titre;

        const messageElement = document.createElement("p");
        messageElement.textContent = message;

        const actions = document.createElement("div");
        actions.className = "modale-actions";

        const boutonAnnuler = document.createElement("button");
        boutonAnnuler.type = "button";
        boutonAnnuler.className = "modale-bouton modale-bouton-secondaire";
        boutonAnnuler.textContent = "Annuler";

        const boutonConfirmer = document.createElement("button");
        boutonConfirmer.type = "button";
        boutonConfirmer.className = "modale-bouton modale-bouton-danger";
        boutonConfirmer.textContent = texteConfirmation;

        let resolu = false;
        const fermer = (valeur) => {
            if (resolu) return;
            resolu = true;
            document.removeEventListener("keydown", gererClavier);
            overlay.remove();
            resolve(valeur);
        };

        const gererClavier = (event) => {
            if (event.key === "Escape") {
                fermer(false);
            }
        };

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                fermer(false);
            }
        });
        boutonAnnuler.addEventListener("click", () => fermer(false));
        boutonConfirmer.addEventListener("click", () => fermer(true));
        document.addEventListener("keydown", gererClavier);

        actions.append(boutonAnnuler, boutonConfirmer);
        modale.append(titreElement, messageElement, actions);
        overlay.append(modale);
        document.body.append(overlay);
        boutonConfirmer.focus();
    });
}

/**
 * Charge et affiche une conversation existante depuis le backend.
 *
 * @param {string} id - Identifiant de la conversation a charger.
 */
async function chargerConversation(id) {
    try {
        const res = await fetch(`${API_BASE}/api/conversations/${id}`);
        if (!res.ok) return;
        const conv = await res.json();

        setConversationId(id);
        if (filConversation) filConversation.innerHTML = "";

        for (const msg of conv.messages) {
            const type = msg.role === 'assistant' ? 'assistant' : 'utilisateur';
            ajouterMessage(msg.content, type);
        }

        activerVue("chat");
        activerModeConversation();
        faireDefilerConversationEnBas("auto");
        sauvegarderSnapshotConversation();
        chargerHistorique();
        afficherStatut("Conversation chargee.");
    } catch {
        afficherStatut("Erreur lors du chargement.");
    }
}

/* ============================================================
   EFFETS VISUELS
   ============================================================ */

/**
 * Cree un effet ripple (ondulation) sur un bouton au clic.
 *
 * @param {HTMLElement} bouton - Bouton cible.
 * @param {PointerEvent} event - Evenement pointeur.
 */
function creerRipple(bouton, event) {
    const rect = bouton.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    bouton.append(ripple);
    setTimeout(() => ripple.remove(), 520);
}

/* ============================================================
   EVENEMENTS ET INITIALISATION
   ============================================================ */

/* --- Ripple sur tous les boutons --- */
for (const bouton of boutonsInteractifs) {
    bouton.addEventListener("pointerdown", (event) => creerRipple(bouton, event));
}

/* --- Spotlight qui suit le curseur --- */
window.addEventListener("mousemove", (event) => {
    racine.style.setProperty("--spotlight-x", `${event.clientX}px`);
    racine.style.setProperty("--spotlight-y", `${event.clientY}px`);
});

/* --- Chargement initial --- */
window.addEventListener("load", () => {
    setTimeout(() => {
        if (ecranChargement) ecranChargement.classList.add("cache");
        body.classList.add("page-chargee");
        activerVue("chat");
        afficherStatut("Vue active : Chat");
        restaurerSnapshotConversation();
        restaurerBrouillon();
        chargerHistorique();

        // Restaurer la conversation active si elle existait
        if (conversationId) {
            chargerConversation(conversationId);
        }
    }, 900);
});

/* --- Navigation sidebar et boutons --- */
for (const bouton of boutonsNavigation) {
    bouton.addEventListener("click", () => {
        const cible = bouton.dataset.viewTarget;
        const prompt = bouton.dataset.prompt;

        // "Nouveau chat" sans prompt → reinitialiser
        if (cible === "chat" && bouton.classList.contains("bouton-principal") && !prompt) {
            reinitialiserConversation();
        }

        if (cible) {
            activerVue(cible);
            afficherStatut(`Vue active : ${cible}`);
        }

        if (prompt) {
            injecterPrompt(prompt);
        }
    });
}

/* --- Suggestions rapides --- */
for (const suggestion of suggestions) {
    suggestion.addEventListener("click", () => injecterPrompt(suggestion.textContent));
}

/* --- Cartes d'action (accueil) --- */
for (const carte of cartesActions) {
    carte.addEventListener("click", () => {
        const cible = carte.dataset.viewTarget;
        const prompt = carte.dataset.prompt;
        if (cible) {
            activerVue(cible);
            afficherStatut(`Vue active : ${cible}`);
        }
        if (prompt) injecterPrompt(prompt);
    });
}

/* --- Boutons d'action generiques (partage, piece jointe, voix) --- */
for (const bouton of boutonsAction) {
    bouton.addEventListener("click", () => {
        const action = bouton.dataset.action;
        if (action === "share") afficherStatut("Lien de partage prepare.");
        if (action === "attach") afficherStatut("Module d'ajout pret. Vous pouvez connecter un document ici.");
        if (action === "voice") basculerSaisieVocale();
    });
}

/* --- Envoi de message (boutons + champs texte) --- */
if (boutonEnvoyer && champTexte) {
    for (const bouton of boutonsEnvoyer) {
        bouton.addEventListener("click", envoyerMessage);
    }

    for (const champ of champsTexte) {
        champ.addEventListener("input", (event) => synchroniserTousLesChamps(event.target.value));
        champ.addEventListener("focus", synchroniserEtatSaisie);
        champ.addEventListener("blur", synchroniserEtatSaisie);
        champ.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                envoyerMessage();
            }
        });
    }
}

/* --- Synchronisation initiale --- */
synchroniserEtatSaisie();
