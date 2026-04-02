const API_BASE = 'http://localhost:3000';

const racine = document.documentElement;
const body = document.body;
const ecranChargement = document.querySelector(".ecran-chargement");
const elementsAnimables = document.querySelectorAll(
    ".logo, .bouton-lateral, .section-salutation, .boite-saisie, .suggestion, .carte, .zone-aide .aide-bouton, .entete, .element-liste, .message"
);
const vues = document.querySelectorAll(".vue");
const vueChat = document.querySelector('.vue[data-view="chat"]');
const boutonsNavigation = document.querySelectorAll("[data-view-target]");
const boutonsInteractifs = document.querySelectorAll("button");
const champsTexte = document.querySelectorAll(".champ-texte");
const champTexte = document.querySelector(".champ-texte");
const champTexteSecondaire = document.querySelector(".champ-texte-secondaire");
const boutonsEnvoyer = document.querySelectorAll(".bouton-envoyer");
const boutonEnvoyer = document.querySelector(".bouton-envoyer");
const boutonEnvoyerSecondaire = document.querySelector(".bouton-envoyer-secondaire");
const boiteSaisie = document.querySelector(".boite-saisie");
const boiteSaisieSecondaire = document.querySelector(".boite-saisie-secondaire");
const suggestions = document.querySelectorAll(".suggestion");
const cartesActions = document.querySelectorAll(".carte-action");
const filConversation = document.querySelector(".fil-conversation");
const zoneStatut = document.querySelector(".zone-statut");
const boutonsAction = document.querySelectorAll("[data-action]");
const messageInitial = filConversation ? filConversation.innerHTML : "";
const listeHistorique = document.querySelector(".liste-historique");

let timeoutStatut = null;
let conversationId = null;
let enCoursDeReponse = false;

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
    {
        threshold: 0.1,
        rootMargin: "0px 0px -6% 0px"
    }
);

for (const element of elementsAnimables) {
    observateur.observe(element);
}

function afficherStatut(message) {
    if (!zoneStatut) return;
    zoneStatut.textContent = message;
    zoneStatut.classList.add("est-visible");
    if (timeoutStatut) clearTimeout(timeoutStatut);
    timeoutStatut = setTimeout(() => {
        zoneStatut.classList.remove("est-visible");
    }, 2200);
}

function activerVue(nomVue) {
    for (const vue of vues) {
        vue.classList.toggle("vue-active", vue.dataset.view === nomVue);
    }
    for (const bouton of boutonsNavigation) {
        const estActif = bouton.dataset.viewTarget === nomVue;
        bouton.classList.toggle("est-actif", estActif);
    }
}

function activerModeConversation() {
    if (vueChat) vueChat.classList.add("est-en-conversation");
}

function reinitialiserConversation() {
    if (vueChat) vueChat.classList.remove("est-en-conversation");
    if (filConversation) filConversation.innerHTML = messageInitial;
    synchroniserTousLesChamps("");
    conversationId = null;
}

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

function obtenirChampActif() {
    if (champTexteSecondaire && document.activeElement === champTexteSecondaire) {
        return champTexteSecondaire;
    }
    return champTexte;
}

function synchroniserTousLesChamps(valeur) {
    for (const champ of champsTexte) champ.value = valeur;
    synchroniserEtatSaisie();
}

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

function injecterPrompt(texte) {
    if (!champTexte || !texte) return;
    synchroniserTousLesChamps(texte);
    champTexte.focus();
    activerVue("chat");
    mettreEnAvantChamp();
    afficherStatut(`Prompt charge : ${texte}`);
}

function ajouterMessage(contenu, type) {
    if (!filConversation || !contenu) return null;
    const article = document.createElement("article");
    article.className = `message message-${type}`;
    const paragraphe = document.createElement("p");
    paragraphe.textContent = contenu;
    article.append(paragraphe);
    filConversation.append(article);
    article.scrollIntoView({ behavior: "smooth", block: "end" });
    return article;
}

