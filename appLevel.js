/*
    Javascript Space Game
    By Frank Force 2021

*/

'use strict';

const tileType_ladder  = -1;
const tileType_empty   = 0;
const tileType_solid   = 1;
const tileType_dirt    = 2;
const tileType_base    = 3;
const tileType_pipeH   = 4;
const tileType_pipeV   = 5;
const tileType_glass   = 6;
const tileType_baseBack= 7;
const tileType_window  = 8;
const tileType_computer = 9;

const tileRenderOrder = -1e3;
const tileBackgroundRenderOrder = -2e3;

// level objects
let players=[], playerLives, tileLayer, tileBackgroundLayer, totalKills;
let playerEquippedWeapons = []; // Store equipped weapon type per player index (persists through respawn)
let playerWardrobeSuits = []; // Store wardrobe suit indices per player index (persists through respawn and unequip)

// level settings
let levelSize, level, levelSeed, levelEnemyCount, levelWarmup;
let levelColor, levelBackgroundColor, levelSkyColor, levelSkyHorizonColor, levelGroundColor;
let levelBackgroundGif; // Selected background GIF (dayGifImage or nightGifImage)
let backgroundParallaxOffset = vec2(); // Parallax offset for background
let previousCameraPos = vec2(); // Track previous camera position for parallax
let skyParticles, skyRain, skySoundTimer = new Timer;
let gameTimer = new Timer, levelTimer = new Timer, levelEndTimer = new Timer, gameOverTimer = new Timer, gameCompleteTimer = new Timer;
let gameState = 'title'; // game states: 'title', 'playing', 'gameOver', 'win'

// level enemy limits: [maxEnemies, maxSlimes, maxBastards, maxMalefactors, maxFoes, maxSpiders, maxSpiderlings, maxBarristers, maxSolicitors]
const levelLimits = {
    1: [20, 1, 0, 0, 0, 1, 0, 1, 0, 0],  // Level 1: 1 spider boss, 1 barrister, 0 solicitors, 0 prosecutors
    2: [40, 3, 0, 0, 0, 0, 3, 1, 1, 0],  // Level 2: max 3 spiderlings, 1 barrister, 1 solicitor, 0 prosecutors
    3: [50, 10, 15, 0, 0, 0, 5, 1, 1, 1],  // Level 3: max 5 spiderlings, 1 barrister, 1 solicitor, 1 prosecutor
    4: [30, 0, 28, 1, 0, 1, 0, 1, 1, 1],  // Level 4: 30 total (1 malefactor, 1 spider, 28 bastards), 1 barrister, 1 solicitor, 1 prosecutor
    5: [60, 20, 15, 10, 1, 0, 8, 1, 1, 1],  // Level 5: 60 enemies total, including 10 malefactors, 1 foe, and 8 spiderlings, 1 barrister, 1 solicitor, 1 prosecutor
    // 6: [1, 0, 0, 0, 0]  // Level 6: Flat level with 1 weak enemy and many crates - REMOVED
};
let levelMaxEnemies, levelMaxSlimes, levelMaxBastards, levelMaxMalefactors, levelMaxFoes, levelMaxSpiders, levelMaxSpiderlings, levelMaxBarristers, levelMaxSolicitors, levelMaxProsecutors;
let totalEnemiesSpawned, totalSlimesSpawned, totalBastardsSpawned, totalMalefactorsSpawned, totalFoesSpawned, totalSpidersSpawned, totalSpiderlingsSpawned, totalBarristersSpawned, totalSolicitorsSpawned, totalProsecutorsSpawned;

