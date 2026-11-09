# compose.py (run beside before/ and after/ PNG folders): numbered before|after stills (the env audit's numbers) into ~/Desktop/cosquest-review/env-fixes-1-4
import os
from PIL import Image, ImageDraw, ImageFont
S=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.expanduser("~/Desktop/cosquest-review/env-fixes-1-4")
def font(sz):
    for f in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf","/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(f): return ImageFont.truetype(f,sz)
    return ImageFont.load_default()
F=font(22); FS=font(17)
def load(side,n): return Image.open(f"{S}/{side}/{n}.png").convert("RGB")
def pair(num,slug,title,a,b,la="BEFORE (game-depth e47c36b)",lb="AFTER (env-fixes-1-4)",crop=None,scale=1.0,colw=None):
    if crop:
        a=a.crop(crop); b=b.crop(crop)
    if scale!=1.0:
        a=a.resize((int(a.width*scale),int(a.height*scale)),Image.LANCZOS)
        b=b.resize((int(b.width*scale),int(b.height*scale)),Image.LANCZOS)
    if b.size!=a.size: b=b.resize(a.size,Image.LANCZOS)
    w,h=a.size; gap=10; top=40; lab=30
    o=Image.new("RGB",(w*2+gap,h+top+lab),(17,18,24)); d=ImageDraw.Draw(o)
    d.text((10,8),f"{num} {title}",font=F,fill=(255,255,255))
    d.text((10,top+4),la,font=FS,fill=(255,170,150)); d.text((w+gap+10,top+4),lb,font=FS,fill=(150,240,170))
    o.paste(a,(0,top+lab)); o.paste(b,(w+gap,top+lab))
    p=f"{OUT}/{num}-{slug}.jpg"
    for q in (88,82,76,70,64,58,50):
        o.save(p,quality=q,optimize=True)
        if os.path.getsize(p)<=300*1024: break
    print(p, o.size, os.path.getsize(p)//1024, "KB q", q)
H=0.62   # full frames at 0.62 (two 720x1280 side by side)
full=[
 ("03","street_fight_4.0s","street_fight_4.0s","Default street, fight camera: less lilac, real darks, halos and bloom 40 % lower"),
 ("04","street_low","street_low_1.0s","Street, low: a drawn dusk sky, not a flat colour"),
 ("05","street_ground","street_ground_1.0s","Street, ground close-up: neutral paving, no lilac"),
 ("06","street_wide","street_wide_1.0s","Street, wide: the ground and fog run on to the sky, no edge"),
 ("07","street_post","street_post_4.0s","Street, opt-in post stack (glow, grade, shadows): the new warm/cool grade"),
 ("08","traf_fly_0.2s","traf_fly_0.2s","Trafalgar fly-in 0.2 s: sky, horizon band, fogged far city"),
 ("09","traf_fly_1.2s","traf_fly_1.2s","Trafalgar fly-in 1.2 s: warm windows, bronze no longer black"),
 ("10","traf_fly_2.4s","traf_fly_2.4s","Trafalgar fly-in 2.4 s: the fly-in now lands on a frame with the column"),
 ("11","traf_fly_6.0s","traf_fly_6.0s","Trafalgar fight camera: 27 deg, the column and skyline at the top, faint ring not the medallion"),
 ("12","traf_low","traf_low_1.0s","Trafalgar low: sky, horizon haze, warm windows"),
 ("13","traf_wide","traf_wide_1.0s","Trafalgar wide: aerial perspective, the ground no longer ends"),
 ("14","traf_post","traf_post_4.0s","Trafalgar, opt-in post stack, fight camera"),
 ("15","traf_overhead","traf_overhead_0.5s","Trafalgar overhead: roads lit as ground (were navy), ground to the fog"),
 ("16","times_square_fly_1.8s","times_square_fly_1.8s","Times Square fly-in: roads no longer navy, sky and haze"),
 ("17","times_square_low","times_square_low_1.0s","Times Square low"),
 ("18","times_square_fly_6.0s","times_square_fly_6.0s","Times Square fight camera: skyline in the top of the frame"),
 ("19","shoreditch_fly_1.8s","shoreditch_fly_1.8s","Shoreditch fly-in: no pink cast on the brick and stucco"),
 ("20","shoreditch_low","shoreditch_low_1.0s","Shoreditch low: a lit side and a shadow side"),
 ("21","palo_alto_fly_0.3s","palo_alto_fly_0.3s","Palo Alto fly-in start: sky instead of a flat slab"),
 ("22","palo_alto_low","palo_alto_low_1.0s","Palo Alto low: warm windows at random dim levels"),
]
for num,slug,n,title in full:
    pair(num,slug,title,load("before",n),load("after",n),scale=H)
# zooms (same crops on both sides, 2x)
pair("23","zoom-windows","ZOOM windows: warm interiors at 3 tints and random dim levels, clamped (were white/navy)",
     load("before","palo_alto_low_1.0s"),load("after","palo_alto_low_1.0s"),crop=(0,230,300,450),scale=2.0)
pair("24","zoom-bronze","ZOOM Nelson's Column pedestal: bronze no longer black, reliefs not drawn as blocks",
     load("before","traf_fly_1.2s"),load("after","traf_fly_1.2s"),crop=(230,820,470,1100),scale=1.6)
pair("25","zoom-halo","ZOOM lamp + sign halo (llvmpipe): 40 % lower, clamped. The real test is the phone",
     load("before","street_fight_4.0s"),load("after","street_fight_4.0s"),crop=(40,200,340,480),scale=2.0)
pair("26","zoom-road","ZOOM Times Square road: lit asphalt (the navy was the road's faces pointing down)",
     load("before","times_square_fly_6.0s"),load("after","times_square_fly_6.0s"),crop=(0,700,360,1000),scale=1.6)
pair("27","zoom-aa","ZOOM resolution + AA: before 0.5 scale, no AA | after DEVICE profile 0.75 + MSAA 2x",
     load("before","street_low_1.0s"),load("after","street_low_dev_1.0s"),lb="AFTER, quality device (0.75 + MSAA 2x)",crop=(0,60,300,410),scale=2.0)
# extras
pair("28","device-fight-street","Device profile on the fight camera (forced on llvmpipe): 0.75 + MSAA 2x",
     load("after","street_fight_4.0s"),load("after","street_fight_dev_4.0s"),la="AFTER, capture profile (0.5, no AA)",lb="AFTER, device profile (0.75 + MSAA 2x)",scale=H)
pair("29","device-fight-traf","Device profile, Trafalgar fight camera",
     load("after","traf_fly_6.0s"),load("after","traf_fight_dev_4.0s"),la="AFTER, capture profile (fly-in end, 6.0 s)",lb="AFTER, device profile (no fly-in, 4.0 s)",scale=H)
pair("30","dusk-vs-day","The two presets: look time dusk (default) and day",
     load("after","traf_fly_1.2s"),load("after","traf_day_fly_1.2s"),la="AFTER, dusk (default)",lb="AFTER, look {\"time\": \"day\"}",scale=H)
