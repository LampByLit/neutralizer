/*
    Javascript Space Game
    By Frank Force 2021

*/

'use strict';

class GameObject extends EngineObject 
{
    constructor(pos, size, tileIndex, tileSize, angle)
    {
        super(pos, size, tileIndex, tileSize, angle);
        this.isGameObject = 1;
        this.health = this.healthMax = 0;
        this.burnDelay = .1;
        this.burnTime = 3;
        this.damageTimer = new Timer;
        this.burnDelayTimer = new Timer;
        this.burnTimer = new Timer;
        this.extinguishTimer = new Timer;
        this.color = new Color;
        this.additiveColor = new Color(0,0,0,0);
    }

    inUpdateWindow() { return levelWarmup || isOverlapping(this.pos, this.size, cameraPos, updateWindowSize); }

    update()
    {
        if (this.parent || this.persistent || !this.groundObject || this.inUpdateWindow()) // pause physics if outside update window
            super.update();

        if (!this.isLavaRock)
        {
            if (!this.isDead() && this.damageTimer.isSet())
            {
                // flash white when damaged
                const a = .5*percent(this.damageTimer.get(), 0, .15);
                this.additiveColor = new Color(a,a,a,0);
            }
            else
                this.additiveColor = new Color(0,0,0,0);
        }
        
        if (!this.parent && this.pos.y < -1)
        {
            // kill and destroy if fall below level
            this.kill();
            this.persistent || this.destroy();
        }
        else if (this.burnTime)
        {
            if (this.burnTimer.isSet())
            {
                // burning
                if (this.burnTimer.elapsed())
                {
                    this.kill();
                    if (this.fireEmitter)
                        this.fireEmitter.emitRate = 0;
                }
                else if (rand() < .01)
                {
                    // random chance to spread fire
                    const spreadRadius = 2;
                    debugFire && debugCircle(this.pos, spreadRadius, '#f00', 1);
                    forEachObject(this.pos, spreadRadius, (o)=>o.isGameObject && o.burn());
                }
            }
            else if (this.burnDelayTimer.elapsed())
            {
                // finished waiting to burn
                this.burn(1);
            }
        }
    }
 
    render()
    {
        drawTile(this.pos, this.size, this.tileIndex, this.tileSize, this.color.scale(this.burnColorPercent(),1), this.angle, this.mirror, this.additiveColor);
    }
    
    burnColorPercent() { return lerp(this.burnTimer.getPercent(), .2, 1); }

    burn(instant)
    {
        if (!this.canBurn || this.burnTimer.isSet() || this.extinguishTimer.active())
            return;

        if (this.team == team_player)
        {
            // safety window after spawn
            if (this.getAliveTime() < 2)
                return;
        }

        if (instant)
        {
            this.burnTimer.set(this.burnTime*rand(1.5, 1));
            this.fireEmitter = makeFire();
            this.addChild(this.fireEmitter);
        }
        else
            this.burnDelayTimer.isSet() || this.burnDelayTimer.set(this.burnDelay*rand(1.5, 1));
    }

    extinguish()
    {
        if (this.fireEmitter && this.fireEmitter.emitRate == 0)
            return;

        // stop burning
        this.extinguishTimer.set(.1);
        this.burnTimer.unset();
        this.burnDelayTimer.unset();
        if (this.fireEmitter)
            this.fireEmitter.destroy();
        this.fireEmitter = 0;
    }
    
    heal(health)
    {
        ASSERT(health >= 0);
        if (this.isDead())
            return 0;
        
        // apply healing and return amount healed
        return this.health - (this.health = min(this.health + health, this.healthMax));
    }

    damage(damage, damagingObject)
    {
        ASSERT(damage >= 0);
        if (this.isDead())
            return 0;
        
        // set damage timer;
        this.damageTimer.set();
        for(const child of this.children)
            child.damageTimer && child.damageTimer.set();

        // apply damage and kill if necessary
        const newHealth = max(this.health - damage, 0);
        if (!newHealth)
            this.kill(damagingObject);

        // set new health and return amount damaged
        return this.health - (this.health = newHealth);
    }

    isDead()                { return !this.health; }
    kill(damagingObject)    { this.destroy(); }

    collideWithObject(o)
    {
        if (o.isLavaRock && this.canBurn)
        {
            if (levelWarmup)
            {
                this.destroy();
                return 1;
            }
            this.burn();
        }
        return 1;
    }
}

///////////////////////////////////////////////////////////////////////////////

const propType_crate_wood           = 0;
const propType_crate_explosive      = 1;
const propType_crate_metal          = 2;
const propType_barrel_explosive     = 3;
const propType_barrel_water         = 4;
const propType_barrel_metal         = 5;
const propType_barrel_highExplosive = 6;
const propType_rock                 = 7;
const propType_rock_lava            = 8;
const propType_count                = 9;

class Prop extends GameObject 
{
    constructor(pos, typeOverride) 
    { 
        super(pos);

        const type = this.type = (typeOverride != undefined ? typeOverride : rand()**2*propType_count|0);
        let health = 5;
        this.tileIndex = 16;
        this.explosionSize = 0;
        if (this.type == propType_crate_wood)
        {
            this.color = new Color(1,.5,0);
            this.canBurn = 1;
        }
        else if (this.type == propType_crate_metal)
        {
            this.color = new Color(.9,.9,1);
            health = 10;
        }
        else if (this.type == propType_crate_explosive)
        {
            this.color = new Color(.2,.8,.2);
            this.canBurn = 1;
            this.explosionSize = 2;
            health = 1e3;
        }
        else if (this.type == propType_barrel_metal)
        {
            this.tileIndex = 17;
            this.color = new Color(.9,.9,1);
            health = 10;
        }
        else if (this.type == propType_barrel_explosive)
        {
            this.tileIndex = 17;
            this.color = new Color(.2,.8,.2);
            this.canBurn = 1;
            this.explosionSize = 2;
            health = 1e3;
        }
        else if (this.type == propType_barrel_highExplosive)
        {
            this.tileIndex = 17;
            this.color = new Color(1,.1,.1);
            this.canBurn = 1;
            this.explosionSize = 3;
            this.burnTimeDelay = 0;
            this.burnTime = rand(.5,.1);
            health = 1e3;
        }
        else if (this.type == propType_barrel_water)
        {
            this.tileIndex = 17;
            this.color = new Color(0,.6,1);
            health = .01;
        }
        else if (this.type == propType_rock || this.type == propType_rock_lava)
        {
            this.tileIndex = 18;
            this.color = new Color(.8,.8,.8).mutate(.2);
            health = 30;
            this.mass *= 4;
            if (rand() < .2)
            {
                health = 99;
                this.mass *= 4;
                this.size = this.size.scale(2);
                this.pos.y += .5;
            }
            this.isCrushing = 1;

            if (this.type == propType_rock_lava)
            {
                this.color = new Color(1,.9,0);
                this.additiveColor = new Color(1,0,0);
                this.isLavaRock = 1;    
            }
        }

        // randomly angle and flip axis (90 degree rotation)
        this.angle = (rand(4)|0)*PI/2;
        if (rand() < .5)
            this.size = this.size.flip();

        this.mirror = rand() < .5;
        this.health = this.healthMax = health;
        this.setCollision(1, 1);
    }
 
