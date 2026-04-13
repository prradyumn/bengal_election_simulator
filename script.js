/* ============================================================
   RED LIGHT, GREEN LIGHT — GAME LOGIC
   2-screen scrolling course with big doll watcher
   ============================================================
   Structure:
     1.  SETTINGS  (all tunable values)
     2.  ASSET PATHS
     3.  AUDIO SETUP
     4.  STATE VARIABLES
     5.  DOM REFERENCES
     6.  INITIALIZATION & SCALING
     7.  CHARACTER SELECTION
     8.  GAME START / COUNTDOWN
     9.  GAME LOOP
    10.  INPUT HANDLING
    11.  LIGHT CYCLE SYSTEM
    12.  CAMERA / SCROLLING
    13.  PLAYER MOVEMENT
    14.  NPC AI
    15.  WIN / LOSS DETECTION
    16.  OVERLAYS & HUD
    17.  RESET / RESTART
    18.  UTILITIES
   ============================================================ */

/* ----------------------------------------------------------
   1. SETTINGS — edit these to tune gameplay & layout
   ---------------------------------------------------------- */
const SETTINGS = {
    // ── Viewport (one screen) ──
    stageWidth:  1365,
    stageHeight: 768,

    // ── Total course = 2 screens ──
    totalWidth: 2730,          // 1365 × 2

    // ── Timer (seconds) — longer because distance is doubled ──
    roundDuration: 42,

    // ── Player ──
    playerSpeed:        300,   // px/s
    playerStartX:       90,    // px from left of the full stage
    playerHeight:       220,   // display height px
    playerGroundBottom:  50,   // px above bottom edge

    // ── NPC ──
    npcSpeed:           260,
    npcStartX:          55,
    npcHeight:          200,
    npcGroundBottom:    50,

    // ── Watcher / Big Doll (Mamta) ──
    // Size & position now controlled in CSS (#watcher).
    // She is ALWAYS visible on the right side of the viewport.
    // To resize her, edit #watcher { height; right; bottom } in style.css.

    // ── Finish Line ──
    finishLineX: 2250,         // just before the watcher on screen 2

    // ── Light Cycle durations (seconds) ──
    greenDurationMin: 1.8,
    greenDurationMax: 3.8,
    redDurationMin:   1.2,
    redDurationMax:   2.5,

    // ── Watcher turn transition delay (seconds) ──
    transitionDelay: 0.35,

    // ── Grace period: ms player has to stop after red light begins ──
    reactionGrace: 150,

    // ── NPC AI ──
    npcMoveChance:   0.65,
    npcDecisionRate: 0.6,      // seconds between AI decisions
    npcFailChance:   0.07,     // chance/frame NPC gets caught during red
    npcSpeedJitter:  0.25,     // ±fraction of npcSpeed

    // ── Camera ──
    cameraLead: 0.28,          // player position as fraction of viewport from left
    cameraSmooth: 0.10,        // lerp factor (0–1); higher = snappier
};

/* ----------------------------------------------------------
   2. ASSET PATHS
   Filenames with spaces are fine in JS strings.
   Update here if you rename or move asset files.
   ---------------------------------------------------------- */
const ASSETS = {
    background: 'main bg.png',          // used twice (tiled)

    // Watcher (Mamta) — BIG DOLL
    watcherGreen: 'forward mamta.png',   // facing RIGHT = away from players = GREEN
    watcherRed:   'backward mamta.png',  // facing LEFT  = toward players   = RED

    // Raga
    ragaStand: 'raga.png',
    ragaWalk:  'raga gif.gif',

    // Modi
    modiStand: 'modi.png',
    modiWalk:  'modi gif.gif',

    // Audio — update filenames here if they differ
    audio: {
        bgMusic:      'main bg music.mp3',
        lossSound:    'loss sound.mp3',    // Loss SFX variant 1 (default)
        lossSound1:   'loss sound 1.mp3',  // Loss SFX variant 2 (toggled via HUD button)
        winSound:     'win sound.mp3',
        turningSound: 'turning back sound.mp3',
    },
};

/* ----------------------------------------------------------
   3. AUDIO SETUP
   ---------------------------------------------------------- */
const AUDIO = {
    bgMusic:      new Audio(ASSETS.audio.bgMusic),
    lossSound:    new Audio(ASSETS.audio.lossSound),
    lossSound1:   new Audio(ASSETS.audio.lossSound1),
    winSound:     new Audio(ASSETS.audio.winSound),
    turningSound: new Audio(ASSETS.audio.turningSound),
};