let tileBackground, keyItemSpawned;
const setTileBackgroundData = (pos, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileBackground[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
const getTileBackgroundData = (pos)=>
    pos.arrayCheck(tileCollisionSize) ? tileBackground[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

///////////////////////////////////////////////////////////////////////////////
// level generation

const resetGame=()=>
{
    levelEndTimer.unset();
    gameOverTimer.unset();
    gameCompleteTimer.unset();
    gameTimer.set(totalKills = 0);
    level = selectedLevel - 1; // Start at selected level (nextLevel increments it)
    gameState = 'playing';
    survivingGirls = []; // Clear girls on game reset
    nextLevel();
}

function buildTerrain(size)
{
    tileBackground = [];
    initTileCollision(size);
    
    // Level 6: Flat terrain - REMOVED
    // if (level == 6)
    // {
    //     const flatGroundLevel = 50; // Fixed ground level for flat terrain
    //     for(let x=0; x < size.x; x++)
    //     {
    //         for(let y=0; y < size.y; y++)
    //         {
    //             const pos = vec2(x,y);
    //             let frontTile = tileType_empty;
    //             if (y < flatGroundLevel)
    //                 frontTile = tileType_dirt;
    //             
    //             let backTile = tileType_empty;
    //             if (y < flatGroundLevel)
    //                 backTile = tileType_dirt;
    //             
    //             setTileCollisionData(pos, frontTile);
    //             setTileBackgroundData(pos, backTile);
    //         }
    //     }
    //     return; // Early return for level 6
    // }
    
    // Normal terrain generation for other levels
    let startGroundLevel = rand(40, 60);
    let groundLevel = startGroundLevel;
    let groundSlope = rand(.5,-.5);
    let canayonWidth = 0, backgroundDelta = 0, backgroundDeltaSlope = 0;
    for(let x=0; x < size.x; x++)
    {
        // pull slope towards start ground level
        groundLevel += groundSlope = rand() < .05 ? rand(.5,-.5) :
            groundSlope + (startGroundLevel - groundLevel)/1e3;
        
        // small jump
        if (rand() < .04)
            groundLevel += rand(9,-9);

        if (rand() < .03)
        {
            // big jump
            const jumpDelta = rand(9,-9);
            startGroundLevel = clamp(startGroundLevel + jumpDelta, 80, 20);
            groundLevel += jumpDelta;
            groundSlope = rand(.5,-.5);
        }

        --canayonWidth;
        if (rand() < .005)
            canayonWidth = rand(7, 2);

        backgroundDelta += backgroundDeltaSlope;
        if (rand() < .1)
            backgroundDelta = rand(3, -1);
        if (rand() < .1)
            backgroundDelta = 0;
        if (rand() < .1)
            backgroundDeltaSlope = rand(1,-1);
        backgroundDelta = clamp(backgroundDelta, 3, -1)

        groundLevel = clamp(groundLevel, 99, 30);
        for(let y=0; y < size.y; y++)
        {
            const pos = vec2(x,y);

            let frontTile = tileType_empty;
            if (y < groundLevel && canayonWidth <= 0)
                 frontTile = tileType_dirt;

            let backTile = tileType_empty;
            if (y < groundLevel + backgroundDelta)
                 backTile = tileType_dirt;
            
            setTileCollisionData(pos, frontTile);
            setTileBackgroundData(pos, backTile);
        }
    }

    // add random holes
    for(let i=levelSize.x; i--;)
    {
        const pos = vec2(rand(levelSize.x), rand(levelSize.y-19, 19));
        for(let x = rand(9,1)|0;--x;)
        for(let y = rand(9,1)|0;--y;)
            setTileCollisionData(pos.add(vec2(x,y)), tileType_empty);
    }
}

function clearEdgeTiles(size, edgeBuffer = 20)
{
    // clear collision tiles within edgeBuffer tiles from left and right edges
    // this ensures players can jump off the sides of the floating island
    for(let x = 0; x < edgeBuffer; ++x)
    for(let y = 0; y < size.y; ++y)
    {
        setTileCollisionData(vec2(x, y), tileType_empty);
        setTileBackgroundData(vec2(x, y), tileType_empty);
    }
    
    for(let x = size.x - edgeBuffer; x < size.x; ++x)
    for(let y = 0; y < size.y; ++y)
    {
        setTileCollisionData(vec2(x, y), tileType_empty);
        setTileBackgroundData(vec2(x, y), tileType_empty);
    }
}

function createMalefactorSpawnPlatform(centerX, groundY, platformWidth = 12, platformHeight = 8)
{
    // Create a flat platform for the malefactor to spawn on
    // Clear a large area and create a solid platform
    const halfWidth = platformWidth / 2;
    const platformTop = groundY - platformHeight;
    
    // Clear the area above the platform (air space)
    for(let x = centerX - halfWidth; x <= centerX + halfWidth; ++x)
    {
        for(let y = platformTop; y < groundY; ++y)
        {
            const pos = vec2(x, y);
            setTileCollisionData(pos, tileType_empty);
            setTileBackgroundData(pos, tileType_empty);
        }
    }
    
    // Create the platform floor (solid ground)
    for(let x = centerX - halfWidth; x <= centerX + halfWidth; ++x)
    {
        const pos = vec2(x, groundY);
        setTileCollisionData(pos, tileType_dirt);
        setTileBackgroundData(pos, tileType_dirt);
    }
    
    // Return the spawn position (center of platform, slightly above ground)
    return vec2(centerX, groundY - 1);
}

function spawnProps(pos)
{
    if (abs(checkpointPos.x-pos.x) > 5)
    {
        new Prop(pos);
        const propPlaceSize = .51;
        if (randSeeded() < .2)
        {
            // 3 triangle prop stack
            new Prop(pos.add(vec2(propPlaceSize*2,0)));
            if (randSeeded() < .2)
                new Prop(pos.add(vec2(propPlaceSize,propPlaceSize*2)));
        }
        else if (randSeeded() < .2)
        {
            // 3 column prop stack
            new Prop(pos.add(vec2(0,propPlaceSize*2)));
            if (randSeeded() < .2)
                new Prop(pos.add(vec2(0,propPlaceSize*4)));
        }
    }
}

function buildBase(totalSlimesSpawnedRef, totalBastardsSpawnedRef, totalMalefactorsSpawnedRef, totalEnemiesSpawnedRef, totalSpiderlingsSpawnedRef, totalBarristersSpawnedRef, totalSolicitorsSpawnedRef, totalProsecutorsSpawnedRef)
{
    // check if we've hit limits
    if (totalEnemiesSpawnedRef.value >= levelMaxEnemies)
        return 1; // reached max enemies
    
    let raycastHit;
    for(let tries=99;!raycastHit;)
    {
        if (!tries--)
            return 1; // count not find pos

        const pos = vec2(randSeeded(levelSize.x-40,40), levelSize.y);

        // must not be near player start
        if (abs(checkpointPos.x-pos.x) > 30)
            raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
    }

    const cave = rand() < .5;
    const baseBottomCenterPos = raycastHit.int();
    const baseSize = randSeeded(20,9)|0;
    const baseFloors = cave? 1 : randSeeded(6,1)|0;
    const basementFloors = randSeeded(cave?7:4, 0)|0;
    let floorBottomCenterPos = baseBottomCenterPos.subtract(vec2(0,basementFloors*6));
    floorBottomCenterPos.y = max(floorBottomCenterPos.y, 9); // prevent going through bottom

    let floorWidth = baseSize;
    let previousFloorHeight = 0;
    for(let floor=-basementFloors; floor <= baseFloors; ++floor)
    {  
        const topFloor = floor == baseFloors;
        const groundFloor = !floor;
        const isCaveFloor = cave ? rand() < .8 | (floor == 0 && rand() < .6): 0;
        let floorHeight = isCaveFloor ? randSeeded(9,2)|0 : topFloor? 0 : groundFloor? randSeeded(9,4)|0 : randSeeded(7,2)|0;
        const floorSpace = topFloor ? 4 : max(floorHeight - 1, 0);

        let backWindow = rand() < .5;
        const windowTop = rand(4,2);

        for(let x=-floorWidth; x <= floorWidth; ++x)
        {
            const isWindow = !isCaveFloor && randSeeded() < .3;
            const hasSide = !isCaveFloor && randSeeded() < .9;

            if (cave)
                backWindow = 0;
            else if (rand() < .1)
                backWindow = !backWindow;

            if (cave && rand() < .2)
                floorHeight = clamp(floorHeight + rand(3,-3)|0, 9, 2)

            for(let y=-1; y < floorHeight; ++y)
            {
                const pos = floorBottomCenterPos.add(vec2(x,y));
                let foregroundTile = tileType_empty;
                if (isCaveFloor)
                {
                    // add ceiling and floor
                    if ( y < 0 | y == floorHeight-1)
                        foregroundTile = tileType_dirt;

                    setTileBackgroundData(pos, tileType_dirt);
                    setTileCollisionData(pos, foregroundTile);
                }
                else
                {
                    // add ceiling and floor
                    const isHorizontal = y < 0 | y == floorHeight-1;
                    if (isHorizontal)
                        foregroundTile = tileType_pipeH;

                    // add walls and windows
                    if (abs(x) == floorWidth)
                        foregroundTile = isHorizontal ? tileType_base : isWindow ? tileType_glass : tileType_pipeV;

                    let backgroundTile = foregroundTile>0||floorHeight<3? tileType_baseBack : tileType_base;
                    if (backWindow && y > 0 && y < floorHeight-windowTop && abs(x) < floorWidth-2)
                        backgroundTile = tileType_window;

                    setTileBackgroundData(pos, backgroundTile);
                    setTileCollisionData(pos, foregroundTile);
                }
            }
        }

        // add ladders to floor below
        if (!cave || !topFloor)
        for(let ladderCount=randSeeded(2)+1|0;ladderCount--;)
        {
            const x = randSeeded(floorWidth-1, -floorWidth+1)|0;
            const pos = floorBottomCenterPos.add(vec2(x,-2));

            let y=0;
            let hitBottom = 0;
            for(; y < levelSize.y; ++y)
            {
                const pos = floorBottomCenterPos.add(vec2(x,-y-1));
                if (pos.y < 2)
                {
                    // hit bottom, no ladder
                    break;
                }
                if (y && getTileCollisionData(pos) > 0 && getTileCollisionData(pos.add(vec2(0,1))) <= 0 )
                {
                    for(;y--;)
                    {
                        const pos = floorBottomCenterPos.add(vec2(x,-y-1));
                        setTileCollisionData(pos, tileType_ladder);
                    }
                    break;
                }
            }
        }

        // spawn crates
        const propCount = randSeeded(floorWidth/2)|0;
        for(let i = propCount; i--;)
            spawnProps(floorBottomCenterPos.add(vec2(randSeeded( floorWidth-2,-floorWidth+2),.5)));

        if (topFloor || floorSpace > 1)
        {
            // spawn enemies - ensure at least one enemy spawns per floor
            const enemyCount = max(propCount, 1);
            let slimeSpawned = 0;
            for(let i = enemyCount; i--;)
            {
                // check limits before spawning
                if (totalEnemiesSpawnedRef.value >= levelMaxEnemies)
                    break;
                
                const pos = floorBottomCenterPos.add(vec2(randSeeded( floorWidth-1,-floorWidth+1),.7));
                
                // decide what to spawn: slime, bastard, spiderling, barrister, solicitor, prosecutor, or regular enemy
                let spawnSlime = 0;
                let spawnBastard = 0;
                let spawnSpiderling = 0;
                let spawnBarrister = 0;
                let spawnSolicitor = 0;
                let spawnProsecutor = 0;
                
                // Check for spiderling first (levels 2, 3, and 5)
                if ((level == 2 || level == 3 || level == 5) && totalSpiderlingsSpawnedRef.value < levelMaxSpiderlings)
                {
                    // Chance to spawn spiderling based on level
                    let spiderlingChance = level == 2 ? 0.4 : (level == 3 ? 0.25 : 0.2); // 40% level 2, 25% level 3, 20% level 5
                    if (randSeeded() < spiderlingChance)
                        spawnSpiderling = 1;
                }
                
                // If not spawning spiderling, check for barrister (all levels)
                if (!spawnSpiderling && totalBarristersSpawnedRef.value < levelMaxBarristers)
                {
                    // Guaranteed spawn if we haven't spawned one yet, otherwise use chance
                    if (totalBarristersSpawnedRef.value == 0)
                        spawnBarrister = 1; // Guaranteed first barrister
                    else
                    {
                        // Small chance for additional barristers (shouldn't happen with limit of 1)
                        let barristerChance = 0.1;
                        if (randSeeded() < barristerChance)
                            spawnBarrister = 1;
                    }
                }
                
                // If not spawning spiderling or barrister, check for solicitor (levels 2+)
                if (!spawnSpiderling && !spawnBarrister && level >= 2 && totalSolicitorsSpawnedRef.value < levelMaxSolicitors)
                {
                    // Guaranteed spawn if we haven't spawned one yet, otherwise use chance
                    if (totalSolicitorsSpawnedRef.value == 0)
                        spawnSolicitor = 1; // Guaranteed first solicitor
                    else
                    {
                        // Small chance for additional solicitors (shouldn't happen with limit of 1)
                        let solicitorChance = 0.1;
                        if (randSeeded() < solicitorChance)
                            spawnSolicitor = 1;
                    }
                }
                
                // If not spawning spiderling, barrister, or solicitor, check for prosecutor (levels 3+)
                if (!spawnSpiderling && !spawnBarrister && !spawnSolicitor && level >= 3 && totalProsecutorsSpawnedRef.value < levelMaxProsecutors)
                {
                    // Guaranteed spawn if we haven't spawned one yet, otherwise use chance
                    if (totalProsecutorsSpawnedRef.value == 0)
                        spawnProsecutor = 1; // Guaranteed first prosecutor
                    else
                    {
                        // Small chance for additional prosecutors (shouldn't happen with limit of 1)
                        let prosecutorChance = 0.1;
                        if (randSeeded() < prosecutorChance)
                            spawnProsecutor = 1;
                    }
                }
                
                // If not spawning spiderling, barrister, solicitor, or prosecutor, check for bastard
                if (!spawnSpiderling && !spawnBarrister && !spawnSolicitor && !spawnProsecutor && level >= 3 && totalBastardsSpawnedRef.value < levelMaxBastards)
                {
                    // Chance to spawn bastard based on level
                    let bastardChance = level == 3 ? 0.4 : (level == 4 ? 0.25 : 0.2); // 40% level 3, 25% level 4, 20% level 5
                    if (randSeeded() < bastardChance)
                        spawnBastard = 1;
                }
                
                // If not spawning spiderling, barrister, solicitor, prosecutor, or bastard, check for slime
                if (!spawnSpiderling && !spawnBarrister && !spawnSolicitor && !spawnProsecutor && !spawnBastard && totalSlimesSpawnedRef.value < levelMaxSlimes)
                {
                    // we can still spawn slimes, use chance-based logic
                    if (level == 1)
                    {
                        spawnSlime = totalSlimesSpawnedRef.value == 0 ? 1 : 0;
                    }
                    else
                    {
                        // prefer slimes if we haven't spawned any yet, otherwise use chance
                        spawnSlime = !slimeSpawned ? 1 : (randSeeded() < 0.3);
                    }
                }
                
                if (spawnSpiderling)
                {
                    new Spiderling(pos);
                    ++totalSpiderlingsSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else if (spawnBarrister)
                {
                    // Create a platform for the barrister (2x size, needs clearance)
                    const platformX = pos.x;
                    const platformTest = vec2(platformX, levelSize.y);
                    let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
                    
                    let spawnPos;
                    if (raycastHit)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6);
                    }
                    else
                    {
                        // Fallback: use floor position
                        const floorGroundY = (floorBottomCenterPos.y + 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, floorGroundY, 10, 6);
                    }
                    
                    new Barrister(spawnPos);
                    ++totalBarristersSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else if (spawnSolicitor)
                {
                    // Create a platform for the solicitor (2x size, needs clearance)
                    const platformX = pos.x;
                    const platformTest = vec2(platformX, levelSize.y);
                    let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
                    
                    let spawnPos;
                    if (raycastHit)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6);
                    }
                    else
                    {
                        // Fallback: use floor position
                        const floorGroundY = (floorBottomCenterPos.y + 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, floorGroundY, 10, 6);
                    }
                    
                    new Solicitor(spawnPos);
                    ++totalSolicitorsSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else if (spawnProsecutor)
                {
                    // Create a platform for the prosecutor (3x size, needs larger clearance)
                    const platformX = pos.x;
                    const platformTest = vec2(platformX, levelSize.y);
                    let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
                    
                    let spawnPos;
                    if (raycastHit)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 12, 8);
                    }
                    else
                    {
                        // Fallback: use floor position
                        const floorGroundY = (floorBottomCenterPos.y + 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(platformX, floorGroundY, 12, 8);
                    }
                    
                    new Prosecutor(spawnPos);
                    ++totalProsecutorsSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else if (spawnBastard)
                {
                    new Bastard(pos);
                    ++totalBastardsSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else if (spawnSlime)
                {
                    new Slime(pos);
                    slimeSpawned = 1;
                    ++totalSlimesSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
                else
                {
                    new Enemy(pos);
                    ++totalEnemiesSpawnedRef.value;
                }
            }
        }

        const oldFloorWidth = floorWidth;
        floorWidth = max(floorWidth + randSeeded(8,-8),9)|0;
        floorBottomCenterPos.y += floorHeight;
        floorBottomCenterPos.x += randSeeded(oldFloorWidth - floorWidth+1)|0;
        previousFloorHeight = floorHeight;
    }

    //checkpointPos = floorBottomCenterPos.copy(); // start player on base for testing

        // spawn random enemies and props (level 4 skips this, it only has malefactors)
    if (level != 4)
    {
        for(let i=20;totalEnemiesSpawnedRef.value < levelMaxEnemies && i--;)
        {
            const pos = vec2(floorBottomCenterPos.x + randSeeded(99, -99), levelSize.y);
            raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
            // must not be near player start
            if (raycastHit && abs(checkpointPos.x-pos.x) > 20)
            {
                const pos = raycastHit.add(vec2(0,2));
                if (randSeeded() < .7)
                {
                    // spawn enemy (not slime in random spawns)
                    new Enemy(pos);
                    ++totalEnemiesSpawnedRef.value;
                }
                else
                    spawnProps(pos);
            }
        }
    }

    // spawn key item in random base (only one per level)
    if (!keyItemSpawned && randSeeded() < .3) // 30% chance per base
    {
        // Find a good spot for the key - try a few positions
        let keyPlaced = 0;
        for(let attempts=10; !keyPlaced && attempts--;)
        {
            const keyX = floorBottomCenterPos.x + randSeeded(floorWidth-2, -floorWidth+2);
            const keyY = floorBottomCenterPos.y - randSeeded(3, 0);
            const keyPos = vec2(keyX, keyY);

            // Check if position is valid (solid ground below, empty space)
            if (getTileCollisionData(keyPos) <= 0 &&
                getTileCollisionData(keyPos.add(vec2(0,1))) > 0 &&
                abs(checkpointPos.x - keyPos.x) > 15) // not too close to start
            {
                new KeyItem(keyPos.add(vec2(0, .5)));
                keyItemSpawned = 1;
                keyPlaced = 1;
            }
        }
    }
}

function generateLevel()
{
    levelEndTimer.unset();

    // explicitly destroy tile layers and sky particles before destroying all objects
    if (tileLayer)
        tileLayer.destroy();
    if (tileBackgroundLayer)
        tileBackgroundLayer.destroy();
    if (skyParticles)
        skyParticles.destroy();

    // remove all objects that are not persistnt or are descendants of something persitant
    // But preserve surviving girls and their children (weapons)
    const girlsToPreserve = [];
    const objectsToPreserve = [];
    for(const o of engineObjects)
    {
        if (o.isGirl && !o.destroyed && !o.isDead())
        {
            girlsToPreserve.push(o);
            objectsToPreserve.push(o);
            // Also preserve children (weapons)
            for(const child of o.children || [])
            {
                if (child && !child.destroyed)
                    objectsToPreserve.push(child);
            }
        }
        else
            o.destroy();
    }
    engineObjects = [];
    engineCollideObjects = [];
    
    // Restore preserved girls and their children to engineObjects
    for(const obj of objectsToPreserve)
    {
        if (obj && !obj.destroyed)
        {
            engineObjects.push(obj);
            if (obj.setCollision && obj.collideSolidObjects)
                engineCollideObjects.push(obj);
        }
    }

    // clear tile layer references
    tileLayer = null;
    tileBackgroundLayer = null;
    skyParticles = null;

    // reset key item spawn flag
    keyItemSpawned = 0;

    // randomize ground level hills (or flat for level 6)
    buildTerrain(levelSize);

    // find starting poing for player
    let raycastHit;
    for(let tries=99;!raycastHit;)
    {
        if (!tries--)
            return 1; // count not find pos

        // start on either side of level
        checkpointPos = vec2(levelSize.x/2 + (levelSize.x/2-10-randSeeded(9))*(randSeeded()<.5?-1:1) | 0, levelSize.y);
        raycastHit = tileCollisionRaycast(checkpointPos, vec2(checkpointPos.x, 0));
    }
    checkpointPos = raycastHit.add(vec2(0,1));

    // track total enemies, slimes, bastards, malefactors, foes, spiders, spiderlings, barristers, and solicitors spawned for this level
    totalEnemiesSpawned = 0;
    totalSlimesSpawned = 0;
    totalBastardsSpawned = 0;
    totalMalefactorsSpawned = 0;
    totalFoesSpawned = 0;
    totalSpidersSpawned = 0;
    totalSpiderlingsSpawned = 0;
    totalBarristersSpawned = 0;
    totalSolicitorsSpawned = 0;
    totalProsecutorsSpawned = 0;
    const totalSlimesSpawnedRef = { value: 0 };
    const totalBastardsSpawnedRef = { value: 0 };
    const totalMalefactorsSpawnedRef = { value: 0 };
    const totalFoesSpawnedRef = { value: 0 };
    const totalSpidersSpawnedRef = { value: 0 };
    const totalSpiderlingsSpawnedRef = { value: 0 };
    const totalBarristersSpawnedRef = { value: 0 };
    const totalSolicitorsSpawnedRef = { value: 0 };
    const totalProsecutorsSpawnedRef = { value: 0 };
    const totalEnemiesSpawnedRef = { value: 0 };
    
    // Level 6: Special generation - flat level with many crates and 1 weak enemy - REMOVED
    // if (level == 6)
    // {
    //     // Spawn many many many wooden crates across the level
    //     const crateCount = 200; // Many crates!
    //     const groundY = 50; // Flat ground level
    //     for(let i = crateCount; i--;)
    //     {
    //         const x = randSeeded(levelSize.x - 10, 5);
    //         const y = groundY + 0.5; // On top of ground
    //         const pos = vec2(x, y);
    //         // Only spawn if not too close to checkpoint
    //         if (abs(checkpointPos.x - x) > 10)
    //         {
    //             new Prop(pos, propType_crate_wood);
    //         }
    //     }
    //     
    //     // Spawn 1 weak enemy (guaranteed - if random attempts fail, use fallback)
    //     let enemySpawned = 0;
    //     for(let attempts = 50; !enemySpawned && attempts--;)
    //     {
    //         const x = randSeeded(levelSize.x - 20, 10);
    //         const y = groundY + 0.5;
    //         const pos = vec2(x, y);
    //         // Spawn away from checkpoint
    //         if (abs(checkpointPos.x - x) > 20)
    //         {
    //             const enemy = new Enemy(pos);
    //             // Force weak enemy type and properties
    //             enemy.type = type_weak;
    //             enemy.health = enemy.healthMax = 1;
    //             enemy.color = new Color(0,1,0);
    //             // Reset size to base and scale for weak enemy
    //             enemy.size = vec2(.6,.95).scale(.9);
    //             enemy.sizeScale = .9;
    //             ++totalEnemiesSpawnedRef.value;
    //             enemySpawned = 1;
    //         }
    //     }
    //     
    //     // Fallback: if random spawning failed, spawn at a guaranteed location
    //     if (!enemySpawned)
    //     {
    //         // Spawn away from checkpoint, ensuring at least 30 units away
    //         let spawnX = checkpointPos.x + (checkpointPos.x < levelSize.x/2 ? 40 : -40);
    //         spawnX = clamp(spawnX, 20, levelSize.x - 20); // Keep within level bounds
    //         const spawnPos = vec2(spawnX, groundY + 0.5);
    //         
    //         const enemy = new Enemy(spawnPos);
    //         // Force weak enemy type and properties
    //         enemy.type = type_weak;
    //         enemy.health = enemy.healthMax = 1;
    //         enemy.color = new Color(0,1,0);
    //         // Reset size to base and scale for weak enemy
    //         enemy.size = vec2(.6,.95).scale(.9);
    //         enemy.sizeScale = .9;
    //         ++totalEnemiesSpawnedRef.value;
    //     }
    //     
    //     // Skip normal base generation and enemy spawning for level 6
    //     // Sync the refs back to globals
    //     totalEnemiesSpawned = totalEnemiesSpawnedRef.value;
    //     totalSlimesSpawned = totalSlimesSpawnedRef.value;
    //     totalBastardsSpawned = totalBastardsSpawnedRef.value;
    //     totalMalefactorsSpawned = totalMalefactorsSpawnedRef.value;
    //     totalFoesSpawned = totalFoesSpawnedRef.value;
    //     
    //     // Build checkpoints for level 6
    //     for(let x=0; x<levelSize.x-9; )
    //     {
    //         x += rand(100,70);
    //         const pos = vec2(x, levelSize.y);
    //         raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
    //         if (raycastHit && abs(checkpointPos.x-pos.x) > 50)
    //         {
    //             const pos = raycastHit.add(vec2(0,1));
    //             new Checkpoint(pos);
    //         }
    //     }
    //     
    //     // Clear edge tiles
    //     clearEdgeTiles(levelSize, 20);
    //     return; // Early return - level 6 is done
    // }

    // Spawn malefactors directly on levels 4 and 5 (before base generation)
    if (level == 4 || level == 5)
    {
        const malefactorCount = levelMaxMalefactors;
        for(let i = 0; i < malefactorCount; i++)
        {
            let spawnPos = null;
            
            if (level == 4)
            {
                // Level 4: Create a guaranteed spawn platform
                // Spawn malefactor on the right side (+70), spider will be on left side (-70)
                let platformX = checkpointPos.x + 70;
                platformX = clamp(platformX, levelSize.x - 60, 60); // Keep away from edges
                
                // Find ground level at this X position
                const testPos = vec2(platformX, levelSize.y);
                raycastHit = tileCollisionRaycast(testPos, vec2(platformX, 0));
                
                if (raycastHit)
                {
                    // raycastHit returns center of tile (y + 0.5), so floor it to get tile Y
                    // The tile Y is the TOP of the solid tile, which is where we want the platform floor
                    const groundY = (raycastHit.y - 0.5) | 0;
                    spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 12, 8);
                }
                else
                {
                    // Fallback: create platform near checkpoint
                    const fallbackX = checkpointPos.x + 40;
                    const fallbackTest = vec2(fallbackX, levelSize.y);
                    raycastHit = tileCollisionRaycast(fallbackTest, vec2(fallbackX, 0));
                    if (raycastHit)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        spawnPos = createMalefactorSpawnPlatform(fallbackX, groundY, 12, 8);
                    }
                    else
                    {
                        // Ultimate fallback: use checkpoint ground level (checkpointPos is 1 tile above ground)
                        const checkpointGroundY = (checkpointPos.y - 1) | 0;
                        spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 40, checkpointGroundY, 12, 8);
                    }
                }
            }
            else
            {
                // Level 5: Use existing logic but with platform creation
                let foundPos = null;
                for(let attempts = 50; !foundPos && attempts--;)
                {
                    const pos = vec2(randSeeded(levelSize.x-40, 40), levelSize.y);
                    raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
                    if (raycastHit && abs(checkpointPos.x-pos.x) > 30)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        foundPos = createMalefactorSpawnPlatform(pos.x, groundY, 10, 6);
                    }
                }
                if (!foundPos)
                {
                    // Fallback for level 5
                    const fallbackX = checkpointPos.x + (i * 40 - 40);
                    const fallbackTest = vec2(fallbackX, levelSize.y);
                    raycastHit = tileCollisionRaycast(fallbackTest, vec2(fallbackX, 0));
                    if (raycastHit)
                    {
                        const groundY = (raycastHit.y - 0.5) | 0;
                        foundPos = createMalefactorSpawnPlatform(fallbackX, groundY, 10, 6);
                    }
                }
                spawnPos = foundPos;
            }
            
            // Spawn the malefactor on the platform
            if (spawnPos)
            {
                new Malefactor(spawnPos);
                ++totalMalefactorsSpawnedRef.value;
                ++totalEnemiesSpawnedRef.value;
            }
            else
            {
                // Emergency fallback: spawn at checkpoint with platform
                const emergencyGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 40, emergencyGroundY, 12, 8);
                new Malefactor(spawnPos);
                ++totalMalefactorsSpawnedRef.value;
                ++totalEnemiesSpawnedRef.value;
            }
        }
    }

    // Spawn foe on level 5 (before base generation)
    if (level == 5 && levelMaxFoes > 0)
    {
        let spawnPos = null;
        let foundPos = null;
        for(let attempts = 50; !foundPos && attempts--;)
        {
            const pos = vec2(randSeeded(levelSize.x-40, 40), levelSize.y);
            raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
            if (raycastHit && abs(checkpointPos.x-pos.x) > 50) // Farther from checkpoint than malefactors
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                foundPos = createMalefactorSpawnPlatform(pos.x, groundY, 15, 10); // Larger platform for foe
            }
        }
        if (!foundPos)
        {
            // Fallback: spawn away from checkpoint
            const fallbackX = checkpointPos.x + 80;
            const fallbackTest = vec2(fallbackX, levelSize.y);
            raycastHit = tileCollisionRaycast(fallbackTest, vec2(fallbackX, 0));
            if (raycastHit)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                foundPos = createMalefactorSpawnPlatform(fallbackX, groundY, 15, 10);
            }
        }
        spawnPos = foundPos;
        
        // Spawn the foe on the platform
        if (spawnPos)
        {
            new Foe(spawnPos);
            ++totalFoesSpawnedRef.value;
            ++totalEnemiesSpawnedRef.value;
        }
        else
        {
            // Emergency fallback: spawn at checkpoint with platform
            const emergencyGroundY = (checkpointPos.y - 1) | 0;
            spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 80, emergencyGroundY, 15, 10);
            new Foe(spawnPos);
            ++totalFoesSpawnedRef.value;
            ++totalEnemiesSpawnedRef.value;
        }
    }

    // Spawn spider on level 1 and 4 (before base generation) - with platform like malefactor
    if ((level == 1 || level == 4) && levelMaxSpiders > 0)
    {
        const spiderCount = levelMaxSpiders;
        for(let i = 0; i < spiderCount; i++)
        {
            let spawnPos = null;
            
            // Find a good location away from checkpoint (at least 40 tiles)
            // For level 4, spawn spider on opposite side from malefactor to avoid collision
            let platformX;
            if (level == 4) {
                // Malefactor spawns at +70, so spawn spider at -70 (opposite side)
                platformX = checkpointPos.x - 70;
            } else {
                platformX = checkpointPos.x + (randSeeded() < 0.5 ? 60 : -60);
            }
            platformX = clamp(platformX, levelSize.x - 60, 60); // Keep away from edges
            
            // Find ground level at this X position
            const testPos = vec2(platformX, levelSize.y);
            raycastHit = tileCollisionRaycast(testPos, vec2(platformX, 0));
            
            if (raycastHit)
            {
                // raycastHit returns center of tile (y + 0.5), so floor it to get tile Y
                const groundY = (raycastHit.y - 0.5) | 0;
                spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6); // Platform for spider
            }
            else
            {
                // Fallback: create platform near checkpoint but away from it
                const fallbackX = checkpointPos.x + (randSeeded() < 0.5 ? 50 : -50);
                const fallbackTest = vec2(fallbackX, levelSize.y);
                raycastHit = tileCollisionRaycast(fallbackTest, vec2(fallbackX, 0));
                if (raycastHit)
                {
                    const groundY = (raycastHit.y - 0.5) | 0;
                    spawnPos = createMalefactorSpawnPlatform(fallbackX, groundY, 10, 6);
                }
                else
                {
                    // Ultimate fallback: use checkpoint ground level (checkpointPos is 1 tile above ground)
                    const checkpointGroundY = (checkpointPos.y - 1) | 0;
                    spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 50, checkpointGroundY, 10, 6);
                }
            }
            
            // Spawn the spider on the platform
            if (spawnPos)
            {
                new Spider(spawnPos);
                ++totalSpidersSpawnedRef.value;
                ++totalEnemiesSpawnedRef.value;
            }
            else
            {
                // Emergency fallback: spawn at checkpoint with platform
                const emergencyGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 40, emergencyGroundY, 10, 6);
                new Spider(spawnPos);
                ++totalSpidersSpawnedRef.value;
                ++totalEnemiesSpawnedRef.value;
            }
        }
    }

    // Spawn bastards on level 4 (after malefactor and spider)
    if (level == 4 && levelMaxBastards > 0)
    {
        // Spawn bastards until we reach the limit
        for(let attempts = 200; totalBastardsSpawnedRef.value < levelMaxBastards && totalEnemiesSpawnedRef.value < levelMaxEnemies && attempts--;)
        {
            // Find a random position across the level
            const pos = vec2(randSeeded(levelSize.x-40, 40), levelSize.y);
            raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
            
            // Must not be too close to checkpoint (keep distance from start)
            if (raycastHit && abs(checkpointPos.x-pos.x) > 20)
            {
                const spawnPos = raycastHit.add(vec2(0, 2));
                
                // Make sure there's solid ground and empty space
                if (getTileCollisionData(spawnPos) <= 0)
                {
                    new Bastard(spawnPos);
                    ++totalBastardsSpawnedRef.value;
                    ++totalEnemiesSpawnedRef.value;
                }
            }
        }
    }

    // Spawn TON of crates on level 4
    if (level == 4)
    {
        // Scan across the level and place crates densely on solid ground
        const crateSpacing = 2; // Spawn crates every 2 tiles (very dense!)
        const minDistanceFromCheckpoint = 10; // Don't spawn too close to start
        
        for(let x = minDistanceFromCheckpoint; x < levelSize.x - minDistanceFromCheckpoint; x += crateSpacing)
        {
            // Try multiple Y positions to find ground
            for(let yOffset = 0; yOffset < 50; yOffset++)
            {
                const testPos = vec2(x, levelSize.y - yOffset);
                raycastHit = tileCollisionRaycast(testPos, vec2(x, 0));
                
                if (raycastHit)
                {
                    const groundY = (raycastHit.y - 0.5) | 0;
                    const cratePos = vec2(x + randSeeded(0.8, -0.8), groundY - 0.5);
                    
                    // Make sure there's solid ground below and empty space above
                    if (getTileCollisionData(vec2(cratePos.x, groundY)) > 0 &&
                        getTileCollisionData(cratePos) <= 0 &&
                        abs(checkpointPos.x - cratePos.x) > minDistanceFromCheckpoint)
                    {
                        // Spawn multiple crates at this location (stack them!)
                        const crateCount = randSeeded(3) + 1; // 1-3 crates per spot
                        for(let i = 0; i < crateCount; i++)
                        {
                            const offsetY = i * 0.6; // Stack them vertically
                            const finalPos = vec2(cratePos.x, cratePos.y - offsetY);
                            
                            // Random crate type - mostly wood crates, some metal, few explosive
                            let crateType = propType_crate_wood;
                            const randType = randSeeded();
                            if (randType < 0.1) // 10% explosive crates
                                crateType = propType_crate_explosive;
                            else if (randType < 0.3) // 20% metal crates
                                crateType = propType_crate_metal;
                            
                            new Prop(finalPos, crateType);
                        }
                        break; // Found ground, move to next X position
                    }
                }
            }
        }
        
        // Also spawn crates in clusters for extra density
        for(let cluster = 0; cluster < 30; cluster++)
        {
            const clusterX = randSeeded(levelSize.x - 40, 40);
            const testPos = vec2(clusterX, levelSize.y);
            raycastHit = tileCollisionRaycast(testPos, vec2(clusterX, 0));
            
            if (raycastHit && abs(checkpointPos.x - clusterX) > minDistanceFromCheckpoint)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                const clusterCenter = vec2(clusterX, groundY - 0.5);
                
                // Create a cluster of 5-10 crates
                const clusterSize = randSeeded(6) + 5;
                for(let i = 0; i < clusterSize; i++)
                {
                    const angle = randSeeded(PI * 2);
                    const radius = randSeeded(2, 0.5);
                    const crateX = clusterCenter.x + Math.cos(angle) * radius;
                    const crateY = clusterCenter.y + Math.sin(angle) * radius;
                    const cratePos = vec2(crateX, crateY);
                    
                    if (getTileCollisionData(vec2(crateX, groundY)) > 0 &&
                        getTileCollisionData(cratePos) <= 0)
                    {
                        let crateType = propType_crate_wood;
                        const randType = randSeeded();
                        if (randType < 0.15)
                            crateType = propType_crate_explosive;
                        else if (randType < 0.35)
                            crateType = propType_crate_metal;
                        
                        new Prop(cratePos, crateType);
                    }
                }
            }
        }
    }

    // random bases until we hit enemy limits (level 4 skips bases)
    if (level != 4)
    {
        for(let tries=99;totalEnemiesSpawnedRef.value < levelMaxEnemies;)
        {
            if (!tries--)
                break; // stop if we can't spawn more bases

            if (buildBase(totalSlimesSpawnedRef, totalBastardsSpawnedRef, totalMalefactorsSpawnedRef, totalEnemiesSpawnedRef, totalSpiderlingsSpawnedRef, totalBarristersSpawnedRef, totalSolicitorsSpawnedRef, totalProsecutorsSpawnedRef))
                break; // stop if buildBase returns error or limit reached
        }
    }
    
    // sync the refs back to globals
    totalEnemiesSpawned = totalEnemiesSpawnedRef.value;
    totalSlimesSpawned = totalSlimesSpawnedRef.value;
    totalBastardsSpawned = totalBastardsSpawnedRef.value;
    totalMalefactorsSpawned = totalMalefactorsSpawnedRef.value;
    totalFoesSpawned = totalFoesSpawnedRef.value;
    totalSpidersSpawned = totalSpidersSpawnedRef.value;
    totalSpiderlingsSpawned = totalSpiderlingsSpawnedRef.value;
    totalBarristersSpawned = totalBarristersSpawnedRef.value;
    totalSolicitorsSpawned = totalSolicitorsSpawnedRef.value;
    totalProsecutorsSpawned = totalProsecutorsSpawnedRef.value;

    // spawn jackrock - one per level
    // First, find all existing spiders to avoid spawning too close
    const spiderPositions = [];
    forEachObject(0, 0, (o)=>
    {
        // Check if it's a spider: enemy character with type 9 (type_spider) or sizeScale ~3.0
        if (o.isCharacter && o.team == team_enemy && !o.destroyed)
        {
            // Spiders have type 9 and sizeScale of 3.0
            if ((o.type === 9) || (o.sizeScale && abs(o.sizeScale - 3.0) < 0.1))
                spiderPositions.push(o.pos);
        }
    }, 0); // Check all objects, not just collide objects
    
    for(let tries=99; tries--;)
    {
        const jackrockX = randSeeded(levelSize.x - 50, 50);
        const pos = vec2(jackrockX, levelSize.y);
        raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
        // must not be near player start
        if (raycastHit && abs(checkpointPos.x - jackrockX) > 40)
        {
            const jackrockPos = raycastHit.add(vec2(0, 1));
            
            // Check if too close to any spider (spider is 3x size, jackrock is 4x size, need buffer)
            let tooCloseToSpider = 0;
            for(const spiderPos of spiderPositions)
            {
                // Check horizontal distance - need at least 40 tiles buffer for both large objects
                if (abs(jackrockPos.x - spiderPos.x) < 40)
                {
                    tooCloseToSpider = 1;
                    break;
                }
            }
            
            if (!tooCloseToSpider)
            {
                // Make sure there's enough space for the large rock
                if (getTileCollisionData(jackrockPos) <= 0 &&
                    getTileCollisionData(jackrockPos.add(vec2(0, -2))) <= 0)
                {
                    new Prop(jackrockPos, propType_rock_jackrock);
                    break;
                }
            }
        }
    }

    // build checkpoints
    for(let x=0; x<levelSize.x-9; )
    {
        x += rand(100,70);
        const pos = vec2(x, levelSize.y);
        raycastHit = tileCollisionRaycast(pos, vec2(pos.x, 0));
        // must not be near player start
        if (raycastHit && abs(checkpointPos.x-pos.x) > 50)
        {
            // todo prevent overhangs
            const pos = raycastHit.add(vec2(0,1));
            new Checkpoint(pos);
        }
    }
    
    // spawn computer on opposite side from player, as far as possible
    let computerSpawned = false;
    for(let tries = 199; !computerSpawned && tries--;)
    {
        // Calculate position on opposite side from player
        // Player is at checkpointPos.x, so computer should be on the other side
        const playerX = checkpointPos.x;
        const levelCenterX = levelSize.x / 2;
        
        // Spawn on opposite side - if player is left of center, spawn right, and vice versa
        let computerX;
        if (playerX < levelCenterX)
        {
            // Player is on left, spawn computer on right side
            computerX = randSeeded(levelSize.x - 30, levelSize.x - 80); // Far right side
        }
        else
        {
            // Player is on right, spawn computer on left side
            computerX = randSeeded(80, 30); // Far left side
        }
        
        // Find ground level at computer position
        const testPos = vec2(computerX, levelSize.y);
        raycastHit = tileCollisionRaycast(testPos, vec2(computerX, 0));
        
        if (raycastHit)
        {
            // Make sure it's far enough from player (at least 40 tiles, reduced from 50)
            const distanceFromPlayer = abs(raycastHit.x - checkpointPos.x);
            if (distanceFromPlayer > 40)
            {
                // Create a platform for the computer (similar to malefactor platform)
                const platformX = raycastHit.x;
                const groundY = (raycastHit.y - 0.5)|0; // Top of ground tile
                const platformWidth = 8; // Platform wider than computer (4 tiles) for safety
                
                // Create platform - clear area above and create floor
                const halfWidth = platformWidth / 2;
                for(let px = platformX - halfWidth; px <= platformX + halfWidth; px++)
                {
                    const platformPos = vec2(px, groundY);
                    if (platformPos.x >= 0 && platformPos.x < levelSize.x && 
                        platformPos.y >= 0 && platformPos.y < levelSize.y)
                    {
                        // Clear area above platform (for computer to sit)
                        for(let clearY = groundY - 1; clearY >= groundY - 4; clearY--)
                        {
                            const clearPos = vec2(px, clearY);
                            if (clearPos.y >= 0 && clearPos.y < levelSize.y)
                                setTileCollisionData(clearPos, tileType_empty);
                        }
                        // Create platform floor
                        setTileCollisionData(platformPos, tileType_dirt);
                    }
                }
                
                // Spawn computer - bottom-left corner of 4x4 grid
                // Computer sits on top of the platform (one tile above platform)
                const computerBottomY = groundY - 1; // One tile above platform
                const computerBottomLeft = vec2((platformX - 2)|0, computerBottomY);
                
                // Verify space is clear (should be after platform creation)
                let hasSpace = true;
                for(let x = 0; x < 4 && hasSpace; x++)
                {
                    for(let y = 0; y < 4 && hasSpace; y++)
                    {
                        const checkPos = computerBottomLeft.add(vec2(x, y));
                        // Check if position is valid
                        if (checkPos.x < 0 || checkPos.x >= levelSize.x || 
                            checkPos.y < 0 || checkPos.y >= levelSize.y)
                        {
                            hasSpace = false;
                            break;
                        }
                    }
                }
                
                if (hasSpace)
                {
                    new Computer(computerBottomLeft);
                    computerSpawned = true;
                }
            }
        }
    }
    
    // clear edge tiles so players can jump off the sides (do this last after all generation)
    clearEdgeTiles(levelSize, 20);
}

