/*
    Friendly NPC Boys
    Extends Character to create helpful companions
*/

'use strict';

// Global array to track surviving boys across levels
let survivingBoys = [];

// Maximum number of boys allowed
const MAX_BOYS = 50;

// Helper function to create and protect a weapon for a boy
function createProtectedWeapon(boy)
{
    const weapon = new Weapon(boy.pos, boy);
    // Ensure weapon is visible (not hidden)
    weapon.hidden = 0;
    // Make sure weapon doesn't take damage or have health
    weapon.health = weapon.healthMax = 0; // No health
    weapon.noFallDamage = 1; // Prevent fall damage on weapon
    // Override damage to completely prevent any damage
    weapon.damage = function() { return 0; };
    // Prevent any fall velocity tracking (in case weapon somehow gets this property)
    weapon.maxFallVelocity = 0;
    return weapon;
}

class Boy extends Character
{
    constructor(pos) 
    { 
        super(pos, 0.7); // sizeScale = 0.7

        this.team = team_player;
        this.health = this.healthMax = 10;
        this.persistent = 1; // Survive level transitions
        this.noFallDamage = 1; // Boys don't take fall damage
        
        // AI timers
        this.sawEnemyTimer = new Timer;
        this.attackDelayTimer = new Timer; // Brief delay before starting to shoot
        this.holdJumpTimer = new Timer;
        this.followDistanceTimer = new Timer;
        this.spawnSafetyTimer = new Timer;
        this.spawnSafetyTimer.set(0.5); // Wait 0.5 seconds after spawn before aggressive movement
        this.stuckTimer = new Timer; // Track if stuck on obstacle
        this.wallJumpTimer = new Timer; // Cooldown for wall jumps
        this.pathfindTimer = new Timer; // For pathfinding checks
        this.tileShootTimer = new Timer; // Cooldown for shooting at tiles
        this.targetTile = null; // Tile position to shoot at
        
        // Vision and behavior
        this.maxVisionRange = 20; // Much better vision than enemies (12-15)
        this.followDistance = 1.0; // Stay very close to player
        this.targetEnemy = null;
        this.lastStuckPos = null; // Track last stuck position for pathfinding
        this.boyIndex = survivingBoys.length; // For staggering positions
        
        // Appearance - using tiles2.png, no head/eyes
        // Use a full character sprite from tiles2.png (full tile, not small item)
        // Using tile 22 as a full character sprite (8px by 8px tile index)
        this.bodyTile = 22; // Full character sprite from tiles2.png
        this.tileSize = vec2(8); // Full character tile size (8x8 pixels, same as other characters)
        this.color = new Color(1, 1, 1); // No tint - white/default color
        this.sizeScale = 0.7;
        
        // Weapon - ensure it never takes damage or fall damage
        createProtectedWeapon(this);
        
        // Random offset for follow behavior variation
        this.followOffset = rand(2*PI);
        this.sightCheckFrame = rand(9)|0;
        
        // Initialize timers that need starting values
        this.pathfindTimer.set(0); // Start immediately
        this.tileShootTimer.set(0); // Ready to shoot at tiles immediately
    }
    