AUDIO.bgMusic.loop   = true;
AUDIO.bgMusic.volume = 0.35;
AUDIO.lossSound.volume    = 0.7;
AUDIO.lossSound1.volume   = 0.7;
AUDIO.winSound.volume     = 0.7;
AUDIO.turningSound.volume = 0.6;

let audioMuted = false;

// Loss-sound variant selector: 0 = AUDIO.lossSound, 1 = AUDIO.lossSound1
let activeLossIndex = 0;
function getActiveLossSound() {
    return activeLossIndex === 0 ? AUDIO.lossSound : AUDIO.lossSound1;
}

function playSound(audioObj) {
    if (audioMuted) return;
    audioObj.currentTime = 0;
    audioObj.play().catch(() => { /* autoplay blocked until user interacts */ });
}

function stopSound(audioObj) {
    audioObj.pause();
    audioObj.currentTime = 0;
}

function pauseBgMusic() { AUDIO.bgMusic.pause(); }

function resumeBgMusic() {
    if (audioMuted) return;
    AUDIO.bgMusic.play().catch(() => {});
}

function setMuteState(muted) {
    audioMuted = muted;
    if (muted) {
        AUDIO.bgMusic.pause();
    } else if (gameState === 'playing') {
        AUDIO.bgMusic.play().catch(() => {});
    }
    muteBtn.innerHTML = muted ? '&#128263;' : '&#128264;';
}

/* ----------------------------------------------------------
   4. STATE VARIABLES
   ---------------------------------------------------------- */
let gameState      = 'poster';  // poster | select | intro | countdown | playing | won | lost
let lightState     = 'green';    // green | red | transition
let selectedChar   = null;       // 'raga' | 'modi'

// Player
let playerX          = 0;        // distance traveled from start
let playerMoving     = false;
let playerPrevMoving = false;

// NPC
let npcX             = 0;
let npcMoving        = false;
let npcPrevMoving    = false;
let npcEliminated    = false;
let npcDecisionTimer = 0;
let npcWantsToMove   = false;

// Light cycle
let lightTimer = 0;
let graceTimer = 0;
let isInGrace  = false;

// Round timer
let roundTimeLeft = 0;

// Camera
let cameraX = 0;

// Game loop
let lastFrameTime = 0;
let animFrameId   = null;

// Dynamic asset references (set after character selection)
let playerAssets = { stand: '', walk: '', name: '' };
let npcAssets    = { stand: '', walk: '', name: '' };

/* ----------------------------------------------------------
   5. DOM REFERENCES
   ---------------------------------------------------------- */
const gameWrapper      = document.getElementById('game-wrapper');
const gameStage        = document.getElementById('game-stage');
const startLine        = document.getElementById('start-line');
const finishLine       = document.getElementById('finish-line');

const watcherEl        = document.getElementById('watcher');
const watcherSprite    = document.getElementById('watcher-sprite');

const npcEl            = document.getElementById('npc');
const npcSprite        = document.getElementById('npc-sprite');

const playerEl         = document.getElementById('player');
const playerSprite     = document.getElementById('player-sprite');

const eliminationFlash = document.getElementById('elimination-flash');

// HUD
const timerDisplay     = document.getElementById('timer-display');
const lightIndicator   = document.getElementById('light-indicator');
const statusText       = document.getElementById('status-text');
const muteBtn          = document.getElementById('mute-btn');
const restartBtn       = document.getElementById('restart-btn');
const lossSoundBtn     = document.getElementById('loss-sound-btn');

// Overlays
const selectOverlay    = document.getElementById('select-overlay');
const introOverlay     = document.getElementById('intro-overlay');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText    = document.getElementById('countdown-text');
const resultOverlay    = document.getElementById('result-overlay');
const resultTitle      = document.getElementById('result-title');
const resultReason     = document.getElementById('result-reason');
const resultTime       = document.getElementById('result-time');
const resultRestartBtn = document.getElementById('result-restart-btn');
const posterOverlay    = document.getElementById('poster-overlay');
const posterStartBtn   = document.getElementById('poster-start-btn');
const startBtn         = document.getElementById('start-btn');

const charCards        = document.querySelectorAll('.char-card');

