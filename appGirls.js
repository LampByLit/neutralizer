/*
    Friendly NPC Girls
    Extends Character to create helpful companions
*/

'use strict';

// Global array to track surviving girls across levels
let survivingGirls = [];

// Helper function to create and protect a weapon for a girl
function createProtectedWeapon(girl)
{
    const weapon = new Weapon(girl.pos, girl);
    // Make sure weapon doesn't take damage or have health
    weapon.health = weapon.healthMax = 0; // No health
    weapon.noFallDamage = 1; // Prevent fall damage on weapon
    // Override damage to completely prevent any damage
    weapon.damage = function() { return 0; };
    // Prevent any fall velocity tracking (in case weapon somehow gets this property)
    weapon.maxFallVelocity = 0;
    return weapon;
}

class Girl extends Character
{
    constructor(pos) 
    { 
        super(pos, 0.7); // sizeScale = 0.7

        this.team = team_player;
        this.health = this.healthMax = 10;
        this.persistent = 1; // Survive level transitions
        this.noFallDamage = 1; // Girls don't take fall damage
        
        // AI timers
        this.sawEnemyTimer = new Timer;
        this.shootTimer = new Timer;
        this.burstShootTimer = new Timer; // For burst fire mode
        this.randomShootTimer = new Timer; // For random shooting
        this.holdJumpTimer = new Timer;
        this.followDistanceTimer = new Timer;
        this.spawnSafetyTimer = new Timer;
        this.spawnSafetyTimer.set(0.5); // Wait 0.5 seconds after spawn before aggressive movement
        this.stuckTimer = new Timer; // Track if stuck on obstacle
        this.wallJumpTimer = new Timer; // Cooldown for wall jumps
        this.pathfindTimer = new Timer; // For pathfinding checks
        
        // Vision and behavior
        this.maxVisionRange = 20; // Much better vision than enemies (12-15)
        this.followDistance = 1.0; // Stay very close to player
        this.targetEnemy = null;
        this.lastStuckPos = null; // Track last stuck position for pathfinding
        this.burstShotsRemaining = 0; // Burst fire counter
        this.girlIndex = survivingGirls.length; // For staggering positions
        
        // Appearance - using tiles2.png, no head/eyes
        // Use a full character sprite from tiles2.png (full tile, not small item)
        // Using tile 23 as a full character sprite (spiders use 20-22, so 23+ should be available)
        this.bodyTile = 23; // Full character sprite from tiles2.png
        this.tileSize = vec2(8); // Full character tile size (8x8 pixels, same as other characters)
        this.color = new Color(1, 0.6, 0.8); // Pinkish color
        this.sizeScale = 0.7;
        
        // Weapon - ensure it never takes damage or fall damage
        createProtectedWeapon(this);
        
        // Random offset for follow behavior variation
        this.followOffset = rand(2*PI);
        this.sightCheckFrame = rand(9)|0;
        
        // Initialize timers that need starting values
        this.randomShootTimer.set(rand(2, 1)); // Random initial delay
        this.pathfindTimer.set(0); // Start immediately
        this.burstShootTimer.set(0); // Ready for burst fire
        this.randomNoiseTimer = new Timer; // For occasional cute noises
        this.randomNoiseTimer.set(rand(20, 10)); // First noise in 10-20 seconds
    }
    