const groundTileStart = 8;

function makeTileLayers(level_)
{
    // create foreground layer
    tileLayer = new TileLayer(vec2(), levelSize);
    tileLayer.renderOrder = tileRenderOrder;

    // create background layer
    tileBackgroundLayer = new TileLayer(vec2(), levelSize);
    tileBackgroundLayer.renderOrder = tileBackgroundRenderOrder;

    for(let x=levelSize.x;x--;)
    for(let y=levelSize.y;y--;)
    {
        const pos = vec2(x,y);
        let tileType = getTileCollisionData(pos);
        if (tileType)
        {
            // todo pick tile, direction etc based on neighbors tile type
            let direction = rand(4)|0
            let mirror = rand(2)|0;
            let color;

            let tileIndex = groundTileStart;
            if (tileType == tileType_dirt)
            {
                tileIndex = groundTileStart+2 + rand()**3*2|0;
                color = levelColor.mutate(.03);
            }
            else if (tileType == tileType_pipeH)
            {
                tileIndex = groundTileStart+5;
                direction = 1;
            }
            else if (tileType == tileType_pipeV)
            {
                tileIndex = groundTileStart+5;
                direction = 0;
            }
            else if (tileType == tileType_glass)
            {
                tileIndex = groundTileStart+5;
                direction = 0;
                color = new Color(0,1,1,.5);
            }
            else if (tileType == tileType_base)
                tileIndex = groundTileStart+4;
            else if (tileType == tileType_ladder)
            {
                tileIndex = groundTileStart+7;
                direction = mirror = 0;
            }
            tileLayer.setData(pos, new TileLayerData(tileIndex, direction, mirror, color));
        }
        
        tileType = getTileBackgroundData(pos);
        if (tileType)
        {
            // todo pick tile, direction etc based on neighbors tile type
            const direction = rand(4)|0
            const mirror = rand(2)|0;
            let color = new Color();

            let tileIndex = groundTileStart;
            if (tileType == tileType_dirt)
            {
                tileIndex = groundTileStart +2 + rand()**3*2|0;
                color = levelColor.mutate();
            }
            else if (tileType == tileType_base)
            {
                tileIndex = groundTileStart+6;
                color = color.scale(rand(1,.7),1)
            }
            else if (tileType == tileType_baseBack)
            {
                tileIndex = groundTileStart+6;
                color = color.scale(rand(.5,.3),1).mutate();
            }
            else if (tileType == tileType_window)
            {
                tileIndex = 0;
                color = new Color(0,1,1,.5);
            }
            tileBackgroundLayer.setData(pos, new TileLayerData(tileIndex, direction, mirror, color.scale(.4,1)));
        }
    }
    tileLayer.redraw();
    tileBackgroundLayer.redraw();
}

