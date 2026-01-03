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

        // Note: Headwear rendering moved to appRenderPost() to render after WebGL batch copy
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

        // KeyItems are harmless - don't cause damage
        if (o.isKeyItem)
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
const type_spider = 9;
const type_spiderling = 10;
const type_barrister = 11;
const type_solicitor = 12;
const type_count  = 13;

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
        
        // Foe is persistent - corpse won't disappear when shot
        this.persistent = 1;
        
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

class Barrister extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be barrister
        this.type = type_barrister;
        
        // Barrister is 2x normal size
        this.size = this.size.scale(this.sizeScale = 2.0);
        this.health = this.healthMax = 50; // Same health as spider
        this.maxSpeed = maxCharacterSpeed * 3.5; // Very fast - 3.5x faster than normal
        
        // Unique sprite - use tile 24 from tiles2.png (16x16 pixels)
        this.bodyTile = 24;
        this.tileSize = vec2(16); // 16x16 pixel sprite
        this.headTile = 2; // Use same head tile as normal enemies
        
        // Reddish/orange color to distinguish from other enemies
        this.color = new Color(1, 0.4, 0);
        this.eyeColor = new Color(1, 0, 0);
        
        // Very long vision range - 50 tiles
        this.maxVisionRange = 50;
        
        // Replace weapon with barrister weapon (shoots blue venom)
        this.weapon && this.weapon.destroy();
        new BarristerWeapon(this.pos, this);
        
        // Blue liquid trail particles
        this.liquidTrailParticles = [];
        this.maxTrailParticles = 40; // Maximum number of liquid particles
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        this.trailTimer.set(0.05); // Spawn particles more frequently for smoother liquid
    }
    
    update()
    {
        // Bypass levelWarmup - barrister acts immediately
        if (!aiEnable || this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            Character.prototype.update.call(this);
            return;
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

            // Aggressive wall climbing - barrister climbs walls
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            if (this.weapon)
                this.weapon.localAngle *= .8;
            if (this.reactionTimer.active())
            {
                // just saw player for first time, act surprised
                this.moveInput.x = 0;
            }
            else if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#00f');
                    
                if (!this.dodgeTimer.active())
                {
                    const delta = this.sawPlayerPos.subtract(this.pos);
                    const dist = delta.length();
                    const playerDirection = sign(delta.x);
                    
                    // Very aggressive - always move towards player
                    this.moveInput.x = playerDirection;
                    
                    // Aggressive ladder climbing - always try to climb towards player
                    this.moveInput.y = clamp(delta.y, .8, -.8);

                    // Jump frequently to close distance
                    if (this.groundTimer.active() && dist > 2 && rand() < 0.15)
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.15));
                    }
                    
                    // Face player
                    if (rand()<.05)
                        this.facePlayerTimer.set(rand(2,.5));
                }
            }
            else
            {
                // was fighting but lost player - still aggressive
                debugAI && debugRect(this.pos, this.size, '#00f');

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
            // Very aggressive - always seek player, no idle behavior
            // Try to find player by moving around
            if (rand()<.01)
                this.moveInput.x = randSign();
            if (rand()<.005 && this.groundTimer.active())
                this.pressedJumpTimer.set(.1);
        }

        this.holdingShoot = 0; // No shooting for barrister (weapon handles it)
        this.holdingJump = this.holdJumpTimer.active();

        // Call Character.update() directly (not Enemy.update() to avoid unwanted AI)
        Character.prototype.update.call(this);
        
        // Override velocity clamping to allow faster movement
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;

        // override default mirror to face player
        if (this.facePlayerTimer.active() && !this.dodgeTimer.active() && !this.reactionTimer.active())
            this.mirror = this.sawPlayerPos.x < this.pos.x;
        
        // Update liquid trail particles
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.05); // Reset timer
            
            // Ensure lastTrailPos is valid Vector2
            if (!this.lastTrailPos || this.lastTrailPos.x == undefined || this.lastTrailPos.y == undefined)
            {
                this.lastTrailPos = this.pos.copy();
            }
            
            // Ensure pos is valid before subtracting
            if (this.pos && this.pos.x != undefined && this.pos.y != undefined)
            {
                const distMoved = this.pos.subtract(this.lastTrailPos).length();
                if (distMoved > 0.05) // Spawn particles more frequently
                {
                    // Spawn new liquid particle at barrister position
                    const particle = {
                        x: this.pos.x,
                        y: this.pos.y,
                        px: this.pos.x, // Previous position
                        py: this.pos.y,
                        vx: 0,
                        vy: 0,
                        radius: this.sizeScale * 0.15,
                        lifetime: 3.0, // How long particle lives
                        spawnTime: time,
                        alpha: 0.8
                    };
                    
                    this.liquidTrailParticles.push(particle);
                    
                    // Remove oldest particles if over limit
                    if (this.liquidTrailParticles.length > this.maxTrailParticles)
                    {
                        this.liquidTrailParticles.shift();
                    }
                    
                    this.lastTrailPos = this.pos.copy();
                }
            }
        }
        
        // Update liquid trail particle physics
        const spacing = this.sizeScale * 0.2; // Tighter interaction distance
        const limit = spacing * 0.66; // Boundary limit
        
        for(let i = 0; i < this.liquidTrailParticles.length; i++)
        {
            const p = this.liquidTrailParticles[i];
            
            // Check lifetime
            const age = time - p.spawnTime;
            if (age > p.lifetime)
            {
                this.liquidTrailParticles.splice(i, 1);
                i--;
                continue;
            }
            
            // Calculate velocity from position delta
            p.vx = p.x - p.px;
            p.vy = p.y - p.py;
            
            // Apply gravity
            p.vx += 0;
            p.vy += 0.01; // Small downward gravity
            
            // Apply damping
            p.vx *= 0.95;
            p.vy *= 0.95;
            
            // Store previous position
            p.px = p.x;
            p.py = p.y;
            
            // Update position - scale down velocity to make particles slower
            const speedScale = 0.5; // Make particles move at half speed
            p.x += p.vx * speedScale;
            p.y += p.vy * speedScale;
            
            // Particle interactions - find nearby particles
            let force = 0;
            let force_b = 0;
            const close = [];
            
            for(let j = 0; j < this.liquidTrailParticles.length; j++)
            {
                if (i === j) continue;
                
                const neighbor = this.liquidTrailParticles[j];
                const dx = neighbor.x - p.x;
                const dy = neighbor.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < spacing && distance > 0.01)
                {
                    const m = 1 - (distance / spacing);
                    force += m * m;
                    force_b += (m * m * m) / 2;
                    
                    neighbor.m = m;
                    neighbor.dfx = (dx / distance) * m;
                    neighbor.dfy = (dy / distance) * m;
                    close.push(neighbor);
                }
            }
            
            // Apply interaction forces
            force = (force - 3) * 0.3; // Adjust force strength
            
            for(let k = 0; k < close.length; k++)
            {
                const neighbor = close[k];
                const press = force + force_b * neighbor.m;
                
                const dx = neighbor.dfx * press * 0.3;
                const dy = neighbor.dfy * press * 0.3;
                
                neighbor.x += dx;
                neighbor.y += dy;
                p.x -= dx;
                p.y -= dy;
            }
            
            // Boundary constraints (keep particles tight around barrister)
            const distFromBarrister = Math.sqrt((p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2);
            const maxDistance = this.sizeScale * 0.8; // Much tighter - only 0.8x size away
            if (distFromBarrister > maxDistance)
            {
                // Stronger pull back towards barrister
                const pullStrength = 0.3; // Increased from 0.1 for tighter control
                const pullX = (this.pos.x - p.x) * pullStrength;
                const pullY = (this.pos.y - p.y) * pullStrength;
                p.x += pullX;
                p.y += pullY;
            }
            
            // Fade alpha over lifetime
            p.alpha = 0.8 * (1 - age / p.lifetime);
        }
    }

    alert(playerPos, resetSawPlayer)
    {
        if (resetSawPlayer || !this.sawPlayerTimer.isSet())
        {
            if (!this.reactionTimer.isSet())
            {
                this.reactionTimer.set(rand(.2,.1)); // Very fast reaction
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .5) // Very likely to jump when alerted
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
        const eyeColor = this.eyeColor.scale(this.burnColorPercent(),1);
        const headColor = this.team == team_enemy ? new Color() : color; // enemies use neutral color for head

        // melee animation - head moves back
        const meleeHeadOffset = this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;

        const bodyPos = this.pos.add(vec2(0,-.1+.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        // Draw blue liquid trail particles - actual liquid physics
        if (this.liquidTrailParticles.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.liquidTrailParticles.length; i++)
            {
                const p = this.liquidTrailParticles[i];
                
                // Clamp alpha to valid range (0-1)
                const clampedAlpha = Math.max(0, Math.min(1, p.alpha));
                
                // Draw particle as blue liquid blob with radial gradient effect
                const particleColor = new Color(0, 0.5, 1, clampedAlpha);
                const particleSize = p.radius;
                
                // Draw main particle blob
                drawTile(vec2(p.x, p.y), vec2(particleSize), -1, undefined, particleColor, 0, false, additive);
                
                // Draw outer glow for liquid effect
                const glowAlpha = Math.max(0, Math.min(1, clampedAlpha * 0.4));
                const glowColor = new Color(0, 0.7, 1, glowAlpha);
                drawTile(vec2(p.x, p.y), vec2(particleSize * 1.3), -1, undefined, glowColor, 0, false, additive);
            }
            setBlendMode(0);
        }
        
        // Draw body using drawTile2 from tiles2.png (16x16 sprite)
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        
        // Draw head (like normal enemies)
        drawTile(this.pos.add(vec2(this.getMirrorSign(.05) + meleeHeadOffset * this.getMirrorSign(),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2),this.headTile,vec2(8), headColor,this.angle,this.mirror, additive);

        // Draw eyes on head (like normal enemies)
        if (!this.isDead())
        {
            const blinkScale = this.canBlink ? this.isDead() ? .3: .5 + .5*Math.cos(this.blinkTimer.getPercent()*PI*2) : 1;
            drawTile(this.pos.add(vec2(this.getMirrorSign(.05),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2, blinkScale*sizeScale/2),this.headTile+1,vec2(8), eyeColor, this.angle, this.mirror, this.additiveColor);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class Solicitor extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be solicitor
        this.type = type_solicitor;
        
        // Solicitor is 2x normal size
        this.size = this.size.scale(this.sizeScale = 2.0);
        this.health = this.healthMax = 50; // Same health as barrister
        this.maxSpeed = maxCharacterSpeed * 3.5; // Very fast - 3.5x faster than normal
        
        // Unique sprite - use tiles 25-26 from tiles2.png (16x16 pixels) - next 2 tiles after barrister
        this.bodyTile = 25;
        this.tileSize = vec2(16); // 16x16 pixel sprite
        this.headTile = 2; // Use same head tile as normal enemies
        
        // Yellow color to distinguish from other enemies
        this.color = new Color(1, 1, 0);
        this.eyeColor = new Color(1, 1, 0);
        
        // Very long vision range - 50 tiles
        this.maxVisionRange = 50;
        
        // Replace weapon with solicitor weapon (shoots yellow venom, visible gun)
        this.weapon && this.weapon.destroy();
        new SolicitorWeapon(this.pos, this);
        
        // Yellow liquid trail particles (very slow, subtle)
        this.liquidTrailParticles = [];
        this.maxTrailParticles = 40; // Maximum number of liquid particles
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        this.trailTimer.set(0.05); // Spawn particles more frequently for smoother liquid
    }
    
    update()
    {
        // Bypass levelWarmup - solicitor acts immediately
        if (!aiEnable || this.isDead() || !this.inUpdateWindow())
        {
            if (this.weapon)
                this.weapon.triggerIsDown = 0;
            Character.prototype.update.call(this);
            return;
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

            // Aggressive wall climbing - solicitor climbs walls
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            if (this.weapon)
                this.weapon.localAngle *= .8;
            if (this.reactionTimer.active())
            {
                // just saw player for first time, act surprised
                this.moveInput.x = 0;
            }
            else if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#00f');
                    
                if (!this.dodgeTimer.active())
                {
                    const delta = this.sawPlayerPos.subtract(this.pos);
                    const dist = delta.length();
                    const playerDirection = sign(delta.x);
                    
                    // Very aggressive - always move towards player
                    this.moveInput.x = playerDirection;
                    
                    // Aggressive ladder climbing - always try to climb towards player
                    this.moveInput.y = clamp(delta.y, .8, -.8);

                    // Jump frequently to close distance
                    if (this.groundTimer.active() && dist > 2 && rand() < 0.15)
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.15));
                    }
                    
                    // Face player
                    if (rand()<.05)
                        this.facePlayerTimer.set(rand(2,.5));
                }
            }
            else
            {
                // was fighting but lost player - still aggressive
                debugAI && debugRect(this.pos, this.size, '#00f');

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
            // Very aggressive - always seek player, no idle behavior
            // Try to find player by moving around
            if (rand()<.01)
                this.moveInput.x = randSign();
            if (rand()<.005 && this.groundTimer.active())
                this.pressedJumpTimer.set(.1);
        }

        this.holdingShoot = 0; // No shooting for solicitor (weapon handles it)
        this.holdingJump = this.holdJumpTimer.active();

        // Call Character.update() directly (not Enemy.update() to avoid unwanted AI)
        Character.prototype.update.call(this);
        
        // Override velocity clamping to allow faster movement
        if (abs(this.velocity.x) > this.maxSpeed)
            this.velocity.x = sign(this.velocity.x) * this.maxSpeed;

        // override default mirror to face player
        if (this.facePlayerTimer.active() && !this.dodgeTimer.active() && !this.reactionTimer.active())
            this.mirror = this.sawPlayerPos.x < this.pos.x;
        
        // Update liquid trail particles (very slow, subtle)
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.05); // Reset timer
            
            // Ensure lastTrailPos is valid Vector2
            if (!this.lastTrailPos || this.lastTrailPos.x == undefined || this.lastTrailPos.y == undefined)
            {
                this.lastTrailPos = this.pos.copy();
            }
            
            // Ensure pos is valid before subtracting
            if (this.pos && this.pos.x != undefined && this.pos.y != undefined)
            {
                const distMoved = this.pos.subtract(this.lastTrailPos).length();
                if (distMoved > 0.05) // Spawn particles more frequently
                {
                    // Spawn new liquid particle at solicitor position
                    const particle = {
                        x: this.pos.x,
                        y: this.pos.y,
                        px: this.pos.x, // Previous position
                        py: this.pos.y,
                        vx: 0,
                        vy: 0,
                        radius: this.sizeScale * 0.15,
                        lifetime: 5.0, // Longer lifetime for slower particles
                        spawnTime: time,
                        alpha: 0.6 // More subtle
                    };
                    
                    this.liquidTrailParticles.push(particle);
                    
                    // Remove oldest particles if over limit
                    if (this.liquidTrailParticles.length > this.maxTrailParticles)
                    {
                        this.liquidTrailParticles.shift();
                    }
                    
                    this.lastTrailPos = this.pos.copy();
                }
            }
        }
        
        // Update liquid trail particle physics (very slow movement)
        const spacing = this.sizeScale * 0.2; // Tighter interaction distance
        const limit = spacing * 0.66; // Boundary limit
        
        for(let i = 0; i < this.liquidTrailParticles.length; i++)
        {
            const p = this.liquidTrailParticles[i];
            
            // Check lifetime
            const age = time - p.spawnTime;
            if (age > p.lifetime)
            {
                this.liquidTrailParticles.splice(i, 1);
                i--;
                continue;
            }
            
            // Calculate velocity from position delta
            p.vx = p.x - p.px;
            p.vy = p.y - p.py;
            
            // Apply gravity (very minimal)
            p.vx += 0;
            p.vy += 0.002; // Much smaller downward gravity
            
            // Apply damping (stronger damping for slower movement)
            p.vx *= 0.90; // Stronger damping
            p.vy *= 0.90;
            
            // Store previous position
            p.px = p.x;
            p.py = p.y;
            
            // Update position - scale down velocity significantly to make particles very slow
            const speedScale = 0.1; // Much slower - 0.1x speed (even slower than barrister's 0.5x)
            p.x += p.vx * speedScale;
            p.y += p.vy * speedScale;
            
            // Particle interactions - find nearby particles
            let force = 0;
            let force_b = 0;
            const close = [];
            
            for(let j = 0; j < this.liquidTrailParticles.length; j++)
            {
                if (i === j) continue;
                
                const neighbor = this.liquidTrailParticles[j];
                const dx = neighbor.x - p.x;
                const dy = neighbor.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < spacing && distance > 0.01)
                {
                    const m = 1 - (distance / spacing);
                    force += m * m;
                    force_b += (m * m * m) / 2;
                    
                    neighbor.m = m;
                    neighbor.dfx = (dx / distance) * m;
                    neighbor.dfy = (dy / distance) * m;
                    close.push(neighbor);
                }
            }
            
            // Apply interaction forces
            force = (force - 3) * 0.3; // Adjust force strength
            
            for(let k = 0; k < close.length; k++)
            {
                const neighbor = close[k];
                const press = force + force_b * neighbor.m;
                
                const dx = neighbor.dfx * press * 0.3;
                const dy = neighbor.dfy * press * 0.3;
                
                neighbor.x += dx;
                neighbor.y += dy;
                p.x -= dx;
                p.y -= dy;
            }
            
            // Boundary constraints (keep particles tight around solicitor)
            const distFromSolicitor = Math.sqrt((p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2);
            const maxDistance = this.sizeScale * 0.8; // Much tighter - only 0.8x size away
            if (distFromSolicitor > maxDistance)
            {
                // Stronger pull back towards solicitor
                const pullStrength = 0.3; // Increased from 0.1 for tighter control
                const pullX = (this.pos.x - p.x) * pullStrength;
                const pullY = (this.pos.y - p.y) * pullStrength;
                p.x += pullX;
                p.y += pullY;
            }
            
            // Fade alpha over lifetime
            p.alpha = 0.6 * (1 - age / p.lifetime);
        }
    }

    alert(playerPos, resetSawPlayer)
    {
        if (resetSawPlayer || !this.sawPlayerTimer.isSet())
        {
            if (!this.reactionTimer.isSet())
            {
                this.reactionTimer.set(rand(.2,.1)); // Very fast reaction
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .5) // Very likely to jump when alerted
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
        // For Solicitor: tile 26 is standing, tile 27 is jump
        // When on ground/walking: use bodyTile+1 (26) for standing, bodyTile+2 (27) for walking frame 2
        // When jumping: use bodyTile+2 (27) for jump sprite
        this.tileIndex = this.isDead() ? this.bodyTile+1 : this.climbingLadder || this.groundTimer.active() ? (this.bodyTile+1) + this.walkCyclePercent|0 : this.bodyTile+2;

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
        
        // Draw yellow liquid trail particles - actual liquid physics
        if (this.liquidTrailParticles.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.liquidTrailParticles.length; i++)
            {
                const p = this.liquidTrailParticles[i];
                
                // Clamp alpha to valid range (0-1)
                const clampedAlpha = Math.max(0, Math.min(1, p.alpha));
                
                // Draw particle as yellow liquid blob with radial gradient effect
                const particleColor = new Color(1, 1, 0, clampedAlpha);
                const particleSize = p.radius;
                
                // Draw main particle blob
                drawTile(vec2(p.x, p.y), vec2(particleSize), -1, undefined, particleColor, 0, false, additive);
                
                // Draw outer glow for liquid effect
                const glowAlpha = Math.max(0, Math.min(1, clampedAlpha * 0.4));
                const glowColor = new Color(1, 0.9, 0.3, glowAlpha);
                drawTile(vec2(p.x, p.y), vec2(particleSize * 1.3), -1, undefined, glowColor, 0, false, additive);
            }
            setBlendMode(0);
        }
        
        // Draw body using drawTile2 from tiles2.png (16x16 sprite)
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        
        // Draw head (like normal enemies)
        drawTile(this.pos.add(vec2(this.getMirrorSign(.05) + meleeHeadOffset * this.getMirrorSign(),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2),this.headTile,vec2(8), headColor,this.angle,this.mirror, additive);

        // Draw eyes on head (like normal enemies)
        if (!this.isDead())
        {
            const blinkScale = this.canBlink ? this.isDead() ? .3: .5 + .5*Math.cos(this.blinkTimer.getPercent()*PI*2) : 1;
            drawTile(this.pos.add(vec2(this.getMirrorSign(.05),.46).scale(sizeScale).rotate(-this.angle)),vec2(sizeScale/2, blinkScale*sizeScale/2),this.headTile+1,vec2(8), eyeColor, this.angle, this.mirror, this.additiveColor);
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

    kill(damagingObject)
    {
        // Call parent kill first
        const result = super.kill(damagingObject);
        
        // Make dead malefactors persistent so they remain visible
        if (this.isDead())
        {
            this.persistent = 1;
        }
        
        return result;
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
        // Allow persistent dead malefactors to render even when far away
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize) && !(this.persistent && this.isDead()))
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

class Spider extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be spider
        this.type = type_spider;
        
        // Spider is 3x size
        this.size = this.size.scale(this.sizeScale = 3.0);
        this.health = this.healthMax = 50; // Same health as malefactor
        this.maxSpeed = maxCharacterSpeed * 3.5; // Very fast - 3.5x faster than normal
        this.jumpPower = 0.25; // Good jump power
        this.noFallDamage = 1; // Flag to prevent fall damage
        this.immuneToWarmupDamage = 1; // Prevent destruction during warmup
        
        // Spider sprite - use tile 22 from tiles2.png (user can adjust if needed)
        this.bodyTile = 22;
        this.headTile = 2; // Use same head tile as normal enemies
        
        // Spider color - red
        this.color = new Color(0.8, 0.1, 0.1); // Red body
        this.eyeColor = new Color(1, 0, 0); // Red eyes
        
        // Liquid trail particles
        this.liquidTrailParticles = [];
        this.maxTrailParticles = 40; // Maximum number of liquid particles
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        this.trailTimer.set(0.05); // Spawn particles more frequently for smoother liquid
        
        // Replace weapon with spider weapon (shoots red venom)
        this.weapon && this.weapon.destroy();
        new SpiderWeapon(this.pos, this);
        
        // Enhanced vision range for aggressive chasing
        this.maxVisionRange = 18;
        
        // Spider is persistent - corpse won't disappear when shot
        this.persistent = 1;
        
        // Leg system - 16 legs with grid-based tile tracking (discrete stepping)
        this.pawRadius = 0.5 * this.sizeScale; // Distance from body center to paw placement
        this.pawHeight = 0.3 * this.sizeScale; // Height of leg curve
        this.bodyHeight = 0.1 * this.sizeScale; // Body offset from ground
        
        // 16 paws - each stores its current tile position (grid coordinates)
        this.paws = [];
        const bodyTileX = (this.pos.x) | 0;
        const bodyTileY = (this.pos.y) | 0;
        
        for(let i = 0; i < 16; i++)
        {
            const angle = (i / 16) * PI * 2;
            const offsetX = Math.sin(angle) * this.pawRadius;
            const offsetY = Math.cos(angle) * this.pawRadius;
            
            // Find ground tile at this position
            let pawTileX = bodyTileX + (offsetX) | 0;
            let pawTileY = bodyTileY;
            
            // Check tiles below to find ground
            let foundGround = false;
            for(let checkY = bodyTileY; checkY < bodyTileY + 5; checkY++)
            {
                if (getTileCollisionData(vec2(pawTileX, checkY)) > 0)
                {
                    pawTileY = checkY;
                    foundGround = true;
                    break;
                }
            }
            
            // Always create paw, even if no ground found (will use fallback position)
            if (!foundGround)
            {
                pawTileY = bodyTileY + 2; // Fallback: place below body
            }
            
            this.paws.push({
                tileX: pawTileX, // Grid X position
                tileY: pawTileY, // Grid Y position (top of tile)
                worldPos: vec2(pawTileX + 0.5, pawTileY), // World position (center of tile top)
                needsUpdate: false
            });
        }
        
        // Update tracking
        this.lastBodyTileX = bodyTileX;
        this.lastBodyTileY = bodyTileY;
        this.pawUpdateCounter = 0; // Update paws every N frames
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

        // Update leg system - grid-based discrete stepping (much simpler and faster)
        const bodyTileX = (this.pos.x) | 0;
        const bodyTileY = (this.pos.y) | 0;
        
        // Only update paws occasionally or when spider moves to new tile
        const bodyMoved = (bodyTileX != this.lastBodyTileX || bodyTileY != this.lastBodyTileY);
        this.pawUpdateCounter++;
        const shouldUpdatePaws = bodyMoved || (this.pawUpdateCounter % 5 == 0); // Update every 5 frames or when body moves
        
        if (shouldUpdatePaws)
        {
            // Calculate body position
            const bodyPos = this.pos.add(vec2(0, -this.bodyHeight + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(this.sizeScale));
            
            // Update each paw - discrete tile stepping
            for(let i = 0; i < this.paws.length; i++)
            {
                const paw = this.paws[i];
                
            // Calculate angle for this paw (evenly spaced around body)
            const angle = (i / 16) * PI * 2;
                
                // Calculate target tile position around spider body
                const targetOffsetX = Math.sin(angle) * this.pawRadius;
                const targetOffsetY = Math.cos(angle) * this.pawRadius;
                const targetTileX = bodyTileX + (targetOffsetX) | 0;
                
                // Find ground tile at target X position (check tiles below)
                let targetTileY = bodyTileY;
                let foundGround = false;
                
                for(let checkY = bodyTileY; checkY < bodyTileY + 4 && !foundGround; checkY++)
                {
                    if (getTileCollisionData(vec2(targetTileX, checkY)) > 0)
                    {
                        targetTileY = checkY;
                        foundGround = true;
                    }
                }
                
                // Only update paw if target tile is different and ground was found
                if (foundGround && (paw.tileX != targetTileX || paw.tileY != targetTileY))
                {
                    // Check distance - only step if far enough (prevents jitter)
                    const distX = Math.abs(paw.tileX - targetTileX);
                    const distY = Math.abs(paw.tileY - targetTileY);
                    
                    if (distX > 0 || distY > 1) // Step if moved horizontally or more than 1 tile vertically
                    {
                        paw.tileX = targetTileX;
                        paw.tileY = targetTileY;
                        paw.worldPos = vec2(targetTileX + 0.5, targetTileY); // Snap to tile top surface
                    }
                }
                // If no ground found, keep paw on current tile (don't move it)
            }
            
            this.lastBodyTileX = bodyTileX;
            this.lastBodyTileY = bodyTileY;
        }
        
        // Update liquid trail particles
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.05); // Reset timer
            
            // Ensure lastTrailPos is valid Vector2
            if (!this.lastTrailPos || this.lastTrailPos.x == undefined || this.lastTrailPos.y == undefined)
            {
                this.lastTrailPos = this.pos.copy();
            }
            
            // Ensure pos is valid before subtracting
            if (this.pos && this.pos.x != undefined && this.pos.y != undefined)
            {
                const distMoved = this.pos.subtract(this.lastTrailPos).length();
                if (distMoved > 0.05) // Spawn particles more frequently
                {
                    // Spawn new liquid particle at spider position
                    const particle = {
                        x: this.pos.x,
                        y: this.pos.y,
                        px: this.pos.x, // Previous position
                        py: this.pos.y,
                        vx: 0,
                        vy: 0,
                        radius: this.sizeScale * 0.15,
                        lifetime: 3.0, // How long particle lives
                        spawnTime: time,
                        alpha: 0.8
                    };
                    
                    this.liquidTrailParticles.push(particle);
                    
                    // Remove oldest particles if over limit
                    if (this.liquidTrailParticles.length > this.maxTrailParticles)
                    {
                        this.liquidTrailParticles.shift();
                    }
                    
                    this.lastTrailPos = this.pos.copy();
                }
            }
        }
        
        // Update liquid trail particle physics
        const spacing = this.sizeScale * 0.3; // Interaction distance
        const limit = spacing * 0.66; // Boundary limit
        
        for(let i = 0; i < this.liquidTrailParticles.length; i++)
        {
            const p = this.liquidTrailParticles[i];
            
            // Check lifetime
            const age = time - p.spawnTime;
            if (age > p.lifetime)
            {
                this.liquidTrailParticles.splice(i, 1);
                i--;
                continue;
            }
            
            // Calculate velocity from position delta
            p.vx = p.x - p.px;
            p.vy = p.y - p.py;
            
            // Apply gravity
            p.vx += 0;
            p.vy += 0.01; // Small downward gravity
            
            // Apply damping
            p.vx *= 0.95;
            p.vy *= 0.95;
            
            // Store previous position
            p.px = p.x;
            p.py = p.y;
            
            // Update position
            p.x += p.vx;
            p.y += p.vy;
            
            // Particle interactions - find nearby particles
            let force = 0;
            let force_b = 0;
            const close = [];
            
            for(let j = 0; j < this.liquidTrailParticles.length; j++)
            {
                if (i === j) continue;
                
                const neighbor = this.liquidTrailParticles[j];
                const dx = neighbor.x - p.x;
                const dy = neighbor.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < spacing && distance > 0.01)
                {
                    const m = 1 - (distance / spacing);
                    force += m * m;
                    force_b += (m * m * m) / 2;
                    
                    neighbor.m = m;
                    neighbor.dfx = (dx / distance) * m;
                    neighbor.dfy = (dy / distance) * m;
                    close.push(neighbor);
                }
            }
            
            // Apply interaction forces
            force = (force - 3) * 0.3; // Adjust force strength
            
            for(let k = 0; k < close.length; k++)
            {
                const neighbor = close[k];
                const press = force + force_b * neighbor.m;
                
                const dx = neighbor.dfx * press * 0.3;
                const dy = neighbor.dfy * press * 0.3;
                
                neighbor.x += dx;
                neighbor.y += dy;
                p.x -= dx;
                p.y -= dy;
            }
            
            // Boundary constraints (keep particles near spider)
            const distFromSpider = Math.sqrt((p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2);
            if (distFromSpider > this.sizeScale * 2)
            {
                // Pull back towards spider
                const pullX = (this.pos.x - p.x) * 0.1;
                const pullY = (this.pos.y - p.y) * 0.1;
                p.x += pullX;
                p.y += pullY;
            }
            
            // Fade alpha over lifetime
            p.alpha = 0.8 * (1 - age / p.lifetime);
        }

        // Spider always chases player from start - highly aggressive
        // Check for players every frame (no sight check delay)
        for(const player of players)
        {
            if (player && !player.isDead())
            {
                // Always alert on player - no range or line of sight check needed
                // Spider is highly aggressive and always knows where player is
                this.alert(player.pos);
                break;
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

            // Aggressive wall climbing - spider climbs walls very well
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            // Spider is highly aggressive - no reaction delay, always chase immediately
            if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#f00');
                    
                if (!this.dodgeTimer.active())
                {
                    // Very aggressive - always chase player
                    const delta = this.sawPlayerPos.subtract(this.pos);
                    const dist = delta.length();
                    
                    // Move towards player very aggressively
                    this.moveInput.x = sign(delta.x);
                    
                    // Jump frequently to close distance
                    if (this.groundTimer.active() && dist > 2 && rand() < 0.15)
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.15));
                    }
                    
                    // Face player
                    this.facePlayerTimer.set(rand(2,1));
                }
            }
        }
        else
        {
            // Spider always chases - no patrol behavior needed since it always sees player
            // But keep some movement in case player is temporarily out of range
            if (rand() < .01)
                this.moveInput.x = randSign();
            if (rand() < .005 && this.groundTimer.active())
                this.pressedJumpTimer.set(.1);
        }

        // Call Character.update() but prevent fall damage
        const healthBefore = this.health;
        const wasOnGroundBeforeUpdate = this.groundObject || this.climbingWall ? 1 : 0;
        
        this.maxFallVelocity = 0; // Reset before update
        Character.prototype.update.call(this);
        
        // If fall damage was applied, restore it
        if (this.noFallDamage && healthBefore > this.health && wasOnGroundBeforeUpdate == 0 && (this.groundObject || this.climbingWall))
        {
            this.health = healthBefore;
        }
        
        this.maxFallVelocity = 0;

        // Clamp velocity to max speed
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
                this.reactionTimer.set(rand(.2,.1)); // Very fast reaction
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .5) // Very likely to jump when alerted
                    this.pressedJumpTimer.set(.1);
            }
            this.sawPlayerPos = playerPos.copy();
            this.sawPlayerTimer.set();
        }
    }
    
    render()
    {
        // Allow persistent dead spiders to render even when far away
        if (!isOverlapping(this.pos, this.size, cameraPos, renderWindowSize) && !(this.persistent && this.isDead()))
            return;

        // set tile to use
        this.tileIndex = this.isDead() ? this.bodyTile : this.climbingLadder || this.groundTimer.active() ? this.bodyTile + 2*this.walkCyclePercent|0 : this.bodyTile+1;

        let additive = this.additiveColor.add(this.extraAdditiveColor);
        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(),1);
        const eyeColor = this.eyeColor.scale(this.burnColorPercent(),1);
        const headColor = this.team == team_enemy ? new Color() : color;

        // melee animation - head moves back
        const meleeHeadOffset = this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;

        const bodyPos = this.pos.add(vec2(0, -this.bodyHeight + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        // Draw liquid trail particles - actual liquid physics
        if (this.liquidTrailParticles.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.liquidTrailParticles.length; i++)
            {
                const p = this.liquidTrailParticles[i];
                
                // Clamp alpha to valid range (0-1)
                const clampedAlpha = Math.max(0, Math.min(1, p.alpha));
                
                // Draw particle as red liquid blob with radial gradient effect
                const particleColor = new Color(1, 0, 0, clampedAlpha);
                const particleSize = p.radius;
                
                // Draw main particle blob
                drawTile(vec2(p.x, p.y), vec2(particleSize), -1, undefined, particleColor, 0, false, additive);
                
                // Draw outer glow for liquid effect
                const glowAlpha = Math.max(0, Math.min(1, clampedAlpha * 0.4));
                const glowColor = new Color(1, 0.2, 0.2, glowAlpha);
                drawTile(vec2(p.x, p.y), vec2(particleSize * 1.3), -1, undefined, glowColor, 0, false, additive);
            }
            setBlendMode(0);
        }
        
        // Draw red translucent slime blobs around spider - much more liquidy
        setBlendMode(0);
        const translucentColor = new Color(1, 0, 0, 0.55); // More opaque red translucent
        const blobSize = sizeScale * 1.6; // Larger blobs
        // Draw many overlapping blobs for lots of liquidy slime
        drawTile(this.pos.add(vec2(-0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, -0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.2).scale(sizeScale)), vec2(blobSize * 0.95), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(-0.15, 0).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.15, 0).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        // Add more liquidy blobs
        drawTile(this.pos.add(vec2(-0.25, 0.05).scale(sizeScale)), vec2(blobSize * 0.85), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.25, 0.05).scale(sizeScale)), vec2(blobSize * 0.85), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.25).scale(sizeScale)), vec2(blobSize * 0.8), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(-0.1, -0.2).scale(sizeScale)), vec2(blobSize * 0.75), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.1, -0.2).scale(sizeScale)), vec2(blobSize * 0.75), -1, undefined, translucentColor);
        setBlendMode(0);
        
        // Draw spider legs - thick fuzzy quadratic curves (only when alive)
        if (!this.isDead())
        {
            const legColor = new Color(1, 0, 0); // Red legs
            const legThickness = sizeScale * 0.12; // Much thicker legs
            
            // Helper function to lerp
            const lerp = (a, b, t) => a + (b - a) * t;
            
            // Ensure paws array exists
            if (!this.paws || this.paws.length != 16)
            {
                this.paws = [];
                const bodyTileX = (this.pos.x) | 0;
                const bodyTileY = (this.pos.y) | 0;
                for(let i = 0; i < 16; i++)
                {
                    const angle = (i / 16) * PI * 2;
                    const offsetX = Math.sin(angle) * this.pawRadius;
                    const offsetY = Math.cos(angle) * this.pawRadius;
                    let pawTileX = bodyTileX + (offsetX) | 0;
                    let pawTileY = bodyTileY + 2;
                    this.paws.push({
                        tileX: pawTileX,
                        tileY: pawTileY,
                        worldPos: vec2(pawTileX + 0.5, pawTileY)
                    });
                }
            }
            
            // Draw each leg as a thick fuzzy quadratic curve
            for(let i = 0; i < 16; i++)
            {
                const paw = this.paws[i];
                if (!paw || !paw.worldPos) continue;
                
                // Body attachment point
                const bodyX = bodyPos.x;
                const bodyY = bodyPos.y;
                
                // Paw position (snapped to tile surface)
                const pawX = paw.worldPos.x;
                const pawY = paw.worldPos.y;
                
                // Calculate leg direction and perpendicular for consistent elbow bending
                const legDirX = pawX - bodyX;
                const legDirY = pawY - bodyY;
                const legAngle = Math.atan2(legDirY, legDirX);
                
                // Perpendicular direction (outward) for consistent elbow placement
                const perpAngle = legAngle + PI / 2;
                const elbowOffset = this.pawRadius * 0.3; // How far elbows bend outward
                
                // First elbow at 1/3 distance, raised and offset outward
                const elbow1X = lerp(bodyX, pawX, 1/3) + Math.cos(perpAngle) * elbowOffset;
                const elbow1Y = lerp(bodyY, pawY, 1/3) - this.pawHeight * 0.6;
                
                // Second elbow at 2/3 distance, raised and offset outward
                const elbow2X = lerp(bodyX, pawX, 2/3) + Math.cos(perpAngle) * elbowOffset;
                const elbow2Y = lerp(bodyY, pawY, 2/3) - this.pawHeight * 0.4;
                
                // Draw leg as fuzzy cubic bezier curve with 2 elbows - multiple overlapping lines for fuzzy effect
                const segmentCount = 16; // More segments for smoother fuzzy curve
                let prevX = bodyX;
                let prevY = bodyY;
                
                // Store curve points for hair rendering
                const curvePoints = [];
                
                // Draw multiple layers for fuzzy effect
                for(let fuzzyLayer = 0; fuzzyLayer < 7; fuzzyLayer++)
                {
                    const fuzzyOffset = (fuzzyLayer - 3) * legThickness * 0.12;
                    const fuzzyAlpha = 0.25 + (fuzzyLayer === 3 ? 0.5 : 0.08); // Center layer is brightest
                    const fuzzyColor = new Color(1, 0, 0, fuzzyAlpha);
                    
                    prevX = bodyX;
                    prevY = bodyY;
                    
                    for(let seg = 1; seg <= segmentCount; seg++)
                    {
                        const t = seg / segmentCount;
                        
                        // Cubic bezier curve: (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
                        const mt = 1 - t;
                        const mt2 = mt * mt;
                        const mt3 = mt2 * mt;
                        const t2 = t * t;
                        const t3 = t2 * t;
                        let x = mt3 * bodyX + 3 * mt2 * t * elbow1X + 3 * mt * t2 * elbow2X + t3 * pawX;
                        let y = mt3 * bodyY + 3 * mt2 * t * elbow1Y + 3 * mt * t2 * elbow2Y + t3 * pawY;
                        
                        // Add fuzzy offset perpendicular to leg direction
                        if (seg > 1)
                        {
                            const angle = Math.atan2(y - prevY, x - prevX) + PI/2;
                            x += Math.cos(angle) * fuzzyOffset;
                            y += Math.sin(angle) * fuzzyOffset;
                        }
                        
                        // Store point for hair rendering (only on center layer)
                        if (fuzzyLayer === 3)
                        {
                            curvePoints.push({x: x, y: y, angle: Math.atan2(y - prevY, x - prevX)});
                        }
                        
                        // Draw line segment with fuzzy color
                        drawLine(vec2(prevX, prevY), vec2(x, y), legThickness * (0.6 + fuzzyLayer * 0.08), fuzzyColor);
                        
                        prevX = x;
                        prevY = y;
                    }
                }
                
                // Draw hairy texture - small lines perpendicular to leg
                for(let hairIndex = 0; hairIndex < curvePoints.length; hairIndex += 2) // Every other point
                {
                    const point = curvePoints[hairIndex];
                    const hairAngle = point.angle + PI/2; // Perpendicular to leg
                    const hairLength = legThickness * 0.4; // Hair length
                    const hairCount = 3; // Multiple hairs per point
                    
                    // Deterministic pseudo-random based on leg and hair indices
                    const seed = (i * 17 + hairIndex * 7 + time * 0.1) % 1000;
                    const rand1 = (Math.sin(seed) * 0.5 + 0.5);
                    const rand2 = (Math.cos(seed * 1.3) * 0.5 + 0.5);
                    const rand3 = (Math.sin(seed * 2.1) * 0.5 + 0.5);
                    
                    for(let h = 0; h < hairCount; h++)
                    {
                        const hairOffset = (h - (hairCount-1)/2) * legThickness * 0.15;
                        const hairStartX = point.x + Math.cos(hairAngle) * hairOffset;
                        const hairStartY = point.y + Math.sin(hairAngle) * hairOffset;
                        
                        // Use deterministic pseudo-random for hair length variation
                        const lengthVariation = 0.7 + (h === 0 ? rand1 : h === 1 ? rand2 : rand3) * 0.3;
                        const hairEndX = hairStartX + Math.cos(hairAngle) * hairLength * lengthVariation;
                        const hairEndY = hairStartY + Math.sin(hairAngle) * hairLength * lengthVariation;
                        
                        // Deterministic hair color variation (slightly darker/lighter)
                        const hairBrightness = 0.7 + (h === 0 ? rand1 : h === 1 ? rand2 : rand3) * 0.3;
                        const hairColor = new Color(hairBrightness, 0, 0, 0.6);
                        
                        // Draw hair as thin line
                        drawLine(vec2(hairStartX, hairStartY), vec2(hairEndX, hairEndY), legThickness * 0.15, hairColor);
                    }
                }
                
                // Draw fuzzy foot at ground contact (on tile surface)
                const pawRadius = sizeScale * 0.12; // Larger foot
                for(let fuzzyFoot = 0; fuzzyFoot < 3; fuzzyFoot++)
                {
                    const footOffset = (fuzzyFoot - 1) * pawRadius * 0.2;
                    const footAlpha = 0.4 + (fuzzyFoot === 1 ? 0.4 : 0.1);
                    const footColor = new Color(1, 0, 0, footAlpha);
                    drawTile(paw.worldPos.add(vec2(footOffset, 0)), vec2(pawRadius * (0.8 + fuzzyFoot * 0.1)), -1, undefined, footColor, 0, false, additive);
                }
            }
        }
        
        // Draw spider body using drawTile2 for tiles2.png
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        
        // No head - spider is just a body with legs
    }
}