// Mobile
const mobileControls = document.getElementById('mobile-controls');
const mobileMoveBtn  = document.getElementById('mobile-move-btn');

/* ----------------------------------------------------------
   6. INITIALIZATION & RESPONSIVE SCALING
   ---------------------------------------------------------- */

/** Scale the viewport wrapper to fit the browser window. */
function resizeGame() {
    const scaleX = window.innerWidth  / SETTINGS.stageWidth;
    const scaleY = window.innerHeight / SETTINGS.stageHeight;
    gameWrapper.style.transform = `scale(${Math.min(scaleX, scaleY)})`;
}
window.addEventListener('resize', resizeGame);
resizeGame();

/** Show mobile button on touch devices. */
function detectTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    mobileControls.style.display = isTouch ? 'block' : 'none';
}
detectTouch();

posterStartBtn?.addEventListener('click', () => {
    gameState = 'select';
    showOverlay('select');
});

/** Position every game element using SETTINGS. Called once on boot & on reset. */
function layoutScene() {
    // Stage width = 2 screens
    gameStage.style.width = SETTINGS.totalWidth + 'px';

    // Finish line
    finishLine.style.left = SETTINGS.finishLineX + 'px';

    // Watcher (big doll) — positioned by CSS (fixed in viewport, always visible).
    // No JS positioning needed; she stays on the right side of the screen at all times.

    // Player
    playerEl.style.left   = SETTINGS.playerStartX + 'px';
    playerEl.style.bottom = SETTINGS.playerGroundBottom + 'px';
    playerEl.style.height = SETTINGS.playerHeight + 'px';

    // NPC
    npcEl.style.left   = SETTINGS.npcStartX + 'px';
    npcEl.style.bottom = SETTINGS.npcGroundBottom + 'px';
    npcEl.style.height = SETTINGS.npcHeight + 'px';
}

/** Preload images so sprite-swaps are instant. */
function preloadAssets() {
    [
        ASSETS.watcherGreen, ASSETS.watcherRed,
        ASSETS.ragaStand, ASSETS.ragaWalk,
        ASSETS.modiStand, ASSETS.modiWalk,
        ASSETS.background,
    ].forEach(url => { const i = new Image(); i.src = url; });
}

preloadAssets();
layoutScene();

/* ----------------------------------------------------------
   7. CHARACTER SELECTION
   ---------------------------------------------------------- */

charCards.forEach(card => {
    card.addEventListener('click', () => {
        charCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        selectedChar = card.dataset.char;

        if (selectedChar === 'raga') {
            playerAssets = { stand: ASSETS.ragaStand, walk: ASSETS.ragaWalk, name: 'Raga' };
            npcAssets    = { stand: ASSETS.modiStand, walk: ASSETS.modiWalk, name: 'Modi' };
        } else {
            playerAssets = { stand: ASSETS.modiStand, walk: ASSETS.modiWalk, name: 'Modi' };
            npcAssets    = { stand: ASSETS.ragaStand, walk: ASSETS.ragaWalk, name: 'Raga' };
        }

        playerSprite.src = playerAssets.stand;
        npcSprite.src    = npcAssets.stand;
        setCharLabels();

        setTimeout(() => showOverlay('intro'), 300);
    });
});

function setCharLabels() {
    playerEl.querySelector('.char-label')?.remove();
    npcEl.querySelector('.char-label')?.remove();

    const pLabel = document.createElement('div');
    pLabel.className = 'char-label';
    pLabel.textContent = 'YOU';
    playerEl.appendChild(pLabel);

    const nLabel = document.createElement('div');
    nLabel.className = 'char-label';
    nLabel.textContent = npcAssets.name;
    npcEl.appendChild(nLabel);
}

/* ----------------------------------------------------------
   8. GAME START / COUNTDOWN
   ---------------------------------------------------------- */

startBtn.addEventListener('click', startCountdown);

function startCountdown() {
    showOverlay('countdown');
    gameState = 'countdown';
    resetGameState();

    let count = 3;
    countdownText.textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownText.textContent = count;
            retriggerAnim(countdownText);
        } else if (count === 0) {
            countdownText.textContent = 'GO!';
            countdownText.style.color = '#4ade80';
            retriggerAnim(countdownText);
        } else {
            clearInterval(interval);
            countdownText.style.color = '';
            beginPlaying();
        }
    }, 900);
}

