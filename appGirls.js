/*
    Girls - Friendly NPCs that help the player
    They follow the player, shoot enemies, and take cover
*/

'use strict';

// Global array to track all girls
let girls = [];

///////////////////////////////////////////////////////////////////////////////

class GirlWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.shootCooldownTimer = new Timer;
        this.shootCooldownTimer.set(3); // 3 second cooldown before first shot
        this.lastShotTime = 0;
    }

    update()
    {
        // Override fire rate to enforce 3 second cooldown
        const fireRate = 8;
        const bulletSpeed = .5;
        const spread = .1;

        this.mirror = this.parent.mirror;
        
        // Check cooldown
        if (this.shootCooldownTimer.active())
        {
            this.triggerIsDown = 0;
            this.fireTimeBuffer = 0;
        }
        else if (this.parent.holdingShoot)
        {
            // Can shoot - single bullet with 3 second cooldown
            this.fireTimeBuffer += timeDelta;
            const rate = 1/fireRate;
            
            if (this.fireTimeBuffer >= rate)
            {
                // Fire single bullet
                this.fireTimeBuffer = 0;
                this.shootCooldownTimer.set(3); // Set 3 second cooldown
                
                // Get aim angle from parent
                const baseAimAngle = this.parent.aimAngle || 0;
                
                // Apply recoil
                const recoilAngle = -(baseAimAngle - rand(.2,.15)) * this.getMirrorSign();
                this.localAngle = recoilAngle;
                this.recoilTimer.set(rand(.4,.3));
                
                // Create bullet
                const bullet = new Bullet(this.pos, this.parent);
                const direction = vec2(this.getMirrorSign(bulletSpeed), 0).rotate(baseAimAngle);
                bullet.velocity = direction.rotate(rand(spread,-spread));

                // Shell effect
                this.shellEmitter.localAngle = -.8*this.getMirrorSign();
                this.shellEmitter.emitParticle();
                playSound(sound_shoot, this.pos);
            }
            
            this.triggerIsDown = 1;
        }
        else
        {
            this.triggerIsDown = 0;
            this.fireTimeBuffer = 0;
        }
        
        // Update weapon angle and position (from parent Weapon class)
        const baseAimAngle = this.parent.aimAngle || 0;
        const spriteAngle = -baseAimAngle * this.getMirrorSign();
        
        const meleeAngleOffset = this.parent.meleeTimer && this.parent.meleeTimer.active() ? 1.2 * Math.sin(this.parent.meleeTimer.getPercent() * PI) * this.getMirrorSign() : 0;
        const meleeExtendOffset = this.parent.meleeTimer && this.parent.meleeTimer.active() ? .3 * Math.sin(this.parent.meleeTimer.getPercent() * PI) : 0;

        if (meleeExtendOffset)
        {
            const sizeScale = this.parent.sizeScale || 1;
            const baseOffset = this.localOffset ? this.localOffset.scale(sizeScale) : vec2(.55, 0);
            this.localPos = baseOffset.add(vec2(meleeExtendOffset * this.getMirrorSign(), 0));
        }

        if (this.recoilTimer.active())
            this.localAngle = lerp(this.recoilTimer.getPercent(), spriteAngle, this.localAngle);
        else
            this.localAngle = spriteAngle + meleeAngleOffset;
        
        // Call parent update for shell emitter and other base functionality
        // But we've already handled firing, so prevent parent from firing again
        const savedTrigger = this.triggerIsDown;
        const savedFireBuffer = this.fireTimeBuffer;
        this.triggerIsDown = 0; // Prevent parent from firing
        this.fireTimeBuffer = 0; // Clear fire buffer
        super.update();
        // Restore our state
        this.triggerIsDown = savedTrigger;
        this.fireTimeBuffer = savedFireBuffer;
    }
}

///////////////////////////////////////////////////////////////////////////////