    update()
    {
        const oldVelocity = this.velocity.copy();
        super.update();

        // apply collision damage
        const deltaSpeedSquared = this.velocity.subtract(oldVelocity).lengthSquared();
        deltaSpeedSquared > .05 && this.damage(2*deltaSpeedSquared);
    }

    damage(damage, damagingObject)
    {
        (this.explosionSize || this.type == propType_crate_wood && rand() < .1) && this.burn();
        super.damage(damage, damagingObject);
    }

    kill()
    {
        if (this.destroyed) return;

        if (this.type == propType_barrel_water)
            makeWater(this.pos);

        // Drop item from wooden and metal crates (20% chance)
        if ((this.type == propType_crate_wood || this.type == propType_crate_metal) && rand() < .2)
        {
            const itemTypes = getAllItemTypes();
            const randomItemType = itemTypes[rand(itemTypes.length)|0];
            new Item(this.pos, randomItemType);
        }

        this.destroy();
        makeDebris(this.pos, this.color.scale(this.burnColorPercent(),1));
        
        this.explosionSize ? 
            explosion(this.pos, this.explosionSize) :
            playSound(sound_destroyTile, this.pos);
    }
}

///////////////////////////////////////////////////////////////////////////////

let checkpointPos, activeCheckpoint, checkpointTimer = new Timer;

class Checkpoint extends GameObject 
{
    constructor(pos)
    {
        super(pos.int().add(vec2(.5)))
        this.renderOrder = tileRenderOrder-1;
        this.isCheckpoint = 1;
        for(let x=3;x--;)
        for(let y=6;y--;)
            setTileCollisionData(pos.subtract(vec2(x-1,1-y)), y ? tileType_empty : tileType_solid);
    }

    update()
    {
        if (!this.inUpdateWindow())
            return; // ignore offscreen objects

        // check if player is near
        for(const player of players)
            player && !player.isDead() && this.pos.distanceSquared(player.pos) < 1 && this.setActive();
    }

    setActive()
    {
        if (activeCheckpoint != this && !levelWarmup)
            playSound(sound_checkpoint, this.pos);

        checkpointPos = this.pos;
        activeCheckpoint = this;
        checkpointTimer.set(.1);
    }

    render()
    {
        // draw flag
        const height = 4;
        const color = activeCheckpoint == this ? new Color(1,0,0) : new Color;
        const a = Math.sin(time*4+this.pos.x);
        drawTile(this.pos.add(vec2(.5,height-.3-.5-.03*a)), vec2(1,.6), 14, undefined, color, a*.06);  
        drawRect(this.pos.add(vec2(0,height/2-.5)), vec2(.1,height), new Color(.9,.9,.9));
    }
}

///////////////////////////////////////////////////////////////////////////////

class Grenade extends GameObject
{
    constructor(pos) 
    {
        super(pos, vec2(.2), 5, vec2(8));

        this.health = this.healthMax = 1e3;
        this.beepTimer = new Timer(1);
        this.elasticity = .3;
        this.friction   = .9;
        this.angleDamping = .96;
        this.renderOrder = 1e8;
        this.setCollision();
    }

    update()
    {
        super.update();

        if (this.getAliveTime() > 3)
        {
            explosion(this.pos, 3);
            this.destroy();
            return;
        }

        if (this.beepTimer.elapsed())
        {
            playSound(sound_grenade, this.pos)
            this.beepTimer.set(1);
        }

        alertEnemies(this.pos, this.pos);
    }
       
    render()
    {
        drawTile(this.pos, vec2(.5), this.tileIndex, this.tileSize, this.color, this.angle);

        const a = this.getAliveTime();
        setBlendMode(1);
        drawTile(this.pos, vec2(2), 0, vec2(16), new Color(1,0,0,.2-.2*Math.cos(a*2*PI)));
        drawTile(this.pos, vec2(1), 0, vec2(16), new Color(1,0,0,.2-.2*Math.cos(a*2*PI)));
        drawTile(this.pos, vec2(.5), 0, vec2(16), new Color(1,1,1,.2-.2*Math.cos(a*2*PI)));
        setBlendMode(0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class HammerProjectile extends GameObject
{
    constructor(pos, attacker) 
    {
        super(pos, vec2(.2), 5, vec2(8)); // Same size and sprite as grenade

        this.health = this.healthMax = 1e3;
        this.attacker = attacker;
        this.team = attacker.team;
        this.elasticity = .3;
        this.friction = .9;
        this.angleDamping = .96;
        this.renderOrder = 1e8;
        this.gravityScale = 1; // Affected by gravity for ballistic trajectory
        this.damage = 5; // 5x bullet damage
        this.hasLanded = 0; // Track if projectile has landed
        this.setCollision();
        this.color = new Color(0, 0, 0, 1); // All black
    }

    update()
    {
        super.update();

        // Check if projectile has landed (on ground and not moving much)
        if (!this.hasLanded && this.groundObject && this.velocity.lengthSquared() < .01)
        {
            this.hasLanded = 1;
        }

        // Check for enemy collisions (both while flying and after landing as a trap)
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject && !o.parent && o.team != this.team)
            {
                if (o.isCharacter)
                {
                    // Enemy touched the hammer - deal damage and disappear
                    o.damage(this.damage, this);
                    this.destroy();
                    return;
                }
            }
        });
    }
    
    collideWithObject(o)
    {
        // After landing, act as trap - if enemy touches it, deal damage
        if (this.hasLanded && o.isGameObject && !o.parent && o.team != this.team)
        {
            if (o.isCharacter)
            {
                // Enemy touched the hammer - deal damage and disappear
                o.damage(this.damage, this);
                this.destroy();
                return 1;
            }
        }
        
        return super.collideWithObject(o);
    }
       
