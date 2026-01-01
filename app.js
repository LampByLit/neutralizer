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

const team_none = 0;
const team_player = 1;
const team_enemy = 2;

let updateWindowSize, renderWindowSize, gameplayWindowSize;

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // appInit 
{
    resetGame();
    cameraScale = startCameraScale;
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
        gameOverTimer.set();

    if (minDeadTime > 3 && (keyWasPressed(90) || keyWasPressed(32) || gamepadWasPressed(0)))
        resetGame();

    if (levelEndTimer.get() > 3)
    {
        // End game after level 5
        if (level >= 5)
            gameCompleteTimer.set();
        else
            nextLevel();
    }
},

///////////////////////////////////////////////////////////////////////////////
()=> // appUpdatePost
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
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRender
{
    const gradient = mainContext.createLinearGradient(0,0,0,mainCanvas.height);
    gradient.addColorStop(0,levelSkyColor.rgba());
    gradient.addColorStop(1,levelSkyHorizonColor.rgba());
    mainContext.fillStyle = gradient;
    //mainContext.fillStyle = levelSkyColor.rgba();
    mainContext.fillRect(0,0,mainCanvas.width, mainCanvas.height);

    drawStars();
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRenderPost
{
    //let minAliveTime = 9;
    //for(const player of players)
    //    minAliveTime = min(minAliveTime, player.getAliveTime());

    //const livesPercent = percent(minAliveTime, 5, 4)
    //const s = 8;
    //const offset = 100*livesPercent;
    //mainContext.drawImage(tileImage, 32, 8, s, s, 32, mainCanvas.height-90, s*9, s*9);
    mainContext.textAlign = 'center';
    const p = percent(gameTimer.get(), 8, 10);

    //mainContext.globalCompositeOperation = 'difference';
    mainContext.fillStyle = new Color(1,1,1,p).rgba();
    if (p > 0)
    {
        //mainContext.fillStyle = (new Color).setHSLA(time/3,1,.5,p).rgba();
        mainContext.font = 'bold 1in Inter';
        mainContext.fillText('ROUGHSHOD MALEFACTOR', mainCanvas.width/2, 150);
        
        // Controls subtitle
        mainContext.font = 'bold 24px Inter';
        const controlsY = 220;
        const lineHeight = 28;
        mainContext.fillText('WASD = Move', mainCanvas.width/2, controlsY);
        mainContext.fillText('Arrows = Aim', mainCanvas.width/2, controlsY + lineHeight);
        mainContext.fillText('E = Melee', mainCanvas.width/2, controlsY + lineHeight * 2);
        mainContext.fillText('C = Grenade', mainCanvas.width/2, controlsY + lineHeight * 3);
        mainContext.fillText('Space = Shoot', mainCanvas.width/2, controlsY + lineHeight * 4);
        mainContext.fillText('Shift = Roll', mainCanvas.width/2, controlsY + lineHeight * 5);
    }

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
    mainContext.font = 'bold 16px Inter';
    mainContext.textAlign = 'left';
    const hudX = 20;
    const hudY = 30;
    const lineHeight = 20;

    mainContext.fillText('LEVEL ' + level, hudX, hudY);
    mainContext.fillText('LIVES ' + playerLives, hudX, hudY + lineHeight);
    mainContext.fillText('ENEMIES ' + enemiesCount, hudX, hudY + lineHeight * 2);

    // fade in level transition
    const fade = levelEndTimer.isSet() ? percent(levelEndTimer.get(), 3, 1) : percent(levelTimer.get(), .5, 2);
    drawRect(cameraPos, vec2(1e3), new Color(0,0,0,fade))

    // game over text
    if (gameOverTimer.isSet())
    {
        const gameOverFade = min(gameOverTimer.get() / 1.5, 1); // fade in over 1.5 seconds
        const textAlpha = gameOverFade; // fade in text
        
        mainContext.textAlign = 'center';
        mainContext.textBaseline = 'middle';
        mainContext.fillStyle = new Color(1, 1, 1, textAlpha).rgba();
        mainContext.font = 'bold 64px Inter';
        mainContext.fillText('GAME OVER', mainCanvas.width/2, mainCanvas.height/2);
    }

    // game complete text
    if (gameCompleteTimer.isSet())
    {
        const gameCompleteFade = min(gameCompleteTimer.get() / 1.5, 1); // fade in over 1.5 seconds
        const textAlpha = gameCompleteFade; // fade in text
        
        mainContext.textAlign = 'center';
        mainContext.textBaseline = 'middle';
        mainContext.fillStyle = new Color(1, 1, 1, textAlpha).rgba();
        mainContext.font = 'bold 64px Inter';
        mainContext.fillText('YOU WIN!', mainCanvas.width/2, mainCanvas.height/2);
    }
});