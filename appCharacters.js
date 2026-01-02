/*
    Javascript Space Game
    By Frank Force 2021

*/

'use strict';

const aiEnable = 1;
const debugAI = 0;
const maxCharacterSpeed = .2;

class Character extends GameObject 
{
    constructor(pos, sizeScale = 1) 
    { 
        super(pos, vec2(.6,.95).scale(sizeScale), 32);

        this.health = this.healthMax = this.canBurn = this.isCharacter = 1;
        this.sizeScale = sizeScale;
        this.groundTimer = new Timer;
        this.jumpTimer = new Timer;
        this.pressedJumpTimer = new Timer;
        this.preventJumpTimer = new Timer;
        this.dodgeTimer = new Timer;
        this.dodgeRechargeTimer = new Timer;
        this.meleeTimer = new Timer;
        this.meleeRechargeTimer = new Timer;
        this.deadTimer = new Timer;
        this.blinkTimer = new Timer;
        this.moveInput = vec2();
        this.extraAdditiveColor = new Color(0,0,0,0);
        this.color = new Color;
        this.eyeColor = new Color;
        this.bodyTile = 3;
        this.headTile = 2;
        this.renderOrder = 10;
        this.overkill = this.grenadeCount = this.walkCyclePercent = 0;
        this.grendeThrowTimer = new Timer;
        this.maxFallVelocity = 0; // track maximum fall velocity for fall damage
        this.setCollision();
    }
    
    update() 
    {
        this.lastPos = this.pos.copy();
        this.gravityScale = 1; // reset default gravity (incase climbing ladder)

        if (this.isDead() || !this.inUpdateWindow() && !this.persistent)
        {
            super.update();
            return; // ignore offscreen objects
        }
            
        let moveInput = this.moveInput.copy();

        // allow grabbing ladder at head or feet
        let touchingLadder = 0;
        for(let y=2;y--;)
        {
            const testPos = this.pos.add(vec2(0, y + .1*this.moveInput.y - this.size.y*.5));
            const collisionData = getTileCollisionData(testPos);
            touchingLadder |= collisionData == tileType_ladder;
        }
        if (!touchingLadder)
            this.climbingLadder = 0;
        else if (this.moveInput.y)
            this.climbingLadder = 1;

        if (this.dodgeTimer.active())
        {
            // update roll
            this.angle = this.getMirrorSign(2*PI*this.dodgeTimer.getPercent());

            if (this.groundObject)
                this.velocity.x += this.getMirrorSign(.1);

            // apply damage to enemies when rolling
            forEachObject(this.pos, this.size, (o)=>
            {
                if (o.isCharacter && o.team != this.team && !o.isDead())
                    o.damage(1, this);
            });
        }
        else
            this.angle = 0;

        if (this.climbingLadder)
        {
            this.gravityScale = this.climbingWall = this.groundObject = 0;
            this.jumpTimer.unset();
            this.groundTimer.unset();
            this.maxFallVelocity = 0; // reset fall velocity when climbing ladder
            this.velocity = this.velocity.multiply(vec2(.85)).add(vec2(0,.02*moveInput.y));

            const delta = (this.pos.x|0)+.5 - this.pos.x;
            this.velocity.x += .02*delta*abs(moveInput.x ? 0:moveInput.y);
            moveInput.x *= .2;

            // exit ladder if ground is below
            this.climbingLadder = moveInput.y >= 0 || getTileCollisionData(this.pos.subtract(vec2(0,1))) <= 0;
        }
        else
        {
            // track fall velocity for fall damage (before physics update)
            if (!this.groundObject && !this.climbingWall && !this.climbingLadder)
            {
                // falling - track maximum downward velocity
                if (this.velocity.y < 0)
                    this.maxFallVelocity = min(this.maxFallVelocity, this.velocity.y);
            }

            // update jumping and ground check
            if (this.groundObject || this.climbingWall)
                this.groundTimer.set(.1);

            if (this.groundTimer.active() && !this.dodgeTimer.active())
            {
                // is on ground
                if (this.pressedJumpTimer.active() 
                    && !this.jumpTimer.active() 
                    && !this.preventJumpTimer.active())
                {
                    // start jump
                    if (this.climbingWall)
                    {
                        this.velocity.y = .25;
                    }
                    else
                    {
                        this.velocity.y = .15;
                        this.jumpTimer.set(.2);
                    }
                    this.preventJumpTimer.set(.5);
                    playSound(sound_jump, this.pos);
                }
            }

            if (this.jumpTimer.active() && !this.climbingWall)
            {
                // update variable height jump
                this.groundTimer.unset();
                if (this.holdingJump && this.velocity.y > 0 && this.jumpTimer.active())
                    this.velocity.y += .017;
            }

            if (!this.groundObject)
            {
                // air control
                if (sign(moveInput.x) == sign(this.velocity.x))
                    moveInput.x *= .1; // moving with velocity
                else
                    moveInput.x *= .2; // moving against velocity (stopping)
                
                // slight extra gravity when moving down
                if (this.velocity.y < 0)
                    this.velocity.y += gravity*.2;
            }
        }

        if (this.pressedDodge && !this.dodgeTimer.active() && !this.dodgeRechargeTimer.active())
        {
            // start dodge
            this.dodgeTimer.set(.4);
            this.dodgeRechargeTimer.set(2);
            this.jumpTimer.unset();
            this.extinguish();
            playSound(sound_dodge, this.pos);

            if (!this.groundObject && this.getAliveTime() > .2)
                this.velocity.y += .2;
        }

        if (this.pressedMelee && !this.meleeTimer.active() && !this.meleeRechargeTimer.active() && !this.dodgeTimer.active())
        {
            // start melee attack
            this.meleeTimer.set(.2);
            this.meleeRechargeTimer.set(2);
            playSound(sound_shoot, this.pos);

            // check for nearby enemies and apply damage
            const meleeRange = 1.8;
            forEachObject(this.pos, meleeRange, (o)=>
            {
                if (o.isCharacter && o.team != this.team && !o.destroyed && o.health > 0)
                {
                    o.damage(1, this);
                    // apply small knockback
                    const direction = o.pos.subtract(this.pos).normalize();
                    o.applyForce(direction.scale(.05));
                }
            });
        }

        // apply movement acceleration and clamp
        this.velocity.x = clamp(this.velocity.x + moveInput.x * .042, maxCharacterSpeed, -maxCharacterSpeed);

        // call parent, update physics
        const oldVelocity = this.velocity.copy();
        const wasOnGroundBeforeUpdate = (this.groundObject || this.climbingWall || this.climbingLadder) ? 1 : 0;
        super.update();
        
        // check for fall damage after physics update (groundObject is now updated)
        if (!this.climbingLadder && (this.groundObject || this.climbingWall))
        {
            // just landed - apply fall damage if falling fast enough
            if (wasOnGroundBeforeUpdate == 0 && this.maxFallVelocity < 0)
            {
                // Calculate fall damage based on impact velocity
                // Damage threshold: -0.6 (small falls don't hurt)
                // Max damage at -1.2+ velocity (lethal falls)
                const fallSpeed = -this.maxFallVelocity;
                if (fallSpeed > 0.6)
                {
                    // Scale damage: 0.6 speed = 0 damage, 1.2+ speed = 1 damage (lethal)
                    const damage = clamp((fallSpeed - 0.6) / 0.6, 0, 1);
                    if (damage > 0)
                    {
                        this.damage(damage, null);
                        // Play sound effect for fall damage
                        if (damage > 0.5)
                            playSound(sound_die, this.pos);
                        else
                            playSound(sound_walk, this.pos);
                    }
                }
            }
            // Reset fall velocity tracker after landing
            this.maxFallVelocity = 0;
        }
        
        if (!this.isPlayer && !this.dodgeTimer.active())
        {
            // apply collision damage
            const deltaSpeedSquared = this.velocity.subtract(oldVelocity).lengthSquared();
            deltaSpeedSquared > .1 && this.damage(10*deltaSpeedSquared);
        }

        if (this.climbingLadder || this.groundTimer.active() && !this.dodgeTimer.active())
        {
            const speed = this.velocity.length();
            this.walkCyclePercent += speed * .5;
            this.walkCyclePercent = speed > .01 ? mod(this.walkCyclePercent, 1) : 0;
        }
        else
            this.walkCyclePercent = 0;

        if (this.weapon)
            this.weapon.triggerIsDown = this.holdingShoot && !this.dodgeTimer.active() && !this.meleeTimer.active();
        if (!this.dodgeTimer.active())
        {
            if (this.pressingThrow && !this.wasPressingThrow && !this.grendeThrowTimer.active())
            {
                // throw greande
                const grenade = new Grenade(this.pos);
                grenade.velocity = this.velocity.add(vec2(this.getMirrorSign(),rand(.8,.7)).normalize(.25+rand(.02)));
                grenade.angleVelocity = this.getMirrorSign() * rand(.8,.5);
                playSound(sound_jump, this.pos);
                this.grendeThrowTimer.set(1);
            }
            this.wasPressingThrow = this.pressingThrow;
        }

        // update mirror
        if (this.moveInput.x && !this.dodgeTimer.active())
            this.mirror = this.moveInput.x < 0;

        // clamp x pos
        this.pos.x = clamp(this.pos.x, levelSize.x-2, 2);

        // randomly blink
        rand() < .005 && this.blinkTimer.set(rand(.2,.1));
    }
       
    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;

