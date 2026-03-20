"""
Blender CLI script to convert TGA files to PNG.
Usage: blender --background --python convert_tga.py -- <input.tga> <output.png>
"""
import bpy
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:]
tga_path = argv[0]
png_path = argv[1]

img = bpy.data.images.load(tga_path)
img.file_format = 'PNG'
img.save_render(filepath=png_path)

print(f"Converted {tga_path} -> {png_path}")