    update()
    {
        // ALWAYS prevent fall damage tracking
        this.maxFallVelocity = 0;
        
        // CRITICAL: If dead or destroyed, remove from survivingBoys immediately
        if (this.isDead() || this.destroyed || this.health <= 0)
        {
            const idx = survivingBoys.indexOf(this);
            if (idx >= 0)
                survivingBoys.splice(idx, 1);
        }
            
        if (this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            this.maxFallVelocity = 0;
            return;
        }

        // Ensure weapon exists (recreate if missing)
        if (!this.weapon || this.weapon.destroyed)
        {
            createProtectedWeapon(this);
        }
        
        if (this.weapon)
            this.weapon.localPos = this.weapon.localOffset.scale(this.sizeScale);

        // Find player to follow
        const player = players[0];
        if (!player || player.isDead())
        {
            // No player - stop shooting, idle behavior
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            this.moveInput = vec2(0, 0);
            super.update();
            this.maxFallVelocity = 0;
            return;
        }

        // ========== VOID DEATH & SAFETY TELEPORT ==========
        // Falling into void KILLS the boy - no rescue from void holes!
        const fellIntoVoid = this.pos.y < -5;
        if (fellIntoVoid)
        {
            // He fell into the void - he dies (bypassing noFallDamage)
            this.health = 0;
            // Remove from surviving boys immediately
            const index = survivingBoys.indexOf(this);
            if (index >= 0)
                survivingBoys.splice(index, 1);
            this.destroy();
            return;
        }
        
        // Safety teleport only for getting stuck in walls or stranded too far
        const stuckInWall = getTileCollisionData(this.pos) > 0 && getTileCollisionData(this.pos) != tileType_ladder;
        const wayTooFar = this.pos.distance(player.pos) > 40; // Only teleport if VERY far
        if (stuckInWall || wayTooFar)
        {
            // Teleport to player's position (slightly offset)
            this.pos = player.pos.add(vec2(this.boyIndex + 1, 0));
            this.velocity = vec2(0, 0);
            this.groundObject = 0; // Reset ground state
        }
        
        // Cap upward velocity to prevent flying into sky
        // Boys can jump higher, so allow higher upward velocity (0.35)
        if (this.velocity.y > 0.35)
            this.velocity.y = 0.35;

        // ========== ENEMY DETECTION ==========
        const sightCheckFrames = 9;
        if (frame % sightCheckFrames == this.sightCheckFrame)
        {
            this.targetEnemy = null;
            let closestDist = this.maxVisionRange * this.maxVisionRange;
            
            // Find closest visible enemy
            for (const o of engineCollideObjects)
            {
                if (!o.isCharacter || o.team != team_enemy || o.isDead() || o.destroyed)
                    continue;
                
                const distSq = this.pos.distanceSquared(o.pos);
                if (distSq < closestDist)
                {
                    // Check line of sight
                    const rayHit = tileCollisionRaycast(this.pos, o.pos);
                    if (!rayHit)
                    {
                        this.targetEnemy = o;
                        closestDist = distSq;
                        this.sawEnemyTimer.set();
                        // Start brief delay timer when enemy is first spotted
                        if (!this.attackDelayTimer.isSet())
                        {
                            this.attackDelayTimer.set(0.2); // Brief 0.2 second delay before attacking
                        }
                    }
                }
            }
            
            // Reset attack delay if no enemy visible
            if (!this.targetEnemy)
            {
                this.attackDelayTimer.unset();
            }
        }

        // ========== MOVEMENT & FOLLOWING ==========
        const toPlayer = player.pos.subtract(this.pos);
        const distToPlayer = toPlayer.length();
        const playerDirection = sign(toPlayer.x) || 1;
        
        // Follow distance - stay close but not clingy
        const desiredDist = 2.0; // Comfortable following distance
        const maxFollowDist = 5.0; // Start walking faster beyond this
        
        // Stagger position slightly for multiple boys
        const staggerOffset = this.boyIndex * 0.8;
        
        // Movement towards player - calm walking pace
        this.moveInput = vec2(0, 0);
        
        if (distToPlayer > desiredDist + staggerOffset)
        {
            // Walk towards player - gradual speed based on distance
            let walkSpeed;
            if (distToPlayer > maxFollowDist)
            {
                // Getting far - walk faster but don't rush
                walkSpeed = 0.6;
            }
            else
            {
                // Close enough - gentle walking pace
                walkSpeed = 0.35;
            }
            this.moveInput.x = playerDirection * walkSpeed;
        }
        else if (distToPlayer < 1.0)
        {
            // Too close - gently back off
            this.moveInput.x = -playerDirection * 0.15;
        }
        // else: He's at a good distance, just stay put
        
        // Vertical movement for ladders only
        if (abs(toPlayer.y) > 3 && this.climbingLadder)
            this.moveInput.y = sign(toPlayer.y) * 0.5;

        // ========== OBSTACLE DETECTION & JUMPING ==========
        // Walk on foot when possible, but jump when needed to navigate
        const onGround = this.groundObject || this.groundTimer.active();
        const lookAhead = this.getMirrorSign(1.0);
        const feetPos = this.pos.subtract(vec2(0, this.size.y * 0.4));
        
        // Check for wall/obstacle ahead at feet level
        const wallCheckPos = feetPos.add(vec2(lookAhead * 0.8, 0));
        const wallTile = getTileCollisionData(wallCheckPos);
        const isBlockedByWall = wallTile > 0 && wallTile != tileType_ladder;
        
        // Check for step/stair ahead (1-2 tile high obstacle with clear space above)
        const stepCheckLow = feetPos.add(vec2(lookAhead * 0.8, 0.5));
        const stepCheckHigh = feetPos.add(vec2(lookAhead * 0.8, 2.0));
        const hasStepAhead = isBlockedByWall && 
                             getTileCollisionData(stepCheckHigh) <= 0;
        
        // Check for gap ahead
        const gapCheckPos = feetPos.add(vec2(lookAhead * 1.2, -1));
        const gapCheckDeep = feetPos.add(vec2(lookAhead * 1.2, -2));
        const hasGapAhead = getTileCollisionData(gapCheckPos) <= 0 && 
                            getTileCollisionData(gapCheckDeep) <= 0 &&
                            this.moveInput.x != 0 && onGround;
        
        // Stuck detection
        if (this.pathfindTimer.elapsed())
        {
            this.pathfindTimer.set(0.5);
            if (this.lastStuckPos && this.pos.distance(this.lastStuckPos) < 0.3 && 
                abs(this.moveInput.x) > 0.2 && onGround)
            {
                // We're stuck - try a jump
                this.stuckTimer.set(0.4);
            }
            this.lastStuckPos = this.pos.copy();
        }
        
        // Determine if we should jump
        let shouldJump = false;
        
        // Only consider jumping when on ground and trying to move
        if (onGround && abs(this.moveInput.x) > 0.1)
        {
            // Jump over gaps
            if (hasGapAhead)
            {
                shouldJump = true;
            }
            // Hop over steps/stairs
            else if (hasStepAhead)
            {
                shouldJump = true;
            }
            // Stuck against wall - try jumping
            else if (this.stuckTimer.active() && isBlockedByWall)
            {
                shouldJump = true;
            }
        }
        
        // Store jump request for silent jump handling after super.update()
        this.wantsToJump = shouldJump && !this.preventJumpTimer.active();
        if (this.wantsToJump)
            this.holdJumpTimer.set(0.25); // Decent jump height
        
        // ========== PATH CLEARING - SHOOT AT BLOCKING TILES ==========
        // Check if boy is blocked by tiles and needs to clear a path
        this.targetTile = null;
        this.holdingShoot = false;
        
        if (player && distToPlayer > 2.0 && abs(this.moveInput.x) > 0.1)
        {
            // Check if there's a clear path to player
            const rayHit = tileCollisionRaycast(this.pos, player.pos);
            if (rayHit)
            {
                // Path is blocked - find the blocking tile
                // Cast ray in steps to find first blocking tile
                const toPlayerDir = toPlayer.normalize();
                const stepSize = 0.5;
                let checkPos = this.pos.copy();
                let foundBlockingTile = false;
                
                for (let i = 0; i < distToPlayer; i += stepSize)
                {
                    checkPos = this.pos.add(toPlayerDir.scale(i));
                    const tileData = getTileCollisionData(checkPos);
                    if (tileData > 0 && tileData != tileType_ladder && tileData != tileType_solid)
                    {
                        // Found a destructible blocking tile
                        this.targetTile = checkPos.int().add(vec2(0.5)); // Center of tile
                        foundBlockingTile = true;
                        break;
                    }
                }
                
                // If no blocking tile found in raycast, check directly ahead
                if (!foundBlockingTile && isBlockedByWall)
                {
                    const aheadPos = feetPos.add(vec2(lookAhead * 1.0, 0));
                    const tileData = getTileCollisionData(aheadPos);
                    if (tileData > 0 && tileData != tileType_ladder && tileData != tileType_solid)
                    {
                        this.targetTile = aheadPos.int().add(vec2(0.5)); // Center of tile
                    }
                }
            }
        }
        
        // Priority 1: Shoot at blocking tiles to clear path
        if (this.targetTile && this.tileShootTimer.elapsed())
        {
            const toTile = this.targetTile.subtract(this.pos);
            const tileDist = toTile.length();
            
            // Face the tile
            if (!this.dodgeTimer.active())
                this.mirror = toTile.x < 0;
            
            // Aim at tile
            if (this.weapon && tileDist > 0.1)
            {
                const aimAngle = Math.atan2(toTile.y, abs(toTile.x));
                this.weapon.localAngle = -aimAngle * this.getMirrorSign();
            }
            
            // Shoot at tile
            this.holdingShoot = true;
            this.tileShootTimer.set(0.15); // Brief cooldown between shots at tiles
            
            // Alert enemies
            alertEnemies(this.pos, this.pos);
        }
        // Priority 2: Shoot at enemies
        else if (this.targetEnemy && !this.targetEnemy.isDead())
        {
            const enemy = this.targetEnemy;
            const toEnemy = enemy.pos.subtract(this.pos);
            const enemyDist = toEnemy.length();
            
            // Face the enemy
            if (!this.dodgeTimer.active())
                this.mirror = toEnemy.x < 0;
            
            // Aim at enemy with good accuracy
            if (this.weapon)
            {
                const aimAngle = Math.atan2(toEnemy.y, abs(toEnemy.x));
                this.weapon.localAngle = -aimAngle * this.getMirrorSign();
            }
            
            // Wait briefly before attacking, then shoot aggressively
            // Attack delay timer ensures brief pause when enemy is first spotted
            if (this.attackDelayTimer.elapsed() || !this.attackDelayTimer.isSet())
            {
                // Continuous aggressive fire at player's rate (fireRate = 8)
                // The weapon's built-in fireRate will handle the rate limiting
                this.holdingShoot = true;
                
                // Alert player's enemies to boy's position
                alertEnemies(this.pos, this.pos);
            }
        }
        else
        {
            // No enemy - face movement direction or player
            if (this.moveInput.x && !this.dodgeTimer.active())
                this.mirror = this.moveInput.x < 0;
            else if (distToPlayer > 0.5)
                this.mirror = toPlayer.x < 0;
                
            // Reset weapon angle when not fighting
            if (this.weapon)
                this.weapon.localAngle *= 0.9;
        }
        
        // Set weapon trigger
        if (this.weapon)
            this.weapon.triggerIsDown = this.holdingShoot && !this.dodgeTimer.active();

        // ========== PHYSICS UPDATE ==========
        // Store state before update
        const wasOnGround = this.groundObject || this.groundTimer.active();
        this.holdingJump = this.holdJumpTimer.active();
        
        // Call parent update for physics (no jump triggered - we handle it silently)
        this.maxFallVelocity = 0;
        super.update();
        this.maxFallVelocity = 0;

        // ========== SILENT JUMP (after super.update) ==========
        // Handle jump manually to avoid jump sound
        // Boys jump 2x higher than girls
        if (this.wantsToJump && wasOnGround && !this.jumpTimer.active())
        {
            // 2x jump height: 0.15 * 2 = 0.3
            this.velocity.y = 0.3;
            this.jumpTimer.set(0.4); // Longer timer for 2x jump height (2x of 0.2)
            this.preventJumpTimer.set(0.4); // Reasonable cooldown
            this.groundTimer.unset();
        }
        
        // Jump continuation for holding jump - also 2x
        if (this.jumpTimer.active() && this.holdingJump && this.velocity.y > 0)
        {
            // 2x jump continuation: 0.015 * 2 = 0.03
            this.velocity.y += 0.03;
        }
        
        // Ensure weapon protection
        if (this.weapon)
            this.weapon.maxFallVelocity = 0;
    }

