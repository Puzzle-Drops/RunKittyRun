"""
Blender CLI script to convert FBX to GLB.
Usage: blender --background --python convert_fbx.py -- <input.fbx> <output.glb>
"""
import bpy
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:]
fbx_path = argv[0]
glb_path = argv[1]

# Clear default scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import FBX
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)

# Export GLB with animations
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
)

print(f"Converted {fbx_path} -> {glb_path}")
