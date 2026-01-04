/*
    Javascript Space Game
    By Frank Force 2021

*/

'use strict';

const clampCamera = !debug;
const lowGraphicsSettings = glOverlay = !window['chrome']; // only chromium uses high settings
const startCameraScale = 4*16;
const defaultCameraScale = 4*16;
const maxPlayers = 4;

// Title image
const titleImage = new Image();
titleImage.onload = function() {
    // Image loaded successfully
};
titleImage.onerror = function() {
    console.warn('Failed to load title.png');
};
titleImage.src = 'title.png';

// Rat rainbow GIF for win screen
const ratRainbowImage = new Image();
ratRainbowImage.onload = function() {
    // Image loaded successfully
};
ratRainbowImage.onerror = function() {
    console.warn('Failed to load rat-rainbow.gif');
};
ratRainbowImage.src = 'rat-rainbow.gif';

// Day and night GIF backgrounds - use img elements to ensure animation
const dayGifImage = document.createElement('img');
dayGifImage.style.display = 'none';
dayGifImage.style.position = 'absolute';
dayGifImage.style.visibility = 'hidden';
document.body.appendChild(dayGifImage);
dayGifImage.onload = function() {
    // Image loaded successfully
};
dayGifImage.onerror = function() {
    console.warn('Failed to load day.gif');
};
dayGifImage.src = 'day.gif';

const nightGifImage = document.createElement('img');
nightGifImage.style.display = 'none';
nightGifImage.style.position = 'absolute';
nightGifImage.style.visibility = 'hidden';
document.body.appendChild(nightGifImage);
nightGifImage.onload = function() {
    // Image loaded successfully
};
nightGifImage.onerror = function() {
    console.warn('Failed to load night.gif');
};
nightGifImage.src = 'night.gif';

const team_none = 0;
const team_player = 1;
const team_enemy = 2;

let updateWindowSize, renderWindowSize, gameplayWindowSize;
let selectedLevel = 1; // Default level to start at

// Title screen music
let titleMusic = null;
let titleMusicPlaying = false;
let titleScreenReady = false; // Track if user has pressed any key to start music

// Title screen sparkles
let titleSparkles = [];

// Array of all intro song URLs
const introSongs = [
    'https://mp3.tom7.org/t7es/2016/superior-olive.mp3',
    'https://mp3.tom7.org/t7es/2010/olimex.mp3',
    'https://mp3.tom7.org/t7es/2011/t7es-i-have-a-dram.mp3',
    'https://mp3.tom7.org/t7es/2011/dil-pe-mat-le-yaars-revenge.mp3',
    'https://mp3.tom7.org/t7es/2004/unauthorized.mp3',
    'https://mp3.tom7.org/t7es/2013/beverage-voucher.mp3',
    'https://mp3.tom7.org/t7es/2016/wires-comin-out.mp3',
    'https://mp3.tom7.org/t7es/2016/mushroom-forest.mp3',
    'https://mp3.tom7.org/t7es/2012/t7es-large-dark.mp3',
    'https://mp3.tom7.org/t7es/2012/new-four-song-t7es-ep.mp3',
    'https://mp3.tom7.org/t7es/2012/this-is-the-title-of-the-ep.mp3',
    'https://mp3.tom7.org/t7es/2004/haskell.mp3'
];

// Function to play a random intro song
function playRandomTitleMusic()
{
    // Stop and clean up previous song if it exists
    if (titleMusic)
    {
        titleMusic.pause();
        titleMusic.currentTime = 0;
        titleMusic.onended = null; // Remove event listener
        titleMusic = null;
    }
    
    // Pick a random song from the array
    const randomIndex = rand(introSongs.length) | 0;
    const selectedSong = introSongs[randomIndex];
    
    // Create new Audio object for the selected song
    titleMusic = new Audio(selectedSong);
    titleMusic.loop = false; // Don't loop - we'll play next song when this ends
    titleMusic.volume = 0.5;
    
    // Set up event listener to play next random song when current one ends
    titleMusic.onended = function() {
        playRandomTitleMusic(); // Play another random song
    };
    
    // Handle errors
    titleMusic.onerror = function() {
        console.warn('Failed to load title music:', selectedSong);
        // Try playing another song if this one fails
        playRandomTitleMusic();
    };
    
    // Set playing flag immediately to prevent lag
    titleMusicPlaying = true;
    
    // Start playing
    titleMusic.play().catch(function(error) {
        console.warn('Could not play title music:', error);
        titleMusicPlaying = false;
        // Try playing another song if playback fails
        playRandomTitleMusic();
    });
}

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // appInit
{
    gameState = 'title';
    cameraScale = startCameraScale;
    titleScreenReady = false;
    
    // Initialize parallax tracking
    backgroundParallaxOffset = vec2();
    previousCameraPos = cameraPos.copy();
    
    // Title screen music will be initialized when user presses a key
},

