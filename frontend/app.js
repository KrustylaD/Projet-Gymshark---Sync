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
let conversationId = localStorage.getItem('currentConversationId') || null;
let enCoursDeReponse = false;

// Sauvegarder le conversationId chaque fois qu'il change
function setConversationId(id) {
    conversationId = id;
    if (id) {
        localStorage.setItem('currentConversationId', id);
        console.log('[FRONTEND] conversationId sauvegardé:', id);
    } else {
        localStorage.removeItem('currentConversationId');
        console.log('[FRONTEND] conversationId réinitialisé');
    }
}

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
    setConversationId(null);
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
    
    const conteneurMessage = document.createElement("div");
    conteneurMessage.style.display = "flex";
    conteneurMessage.style.flexDirection = "column";
    conteneurMessage.style.marginBottom = "12px";
    conteneurMessage.style.alignItems = type === "utilisateur" ? "flex-end" : "flex-start";

    const article = document.createElement("article");
    article.className = `message message-${type}`;
    
    const paragraphe = document.createElement("p");
    paragraphe.textContent = contenu;
    article.append(paragraphe);
    
    conteneurMessage.append(article);
    
    // Ajouter les actions en dessous pour tous les messages
    const barreActions = document.createElement("div");
    barreActions.style.display = "flex";
    barreActions.style.gap = "10px";
    barreActions.style.marginTop = "6px";
    barreActions.style.opacity = "0";
    barreActions.style.transition = "opacity 0.2s ease";
    barreActions.style.pointerEvents = "none";

    // Bouton copier pour tous les messages
    const btnCopier = document.createElement("button");
    btnCopier.textContent = "copy";
    btnCopier.title = "Copier";
    btnCopier.style.padding = "4px 8px";
    btnCopier.style.background = "transparent";
    btnCopier.style.border = "none";
    btnCopier.style.color = "#888";
    btnCopier.style.cursor = "pointer";
    btnCopier.style.fontSize = "11px";
    btnCopier.style.transition = "color 0.2s ease";
    btnCopier.style.fontWeight = "500";

    btnCopier.addEventListener("mouseenter", () => {
        btnCopier.style.color = "#aaa";
    });

    btnCopier.addEventListener("mouseleave", () => {
        btnCopier.style.color = "#888";
    });

    btnCopier.addEventListener("click", () => {
        navigator.clipboard.writeText(contenu).then(() => {
            afficherStatut("Copié!");
        }).catch(() => {
            afficherStatut("Erreur lors de la copie");
        });
    });

    barreActions.append(btnCopier);

    // Bouton éditer seulement pour messages utilisateur
    if (type === "utilisateur") {
        const btnEditer = document.createElement("button");
        btnEditer.textContent = "edit";
        btnEditer.title = "Éditer";
        btnEditer.style.padding = "4px 8px";
        btnEditer.style.background = "transparent";
        btnEditer.style.border = "none";
        btnEditer.style.color = "#888";
        btnEditer.style.cursor = "pointer";
        btnEditer.style.fontSize = "11px";
        btnEditer.style.transition = "color 0.2s ease";
        btnEditer.style.fontWeight = "500";

        btnEditer.addEventListener("mouseenter", () => {
            btnEditer.style.color = "#aaa";
        });

        btnEditer.addEventListener("mouseleave", () => {
            btnEditer.style.color = "#888";
        });
        
        btnEditer.addEventListener("click", () => {
            editerMessage(contenu, article, conteneurMessage);
        });
        
        barreActions.append(btnEditer);
    }

    conteneurMessage.append(barreActions);

    // Afficher/masquer les actions au hover
    conteneurMessage.addEventListener("mouseenter", () => {
        barreActions.style.opacity = "1";
        barreActions.style.pointerEvents = "auto";
    });

    conteneurMessage.addEventListener("mouseleave", () => {
        barreActions.style.opacity = "0";
        barreActions.style.pointerEvents = "none";
    });
    
    filConversation.append(conteneurMessage);
    conteneurMessage.scrollIntoView({ behavior: "smooth", block: "end" });
    return article;
}