        // set tile to use
        this.tileIndex = this.isDead() ? this.bodyTile : this.climbingLadder || this.groundTimer.active() ? this.bodyTile + 2*this.walkCyclePercent|0 : this.bodyTile+1;

        let additive = this.additiveColor.add(this.extraAdditiveColor);
        if (this.isPlayer && !this.isDead() && this.dodgeRechargeTimer.elapsed() && this.dodgeRechargeTimer.get() < .2)
        {
            const v = .6 - this.dodgeRechargeTimer.get()*3;
            additive = additive.add(new Color(0,v,v,0)).clamp();
        }

        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(),1);
        const eyeColor = this.eyeColor.scale(this.burnColorPercent(),1);
        const headColor = this.team == team_enemy ? new Color() : color; // enemies use neutral color for head

        // melee animation - head moves back
        const meleeHeadOffset = this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;

        const bodyPos = this.pos.add(vec2(0,-.1+.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        drawTile(this.pos.add(vec2(this.getMirrorSign(.05) + meleeHeadOffset * this.getMirrorSign(),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2),this.headTile,vec2(8), headColor,this.angle,this.mirror, additive);

        //for(let i = this.grenadeCount; i--;)
        //    drawTile(bodyPos, vec2(.5), 5, vec2(8), new Color, this.angle, this.mirror, additive);

        const blinkScale = this.canBlink ? this.isDead() ? .3: .5 + .5*Math.cos(this.blinkTimer.getPercent()*PI*2) : 1;
            drawTile(this.pos.add(vec2(this.getMirrorSign(.05),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2, blinkScale*sizeScale/2),this.headTile+1,vec2(8), eyeColor, this.angle, this.mirror, this.additiveColor);
    }

    damage(damage, damagingObject)
    {
        if (this.destroyed)
            return;

        if (this.team == team_player)
        {
            // safety window after spawn
            if (this.getAliveTime() < 2)
                return;
        }

        if (this.isDead() && !this.persistent)
        {
            this.overkill += damage;
            if (this.overkill > 5)
            {
                makeBlood(this.pos, 300);
                this.destroy();
            }
        }

        this.blinkTimer.set(rand(.5,.4));
        makeBlood(damagingObject ? damagingObject.pos : this.pos);
        super.damage(damage, damagingObject);
    }

    kill(damagingObject)                  
    {
        if (this.isDead())
            return 0;

        // Malefactors are immune to warmup destruction (they're too important!)
        if (levelWarmup && !this.immuneToWarmupDamage)
        {
            this.destroy();
            return 1;
        }
        
        this.deadTimer.set();
        this.size = this.size.scale(.5);

        makeBlood(this.pos, 300);
        playSound(sound_die, this.pos);

        this.team = team_none;
        this.health = 0;
        const fallDirection = damagingObject ? sign(damagingObject.velocity.x) : randSign();
        this.angleVelocity = fallDirection*rand(.22,.14);
        this.angleDamping = .9;
        this.weapon && this.weapon.destroy();

        // move to back layer
        this.renderOrder = 1;
    }
    
    collideWithTile(data, pos)
    {
        if (!data)
            return;

        if (data == tileType_ladder)
        {
            if (pos.y + 1 > this.lastPos.y - this.size.y*.5)
                return;

            if (getTileCollisionData(pos.add(vec2(0,1))) // above
                && !(getTileCollisionData(pos.add(vec2(1,0))) // left
                    && getTileCollisionData(pos.add(vec2(1,0)))) // right
            )
                return; // dont collide if something above it and nothing to left or right

            // allow standing on top of ladders
            return !this.climbingLadder;
        }

        // break blocks above
        const d = pos.y - this.pos.y;
        if (!this.climbingLadder && this.velocity.y > .1 && d > 0 && d < this.size.y*.5)
        {
            if (destroyTile(pos))
            {
                this.velocity.y = 0;
                return;
            }
        }

        return 1;
    }

    collideWithObject(o)
    {
        if (this.isDead())
            return super.collideWithObject(o);

        if (o.velocity.lengthSquared() > .04)
        {
            const v = o.velocity.subtract(this.velocity);
            const  m = 25*o.mass * v.lengthSquared();
            if (!o.groundObject && o.isCrushing && !this.persistent && o.velocity.y < 0 && this.pos.y < o.pos.y - o.size.y/2 && abs(o.pos.x - this.pos.x) < o.size.x*.5)
            {
                // crushing
                this.damage(1e3, o);
                if (this.isDead())
                {
                    makeBlood(this.pos, 300);
                    this.destroy();
                }
            }
            else if (m > 1)
                this.damage(4*m|0, o)
        }

        return super.collideWithObject(o);
    }
}

///////////////////////////////////////////////////////////////////////////////

const type_weak   = 0;
const type_normal = 1;
const type_strong = 2;
const type_elite  = 3;
const type_grenade= 4;
const type_slime  = 5;
const type_bastard= 6;
const type_malefactor = 7;
const type_foe    = 8;
const type_count  = 9;

function alertEnemies(pos, playerPos)
{
    const radius = 4;
    forEachObject(pos, radius, (o)=>{o.team == team_enemy && o.alert && o.alert(playerPos)});
    debugAI && debugCircle(pos, radius, '#0ff6');
}

class Enemy extends Character
{
    constructor(pos) 
    { 
        super(pos);

        this.team = team_enemy;
        this.sawPlayerTimer = new Timer;
        this.reactionTimer = new Timer;
        this.facePlayerTimer = new Timer;
        this.holdJumpTimer = new Timer;
        this.shootTimer = new Timer;
        this.maxVisionRange = 12;

        this.type = randSeeded()**3*min(level+1,type_count)|0;

        // Increase chance of grenade throwers (Demolitions Experts) on levels 3, 4, and 5
        if ((level == 3 || level == 4 || level == 5) && this.type < type_slime)
        {
            // High chance to spawn as grenade thrower on these levels
            const grenadeChance = level == 3 ? 0.35 : (level == 4 ? 0.4 : 0.35); // 35% level 3, 40% level 4, 35% level 5
            if (randSeeded() < grenadeChance)
                this.type = type_grenade;
        }

        let health = 1 + this.type;
        this.eyeColor = new Color(1,.5,0);
        if (this.type == type_weak)
        {
            this.color = new Color(0,1,0);
            this.size = this.size.scale(this.sizeScale = .9);
        }
        else if (this.type == type_normal)
        {
            this.color = new Color(0,.4,1);
        }
        else if (this.type == type_strong)
        {
            this.color = new Color(1,0,0);
            this.eyeColor = new Color(1,1,0);
        }
        else if (this.type == type_elite)
        {
            this.color = new Color(1,1,1);
            this.eyeColor = new Color(1,0,0);
            this.maxVisionRange = 15;
        }
        else if (this.type == type_grenade)
        {
            this.color = new Color(.7,0,1);
            this.eyeColor = new Color(0,0,0);
            this.grenadeCount = 3;
            this.canBurn = 0;
        }

        if (this.isBig = randSeeded() < .05)
        {
            // chance of large enemy with extra health
            this.size = this.size.scale(this.sizeScale = 1.3);
            health *= 2;
            this.grenadeCount *= 10;
            this.maxVisionRange = 15;
            --levelEnemyCount;
        }

        this.health = this.healthMax = health;
        this.color = this.color.mutate();
        this.mirror = rand() < .5;

        new Weapon(this.pos, this);
         --levelEnemyCount;

        this.sightCheckFrame = rand(9)|0;
    }
    
    update()
    {
        if (!aiEnable || levelWarmup || this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            super.update();
            return; // ignore offscreen objects
        }

        if (this.weapon)
            this.weapon.localPos = this.weapon.localOffset.scale(this.sizeScale);

        // update check if players are visible
        const sightCheckFrames = 9;
        ASSERT(this.sawPlayerPos || !this.sawPlayerTimer.isSet());
        if (frame%sightCheckFrames == this.sightCheckFrame)
        {
            const sawRecently = this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 5;
            const visionRangeSquared = (sawRecently ? this.maxVisionRange * 1.2 : this.maxVisionRange)**2;
            debugAI && debugCircle(this.pos, visionRangeSquared**.5, '#f003', .1);
            for(const player of players)
            {
                // check range
                if (player && !player.isDead())
                if (sawRecently || this.getMirrorSign() == sign(player.pos.x - this.pos.x))
                if (sawRecently || abs(player.pos.x - this.pos.x) > abs(player.pos.y - this.pos.y) ) // 45 degree slope
                if (this.pos.distanceSquared(player.pos) < visionRangeSquared)
                {
                    const raycastHit = tileCollisionRaycast(this.pos, player.pos);
                    if (!raycastHit)
                    {
                        this.alert(player.pos, 1);
                        debugAI && debugLine(this.pos, player.pos, '#0f0',.1)
                        break;
                    }
                    debugAI && debugLine(this.pos, player.pos, '#f00',.1)
                    debugAI && raycastHit && debugPoint(raycastHit, '#ff0',.1)
                }
            }

            if (sawRecently)
            {
                // alert nearby enemies
                alertEnemies(this.pos, this.sawPlayerPos);
            }
        }

        this.pressedDodge = this.climbingWall = this.pressingThrow = 0;
        
        if (this.burnTimer.isSet())
        {
            // burning, run around
            this.facePlayerTimer.unset();

            // random jump
            if (rand()< .005)
            {
                this.pressedJumpTimer.set(.05);
                this.holdJumpTimer.set(rand(.05));
            }
            
            // random movement
            if (rand()<.05)
                this.moveInput.x = randSign()*rand(.6, .3);
            this.moveInput.y = 0;

            // random dodge
            if (this.type == type_elite)
                this.pressedDodge = 1;
            else if (this.groundObject)
                this.pressedDodge = rand() < .005;
        }
        else if (this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 10)
        {
            debugAI && debugPoint(this.sawPlayerPos, '#f00');

            // wall climb
            if (this.type >= type_strong && this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            this.weapon.localAngle *= .8;
            if (this.reactionTimer.active())
            {
                // just saw player for first time, act surprised
                this.moveInput.x = 0;
            }
            else if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#f00');
                    
                if (!this.dodgeTimer.active())
                {
                    const playerDirection = sign(this.sawPlayerPos.x - this.pos.x);
                    if (this.type == type_grenade && rand() < .002 && this.getMirrorSign() == playerDirection)
                        this.pressingThrow = 1;
                        
                    // actively fighting player
                    if (rand()<.05)
                        this.facePlayerTimer.set(rand(2,.5));

                    // random jump
                    if (rand()<(this.type < type_strong ? .0005 : .005))
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.2));
                    }
                    
                    // random movement
                    if (rand()<(this.isBig?.05:.02))
                        this.moveInput.x = 0;
                    else if (rand()<.01)
                        this.moveInput.x = rand()<.6 ? playerDirection*rand(.5, .2) : -playerDirection*rand(.4, .2);
                    if (rand()<.03)
                        this.moveInput.y = rand()<.5 ? 0 : randSign()*rand(.4, .2);
                
                    // random shoot
                    if (abs(this.sawPlayerPos.y - this.pos.y) < 4)
                    if (!this.shootTimer.isSet() || this.shootTimer.get() > 1)
                        rand() < (this.type > type_weak ? .02 : .01) && this.shootTimer.set(this.isBig ? rand(2,1) : .05);
                }

                // random dodge
                if (this.type == type_elite)
                    this.pressedDodge = rand() < .01 && timeSinceSawPlayer < .5;
            }
            else
            {
                // was fighting but lost player
                debugAI && debugRect(this.pos, this.size, '#ff0');

                if (rand()<.04)
                    this.facePlayerTimer.set(rand(2,.5));

                // random movement
                if (rand()<.02)
                    this.moveInput.x = 0;
                else if (rand()<.01)
                    this.moveInput.x = randSign()*rand(.4, .2);

                // random jump
                if (rand() < (this.sawPlayerPos.y > this.pos.y ? .002 : .001))
                {
                    this.pressedJumpTimer.set(.1);
                    this.holdJumpTimer.set(rand(.2));
                }
                
                // random shoot
                if (!this.shootTimer.isSet() || this.shootTimer.get() > 5)
                    rand() < .001 && this.shootTimer.set(rand(.2,.1));

                // move up/down in dirction last player was seen
                this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y,.5,-.5);
            }
        }
        else
        {
            // try to act normal
            if (rand()<.03)
                this.moveInput.x = 0;
            else if (rand()<.005)
                this.moveInput.x = randSign()*rand(.2, .1);
            else if (rand()<.001)
                this.moveInput.x = randSign()*1e-9; // hack: look in a direction

            this.weapon.localAngle = lerp(.1, .7, this.weapon.localAngle);
            this.reactionTimer.unset();
        }

        if (this.isBig && this.type != type_elite)
        {
            // big enemies cant jump
            this.pressedJumpTimer.unset();
            this.holdJumpTimer.unset();
        }
        this.holdingShoot = this.shootTimer.active();
        this.holdingJump = this.holdJumpTimer.active();

        super.update();

        // override default mirror
        if (this.facePlayerTimer.active() && !this.dodgeTimer.active() && !this.reactionTimer.active())
            this.mirror = this.sawPlayerPos.x < this.pos.x;
    }

    alert(playerPos, resetSawPlayer)
    {
        if (resetSawPlayer || !this.sawPlayerTimer.isSet())
        {
            if (!this.reactionTimer.isSet())
            {
                this.reactionTimer.set(rand(1,.5)*(this.type == type_weak ? 2 : 1));
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .2)
                    this.velocity.y += .1; // random jump
            }

            this.sawPlayerTimer.set();
            this.sawPlayerPos = playerPos;
        }
    }

    damage(damage, damagingObject)
    {
        super.damage(damage, damagingObject);
        if (!this.isDead())
        {
            this.alert(damagingObject ? damagingObject.pos.subtract(damagingObject.velocity.normalize()) : this.pos, 1);
            this.reactionTimer.set(rand(1,.5));
            this.shootTimer.unset();
        }
    }

    kill(damagingObject)
    {
        if (this.isDead())
            return 0;

        super.kill(damagingObject);
        levelWarmup || ++totalKills;
    }
}

///////////////////////////////////////////////////////////////////////////////

class Slime extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be slime
        this.type = type_slime;
        
        // Slime is large and slow
        this.size = this.size.scale(this.sizeScale = 1.5);
        this.health = this.healthMax = 6; // Most difficult enemy yet
        
        // Green slime color
        this.color = new Color(0, 1, 0);
        this.eyeColor = new Color(0, 0.8, 0);
        
        // Slime-specific properties
        // Slime sprite is at pixel (112,0) to (127,13) - unused space in tileset
        this.slimeTile = 19; // Tile index for slime body sprite
        this.slimeTileSize = vec2(16); // Slime sprite is 16x14 pixels
        this.headTile = 2; // Use same head tile as normal enemies
        this.trailPositions = []; // Store positions for trail
        this.maxTrailLength = 10;
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        
        // Slow movement - slimes move at 40% speed
        this.maxSpeed = maxCharacterSpeed * 0.4;
        
        // Replace weapon with slime weapon
        this.weapon && this.weapon.destroy();
        new SlimeWeapon(this.pos, this);
        
        // Slime doesn't burn
        this.canBurn = 0;
        
        // Initialize trail timer
        this.trailTimer.set(0.1);
    }
    
    update()
    {
        // Update trail
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.1); // Add to trail every 0.1 seconds
            const dist = this.pos.distance(this.lastTrailPos);
            if (dist > 0.2) // Only add if moved enough
            {
                this.trailPositions.push(this.pos.copy());
                if (this.trailPositions.length > this.maxTrailLength)
                    this.trailPositions.shift();
                this.lastTrailPos = this.pos.copy();
            }
        }
        
        // Scale down movement input for slow slime movement
        if (this.moveInput)
        {
            this.moveInput = this.moveInput.scale(0.4);
        }
        
        super.update();
        
        // Clamp velocity to slime's max speed
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;
    }
    
    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;
        
        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(), 1);
        
        // Draw trail (green translucent blobs)
        if (this.trailPositions.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.trailPositions.length; i++)
            {
                const trailPos = this.trailPositions[i];
                const alpha = (i + 1) / this.trailPositions.length * 0.3; // Fade out trail
                const trailSize = sizeScale * 0.6 * (i + 1) / this.trailPositions.length;
                const trailColor = new Color(0, 1, 0, alpha);
                drawTile(trailPos, vec2(trailSize), -1, undefined, trailColor);
            }
            setBlendMode(0);
        }
        
        // Draw translucent green liquid blob around slime (3-4 overlapping squares)
        setBlendMode(0);
        const translucentColor = new Color(0, 1, 0, 0.3);
        const blobSize = sizeScale * 1.2; // Large chunks for liquid effect
        // Draw multiple overlapping blobs to create liquid effect
        drawTile(this.pos.add(vec2(-0.15, 0.1).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.15, 0.1).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, -0.1).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.15).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        setBlendMode(0);
        
        // Draw main slime body sprite
        const bodyPos = this.pos.add(vec2(0, -0.1 + 0.06 * Math.sin(this.walkCyclePercent * PI)).scale(sizeScale));
        drawTile(bodyPos, vec2(sizeScale), this.slimeTile, this.slimeTileSize, color, this.angle, this.mirror);
        
        // Draw head (like normal enemies)
        const headColor = new Color(); // Enemies use neutral color for head
        const meleeHeadOffset = this.meleeTimer && this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;
        drawTile(this.pos.add(vec2(this.getMirrorSign(.05) + meleeHeadOffset * this.getMirrorSign(),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2),this.headTile,vec2(8), headColor,this.angle,this.mirror);
        
        // Draw eyes on head (like normal enemies)
        if (!this.isDead())
        {
            const eyeColor = this.eyeColor.scale(this.burnColorPercent(), 1);
            const blinkScale = this.canBlink ? .5 + .5*Math.cos(this.blinkTimer.getPercent()*PI*2) : 1;
            drawTile(this.pos.add(vec2(this.getMirrorSign(.05),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2, blinkScale*sizeScale/2),this.headTile+1,vec2(8), eyeColor, this.angle, this.mirror, this.additiveColor);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class Foe extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be foe
        this.type = type_foe;
        
        // Foe is huge (5x size) and slow like slime
        this.size = this.size.scale(this.sizeScale = 5.0);
        this.health = this.healthMax = 100; // Twice malefactor health (50 * 2)
        
        // Green slime color (same as slime)
        this.color = new Color(0, 1, 0);
        this.eyeColor = new Color(0, 0.8, 0);
        
        // Foe-specific properties
        // Use unused sprite tile from bottom of sprite sheet for foe body
        // Assuming 16 tiles per row, using high indices that are at the bottom rows
        this.foeTile = 30; // Foe sprite tile (from bottom of sprite sheet)
        this.foeTileSize = vec2(16); // Same size as slime sprite
        this.trailPositions = []; // Store positions for trail
        this.maxTrailLength = 15; // Longer trail than slime
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        
        // Foe moves faster than slime - aggressive chaser
        this.maxSpeed = maxCharacterSpeed * 0.6; // Faster than slime (0.4) but still slower than normal
        this.maxVisionRange = 25; // Much longer vision range
        
        // Replace weapon with foe weapon
        this.weapon && this.weapon.destroy();
        new FoeWeapon(this.pos, this);
        
        // Foe doesn't burn
        this.canBurn = 0;
        
        // Initialize trail timer
        this.trailTimer.set(0.1);
    }
    
    update()
    {
        // Update trail
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.1); // Add to trail every 0.1 seconds
            const dist = this.pos.distance(this.lastTrailPos);
            if (dist > 0.2) // Only add if moved enough
            {
                this.trailPositions.push(this.pos.copy());
                if (this.trailPositions.length > this.maxTrailLength)
                    this.trailPositions.shift();
                this.lastTrailPos = this.pos.copy();
            }
        }
        
        // EXTREMELY AGGRESSIVE: Always chase player when seen
        if (this.sawPlayerTimer && this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 10)
        {
            const playerDirection = sign(this.sawPlayerPos.x - this.pos.x);
            
            // Always move toward player aggressively
            if (rand() < 0.05) // Small chance to stop briefly
                this.moveInput.x = 0;
            else
                this.moveInput.x = playerDirection * rand(0.8, 0.6); // Strong movement toward player
            
            // Always try to get to player's vertical position
            this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y, 0.7, -0.7);
            
            // Face player always
            this.mirror = this.sawPlayerPos.x < this.pos.x;
            
            // Frequent jumps to chase player
            if (rand() < 0.03)
            {
                this.pressedJumpTimer.set(0.1);
                this.holdJumpTimer.set(rand(0.2));
            }
        }
        else
        {
            // Scale down movement input when not chasing
            if (this.moveInput)
            {
                this.moveInput = this.moveInput.scale(0.4);
            }
        }
        
        super.update();
        
        // Clamp velocity to foe's max speed
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;
    }
    
    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;
        
        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(), 1);
        
        // Draw trail (green translucent blobs) - larger than slime
        if (this.trailPositions.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.trailPositions.length; i++)
            {
                const trailPos = this.trailPositions[i];
                const alpha = (i + 1) / this.trailPositions.length * 0.3; // Fade out trail
                const trailSize = sizeScale * 0.6 * (i + 1) / this.trailPositions.length;
                const trailColor = new Color(0, 1, 0, alpha);
                drawTile(trailPos, vec2(trailSize), -1, undefined, trailColor);
            }
            setBlendMode(0);
        }
        
        // Draw translucent green liquid blob around foe (more blobs for larger size)
        setBlendMode(0);
        const translucentColor = new Color(0, 1, 0, 0.3);
        const blobSize = sizeScale * 1.2; // Large chunks for liquid effect
        // Draw multiple overlapping blobs to create liquid effect (more for larger foe)
        drawTile(this.pos.add(vec2(-0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, -0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.2).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(-0.1, 0).scale(sizeScale)), vec2(blobSize * 0.8), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.1, 0).scale(sizeScale)), vec2(blobSize * 0.8), -1, undefined, translucentColor);
        setBlendMode(0);
        
        // Draw main foe body sprite
        const bodyPos = this.pos.add(vec2(0, -0.1 + 0.06 * Math.sin(this.walkCyclePercent * PI)).scale(sizeScale));
        drawTile(bodyPos, vec2(sizeScale), this.foeTile, this.foeTileSize, color, this.angle, this.mirror);
        
        // No head - foe is just a body
    }
}

///////////////////////////////////////////////////////////////////////////////

class Bastard extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be bastard
        this.type = type_bastard;
        
        // Bastard is fast and agile
        this.size = this.size.scale(this.sizeScale = 1.0);
        this.health = this.healthMax = 2; // Moderate health
        this.maxSpeed = maxCharacterSpeed * 1.5; // 50% faster than normal
        
        // Unique sprite - use tile 20 for body (assuming it's available)
        this.bodyTile = 20;
        this.headTile = 2; // Use same head tile as normal enemies
        
        // Reddish/orange color to distinguish from other enemies
        this.color = new Color(1, 0.4, 0);
        this.eyeColor = new Color(1, 0, 0);
        
        // Remove weapon - bastard is melee only
        if (this.weapon)
        {
            this.weapon.destroy();
            this.weapon = null;
        }
        
        // Enhanced vision range for aggressive chasing
        this.maxVisionRange = 15;
        
        // Melee attack timer for aggressive melee attacks
        this.meleeAttackTimer = new Timer;
        this.meleeCooldownTimer = new Timer;
        
        // Don't burn (optional - can remove if you want them to burn)
        // this.canBurn = 0;
    }
    
    update()
    {
        if (!aiEnable || levelWarmup || this.isDead() || !this.inUpdateWindow())
        {
            // Call Character.update() directly, not Enemy.update() since we have no weapon
            Character.prototype.update.call(this);
            return;
        }

        // update check if players are visible (same as Enemy)
        const sightCheckFrames = 9;
        ASSERT(this.sawPlayerPos || !this.sawPlayerTimer.isSet());
        if (frame%sightCheckFrames == this.sightCheckFrame)
        {
            const sawRecently = this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 5;
            const visionRangeSquared = (sawRecently ? this.maxVisionRange * 1.2 : this.maxVisionRange)**2;
            debugAI && debugCircle(this.pos, visionRangeSquared**.5, '#f003', .1);
            for(const player of players)
            {
                if (player && !player.isDead())
                if (sawRecently || this.getMirrorSign() == sign(player.pos.x - this.pos.x))
                if (sawRecently || abs(player.pos.x - this.pos.x) > abs(player.pos.y - this.pos.y))
                if (this.pos.distanceSquared(player.pos) < visionRangeSquared)
                {
                    const raycastHit = tileCollisionRaycast(this.pos, player.pos);
                    if (!raycastHit)
                    {
                        this.alert(player.pos, 1);
                        debugAI && debugLine(this.pos, player.pos, '#0f0',.1)
                        break;
                    }
                    debugAI && debugLine(this.pos, player.pos, '#f00',.1)
                    debugAI && raycastHit && debugPoint(raycastHit, '#ff0',.1)
                }
            }

            if (sawRecently)
            {
                alertEnemies(this.pos, this.sawPlayerPos);
            }
        }

        this.pressedDodge = this.climbingWall = this.pressingThrow = 0;
        
        if (this.burnTimer.isSet())
        {
            // burning, run around
            this.facePlayerTimer.unset();
            if (rand()< .005)
            {
                this.pressedJumpTimer.set(.05);
                this.holdJumpTimer.set(rand(.05));
            }
            if (rand()<.05)
                this.moveInput.x = randSign()*rand(.6, .3);
            this.moveInput.y = 0;
        }
        else if (this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 10)
        {
            debugAI && debugPoint(this.sawPlayerPos, '#f00');

            // Aggressive wall climbing - bastard climbs walls like strong enemies
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            if (this.reactionTimer.active())
            {
                // just saw player for first time, act surprised
                this.moveInput.x = 0;
            }
            else if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#f00');
                    
                if (!this.dodgeTimer.active())
                {
                    const playerDirection = sign(this.sawPlayerPos.x - this.pos.x);
                    const playerDistance = this.pos.distance(this.sawPlayerPos);
                    
                    // Aggressive melee attack when close
                    if (playerDistance < 2.5 && !this.meleeCooldownTimer.isSet())
                    {
                        this.pressedMelee = 1;
                        this.meleeCooldownTimer.set(1.5); // Cooldown between melee attacks
                    }
                    
                    if (rand()<.05)
                        this.facePlayerTimer.set(rand(2,.5));

                    // Frequent aggressive jumps
                    if (rand()<.02) // Much more frequent than normal enemies
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.2));
                    }
                    
                    // Aggressive movement towards player
                    if (rand()<.01)
                        this.moveInput.x = 0;
                    else
                        this.moveInput.x = playerDirection * rand(.8, .5); // Move faster towards player
                    
                    // Aggressive ladder climbing - always try to climb towards player
                    if (rand()<.05)
                        this.moveInput.y = 0;
                    else
                        this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y, .8, -.8); // Aggressive vertical movement
                }
            }
            else
            {
                // was fighting but lost player - still aggressive
                debugAI && debugRect(this.pos, this.size, '#ff0');

                if (rand()<.04)
                    this.facePlayerTimer.set(rand(2,.5));

                if (rand()<.02)
                    this.moveInput.x = 0;
                else if (rand()<.01)
                    this.moveInput.x = randSign()*rand(.4, .2);

                // Still jump when searching
                if (rand() < .01)
                {
                    this.pressedJumpTimer.set(.1);
                    this.holdJumpTimer.set(rand(.2));
                }
                
                // Move up/down in direction last player was seen
                this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y,.8,-.8);
            }
        }
        else
        {
            // try to act normal
            if (rand()<.03)
                this.moveInput.x = 0;
            else if (rand()<.005)
                this.moveInput.x = randSign()*rand(.2, .1);
            else if (rand()<.001)
                this.moveInput.x = randSign()*1e-9;
        }

        this.holdingShoot = 0; // No shooting for bastard
        this.holdingJump = this.holdJumpTimer.active();

        // Call Character.update() directly instead of Enemy.update() to avoid weapon access
        Character.prototype.update.call(this);
        
        // Override velocity clamping to allow faster movement than normal enemies
        // Character.update() already applied acceleration clamped to maxCharacterSpeed
        // Now we allow it to go up to maxSpeed (1.5x faster) by continuing acceleration
        if (this.moveInput.x && abs(this.velocity.x) < this.maxSpeed)
        {
            // Continue accelerating if we haven't reached maxSpeed yet
            this.velocity.x = clamp(this.velocity.x + this.moveInput.x * .042, this.maxSpeed, -this.maxSpeed);
        }
        // Ensure velocity doesn't exceed maxSpeed
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;

        // override default mirror to face player
        if (this.facePlayerTimer.active() && !this.dodgeTimer.active() && !this.reactionTimer.active())
            this.mirror = this.sawPlayerPos.x < this.pos.x;
    }

    alert(playerPos, resetSawPlayer)
    {
        if (resetSawPlayer || !this.sawPlayerTimer.isSet())
        {
            if (!this.reactionTimer.isSet())
            {
                this.reactionTimer.set(rand(.5,.3)); // Faster reaction than normal enemies
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .3) // More likely to jump when alerted
                    this.pressedJumpTimer.set(.1);
            }
            this.sawPlayerPos = playerPos.copy();
            this.sawPlayerTimer.set();
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class Malefactor extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be malefactor
        this.type = type_malefactor;
        
        // Malefactor is huge (5x size) and very fast
        this.size = this.size.scale(this.sizeScale = 5.0);
        this.health = this.healthMax = 50; // Very high health for final boss
        this.maxSpeed = maxCharacterSpeed * 4.0; // 4x faster than normal - very fast!
        this.jumpPower = 0.3; // Higher jump than normal (.15) but not too high
        this.noFallDamage = 1; // Flag to prevent fall damage
        this.immuneToWarmupDamage = 1; // Prevent destruction during warmup
        
        // Unique sprite - use tile 21 for body (different from bastard's 20)
        this.bodyTile = 21;
        this.headTile = 2; // Use same head tile as normal enemies
        
        // All black sprite
        this.color = new Color(0, 0, 0);
        this.eyeColor = new Color(1, 1, 0); // Yellow/glowing eyes
        
        // Remove weapon - malefactor is melee only
        if (this.weapon)
        {
            this.weapon.destroy();
            this.weapon = null;
        }
        
        // Enhanced vision range for aggressive chasing
        this.maxVisionRange = 20;
        
        // Melee attack timer for aggressive melee attacks
        this.meleeAttackTimer = new Timer;
        this.meleeCooldownTimer = new Timer;
    }
    
    update()
    {
        if (!aiEnable || levelWarmup || this.isDead() || !this.inUpdateWindow())
        {
            // Call Character.update() directly, not Enemy.update() since we have no weapon
            Character.prototype.update.call(this);
            return;
        }

        // update check if players are visible (same as Enemy/Bastard)
        const sightCheckFrames = 9;
        ASSERT(this.sawPlayerPos || !this.sawPlayerTimer.isSet());
        if (frame%sightCheckFrames == this.sightCheckFrame)
        {
            const sawRecently = this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 5;
            const visionRangeSquared = (sawRecently ? this.maxVisionRange * 1.2 : this.maxVisionRange)**2;
            debugAI && debugCircle(this.pos, visionRangeSquared**.5, '#f003', .1);
            for(const player of players)
            {
                if (player && !player.isDead())
                if (sawRecently || this.getMirrorSign() == sign(player.pos.x - this.pos.x))
                if (sawRecently || abs(player.pos.x - this.pos.x) > abs(player.pos.y - this.pos.y))
                if (this.pos.distanceSquared(player.pos) < visionRangeSquared)
                {
                    const raycastHit = tileCollisionRaycast(this.pos, player.pos);
                    if (!raycastHit)
                    {
                        this.alert(player.pos, 1);
                        debugAI && debugLine(this.pos, player.pos, '#0f0',.1)
                        break;
                    }
                    debugAI && debugLine(this.pos, player.pos, '#f00',.1)
                    debugAI && raycastHit && debugPoint(raycastHit, '#ff0',.1)
                }
            }

            if (sawRecently)
            {
                alertEnemies(this.pos, this.sawPlayerPos);
            }
        }

        this.pressedDodge = this.climbingWall = this.pressingThrow = 0;
        
        if (this.burnTimer.isSet())
        {
            // burning, run around
            this.facePlayerTimer.unset();
            if (rand()< .005)
            {
                this.pressedJumpTimer.set(.05);
                this.holdJumpTimer.set(rand(.05));
            }
            if (rand()<.05)
                this.moveInput.x = randSign()*rand(.6, .3);
            this.moveInput.y = 0;
        }
        else if (this.sawPlayerTimer.isSet() && this.sawPlayerTimer.get() < 10)
        {
            debugAI && debugPoint(this.sawPlayerPos, '#f00');

            // Aggressive wall climbing - malefactor climbs walls like bastard
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            if (this.reactionTimer.active())
            {
                // just saw player for first time, act surprised
                this.moveInput.x = 0;
            }
            else if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#f00');
                    
                if (!this.dodgeTimer.active())
                {
                    const playerDirection = sign(this.sawPlayerPos.x - this.pos.x);
                    const playerDistance = this.pos.distance(this.sawPlayerPos);
                    
                    // Aggressive melee attack when close
                    if (playerDistance < 4.0 && !this.meleeCooldownTimer.isSet()) // Larger range due to size
                    {
                        this.pressedMelee = 1;
                        this.meleeCooldownTimer.set(1.2); // Faster cooldown than bastard
                    }
                    
                    if (rand()<.05)
                        this.facePlayerTimer.set(rand(2,.5));

                    // Very frequent aggressive jumps
                    if (rand()<.03) // Even more frequent than bastard
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.2));
                    }
                    
                    // Aggressive movement towards player
                    if (rand()<.01)
                        this.moveInput.x = 0;
                    else
                        this.moveInput.x = playerDirection * rand(.9, .6); // Move faster towards player
                    
                    // Aggressive ladder climbing - always try to climb towards player
                    if (rand()<.05)
                        this.moveInput.y = 0;
                    else
                        this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y, .8, -.8); // Aggressive vertical movement
                }
            }
            else
            {
                // was fighting but lost player - still aggressive
                debugAI && debugRect(this.pos, this.size, '#ff0');

                if (rand()<.04)
                    this.facePlayerTimer.set(rand(2,.5));

                if (rand()<.02)
                    this.moveInput.x = 0;
                else if (rand()<.01)
                    this.moveInput.x = randSign()*rand(.4, .2);

                // Still jump when searching
                if (rand() < .01)
                {
                    this.pressedJumpTimer.set(.1);
                    this.holdJumpTimer.set(rand(.2));
                }
                
                // Move up/down in direction last player was seen
                this.moveInput.y = clamp(this.sawPlayerPos.y - this.pos.y,.8,-.8);
            }
        }
        else
        {
            // try to act normal
            if (rand()<.03)
                this.moveInput.x = 0;
            else if (rand()<.005)
                this.moveInput.x = randSign()*rand(.2, .1);
            else if (rand()<.001)
                this.moveInput.x = randSign()*1e-9;
        }

        this.holdingShoot = 0; // No shooting for malefactor
        this.holdingJump = this.holdJumpTimer.active();

        // Store jump timer state before update to detect new jumps
        const wasJumping = this.jumpTimer.active();
        
        // Prevent fall damage by overriding maxFallVelocity tracking
        // We'll manually handle the update but skip fall damage
        const healthBefore = this.health;
        const wasOnGroundBeforeUpdate = (this.groundObject || this.climbingWall || this.climbingLadder) ? 1 : 0;
        
        // Store if we want to do a melee attack
        const wantsMelee = this.pressedMelee && !this.meleeTimer.active() && !this.meleeRechargeTimer.active() && !this.dodgeTimer.active();
        
        // Prevent Character.update() from processing melee if we want to override it
        const savedPressedMelee = this.pressedMelee;
        if (wantsMelee)
            this.pressedMelee = 0; // Temporarily disable so we can override
        
        // Call Character.update() but prevent fall damage by resetting maxFallVelocity
        // The fall damage check happens inside Character.update(), so we need to prevent
        // maxFallVelocity from accumulating negative values
        this.maxFallVelocity = 0; // Reset before update
        
        Character.prototype.update.call(this);
        
        // Enhanced melee attack for malefactor - override default melee with better range/damage
        if (wantsMelee)
        {
            // Start melee attack with enhanced range and damage
            this.meleeTimer.set(.2);
            this.meleeRechargeTimer.set(0.8); // Faster cooldown for more frequent attacks
            playSound(sound_shoot, this.pos);

            // Enhanced melee range - much larger due to 5x size
            const meleeRange = 4.5; // Much larger than normal 1.8
            forEachObject(this.pos, meleeRange, (o)=>
            {
                if (o.isCharacter && o.team != this.team && !o.destroyed && o.health > 0)
                {
                    // Deal more damage - 3 damage instead of 1
                    o.damage(3, this);
                    // Apply stronger knockback
                    const direction = o.pos.subtract(this.pos).normalize();
                    o.applyForce(direction.scale(.2)); // Stronger knockback than normal .05
                }
            });
        }
        
        // Restore pressedMelee state
        this.pressedMelee = savedPressedMelee;
        
        // If fall damage was applied (health decreased and we just landed), restore it
        if (this.noFallDamage && healthBefore > this.health && wasOnGroundBeforeUpdate == 0 && (this.groundObject || this.climbingWall))
        {
            // Restore health lost from fall damage
            this.health = healthBefore;
        }
        
        // Reset maxFallVelocity to prevent any future fall damage tracking
        this.maxFallVelocity = 0;
        
        // Boost jump velocity for higher jumps
        // If jumpTimer just became active (wasn't active before, is now), boost the initial jump
        if (!wasJumping && this.jumpTimer.active() && this.velocity.y > 0)
        {
            // Jump just started - boost initial jump velocity
            if (this.climbingWall)
                this.velocity.y = 0.4; // Higher wall jump (normal is .25)
            else
                this.velocity.y = this.jumpPower; // Higher jump (normal is .15)
        }
        
        // Continue boosting jump while holding jump button
        if (this.jumpTimer.active() && this.holdingJump && this.velocity.y > 0)
        {
            // Boost jump continuation more than normal (.017 -> .03)
            this.velocity.y += 0.03;
        }
        
        // Override velocity clamping to allow faster movement than normal enemies
        // Character.update() already applied acceleration clamped to maxCharacterSpeed
        // Now we allow it to go up to maxSpeed (4x faster) by continuing acceleration
        if (this.moveInput.x && abs(this.velocity.x) < this.maxSpeed)
        {
            // Continue accelerating if we haven't reached maxSpeed yet
            this.velocity.x = clamp(this.velocity.x + this.moveInput.x * .084, this.maxSpeed, -this.maxSpeed);
        }
        // Ensure velocity doesn't exceed maxSpeed
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;

        // override default mirror to face player
        if (this.facePlayerTimer.active() && !this.dodgeTimer.active() && !this.reactionTimer.active())
            this.mirror = this.sawPlayerPos.x < this.pos.x;
    }

    alert(playerPos, resetSawPlayer)
    {
        if (resetSawPlayer || !this.sawPlayerTimer.isSet())
        {
            if (!this.reactionTimer.isSet())
            {
                this.reactionTimer.set(rand(.3,.2)); // Even faster reaction than bastard
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .4) // More likely to jump when alerted
                    this.pressedJumpTimer.set(.1);
            }
            this.sawPlayerPos = playerPos.copy();
            this.sawPlayerTimer.set();
        }
    }
    
    render()
    {
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize))
            return;

        // set tile to use
        this.tileIndex = this.isDead() ? this.bodyTile : this.climbingLadder || this.groundTimer.active() ? this.bodyTile + 2*this.walkCyclePercent|0 : this.bodyTile+1;

        let additive = this.additiveColor.add(this.extraAdditiveColor);
        if (this.isPlayer && !this.isDead() && this.dodgeRechargeTimer.elapsed() && this.dodgeRechargeTimer.get() < .2)
        {
            const v = .6 - this.dodgeRechargeTimer.get()*3;
            additive = additive.add(new Color(0,v,v,0)).clamp();
        }

        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(),1);
        const headColor = this.team == team_enemy ? new Color() : color; // enemies use neutral color for head

        // melee animation - head moves back
        const meleeHeadOffset = this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;

        const bodyPos = this.pos.add(vec2(0,-.1+.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        drawTile(this.pos.add(vec2(this.getMirrorSign(.05) + meleeHeadOffset * this.getMirrorSign(),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2),this.headTile,vec2(8), headColor,this.angle,this.mirror, additive);

        // Blinking glowing eyes - create pulsing glow effect
        if (!this.isDead())
        {
            // Blink animation (eyes close periodically)
            const blinkScale = this.canBlink ? .3 + .7*Math.cos(this.blinkTimer.getPercent()*PI*2) : 1;
            
            // Glowing effect - pulse brightness
            const glowIntensity = 0.8 + 0.2 * Math.sin(time * 8); // Fast pulsing glow
            const glowingEyeColor = this.eyeColor.scale(glowIntensity).scale(this.burnColorPercent(), 1);
            
            // Add additive glow effect for eyes
            const eyeGlow = new Color(glowingEyeColor.r, glowingEyeColor.g, glowingEyeColor.b, 0.5);
            
            drawTile(this.pos.add(vec2(this.getMirrorSign(.05),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2, blinkScale*sizeScale/2),this.headTile+1,vec2(8), glowingEyeColor, this.angle, this.mirror, eyeGlow);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class Player extends Character
{
    constructor(pos, playerIndex=0) 
    { 
        super(pos);

        this.grenadeCount = 3;
        this.burnTime = 2;
        this.aimAngle = 0; // weapon aim angle in radians
        
        this.eyeColor = (new Color).setHSLA(-playerIndex*.6,1,.5);
        if (playerIndex)
        {
            this.color = (new Color).setHSLA(playerIndex*.3-.3,.5,.5);
            this.extraAdditiveColor = (new Color).setHSLA(playerIndex*.3-.3,1,.1,0);
        }

        this.bodyTile = 5;
        this.headTile = 18;
        this.playerIndex = playerIndex;
        this.renderOrder = 20 + 10*playerIndex;
        this.walkSoundTime = 0;
        this.persistent = this.wasHoldingJump = this.canBlink = this.isPlayer = 1;
        this.team = team_player;
        
        new Weapon(this.pos, this);
        players[playerIndex] = this;
        
        // small jump on spawn
        this.velocity.y = .2;
        this.mirror = playerIndex%2;
        --playerLives;
    }

    update()
    {
        if (this.isDead())
        {
            if (this.persistent && playerLives)
            {
                if (players.length == 1)
                {
                    if (this.deadTimer.get() > 2)
                    {
                        this.persistent = 0;
                        new Player(checkpointPos, this.playerIndex);
                        playSound(sound_jump, cameraPos);
                    }
                }
                else
                {
                    // respawn only if all players dead, or checkpoint touched
                    let hasLivingPlayers = 0;
                    let minDeadTime = 1e3;
                    for(const player of players)
                    {
                        if (player)
                        {
                            minDeadTime = min(minDeadTime, player.isDead() ? player.deadTimer.get() : 1e3);
                            hasLivingPlayers |= (!player.isDead() && player.getAliveTime() > .1);
                        }
                    }

                    if (minDeadTime > 2)
                    {
                        if (!hasLivingPlayers)
                        {
                            // respawn all
                            this.persistent = 0;
                            new Player(checkpointPos.add(vec2(1-this.playerIndex/2,0)), this.playerIndex);
                            this.playerIndex || playSound(sound_jump, cameraPos);
                        }
                        else if (checkpointTimer.active())
                        {
                            // respawn if checkpoint active
                            this.persistent = 0;
                            const player = new Player(checkpointPos, this.playerIndex);
                            playSound(sound_jump, cameraPos);
                        }
                    }
                }
            }

            super.update();
            return;
        }

        // wall climb
        this.climbingWall = 0;
        if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
        {
            this.velocity.y *=.8;
            this.climbingWall = 1;
        }

        // movement control - WASD for movement only
        this.moveInput.x = isUsingGamepad || this.playerIndex ? gamepadStick(0, this.playerIndex).x : keyIsDown(68) - keyIsDown(65); // D - A

        this.moveInput.y = isUsingGamepad || this.playerIndex ? gamepadStick(0, this.playerIndex).y : keyIsDown(87) - keyIsDown(83); // W - S (W=up/climb up, S=down/climb down)
        
        // jump - W key only
        this.holdingJump = (!this.playerIndex && keyIsDown(87)) || gamepadIsDown(0, this.playerIndex); // W key
        if (!this.holdingJump)
            this.pressedJumpTimer.unset();
        else
            // keep pressedJumpTimer active while holding W for continuous jumping
            this.pressedJumpTimer.set(.3);
        this.wasHoldingJump = this.holdingJump;

        // controls
        this.holdingShoot  = !this.playerIndex && (mouseIsDown(0) || keyIsDown(90) || keyIsDown(32)) || gamepadIsDown(2, this.playerIndex);
        this.pressingThrow = !this.playerIndex && (mouseIsDown(2) || keyIsDown(67)) || gamepadIsDown(1, this.playerIndex);
        this.pressedDodge  = !this.playerIndex && (mouseIsDown(1) || keyIsDown(16)) || gamepadIsDown(3, this.playerIndex); // Shift key for roll
        this.pressedMelee  = !this.playerIndex && keyWasPressed(69) || gamepadWasPressed(4, this.playerIndex); // E key for melee

        // aiming with arrow keys - Up/Down for vertical aim
        if (!this.playerIndex)
        {
            const aimSpeed = 0.08; // radians per frame
            const maxAimAngle = PI/2; // 90 degrees up/down
            
            // Invert controls when facing left (mirrored)
            const aimDirection = this.mirror ? -1 : 1;
            
            if (keyIsDown(38)) // Up Arrow - aim up
            {
                this.aimAngle += aimSpeed * aimDirection;
                // Clamp to max angle limits regardless of direction
                this.aimAngle = clamp(this.aimAngle, maxAimAngle, -maxAimAngle);
            }
            if (keyIsDown(40)) // Down Arrow - aim down
            {
                this.aimAngle -= aimSpeed * aimDirection;
                // Clamp to max angle limits regardless of direction
                this.aimAngle = clamp(this.aimAngle, maxAimAngle, -maxAimAngle);
            }
            
            // Decay aim angle back to horizontal when not aiming
            if (!keyIsDown(38) && !keyIsDown(40))
                this.aimAngle *= 0.95; // smooth decay
        }

        super.update();

        // update walk sound
        this.walkSoundTime += abs(this.velocity.x);
        if (abs(this.velocity.x) > .01 && this.groundTimer.active() && !this.dodgeTimer.active())
        {
            if (this.walkSoundTime > 1)
            {
                this.walkSoundTime = 0;
                playSound(sound_walk, this.pos);
            }
        }
        else
            this.walkSoundTime = .5;

        if (players.length > 1 && !this.isDead())
        {
            // move to other player if offscreen and multiplayer
            if (!isOverlapping(this.pos, this.size, cameraPos, gameplayWindowSize))
            {
                // move to location of another player if not falling off a cliff
                if (tileCollisionRaycast(this.pos,vec2(this.pos.x,0)))
                {
                    for(const player of players)
                        if (player && player != this && !player.isDead())
                        {
                            this.pos = player.pos.copy();
                            this.velocity = vec2();
                            playSound(sound_jump, this.pos);
                        }
                }
                else
                    this.kill();
            }
        }
    }
}