class Girl extends Character
{
    constructor(pos)
    {
        super(pos, 0.7); // Size scale 0.7

        this.team = team_player;
        this.persistent = 1; // Survive level transitions
        this.health = this.healthMax = 1;
        this.noFallDamage = 1; // No fall damage
        this.jumpPower = 0.3; // High jump power
        
        // Girl sprite - use tile 22 from tiles2.png (same as Spider, for testing - change to 30 later)
        // TODO: Change to tile 30 once confirmed it exists in tiles2.png
        this.bodyTile = 22; // Temporarily using tile 22 (Spider tile) to test rendering
        this.tileSize = vec2(8); // tiles2.png tile size
        this.bodyHeight = 0.1 * this.sizeScale; // Body offset from ground (required for rendering)
        
        // Girl color - pink/purple theme
        this.color = new Color(1, 0.5, 0.8); // Pink
        this.eyeColor = new Color(1, 0.2, 0.9); // Pink eyes
        this.color = this.color.mutate(0.1); // Slight variation
        
        this.renderOrder = 15; // Render between enemies and players
        
        // AI state
        this.sawEnemyTimer = new Timer;
        this.sawEnemyPos = null;
        this.followDistance = 2 + rand() * 2; // Varying follow distance (2-4 units)
        this.coverTimer = new Timer;
        this.dodgeCooldownTimer = new Timer;
        this.holdJumpTimer = new Timer; // Initialize holdJumpTimer for holding jump
        this.sightCheckFrame = rand(9)|0;
        this.maxVisionRange = 10;
        
        // Create weapon with 3 second cooldown
        new GirlWeapon(this.pos, this);
        
        // Add to girls array
        girls.push(this);
    }
    