///////////////////////////////////////////////////////////////////////////////
()=> // appUpdate
{
    const cameraSize = vec2(mainCanvas.width, mainCanvas.height).scale(1/cameraScale);
    renderWindowSize = cameraSize.add(vec2(5));

    gameplayWindowSize = vec2(mainCanvas.width, mainCanvas.height).scale(1/defaultCameraScale);
    updateWindowSize = gameplayWindowSize.add(vec2(30));
    //debugRect(cameraPos, maxGameplayCameraSize);
    //debugRect(cameraPos, updateWindowSize);

    // handle title screen input
    if (gameState === 'title')
    {
        // Check if user presses any key or mouse button to start music and show "Press Enter" message
        if (!titleScreenReady)
        {
            // Check for any key press, mouse click, or gamepad button
            let anyKeyPressed = false;
            for(let i = 0; i < inputData[0].length; i++)
            {
                if (inputData[0][i] && inputData[0][i].p)
                {
                    anyKeyPressed = true;
                    break;
                }
            }
            // Also check gamepad buttons
            if (!anyKeyPressed && gamepadWasPressed(0, 0))
            {
                anyKeyPressed = true;
            }
            
            if (anyKeyPressed)
            {
                titleScreenReady = true;
                // Start playing random title music immediately
                playRandomTitleMusic();
                // Initialize sparkles
                titleSparkles = [];
                const titleX = mainCanvas.width / 2;
                const titleY = mainCanvas.height / 2 - 100;
                const titleScale = 0.8;
                const titleWidth = titleImage.complete && titleImage.width > 0 ? titleImage.width * titleScale : 400;
                const titleHeight = titleImage.complete && titleImage.height > 0 ? titleImage.height * titleScale : 100;
                
                for (let i = 0; i < 30; i++)
                {
                    titleSparkles.push({
                        x: titleX + (rand() - 0.5) * titleWidth * 1.2,
                        y: titleY + (rand() - 0.5) * titleHeight * 1.2,
                        size: 15 + rand() * 20,
                        phase: rand() * Math.PI * 2,
                        speed: 0.5 + rand() * 1.5,
                        colorPhase: rand() * Math.PI * 2,
                        glitchX: 0,
                        glitchY: 0,
                        glitchPhase: rand() * Math.PI * 2
                    });
                }
            }
            
            // Update sparkles when titleScreenReady
            if (titleScreenReady && titleSparkles.length > 0)
            {
                const titleX = mainCanvas.width / 2;
                const titleY = mainCanvas.height / 2 - 100;
                const titleScale = 0.8;
                const titleWidth = titleImage.complete && titleImage.width > 0 ? titleImage.width * titleScale : 400;
                const titleHeight = titleImage.complete && titleImage.height > 0 ? titleImage.height * titleScale : 100;
                
                for (let sparkle of titleSparkles)
                {
                    // Update sparkle animation
                    sparkle.phase += sparkle.speed * 0.02;
                    sparkle.colorPhase += 0.05;
                    if (sparkle.glitchPhase !== undefined) {
                        sparkle.glitchPhase += 0.3;
                    } else {
                        sparkle.glitchPhase = rand() * Math.PI * 2;
                    }
                    
                    // Keep sparkles randomly positioned on logo with slight drift
                    sparkle.x = titleX + (rand() - 0.5) * titleWidth * 1.2 + Math.sin(sparkle.phase) * 5;
                    sparkle.y = titleY + (rand() - 0.5) * titleHeight * 1.2 + Math.cos(sparkle.phase * 0.7) * 5;
                    
                    // Glitchy random offsets
                    randSeeded((frame + sparkle.glitchPhase * 1000) * 1000);
                    if (sparkle.glitchX === undefined) sparkle.glitchX = 0;
                    if (sparkle.glitchY === undefined) sparkle.glitchY = 0;
                    sparkle.glitchX = (rand() - 0.5) * 8;
                    sparkle.glitchY = (rand() - 0.5) * 8;
                }
            }
        }

        // Start game with Enter key (key code 13) or gamepad button
        if (titleScreenReady && (keyWasPressed(13) || gamepadWasPressed(0)))
        {
            // Stop title music when game starts
            if (titleMusic && titleMusicPlaying)
            {
                titleMusic.pause();
                titleMusic.currentTime = 0;
                titleMusic.onended = null; // Remove event listener to prevent next song from playing
                titleMusic = null;
                titleMusicPlaying = false;
            }
            // Clean up title sparkles when starting game
            titleSparkles = [];
            gameState = 'playing';
            resetGame();
        }
    }

    if (debug)
    {
        randSeeded(randSeeded(randSeeded(randSeed = Date.now()))); // set random seed for debug mode
        if (keyWasPressed(80))
            nextLevel();
    }

    // X key zoom out
    if (gameState === 'playing')
    {
        // Check if radar is equipped and F is pressed - if so, skip X zoom to avoid conflict
        const player = players[0];
        const radarEquipped = player && !player.isDead() && player.equippedWeaponType == 'RadarWeapon';
        const pressingF = keyIsDown(70); // F key (keyCode 70)
        const radarFActive = radarEquipped && pressingF;
        
        // Only apply X zoom if radar F is not active
        if (!radarFActive)
        {
            const pressingX = keyIsDown(88); // X key (keyCode 88)
            const ctrlZoomSpeed = 0.05; // Smooth lerp factor for zoom transitions
            const ctrlZoomFactor = 1.5; // Zoom out by 1.5x (a little bit)
            
            let targetZoom = defaultCameraScale;
            if (pressingX)
            {
                // X is held - zoom out a little bit
                targetZoom = defaultCameraScale / ctrlZoomFactor;
            }
            
            // Smoothly lerp cameraScale towards target zoom
            cameraScale += (targetZoom - cameraScale) * ctrlZoomSpeed;
            
            // If we're very close to target, snap to it (prevents infinite tiny adjustments)
            if (abs(cameraScale - targetZoom) < 0.1)
            {
                cameraScale = targetZoom;
            }
        }
    }

    // only run gameplay logic when in playing state
    if (gameState === 'playing')
    {
        // Ensure title music is stopped as soon as game begins
        if (titleMusic && titleMusicPlaying)
        {
            titleMusic.pause();
            titleMusic.currentTime = 0;
            titleMusic.onended = null;
            titleMusic = null;
            titleMusicPlaying = false;
        }
        
        // Periodic cleanup of arrays every 60 frames (about once per second) to free memory
        if (frame % 60 === 0)
        {
            if (typeof cleanupSurvivingGirls === 'function')
                cleanupSurvivingGirls();
            if (typeof cleanupSurvivingBoys === 'function')
                cleanupSurvivingBoys();
        }
        
        // restart if no lives left
        let minDeadTime = 1e3;
        let allPlayersDead = players.length > 0;
        for(const player of players)
        {
            if (player && !player.isDead())
                allPlayersDead = 0;
            minDeadTime = min(minDeadTime, player && player.isDead() ? player.deadTimer.get() : 0);
        }

        // check for game over (all players dead and no lives left)
        if (allPlayersDead && playerLives <= 0 && !gameOverTimer.isSet())
        {
            gameOverTimer.set();
            gameState = 'gameOver';
        }

        if (minDeadTime > 3 && (keyWasPressed(90) || keyWasPressed(32) || gamepadWasPressed(0)))
            resetGame();

        if (levelEndTimer.get() > 3)
        {
            // End game after level 5
            if (level >= 5)
            {
                gameCompleteTimer.set();
                gameState = 'win';
            }
            else
                nextLevel();
        }
    }
    else if (gameState === 'gameOver' && gameOverTimer.get() > 4)
    {
        // return to title screen after game over
        gameState = 'title';
        // Reset music flag and title screen state so it will restart when title screen is shown
        titleMusicPlaying = false;
        titleScreenReady = false;
        // Clean up title sparkles to free memory
        titleSparkles = [];
    }
    else if (gameState === 'win' && gameCompleteTimer.get() > 4)
    {
        // return to title screen after win
        gameState = 'title';
        // Reset music flag and title screen state so it will restart when title screen is shown
        titleMusicPlaying = false;
        titleScreenReady = false;
        // Clean up title sparkles to free memory
        titleSparkles = [];
    }
},