    // Override damage to prevent fall damage, bleeding, and death sounds
    damage(damage, damagingObject)
    {
        // Prevent ALL fall damage for boys (damagingObject is null for fall damage)
        if (this.noFallDamage && damagingObject == null)
        {
            // This is fall damage - completely ignore it
            return 0;
        }
        
        // For other damage, call parent but prevent weapon destruction
        const healthBefore = this.health;
        const result = super.damage(damage, damagingObject);
        
        // Ensure weapon is never destroyed
        if (!this.weapon || this.weapon.destroyed)
        {
            // Weapon was destroyed - recreate it immediately
            if (this.weapon)
                this.weapon.destroyed = 0; // Undo destruction
            if (!this.weapon)
                createProtectedWeapon(this);
        }
        
        return result;
    }

    // Override kill to prevent weapon destruction, death sounds, and blood from fall damage
    kill(damagingObject)
    {
        // If already dead, don't process again
        if (this.isDead())
            return 0;
        
        // If this is fall damage (no damaging object), prevent kill entirely
        if (this.noFallDamage && damagingObject == null)
        {
            // Don't kill from fall damage - just return without doing anything
            return 0;
        }
        
        // Remove from surviving boys array before kill
        const index = survivingBoys.indexOf(this);
        if (index >= 0)
            survivingBoys.splice(index, 1);
        
        // Save weapon reference before parent kill
        const weaponRef = this.weapon;
        
        // Call parent kill for real damage (from enemies)
        const result = super.kill(damagingObject);
        
        // ALWAYS restore weapon - never let it be destroyed
        if (weaponRef && !weaponRef.destroyed)
        {
            this.weapon = weaponRef;
        }
        else if (!this.weapon || this.weapon.destroyed)
        {
            // Recreate weapon if it was destroyed
            if (this.weapon)
                this.weapon.destroyed = 0;
            if (!this.weapon)
                createProtectedWeapon(this);
        }
        
        return result;
    }

