/*
    LittleJS Drawing System

    - Super fast tile sheet rendering
    - Utility functions for webgl
    - Adapted from Tiny-Canvas https://github.com/bitnenfer/tiny-canvas
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////\

const screenToWorld = (screenPos)=>
    screenPos.add(vec2(.5)).subtract(mainCanvasSize.scale(.5)).multiply(vec2(1/cameraScale,-1/cameraScale)).add(cameraPos);
const worldToScreen = (worldPos)=>
    worldPos.subtract(cameraPos).multiply(vec2(cameraScale,-cameraScale)).add(mainCanvasSize.scale(.5)).subtract(vec2(.5));

// draw textured tile centered on pos
function drawTile(pos, size=vec2(1), tileIndex=-1, tileSize=defaultTileSize, color=new Color, angle=0, mirror, 
    additiveColor=new Color(0,0,0,0))
{
    if (!size.x  | !size.y)
        return;
        
    showWatermark && ++drawCount;
    if (glEnable)
    {
        if (tileIndex < 0)
        {
            // if negative tile index, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, 0, color.rgbaInt()); 
        }
        else
        {
            // calculate uvs and render
            const cols = tileImage.width / tileSize.x |0;
            const uvSizeX = tileSize.x * tileImageSizeInverse.x;
            const uvSizeY = tileSize.y * tileImageSizeInverse.y;
            const uvX = (tileIndex%cols)*uvSizeX, uvY = (tileIndex/cols|0)*uvSizeY;
            glDraw(pos.x, pos.y, size.x, size.y, angle, mirror, 
                uvX, uvY, uvX + uvSizeX, uvY + uvSizeY, color.rgbaInt(), additiveColor.rgbaInt()); 
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // if negative tile index, force untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                // calculate uvs and render
                const cols = tileImage.width / tileSize.x |0;
                const sX = (tileIndex%cols)*tileSize.x   + tileBleedShrinkFix;
                const sY = (tileIndex/cols|0)*tileSize.y + tileBleedShrinkFix;
                const sWidth  = tileSize.x - 2*tileBleedShrinkFix;
                const sHeight = tileSize.y - 2*tileBleedShrinkFix;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(tileImage, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            }
        });
    }
}

// draw a colored untextured rect centered on pos
function drawRect(pos, size, color, angle)
{
    drawTile(pos, size, -1, defaultTileSize, color, angle);
}

// draw textured tile centered on pos in screen space
function drawTileScreenSpace(pos, size=vec2(1), tileIndex, tileSize, color, angle, mirror, additiveColor)
{
    drawTile(screenToWorld(pos), size.scale(1/cameraScale), tileIndex, tileSize, color, angle, mirror, additiveColor);
}

// draw a colored untextured rect in screen space
function drawRectScreenSpace(pos, size, color, angle)
{
    drawTileScreenSpace(pos, size, -1, defaultTileSize, color, angle);
}

// draw textured tile from tiles2.png centered on pos
function drawTile2(pos, size=vec2(1), tileIndex=-1, tileSize=defaultTileSize, color=new Color, angle=0, mirror, 
    additiveColor=new Color(0,0,0,0))
{
    if (!size.x  | !size.y)
        return;
    
    // Check if tiles2.png is loaded and size info is available
    if (!tileImage2 || !tileImage2.complete || !tileImage2.width || !tileImage2SizeInverse)
        return; // Image not loaded yet, skip rendering
        
    showWatermark && ++drawCount;
    if (glEnable)
    {
        if (tileIndex < 0)
        {
            // if negative tile index, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, 0, color.rgbaInt()); 
        }
        else
        {
            // calculate uvs and render from tiles2.png
            const cols = tileImage2.width / tileSize.x |0;
            const uvSizeX = tileSize.x * tileImage2SizeInverse.x;
            const uvSizeY = tileSize.y * tileImage2SizeInverse.y;
            const uvX = (tileIndex%cols)*uvSizeX, uvY = (tileIndex/cols|0)*uvSizeY;
            // Note: glDraw would need to support second texture, for now use canvas fallback
            // This is a simplified version - full WebGL support would require texture binding
            drawCanvas2D(pos, size, angle, mirror, (context)=>
            {
                const sX = (tileIndex%cols)*tileSize.x   + tileBleedShrinkFix;
                const sY = (tileIndex/cols|0)*tileSize.y + tileBleedShrinkFix;
                const sWidth  = tileSize.x - 2*tileBleedShrinkFix;
                const sHeight = tileSize.y - 2*tileBleedShrinkFix;
                context.globalAlpha = color.a;
                context.drawImage(tileImage2, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            });
        }
    }
    else
    {
        // normal canvas 2D rendering method
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // if negative tile index, force untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                // calculate uvs and render from tiles2.png
                const cols = tileImage2.width / tileSize.x |0;
                const sX = (tileIndex%cols)*tileSize.x   + tileBleedShrinkFix;
                const sY = (tileIndex/cols|0)*tileSize.y + tileBleedShrinkFix;
                const sWidth  = tileSize.x - 2*tileBleedShrinkFix;
                const sHeight = tileSize.y - 2*tileBleedShrinkFix;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(tileImage2, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            }
        });
    }
}

// draw a colored line between two points
function drawLine(posA, posB, thickness=.1, color)
{
    const halfDelta = vec2((posB.x - posA.x)*.5, (posB.y - posA.y)*.5);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle());
}

// draw directly to the 2d canvas in world space (bipass webgl)
function drawCanvas2D(pos, size, angle, mirror, drawFunction)
{
    // create canvas transform from world space to screen space
    pos = worldToScreen(pos);
    size = size.scale(cameraScale);
    mainContext.save();
    mainContext.translate(pos.x+.5|0, pos.y-.5|0);
    mainContext.rotate(angle);
    mainContext.scale(mirror?-size.x:size.x, size.y);
    drawFunction(mainContext);
    mainContext.restore();
}

// draw text in world space without canvas scaling because that messes up fonts
function drawText(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=defaultFont)
{
    pos = worldToScreen(pos);
    mainContext.font = size*cameraScale + 'px '+ font;
    mainContext.textAlign = textAlign;
    mainContext.textBaseline = 'middle';
    if (lineWidth)
    {
        mainContext.lineWidth = lineWidth*cameraScale;
        mainContext.strokeStyle = lineColor.rgba();
        mainContext.strokeText(text, pos.x, pos.y);
    }
    mainContext.fillStyle = color.rgba();
    mainContext.fillText(text, pos.x, pos.y);
}

// enable additive or regular blend mode
function setBlendMode(additive)
{
    glEnable ? glSetBlendMode(additive) : mainContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}