///////////////////////////////////////////////////////////////////////////////
()=> // appUpdatePost
{
    if (gameState === 'playing')
    {
        if (players.length == 1)
        {
            const player = players[0];
            if (!player.isDead())
                cameraPos = cameraPos.lerp(player.pos, clamp(player.getAliveTime()/2));
        }
        else
        {
            // camera follows average pos of living players
            let posTotal = vec2();
            let playerCount = 0;
            let cameraOffset = 1;
            for(const player of players)
            {
                if (player && !player.isDead())
                {
                    ++playerCount;
                    posTotal = posTotal.add(player.pos.add(vec2(0,cameraOffset)));
                }
            }

            if (playerCount)
                cameraPos = cameraPos.lerp(posTotal.scale(1/playerCount), .2);
        }

        // spawn players if they don't exist
        for(let i = maxPlayers;i--;)
        {
            if (!players[i] && (gamepadWasPressed(0, i)||gamepadWasPressed(1, i)))
            {
                ++playerLives;
                new Player(checkpointPos, i);
            }
        }

        // clamp to bottom and sides of level
        if (clampCamera)
        {
            const w = mainCanvas.width/2/cameraScale+1;
            const h = mainCanvas.height/2/cameraScale+2;
            cameraPos.y = max(cameraPos.y, h);
            if (w*2 < tileCollisionSize.x)
                cameraPos.x = clamp(cameraPos.x, tileCollisionSize.x - w, w);
        }

        // Parallax is now calculated fresh each frame in render function
        // No accumulation needed - keeps background centered

        updateParallaxLayers();

        updateSky();
    }
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRender
{
    if (gameState === 'playing')
    {
        // Draw animated GIF background (day or night) with parallax
        if (levelBackgroundGif && levelBackgroundGif.complete && levelBackgroundGif.width > 0)
        {
            // Scale GIF to cover entire canvas while maintaining aspect ratio
            // Always ensure full coverage with safe buffer
            const gifAspect = levelBackgroundGif.width / levelBackgroundGif.height;
            const canvasAspect = mainCanvas.width / mainCanvas.height;
            
            // Calculate size to cover canvas with safe buffer (20% extra on each side)
            const safeBuffer = 0.2; // 20% buffer to ensure no black shows
            let drawWidth, drawHeight;
            if (gifAspect > canvasAspect)
            {
                // GIF is wider - scale to cover width with buffer
                drawWidth = mainCanvas.width * (1 + safeBuffer * 2);
                drawHeight = drawWidth / gifAspect;
                // Make sure height also covers canvas with buffer
                const minHeight = mainCanvas.height * (1 + safeBuffer * 2);
                if (drawHeight < minHeight)
                {
                    drawHeight = minHeight;
                    drawWidth = drawHeight * gifAspect;
                }
            }
            else
            {
                // GIF is taller - scale to cover height with buffer
                drawHeight = mainCanvas.height * (1 + safeBuffer * 2);
                drawWidth = drawHeight * gifAspect;
                // Make sure width also covers canvas with buffer
                const minWidth = mainCanvas.width * (1 + safeBuffer * 2);
                if (drawWidth < minWidth)
                {
                    drawWidth = minWidth;
                    drawHeight = drawWidth / gifAspect;
                }
            }
            
            // Center background on MAP CENTER, not camera position
            // This ensures background is always centered on the map regardless of where player spawns
            const screenCenterX = mainCanvas.width / 2;
            const screenCenterY = mainCanvas.height / 2;
            const mapCenter = vec2(levelSize.x / 2, levelSize.y / 2);
            
            // Parallax effect: background moves slower than camera (10% speed)
            // Position background so map center aligns with screen center, with parallax offset
            const parallaxSpeed = 0.1;
            const mapCenterToScreenX = (mapCenter.x - cameraPos.x) * cameraScale * parallaxSpeed;
            const mapCenterToScreenY = -(mapCenter.y - cameraPos.y) * cameraScale * parallaxSpeed; // Negate Y because screen Y is inverted
            
            // Position background centered on map center (with parallax effect)
            // 20% buffer ensures background always covers canvas
            const drawX = screenCenterX - drawWidth / 2 + mapCenterToScreenX;
            const drawY = screenCenterY - drawHeight / 2 + mapCenterToScreenY;
            
            // Draw the animated GIF (it will animate because it's an img element in the DOM)
            mainContext.drawImage(levelBackgroundGif, drawX, drawY, drawWidth, drawHeight);
        }
        else
        {
            // Fallback to gradient if GIF not loaded
            const gradient = mainContext.createLinearGradient(0,0,0,mainCanvas.height);
            gradient.addColorStop(0,levelSkyColor.rgba());
            gradient.addColorStop(1,levelSkyHorizonColor.rgba());
            mainContext.fillStyle = gradient;
            mainContext.fillRect(0,0,mainCanvas.width, mainCanvas.height);
        }
    }
    else if (gameState === 'title' && titleScreenReady)
    {
        // Glitchy pink pixelated flashing background effect
        const pixelSize = 8; // Pixelation size
        const cols = Math.ceil(mainCanvas.width / pixelSize);
        const rows = Math.ceil(mainCanvas.height / pixelSize);
        
        // Use frame for flashing effect
        const flashIntensity = (Math.sin(frame * 0.5) + 1) * 0.5; // 0 to 1
        const basePink = 0.8 + flashIntensity * 0.2; // Flash between 0.8 and 1.0
        
        // Seed random for glitchy effect
        randSeeded(frame * 12345);
        
        for (let y = 0; y < rows; y++)
        {
            for (let x = 0; x < cols; x++)
            {
                // Random glitch offset
                const glitchX = (rand() - 0.5) * 3;
                const glitchY = (rand() - 0.5) * 3;
                
                // Random pink color variation
                const r = basePink + (rand() - 0.5) * 0.3;
                const g = 0.2 + (rand() - 0.5) * 0.2;
                const b = 0.5 + (rand() - 0.5) * 0.3;
                
                // Random pixel size for extra glitchiness
                const sizeVariation = 0.7 + rand() * 0.6;
                const px = (x + glitchX) * pixelSize;
                const py = (y + glitchY) * pixelSize;
                const pw = pixelSize * sizeVariation;
                const ph = pixelSize * sizeVariation;
                
                mainContext.fillStyle = `rgb(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)})`;
                mainContext.fillRect(px, py, pw, ph);
            }
        }
        
        // Add some random scanlines for extra glitch
        randSeeded(frame * 54321);
        mainContext.fillStyle = 'rgba(255, 0, 255, 0.1)';
        for (let i = 0; i < 5; i++)
        {
            const scanY = rand() * mainCanvas.height;
            mainContext.fillRect(0, scanY, mainCanvas.width, 2);
        }
    }
    else
    {
        // simple black background for title/game over/win screens
        mainContext.fillStyle = '#000';
        mainContext.fillRect(0,0,mainCanvas.width, mainCanvas.height);
    }
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRenderPost
{
    if (gameState === 'title')
    {
        // Title screen with logo image
        const titleX = mainCanvas.width / 2;
        const titleY = mainCanvas.height / 2 - 100;
        const titleScale = 0.8;
        
        if (titleImage.complete && titleImage.width > 0 && titleImage.height > 0)
        {
            const titleWidth = titleImage.width * titleScale;
            const titleHeight = titleImage.height * titleScale;
            
            // Draw title image
            mainContext.drawImage(
                titleImage,
                titleX - titleWidth/2,
                titleY - titleHeight/2,
                titleWidth,
                titleHeight
            );
        }
        else
        {
            // Fallback: show text if image hasn't loaded yet
            mainContext.textAlign = 'center';
            mainContext.fillStyle = new Color(1,1,1).rgba();
            mainContext.font = 'bold 64px JetBrains Mono';
            mainContext.fillText('MALEFACTOR', mainCanvas.width/2, mainCanvas.height/2 - 100);
        }
        
        // Draw sparkles on title logo when titleScreenReady
        if (titleScreenReady && titleSparkles.length > 0)
        {
            const titleWidth = titleImage.complete && titleImage.width > 0 ? titleImage.width * titleScale : 400;
            const titleHeight = titleImage.complete && titleImage.height > 0 ? titleImage.height * titleScale : 100;
            const titleLeft = titleX - titleWidth/2;
            const titleRight = titleX + titleWidth/2;
            const titleTop = titleY - titleHeight/2;
            const titleBottom = titleY + titleHeight/2;
            
            for (let sparkle of titleSparkles)
            {
                // Only draw sparkles that are near the title logo
                if (sparkle.x >= titleLeft - 50 && sparkle.x <= titleRight + 50 &&
                    sparkle.y >= titleTop - 50 && sparkle.y <= titleBottom + 50)
                {
                    // Twinkling effect using sine wave
                    const twinkle = (Math.sin(frame * 0.1 + sparkle.phase) + 1) * 0.5;
                    const alpha = 0.4 + twinkle * 0.6;
                    
                    // Purple color with slight variation
                    randSeeded((frame + sparkle.colorPhase * 1000) * 2000);
                    const purpleR = 0.7 + (rand() - 0.5) * 0.2;
                    const purpleG = 0.2 + (rand() - 0.5) * 0.1;
                    const purpleB = 0.9 + (rand() - 0.5) * 0.1;
                    
                    // Draw glitchy pixelated sparkle (large square with offset)
                    const sparkleSize = sparkle.size * (0.7 + twinkle * 0.3);
                    const drawX = Math.floor(sparkle.x - sparkleSize/2 + sparkle.glitchX);
                    const drawY = Math.floor(sparkle.y - sparkleSize/2 + sparkle.glitchY);
                    
                    // Draw multiple offset copies for glitch effect
                    mainContext.fillStyle = `rgba(${Math.floor(purpleR * 255)}, ${Math.floor(purpleG * 255)}, ${Math.floor(purpleB * 255)}, ${alpha * 0.3})`;
                    mainContext.fillRect(drawX - 2, drawY - 2, Math.ceil(sparkleSize), Math.ceil(sparkleSize));
                    mainContext.fillRect(drawX + 2, drawY + 2, Math.ceil(sparkleSize), Math.ceil(sparkleSize));
                    
                    mainContext.fillStyle = `rgba(${Math.floor(purpleR * 255)}, ${Math.floor(purpleG * 255)}, ${Math.floor(purpleB * 255)}, ${alpha})`;
                    mainContext.fillRect(drawX, drawY, Math.ceil(sparkleSize), Math.ceil(sparkleSize));
                }
            }
        }

        // Press to start text - show different message based on state
        mainContext.textAlign = 'center';
        mainContext.fillStyle = new Color(1,1,1).rgba();
        mainContext.font = 'bold 32px JetBrains Mono';
        if (!titleScreenReady)
        {
            mainContext.fillText('Press Space', mainCanvas.width/2, mainCanvas.height/2 + 70);
        }
        else
        {
            mainContext.fillText('Press Enter to Begin', mainCanvas.width/2, mainCanvas.height/2 + 70);
        }

        // Helper function to render colored text with wrapping
        function drawColoredText(text, x, y, fontSize, defaultColor, maxWidth, lineHeight) {
            mainContext.font = fontSize;
            mainContext.textAlign = 'left';
            mainContext.textBaseline = 'top';
            
            const colorMap = {
                'red': new Color(1, 0.2, 0.2),
                'orange': new Color(1, 0.6, 0),
                'yellow': new Color(1, 1, 0),
                'green': new Color(0.2, 1, 0.2),
                'cyan': new Color(0, 1, 1),
                'pink': new Color(1, 0.5, 0.8),
                'purple': new Color(0.8, 0.2, 1)
            };
            
            let currentX = x;
            let currentY = y;
            let i = 0;
            let wordStart = i;
            let wordStartX = currentX;
            let currentColor = defaultColor;
            
            // Helper to wrap to next line
            function wrapLine() {
                currentX = x;
                currentY += lineHeight;
            }
            
            // Helper to measure text width
            function measureText(str) {
                return mainContext.measureText(str).width;
            }
            
            while (i < text.length) {
                // Check for color tags (case-insensitive, handles mismatched closing tags)
                const openTagMatch = text.substring(i).match(/^<(\w+)>/i);
                if (openTagMatch) {
                    const colorName = openTagMatch[1].toLowerCase();
                    const openTagLen = openTagMatch[0].length;
                    i += openTagLen;
                    
                    // Find the closing tag anywhere after the opening tag (case-insensitive)
                    const remainingText = text.substring(i);
                    const closeTagIndex = remainingText.search(/<\/\w+>/i);
                    if (closeTagIndex !== -1) {
                        const content = remainingText.substring(0, closeTagIndex);
                        const closeTagMatch = remainingText.substring(closeTagIndex).match(/^<\/\w+>/i);
                        const color = colorMap[colorName] || defaultColor;
                        
                        // Check if this content fits on current line
                        const contentWidth = measureText(content);
                        if (maxWidth && currentX + contentWidth > x + maxWidth && currentX > x) {
                            wrapLine();
                        }
                        
                        mainContext.fillStyle = color.rgba();
                        mainContext.fillText(content, currentX, currentY);
                        currentX += contentWidth;
                        i += content.length + closeTagMatch[0].length;
                    } else {
                        // No closing tag found, treat opening tag as regular text
                        i -= openTagLen; // Go back to render the opening tag
                        const tagText = openTagMatch[0];
                        const tagWidth = measureText(tagText);
                        if (maxWidth && currentX + tagWidth > x + maxWidth && currentX > x) {
                            wrapLine();
                        }
                        mainContext.fillStyle = defaultColor.rgba();
                        mainContext.fillText(tagText, currentX, currentY);
                        currentX += tagWidth;
                        i += openTagLen;
                    }
                } else {
                    // Regular text - handle word wrapping
                    const nextTag = text.indexOf('<', i);
                    const textEnd = nextTag === -1 ? text.length : nextTag;
                    const regularText = text.substring(i, textEnd);
                    
                    // Split by spaces to handle word wrapping
                    let wordStartIdx = 0;
                    while (wordStartIdx < regularText.length) {
                        const spaceIdx = regularText.indexOf(' ', wordStartIdx);
                        const wordEndIdx = spaceIdx === -1 ? regularText.length : spaceIdx + 1;
                        const word = regularText.substring(wordStartIdx, wordEndIdx);
                        const wordWidth = measureText(word);
                        
                        // Check if word fits on current line
                        if (maxWidth && currentX + wordWidth > x + maxWidth && currentX > x) {
                            wrapLine();
                        }
                        
                        mainContext.fillStyle = defaultColor.rgba();
                        mainContext.fillText(word, currentX, currentY);
                        currentX += wordWidth;
                        wordStartIdx = wordEndIdx;
                    }
                    
                    i = textEnd;
                    if (nextTag === -1) break;
                }
            }
            
            return currentY;
        }

        // Two columns layout
        mainContext.font = 'bold 20px JetBrains Mono';
        const columnsY = mainCanvas.height/2 + 140;
        const lineHeight = 24;
        const leftColumnX = mainCanvas.width * 0.25;
        const rightColumnX = mainCanvas.width * 0.55;
        const rightColumnMaxWidth = mainCanvas.width * 0.4; // Max width for right column (from 0.55 to 0.95)
        const defaultTextColor = new Color(1, 1, 1);

        // Left column: Controls
        mainContext.textAlign = 'left';
        mainContext.fillStyle = defaultTextColor.rgba();
        mainContext.fillText('WASD = Move', leftColumnX, columnsY);
        mainContext.fillText('Arrows = Aim', leftColumnX, columnsY + lineHeight);
        mainContext.fillText('E = Melee', leftColumnX, columnsY + lineHeight * 2);
        mainContext.fillText('C = Grenade', leftColumnX, columnsY + lineHeight * 3);
        mainContext.fillText('Space = Shoot', leftColumnX, columnsY + lineHeight * 4);
        mainContext.fillText('Shift = Roll', leftColumnX, columnsY + lineHeight * 5);
        mainContext.fillText('F = Weapon', leftColumnX, columnsY + lineHeight * 6);
        mainContext.fillText('Q = Unequip', leftColumnX, columnsY + lineHeight * 7);
        mainContext.fillText('X = Zoom', leftColumnX, columnsY + lineHeight * 8);
        mainContext.fillText('Z = Carry', leftColumnX, columnsY + lineHeight * 9);

        // Right column: Objectives with colors (with wrapping)
        let rightColumnY = columnsY;
        rightColumnY = drawColoredText('Zamn! What a mess!', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight) + lineHeight;
        rightColumnY = drawColoredText('Neutralize all <red>Malefactors</red>.', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight) + lineHeight;
        rightColumnY = drawColoredText('Decommission the <orange>Calculator</orange>.', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight) + lineHeight;
        rightColumnY = drawColoredText('Login to all Node <cyan>Terminals</cyan>.', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight) + lineHeight;
        rightColumnY = drawColoredText('Detonate the <pink>Pussybomb</pink>.', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight) + lineHeight;
        drawColoredText('<yellow>Protip:</yellow> Use the <orange>Calculator</orange> to Transmute <cyan>Terminals</cyan> and <green>Greenhorns</green> into <purple>Henchmen</purple>.', rightColumnX, rightColumnY, 'bold 20px JetBrains Mono', defaultTextColor, rightColumnMaxWidth, lineHeight);
    }
    else if (gameState === 'playing')
    {
        // Render player helmets AFTER WebGL batch copy so they appear on top
        for (const player of players)
        {
            if (player && !player.destroyed && player.isPlayer && player.equippedWeaponType && player.equippedWeaponType != 'Weapon')
            {
                // Check if player is visible (same check as Character.render())
                if (!isOverlapping(player.pos, player.size, cameraPos, renderWindowSize))
                    continue;
                
                let headwearTileIndex = -1;
                if (player.equippedWeaponType == 'LaserWeapon')
                    headwearTileIndex = 2; // itemType_laser tileIndex
                else if (player.equippedWeaponType == 'CannonWeapon')
                    headwearTileIndex = 3; // itemType_cannon tileIndex
                else if (player.equippedWeaponType == 'JumperWeapon')
                    headwearTileIndex = 4; // itemType_jumper tileIndex
                else if (player.equippedWeaponType == 'HammerWeapon')
                    headwearTileIndex = 5; // itemType_hammer tileIndex
                else if (player.equippedWeaponType == 'RadarWeapon')
                    headwearTileIndex = 6; // itemType_radar tileIndex
                else if (player.equippedWeaponType == 'SmokerWeapon')
                    headwearTileIndex = 7; // itemType_smoker tileIndex
                else if (player.equippedWeaponType == 'FangWeapon')
                    headwearTileIndex = 8; // itemType_fang tileIndex
                else if (player.equippedWeaponType == 'LadymakerWeapon')
                    headwearTileIndex = 9; // itemType_ladymaker tileIndex
                else if (player.equippedWeaponType == 'TransporterWeapon')
                    headwearTileIndex = 10; // itemType_transporter tileIndex
                else if (player.equippedWeaponType == 'WardrobeWeapon')
                    headwearTileIndex = 11; // itemType_wardrobe tileIndex
                
                if (headwearTileIndex >= 0 && typeof drawTile2 === 'function')
                {
                    const sizeScale = player.sizeScale;
                    const headColor = player.team == team_enemy ? new Color() : player.color.scale(player.burnColorPercent(), 1);
                    const meleeHeadOffset = player.meleeTimer && player.meleeTimer.active() ? -.12 * Math.sin(player.meleeTimer.getPercent() * PI) : 0;
                    const headBasePos = vec2(player.getMirrorSign(.05) + meleeHeadOffset * player.getMirrorSign(), .46);
                    const headwearPos = player.pos.add(headBasePos.scale(sizeScale).rotate(-player.angle));
                    
                    // Calculate additive color matching Character.render()
                    let additive = player.additiveColor.add(player.extraAdditiveColor);
                    if (player.isPlayer && !player.isDead() && player.dodgeRechargeTimer && player.dodgeRechargeTimer.elapsed() && player.dodgeRechargeTimer.get() < .2)
                    {
                        const v = .6 - player.dodgeRechargeTimer.get()*3;
                        additive = additive.add(new Color(0,v,v,0)).clamp();
                    }
                    
                    drawTile2(headwearPos, vec2(sizeScale/2 * 1.1), headwearTileIndex, vec2(8), headColor, player.angle, player.mirror, additive);
                }
            }
        }
        
        // Gameplay UI
        // check if any enemies left
        let enemiesCount = 0;
        for (const o of engineCollideObjects)
        {
            // Only count living, non-destroyed enemy characters with health > 0
            // Also check that it's actually an enemy (has team property set correctly)
            if (o.isCharacter && o.team == team_enemy && !o.destroyed && o.health > 0 && o.health !== undefined)
            {
                ++enemiesCount;
                const pos = vec2(mainCanvas.width/2 + (o.pos.x - cameraPos.x)*30,mainCanvas.height-20);
                const size = o.size.scale(20);
                const color = o.color.scale(1,.6);
                mainContext.fillStyle = color.rgba();
                mainContext.fillRect(pos.x - size.x/2, pos.y - size.y/2, size.x, size.y);
            }
        }

        // Count secured checkpoints
        let securedCheckpoints = 0;
        let totalCheckpoints = 0;
        for (const checkpoint of allCheckpoints)
        {
            if (checkpoint && !checkpoint.destroyed)
            {
                ++totalCheckpoints;
                if (checkpoint.secured)
                    ++securedCheckpoints;
            }
        }

        // Count destroyed computers
        let destroyedComputers = 0;
        let totalComputers = 0;
        for (const computer of allComputers)
        {
            if (computer && !computer.destroyed)
            {
                ++totalComputers;
                if (computer.computerDestroyed)
                    ++destroyedComputers;
            }
        }

        // Level completion requires: all enemies dead AND all checkpoints secured AND all computers destroyed
        if (!enemiesCount && totalCheckpoints > 0 && securedCheckpoints >= totalCheckpoints && 
            totalComputers > 0 && destroyedComputers >= totalComputers && !levelEndTimer.isSet())
            levelEndTimer.set();

        mainContext.fillStyle = new Color(1,1,1).rgba();
        mainContext.font = 'bold 16px JetBrains Mono';
        mainContext.textAlign = 'left';
        const hudX = 20;
        const hudY = 30;
        const lineHeight = 20;

        mainContext.fillText('LEVEL ' + level, hudX, hudY);
        mainContext.fillText('LIVES ' + playerLives, hudX, hudY + lineHeight);
        mainContext.fillText('MALEFACTORS ' + enemiesCount, hudX, hudY + lineHeight * 2);
        
        // Clean up and count living girls
        cleanupSurvivingGirls();
        mainContext.fillText('GREENHORNS ' + survivingGirls.length, hudX, hudY + lineHeight * 3);
        
        // Clean up and count living boys
        cleanupSurvivingBoys();
        mainContext.fillText('HENCHMEN ' + survivingBoys.length, hudX, hudY + lineHeight * 4);
        
        mainContext.fillText('LOGINS ' + securedCheckpoints + '/' + totalCheckpoints, hudX, hudY + lineHeight * 5);
        mainContext.fillText('CALCULATORS ' + destroyedComputers + '/' + totalComputers, hudX, hudY + lineHeight * 6);

        // fade in level transition
        const fade = levelEndTimer.isSet() ? percent(levelEndTimer.get(), 3, 1) : percent(levelTimer.get(), .5, 2);
        drawRect(cameraPos, vec2(1e3), new Color(0,0,0,fade))
    }
    else if (gameState === 'gameOver')
    {
        // game over text
        const gameOverFade = min(gameOverTimer.get() / 1.5, 1); // fade in over 1.5 seconds
        const textAlpha = gameOverFade; // fade in text

        mainContext.textAlign = 'center';
        mainContext.textBaseline = 'middle';
        mainContext.fillStyle = new Color(1, 1, 1, textAlpha).rgba();
        mainContext.font = 'bold 64px JetBrains Mono';
        mainContext.fillText('GAME OVER', mainCanvas.width/2, mainCanvas.height/2);
    }
    else if (gameState === 'win')
    {
        // game complete text
        const gameCompleteFade = min(gameCompleteTimer.get() / 1.5, 1); // fade in over 1.5 seconds
        const textAlpha = gameCompleteFade; // fade in text

        // Draw rat rainbow GIF above the text
        if (ratRainbowImage.complete && ratRainbowImage.width > 0 && ratRainbowImage.height > 0)
        {
            const gifScale = 0.4; // Scale the GIF to a reasonable size
            const gifWidth = ratRainbowImage.width * gifScale;
            const gifHeight = ratRainbowImage.height * gifScale;
            const gifX = mainCanvas.width / 2;
            const gifY = mainCanvas.height / 2 - 100; // Position above the text
            
            mainContext.globalAlpha = textAlpha;
            mainContext.drawImage(
                ratRainbowImage,
                gifX - gifWidth/2,
                gifY - gifHeight/2,
                gifWidth,
                gifHeight
            );
            mainContext.globalAlpha = 1; // Reset alpha
        }

        mainContext.textAlign = 'center';
        mainContext.textBaseline = 'middle';
        mainContext.fillStyle = new Color(1, 1, 1, textAlpha).rgba();
        mainContext.font = 'bold 64px JetBrains Mono';
        mainContext.fillText('YOU WIN!', mainCanvas.width/2, mainCanvas.height/2);
    }
});