    update()
    {
        // ALWAYS prevent fall damage tracking
        this.maxFallVelocity = 0;
            
        if (this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            this.maxFallVelocity = 0;
            return;
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

        // ========== SAFETY TELEPORT ==========
        // If fallen below level, too far from player, or stuck in geometry, teleport back
        const tooFarFromPlayer = this.pos.distance(player.pos) > 25;
        const fellBelowLevel = this.pos.y < 0;
        const stuckInWall = getTileCollisionData(this.pos) > 0 && getTileCollisionData(this.pos) != tileType_ladder;
        if (tooFarFromPlayer || fellBelowLevel || stuckInWall)
        {
            // Teleport to player's position (slightly offset)
            this.pos = player.pos.add(vec2(this.girlIndex + 1, 0));
            this.velocity = vec2(0, 0);
            this.groundObject = 0; // Reset ground state
        }

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
                    }
                }
            }
        }

        // ========== MOVEMENT & FOLLOWING ==========
        const toPlayer = player.pos.subtract(this.pos);
        const distToPlayer = toPlayer.length();
        const playerDirection = sign(toPlayer.x) || 1;
        
        // Adjust follow distance based on combat (closer when fighting)
        const inCombat = this.targetEnemy && this.sawEnemyTimer.get() < 3;
        const desiredDist = inCombat ? 1.0 : this.followDistance;
        
        // Stagger position slightly for multiple girls (minimal offset)
        const staggerOffset = Math.sin(this.followOffset) * 0.2 * this.girlIndex;
        
        // Movement towards player - stay close!
        this.moveInput = vec2(0, 0);
        
        if (distToPlayer > desiredDist + staggerOffset + 0.5)
        {
            // Need to catch up - move towards player (cap speed to stay grounded)
            const urgency = clamp((distToPlayer - desiredDist) / 3, 0.8, 0.4);
            this.moveInput.x = playerDirection * urgency;
        }
        else if (distToPlayer < desiredDist * 0.4)
        {
            // Too close - back off slightly
            this.moveInput.x = -playerDirection * 0.2;
        }
        
        // Vertical movement for ladders - only when player is on ladder or far above/below
        if (abs(toPlayer.y) > 2.5)
            this.moveInput.y = sign(toPlayer.y) * 0.4;

        // ========== OBSTACLE DETECTION & JUMPING ==========
        const onGround = this.groundObject || this.groundTimer.active();
        const lookAhead = this.getMirrorSign(1.0);
        const feetPos = this.pos.subtract(vec2(0, this.size.y * 0.4));
        
        // Check for wall/obstacle ahead
        const wallCheckPos = feetPos.add(vec2(lookAhead * 0.8, 0));
        const wallTile = getTileCollisionData(wallCheckPos);
        const isBlockedByWall = wallTile > 0 && wallTile != tileType_ladder;
        
        // Check for step/stair ahead (1 tile high obstacle)
        const stepCheckLow = feetPos.add(vec2(lookAhead * 0.8, 0));
        const stepCheckHigh = feetPos.add(vec2(lookAhead * 0.8, 1.2));
        const hasStepAhead = getTileCollisionData(stepCheckLow) > 0 && 
                             getTileCollisionData(stepCheckHigh) <= 0;
        
        // Check for gap ahead
        const gapCheckPos = feetPos.add(vec2(lookAhead * 1.5, -1));
        const hasGapAhead = getTileCollisionData(gapCheckPos) <= 0 && 
                            this.moveInput.x != 0 && onGround;
        
        // Check if player is significantly above us
        const playerAbove = toPlayer.y > 2;
        
        // Stuck detection
        if (this.pathfindTimer.elapsed())
        {
            this.pathfindTimer.set(0.5);
            if (this.lastStuckPos && this.pos.distance(this.lastStuckPos) < 0.3 && 
                abs(this.moveInput.x) > 0.1)
            {
                // We're stuck! Try jumping or wall climbing
                this.stuckTimer.set(0.5);
            }
            this.lastStuckPos = this.pos.copy();
        }
        
        // Determine if we should jump - be conservative to stay close
        let shouldJump = false;
        let highJump = false;
        
        if (onGround || this.climbingWall || this.climbingLadder)
        {
            // Small hop for steps
            if (hasStepAhead)
            {
                shouldJump = true;
            }
            // Jump over gaps only if moving
            else if (hasGapAhead && abs(this.velocity.x) > 0.05)
            {
                shouldJump = true;
            }
            // Only high jump if player is far above AND we're stuck
            else if (playerAbove && distToPlayer > 3 && this.stuckTimer.active())
            {
                shouldJump = true;
                highJump = true;
            }
            // Stuck recovery - just a normal jump first
            else if (this.stuckTimer.active() && isBlockedByWall)
            {
                shouldJump = true;
            }
        }
        
        // Wall climbing when blocked - less aggressive
        if (isBlockedByWall && !onGround && this.velocity.y < 0 && 
            this.moveInput.x != 0 && !this.wallJumpTimer.active() && distToPlayer > 2)
        {
            this.climbingWall = 1;
            this.velocity.y *= 0.8;
            shouldJump = true;
            this.wallJumpTimer.set(0.4);
        }
        
        // Store jump request for silent jump handling after super.update()
        this.wantsToJump = shouldJump && !this.preventJumpTimer.active();
        this.wantsHighJump = highJump;
        if (this.wantsToJump)
            this.holdJumpTimer.set(highJump ? 0.4 : 0.15);
        
        // ========== COMBAT - SHOOTING ==========
        this.holdingShoot = false;
        
        if (this.targetEnemy && !this.targetEnemy.isDead())
        {
            const enemy = this.targetEnemy;
            const toEnemy = enemy.pos.subtract(this.pos);
            const enemyDist = toEnemy.length();
            
            // Face the enemy
            if (!this.dodgeTimer.active())
                this.mirror = toEnemy.x < 0;
            
            // Aim at enemy
            if (this.weapon)
            {
                const aimAngle = Math.atan2(toEnemy.y, abs(toEnemy.x));
                this.weapon.localAngle = -aimAngle * this.getMirrorSign();
            }
            
            // Burst fire at enemies
            if (this.shootTimer.elapsed() || !this.shootTimer.isSet())
            {
                // Start new burst
                this.burstShotsRemaining = 3 + (rand() * 3 | 0); // 3-5 shot bursts
                this.shootTimer.set(1.5 + rand()); // Pause between bursts
            }
            
            if (this.burstShotsRemaining > 0)
            {
                if (this.burstShootTimer.elapsed() || !this.burstShootTimer.isSet())
                {
                    this.holdingShoot = true;
                    this.burstShotsRemaining--;
                    this.burstShootTimer.set(0.08); // Fast burst fire
                    
                    // Alert player's enemies to girl's position
                    alertEnemies(this.pos, this.pos);
                }
            }
        }
        else
        {
            // No enemy - random shooting for personality (she likes her gun!)
            if (this.randomShootTimer.elapsed())
            {
                // Random chance to fire a shot into the air/ahead
                if (rand() < 0.03) // 3% chance when timer elapses
                {
                    this.holdingShoot = true;
                    this.randomShootTimer.set(0.1);
                }
                else
                {
                    this.randomShootTimer.set(rand(3, 1)); // Wait 1-3 seconds
                }
            }
            
            // Face movement direction or player
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

        // ========== RANDOM NOISES ==========
        if (this.randomNoiseTimer.elapsed())
        {
            // Pick a random noise and play it very quietly
            const noiseType = rand(3) | 0;
            const vol = 0.08; // Very quiet
            if (noiseType == 0)
                zzfx(...[vol,0,130.8128,.11,.19,.3,5,.4245983405873669,,,,,,.3,,,,.83,.03,,-854]);
            else if (noiseType == 1)
                zzfx(...[vol,,172,.37,,.21,5,.8,,11,39,.05,.03,.6,,,.08,.97,,,-851]);
            else
                zzfx(...[vol,,770,.12,.01,.11,1,.7,-9,79,,,.07,.3,,.1,,.95,.33,,-1444]);
            
            this.randomNoiseTimer.set(rand(45, 20)); // Next noise in 20-45 seconds
        }

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
        if (this.wantsToJump && wasOnGround && !this.jumpTimer.active())
        {
            // Apply jump velocity silently
            if (this.climbingWall)
            {
                this.velocity.y = 0.28;
            }
            else if (this.wantsHighJump)
            {
                this.velocity.y = 0.22;
            }
            else
            {
                this.velocity.y = 0.15; // Normal small hop
            }
            this.jumpTimer.set(0.2);
            this.preventJumpTimer.set(0.4);
            this.groundTimer.unset();
        }
        
        // Jump continuation while holding
        if (this.jumpTimer.active() && this.holdingJump && this.velocity.y > 0)
        {
            this.velocity.y += 0.012;
        }
        
        // Ensure weapon protection
        if (this.weapon)
            this.weapon.maxFallVelocity = 0;
    }

    // Override damage to prevent fall damage, bleeding, and death sounds
    damage(damage, damagingObject)
    {
        // Prevent ALL fall damage for girls (damagingObject is null for fall damage)
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
        
        // Remove from surviving girls array before kill
        const index = survivingGirls.indexOf(this);
        if (index >= 0)
            survivingGirls.splice(index, 1);
        
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

    // Override destroy to clean up from survivingGirls array
    destroy()
    {
        const index = survivingGirls.indexOf(this);
        if (index >= 0)
            survivingGirls.splice(index, 1);
        super.destroy();
    }

    // Override collision to pass through player
    collideWithObject(o)
    {
        // Pass through player
        if (o.isPlayer)
            return 0; // No collision
        
        // Pass through other girls
        if (o.isGirl)
            return 0;
        
        // Normal collision for everything else
        return super.collideWithObject(o);
    }

    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;

        // Set tile to use (walking animation)
        this.tileIndex = this.isDead() ? this.bodyTile : 
                        (this.climbingLadder || this.groundTimer.active() ? 
                         this.bodyTile + 2*(this.walkCyclePercent|0) : 
                         this.bodyTile + 1);

        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(), 1);
        const additive = this.additiveColor.add(this.extraAdditiveColor);

        // Draw body using drawTile2 from tiles2.png (no head, no eyes)
        const bodyPos = this.pos.add(vec2(0, -0.1 + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
    }
}

