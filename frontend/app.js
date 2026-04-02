const racine = document.documentElement;
const body = document.body;
const ecranChargement = document.querySelector(".ecran-chargement");
const elementsParallax = document.querySelectorAll(".parallax-profondeur");
const elementsAnimables = document.querySelectorAll(
    ".logo, .bouton-lateral, .section-salutation, .hero-carte, .stat, .boite-saisie, .suggestion, .carte, .zone-aide .aide-bouton, .entete"
);
const cartes = document.querySelectorAll(".carte, .hero-carte");
const spotlight = document.querySelector(".spotlight-cursor");
const champTexte = document.querySelector(".champ-texte");
const boutonEnvoyer = document.querySelector(".bouton-envoyer");
const suggestions = document.querySelectorAll(".suggestion");

for (const element of elementsParallax) {
    const vitesse = Number(element.getAttribute("data-vitesse"));

    if (!Number.isNaN(vitesse)) {
        element.style.setProperty("--vitesse", vitesse.toString());
    }
}

let cibleX = 0;
let cibleY = 0;
let courantX = 0;
let courantY = 0;
let frameParallax = null;

function animerParallax() {
    courantX += (cibleX - courantX) * 0.08;
    courantY += (cibleY - courantY) * 0.08;

    racine.style.setProperty("--decalage-x", `${courantX.toFixed(2)}px`);
    racine.style.setProperty("--decalage-y", `${courantY.toFixed(2)}px`);

    const procheX = Math.abs(cibleX - courantX) < 0.05;
    const procheY = Math.abs(cibleY - courantY) < 0.05;

    if (!procheX || !procheY) {
        frameParallax = requestAnimationFrame(animerParallax);
    } else {
        frameParallax = null;
    }
}

function demanderParallax(x, y) {
    const amplitudeX = 22;
    const amplitudeY = 18;

    cibleX = x * amplitudeX;
    cibleY = y * amplitudeY;

    if (frameParallax === null) {
        frameParallax = requestAnimationFrame(animerParallax);
    }
}

function mettreAJourSpotlight(clientX, clientY) {
    if (!spotlight) {
        return;
    }

    racine.style.setProperty("--spotlight-x", `${clientX}px`);
    racine.style.setProperty("--spotlight-y", `${clientY}px`);
}

function gererPointeur(event) {
    const centreX = window.innerWidth / 2;
    const centreY = window.innerHeight / 2;

    const normaliseX = (event.clientX - centreX) / centreX;
    const normaliseY = (event.clientY - centreY) / centreY;

    mettreAJourSpotlight(event.clientX, event.clientY);
    demanderParallax(normaliseX, normaliseY);
}

if (window.innerWidth > 900) {
    window.addEventListener("mousemove", gererPointeur);

    document.addEventListener("mouseleave", () => {
        demanderParallax(0, 0);
    });
}

window.addEventListener("deviceorientation", (event) => {
    if (window.innerWidth <= 900) {
        return;
    }

    const gamma = event.gamma || 0;
    const beta = event.beta || 0;

    const normaliseX = Math.max(-1, Math.min(1, gamma / 30));
    const normaliseY = Math.max(-1, Math.min(1, beta / 45));

    demanderParallax(normaliseX, normaliseY);
});

for (const [index, element] of elementsAnimables.entries()) {
    element.classList.add("animable");
    element.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
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
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px"
    }
);

for (const element of elementsAnimables) {
    observateur.observe(element);
}

window.addEventListener("load", () => {
    setTimeout(() => {
        if (ecranChargement) {
            ecranChargement.classList.add("cache");
        }

        body.classList.add("page-chargee");
    }, 1750);
});

for (const carte of cartes) {
    carte.addEventListener("mousemove", (event) => {
        if (window.innerWidth <= 900) {
            return;
        }

        const rect = carte.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const centreX = rect.width / 2;
        const centreY = rect.height / 2;

        const rotationY = ((x - centreX) / centreX) * 5;
        const rotationX = -((y - centreY) / centreY) * 5;
        const translation = carte.classList.contains("hero-carte") ? -8 : -6;

        carte.style.transform = `perspective(900px) rotateX(${rotationX}deg) rotateY(${rotationY}deg) translateY(${translation}px)`;
    });

    carte.addEventListener("mouseleave", () => {
        carte.style.transform = "";
    });
}

for (const suggestion of suggestions) {
    suggestion.addEventListener("click", () => {
        if (!champTexte) {
            return;
        }

        champTexte.value = suggestion.textContent;
        champTexte.focus();
    });
}

if (boutonEnvoyer && champTexte) {
    boutonEnvoyer.addEventListener("click", () => {
        const valeur = champTexte.value.trim();

        if (!valeur) {
            champTexte.focus();
            return;
        }

        boutonEnvoyer.style.transform = "scale(0.94)";
        setTimeout(() => {
            boutonEnvoyer.style.transform = "";
        }, 120);

        console.log("Message envoyé :", valeur);
    });

    champTexte.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            boutonEnvoyer.click();
        }
    });
}