    render()
    {
        // Draw black hammer sprite
        drawTile(this.pos, vec2(.5), this.tileIndex, this.tileSize, this.color, this.angle);

        // Static shine effect (white glow)
        setBlendMode(1);
        drawTile(this.pos, vec2(.6), 0, vec2(16), new Color(1, 1, 1, .3), this.angle);
        setBlendMode(0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class KeyItem extends GameObject
{
    constructor(pos)
    {
        super(pos, vec2(.5,.5), -1, vec2(8)); // No sprite needed, use -1 for untextured

        this.health = this.healthMax = 1e3; // Indestructible
        this.canBurn = 0; // Can't be burned
        this.setCollision(1, 1);
        this.renderOrder = 1e9; // Draw on top
        this.color = new Color(1, 1, 0); // Yellow/gold color
        this.additiveColor = new Color(0.5, 0.5, 0); // Golden glow
        this.isKeyItem = 1;

        // Gentle floating animation
        this.floatTimer = 0;
        this.originalY = pos.y;
    }

    update()
    {
        super.update();

        // Gentle floating up and down
        this.floatTimer += timeDelta;
        this.pos.y = this.originalY + Math.sin(this.floatTimer * 2) * 0.1;

        // Check for player collision
        for(const player of players)
        {
            if (player && !player.isDead() && this.pos.distanceSquared(player.pos) < 1)
            {
                this.collect(player);
                break;
            }
        }
    }

    collect(player)
    {
        // Play collection sound
        playSound(sound_checkpoint, this.pos);

        // Create particle effect
        const emitter = new ParticleEmitter(
            this.pos, .5, .2, 200, PI, // pos, emitSize, emitTime, emitRate, emiteCone
            0, undefined,     // tileIndex, tileSize
            new Color(1,1,0,.8), new Color(1,1,0,.2), // colorStartA, colorStartB
            new Color(1,1,0,0), new Color(1,1,0,0), // colorEndA, colorEndB
            .3, .5, .1, .1, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, 1, .5, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate,
            .5, 1, 1           // randomness, collide, additive, randomColorLinear, renderOrder
        );

        // Mark level as won by collecting key
        levelEndTimer.set();

        // Destroy the key item
        this.destroy();
    }

    render()
    {
        // Draw glowing golden circle with multiple layers for glow effect
        const baseRadius = 0.25;
        const glowLayers = [
            { radius: 0.5, alpha: 0.15 },
            { radius: 0.4, alpha: 0.25 },
            { radius: 0.3, alpha: 0.4 },
            { radius: baseRadius, alpha: 1.0 }
        ];

        // Outer glow layers with additive blending
        setBlendMode(1); // Additive blend for glow
        for(let i = 0; i < glowLayers.length - 1; i++)
        {
            const layer = glowLayers[i];
            drawCanvas2D(this.pos, vec2(layer.radius * 2), 0, 0, (ctx) => {
                ctx.fillStyle = new Color(1, 0.85, 0, layer.alpha).rgba();
                ctx.beginPath();
                ctx.arc(0, 0, 0.5, 0, PI * 2);
                ctx.fill();
            });
        }
        setBlendMode(0); // Back to normal blend

        // Main circle
        drawCanvas2D(this.pos, vec2(baseRadius * 2), 0, 0, (ctx) => {
            ctx.fillStyle = new Color(1, 0.85, 0, 1).rgba();
            ctx.beginPath();
            ctx.arc(0, 0, 0.5, 0, PI * 2);
            ctx.fill();
        });
    }
}

///////////////////////////////////////////////////////////////////////////////

// Item type definitions
// Order: Life (0), Health (1), Laser (2), Cannon (3), Jumper (4), Hammer (5), Radar (6)
const itemType_life = 0;
const itemType_health = 1;
const itemType_laser = 2;
const itemType_cannon = 3;
const itemType_jumper = 4;
const itemType_hammer = 5;
const itemType_radar = 6;

const itemType_consumable = 0;
const itemType_equipable = 1;

// Item registry - maps item type to properties
const itemRegistry = {
    [itemType_life]: { 
        category: itemType_consumable, 
        tileIndex: 0, 
        effect: 'addLife' 
    },
    [itemType_health]: { 
        category: itemType_consumable, 
        tileIndex: 1, 
        effect: 'heal', 
        amount: 1 
    },
    [itemType_laser]: { 
        category: itemType_equipable, 
        tileIndex: 2, 
        weaponType: 'LaserWeapon' 
    },
    [itemType_cannon]: { 
        category: itemType_equipable, 
        tileIndex: 3, 
        weaponType: 'CannonWeapon' 
    },
    [itemType_jumper]: { 
        category: itemType_equipable, 
        tileIndex: 4, 
        weaponType: 'JumperWeapon' 
    },
    [itemType_hammer]: { 
        category: itemType_equipable, 
        tileIndex: 5, 
        weaponType: 'HammerWeapon' 
    },
    [itemType_radar]: { 
        category: itemType_equipable, 
        tileIndex: 6, 
        weaponType: 'RadarWeapon' 
    }
};

// Get all available item types for random selection
const getAllItemTypes = ()=> [itemType_life, itemType_health, itemType_laser, itemType_cannon, itemType_jumper, itemType_hammer, itemType_radar];

///////////////////////////////////////////////////////////////////////////////

class Item extends GameObject
{
    constructor(pos, itemType)
    {
        const itemData = itemRegistry[itemType];
        if (!itemData)
        {
            console.error('Invalid item type:', itemType);
            return;
        }
        
        super(pos, vec2(.7, .7), itemData.tileIndex, vec2(8));
        
        this.itemType = itemType;
        this.itemData = itemData;
        this.isItem = 1;
        this.health = this.healthMax = 1e3; // Indestructible
        this.canBurn = 0;
        this.setCollision(1, 1);
        this.renderOrder = 1e8;
        this.color = new Color(1, 1, 1);
        
        // Physical properties - items are physical objects
        this.elasticity = .3;
        this.friction = .8;
        this.mass = .5;
        
        // Give item slight upward velocity when spawned
        this.velocity = vec2(rand(.1, -.1), rand(.15, .05));
    }
    
    update()
    {
        super.update();
        
        // Check for player collision
        for(const player of players)
        {
            if (player && !player.isDead() && this.pos.distanceSquared(player.pos) < .5)
            {
                this.collect(player);
                break;
            }
        }
    }
    
    collect(player)
    {
        if (this.itemData.category == itemType_consumable)
        {
            // Consumable - apply effect immediately
            playSound(sound_checkpoint, this.pos);
            if (this.itemData.effect == 'addLife')
            {
                ++playerLives;
            }
            else if (this.itemData.effect == 'heal')
            {
                player.heal(this.itemData.amount || 1);
                
                // Confetti effect since health does pretty much nothing
                // Create multiple colorful particle emitters for confetti effect
                const colors = [
                    [new Color(1,0,0,.8), new Color(1,.2,.2,.8)], // Red
                    [new Color(0,1,0,.8), new Color(.2,1,.2,.8)], // Green
                    [new Color(0,0,1,.8), new Color(.2,.2,1,.8)], // Blue
                    [new Color(1,1,0,.8), new Color(1,1,.2,.8)], // Yellow
                    [new Color(1,0,1,.8), new Color(1,.2,1,.8)], // Magenta
                    [new Color(0,1,1,.8), new Color(.2,1,1,.8)], // Cyan
                ];
                
                colors.forEach((colorPair, i) => {
                    const angleOffset = (i / colors.length) * PI * 2;
                    new ParticleEmitter(
                        this.pos, .3, .15, 150, PI * 2, // pos, emitSize, emitTime, emitRate, emitCone (full circle)
                        0, undefined,     // tileIndex, tileSize
                        colorPair[0], colorPair[1], // colorStartA, colorStartB
                        new Color(colorPair[0].r, colorPair[0].g, colorPair[0].b, 0), 
                        new Color(colorPair[1].r, colorPair[1].g, colorPair[1].b, 0), // colorEndA, colorEndB (fade to transparent)
                        .4, .3, .15, .2, .2, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                        .95, 1, .8, PI * 2, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate
                        .6, 0, 0, 0, 1e8  // randomness, collide, additive, randomColorLinear, renderOrder
                    );
                });
            }
            this.destroy();
        }
        else if (this.itemData.category == itemType_equipable)
        {
            // Equipable - only allow pickup if player has default weapon or no weapon
            if (!player.equippedWeaponType || player.equippedWeaponType == 'Weapon')
            {
                // Player has default weapon or no weapon - equip this one
                playSound(sound_checkpoint, this.pos); // Only play sound when equipping
                player.equipWeapon(this.itemData.weaponType);
                this.destroy();
            }
            // If player already has a special weapon equipped, don't collect the item
            // Item remains on the ground for later pickup (no sound)
        }
    }
    
    render()
    {
        // Use drawTile2 if available, otherwise fallback to drawTile (items won't show correct sprite but won't crash)
        if (typeof drawTile2 === 'function')
            drawTile2(this.pos, this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
        else
            drawTile(this.pos, this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Weapon extends EngineObject 
{
    constructor(pos, parent) 
    { 
        super(pos, vec2(.6), 4, vec2(8));

        // weapon settings
        this.isWeapon = 1;
        this.fireTimeBuffer = this.localAngle = 0;
        this.recoilTimer = new Timer;

        this.addChild(this.shellEmitter = new ParticleEmitter(
            vec2(), 0, 0, 0, .1,  // pos, emitSize, emitTime, emitRate, emiteCone
            undefined, undefined, // tileIndex, tileSize
            new Color(1,.8,.5), new Color(.9,.7,.5), // colorStartA, colorStartB
            new Color(1,.8,.5), new Color(.9,.7,.5), // colorEndA, colorEndB
            3, .1, .1, .15, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, .95, 1, 0, 0,    // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            .1, 1              // randomness, collide, additive, randomColorLinear, renderOrder
        ));
        this.shellEmitter.elasticity = .5;
        this.shellEmitter.particleDestroyCallback = persistentParticleDestroyCallback;
        this.renderOrder = parent.renderOrder+1;

        parent.weapon = this;
        parent.addChild(this, this.localOffset = vec2(.55,0));
    }

    update()
    {
        super.update();

        const fireRate = 8;
        const bulletSpeed = .5;
        const spread = .1;

        this.mirror = this.parent.mirror;
        this.fireTimeBuffer += timeDelta;

        // Get base aim angle from parent (player's aimAngle, or 0 for enemies)
        const baseAimAngle = this.parent.aimAngle || 0;

        // Negate angle for sprite display (sprite rotation is inverted from bullet direction)
        // When mirrored (facing left), the engine will negate the angle again, so we need to account for that
        const spriteAngle = -baseAimAngle * this.getMirrorSign();

        // melee animation - gun moves forward
        const meleeAngleOffset = this.parent.meleeTimer && this.parent.meleeTimer.active() ? 1.2 * Math.sin(this.parent.meleeTimer.getPercent() * PI) * this.getMirrorSign() : 0;
        const meleeExtendOffset = this.parent.meleeTimer && this.parent.meleeTimer.active() ? .3 * Math.sin(this.parent.meleeTimer.getPercent() * PI) : 0;

        // extend weapon forward during melee
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

        if (this.triggerIsDown)
        {
            // slow down enemy bullets
            const speed = bulletSpeed * (this.parent.isPlayer ? 1 : .5);
            const rate = 1/fireRate;
            for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
            {
                // Apply recoil on top of aim angle (negated for sprite, accounting for mirror)
                const recoilAngle = -(baseAimAngle - rand(.2,.15)) * this.getMirrorSign();
                this.localAngle = recoilAngle;
                this.recoilTimer.set(rand(.4,.3));
                const bullet = new Bullet(this.pos, this.parent);
                
                // Fire bullet in the direction of aim angle (with spread)
                const direction = vec2(this.getMirrorSign(speed), 0).rotate(baseAimAngle);
                bullet.velocity = direction.rotate(rand(spread,-spread));

                this.shellEmitter.localAngle = -.8*this.getMirrorSign();
                this.shellEmitter.emitParticle();
                playSound(sound_shoot, this.pos);

                // alert enemies
                this.parent.isPlayer && alertEnemies(this.pos, this.pos);
            }
        }
        else
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Bullet extends EngineObject 
{
    constructor(pos, attacker) 
    { 
        super(pos, vec2(0));
        this.color = new Color(1,1,0,1);
        this.lastVelocity = this.velocity;
        this.setCollision();

        this.damage = this.damping = 1;
        this.gravityScale = 0;
        this.attacker = attacker;
        this.team = attacker.team;
        this.renderOrder = 1e9;
        this.range = 16; // Doubled from 8 to make bullets travel twice as far
    }

    update()
    {
        this.lastVelocity = this.velocity;
        super.update();

        this.range -= this.velocity.length();
        if (this.range < 0)
        {
            const emitter = new ParticleEmitter(
                this.pos, .2, .1, 100, PI, // pos, emitSize, emitTime, emitRate, emiteCone
                0, undefined,     // tileIndex, tileSize
                new Color(1,1,0,.5), new Color(1,1,1,.5), // colorStartA, colorStartB
                new Color(1,1,0,0), new Color(1,1,1,0), // colorEndA, colorEndB
                .1, .5, .1, .1, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                1, 1, .5, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                .5, 0, 1           // randomness, collide, additive, randomColorLinear, renderOrder
            );

            this.destroy();
            return;
        }

        // check if hit someone
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject && !o.parent && o.team != this.team)
            if (!o.dodgeTimer || !o.dodgeTimer.active())
                this.collideWithObject(o)
        });
    }
    
    collideWithObject(o)
    {
        if (o.isGameObject)
        {
            o.damage(this.damage, this);
            o.applyForce(this.velocity.scale(.1));
            if (o.isCharacter)
            {
                playSound(sound_walk, this.pos);
                this.destroy();
            }
            else
                this.kill();
        }
    
        return 1; 
    }

    collideWithTile(data, pos)
    {
        if (data <= 0)
            return 0;
            
        const destroyTileChance = data == tileType_glass ? 1 : data == tileType_dirt ? .2 : .05;
        rand() < destroyTileChance && destroyTile(pos);
        this.kill();

        return 1; 
    }

    kill()
    {
        if (this.destroyed)
            return;

        const emitter = new ParticleEmitter(
            this.pos, 0, .1, 100, .5, // pos, emitSize, emitTime, emitRate, emiteCone
            undefined, undefined,     // tileIndex, tileSize
            new Color(1,1,0), new Color(1,0,0), // colorStartA, colorStartB
            new Color(1,1,0), new Color(1,0,0), // colorEndA, colorEndB
            .2, .2, 0, .1, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, 1, .5, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            .5, 1, 1           // randomness, collide, additive, randomColorLinear, renderOrder
        );
        emitter.trailScale = 1;
        emitter.angle = this.lastVelocity.angle() + PI;
        emitter.elasticity = .3;

        this.destroy();
    }

    render()
    {
        drawRect(this.pos, vec2(.4,.5), new Color(1,1,1,.5), this.velocity.angle());
        drawRect(this.pos, vec2(.2,.5), this.color, this.velocity.angle());
    }
}

///////////////////////////////////////////////////////////////////////////////

class LaserBeam extends EngineObject 
{
    constructor(pos, attacker) 
    { 
        super(pos, vec2(0));
        this.color = new Color(1,0,0,1); // Red laser
        this.lastVelocity = this.velocity;
        this.setCollision();

        this.damage = 3; // 3x bullet damage
        this.damping = 1;
        this.gravityScale = 0;
        this.attacker = attacker;
        this.team = attacker.team;
        this.renderOrder = 1e9;
        this.range = 48; // 3x bullet range (16 * 3)
    }

    update()
    {
        this.lastVelocity = this.velocity;
        super.update();

        this.range -= this.velocity.length();
        if (this.range < 0)
        {
            // Sparkly particle effect when laser expires
            const emitter = new ParticleEmitter(
                this.pos, .2, .1, 150, PI, // pos, emitSize, emitTime, emitRate, emiteCone
                0, undefined,     // tileIndex, tileSize
                new Color(1,0,0,.8), new Color(1,.5,.2,.8), // colorStartA, colorStartB (red to orange)
                new Color(1,0,0,0), new Color(1,.5,.2,0), // colorEndA, colorEndB
                .15, .3, .05, .15, .2, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                1, 1, .3, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                .6, 0, 1           // randomness, collide, additive, randomColorLinear, renderOrder
            );

            this.destroy();
            return;
        }

        // check if hit someone
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject && !o.parent && o.team != this.team)
            if (!o.dodgeTimer || !o.dodgeTimer.active())
                this.collideWithObject(o)
        });
    }
    
    collideWithObject(o)
    {
        if (o.isGameObject)
        {
            o.damage(this.damage, this);
            o.applyForce(this.velocity.scale(.1));
            if (o.isCharacter)
            {
                // Sparkly particle effect on hit
                const emitter = new ParticleEmitter(
                    this.pos, .3, .15, 200, PI * 2, // pos, emitSize, emitTime, emitRate, emiteCone (full circle)
                    0, undefined,     // tileIndex, tileSize
                    new Color(1,0,0,1), new Color(1,.8,.2,1), // colorStartA, colorStartB (bright red to yellow)
                    new Color(1,0,0,0), new Color(1,.8,.2,0), // colorEndA, colorEndB
                    .2, .2, .1, .2, .3, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                    .95, 1, .2, PI * 2, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                    .7, 0, 1           // randomness, collide, additive, randomColorLinear, renderOrder
                );
                
                playSound(sound_walk, this.pos);
                this.destroy();
            }
            else
                this.kill();
        }
    
        return 1; 
    }

    collideWithTile(data, pos)
    {
        if (data <= 0)
            return 0;
        
        // Laser hits tile - destroy it (but doesn't damage tiles)
        this.kill();
        return 1;
    }

    kill()
    {
        if (this.destroyed)
            return;

        // Sparkly particle effect when destroyed
        const emitter = new ParticleEmitter(
            this.pos, .2, .1, 150, PI, // pos, emitSize, emitTime, emitRate, emiteCone
            0, undefined,     // tileIndex, tileSize
            new Color(1,0,0,.8), new Color(1,.5,.2,.8), // colorStartA, colorStartB
            new Color(1,0,0,0), new Color(1,.5,.2,0), // colorEndA, colorEndB
            .15, .3, .05, .15, .2, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, 1, .3, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            .6, 0, 1           // randomness, collide, additive, randomColorLinear, renderOrder
        );
        emitter.trailScale = 1;
        emitter.angle = this.lastVelocity.angle() + PI;
        emitter.elasticity = .3;

        this.destroy();
    }

    render()
    {
        // Red laser beam - brighter and more visible than bullets
        drawRect(this.pos, vec2(.5,.6), new Color(1,0,0,.3), this.velocity.angle());
        drawRect(this.pos, vec2(.3,.6), this.color, this.velocity.angle());
    }
}

///////////////////////////////////////////////////////////////////////////////

class LaserWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.fireTimeBuffer = 0;
        this.fireRate = 5; // Reasonable cooldown - fires 5 times per second
        this.hidden = 1; // Don't render the weapon sprite (helmet is rendered separately)
    }
    
    update()
    {
        super.update();
        
        // Only handle laser firing for player
        if (!this.parent.isPlayer)
            return;
        
        this.fireTimeBuffer += timeDelta;
        
        // Check if F key is pressed (key code 70)
        const pressingLaser = !this.parent.playerIndex && keyIsDown(70);
        
        if (pressingLaser)
        {
            const rate = 1/this.fireRate;
            const laserSpeed = 1.0; // Faster than bullets (.5)
            
            // Get base aim angle from parent
            const baseAimAngle = this.parent.aimAngle || 0;
            
            // Calculate forward direction based on mirror state and aim angle
            const forwardDirection = vec2(this.parent.getMirrorSign(1), 0).rotate(baseAimAngle);
            
            // Only fire forward (check if direction matches facing direction)
            // If mirror is 0 (facing right), forwardDirection.x should be positive
            // If mirror is 1 (facing left), forwardDirection.x should be negative
            const isFiringForward = (this.parent.mirror == 0 && forwardDirection.x >= 0) || 
                                     (this.parent.mirror == 1 && forwardDirection.x <= 0);
            
            if (isFiringForward)
            {
                for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
                {
                    // Calculate head position (where laser comes from)
                    const sizeScale = this.parent.sizeScale || 1;
                    const headPos = this.parent.pos.add(
                        vec2(this.parent.getMirrorSign(.05), .46).scale(sizeScale)
                    );
                    
                    // Create laser beam
                    const laser = new LaserBeam(headPos, this.parent);
                    
                    // Fire laser in the direction of aim angle
                    laser.velocity = forwardDirection.scale(laserSpeed);
                    
                    // Play laser sound
                    playSound(sound_laser, headPos);
                    
                    // Alert enemies
                    alertEnemies(headPos, headPos);
                }
            }
            else
            {
                // Not firing forward, reset buffer
                this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
            }
        }
        else
        {
            // Not pressing Ctrl, reset buffer
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class CannonBall extends GameObject
{
    constructor(pos, attacker) 
    {
        super(pos, vec2(.3), 5, vec2(8)); // Slightly larger than grenade

        this.health = this.healthMax = 1e3;
        this.attacker = attacker;
        this.team = attacker.team;
        this.elasticity = .3;
        this.friction = .9;
        this.angleDamping = .96;
        this.renderOrder = 1e8;
        this.gravityScale = 1; // Affected by gravity for ballistic trajectory
        this.setCollision();
        this.color = new Color(.8, .8, .8); // Gray/silver cannonball
    }

    update()
    {
        super.update();

        // Check if hit an enemy
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject && !o.parent && o.team != this.team)
            {
                if (o.isCharacter)
                {
                    // Hit an enemy - explode
                    this.explode();
                    return;
                }
            }
        });
        
        // Check if just landed on ground (explode on impact)
        if (this.groundObject && this.velocity.y >= 0)
        {
            this.explode();
            return;
        }
    }
    
    collideWithTile(data, pos)
    {
        if (data <= 0)
            return 0;
        
        // Explode immediately on tile impact
        this.explode();
        return 1;
    }
    
    explode()
    {
        if (this.destroyed)
            return;
            
        // Big explosion with fire spreading
        explosion(this.pos, 4); // Larger radius than grenades (which use 3)
        this.destroy();
    }
       
    render()
    {
        drawTile(this.pos, vec2(.4), this.tileIndex, this.tileSize, this.color, this.angle);
        
        // Add a subtle glow/trail effect
        setBlendMode(1);
        drawTile(this.pos, vec2(.6), 0, vec2(16), new Color(1,.5,.1,.3), this.angle);
        setBlendMode(0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class CannonWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.fireTimeBuffer = 0;
        this.fireRate = 1.5; // Slower fire rate - fires 1.5 times per second (cannon reload time)
        this.hidden = 1; // Don't render the weapon sprite (mask is rendered separately)
    }
    
    update()
    {
        super.update();
        
        // Only handle cannon firing for player
        if (!this.parent.isPlayer)
            return;
        
        this.fireTimeBuffer += timeDelta;
        
        // Check if F key is pressed (key code 70)
        const pressingCannon = !this.parent.playerIndex && keyIsDown(70);
        
        if (pressingCannon)
        {
            const rate = 1/this.fireRate;
            
            // Get base aim angle from parent
            const baseAimAngle = this.parent.aimAngle || 0;
            
            // Calculate forward direction based on mirror state and aim angle
            const forwardDirection = vec2(this.parent.getMirrorSign(1), 0).rotate(baseAimAngle);
            
            // Only fire forward (check if direction matches facing direction)
            const isFiringForward = (this.parent.mirror == 0 && forwardDirection.x >= 0) || 
                                     (this.parent.mirror == 1 && forwardDirection.x <= 0);
            
            if (isFiringForward)
            {
                for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
                {
                    // Calculate weapon position (where cannonball comes from)
                    const sizeScale = this.parent.sizeScale || 1;
                    const weaponPos = this.parent.pos.add(
                        vec2(this.parent.getMirrorSign(.55), 0).scale(sizeScale)
                    );
                    
                    // Create cannonball
                    const cannonball = new CannonBall(weaponPos, this.parent);
                    
                    // Ballistic trajectory - faster than grenades but still arced
                    // Grenades use: vec2(getMirrorSign(), rand(.8,.7)).normalize(.25+rand(.02))
                    // Cannon uses faster speed (.45-.5) and similar upward arc
                    const horizontalComponent = this.parent.getMirrorSign(1);
                    const verticalComponent = rand(.7, .6); // Upward arc
                    const direction = vec2(horizontalComponent, verticalComponent).normalize();
                    
                    // Apply aim angle to the direction
                    const aimedDirection = direction.rotate(baseAimAngle);
                    
                    // Faster than grenades: .45-.5 vs grenade's .25-.27
                    cannonball.velocity = this.parent.velocity.add(aimedDirection.scale(.45 + rand(.05)));
                    cannonball.angleVelocity = this.parent.getMirrorSign() * rand(1, .6);
                    
                    // Play cannon sound
                    playSound(sound_explosion, weaponPos, 20, .3); // Use explosion sound at lower volume
                    
                    // Alert enemies
                    alertEnemies(weaponPos, weaponPos);
                }
            }
            else
            {
                // Not firing forward, reset buffer
                this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
            }
        }
        else
        {
            // Not pressing Ctrl, reset buffer
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class JumperWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.hidden = 1; // Don't render the weapon sprite (helmet is rendered separately)
        this.wasJumping = 0; // Track if jump was active last frame
        this.fTriggeredJump = 0; // Track if current jump was triggered by F key
        this.wasPressingF = 0; // Track if F was pressed last frame
    }
    
    update()
    {
        super.update();
        
        // Only handle jumper for player
        if (!this.parent.isPlayer)
            return;
        
        // Check if F key is pressed (key code 70)
        const pressingF = !this.parent.playerIndex && keyIsDown(70);
        const fJustPressed = !this.parent.playerIndex && keyWasPressed(70);
        const fJustPressedThisFrame = pressingF && !this.wasPressingF; // Detect F press even if keyWasPressed missed it
        
        // Track jump state
        const isJumping = this.parent.jumpTimer.active();
        const wasJumping = this.wasJumping;
        const isOnGround = this.parent.groundObject || this.parent.groundTimer.active();
        this.wasJumping = isJumping;
        this.wasPressingF = pressingF;
        
        // If F was just pressed (this frame) and we're on ground and not jumping, trigger high jump directly
        // Weapon updates after Character, so we can trigger jump even if Character didn't process it
        if ((fJustPressed || fJustPressedThisFrame) && isOnGround && !isJumping && !this.parent.preventJumpTimer.active())
        {
            this.fTriggeredJump = 1;
            // Directly trigger high jump
            if (this.parent.climbingWall)
            {
                this.parent.velocity.y = .6; // Higher wall jump (normal is .25) - 2.4x boost
            }
            else
            {
                this.parent.velocity.y = .45; // Much higher jump (normal is .15) - 3x boost
            }
            this.parent.jumpTimer.set(.4); // Longer jump timer
            this.parent.preventJumpTimer.set(.5);
            playSound(sound_jump, this.parent.pos);
        }
        // If jump just started this frame and F is pressed, boost it (in case Character triggered normal jump)
        else if (!wasJumping && isJumping && pressingF && this.parent.velocity.y > 0 && this.parent.velocity.y < .3)
        {
            // Character.update() triggered a normal jump, boost it to high jump
            this.fTriggeredJump = 1;
            if (this.parent.climbingWall)
            {
                this.parent.velocity.y = .6; // Higher wall jump
            }
            else
            {
                this.parent.velocity.y = .45; // Much higher jump
            }
            this.parent.jumpTimer.set(.4); // Longer jump timer
        }
        
        // If F is being held, maintain jump state for continuation
        if (pressingF)
        {
            // Set holdingJump for jump continuation
            this.parent.holdingJump = 1;
        }
        
        // If jump just ended, reset the F trigger flag
        if (wasJumping && !isJumping)
        {
            this.fTriggeredJump = 0;
        }
        
        // Boost jump continuation while holding F and jumping (only if F triggered it)
        // This works for both ground jumps and wall climbs
        if (this.fTriggeredJump && isJumping && pressingF && this.parent.velocity.y > 0)
        {
            // Much stronger jump continuation (normal is .017, jumper is .05)
            // Override the normal boost by adding extra
            this.parent.velocity.y += .033; // .05 - .017 = .033 extra boost
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class HammerWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.fireTimeBuffer = 0;
        this.fireRate = 1.5; // Same fire rate as cannon
        this.hidden = 1; // Don't render the weapon sprite (helmet is rendered separately)
    }
    
    update()
    {
        super.update();
        
        // Only handle hammer throwing for player
        if (!this.parent.isPlayer)
            return;
        
        this.fireTimeBuffer += timeDelta;
        
        // Check if F key is pressed (key code 70)
        const pressingHammer = !this.parent.playerIndex && keyIsDown(70);
        
        if (pressingHammer)
        {
            const rate = 1/this.fireRate;
            
            // Get base aim angle from parent
            const baseAimAngle = this.parent.aimAngle || 0;
            
            // Calculate forward direction based on mirror state and aim angle
            const forwardDirection = vec2(this.parent.getMirrorSign(1), 0).rotate(baseAimAngle);
            
            // Only fire forward (check if direction matches facing direction)
            const isFiringForward = (this.parent.mirror == 0 && forwardDirection.x >= 0) || 
                                     (this.parent.mirror == 1 && forwardDirection.x <= 0);
            
            if (isFiringForward)
            {
                for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
                {
                    // Calculate weapon position (where hammer comes from)
                    const sizeScale = this.parent.sizeScale || 1;
                    const weaponPos = this.parent.pos.add(
                        vec2(this.parent.getMirrorSign(.55), 0).scale(sizeScale)
                    );
                    
                    // Create hammer projectile
                    const hammer = new HammerProjectile(weaponPos, this.parent);
                    
                    // Use same throw trajectory as grenade
                    hammer.velocity = this.parent.velocity.add(vec2(this.parent.getMirrorSign(), rand(.8,.7)).normalize(.25+rand(.02)));
                    hammer.angleVelocity = this.parent.getMirrorSign() * rand(.8,.5);
                    
                    // Play jump sound
                    playSound(sound_jump, weaponPos);
                    
                    // Alert enemies
                    alertEnemies(weaponPos, weaponPos);
                }
            }
            else
            {
                // Not firing forward, reset buffer
                this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
            }
        }
        else
        {
            // Not pressing F, reset buffer
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class RadarWeapon extends Weapon
{
    constructor(pos, parent)
    {
        super(pos, parent);
        this.hidden = 1; // Don't render the weapon sprite (helmet is rendered separately)
        this.targetZoom = defaultCameraScale; // Target zoom level (starts at normal)
        this.zoomSpeed = 0.05; // Very slow lerp factor for smooth zoom transitions
        this.isActive = 0; // Track if this weapon is actively controlling zoom
    }
    
    update()
    {
        super.update();
        
        // Only handle radar zoom for active player
        if (!this.parent.isPlayer || this.parent.playerIndex != 0)
            return;
        
        // Check if F key is pressed (key code 70)
        const pressingF = keyIsDown(70);
        
        // Set target zoom based on F key state
        if (pressingF)
        {
            // F is held - zoom out to 5x (divide scale by 5 to see more area)
            this.targetZoom = defaultCameraScale / 5;
            this.isActive = 1;
        }
        else
        {
            // F is released - zoom back to normal
            this.targetZoom = defaultCameraScale;
            this.isActive = 1;
        }
        
        // Smoothly lerp cameraScale towards target zoom
        if (this.isActive)
        {
            cameraScale += (this.targetZoom - cameraScale) * this.zoomSpeed;
            
            // If we're very close to target, snap to it (prevents infinite tiny adjustments)
            if (abs(cameraScale - this.targetZoom) < 0.1)
            {
                cameraScale = this.targetZoom;
            }
        }
    }
    
    destroy()
    {
        // Reset zoom to normal immediately when weapon is destroyed/unequipped
        if (this.isActive && this.parent && this.parent.isPlayer && this.parent.playerIndex == 0)
        {
            // If currently zoomed out, reset to default immediately
            // (Since destroy() stops update() from being called, we can't smoothly reset)
            if (cameraScale < defaultCameraScale * 0.9) // Only reset if significantly zoomed out (smaller scale)
            {
                cameraScale = defaultCameraScale;
            }
        }
        
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

class SlimeWeapon extends EngineObject 
{
    constructor(pos, parent) 
    { 
        super(pos, vec2(.6), 4, vec2(8));

        this.isWeapon = 1;
        this.fireTimeBuffer = this.localAngle = 0;
        this.burstTimer = new Timer;
        this.burstActive = 0;
        this.burstDuration = 2.5; // Longer bursts for more aggression
        this.burstCooldown = 0.8; // Shorter cooldown for more aggression
        
        this.renderOrder = parent.renderOrder+1;
        this.hidden = 1; // Don't render the weapon (slime shoots from head, not gun)

        parent.weapon = this;
        parent.addChild(this, this.localOffset = vec2(.55,0));
    }
    
    render()
    {
        // Don't render - slime shoots from head, not a visible weapon
        return;
    }

    update()
    {
        super.update();

        const particleSpeed = .3;
        const particleRate = 40; // More particles per second for aggression
        const spread = .01; // Very small spread for accurate aim

        this.mirror = this.parent.mirror;

        // Burst pattern: active for burstDuration, then cooldown
        if (!this.burstTimer.isSet())
        {
            // Start first burst
            this.burstActive = 1;
            this.burstTimer.set(this.burstDuration);
        }
        else if (this.burstTimer.elapsed())
        {
            if (this.burstActive)
            {
                // Burst finished, start cooldown
                this.burstActive = 0;
                this.burstTimer.set(this.burstCooldown);
            }
            else
            {
                // Cooldown finished, start new burst
                this.burstActive = 1;
                this.burstTimer.set(this.burstDuration);
            }
        }

        // Only shoot when parent sees player and burst is active
        if (this.parent.sawPlayerTimer && this.parent.sawPlayerTimer.isSet() && 
            this.parent.sawPlayerTimer.get() < 10 && this.burstActive)
        {
            this.fireTimeBuffer += timeDelta;
            const rate = 1/particleRate;
            
            // Get direction to player from head position
            const headPos = this.parent.pos.add(vec2(this.parent.getMirrorSign(.05), .46).scale(this.parent.sizeScale || 1));
            const playerPos = this.parent.sawPlayerPos;
            const direction = playerPos.subtract(headPos).normalize();
            
            for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
            {
                // Create slime particle from head position
                const particle = new SlimeParticle(headPos, this.parent);
                
                // Fire particle directly towards player with small spread
                // Apply small random rotation to direction vector for spread
                const spreadAngle = rand(spread, -spread);
                particle.velocity = direction.rotate(spreadAngle).scale(particleSpeed);
            }
        }
        else
        {
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
            // Face player even when not shooting
            if (this.parent.sawPlayerTimer && this.parent.sawPlayerTimer.isSet())
            {
                const playerPos = this.parent.sawPlayerPos;
                const direction = playerPos.subtract(this.pos).normalize();
                const aimAngle = direction.angle();
                this.localAngle = -aimAngle * this.getMirrorSign();
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class FoeWeapon extends EngineObject 
{
    constructor(pos, parent) 
    { 
        super(pos, vec2(.6), 4, vec2(8));

        this.isWeapon = 1;
        this.fireTimeBuffer = this.localAngle = 0;
        this.burstTimer = new Timer;
        this.burstActive = 0;
        this.burstDuration = 2.5; // Longer bursts for more aggression
        this.burstCooldown = 0.8; // Shorter cooldown for more aggression
        
        this.renderOrder = parent.renderOrder+1;
        this.hidden = 1; // Don't render the weapon (foe shoots from head, not gun)

        parent.weapon = this;
        parent.addChild(this, this.localOffset = vec2(.55,0));
    }
    
    render()
    {
        // Don't render - foe shoots from head, not a visible weapon
        return;
    }

    update()
    {
        super.update();

        const particleSpeed = .3;
        const particleRate = 60; // Higher particle rate for thicker spray
        const spread = .05; // Wider spread per spray (0.05 vs 0.01)
        const sprayAngles = [-22.5 * PI / 180, 0, 22.5 * PI / 180]; // 3 sprays at -22.5°, 0°, +22.5°

        this.mirror = this.parent.mirror;

        // Burst pattern: active for burstDuration, then cooldown
        if (!this.burstTimer.isSet())
        {
            // Start first burst
            this.burstActive = 1;
            this.burstTimer.set(this.burstDuration);
        }
        else if (this.burstTimer.elapsed())
        {
            if (this.burstActive)
            {
                // Burst finished, start cooldown
                this.burstActive = 0;
                this.burstTimer.set(this.burstCooldown);
            }
            else
            {
                // Cooldown finished, start new burst
                this.burstActive = 1;
                this.burstTimer.set(this.burstDuration);
            }
        }

        // Only shoot when parent sees player and burst is active
        if (this.parent.sawPlayerTimer && this.parent.sawPlayerTimer.isSet() && 
            this.parent.sawPlayerTimer.get() < 10 && this.burstActive)
        {
            this.fireTimeBuffer += timeDelta;
            const rate = 1/particleRate;
            
            // Get direction to player from center of foe (no head, so use center position)
            const shootPos = this.parent.pos.add(vec2(0, 0.2).scale(this.parent.sizeScale || 1)); // Center-ish position
            const playerPos = this.parent.sawPlayerPos;
            const toPlayer = playerPos.subtract(shootPos);
            const baseDirection = toPlayer.normalize();
            const baseAngle = baseDirection.angle();
            
            for(; this.fireTimeBuffer > 0; this.fireTimeBuffer -= rate)
            {
                // Create 3 simultaneous sprays at different angles, all generally toward player
                for(let sprayIndex = 0; sprayIndex < 3; sprayIndex++)
                {
                    // Calculate angle for this spray (base angle toward player + spray offset)
                    const sprayAngle = baseAngle + sprayAngles[sprayIndex];
                    // Create direction vector from angle (pointing toward player)
                    const sprayDirection = vec2(Math.cos(sprayAngle), Math.sin(sprayAngle));
                    
                    // Create slime particle from shoot position
                    const particle = new SlimeParticle(shootPos, this.parent);
                    
                    // Make particles thicker (larger size)
                    particle.size = particle.size.scale(1.5); // 1.5x larger particles
                    
                    // Fire particle in spray direction with spread (spread is relative to spray direction)
                    const spreadAngle = rand(spread, -spread);
                    particle.velocity = sprayDirection.rotate(spreadAngle).scale(particleSpeed);
                }
            }
        }
        else
        {
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
            // Face player even when not shooting
            if (this.parent.sawPlayerTimer && this.parent.sawPlayerTimer.isSet())
            {
                const playerPos = this.parent.sawPlayerPos;
                const direction = playerPos.subtract(this.pos).normalize();
                const aimAngle = direction.angle();
                this.localAngle = -aimAngle * this.getMirrorSign();
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class SlimeParticle extends EngineObject 
{
    constructor(pos, attacker) 
    { 
        super(pos, vec2(.15));
        this.color = new Color(0, 1, 0, 0.8);
        this.setCollision();

        this.damage = 0.5; // Lower damage per particle but many particles
        this.damping = 0.98;
        this.gravityScale = 0.1; // Slight gravity
        this.attacker = attacker;
        this.team = attacker.team;
        this.renderOrder = 1e9;
        this.lifetime = 2.0; // How long particle lives
        this.spawnTime = time;
        this.hasHit = []; // Track what we've hit to avoid multiple hits
    }

    update()
    {
        super.update();

        // Check lifetime
        if (time - this.spawnTime > this.lifetime)
        {
            this.destroy();
            return;
        }

        // check if hit someone
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject && !o.parent && o.team != this.team)
            {
                // Check if we've already hit this object
                if (this.hasHit.indexOf(o) >= 0)
                    return;
                    
                if (!o.dodgeTimer || !o.dodgeTimer.active())
                {
                    this.collideWithObject(o);
                    this.hasHit.push(o);
                }
            }
        });
    }
    
    collideWithObject(o)
    {
        if (o.isGameObject)
        {
            o.damage(this.damage, this);
            o.applyForce(this.velocity.scale(.05));
            // Don't destroy on hit - particles can hit multiple times
        }
    
        return 1; 
    }

    collideWithTile(data, pos)
    {
        if (data <= 0)
            return 0;
            
        // Slime particles stick to walls briefly
        this.velocity = this.velocity.scale(0.3);
        this.damping = 0.9;
        
        // Small chance to destroy weak tiles
        const destroyTileChance = data == tileType_glass ? 0.1 : data == tileType_dirt ? 0.05 : 0;
        rand() < destroyTileChance && destroyTile(pos);

        return 0; // Don't stop particle, just slow it
    }

    render()
    {
        // Draw as green translucent blob
        setBlendMode(0);
        const alpha = 0.8 * (1 - (time - this.spawnTime) / this.lifetime);
        const particleColor = new Color(0, 1, 0, alpha);
        drawTile(this.pos, this.size, -1, undefined, particleColor);
        setBlendMode(0);
    }
}