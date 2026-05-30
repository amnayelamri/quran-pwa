// ── Config ──────────────────────────────────────────────────────────────────
const TOTAL_PAGES = 485;

// Detect environment
const IS_GITHUB_PAGES = window.location.hostname.includes('github.io');

// Image URL — relative on GitHub Pages, served by local server otherwise
const PAGE_IMG_URL = (n) => {
  const file = `page-${String(n).padStart(3,'0')}.jpg`;
  return IS_GITHUB_PAGES
    ? `../data/pages/${file}`
    : `http://${window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname}:3001/pages/${file}`;
};

// API URL
const API_BASE = IS_GITHUB_PAGES
  ? null
  : `http://${window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname}:3001/api`;

// Sur GitHub Pages : URL du fichier elements.json publié
const ELEMENTS_JSON_URL = IS_GITHUB_PAGES ? '../data/elements.json' : null;

// ── State ────────────────────────────────────────────────────────────────────
let currentPage = parseInt(localStorage.getItem('quran-page') || '1');
let panelOpen = false;
let elementsCache = {};    // { pageNum: [...elements] }
let isAnimating = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const quranTrack   = document.getElementById('quran-track');
const imgPrev      = document.getElementById('img-prev');
const imgCurr      = document.getElementById('img-curr');
const imgNext      = document.getElementById('img-next');
const spinner      = document.getElementById('loading-spinner');
const pageNumber   = document.getElementById('page-number');
const elementsPanel = document.getElementById('elements-panel');
const elementsList  = document.getElementById('elements-list');
const elementsEmpty = document.getElementById('elements-empty');
const elementsPageNum = document.getElementById('elements-page-num');
const gotoModal    = document.getElementById('goto-modal');
const gotoInput    = document.getElementById('goto-input');
const swipeHint    = document.getElementById('swipe-hint');

// ── Page images ──────────────────────────────────────────────────────────────
function loadPage(page) {
  // Clamp
  page = Math.max(1, Math.min(TOTAL_PAGES, page));

  spinner.classList.remove('hidden');
  imgCurr.style.opacity = '0';

  imgCurr.onload = () => {
    spinner.classList.add('hidden');
    imgCurr.style.opacity = '1';
  };
  imgCurr.onerror = () => {
    spinner.classList.add('hidden');
    imgCurr.style.opacity = '1';
    imgCurr.alt = `الصفحة ${page} - تعذّر التحميل`;
  };

  imgCurr.src = PAGE_IMG_URL(page);
  imgCurr.style.transition = 'opacity 0.3s';

  // Preload neighbors
  if (page > 1)           imgPrev.src = PAGE_IMG_URL(page - 1);
  if (page < TOTAL_PAGES) imgNext.src = PAGE_IMG_URL(page + 1);

  pageNumber.textContent = page;
  document.title = `القرآن - صفحة ${page}`;
  currentPage = page;
  localStorage.setItem('quran-page', page);
}

// ── Vertical navigation ──────────────────────────────────────────────────────
function goTo(newPage, direction /* 'up'|'down' */) {
  if (isAnimating) return;
  newPage = Math.max(1, Math.min(TOTAL_PAGES, newPage));
  if (newPage === currentPage) return;

  isAnimating = true;

  // L'image qui va devenir visible est déjà pré-chargée dans imgNext ou imgPrev
  const incomingImg = direction === 'down' ? imgNext : imgPrev;

  // S'assurer que l'image de destination est chargée
  incomingImg.src = PAGE_IMG_URL(newPage);

  const offset = direction === 'down' ? '-100%' : '100%';
  quranTrack.style.transition = 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
  quranTrack.style.transform = `translateY(${offset})`;

  quranTrack.addEventListener('transitionend', function handler() {
    quranTrack.removeEventListener('transitionend', handler);

    // 1. Copier l'image visible dans imgCurr (pas encore visible, masquée par le transform)
    imgCurr.src = incomingImg.src;
    imgCurr.style.opacity = '1';
    imgCurr.style.transition = '';
    spinner.classList.add('hidden');

    // 2. Double rAF : garantit que le GPU a fini de peindre l'image avant le reset
    //    (corrige le flash en mode standalone iOS)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        quranTrack.style.transition = 'none';
        quranTrack.style.transform = '';

        currentPage = newPage;
        pageNumber.textContent = newPage;
        document.title = `القرآن - صفحة ${newPage}`;
        localStorage.setItem('quran-page', newPage);

        if (newPage > 1)           imgPrev.src = PAGE_IMG_URL(newPage - 1);
        if (newPage < TOTAL_PAGES) imgNext.src = PAGE_IMG_URL(newPage + 1);

        isAnimating = false;
      });
    });
  });
}

function nextPage() { goTo(currentPage + 1, 'down'); }
function prevPage() { goTo(currentPage - 1, 'up'); }

