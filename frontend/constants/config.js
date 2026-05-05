/* ============================================================
   GYMSHARK SYNC — CONSTANTS & CONFIG
   ============================================================ */

/** URL de base du backend Express. */
export const API_BASE = 'http://localhost:3000';

/**
 * Cles de stockage utilisees par le frontend.
 * - conversationId: dernier fil actif (localStorage, persistant)
 * - snapshot: etat visuel du chat (sessionStorage, session courante)
 * - draft: brouillon de saisie (sessionStorage)
 */
export const STORAGE_KEYS = {
    conversationId: 'currentConversationId',
    snapshot: 'chatConversationSnapshot',
    draft: 'chatDraftMessage',
};

/**
 * Regroupe toutes les references DOM manipulees par l'application.
 * Centraliser ces selecteurs simplifie la maintenance et evite de
 * reparcourir le document dans chaque fonction.
 */
export const dom = {
    root: document.documentElement,
    body: document.body,
    loadingScreen: document.querySelector('.ecran-chargement'),
    pageTransition: document.querySelector('.transition-page'),
    sidebar: document.querySelector('.barre-laterale'),
    contentPanel: document.querySelector('.contenu-principal'),
    views: document.querySelectorAll('.vue'),
    chatView: document.querySelector('.vue[data-view="chat"]'),
    navButtons: document.querySelectorAll('[data-view-target]'),
    interactiveButtons: document.querySelectorAll('button'),
    textInputs: document.querySelectorAll('.champ-texte'),
    primaryInput: document.querySelector('.champ-texte'),
    secondaryInput: document.querySelector('.champ-texte-secondaire'),
    sendButtons: document.querySelectorAll('.bouton-envoyer'),
    primarySendButton: document.querySelector('.bouton-envoyer'),
    secondarySendButton: document.querySelector('.bouton-envoyer-secondaire'),
    micButtons: document.querySelectorAll('.bouton-micro'),
    messageForms: document.querySelectorAll('.boite-saisie'),
    inputBoxes: document.querySelectorAll('.boite-saisie'),
    primaryInputBox: document.querySelector('.boite-saisie'),
    secondaryInputBox: document.querySelector('.boite-saisie-secondaire'),
    suggestions: document.querySelectorAll('.suggestion'),
    actionCards: document.querySelectorAll('.carte-action'),
    conversationFeed: document.querySelector('.fil-conversation'),
    statusZone: document.querySelector('.zone-statut'),
    actionButtons: document.querySelectorAll('[data-action]'),
    historyList: document.querySelector('.liste-historique'),
    audioModal: document.querySelector('#modale-audio'),
    closeAudioModalButton: document.querySelector('#bouton-fermer-modale-audio'),
    audioInputSelect: document.querySelector('#select-audio-input'),
    refreshAudioButton: document.querySelector('#bouton-actualiser-audio'),
    testMicButton: document.querySelector('#bouton-test-micro'),
    testSpeakerButton: document.querySelector('#bouton-test-haut-parleur'),
    micLevelBar: document.querySelector('#barre-audio-niveau'),
    micLevelText: document.querySelector('#texte-audio-niveau'),
    micStatus: document.querySelector('#statut-micro-audio'),
    speakerLevelBar: document.querySelector('#barre-audio-sortie'),
    speakerLevelText: document.querySelector('#texte-audio-sortie'),
    speakerStatus: document.querySelector('#statut-sortie-audio'),
};

export const initialConversationMarkup = dom.conversationFeed ? dom.conversationFeed.innerHTML : '';
export const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * Etat global de l'interface.
 * Ce store leger coordonne les vues, le streaming, l'audio et la saisie vocale.
 */
export const state = {
    statusTimer: null,
    conversationId: localStorage.getItem(STORAGE_KEYS.conversationId) || null,
    isResponding: false,
    audioModalOpen: false,
    speechRecognition: null,
    speechActive: false,
    speechShouldRestart: false,
    speechErrored: false,
    speechInput: null,
    speechBaseText: '',
    speechFinalText: '',
    micTestActive: false,
    micStream: null,
    micContext: null,
    micAnalyser: null,
    micSource: null,
    micFrame: null,
    selectedAudioInputId: '',
    speakerContext: null,
    lastFocusedElement: null,
    activeView: document.querySelector('.vue.vue-active')?.dataset.view || 'chat',
    viewSwitchTimer: null,
};