    // Override destroy to clean up from survivingBoys array
    destroy()
    {
        const index = survivingBoys.indexOf(this);
        if (index >= 0)
            survivingBoys.splice(index, 1);
        super.destroy();
    }

    // Override collision to pass through player
    collideWithObject(o)
    {
        // Pass through player
        if (o.isPlayer)
            return 0; // No collision
        
        // Pass through other boys
        if (o.isBoy)
            return 0;
        
        // Pass through girls too
        if (o.isGirl)
            return 0;
        
        // Normal collision for everything else
        return super.collideWithObject(o);
    }

    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;

        // Always use original sprite for all states (walking, jumping, climbing)
        this.tileIndex = this.bodyTile;

        const sizeScale = this.sizeScale;
        // No color tint - use white/default color
        const color = new Color(1, 1, 1).scale(this.burnColorPercent(), 1);
        const additive = this.additiveColor.add(this.extraAdditiveColor);

        // Draw body using drawTile2 from tiles2.png (no head, no eyes)
        const bodyPos = this.pos.add(vec2(0, -0.1 + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
    }
}

// Mark boys so we can identify them
Boy.prototype.isBoy = 1;

// Function to spawn boys at level start
function spawnBoys(spawnPos)
{
    // Clean up dead boys first to get accurate count
    cleanupSurvivingBoys();
    
    // Check if we're at the maximum limit
    if (survivingBoys.length >= MAX_BOYS)
        return;
    
    // Always spawn 1 new boy at the beginning of every level
    // Spawn beside player (to the right side) to avoid collision
    // Offset boys to spawn after girls to prevent visual overlap
    const spacing = 2.0; // Space between boys (2 units apart)
    const baseOffset = 1.5; // Base offset from checkpoint (to the right)
    // Calculate how many girls exist to offset boys after them
    let girlCount = 0;
    if (typeof survivingGirls !== 'undefined' && typeof cleanupSurvivingGirls === 'function')
    {
        cleanupSurvivingGirls();
        girlCount = survivingGirls.length;
    }
    const offsetX = baseOffset + girlCount * spacing + survivingBoys.length * spacing; // Spawn after all girls
    const offset = vec2(offsetX, 0);
    const boy = new Boy(spawnPos.add(offset));
    survivingBoys.push(boy);
}

// Clean up the survivingBoys array - call this every frame to keep count accurate
function cleanupSurvivingBoys()
{
    // Remove any dead, destroyed, or fallen boys from the array
    for (let i = survivingBoys.length - 1; i >= 0; i--)
    {
        const b = survivingBoys[i];
        if (!b || b.destroyed || b.isDead() || b.health <= 0 || b.pos.y < -5)
        {
            survivingBoys.splice(i, 1);
        }
    }
}

// Function to respawn surviving boys from previous level
function respawnSurvivingBoys(spawnPos)
{
    // Clean up first
    cleanupSurvivingBoys();
    
    // Respawn surviving boys beside checkpoint (to avoid collision with player)
    // Offset boys to spawn after girls to prevent visual overlap
    const spacing = 2.0; // Space between boys (2 units apart)
    const baseOffset = 1.5; // Base offset from checkpoint (to the right)
    // Calculate how many girls exist to offset boys after them
    let girlCount = 0;
    if (typeof survivingGirls !== 'undefined' && typeof cleanupSurvivingGirls === 'function')
    {
        cleanupSurvivingGirls();
        girlCount = survivingGirls.length;
    }
    
    let index = 0;
    for(const boy of survivingBoys)
    {
        if (!boy || boy.destroyed || boy.isDead())
            continue;
            
        // Reset position beside checkpoint, spread out horizontally after girls
        const offsetX = baseOffset + girlCount * spacing + index * spacing;
        boy.pos = spawnPos.add(vec2(offsetX, 0));
        boy.velocity = vec2(0, 0);
        boy.health = boy.healthMax;
        boy.deadTimer.unset();
        
        // Ensure he has a weapon (recreate if missing)
        if (!boy.weapon || boy.weapon.destroyed)
        {
            createProtectedWeapon(boy);
        }
        
        index++;
    }
}


