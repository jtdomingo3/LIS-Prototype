Place Windows icon files here before building.

Required:
- icon.ico  (Windows .ico for installer and app)

Optional:
- icon_2.6.356.png

You can generate .ico from a PNG via many online tools or ImageMagick:

Windows (with ImageMagick installed):
magick convert icon_2.6.356.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico

