#!/bin/bash
# Batch convert all FBX models to GLB and TGA textures to PNG
# Skips Cat and Wolf (already done)

BLENDER="C:/Program Files/Blender Foundation/Blender 4.1/blender.exe"
ROOT="C:/Users/Jamonnin/Documents/RunKittyRun"
BUNDLE="$ROOT/StylizedFantasyCreaturesBundle"
OUTDIR="$ROOT/public/models"

CREATURES=(Bat Bear Boar Chicken Cow Crocodile Eagle Goat HermitCrab Pig Sheep SmallDinosaur Snail Snake Spider Tiger Toad Turtle Wasp)

for creature in "${CREATURES[@]}"; do
    lower=$(echo "$creature" | tr 'A-Z' 'a-z')
    echo "=== Converting $creature ==="

    # Create output dir
    mkdir -p "$OUTDIR/$lower"

    # Convert FBX to GLB
    fbx="$BUNDLE/Meshes/$creature/$creature.fbx"
    glb="$OUTDIR/$lower/$creature.glb"
    if [ -f "$fbx" ]; then
        echo "  FBX -> GLB"
        "$BLENDER" --background --python "$ROOT/convert_fbx.py" -- "$fbx" "$glb" 2>&1 | grep -E "Converted|Error"
    else
        echo "  No FBX found at $fbx"
    fi

    # Convert all TGA textures to PNG
    texdir="$BUNDLE/Textures/$creature"
    if [ -d "$texdir" ]; then
        for tga in "$texdir"/*.tga; do
            [ -f "$tga" ] || continue
            basename=$(basename "$tga" .tga)
            png="$OUTDIR/$lower/$basename.png"
            echo "  TGA: $basename"
            "$BLENDER" --background --python "$ROOT/convert_tga.py" -- "$tga" "$png" 2>&1 | grep -E "Converted|Error"
        done
    else
        echo "  No textures found at $texdir"
    fi
done

echo "=== Done ==="