// Mark girls so we can identify them
Girl.prototype.isGirl = 1;

// Function to spawn girls at level start
function spawnGirls(spawnPos)
{
    // Always spawn 1 new girl at the beginning of every level
    // Spawn beside player (to the right side) to avoid collision
    // Use a spacing that accounts for existing girls to prevent overlap
    const spacing = 2.0; // Space between girls (2 units apart)
    const baseOffset = 1.5; // Base offset from checkpoint (to the right)
    const offsetX = baseOffset + survivingGirls.length * spacing; // Spread out based on existing girls
    const offset = vec2(offsetX, 0);
    const girl = new Girl(spawnPos.add(offset));
    survivingGirls.push(girl);
}

// Function to respawn surviving girls from previous level
function respawnSurvivingGirls(spawnPos)
{
    // Filter out dead/destroyed girls
    survivingGirls = survivingGirls.filter(g => g && !g.destroyed && !g.isDead());
    
    // Respawn surviving girls beside checkpoint (to avoid collision with player)
    // Spread them out horizontally so they don't overlap
    const spacing = 2.0; // Space between girls (2 units apart)
    const baseOffset = 1.5; // Base offset from checkpoint (to the right)
    
    let index = 0;
    for(const girl of survivingGirls)
    {
        if (!girl || girl.destroyed || girl.isDead())
            continue;
            
        // Reset position beside checkpoint, spread out horizontally
        const offsetX = baseOffset + index * spacing;
        girl.pos = spawnPos.add(vec2(offsetX, 0));
        girl.velocity = vec2(0, 0);
        girl.health = girl.healthMax;
        girl.deadTimer.unset();
        index++;
    }
}