function creerMessageAssistantVide() {
    if (!filConversation) return null;
    const article = document.createElement("article");
    article.className = "message message-assistant";
    const paragraphe = document.createElement("p");
    paragraphe.textContent = "";
    article.append(paragraphe);
    filConversation.append(article);
    return article;
}

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

    if (boutonActif) boutonActif.style.transform = "scale(0.94)";
    setTimeout(() => {
        if (boutonActif) boutonActif.style.transform = "";
    }, 140);

    ajouterMessage(valeur, "utilisateur");
    synchroniserTousLesChamps("");
    afficherStatut("Message envoye...");

    enCoursDeReponse = true;
    setInputDisabled(true);

    const articleAssistant = creerMessageAssistantVide();
    const paragraphe = articleAssistant ? articleAssistant.querySelector("p") : null;

    if (paragraphe) paragraphe.textContent = "...";

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: valeur, conversationId }),
        });

        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
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
                        conversationId = parsed.conversationId;
                        continue;
                    }
                } catch {
                    // pas du JSON, c'est du texte
                }

                // Texte de la reponse
                const texte = data.replace(/\\n/g, '\n');
                fullReply += texte;

                if (paragraphe) {
                    paragraphe.textContent = fullReply;
                    articleAssistant.scrollIntoView({ behavior: "smooth", block: "end" });
                }
            }
        }

        if (!fullReply && paragraphe) {
            paragraphe.textContent = "(Pas de reponse du serveur)";
        }

        afficherStatut("Reponse recue.");
        chargerHistorique();
    } catch (err) {
        console.error('Erreur chat:', err);
        if (paragraphe) {
            paragraphe.textContent = `Erreur : ${err.message}. Verifiez que le serveur backend est lance.`;
        }
        afficherStatut("Erreur de connexion au serveur.");
    } finally {
        enCoursDeReponse = false;
        setInputDisabled(false);
        if (champTexteSecondaire) champTexteSecondaire.focus();
    }
}

function setInputDisabled(disabled) {
    for (const champ of champsTexte) champ.disabled = disabled;
    for (const bouton of boutonsEnvoyer) bouton.disabled = disabled;
}

// --- Historique ---

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
            btn.textContent = conv.title;
            btn.dataset.conversationId = conv.id;

            if (conv.id === conversationId) {
                btn.classList.add("est-actif");
            }

            btn.addEventListener("click", () => chargerConversation(conv.id));
            listeHistorique.append(btn);
        }
    } catch {
        // serveur non disponible
    }
}

async function chargerConversation(id) {
    try {
        const res = await fetch(`${API_BASE}/api/conversations/${id}`);
        if (!res.ok) return;
        const conv = await res.json();

        conversationId = id;
        if (filConversation) filConversation.innerHTML = "";

        for (const msg of conv.messages) {
            const type = msg.role === 'assistant' ? 'assistant' : 'utilisateur';
            ajouterMessage(msg.content, type);
        }

        activerVue("chat");
        activerModeConversation();
        chargerHistorique();
        afficherStatut(`Conversation chargee.`);
    } catch (err) {
        afficherStatut("Erreur lors du chargement.");
    }
}

// --- Effets visuels ---

function creerRipple(bouton, event) {
    const rect = bouton.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    bouton.append(ripple);
    setTimeout(() => ripple.remove(), 520);
}

for (const bouton of boutonsInteractifs) {
    bouton.addEventListener("pointerdown", (event) => {
        creerRipple(bouton, event);
    });
}

window.addEventListener("mousemove", (event) => {
    racine.style.setProperty("--spotlight-x", `${event.clientX}px`);
    racine.style.setProperty("--spotlight-y", `${event.clientY}px`);
});

window.addEventListener("load", () => {
    setTimeout(() => {
        if (ecranChargement) ecranChargement.classList.add("cache");
        body.classList.add("page-chargee");
        activerVue("chat");
        afficherStatut("Vue active : Chat");
        chargerHistorique();
    }, 900);
});

for (const bouton of boutonsNavigation) {
    bouton.addEventListener("click", () => {
        const cible = bouton.dataset.viewTarget;
        const prompt = bouton.dataset.prompt;

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

for (const suggestion of suggestions) {
    suggestion.addEventListener("click", () => {
        injecterPrompt(suggestion.textContent);
    });
}

for (const carte of cartesActions) {
    carte.addEventListener("click", () => {
        const cible = carte.dataset.viewTarget;
        const prompt = carte.dataset.prompt;
        if (cible) {
            activerVue(cible);
            afficherStatut(`Vue active : ${cible}`);
        }
        if (prompt) {
            injecterPrompt(prompt);
        }
    });
}

for (const bouton of boutonsAction) {
    bouton.addEventListener("click", () => {
        const action = bouton.dataset.action;
        if (action === "share") afficherStatut("Lien de partage prepare.");
        if (action === "attach") afficherStatut("Module d'ajout pret. Vous pouvez connecter un document ici.");
        if (action === "voice") afficherStatut("Commande vocale simulee.");
    });
}

if (boutonEnvoyer && champTexte) {
    for (const bouton of boutonsEnvoyer) {
        bouton.addEventListener("click", envoyerMessage);
    }

    for (const champ of champsTexte) {
        champ.addEventListener("input", (event) => {
            synchroniserTousLesChamps(event.target.value);
        });
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

synchroniserEtatSaisie();
