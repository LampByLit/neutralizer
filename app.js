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

const team_none = 0;
const team_player = 1;
const team_enemy = 2;

let updateWindowSize, renderWindowSize, gameplayWindowSize;
// let selectedLevel = 1; // Level selector for testing (1-5) - COMMENTED OUT
let selectedLevel = 1; // Keep default to 1 for normal gameplay

// Title screen music
let titleMusic = null;
let titleMusicPlaying = false;
let titleScreenReady = false; // Track if user has pressed any key to start music

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // appInit
{
    gameState = 'title';
    cameraScale = startCameraScale;
    titleScreenReady = false;
    
    // Initialize title screen music
    titleMusic = new Audio('https://mp3.tom7.org/t7es/2016/superior-olive.mp3');
    titleMusic.loop = true;
    titleMusic.volume = 0.5;
    titleMusic.onerror = function() {
        console.warn('Failed to load title music');
    };
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
                // Start playing title music
                if (titleMusic && !titleMusicPlaying)
                {
                    titleMusic.play().then(function() {
                        titleMusicPlaying = true;
                    }).catch(function(error) {
                        console.warn('Could not play title music:', error);
                    });
                }
            }
        }
        
        // Level selector (number keys 1-6) - COMMENTED OUT
        // for(let i = 1; i <= 6; i++)
        // {
        //     const keyCode = 48 + i; // 49 = '1', 50 = '2', etc.
        //     if (keyWasPressed(keyCode))
        //     {
        //         selectedLevel = i;
        //     }
        // }
        
        // Start game with Enter key (key code 13) or gamepad button
        if (titleScreenReady && (keyWasPressed(13) || gamepadWasPressed(0)))
        {
            // Stop title music when game starts
            if (titleMusic && titleMusicPlaying)
            {
                titleMusic.pause();
                titleMusic.currentTime = 0;
                titleMusicPlaying = false;
            }
            gameState = 'playing';
            resetGame();
        }
    }

    if (debug)
    {
        randSeeded(randSeeded(randSeeded(randSeed = Date.now()))); // set random seed for debug mode stuf
        if (keyWasPressed(188)) // Comma key
            new Malefactor(mousePosWorld);

        if (keyWasPressed(84))
        {
            //for(let i=30;i--;)
                new Prop(mousePosWorld);
        }

        if (keyWasPressed(190))
            explosion(mousePosWorld);

        if (keyIsDown(89))
        {
            let e = new ParticleEmitter(mousePosWorld);

            // test
            e.collideTiles = 1;
            //e.tileIndex=7;
            e.emitSize = 2;
            e.colorStartA = new Color(1,1,1,1);
            e.colorStartB = new Color(0,1,1,1);
            e.colorEndA = new Color(0,0,1,0);
            e.colorEndB = new Color(0,.5,1,0);
            e.emitConeAngle = .1;
            e.particleTime = 1
            e.speed = .3
            e.elasticity = .1
            e.gravityScale = 1;
            //e.additive = 1;
            e.angle = -PI;
        }

        if (mouseWheel) // mouse zoom
            cameraScale = clamp(cameraScale*(1-mouseWheel/10), defaultTileSize.x*16, defaultTileSize.x/16);

        //if (keyWasPressed(77))
        //    playSong([[[,0,219,,,,,1.1,,-.1,-50,-.05,-.01,1],[2,0,84,,,.1,,.7,,,,.5,,6.7,1,.05]],[[[0,-1,1,0,5,0],[1,1,8,8,0,3]]],[0,0,0,0],90]) // music test

        if (keyWasPressed(77))
            players[0].pos = mousePosWorld;

        /*if (keyWasPressed(32))
        {
            skyParticles && skyParticles.destroy();
            tileLayer.destroy();
            tileBackgroundLayer.destroy();
            tileParallaxLayers.forEach((tileParallaxLayer)=>tileParallaxLayer.destroy());
            randomizeLevelParams();
            applyArtToLevel();
        }*/
        if (keyWasPressed(78))
            nextLevel();
    }

    // only run gameplay logic when in playing state
    if (gameState === 'playing')
    {
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
    }
    else if (gameState === 'win' && gameCompleteTimer.get() > 4)
    {
        // return to title screen after win
        gameState = 'title';
        // Reset music flag and title screen state so it will restart when title screen is shown
        titleMusicPlaying = false;
        titleScreenReady = false;
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

        updateParallaxLayers();

        updateSky();
    }
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRender
{
    if (gameState === 'playing')
    {
        const gradient = mainContext.createLinearGradient(0,0,0,mainCanvas.height);
        gradient.addColorStop(0,levelSkyColor.rgba());
        gradient.addColorStop(1,levelSkyHorizonColor.rgba());
        mainContext.fillStyle = gradient;
        //mainContext.fillStyle = levelSkyColor.rgba();
        mainContext.fillRect(0,0,mainCanvas.width, mainCanvas.height);

        drawStars();
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
        
        // Level selector - COMMENTED OUT
        // mainContext.textAlign = 'center';
        // mainContext.fillStyle = new Color(1,1,1).rgba();
        // mainContext.font = 'bold 24px JetBrains Mono';
        // mainContext.fillText('Select Level (Press 1-6):', mainCanvas.width/2, mainCanvas.height/2 + 20);
        // 
        // // Highlight selected level
        // const levelY = mainCanvas.height/2 + 55;
        // for(let i = 1; i <= 6; i++)
        // {
        //     const x = mainCanvas.width/2 - 100 + (i - 1) * 33;
        //     const color = i === selectedLevel ? new Color(1,1,0) : new Color(0.7,0.7,0.7);
        //     mainContext.fillStyle = color.rgba();
        //     mainContext.font = 'bold 36px JetBrains Mono';
        //     mainContext.textAlign = 'center';
        //     mainContext.fillText(i.toString(), x, levelY);
        // }
        
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

        // Controls subtitle
        mainContext.font = 'bold 20px JetBrains Mono';
        const controlsY = mainCanvas.height/2 + 140;
        const lineHeight = 24;
        mainContext.fillText('WASD = Move', mainCanvas.width/2, controlsY);
        mainContext.fillText('Arrows = Aim', mainCanvas.width/2, controlsY + lineHeight);
        mainContext.fillText('E = Melee', mainCanvas.width/2, controlsY + lineHeight * 2);
        mainContext.fillText('C = Grenade', mainCanvas.width/2, controlsY + lineHeight * 3);
        mainContext.fillText('Space = Shoot', mainCanvas.width/2, controlsY + lineHeight * 4);
        mainContext.fillText('Shift = Roll', mainCanvas.width/2, controlsY + lineHeight * 5);
        mainContext.fillText('F = Weapon', mainCanvas.width/2, controlsY + lineHeight * 6);
        mainContext.fillText('Q = Unequip', mainCanvas.width/2, controlsY + lineHeight * 7);
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

        if (!enemiesCount && !levelEndTimer.isSet())
            levelEndTimer.set();

        mainContext.fillStyle = new Color(1,1,1).rgba();
        mainContext.font = 'bold 16px JetBrains Mono';
        mainContext.textAlign = 'left';
        const hudX = 20;
        const hudY = 30;
        const lineHeight = 20;

        mainContext.fillText('LEVEL ' + level, hudX, hudY);
        mainContext.fillText('LIVES ' + playerLives, hudX, hudY + lineHeight);
        mainContext.fillText('ENEMIES ' + enemiesCount, hudX, hudY + lineHeight * 2);
        
        // Clean up and count living girls
        cleanupSurvivingGirls();
        mainContext.fillText('GIRLS ' + survivingGirls.length, hudX, hudY + lineHeight * 3);

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

        mainContext.textAlign = 'center';
        mainContext.textBaseline = 'middle';
        mainContext.fillStyle = new Color(1, 1, 1, textAlpha).rgba();
        mainContext.font = 'bold 64px JetBrains Mono';
        mainContext.fillText('YOU WIN!', mainCanvas.width/2, mainCanvas.height/2);
    }
});