function applyArtToLevel()
{
    makeTileLayers();
    
    // apply decoration to level tiles
    for(let x=levelSize.x;x--;)
    for(let y=levelSize.y;--y;)
    {
        decorateBackgroundTile(vec2(x,y));
        decorateTile(vec2(x,y));
    }

    generateParallaxLayers();

    if (precipitationEnable && !lowGraphicsSettings)
    {
        // Level 1 always has heavy rain, other levels randomly choose rain or snow
        if (level == 1)
        {
            // Level 1: heavy rain
            skyRain = 1;
            skyParticles = new ParticleEmitter(
                vec2(), 3, 0, 0, .3, // pos, emitSize, emitTime, emitRate, emiteCone
                0, undefined,   // tileIndex, tileSize
                new Color(.8,1,1,.6), new Color(.5,.5,1,.2), // colorStartA, colorStartB
                new Color(.8,1,1,.6), new Color(.5,.5,1,.2), // colorEndA, colorEndB
                2, .1, .1, .2, 0,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                .99, 1, .5, PI, .2,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                .5, 1              // randomness, collide, additive, randomColorLinear, renderOrder
            );
            skyParticles.elasticity = .2;
            skyParticles.trailScale = 2;
            skyParticles.emitRate = 800; // Heavy rain for level 1
            skyParticles.angle = PI+rand(.5,-.5);
        }
        else
        {
            // Other levels: randomly choose rain or snow
            if (skyRain = rand() < .5)
            {
                // rain
                skyParticles = new ParticleEmitter(
                    vec2(), 3, 0, 0, .3, // pos, emitSize, emitTime, emitRate, emiteCone
                    0, undefined,   // tileIndex, tileSize
                    new Color(.8,1,1,.6), new Color(.5,.5,1,.2), // colorStartA, colorStartB
                    new Color(.8,1,1,.6), new Color(.5,.5,1,.2), // colorEndA, colorEndB
                    2, .1, .1, .2, 0,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                    .99, 1, .5, PI, .2,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                    .5, 1              // randomness, collide, additive, randomColorLinear, renderOrder
                );
                skyParticles.elasticity = .2;
                skyParticles.trailScale = 2;
            }
            else
            {
                // snow
                skyParticles = new ParticleEmitter(
                    vec2(), 3, 0, 0, .5, // pos, emitSize, emitTime, emitRate, emiteCone
                    0, undefined,   // tileIndex, tileSize
                    new Color(1,1,1,.8), new Color(1,1,1,.2), // colorStartA, colorStartB
                    new Color(1,1,1,.8), new Color(1,1,1,.2), // colorEndA, colorEndB
                    3, .1, .1, .3, .01,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                    .98, 1, .2, PI, .2,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                    .5, 1              // randomness, collide, additive, randomColorLinear, renderOrder
                );
            }
            skyParticles.emitRate = precipitationEnable && rand()<.5 ? rand(500) : 0;
            skyParticles.angle = PI+rand(.5,-.5);
        }
    }
}

