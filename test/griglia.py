#!/usr/bin/env python3
"""Compone test/shot-grid-<tema>.png (da test/shots.js) in un unico foglio 3x6: test/griglia-template.png."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ['classic', 'notebook', 'blackboard', 'coffee', 'night', 'tvshow', 'space', 'synth', 'ocean', 'jungle',
         'spring', 'summer', 'autumn', 'winter', 'rainbow', 'candy', 'halloween', 'christmas']
CW, CH, LBL = 470, 329, 26
COLS = 3
rows = (len(ORDER) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * CW, rows * (CH + LBL)), (245, 245, 245))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
except Exception:
    font = ImageFont.load_default()
for i, th in enumerate(ORDER):
    p = os.path.join(HERE, 'shot-grid-%s.png' % th)
    if not os.path.exists(p):
        print('manca', p); continue
    im = Image.open(p).convert('RGB')
    im.thumbnail((CW, CH))
    x, y = (i % COLS) * CW, (i // COLS) * (CH + LBL)
    draw.text((x + 8, y + 5), th, fill=(30, 30, 30), font=font)
    sheet.paste(im, (x, y + LBL))
out = os.path.join(HERE, 'griglia-template.png')
sheet.save(out)
print('scritto', out, sheet.size)