///////////////////////////////////////////////////////////////////////////////

class Spiderling extends Enemy
{
    constructor(pos) 
    { 
        super(pos);
        
        // Override type to be spiderling
        this.type = type_spiderling;
        
        // Spiderling is small (0.9x size - smaller than normal)
        this.size = this.size.scale(this.sizeScale = 0.9);
        this.health = this.healthMax = 6; // Same health as slimer
        this.maxSpeed = maxCharacterSpeed * 3.5; // Very fast - 3.5x faster than normal (same as spider)
        this.jumpPower = 0.25; // Good jump power
        this.noFallDamage = 1; // Flag to prevent fall damage
        this.immuneToWarmupDamage = 1; // Prevent destruction during warmup
        
        // Spiderling sprite - use tile 22 from tiles2.png (same as spider)
        this.bodyTile = 22;
        this.headTile = 2; // Use same head tile as normal enemies
        
        // Spiderling color - black
        this.color = new Color(0.1, 0.1, 0.1); // Black body
        this.eyeColor = new Color(0.2, 0.2, 0.2); // Dark eyes
        
        // Liquid trail particles
        this.liquidTrailParticles = [];
        this.maxTrailParticles = 40; // Maximum number of liquid particles
        this.lastTrailPos = this.pos.copy();
        this.trailTimer = new Timer;
        this.trailTimer.set(0.05); // Spawn particles more frequently for smoother liquid
        
        // Replace weapon with spiderling weapon (shoots black venom)
        this.weapon && this.weapon.destroy();
        new SpiderlingWeapon(this.pos, this);
        
        // Enhanced vision range for aggressive chasing
        this.maxVisionRange = 18;
        
        // Spiderling is persistent - corpse won't disappear when shot
        this.persistent = 1;
        
        // Leg system - 16 legs with grid-based tile tracking (discrete stepping)
        this.pawRadius = 0.5 * this.sizeScale; // Distance from body center to paw placement
        this.pawHeight = 0.3 * this.sizeScale; // Height of leg curve
        this.bodyHeight = 0.1 * this.sizeScale; // Body offset from ground
        
        // 16 paws - each stores its current tile position (grid coordinates)
        this.paws = [];
        const bodyTileX = (this.pos.x) | 0;
        const bodyTileY = (this.pos.y) | 0;
        
        for(let i = 0; i < 16; i++)
        {
            const angle = (i / 16) * PI * 2;
            const offsetX = Math.sin(angle) * this.pawRadius;
            const offsetY = Math.cos(angle) * this.pawRadius;
            
            // Find ground tile at this position
            let pawTileX = bodyTileX + (offsetX) | 0;
            let pawTileY = bodyTileY;
            
            // Check tiles below to find ground
            let foundGround = false;
            for(let checkY = bodyTileY; checkY < bodyTileY + 5; checkY++)
            {
                if (getTileCollisionData(vec2(pawTileX, checkY)) > 0)
                {
                    pawTileY = checkY;
                    foundGround = true;
                    break;
                }
            }
            
            // Always create paw, even if no ground found (will use fallback position)
            if (!foundGround)
            {
                pawTileY = bodyTileY + 2; // Fallback: place below body
            }
            
            this.paws.push({
                tileX: pawTileX, // Grid X position
                tileY: pawTileY, // Grid Y position (top of tile)
                worldPos: vec2(pawTileX + 0.5, pawTileY), // World position (center of tile top)
                needsUpdate: false
            });
        }
        
        // Update tracking
        this.lastBodyTileX = bodyTileX;
        this.lastBodyTileY = bodyTileY;
        this.pawUpdateCounter = 0; // Update paws every N frames
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

        // Update leg system - grid-based discrete stepping (much simpler and faster)
        const bodyTileX = (this.pos.x) | 0;
        const bodyTileY = (this.pos.y) | 0;
        
        // Only update paws occasionally or when spiderling moves to new tile
        const bodyMoved = (bodyTileX != this.lastBodyTileX || bodyTileY != this.lastBodyTileY);
        this.pawUpdateCounter++;
        const shouldUpdatePaws = bodyMoved || (this.pawUpdateCounter % 5 == 0); // Update every 5 frames or when body moves
        
        if (shouldUpdatePaws)
        {
            // Calculate body position
            const bodyPos = this.pos.add(vec2(0, -this.bodyHeight + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(this.sizeScale));
            
            // Update each paw - discrete tile stepping
            for(let i = 0; i < this.paws.length; i++)
            {
                const paw = this.paws[i];
                
            // Calculate angle for this paw (evenly spaced around body)
            const angle = (i / 16) * PI * 2;
                
                // Calculate target tile position around spiderling body
                const targetOffsetX = Math.sin(angle) * this.pawRadius;
                const targetOffsetY = Math.cos(angle) * this.pawRadius;
                const targetTileX = bodyTileX + (targetOffsetX) | 0;
                
                // Find ground tile at target X position (check tiles below)
                let targetTileY = bodyTileY;
                let foundGround = false;
                
                for(let checkY = bodyTileY; checkY < bodyTileY + 4 && !foundGround; checkY++)
                {
                    if (getTileCollisionData(vec2(targetTileX, checkY)) > 0)
                    {
                        targetTileY = checkY;
                        foundGround = true;
                    }
                }
                
                // Only update paw if target tile is different and ground was found
                if (foundGround && (paw.tileX != targetTileX || paw.tileY != targetTileY))
                {
                    // Check distance - only step if far enough (prevents jitter)
                    const distX = Math.abs(paw.tileX - targetTileX);
                    const distY = Math.abs(paw.tileY - targetTileY);
                    
                    if (distX > 0 || distY > 1) // Step if moved horizontally or more than 1 tile vertically
                    {
                        paw.tileX = targetTileX;
                        paw.tileY = targetTileY;
                        paw.worldPos = vec2(targetTileX + 0.5, targetTileY); // Snap to tile top surface
                    }
                }
                // If no ground found, keep paw on current tile (don't move it)
            }
            
            this.lastBodyTileX = bodyTileX;
            this.lastBodyTileY = bodyTileY;
        }
        
        // Update liquid trail particles
        if (this.trailTimer.elapsed())
        {
            this.trailTimer.set(0.05); // Reset timer
            
            // Ensure lastTrailPos is valid Vector2
            if (!this.lastTrailPos || this.lastTrailPos.x == undefined || this.lastTrailPos.y == undefined)
            {
                this.lastTrailPos = this.pos.copy();
            }
            
            // Ensure pos is valid before subtracting
            if (this.pos && this.pos.x != undefined && this.pos.y != undefined)
            {
                const distMoved = this.pos.subtract(this.lastTrailPos).length();
                if (distMoved > 0.05) // Spawn particles more frequently
                {
                    // Spawn new liquid particle at spiderling position
                    const particle = {
                        x: this.pos.x,
                        y: this.pos.y,
                        px: this.pos.x, // Previous position
                        py: this.pos.y,
                        vx: 0,
                        vy: 0,
                        radius: this.sizeScale * 0.15,
                        lifetime: 3.0, // How long particle lives
                        spawnTime: time,
                        alpha: 0.8
                    };
                    
                    this.liquidTrailParticles.push(particle);
                    
                    // Remove oldest particles if over limit
                    if (this.liquidTrailParticles.length > this.maxTrailParticles)
                    {
                        this.liquidTrailParticles.shift();
                    }
                    
                    this.lastTrailPos = this.pos.copy();
                }
            }
        }
        
        // Update liquid trail particle physics
        const spacing = this.sizeScale * 0.3; // Interaction distance
        const limit = spacing * 0.66; // Boundary limit
        
        for(let i = 0; i < this.liquidTrailParticles.length; i++)
        {
            const p = this.liquidTrailParticles[i];
            
            // Check lifetime
            const age = time - p.spawnTime;
            if (age > p.lifetime)
            {
                this.liquidTrailParticles.splice(i, 1);
                i--;
                continue;
            }
            
            // Calculate velocity from position delta
            p.vx = p.x - p.px;
            p.vy = p.y - p.py;
            
            // Apply gravity
            p.vx += 0;
            p.vy += 0.01; // Small downward gravity
            
            // Apply damping
            p.vx *= 0.95;
            p.vy *= 0.95;
            
            // Store previous position
            p.px = p.x;
            p.py = p.y;
            
            // Update position
            p.x += p.vx;
            p.y += p.vy;
            
            // Particle interactions - find nearby particles
            let force = 0;
            let force_b = 0;
            const close = [];
            
            for(let j = 0; j < this.liquidTrailParticles.length; j++)
            {
                if (i === j) continue;
                
                const neighbor = this.liquidTrailParticles[j];
                const dx = neighbor.x - p.x;
                const dy = neighbor.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < spacing && distance > 0.01)
                {
                    const m = 1 - (distance / spacing);
                    force += m * m;
                    force_b += (m * m * m) / 2;
                    
                    neighbor.m = m;
                    neighbor.dfx = (dx / distance) * m;
                    neighbor.dfy = (dy / distance) * m;
                    close.push(neighbor);
                }
            }
            
            // Apply interaction forces
            force = (force - 3) * 0.3; // Adjust force strength
            
            for(let k = 0; k < close.length; k++)
            {
                const neighbor = close[k];
                const press = force + force_b * neighbor.m;
                
                const dx = neighbor.dfx * press * 0.3;
                const dy = neighbor.dfy * press * 0.3;
                
                neighbor.x += dx;
                neighbor.y += dy;
                p.x -= dx;
                p.y -= dy;
            }
            
            // Boundary constraints (keep particles near spiderling)
            const distFromSpiderling = Math.sqrt((p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2);
            if (distFromSpiderling > this.sizeScale * 2)
            {
                // Pull back towards spiderling
                const pullX = (this.pos.x - p.x) * 0.1;
                const pullY = (this.pos.y - p.y) * 0.1;
                p.x += pullX;
                p.y += pullY;
            }
            
            // Fade alpha over lifetime
            p.alpha = 0.8 * (1 - age / p.lifetime);
        }

        // Spiderling always chases player from start - highly aggressive
        // Check for players every frame (no sight check delay)
        for(const player of players)
        {
            if (player && !player.isDead())
            {
                // Always alert on player - no range or line of sight check needed
                // Spiderling is highly aggressive and always knows where player is
                this.alert(player.pos);
                break;
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

            // Aggressive wall climbing - spiderling climbs walls very well
            if (this.moveInput.x && !this.velocity.x && this.velocity.y < 0)
            {
                this.velocity.y *=.8;
                this.climbingWall = 1;
                this.pressedJumpTimer.set(.1);
                this.holdJumpTimer.set(rand(.2));
            }
            
            const timeSinceSawPlayer = this.sawPlayerTimer.get();
            // Spiderling is highly aggressive - no reaction delay, always chase immediately
            if (timeSinceSawPlayer < 5)
            {
                debugAI && debugRect(this.pos, this.size, '#f00');
                    
                if (!this.dodgeTimer.active())
                {
                    // Very aggressive - always chase player
                    const delta = this.sawPlayerPos.subtract(this.pos);
                    const dist = delta.length();
                    
                    // Move towards player very aggressively
                    this.moveInput.x = sign(delta.x);
                    
                    // Jump frequently to close distance
                    if (this.groundTimer.active() && dist > 2 && rand() < 0.15)
                    {
                        this.pressedJumpTimer.set(.1);
                        this.holdJumpTimer.set(rand(.15));
                    }
                    
                    // Face player
                    this.facePlayerTimer.set(rand(2,1));
                }
            }
        }
        else
        {
            // Spiderling always chases - no patrol behavior needed since it always sees player
            // But keep some movement in case player is temporarily out of range
            if (rand() < .01)
                this.moveInput.x = randSign();
            if (rand() < .005 && this.groundTimer.active())
                this.pressedJumpTimer.set(.1);
        }

        // Call Character.update() but prevent fall damage
        const healthBefore = this.health;
        const wasOnGroundBeforeUpdate = this.groundObject || this.climbingWall ? 1 : 0;
        
        this.maxFallVelocity = 0; // Reset before update
        Character.prototype.update.call(this);
        
        // If fall damage was applied, restore it
        if (this.noFallDamage && healthBefore > this.health && wasOnGroundBeforeUpdate == 0 && (this.groundObject || this.climbingWall))
        {
            this.health = healthBefore;
        }
        
        this.maxFallVelocity = 0;

        // Clamp velocity to max speed
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
                this.reactionTimer.set(rand(.2,.1)); // Very fast reaction
                this.facePlayerTimer.set(rand(2,1));
                if (this.groundObject && rand() < .5) // Very likely to jump when alerted
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
        const sizeScale = this.sizeScale;
        const color = this.color.scale(this.burnColorPercent(),1);
        const eyeColor = this.eyeColor.scale(this.burnColorPercent(),1);
        const headColor = this.team == team_enemy ? new Color() : color;

        // melee animation - head moves back
        const meleeHeadOffset = this.meleeTimer.active() ? -.12 * Math.sin(this.meleeTimer.getPercent() * PI) : 0;

        const bodyPos = this.pos.add(vec2(0, -this.bodyHeight + 0.06*Math.sin(this.walkCyclePercent*PI)).scale(sizeScale));
        
        // Draw liquid trail particles - actual liquid physics
        if (this.liquidTrailParticles.length > 0)
        {
            setBlendMode(0); // Regular blend for translucent effect
            for(let i = 0; i < this.liquidTrailParticles.length; i++)
            {
                const p = this.liquidTrailParticles[i];
                
                // Clamp alpha to valid range (0-1)
                const clampedAlpha = Math.max(0, Math.min(1, p.alpha));
                
                // Draw particle as black liquid blob with radial gradient effect
                const particleColor = new Color(0.1, 0.1, 0.1, clampedAlpha);
                const particleSize = p.radius;
                
                // Draw main particle blob
                drawTile(vec2(p.x, p.y), vec2(particleSize), -1, undefined, particleColor, 0, false, additive);
                
                // Draw outer glow for liquid effect
                const glowAlpha = Math.max(0, Math.min(1, clampedAlpha * 0.4));
                const glowColor = new Color(0.2, 0.2, 0.2, glowAlpha);
                drawTile(vec2(p.x, p.y), vec2(particleSize * 1.3), -1, undefined, glowColor, 0, false, additive);
            }
            setBlendMode(0);
        }
        
        // Draw black translucent slime blobs around spiderling - much more liquidy
        setBlendMode(0);
        const translucentColor = new Color(0.1, 0.1, 0.1, 0.55); // More opaque black translucent
        const blobSize = sizeScale * 1.6; // Larger blobs
        // Draw many overlapping blobs for lots of liquidy slime
        drawTile(this.pos.add(vec2(-0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.2, 0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, -0.15).scale(sizeScale)), vec2(blobSize), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.2).scale(sizeScale)), vec2(blobSize * 0.95), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(-0.15, 0).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.15, 0).scale(sizeScale)), vec2(blobSize * 0.9), -1, undefined, translucentColor);
        // Add more liquidy blobs
        drawTile(this.pos.add(vec2(-0.25, 0.05).scale(sizeScale)), vec2(blobSize * 0.85), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.25, 0.05).scale(sizeScale)), vec2(blobSize * 0.85), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0, 0.25).scale(sizeScale)), vec2(blobSize * 0.8), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(-0.1, -0.2).scale(sizeScale)), vec2(blobSize * 0.75), -1, undefined, translucentColor);
        drawTile(this.pos.add(vec2(0.1, -0.2).scale(sizeScale)), vec2(blobSize * 0.75), -1, undefined, translucentColor);
        setBlendMode(0);
        
        // Draw spiderling legs - thick fuzzy quadratic curves (only when alive)
        if (!this.isDead())
        {
            const legColor = new Color(0.1, 0.1, 0.1); // Black legs
            const legThickness = sizeScale * 0.12; // Much thicker legs
            
            // Helper function to lerp
            const lerp = (a, b, t) => a + (b - a) * t;
            
            // Ensure paws array exists
            if (!this.paws || this.paws.length != 16)
            {
                this.paws = [];
                const bodyTileX = (this.pos.x) | 0;
                const bodyTileY = (this.pos.y) | 0;
                for(let i = 0; i < 16; i++)
                {
                    const angle = (i / 16) * PI * 2;
                    const offsetX = Math.sin(angle) * this.pawRadius;
                    const offsetY = Math.cos(angle) * this.pawRadius;
                    let pawTileX = bodyTileX + (offsetX) | 0;
                    let pawTileY = bodyTileY + 2;
                    this.paws.push({
                        tileX: pawTileX,
                        tileY: pawTileY,
                        worldPos: vec2(pawTileX + 0.5, pawTileY)
                    });
                }
            }
            
            // Draw each leg as a thick fuzzy quadratic curve
            for(let i = 0; i < 16; i++)
            {
                const paw = this.paws[i];
                if (!paw || !paw.worldPos) continue;
                
                // Body attachment point
                const bodyX = bodyPos.x;
                const bodyY = bodyPos.y;
                
                // Paw position (snapped to tile surface)
                const pawX = paw.worldPos.x;
                const pawY = paw.worldPos.y;
                
                // Calculate leg direction and perpendicular for consistent elbow bending
                const legDirX = pawX - bodyX;
                const legDirY = pawY - bodyY;
                const legAngle = Math.atan2(legDirY, legDirX);
                
                // Perpendicular direction (outward) for consistent elbow placement
                const perpAngle = legAngle + PI / 2;
                const elbowOffset = this.pawRadius * 0.3; // How far elbows bend outward
                
                // First elbow at 1/3 distance, raised and offset outward
                const elbow1X = lerp(bodyX, pawX, 1/3) + Math.cos(perpAngle) * elbowOffset;
                const elbow1Y = lerp(bodyY, pawY, 1/3) - this.pawHeight * 0.6;
                
                // Second elbow at 2/3 distance, raised and offset outward
                const elbow2X = lerp(bodyX, pawX, 2/3) + Math.cos(perpAngle) * elbowOffset;
                const elbow2Y = lerp(bodyY, pawY, 2/3) - this.pawHeight * 0.4;
                
                // Draw leg as fuzzy cubic bezier curve with 2 elbows - multiple overlapping lines for fuzzy effect
                const segmentCount = 12; // More segments for smoother fuzzy curve
                let prevX = bodyX;
                let prevY = bodyY;
                
                // Draw multiple layers for fuzzy effect
                for(let fuzzyLayer = 0; fuzzyLayer < 5; fuzzyLayer++)
                {
                    const fuzzyOffset = (fuzzyLayer - 2) * legThickness * 0.15;
                    const fuzzyAlpha = 0.3 + (fuzzyLayer === 2 ? 0.4 : 0.1); // Center layer is brightest
                    const fuzzyColor = new Color(0.1, 0.1, 0.1, fuzzyAlpha);
                    
                    prevX = bodyX;
                    prevY = bodyY;
                    
                    for(let seg = 1; seg <= segmentCount; seg++)
                    {
                        const t = seg / segmentCount;
                        
                        // Cubic bezier curve: (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
                        const mt = 1 - t;
                        const mt2 = mt * mt;
                        const mt3 = mt2 * mt;
                        const t2 = t * t;
                        const t3 = t2 * t;
                        let x = mt3 * bodyX + 3 * mt2 * t * elbow1X + 3 * mt * t2 * elbow2X + t3 * pawX;
                        let y = mt3 * bodyY + 3 * mt2 * t * elbow1Y + 3 * mt * t2 * elbow2Y + t3 * pawY;
                        
                        // Add fuzzy offset perpendicular to leg direction
                        if (seg > 1)
                        {
                            const angle = Math.atan2(y - prevY, x - prevX) + PI/2;
                            x += Math.cos(angle) * fuzzyOffset;
                            y += Math.sin(angle) * fuzzyOffset;
                        }
                        
                        // Draw line segment with fuzzy color
                        drawLine(vec2(prevX, prevY), vec2(x, y), legThickness * (0.7 + fuzzyLayer * 0.1), fuzzyColor);
                        
                        prevX = x;
                        prevY = y;
                    }
                }
                
                // Draw fuzzy foot at ground contact (on tile surface)
                const pawRadius = sizeScale * 0.12; // Larger foot
                for(let fuzzyFoot = 0; fuzzyFoot < 3; fuzzyFoot++)
                {
                    const footOffset = (fuzzyFoot - 1) * pawRadius * 0.2;
                    const footAlpha = 0.4 + (fuzzyFoot === 1 ? 0.4 : 0.1);
                    const footColor = new Color(0.1, 0.1, 0.1, footAlpha);
                    drawTile(paw.worldPos.add(vec2(footOffset, 0)), vec2(pawRadius * (0.8 + fuzzyFoot * 0.1)), -1, undefined, footColor, 0, false, additive);
                }
            }
        }
        
        // Draw spiderling body using drawTile2 for tiles2.png
        if (typeof drawTile2 === 'function')
            drawTile2(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        else
            drawTile(bodyPos, vec2(sizeScale), this.tileIndex, this.tileSize, color, this.angle, this.mirror, additive);
        
        // No head - spiderling is just a body with legs
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
        
        // Initialize or restore equipped weapon
        this.equippedWeaponType = playerEquippedWeapons[playerIndex] || 'Weapon';
        this.equipWeapon(this.equippedWeaponType);
        
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
        this.pressedUnequip = !this.playerIndex && keyWasPressed(81) || gamepadWasPressed(5, this.playerIndex); // Q key for unequip

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

        // Handle unequip (Q key) - unequip if player has any special weapon equipped
        if (this.pressedUnequip)
        {
            if (this.equippedWeaponType && this.equippedWeaponType != 'Weapon')
            {
                this.unequipWeapon();
            }
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
    
    kill(damagingObject)
    {
        // Call parent kill method (destroys weapon, etc.)
        super.kill(damagingObject);
        
        // Clear equipped weapon so helmet is lost on death
        // This prevents the helmet from being restored when player respawns
        if (this.equippedWeaponType && this.equippedWeaponType != 'Weapon')
        {
            playerEquippedWeapons[this.playerIndex] = undefined;
            this.equippedWeaponType = 'Weapon';
        }
    }
    
    equipWeapon(weaponType)
    {
        // Destroy current weapon if it exists
        if (this.weapon)
        {
            this.weapon.destroy();
            this.weapon = null;
        }
        
        // Create new weapon based on type
        let newWeapon;
        if (weaponType == 'LaserWeapon')
            newWeapon = new LaserWeapon(this.pos, this);
        else if (weaponType == 'CannonWeapon')
            newWeapon = new CannonWeapon(this.pos, this);
        else if (weaponType == 'JumperWeapon')
            newWeapon = new JumperWeapon(this.pos, this);
        else if (weaponType == 'HammerWeapon')
            newWeapon = new HammerWeapon(this.pos, this);
        else if (weaponType == 'RadarWeapon')
            newWeapon = new RadarWeapon(this.pos, this);
        else if (weaponType == 'SmokerWeapon')
            newWeapon = new SmokerWeapon(this.pos, this);
        else if (weaponType == 'FangWeapon')
            newWeapon = new FangWeapon(this.pos, this);
        else
            newWeapon = new Weapon(this.pos, this);
        
        this.equippedWeaponType = weaponType;
        playerEquippedWeapons[this.playerIndex] = weaponType; // Persist through respawn
    }
    
    unequipWeapon()
    {
        // Store the weapon type before unequipping
        const currentWeaponType = this.equippedWeaponType;
        
        // Replace with default weapon FIRST (this removes the helmet immediately)
        this.equipWeapon('Weapon');
        
        // Drop the equipped item on the ground after unequipping
        if (currentWeaponType != 'Weapon' && currentWeaponType)
        {
            // Map weaponType back to itemType (use numeric values as fallback)
            let itemType = -1;
            if (currentWeaponType == 'LaserWeapon')
                itemType = typeof itemType_laser !== 'undefined' ? itemType_laser : 2;
            else if (currentWeaponType == 'CannonWeapon')
                itemType = typeof itemType_cannon !== 'undefined' ? itemType_cannon : 3;
            else if (currentWeaponType == 'JumperWeapon')
                itemType = typeof itemType_jumper !== 'undefined' ? itemType_jumper : 4;
            else if (currentWeaponType == 'HammerWeapon')
                itemType = typeof itemType_hammer !== 'undefined' ? itemType_hammer : 5;
            else if (currentWeaponType == 'RadarWeapon')
                itemType = typeof itemType_radar !== 'undefined' ? itemType_radar : 6;
            else if (currentWeaponType == 'SmokerWeapon')
                itemType = typeof itemType_smoker !== 'undefined' ? itemType_smoker : 7;
            else if (currentWeaponType == 'FangWeapon')
                itemType = typeof itemType_fang !== 'undefined' ? itemType_fang : 8;
            
            // Create item slightly away from player so it doesn't immediately get collected
            if (itemType >= 0)
            {
                // Drop item slightly in front/behind player based on facing direction
                const dropOffset = vec2(this.getMirrorSign(.8), 0);
                const dropPos = this.pos.add(dropOffset);
                const droppedItem = new Item(dropPos, itemType);
                // Give item a small toss velocity so it's visible and doesn't immediately get collected
                droppedItem.velocity = vec2(this.getMirrorSign(.15), -.1);
            }
        }
    }
}