function nextLevel()
{
    playerLives = level == 0 ? 3 : playerLives + 4; // start with 3 lives, then add 4 for beating a level plus 1 for respawning
    ++level;
    
    // Clear checkpoint tracking for new level
    allCheckpoints = [];
    allComputers = []; // Clear computers for new level
    playerWardrobeSuits = []; // Clear wardrobe suits for new level (one suit per level)
    
    // set level limits
    const limits = levelLimits[level] || levelLimits[5]; // use level 5 limits for levels beyond 5
    levelMaxEnemies = limits[0];
    levelMaxSlimes = limits[1];
    levelMaxBastards = limits[2];
    levelMaxMalefactors = limits[3];
    levelMaxFoes = limits[4] || 0;
    levelMaxSpiders = limits[5] || 0;
    levelMaxSpiderlings = limits[6] || 0;
    levelMaxBarristers = limits[7] || 0;
    levelMaxSolicitors = limits[8] || 0;
    levelMaxProsecutors = limits[9] || 0;
    levelEnemyCount = levelMaxEnemies; // keep for compatibility with existing code
    levelSeed = randSeed = rand(1e9)|0;
    levelSize = level == 1 ? vec2(300,200) : vec2(min(level*99,400),200);
    levelColor = randColor(new Color(.2,.2,.2), new Color(.8,.8,.8));
    levelSkyColor = randColor(new Color(.5,.5,.5), new Color(.9,.9,.9));
    levelSkyHorizonColor = levelSkyColor.subtract(new Color(.05,.05,.05)).mutate(.3).clamp();
    levelGroundColor = levelColor.mutate().add(new Color(.3,.3,.3)).clamp();
    
    // Randomly select day or night background GIF
    levelBackgroundGif = rand() < 0.5 ? dayGifImage : nightGifImage;
    
    // Reset parallax offset for new level
    backgroundParallaxOffset = vec2();
    previousCameraPos = cameraPos.copy();

    // keep trying until a valid level is generated
    for(;generateLevel(););

    // warm up level
    levelWarmup = 1;

    // Create a wider platform for the first checkpoint (so player and girls can spawn safely)
    // Platform needs to be wide enough for player + multiple girls (up to 6-8 girls possible)
    // With 20 tiles wide (10 on each side), girls spawning at 1.5+ spacing can fit comfortably
    const checkpointGroundY = (checkpointPos.y - 1) | 0;
    createMalefactorSpawnPlatform(checkpointPos.x, checkpointGroundY, 20, 4); // 20 tiles wide, 4 tiles tall platform
    
    // objects that effect the level must be added here
    const firstCheckpoint = new Checkpoint(checkpointPos);
    firstCheckpoint.setActive();
    firstCheckpoint.secured = true; // First checkpoint is already secured
    firstCheckpoint.isFirstCheckpoint = true; // Mark as first checkpoint (no terminal on this one)

    applyArtToLevel();

    const warmUpTime = 2;
    for(let i=warmUpTime * FPS; i--;)
    {
        updateSky();
        engineUpdateObjects();
    }
    levelWarmup = 0;

    // destroy any objects that are stuck in collision
    // Skip characters - they handle their own collision and are supposed to be on the ground
    forEachObject(0, 0, (o)=>
    {
        if (o.isGameObject && o != firstCheckpoint && !o.isCharacter)
        {
            const checkBackground = o.isCheckpoint;
            (checkBackground ? getTileBackgroundData(o.pos) > 0 : tileCollisionTest(o.pos,o.size))  && o.destroy();
        }
    });

    // CRITICAL VERIFICATION: Ensure level 4 has exactly 1 malefactor and 1 spider (guaranteed spawn)
    if (level == 4)
    {
        // Verify malefactor exists
        let malefactorCount = 0;
        forEachObject(0, 0, (o)=>
        {
            // Check if it's a malefactor: enemy character with type 7 (type_malefactor) or sizeScale ~5.0
            if (o.isCharacter && o.team == team_enemy && !o.destroyed)
            {
                // Malefactors have type 7 and sizeScale of 5.0
                if ((o.type === 7) || (o.sizeScale && abs(o.sizeScale - 5.0) < 0.1))
                    ++malefactorCount;
            }
        }, 0); // Check all objects, not just collide objects

        // If no malefactor found, force spawn one with platform (guaranteed location)
        if (malefactorCount == 0)
        {
            // Create a spawn platform away from checkpoint
            const platformX = checkpointPos.x + 50;
            const platformTest = vec2(platformX, levelSize.y);
            let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
            
            let spawnPos;
            if (raycastHit)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 12, 8);
            }
            else
            {
                // Use checkpoint ground level (checkpointPos is 1 tile above ground)
                const checkpointGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 50, checkpointGroundY, 12, 8);
            }
            
            new Malefactor(spawnPos);
        }

        // Verify spider exists
        let spiderCount = 0;
        forEachObject(0, 0, (o)=>
        {
            // Check if it's a spider: enemy character with type 9 (type_spider) or sizeScale ~3.0
            if (o.isCharacter && o.team == team_enemy && !o.destroyed)
            {
                // Spiders have type 9 and sizeScale of 3.0
                if ((o.type === 9) || (o.sizeScale && abs(o.sizeScale - 3.0) < 0.1))
                    ++spiderCount;
            }
        }, 0); // Check all objects, not just collide objects

        // If no spider found, force spawn one with platform (guaranteed location)
        if (spiderCount == 0)
        {
            // Create a spawn platform away from checkpoint (different side from malefactor)
            const platformX = checkpointPos.x - 50; // Opposite side from malefactor
            const platformTest = vec2(platformX, levelSize.y);
            let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
            
            let spawnPos;
            if (raycastHit)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6);
            }
            else
            {
                // Use checkpoint ground level (checkpointPos is 1 tile above ground)
                const checkpointGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x - 50, checkpointGroundY, 10, 6);
            }
            
            new Spider(spawnPos);
        }
    }

    // CRITICAL VERIFICATION: Ensure every level has exactly 1 barrister (guaranteed spawn)
    let barristerCount = 0;
    forEachObject(0, 0, (o)=>
    {
        // Check if it's a barrister: enemy character with type 11 (type_barrister) or sizeScale ~2.0
        if (o.isCharacter && o.team == team_enemy && !o.destroyed)
        {
            // Barristers have type 11 and sizeScale of 2.0
            if ((o.type === 11) || (o.sizeScale && abs(o.sizeScale - 2.0) < 0.1))
                ++barristerCount;
        }
    }, 0); // Check all objects, not just collide objects

    // If no barrister found, force spawn one with platform (guaranteed location)
    if (barristerCount == 0 && levelMaxBarristers > 0)
    {
        // Create a spawn platform away from checkpoint
        const platformX = checkpointPos.x + 30;
        const platformTest = vec2(platformX, levelSize.y);
        let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
        
        let spawnPos;
        if (raycastHit)
        {
            const groundY = (raycastHit.y - 0.5) | 0;
            spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6);
        }
        else
        {
            // Use checkpoint ground level (checkpointPos is 1 tile above ground)
            const checkpointGroundY = (checkpointPos.y - 1) | 0;
            spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 30, checkpointGroundY, 10, 6);
        }
        
        new Barrister(spawnPos);
    }

    // CRITICAL VERIFICATION: Ensure every level from level 2 onward has exactly 1 solicitor (guaranteed spawn)
    if (level >= 2)
    {
        let solicitorCount = 0;
        forEachObject(0, 0, (o)=>
        {
            // Check if it's a solicitor: enemy character with type 12 (type_solicitor)
            if (o.isCharacter && o.team == team_enemy && !o.destroyed)
            {
                // Solicitors have type 12
                if (o.type === 12)
                    ++solicitorCount;
            }
        }, 0); // Check all objects, not just collide objects

        // If no solicitor found, force spawn one with platform (guaranteed location)
        if (solicitorCount == 0 && levelMaxSolicitors > 0)
        {
            // Create a spawn platform away from checkpoint (different from barrister)
            const platformX = checkpointPos.x - 30;
            const platformTest = vec2(platformX, levelSize.y);
            let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
            
            let spawnPos;
            if (raycastHit)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 10, 6);
            }
            else
            {
                // Use checkpoint ground level (checkpointPos is 1 tile above ground)
                const checkpointGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x - 30, checkpointGroundY, 10, 6);
            }
            
            new Solicitor(spawnPos);
        }
    }

    // CRITICAL VERIFICATION: Ensure every level from level 3 onward has exactly 1 prosecutor (guaranteed spawn)
    if (level >= 3)
    {
        let prosecutorCount = 0;
        forEachObject(0, 0, (o)=>
        {
            // Check if it's a prosecutor: enemy character with type 13 (type_prosecutor)
            if (o.isCharacter && o.team == team_enemy && !o.destroyed)
            {
                // Prosecutors have type 13
                if (o.type === 13)
                    ++prosecutorCount;
            }
        }, 0); // Check all objects, not just collide objects

        // If no prosecutor found, force spawn one with platform (guaranteed location)
        if (prosecutorCount == 0 && levelMaxProsecutors > 0)
        {
            // Create a spawn platform away from checkpoint (different from barrister and solicitor)
            const platformX = checkpointPos.x + 40;
            const platformTest = vec2(platformX, levelSize.y);
            let raycastHit = tileCollisionRaycast(platformTest, vec2(platformX, 0));
            
            let spawnPos;
            if (raycastHit)
            {
                const groundY = (raycastHit.y - 0.5) | 0;
                spawnPos = createMalefactorSpawnPlatform(platformX, groundY, 12, 8);
            }
            else
            {
                // Use checkpoint ground level (checkpointPos is 1 tile above ground)
                const checkpointGroundY = (checkpointPos.y - 1) | 0;
                spawnPos = createMalefactorSpawnPlatform(checkpointPos.x + 40, checkpointGroundY, 12, 8);
            }
            
            new Prosecutor(spawnPos);
        }
    }

    // CRITICAL VERIFICATION: Ensure level 6 has at least 1 enemy (guaranteed spawn) - REMOVED
    // if (level == 6)
    // {
    //     let enemyCount = 0;
    //     forEachObject(0, 0, (o)=>
    //     {
    //         // Check if it's an enemy character (not malefactor, foe, slime, or bastard)
    //         if (o.isCharacter && o.team == team_enemy && !o.destroyed)
    //         {
    //             // Count regular enemies (type 0-6, not malefactor type 7, and not slime/bastard)
    //             if (o.type !== undefined && o.type < 7 && !o.isSlime && !o.isBastard)
    //                 ++enemyCount;
    //         }
    //     }, 0); // Check all objects, not just collide objects
    //     
    //     // If no enemy found, force spawn one (guaranteed location)
    //     if (enemyCount == 0)
    //     {
    //         const groundY = 50; // Flat ground level for level 6
    //         // Spawn away from checkpoint, ensuring at least 20 units away
    //         let spawnX = checkpointPos.x + (abs(checkpointPos.x - levelSize.x/2) < 50 ? 30 : -30);
    //         spawnX = clamp(spawnX, 20, levelSize.x - 20); // Keep within level bounds
    //         const spawnPos = vec2(spawnX, groundY + 0.5);
    //         
    //         const enemy = new Enemy(spawnPos);
    //         // Force weak enemy type and properties
    //         enemy.type = type_weak;
    //         enemy.health = enemy.healthMax = 1;
    //         enemy.color = new Color(0,1,0);
    //         // Reset size to base and scale for weak enemy
    //         enemy.size = vec2(.6,.95).scale(.9);
    //         enemy.sizeScale = .9;
    //     }
    // }

    // hack, subtract off warm up time from main game timer
    //gameTimer.time += warmUpTime;
    levelTimer.set();

    // spawn player
    players = [];
    new Player(checkpointPos);
    //new Enemy(checkpointPos.add(vec2(3))); // test enemy
    
    // spawn girls (surviving girls from previous level + 1 new one)
    respawnSurvivingGirls(checkpointPos);
    spawnGirls(checkpointPos);
    
    // CRITICAL VERIFICATION: Ensure level 4 has at least 1 girl (guaranteed spawn)
    if (level == 4)
    {
        // Clean up dead girls first to get accurate count
        if (typeof cleanupSurvivingGirls === 'function')
            cleanupSurvivingGirls();
        
        let girlCount = 0;
        forEachObject(0, 0, (o)=>
        {
            // Check if it's a girl: character with isGirl flag or team_player with bodyTile 23
            if (o.isGirl || (o.isCharacter && o.team == team_player && o.bodyTile === 23))
            {
                if (!o.destroyed && !o.isDead())
                    ++girlCount;
            }
        }, 0); // Check all objects, not just collide objects
        
        // If no girl found, force spawn one (guaranteed location) - but respect max limit
        if (girlCount == 0 && typeof survivingGirls !== 'undefined' && (typeof MAX_GIRLS === 'undefined' || survivingGirls.length < MAX_GIRLS))
        {
            const girlSpawnPos = checkpointPos.add(vec2(1.5, 0));
            const newGirl = new Girl(girlSpawnPos);
            // Add to survivingGirls array
            if (typeof survivingGirls !== 'undefined' && newGirl)
            {
                survivingGirls.push(newGirl);
            }
        }
    }
}