// Fonction pour éditer un message
function editerMessage(contenuOriginal, articleOriginal, conteneurMessage) {
    // Créer une boîte d'édition
    const boiteEdition = document.createElement("div");
    boiteEdition.style.position = "fixed";
    boiteEdition.style.top = "50%";
    boiteEdition.style.left = "50%";
    boiteEdition.style.transform = "translate(-50%, -50%)";
    boiteEdition.style.background = "#1a1a2e";
    boiteEdition.style.border = "2px solid #4a7c9e";
    boiteEdition.style.borderRadius = "8px";
    boiteEdition.style.padding = "20px";
    boiteEdition.style.zIndex = "9999";
    boiteEdition.style.minWidth = "400px";
    boiteEdition.style.boxShadow = "0 10px 40px rgba(0,0,0,0.5)";
    boiteEdition.style.color = "#fff";
    
    const titre = document.createElement("h3");
    titre.textContent = "Éditer le message";
    titre.style.marginTop = "0";
    boiteEdition.append(titre);
    
    const textarea = document.createElement("textarea");
    textarea.value = contenuOriginal;
    textarea.style.width = "100%";
    textarea.style.height = "120px";
    textarea.style.padding = "10px";
    textarea.style.marginBottom = "12px";
    textarea.style.borderRadius = "4px";
    textarea.style.border = "1px solid #4a7c9e";
    textarea.style.background = "#0f3460";
    textarea.style.color = "#fff";
    textarea.style.fontFamily = "monospace";
    textarea.style.resize = "vertical";
    boiteEdition.append(textarea);
    
    const btnConteneur = document.createElement("div");
    btnConteneur.style.display = "flex";
    btnConteneur.style.gap = "10px";
    
    const btnValider = document.createElement("button");
    btnValider.textContent = "Valider et régénérer";
    btnValider.style.padding = "10px 16px";
    btnValider.style.background = "#00d4ff";
    btnValider.style.color = "#000";
    btnValider.style.border = "none";
    btnValider.style.borderRadius = "4px";
    btnValider.style.cursor = "pointer";
    btnValider.style.fontWeight = "bold";
    
    const btnAnnuler = document.createElement("button");
    btnAnnuler.textContent = "Annuler";
    btnAnnuler.style.padding = "10px 16px";
    btnAnnuler.style.background = "#4a5568";
    btnAnnuler.style.color = "#fff";
    btnAnnuler.style.border = "none";
    btnAnnuler.style.borderRadius = "4px";
    btnAnnuler.style.cursor = "pointer";
    
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.zIndex = "9998";
    
    const fermer = () => {
        boiteEdition.remove();
        overlay.remove();
    };
    
    btnAnnuler.addEventListener("click", fermer);
    overlay.addEventListener("click", fermer);
    textarea.focus();
    textarea.select();
    
    btnValider.addEventListener("click", async () => {
        const nouveauTexte = textarea.value.trim();
        if (nouveauTexte && nouveauTexte !== contenuOriginal) {
            fermer();
            // Modifier le message original
            const paragraphe = articleOriginal.querySelector("p");
            if (paragraphe) paragraphe.textContent = nouveauTexte;
            
            // Trouver et supprimer la réponse suivante
            let nextElement = conteneurMessage.nextElementSibling;
            if (nextElement && nextElement.classList && nextElement.classList.contains("message-assistant")) {
                nextElement.remove();
            }
            
            // Régénérer la réponse
            await envoyerMessageEtModifier(nouveauTexte);
        } else {
            fermer();
        }
    });
    
    btnConteneur.append(btnValider, btnAnnuler);
    boiteEdition.append(btnConteneur);
    
    document.body.append(overlay, boiteEdition);
}

// Fonction pour envoyer un message modifié
async function envoyerMessageEtModifier(nouveauMessage) {
    enCoursDeReponse = true;
    setInputDisabled(true);
    
    const articleAssistant = creerMessageAssistantVide();
    const paragraphe = articleAssistant ? articleAssistant.querySelector("p") : null;
    
    if (paragraphe) paragraphe.textContent = "...";
    
    try {
        console.log('[FRONTEND] Régénération avec message modifié:', nouveauMessage.slice(0, 50));
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: nouveauMessage, conversationId }),
        });
        console.log('[FRONTEND] Réponse reçue, status:', response.status);

        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';
        let buffer = '';
        let chunkCount = 0;

        if (paragraphe) paragraphe.textContent = "";
        console.log('[FRONTEND] Début de la lecture du stream');

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[FRONTEND] Stream terminé, chunks reçus:', chunkCount);
                break;
            }
            chunkCount++;

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

        afficherStatut("Réponse régénérée.");
        chargerHistorique();
    } catch (err) {
        console.error('Erreur chat:', err);
        if (paragraphe) {
            paragraphe.textContent = `Erreur : ${err.message}`;
        }
        afficherStatut("Erreur lors de la régénération");
    } finally {
        enCoursDeReponse = false;
        setInputDisabled(false);
    }
}