    update()
    {
        if (!aiEnable || levelWarmup || this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            return;
        }

        if (this.weapon)
            this.weapon.localPos = this.weapon.localOffset.scale(this.sizeScale);

        // Find nearest living player to follow
        let nearestPlayer = null;
        let nearestPlayerDist = 1e9;
        for(const player of players)
        {
            if (player && !player.isDead())
            {
                const dist = this.pos.distanceSquared(player.pos);
                if (dist < nearestPlayerDist)
                {
                    nearestPlayerDist = dist;
                    nearestPlayer = player;
                }
            }
        }

        // Check for enemies (similar to enemy vision checks)
        const sightCheckFrames = 9;
        if (frame % sightCheckFrames == this.sightCheckFrame)
        {
            const sawRecently = this.sawEnemyTimer.isSet() && this.sawEnemyTimer.get() < 5;
            const visionRangeSquared = (sawRecently ? this.maxVisionRange * 1.2 : this.maxVisionRange)**2;
            
            let nearestEnemy = null;
            let nearestEnemyDist = visionRangeSquared;
            
            // Check all enemies
            for(const o of engineCollideObjects)
            {
                if (o.isCharacter && o.team == team_enemy && !o.destroyed && !o.isDead())
                {
                    const distSq = this.pos.distanceSquared(o.pos);
                    if (distSq < nearestEnemyDist)
                    {
                        // Check line of sight
                        const raycastHit = tileCollisionRaycast(this.pos, o.pos);
                        if (!raycastHit)
                        {
                            nearestEnemyDist = distSq;
                            nearestEnemy = o;
                        }
                    }
                }
            }
            
            if (nearestEnemy)
            {
                this.sawEnemyTimer.set();
                this.sawEnemyPos = nearestEnemy.pos;
            }
        }

        this.pressedDodge = this.climbingWall = 0;
        this.holdingShoot = 0;
        this.moveInput = vec2();
        
        // Survival behavior - similar to enemies
        if (this.burnTimer.isSet())
        {
            // Burning, run around
            this.sawEnemyTimer.unset();
            
            // Random jump
            if (rand() < .01)
            {
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            // Random movement
            if (rand() < .1)
                this.moveInput.x = randSign() * rand(.6, .3);
            this.moveInput.y = 0;
            
            // Random dodge
            if (this.groundObject && rand() < .01)
                this.pressedDodge = 1;
        }
        else if (this.sawEnemyTimer.isSet() && this.sawEnemyTimer.get() < 10)
        {
            // Enemy detected - combat behavior
            const timeSinceSawEnemy = this.sawEnemyTimer.get();
            const enemyDirection = sign(this.sawEnemyPos.x - this.pos.x);
            
            // Face enemy
            this.mirror = this.sawEnemyPos.x < this.pos.x;
            
            // Aim weapon at enemy
            const toEnemy = this.sawEnemyPos.subtract(this.pos);
            this.aimAngle = toEnemy.angle();
            
            // Take cover behavior - move away from enemy if too close
            const enemyDist = this.pos.distance(this.sawEnemyPos);
            if (enemyDist < 3 && rand() < .1)
            {
                // Move away from enemy
                this.moveInput.x = -enemyDirection * rand(.5, .3);
                
                // Try to dodge
                if (this.groundObject && !this.dodgeCooldownTimer.isSet() && rand() < .3)
                {
                    this.pressedDodge = 1;
                    this.dodgeCooldownTimer.set(2);
                }
            }
            else if (enemyDist > 8)
            {
                // Move closer to enemy (but not too close)
                this.moveInput.x = enemyDirection * rand(.4, .2);
            }
            
            // Vertical movement to match enemy height
            if (abs(this.sawEnemyPos.y - this.pos.y) > 1)
            {
                this.moveInput.y = clamp(this.sawEnemyPos.y - this.pos.y, .5, -.5);
            }
            
            // Shoot at enemy if in range and cooldown is ready
            if (enemyDist < 12 && abs(this.sawEnemyPos.y - this.pos.y) < 4)
            {
                if (this.weapon && this.weapon.shootCooldownTimer && 
                    (!this.weapon.shootCooldownTimer.isSet() || this.weapon.shootCooldownTimer.elapsed()))
                {
                    this.holdingShoot = 1;
                }
            }
            
            // Random jump for mobility
            if (rand() < .005)
            {
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
        }
        else if (nearestPlayer)
        {
            // Follow player behavior
            const playerDist = this.pos.distance(nearestPlayer.pos);
            const playerDirection = sign(nearestPlayer.pos.x - this.pos.x);
            
            // Face player direction
            this.mirror = nearestPlayer.pos.x < this.pos.x;
            
            // Follow player - maintain follow distance
            if (playerDist > this.followDistance + 1)
            {
                // Too far, move closer
                this.moveInput.x = playerDirection * rand(.6, .4);
            }
            else if (playerDist < this.followDistance - 0.5)
            {
                // Too close, back off slightly
                this.moveInput.x = -playerDirection * rand(.3, .1);
            }
            else
            {
                // Good distance, minimal movement
                if (rand() < .05)
                    this.moveInput.x = randSign() * rand(.2, .1);
            }
            
            // Match player height
            if (abs(nearestPlayer.pos.y - this.pos.y) > 1)
            {
                this.moveInput.y = clamp(nearestPlayer.pos.y - this.pos.y, .5, -.5);
            }
            
            // Avoid clustering with other girls
            for(const girl of girls)
            {
                if (girl != this && !girl.isDead())
                {
                    const dist = this.pos.distance(girl.pos);
                    if (dist < 1.5)
                    {
                        // Too close to another girl, move away
                        const awayDir = sign(this.pos.x - girl.pos.x);
                        this.moveInput.x = awayDir * rand(.4, .2);
                    }
                }
            }
            
            // Random jump for mobility
            if (rand() < .003)
            {
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
        }

        this.holdingJump = (this.holdJumpTimer && this.holdJumpTimer.active()) || 0;
        super.update();
    }
    
    render()
    {
        // Always render if persistent (like players)
        if (!this.persistent && !isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;

        // Set tile to use - use bodyTile directly
        this.tileIndex = this.isDead() ? this.bodyTile : this.bodyTile;

        let additive = this.additiveColor.add(this.extraAdditiveColor);
        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(), 1);

        const bodyPos = this.pos.add(vec2(0, -this.bodyHeight + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        // Draw body using drawTile2 for tiles2.png (complete sprite, no separate head/eyes)
        // Make sure color is visible (full opacity) - use bright pink so it's obvious
        const visibleColor = new Color(1.0, 0.5, 0.8, 1.0); // Bright pink, full opacity
        
        if (typeof drawTile2 === 'function')
        {
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, visibleColor, this.angle, this.mirror, additive);
        }
        else
        {
            // Fallback to regular drawTile with a visible tile from tiles.png if drawTile2 doesn't work
            drawTile(bodyPos, vec2(sizeScale), 3, vec2(8), visibleColor, this.angle, this.mirror, additive);
        }
    }
    
    kill(damagingObject)
    {
        if (this.isDead())
            return 0;

        super.kill(damagingObject);
        
        // Remove from girls array
        const index = girls.indexOf(this);
        if (index >= 0)
            girls.splice(index, 1);
        
        return 1;
    }
}

