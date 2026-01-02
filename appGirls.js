/*
    Friendly NPC Girls
    Extends Character to create helpful companions
*/

'use strict';

// Global array to track surviving girls across levels
let survivingGirls = [];

class Girl extends Character
{
    constructor(pos) 
    { 
        super(pos, 0.7); // sizeScale = 0.7

        this.team = team_player;
        this.health = this.healthMax = 1;
        this.persistent = 1; // Survive level transitions
        
        // AI timers
        this.sawEnemyTimer = new Timer;
        this.shootTimer = new Timer;
        this.holdJumpTimer = new Timer;
        this.followDistanceTimer = new Timer;
        
        // Vision and behavior
        this.maxVisionRange = 20; // Much better vision than enemies (12-15)
        this.followDistance = 3.5; // Base follow distance
        this.targetEnemy = null;
        
        // Appearance - using tiles2.png, no head/eyes
        // Use a full character sprite from tiles2.png (full tile, not small item)
        // Using tile 23 as a full character sprite (spiders use 20-22, so 23+ should be available)
        this.bodyTile = 23; // Full character sprite from tiles2.png
        this.tileSize = vec2(8); // Full character tile size (8x8 pixels, same as other characters)
        this.color = new Color(1, 0.6, 0.8); // Pinkish color
        this.sizeScale = 0.7;
        
        // Weapon
        new Weapon(this.pos, this);
        
        // Random offset for follow behavior variation
        this.followOffset = rand(2*PI);
        this.sightCheckFrame = rand(9)|0;
    }
    
