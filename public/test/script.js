const root = document.documentElement;

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

window.addEventListener("pageshow", (event) => {
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const isReload = navigationEntry?.type === "reload";
  const isBackForward = navigationEntry?.type === "back_forward";

  if (window.location.hash === "#") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  if (!window.location.hash && !isBackForward) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  if (isReload || event.persisted) {
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
});

const primaryCta = document.querySelector(".cta--primary");
const heroMedia = document.querySelector(".hero__media");
const mobilePreviewStage = document.querySelector(".mobile-preview__stage");
const revealTargets = document.querySelectorAll(".problem-intro, .how-works, .support-section, .yardao-marquee, .mobile-preview, .product-overview, .feature-tour, .social-proof, .final-cta");
const commandButtons = document.querySelectorAll(".zao-command");
const typedCommand = document.querySelector(".typed-command");
const statusLabel = document.querySelector(".zao-status");
const metricCards = document.querySelectorAll(".zao-metric");
const confirmMessage = document.querySelector(".zao-confirm");
const tourCarousel = document.querySelector(".feature-tour");
const tourGrid = document.querySelector(".feature-tour__grid");
const tourSteps = document.querySelectorAll(".tour-step");
const tourPanels = document.querySelectorAll(".tour-panel");
const tourTabs = document.querySelectorAll(".tour-tab");
const tourPrev = document.querySelector(".tour-arrow--prev");
const tourNext = document.querySelector(".tour-arrow--next");
const tourProgress = document.querySelector(".tour-progress");
const reviewCarousel = document.querySelector(".review-carousel");
const reviewCards = document.querySelectorAll(".review-card");
const reviewPrev = document.querySelector(".review-arrow--prev");
const reviewNext = document.querySelector(".review-arrow--next");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const zaoCommands = [
  {
    command: "Book HN74 for tyres on Friday",
    status: "Booking confirmed",
    metricTitle: "HN74ABC",
    metricValue: "Booked",
    metricMeta: "Friday 10:00",
    confirm: "Booked. HN74ABC - Tyres x4 at Joe's Garage, Friday 10:00. Dashboard updated."
  },
  {
    command: "Show vehicles waiting for MOT this week",
    status: "MOT list ready",
    metricTitle: "MOT due",
    metricValue: "3",
    metricMeta: "This week",
    confirm: "Found 3 MOTs due this week. Priority vehicles highlighted on the dashboard."
  },
  {
    command: "Move BX24 from Joe's to bodyshop",
    status: "Vehicle moved",
    metricTitle: "BX24",
    metricValue: "Bodyshop",
    metricMeta: "Status updated",
    confirm: "Moved BX24 from Joe's Garage to bodyshop. Stock location is now up to date."
  }
];
let commandTypeTimer;

function syncHeaderState() {
  root.classList.toggle("is-scrolled", window.scrollY > 16);
}

function setLoadedState() {
  requestAnimationFrame(() => {
    root.classList.add("is-loaded");
    syncHeaderState();
  });
}

window.addEventListener("DOMContentLoaded", setLoadedState);
window.addEventListener("scroll", syncHeaderState, { passive: true });

function setActiveCommand(index, shouldType = true) {
  const item = zaoCommands[index % zaoCommands.length];

  commandButtons.forEach((button, buttonIndex) => {
    button.classList.toggle("is-active", buttonIndex === index);
  });

  if (statusLabel) statusLabel.textContent = item.status;
  if (confirmMessage) {
    confirmMessage.innerHTML = `<span class="confirm-dot" aria-hidden="true"></span>${item.confirm}`;
  }

  const updatingCard = metricCards[0];
  if (updatingCard) {
    updatingCard.classList.remove("is-updating");
    updatingCard.offsetHeight;
    updatingCard.classList.add("is-updating");
    updatingCard.innerHTML = `<span>${item.metricTitle}</span><strong>${item.metricValue}</strong><small>${item.metricMeta}</small>`;
  }

  if (!typedCommand) return;
  window.clearInterval(commandTypeTimer);
  if (!shouldType || prefersReducedMotion) {
    typedCommand.textContent = item.command;
    return;
  }

  typedCommand.textContent = "";
  let characterIndex = 0;
  commandTypeTimer = window.setInterval(() => {
    typedCommand.textContent += item.command.charAt(characterIndex);
    characterIndex += 1;
    if (characterIndex >= item.command.length) {
      window.clearInterval(commandTypeTimer);
    }
  }, 28);
}

commandButtons.forEach((button, index) => {
  button.addEventListener("click", () => setActiveCommand(index));
});

if (commandButtons.length) {
  let activeCommand = 0;
  window.setInterval(() => {
    activeCommand = (activeCommand + 1) % commandButtons.length;
    setActiveCommand(activeCommand);
  }, prefersReducedMotion ? 9000 : 5600);
}

let activeTourIndex = 0;

function setActiveTourStep(target) {
  if (!tourSteps.length) return;

  const targetIndex = typeof target === "number"
    ? target
    : Array.from(tourSteps).findIndex((step) => step.dataset.tourStep === target);
  const nextIndex = (targetIndex + tourSteps.length) % tourSteps.length;
  const stepId = tourSteps[nextIndex].dataset.tourStep;

  activeTourIndex = nextIndex;

  tourSteps.forEach((step, index) => {
    const isActive = index === nextIndex;
    step.classList.toggle("is-active", isActive);
    step.setAttribute("aria-hidden", String(!isActive));
  });

  tourPanels.forEach((panel) => {
    const isActive = panel.dataset.tourPanel === stepId;
    panel.classList.toggle("is-active", isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  tourTabs.forEach((tab, index) => {
    const isActive = tab.dataset.tourTarget === stepId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive && index === nextIndex) {
      tab.scrollIntoView({ inline: "center", block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  });

  if (tourProgress) {
    tourProgress.textContent = `${String(nextIndex + 1).padStart(2, "0")} / ${String(tourSteps.length).padStart(2, "0")}`;
  }
}

function goToAdjacentTourStep(direction) {
  setActiveTourStep(activeTourIndex + direction);
}

tourTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTourStep(tab.dataset.tourTarget));
});

if (tourPrev) tourPrev.addEventListener("click", () => goToAdjacentTourStep(-1));
if (tourNext) tourNext.addEventListener("click", () => goToAdjacentTourStep(1));

if (tourCarousel) {
  tourCarousel.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    goToAdjacentTourStep(event.key === "ArrowRight" ? 1 : -1);
  });
}

if (tourGrid) {
  let swipeStartX = 0;
  let swipeStartY = 0;

  tourGrid.addEventListener("pointerdown", (event) => {
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
  });

  tourGrid.addEventListener("pointerup", (event) => {
    const deltaX = event.clientX - swipeStartX;
    const deltaY = event.clientY - swipeStartY;

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    goToAdjacentTourStep(deltaX < 0 ? 1 : -1);
  });
}

let activeReviewIndex = 0;
let reviewTimer;

function getVisibleReviewCount() {
  return window.matchMedia("(max-width: 920px)").matches ? 1 : 3;
}

function getMaxReviewIndex() {
  return Math.max(0, reviewCards.length - getVisibleReviewCount());
}

function setActiveReview(index) {
  if (!reviewCarousel || !reviewCards.length) return;
  const maxIndex = getMaxReviewIndex();
  activeReviewIndex = Math.max(0, Math.min(index, maxIndex));
  reviewCarousel.style.setProperty("--review-index", activeReviewIndex);
}

function goToAdjacentReview(direction) {
  const maxIndex = getMaxReviewIndex();
  const nextIndex = activeReviewIndex + direction;
  setActiveReview(nextIndex > maxIndex ? 0 : nextIndex < 0 ? maxIndex : nextIndex);
}

function restartReviewTimer() {
  window.clearInterval(reviewTimer);
  if (!reviewCarousel || prefersReducedMotion) return;
  reviewTimer = window.setInterval(() => goToAdjacentReview(1), 5200);
}

if (reviewCarousel && reviewCards.length) {
  setActiveReview(0);
  restartReviewTimer();

  if (reviewPrev) {
    reviewPrev.addEventListener("click", () => {
      goToAdjacentReview(-1);
      restartReviewTimer();
    });
  }

  if (reviewNext) {
    reviewNext.addEventListener("click", () => {
      goToAdjacentReview(1);
      restartReviewTimer();
    });
  }

  window.addEventListener("resize", () => setActiveReview(activeReviewIndex));
}

if (primaryCta) {
  primaryCta.addEventListener("pointermove", (event) => {
    const rect = primaryCta.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    primaryCta.style.setProperty("--pointer-x", `${x}px`);
    primaryCta.style.setProperty("--pointer-y", `${y}px`);
  });
}

if (heroMedia) {
  heroMedia.addEventListener("pointermove", (event) => {
    const rect = heroMedia.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    heroMedia.style.setProperty("--parallax-x", `${x * 12}px`);
    heroMedia.style.setProperty("--parallax-y", `${y * 10}px`);
    heroMedia.style.setProperty("--tilt-x", `${y * -3}deg`);
    heroMedia.style.setProperty("--tilt-y", `${x * 3}deg`);
  });

  heroMedia.addEventListener("pointerleave", () => {
    heroMedia.style.setProperty("--parallax-x", "0px");
    heroMedia.style.setProperty("--parallax-y", "0px");
    heroMedia.style.setProperty("--tilt-x", "0deg");
    heroMedia.style.setProperty("--tilt-y", "0deg");
  });
}

if (mobilePreviewStage && !prefersReducedMotion) {
  mobilePreviewStage.addEventListener("pointermove", (event) => {
    const rect = mobilePreviewStage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    mobilePreviewStage.style.setProperty("--mobile-parallax-x", `${x * 10}px`);
    mobilePreviewStage.style.setProperty("--mobile-parallax-y", `${y * 12}px`);
  });

  mobilePreviewStage.addEventListener("pointerleave", () => {
    mobilePreviewStage.style.setProperty("--mobile-parallax-x", "0px");
    mobilePreviewStage.style.setProperty("--mobile-parallax-y", "0px");
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealTargets.forEach((target) => observer.observe(target));

  if (tourSteps.length && tourPanels.length) setActiveTourStep(0);
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
  if (tourSteps.length) setActiveTourStep(0);
}