function creerMessageAssistantVide() {
    if (!filConversation) return null;
    
    const conteneurMessage = document.createElement("div");
    conteneurMessage.style.display = "flex";
    conteneurMessage.style.flexDirection = "column";
    conteneurMessage.style.marginBottom = "12px";
    conteneurMessage.style.alignItems = "flex-start";

    const article = document.createElement("article");
    article.className = "message message-assistant";
    const paragraphe = document.createElement("p");
    paragraphe.textContent = "";
    article.append(paragraphe);
    
    conteneurMessage.append(article);

    // Ajouter les actions en dessous
    const barreActions = document.createElement("div");
    barreActions.style.display = "flex";
    barreActions.style.gap = "10px";
    barreActions.style.marginTop = "6px";
    barreActions.style.opacity = "0";
    barreActions.style.transition = "opacity 0.2s ease";
    barreActions.style.pointerEvents = "none";

    // Bouton copier
    const btnCopier = document.createElement("button");
    btnCopier.textContent = "copy";
    btnCopier.title = "Copier";
    btnCopier.style.padding = "4px 8px";
    btnCopier.style.background = "transparent";
    btnCopier.style.border = "none";
    btnCopier.style.color = "#888";
    btnCopier.style.cursor = "pointer";
    btnCopier.style.fontSize = "11px";
    btnCopier.style.transition = "color 0.2s ease";
    btnCopier.style.fontWeight = "500";

    btnCopier.addEventListener("mouseenter", () => {
        btnCopier.style.color = "#aaa";
    });

    btnCopier.addEventListener("mouseleave", () => {
        btnCopier.style.color = "#888";
    });

    btnCopier.addEventListener("click", () => {
        navigator.clipboard.writeText(paragraphe.textContent).then(() => {
            afficherStatut("Copié!");
        }).catch(() => {
            afficherStatut("Erreur lors de la copie");
        });
    });

    barreActions.append(btnCopier);
    conteneurMessage.append(barreActions);

    // Afficher/masquer les actions au hover
    conteneurMessage.addEventListener("mouseenter", () => {
        barreActions.style.opacity = "1";
        barreActions.style.pointerEvents = "auto";
    });

    conteneurMessage.addEventListener("mouseleave", () => {
        barreActions.style.opacity = "0";
        barreActions.style.pointerEvents = "none";
    });

    filConversation.append(conteneurMessage);
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
        console.log('[FRONTEND] Envoi du message:', valeur.slice(0, 50));
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: valeur, conversationId }),
        });
        console.log('[FRONTEND] Réponse reçue, status:', response.status);

        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';
        let buffer = '';
        let chunkCount = 0;

        if (paragraphe) paragraphe.textContent = "";
        console.log('[FRONTEND] Début de la lecture du stream');

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[FRONTEND] Stream terminé, chunks reçus:', chunkCount);
                break;
            }
            chunkCount++;

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
            btn.style.position = "relative";
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.justifyContent = "space-between";
            btn.style.width = "100%";

            if (conv.id === conversationId) {
                btn.classList.add("est-actif");
            }

            const texteBtn = document.createElement("span");
            texteBtn.textContent = conv.title;
            texteBtn.style.flex = "1";
            texteBtn.style.textAlign = "left";
            texteBtn.style.overflow = "hidden";
            texteBtn.style.textOverflow = "ellipsis";
            texteBtn.style.whiteSpace = "nowrap";

            // Menu d'actions au hover
            const menuActions = document.createElement("div");
            menuActions.style.display = "flex";
            menuActions.style.gap = "6px";
            menuActions.style.opacity = "0";
            menuActions.style.transition = "opacity 0.2s ease";
            menuActions.style.pointerEvents = "none";

            const btnSupprimer = document.createElement("button");
            btnSupprimer.textContent = "✕";
            btnSupprimer.title = "Supprimer";
            btnSupprimer.style.padding = "4px 6px";
            btnSupprimer.style.background = "transparent";
            btnSupprimer.style.border = "none";
            btnSupprimer.style.color = "#888";
            btnSupprimer.style.cursor = "pointer";
            btnSupprimer.style.fontSize = "16px";
            btnSupprimer.style.lineHeight = "1";
            btnSupprimer.style.transition = "color 0.2s ease";
            btnSupprimer.style.minWidth = "24px";
            btnSupprimer.style.minHeight = "24px";
            btnSupprimer.style.display = "flex";
            btnSupprimer.style.alignItems = "center";
            btnSupprimer.style.justifyContent = "center";

            btnSupprimer.addEventListener("mouseenter", () => {
                btnSupprimer.style.color = "#ff4444";
            });

            btnSupprimer.addEventListener("mouseleave", () => {
                btnSupprimer.style.color = "#888";
            });

            btnSupprimer.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm(`Supprimer la conversation "${conv.title}" ?`)) {
                    try {
                        const res = await fetch(`${API_BASE}/api/conversations/${conv.id}`, {
                            method: 'DELETE',
                        });
                        if (res.ok) {
                            console.log('[FRONTEND] Conversation supprimée:', conv.id);
                            if (conversationId === conv.id) {
                                setConversationId(null);
                                reinitialiserConversation();
                            }
                            chargerHistorique();
                            afficherStatut(`Conversation supprimée`);
                        }
                    } catch (err) {
                        console.error('Erreur suppression:', err);
                        afficherStatut('Erreur lors de la suppression');
                    }
                }
            });

            menuActions.append(btnSupprimer);

            btn.append(texteBtn, menuActions);

            btn.addEventListener("mouseenter", () => {
                menuActions.style.opacity = "1";
                menuActions.style.pointerEvents = "auto";
            });

            btn.addEventListener("mouseleave", () => {
                menuActions.style.opacity = "0";
                menuActions.style.pointerEvents = "none";
            });

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

        setConversationId(id);
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
        
        // Charger la conversation actuelle si elle existe
        if (conversationId) {
            console.log('[FRONTEND] Chargement de la conversation actuelle:', conversationId);
            chargerConversation(conversationId).then(() => {
                console.log('[FRONTEND] Conversation actuelle chargée');
            });
        }
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