    update()
    {
        if (this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            return;
        }

        if (this.weapon)
            this.weapon.localPos = this.weapon.localOffset.scale(this.sizeScale);

        // Find player to follow
        const player = players[0];
        if (!player || player.isDead())
        {
            // No player, idle behavior
            this.moveInput.x = 0;
            this.moveInput.y = 0;
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            return;
        }

        // Check for enemies in vision range (every 9 frames like enemies do)
        const sightCheckFrames = 9;
        if (frame % sightCheckFrames == this.sightCheckFrame)
        {
            this.targetEnemy = null;
            let closestEnemyDistSquared = this.maxVisionRange * this.maxVisionRange;
            
            // Find closest enemy
            forEachObject(this.pos, this.maxVisionRange, (o) =>
            {
                if (o.isCharacter && o.team == team_enemy && !o.isDead() && o.health > 0)
                {
                    const distSquared = this.pos.distanceSquared(o.pos);
                    if (distSquared < closestEnemyDistSquared)
                    {
                        // Check if we can see the enemy (raycast)
                        const raycastHit = tileCollisionRaycast(this.pos, o.pos);
                        if (!raycastHit)
                        {
                            this.targetEnemy = o;
                            closestEnemyDistSquared = distSquared;
                            this.sawEnemyTimer.set();
                        }
                    }
                }
            });
        }

        // Update follow distance based on enemy proximity
        if (this.targetEnemy)
        {
            // Enemy nearby - stay closer to player for support
            this.followDistance = 2.5;
        }
        else
        {
            // No enemy - maintain comfortable distance
            this.followDistance = 3.5 + 0.5 * Math.sin(time * 0.5 + this.followOffset);
        }

        // Follow player with smart distance
        const playerDist = this.pos.distance(player.pos);
        const playerDir = player.pos.subtract(this.pos);
        
        // Calculate desired position (maintain follow distance)
        let desiredPos = player.pos.copy();
        if (playerDist > 0.1)
        {
            const offsetDir = playerDir.normalize();
            desiredPos = player.pos.subtract(offsetDir.scale(this.followDistance));
        }

        // Movement toward desired position
        const moveDir = desiredPos.subtract(this.pos);
        const moveDist = moveDir.length();
        
        if (moveDist > 0.5)
        {
            // Move toward desired position
            this.moveInput.x = clamp(moveDir.x / moveDist, 1, -1) * 0.6;
            this.moveInput.y = clamp(moveDir.y / moveDist, 0.7, -0.7);
            
            // Face movement direction
            this.mirror = moveDir.x < 0;
        }
        else
        {
            // Close enough, minimal movement
            this.moveInput.x = 0;
            this.moveInput.y = 0;
        }

        // Jump to follow player vertically
        if (player.pos.y < this.pos.y - 1.5 && this.groundObject)
        {
            // Player is above, jump up
            this.pressedJumpTimer.set(0.1);
            this.holdJumpTimer.set(0.2);
        }
        else if (player.pos.y > this.pos.y + 1.5 && this.groundObject && !this.climbingLadder)
        {
            // Player is below, can drop down or climb down ladder
            this.moveInput.y = 0.5;
        }

        // Wall climbing (like enemies)
        if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
        {
            this.velocity.y *= 0.8;
            this.climbingWall = 1;
            if (this.groundObject)
            {
                this.pressedJumpTimer.set(0.1);
                this.holdJumpTimer.set(rand(0.2));
            }
        }

        // Shooting logic - shoot at target enemy with 3 second cooldown
        if (this.targetEnemy && this.weapon)
        {
            // Aim weapon at enemy
            const enemyDir = this.targetEnemy.pos.subtract(this.pos);
            const aimAngle = Math.atan2(enemyDir.y, enemyDir.x * this.getMirrorSign());
            this.weapon.localAngle = aimAngle;
            
            // Face enemy
            this.mirror = this.targetEnemy.pos.x < this.pos.x;
            
            // Shoot with 3 second cooldown
            if (!this.shootTimer.isSet() || this.shootTimer.get() >= 3.0)
            {
                // Check if enemy is still in range and visible
                const distSquared = this.pos.distanceSquared(this.targetEnemy.pos);
                if (distSquared < this.maxVisionRange * this.maxVisionRange)
                {
                    const raycastHit = tileCollisionRaycast(this.pos, this.targetEnemy.pos);
                    if (!raycastHit)
                    {
                        this.weapon.triggerIsDown = 1;
                        this.shootTimer.set(0);
                        // Alert enemies when shooting (like player does)
                        alertEnemies(this.pos, this.targetEnemy.pos);
                    }
                    else
                    {
                        this.weapon.triggerIsDown = 0;
                    }
                }
                else
                {
                    this.weapon.triggerIsDown = 0;
                }
            }
            else
            {
                this.weapon.triggerIsDown = 0;
            }
        }
        else
        {
            // No target, lower weapon
            if (this.weapon)
            {
                this.weapon.localAngle = lerp(0.1, 0.7, this.weapon.localAngle);
                this.weapon.triggerIsDown = 0;
            }
        }

        this.holdingShoot = this.weapon && this.weapon.triggerIsDown;
        this.holdingJump = this.holdJumpTimer.active();

        // Store state before parent update for jump override
        const wasOnGround = this.groundObject || this.climbingWall || this.climbingLadder;
        const wasPressingJump = this.pressedJumpTimer.active();
        const wasPreventJump = this.preventJumpTimer.active();

        // Call parent update
        super.update();

        // Override jump velocity for higher jumps (after parent sets it)
        if (wasPressingJump && wasOnGround && !wasPreventJump && this.jumpTimer.active())
        {
            if (this.climbingWall)
            {
                this.velocity.y = 0.6; // Higher wall jump (player is 0.25)
            }
            else
            {
                this.velocity.y = 0.45; // Much higher jump (player is 0.15)
            }
            this.jumpTimer.set(0.4); // Longer jump timer
        }
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

    kill(damagingObject)
    {
        if (this.isDead())
            return 0;

        // Remove from surviving girls array
        const index = survivingGirls.indexOf(this);
        if (index >= 0)
            survivingGirls.splice(index, 1);

        super.kill(damagingObject);
    }
}

// Mark girls so we can identify them
Girl.prototype.isGirl = 1;

// Function to spawn girls at level start
function spawnGirls(spawnPos)
{
    // Always spawn 2 new girls at the beginning of every level
    for(let i = 0; i < 2; i++)
    {
        const offset = vec2(rand(-1, 1), rand(-0.5, 0.5));
        const girl = new Girl(spawnPos.add(offset));
        survivingGirls.push(girl);
    }
}

// Function to respawn surviving girls from previous level
function respawnSurvivingGirls(spawnPos)
{
    // Filter out dead/destroyed girls
    survivingGirls = survivingGirls.filter(g => g && !g.destroyed && !g.isDead());
    
    // Respawn surviving girls at checkpoint
    for(const girl of survivingGirls)
    {
        if (!girl || girl.destroyed || girl.isDead())
            continue;
            
        // Reset position to checkpoint
        girl.pos = spawnPos.add(vec2(rand(-1, 1), rand(-0.5, 0.5)));
        girl.velocity = vec2(0, 0);
        girl.health = girl.healthMax;
        girl.deadTimer.unset();
    }
}