function beginPlaying() {
    hideAllOverlays();
    gameState = 'playing';
    setLightState('green');
    scheduleNextLightChange();
    resumeBgMusic();
    lastFrameTime = performance.now();
    animFrameId = requestAnimationFrame(gameLoop);
}

/* ----------------------------------------------------------
   9. GAME LOOP
   ---------------------------------------------------------- */

function gameLoop(timestamp) {
    if (gameState !== 'playing') return;

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    // Update
    updateTimer(dt);
    updateLightCycle(dt);
    updatePlayer(dt);
    updateNPC(dt);
    updateCamera(dt);
    checkWinLoss();

    // Render
    renderPlayer();
    renderNPC();
    renderCamera();
    renderHUD();

    animFrameId = requestAnimationFrame(gameLoop);
}

/* ----------------------------------------------------------
   10. INPUT HANDLING
   ---------------------------------------------------------- */

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Space'].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function isMoveInput() {
    return keys['ArrowRight'] || keys['KeyD'] || mobilePressed;
}

// Mobile
let mobilePressed = false;
mobileMoveBtn.addEventListener('touchstart', (e) => { e.preventDefault(); mobilePressed = true; });
mobileMoveBtn.addEventListener('touchend',   (e) => { e.preventDefault(); mobilePressed = false; });
mobileMoveBtn.addEventListener('mousedown', () => { mobilePressed = true; });
window.addEventListener('mouseup', () => { mobilePressed = false; });

/* ----------------------------------------------------------
   11. LIGHT CYCLE SYSTEM
   ---------------------------------------------------------- */

function scheduleNextLightChange() {
    if (lightState === 'green') {
        lightTimer = randomRange(SETTINGS.greenDurationMin, SETTINGS.greenDurationMax);
    } else if (lightState === 'red') {
        lightTimer = randomRange(SETTINGS.redDurationMin, SETTINGS.redDurationMax);
    }
}

function updateLightCycle(dt) {
    if (lightState === 'transition') return;

    lightTimer -= dt;
    if (lightTimer <= 0) {
        startTransition(lightState === 'green' ? 'red' : 'green');
    }
}

function startTransition(nextState) {
    lightState = 'transition';
    watcherEl.classList.add('turning');

    // Play turning sound when switching to RED (she turns back to watch)
    if (nextState === 'red') {
        playSound(AUDIO.turningSound);
    }

    setTimeout(() => {
        watcherEl.classList.remove('turning');
        setLightState(nextState);
        scheduleNextLightChange();

        if (nextState === 'red') {
            isInGrace = true;
            setTimeout(() => { isInGrace = false; }, SETTINGS.reactionGrace);
        }
    }, SETTINGS.transitionDelay * 1000);
}

function setLightState(state) {
    lightState = state;
    if (state === 'green') {
        watcherSprite.src          = ASSETS.watcherGreen;
        lightIndicator.textContent = 'GREEN LIGHT';
        lightIndicator.className   = 'green';
        statusText.textContent     = 'Move now!';
    } else {
        watcherSprite.src          = ASSETS.watcherRed;
        lightIndicator.textContent = 'RED LIGHT';
        lightIndicator.className   = 'red';
        statusText.textContent     = 'STOP!';
    }
}

/* ----------------------------------------------------------
   12. CAMERA / SCROLLING
   ---------------------------------------------------------- */

function updateCamera(dt) {
    const playerWorldX = SETTINGS.playerStartX + playerX;
    // Target: keep player at cameraLead fraction from left edge of viewport
    let target = playerWorldX - SETTINGS.stageWidth * SETTINGS.cameraLead;
    target = clamp(target, 0, SETTINGS.totalWidth - SETTINGS.stageWidth);

    // Smooth follow (lerp)
    cameraX += (target - cameraX) * SETTINGS.cameraSmooth;
    cameraX = clamp(cameraX, 0, SETTINGS.totalWidth - SETTINGS.stageWidth);
}

function renderCamera() {
    gameStage.style.transform = `translateX(${-cameraX}px)`;
}

/* ----------------------------------------------------------
   13. PLAYER MOVEMENT
   ---------------------------------------------------------- */