// ── Elements panel ───────────────────────────────────────────────────────────
// Cache global du fichier elements.json (GitHub Pages)
let _allElementsCache = null;
async function getAllElements() {
  if (_allElementsCache) return _allElementsCache;
  try {
    const res = await fetch(ELEMENTS_JSON_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    _allElementsCache = await res.json();
    return _allElementsCache;
  } catch {
    return {};
  }
}

async function fetchElements(page) {
  if (elementsCache[page] !== undefined) return elementsCache[page];
  if (IS_GITHUB_PAGES) {
    const all  = await getAllElements();
    const data = all[page] || [];
    elementsCache[page] = data;
    return data;
  }
  try {
    const res = await fetch(`${API_BASE}/elements/${page}`);
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    elementsCache[page] = data;
    return data;
  } catch {
    return [];
  }
}

function renderElements(elements) {
  elementsList.innerHTML = '';
  if (!elements || elements.length === 0) {
    elementsEmpty.style.display = 'block';
    return;
  }
  elementsEmpty.style.display = 'none';

  elements.forEach(el => {
    const card = document.createElement('div');
    card.className = 'element-card';

    const typeLabels = { note: 'ملاحظة', audio: 'صوت', image: 'صورة', link: 'رابط' };
    const typeLabel = typeLabels[el.type] || el.type;

    let bodyHTML = '';
    if (el.type === 'note') {
      bodyHTML = `<div class="el-body">${escapeHtml(el.content)}</div>`;
    } else if (el.type === 'audio') {
      bodyHTML = `<audio controls src="${escapeHtml(el.url)}"></audio>`;
      if (el.content) bodyHTML += `<div class="el-body">${escapeHtml(el.content)}</div>`;
    } else if (el.type === 'image') {
      bodyHTML = `<img class="el-image" src="${escapeHtml(el.url)}" alt="${escapeHtml(el.title || '')}" />`;
      if (el.content) bodyHTML += `<div class="el-body">${escapeHtml(el.content)}</div>`;
    } else if (el.type === 'link') {
      bodyHTML = `<a class="el-link" href="${escapeHtml(el.url)}" target="_blank" rel="noopener">${escapeHtml(el.url)}</a>`;
      if (el.content) bodyHTML += `<div class="el-body">${escapeHtml(el.content)}</div>`;
    }

    card.innerHTML = `
      <div class="el-type">${typeLabel}</div>
      ${el.title ? `<div class="el-title">${escapeHtml(el.title)}</div>` : ''}
      ${bodyHTML}
    `;
    elementsList.appendChild(card);
  });
}

async function openPanel() {
  panelOpen = true;
  elementsPanel.classList.add('open');
  elementsPageNum.textContent = currentPage;
  const elements = await fetchElements(currentPage);
  renderElements(elements);
}

function closePanel() {
  panelOpen = false;
  elementsPanel.classList.remove('open');
}

// ── Touch / swipe ────────────────────────────────────────────────────────────
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let swipeAxis = null; // 'h' or 'v'

document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = Date.now();
  swipeAxis = null;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!swipeAxis) {
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 8 || dy > 8) swipeAxis = dx > dy ? 'h' : 'v';
  }
  if (swipeAxis === 'h') e.preventDefault(); // prevent scroll when swiping panel
}, { passive: false });

document.addEventListener('touchend', (e) => {
  const dt = Date.now() - touchStartTime;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;

  const minSwipe = 50;
  const maxTime  = 600;

  if (dt > maxTime) return;

  if (swipeAxis === 'v' && Math.abs(dy) > minSwipe && !panelOpen) {
    if (dy < 0) nextPage(); // swipe up → next page
    else        prevPage(); // swipe down → prev page
  }

  if (swipeAxis === 'h' && Math.abs(dx) > minSwipe) {
    if (!panelOpen && dx < 0) openPanel();  // swipe left → open panel (depuis droite)
    if (panelOpen  && dx > 0) closePanel(); // swipe right → close panel
  }
});

// Close panel when clicking outside
elementsPanel.addEventListener('click', (e) => e.stopPropagation());
document.getElementById('main-container').addEventListener('click', () => {
  if (panelOpen) closePanel();
});

// ── Header buttons ────────────────────────────────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', prevPage);
document.getElementById('btn-next').addEventListener('click', nextPage);
document.getElementById('btn-goto').addEventListener('click', () => {
  gotoInput.value = currentPage;
  gotoModal.classList.remove('hidden');
  gotoInput.focus();
});

document.getElementById('goto-confirm').addEventListener('click', () => {
  const p = parseInt(gotoInput.value);
  if (p >= 1 && p <= TOTAL_PAGES) {
    goTo(p, p > currentPage ? 'down' : 'up');
    gotoModal.classList.add('hidden');
  }
});
document.getElementById('goto-cancel').addEventListener('click', () => {
  gotoModal.classList.add('hidden');
});
gotoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('goto-confirm').click();
  if (e.key === 'Escape') document.getElementById('goto-cancel').click();
});

// Keyboard navigation (desktop)
document.addEventListener('keydown', (e) => {
  if (gotoModal.classList.contains('hidden')) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') nextPage();
    if (e.key === 'ArrowUp'   || e.key === 'PageUp')   prevPage();
    if (e.key === 'ArrowRight') panelOpen ? closePanel() : openPanel();
    if (e.key === 'ArrowLeft')  closePanel();
    if (e.key === 'Escape')     closePanel();
  }
});

// Mouse wheel navigation
document.addEventListener('wheel', (e) => {
  if (panelOpen) return;
  if (e.deltaY > 30) nextPage();
  if (e.deltaY < -30) prevPage();
}, { passive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Swipe hint (show once, then fade) ────────────────────────────────────────
function showHint() {
  if (localStorage.getItem('hint-shown')) {
    swipeHint.style.display = 'none';
    return;
  }
  setTimeout(() => {
    swipeHint.classList.add('fade');
    setTimeout(() => {
      swipeHint.style.display = 'none';
      localStorage.setItem('hint-shown', '1');
    }, 1000);
  }, 3000);
}

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Bannière iOS ─────────────────────────────────────────────────────────────
function showIOSBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('ios-banner-dismissed');
  if (!isIOS || isStandalone || dismissed) return;

  const banner = document.getElementById('ios-banner');
  banner.classList.remove('hidden');
  document.getElementById('ios-banner-close').addEventListener('click', () => {
    banner.classList.add('hidden');
    localStorage.setItem('ios-banner-dismissed', '1');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadPage(currentPage);
showHint();
showIOSBanner();
