/*
  This is free and unencumbered software released into the public domain.
  See http://unlicense.org for more information.
*/

/**
 * A fast and simple hash function with decent collision resistance.
 * Public domain. Attribution: 2018 bryc (github.com/bryc)
 * https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
 */
const hash = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

// --- Execution Queue & Decryption Hooks ---

let sourceDecrypted = true;
const executionQueue = [];

/**
 * Wraps callbacks to respect the state of sourceDecrypted.
 * Used for pages that may need decryption before running UI logic.
 */
const safeCallback = (callback) => {
    return () => {
        executionQueue.push(callback);
        if (sourceDecrypted) {
            while (executionQueue.length > 0) {
                executionQueue.shift()();
            }
        }
    };
};

/**
 * Equivalent to $(document).ready(), but queue-aware for decryption.
 */
const onReady = (callback) => {
    const wrapped = safeCallback(callback);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        wrapped();
    } else {
        window.addEventListener('DOMContentLoaded', wrapped, { once: true });
    }
};

/**
 * Hook to trigger execution of the queue once decryption is complete.
 */
function onDecryption() {
    if (!sourceDecrypted) {
        sourceDecrypted = true;
        onReady(() => {});
    }
}

// --- Shared Overlay System ---

let sharedOverlay = null;

const createSharedOverlay = () => {
    if (sharedOverlay) return sharedOverlay;
    sharedOverlay = document.createElement('div');
    sharedOverlay.id = 'shared-overlay';
    sharedOverlay.className = 'hidden';
    document.body.appendChild(sharedOverlay);
    return sharedOverlay;
};

const showOverlay = (content, className = '') => {
    const overlay = createSharedOverlay();
    overlay.innerHTML = content;
    overlay.className = `active-ref ${className}`;
    
    // Match max-width of main content if possible
    const main = document.querySelector('main');
    if (main) {
        overlay.style.maxWidth = window.getComputedStyle(main).maxWidth;
    }
};

const hideOverlay = () => {
    if (sharedOverlay) {
        sharedOverlay.classList.remove('active-ref');
        sharedOverlay.classList.add('hidden');
    }
};

// --- Footnotes ---

onReady(() => {
    const refs = document.querySelectorAll('.footref');
    refs.forEach(ref => {
        const targetId = ref.getAttribute('href').replace('#', '');
        const target = document.getElementById(targetId);
        if (!target) return;

        // The content is usually in a parent container of the anchor
        const footnoteContainer = target.closest('.footnote') || target.parentElement;

        const doMouseover = () => {
            // Only show if footnote is likely out of view (below the fold)
            const rect = target.getBoundingClientRect();
            if (rect.top > window.innerHeight) {
                showOverlay(footnoteContainer.innerHTML, 'footnote-extract');
            }
        };

        ref.addEventListener('mouseover', doMouseover);
        ref.addEventListener('mouseout', hideOverlay);
        ref.addEventListener('click', hideOverlay);
    });
});

// --- Wikipedia Extracts ---

const wikiCache = {};
let wikiAbortController = null;

onReady(() => {
    const links = document.querySelectorAll('a[href*="wikipedia.org/wiki/"]');
    const pattern = /\/wiki\/(.+)$/;

    links.forEach(link => {
        const href = link.getAttribute('href');
        const match = href.match(pattern);
        if (!match) return;

        const pageTitle = match[1];
        const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;

        const doMouseover = () => {
            if (wikiAbortController) wikiAbortController.abort();
            wikiAbortController = new AbortController();

            if (wikiCache[pageTitle]) {
                showOverlay(`${wikiCache[pageTitle]}<br><br><b>(Wikipedia Extract)</b>`, 'wiki-extract');
            } else {
                fetch(endpoint, { signal: wikiAbortController.signal })
                    .then(res => res.json())
                    .then(data => {
                        if (data.extract) {
                            wikiCache[pageTitle] = data.extract;
                            showOverlay(`${data.extract}<br><br><b>(Wikipedia Extract)</b>`, 'wiki-extract');
                        }
                    })
                    .catch(err => {
                        if (err.name !== 'AbortError') console.error('Wikipedia fetch error:', err);
                    });
            }
        };

        link.addEventListener('mouseover', doMouseover);
        link.addEventListener('mouseout', () => {
            if (wikiAbortController) wikiAbortController.abort();
            hideOverlay();
        });
        link.addEventListener('click', () => {
            if (wikiAbortController) wikiAbortController.abort();
            hideOverlay();
        });
    });
});

// --- Scroll Triggers ---

function bindScrollTriggers(element, over_cb, out_cb) {
    let active = false;
    let top = 0, bottom = 0;

    const updateCoords = () => {
        const rect = element.getBoundingClientRect();
        top = rect.top + window.scrollY;
        bottom = rect.bottom + window.scrollY;
    };

    const checkScroll = () => {
        const windowTop = window.scrollY;
        const windowBottom = window.scrollY + window.innerHeight;

        if (windowBottom > top && windowTop < bottom) {
            if (!active) {
                active = true;
                over_cb();
            }
        } else if (active) {
            active = false;
            out_cb();
        }
    };

    window.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', () => {
        updateCoords();
        checkScroll();
    });

    updateCoords();
    checkScroll();
}

// --- Animation Loop ---

const _animations = new Set();
const _animationFrameCounts = new Map();
let _animationLoopRunning = false;

const _doAnimation = (timestamp) => {
    _animationLoopRunning = true;
    const now = Date.now();

    for (const func of _animations) {
        const f = _animationFrameCounts.get(func) || 0;
        func(f, now);
        _animationFrameCounts.set(func, f + 1);
    }

    if (_animations.size > 0) {
        window.requestAnimationFrame(_doAnimation);
    } else {
        _animationLoopRunning = false;
    }
};

function addAnimation(update_func) {
    _animations.add(update_func);
    _animationFrameCounts.set(update_func, 0);
    if (!_animationLoopRunning) {
        window.requestAnimationFrame(_doAnimation);
    }
}

function removeAnimation(update_func) {
    _animations.delete(update_func);
    _animationFrameCounts.delete(update_func);
}

function animate_when_visible(element, animate_frame_callback) {
    bindScrollTriggers(
        element,
        () => addAnimation(animate_frame_callback),
        () => removeAnimation(animate_frame_callback)
    );
}

// --- Interaction Helpers ---

let mouseDown = 0;
onReady(() => {
    document.body.addEventListener("mousedown", () => { mouseDown = 1; });
    document.body.addEventListener("mouseup", () => { mouseDown = 0; });
});

// --- Image Fullscreen ---

let global_disable_fullscreen_img_on_click = false;
onReady(() => {
    if (global_disable_fullscreen_img_on_click) return;

    const media = document.querySelectorAll('img, svg');
    media.forEach(el => {
        el.addEventListener('click', () => {
            if (el.requestFullscreen) el.requestFullscreen();
        });
    });
});