function updatePlayer(dt) {
    const wantsMove = isMoveInput();

    if (wantsMove && (lightState === 'green' || lightState === 'transition')) {
        playerX += SETTINGS.playerSpeed * dt;
        playerMoving = true;
    } else if (wantsMove && lightState === 'red') {
        if (!isInGrace) {
            triggerLoss('You moved during Red Light!');
            return;
        }
        playerMoving = true;   // still in grace window
    } else {
        playerMoving = false;
    }

    // Clamp within course
    playerX = clamp(playerX, 0, SETTINGS.totalWidth - 40);
}

function renderPlayer() {
    playerEl.style.left = (SETTINGS.playerStartX + playerX) + 'px';

    // Only swap sprite when movement state changes
    if (playerMoving !== playerPrevMoving) {
        playerSprite.src = playerMoving ? playerAssets.walk : playerAssets.stand;
        playerPrevMoving = playerMoving;
    }
}

/* ----------------------------------------------------------
   14. NPC AI
   ---------------------------------------------------------- */

function updateNPC(dt) {
    if (npcEliminated) return;

    npcDecisionTimer -= dt;

    if (lightState === 'green' || lightState === 'transition') {
        if (npcDecisionTimer <= 0) {
            npcDecisionTimer = SETTINGS.npcDecisionRate + randomRange(-0.15, 0.15);
            npcWantsToMove = Math.random() < SETTINGS.npcMoveChance;
        }
        if (npcWantsToMove) {
            const jitter = 1 + randomRange(-SETTINGS.npcSpeedJitter, SETTINGS.npcSpeedJitter);
            npcX += SETTINGS.npcSpeed * jitter * dt;
            npcMoving = true;
        } else {
            npcMoving = false;
        }
    } else if (lightState === 'red') {
        if (npcMoving && Math.random() < SETTINGS.npcFailChance * dt * 60) {
            eliminateNPC();
            return;
        }
        npcMoving = false;
        npcWantsToMove = false;
    }

    // Clamp at finish line
    npcX = clamp(npcX, 0, SETTINGS.finishLineX - SETTINGS.npcStartX - 20);
}

function renderNPC() {
    if (npcEliminated) return;
    npcEl.style.left = (SETTINGS.npcStartX + npcX) + 'px';

    if (npcMoving !== npcPrevMoving) {
        npcSprite.src = npcMoving ? npcAssets.walk : npcAssets.stand;
        npcPrevMoving = npcMoving;
    }
}

function eliminateNPC() {
    npcEliminated = true;
    npcMoving     = false;
    npcEl.classList.add('eliminated-flash');
    setTimeout(() => {
        npcEl.classList.remove('eliminated-flash');
        npcEl.classList.add('eliminated');
    }, 400);
}

/* ----------------------------------------------------------
   15. WIN / LOSS DETECTION
   ---------------------------------------------------------- */

function checkWinLoss() {
    if (gameState !== 'playing') return;

    if (SETTINGS.playerStartX + playerX >= SETTINGS.finishLineX) {
        triggerWin();
    }
}

function updateTimer(dt) {
    roundTimeLeft -= dt;
    if (roundTimeLeft <= 0) {
        roundTimeLeft = 0;
        triggerLoss('Time ran out!');
    }
}

function triggerWin() {
    if (gameState !== 'playing') return;
    gameState = 'won';
    cancelAnimationFrame(animFrameId);
    playerMoving = false;
    playerSprite.src = playerAssets.stand;
    playerPrevMoving = false;

    pauseBgMusic();
    playSound(AUDIO.winSound);
    statusText.textContent = 'You made it!';

    const elapsed = SETTINGS.roundDuration - roundTimeLeft;
    showResult(true, 'You crossed the finish line!', `Time: ${elapsed.toFixed(1)}s`);
}

function triggerLoss(reason) {
    if (gameState !== 'playing') return;
    gameState = 'lost';
    cancelAnimationFrame(animFrameId);
    playerMoving = false;
    playerSprite.src = playerAssets.stand;
    playerPrevMoving = false;

    eliminationFlash.classList.add('active');
    setTimeout(() => eliminationFlash.classList.remove('active'), 500);

    pauseBgMusic();
    // Play the currently selected loss-sound variant (toggle via HUD button)
    playSound(getActiveLossSound());
    statusText.textContent = 'Too late!';

    showResult(false, reason, '');
}

/* ----------------------------------------------------------
   16. OVERLAYS & HUD
   ---------------------------------------------------------- */

function showOverlay(name) {
    hideAllOverlays();
    switch (name) {
        case 'poster':    posterOverlay.classList.remove('hidden'); break;
        case 'select':    selectOverlay.classList.remove('hidden'); break;
        case 'intro':     introOverlay.classList.remove('hidden'); break;
        case 'countdown': countdownOverlay.classList.remove('hidden'); break;
        case 'result':    resultOverlay.classList.remove('hidden'); break;
    }
}

function hideAllOverlays() {
    posterOverlay.classList.add('hidden');
    selectOverlay.classList.add('hidden');
    introOverlay.classList.add('hidden');
    countdownOverlay.classList.add('hidden');
    resultOverlay.classList.add('hidden');
}

function showResult(isWin, reason, timeStr) {
    const content = resultOverlay.querySelector('.overlay-content');
    content.classList.remove('win-result', 'lose-result');
    content.classList.add(isWin ? 'win-result' : 'lose-result');

    resultTitle.textContent  = isWin ? 'YOU WIN!' : 'YOU LOSE';
    resultReason.textContent = reason;
    resultTime.textContent   = timeStr;

    setTimeout(() => showOverlay('result'), isWin ? 600 : 800);
}

function renderHUD() {
    const t = Math.ceil(roundTimeLeft);
    timerDisplay.textContent = t;
    timerDisplay.style.color = roundTimeLeft <= 5 ? '#f87171' : '';
}

/* ----------------------------------------------------------
   17. RESET / RESTART
   ---------------------------------------------------------- */

muteBtn.addEventListener('click', () => setMuteState(!audioMuted));
restartBtn.addEventListener('click', fullRestart);

// Loss-sound variant toggle — cycles between the two loss SFX files.
// Plays a short preview of the newly selected variant so the user hears the change.
lossSoundBtn?.addEventListener('click', () => {
    // Stop any currently playing loss sounds
    stopSound(AUDIO.lossSound);
    stopSound(AUDIO.lossSound1);

    activeLossIndex = activeLossIndex === 0 ? 1 : 0;
    lossSoundBtn.textContent = 'Loss SFX: ' + (activeLossIndex + 1);

    // Preview the selected sound (respects mute state)
    playSound(getActiveLossSound());
});
resultRestartBtn.addEventListener('click', fullRestart);

function fullRestart() {
    cancelAnimationFrame(animFrameId);
    stopSound(AUDIO.bgMusic);
    stopSound(AUDIO.lossSound);
    stopSound(AUDIO.lossSound1);
    stopSound(AUDIO.winSound);
    stopSound(AUDIO.turningSound);
    eliminationFlash.classList.remove('active');
    resetGameState();

    selectedChar = null;
    charCards.forEach(c => c.classList.remove('selected'));
    gameState = 'select';
    showOverlay('select');
}

function resetGameState() {
    playerX = 0;  playerMoving = false;  playerPrevMoving = false;
    npcX    = 0;  npcMoving    = false;  npcPrevMoving    = false;
    npcEliminated = false; npcDecisionTimer = 0; npcWantsToMove = false;
    npcEl.classList.remove('eliminated', 'eliminated-flash');

    lightState = 'green'; lightTimer = 0;
    graceTimer = 0; isInGrace = false;
    roundTimeLeft = SETTINGS.roundDuration;
    cameraX = 0;

    // Visual reset
    playerEl.style.left = SETTINGS.playerStartX + 'px';
    npcEl.style.left    = SETTINGS.npcStartX + 'px';
    gameStage.style.transform = 'translateX(0)';

    if (playerAssets.stand) playerSprite.src = playerAssets.stand;
    if (npcAssets.stand)    npcSprite.src    = npcAssets.stand;
    watcherSprite.src = ASSETS.watcherGreen;
    watcherEl.classList.remove('turning');

    lightIndicator.textContent = 'GREEN LIGHT';
    lightIndicator.className   = 'green';
    statusText.textContent     = 'Waiting...';
    timerDisplay.textContent   = SETTINGS.roundDuration;
    timerDisplay.style.color   = '';

    Object.keys(keys).forEach(k => keys[k] = false);
    mobilePressed = false;
}

/* ----------------------------------------------------------
   18. UTILITIES
   ---------------------------------------------------------- */

function randomRange(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi)     { return Math.max(lo, Math.min(hi, v)); }

/** Re-trigger a CSS animation by forcing reflow. */
function retriggerAnim(el) {
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
}

/* ----------------------------------------------------------
   BOOT
   ---------------------------------------------------------- */
showOverlay('poster');
