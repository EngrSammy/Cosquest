# compose.py <shots root with before/ and after/> <out dir>: look-world's numbered stills (03 to 33, same specs),
# BEFORE (integration-20261103 c9eb53b: look-world at its head, with its last three tweaks) | AFTER (day1-world),
# each a jpg of 300 KB or less; then the hero landmark shots from 34 on.
import os, sys
from PIL import Image, ImageDraw, ImageFont
S=sys.argv[1]; OUT=sys.argv[2]; os.makedirs(OUT, exist_ok=True)
def font(sz):
    for f in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf","/System/Library/Fonts/Helvetica.ttc","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(f): return ImageFont.truetype(f,sz)
    return ImageFont.load_default()
F=font(22); FS=font(17)
def load(side,n): return Image.open(f"{S}/{side}/{n}.png").convert("RGB")
LA="BEFORE (integration c9eb53b)"; LB="AFTER (day1-world)"
def pair(num,slug,title,a,b,la=LA,lb=LB,crop=None,scale=0.62):
    if crop: a=a.crop(crop); b=b.crop(crop)
    a=a.resize((int(a.width*scale),int(a.height*scale)),Image.LANCZOS); b=b.resize((int(b.width*scale),int(b.height*scale)),Image.LANCZOS)
    if b.size!=a.size: b=b.resize(a.size,Image.LANCZOS)
    w,h=a.size; gap=10; top=40; lab=30
    o=Image.new("RGB",(w*2+gap,h+top+lab),(17,18,24)); d=ImageDraw.Draw(o)
    d.text((10,8),f"{num} {title}",font=F,fill=(255,255,255))
    d.text((10,top+4),la,font=FS,fill=(255,170,150)); d.text((w+gap+10,top+4),lb,font=FS,fill=(150,240,170))
    o.paste(a,(0,top+lab)); o.paste(b,(w+gap,top+lab))
    p=f"{OUT}/{num}-{slug}.jpg"
    for q in (88,82,76,70,64,58,50,44):
        o.save(p,quality=q,optimize=True)
        if os.path.getsize(p)<=300*1024: break
    print(p, os.path.getsize(p)//1024, "KB")
full=[
 ("03","street_fight_4.0s","Street, fight cam: built by the place kit, Golden light"),
 ("04","street_low_1.0s","Street, low: shopfronts, cornices, clock tower"),
 ("05","street_ground_1.0s","Street ground: York stone flags, 256 px/m, wear"),
 ("06","street_wide_1.0s","Street wide: cross street, zebras, beacons, cars"),
 ("07","street_post_4.0s","Street, opt-in post stack"),
 ("08","traf_fly_0.2s","Trafalgar fly-in 0.2 s: column kit, birds"),
 ("09","traf_fly_1.2s","Trafalgar 1.2 s: stone + brick sheets, lions"),
 ("10","traf_fly_2.4s","Trafalgar 2.4 s: lions, fountains, lamps, trees"),
 ("11","traf_fly_6.0s","Trafalgar fight cam (pitch 30), baked shade"),
 ("12","traf_low_1.0s","Trafalgar low: plaza stone, granite, bronze"),
 ("13","traf_wide_1.0s","Trafalgar wide: the square, lions, skyline"),
 ("14","traf_post_4.0s","Trafalgar, opt-in post stack"),
 ("15","traf_overhead_0.5s","Trafalgar overhead: land use, baked shadows"),
 ("16","times_square_fly_1.8s","Times Square fly-in: NY sheets, lamps, cabs"),
 ("17","times_square_low_1.0s","Times Square low: asphalt, no navy"),
 ("18","times_square_fly_6.0s","Times Square fight cam: a dressed avenue"),
 ("19","shoreditch_fly_1.8s","Shoreditch fly-in: London brick, sashes"),
 ("20","shoreditch_low_1.0s","Shoreditch low: brick, parked cars"),
 ("21","palo_alto_fly_0.3s","Palo Alto 0.3 s: stucco, palms, cypress"),
 ("22","palo_alto_low_1.0s","Palo Alto low: US-west sheet"),
]
for num,n,title in full:
    pair(num,n.rsplit("_",1)[0] if n.endswith("s") else n,title,load("before",n),load("after",n))
pair("23","zoom-facade","ZOOM facade: 4.4 px/m vs 128 px/m trim sheet",
     load("before","shoreditch_low_1.0s"),load("after","shoreditch_low_1.0s"),crop=(380,60,720,440),scale=1.6)
pair("24","zoom-landmark","ZOOM pedestal: boxes vs the landmark kit",
     load("before","traf_low_1.0s"),load("after","traf_low_1.0s"),crop=(140,0,580,420),scale=1.4)
pair("25","zoom-props","ZOOM the square's dressing",
     load("before","traf_fly_2.4s"),load("after","traf_fly_2.4s"),crop=(0,280,360,640),scale=1.6)
pair("26","zoom-road","ZOOM road: slab vs asphalt, kerbs, shade",
     load("before","times_square_fly_6.0s"),load("after","times_square_fly_6.0s"),crop=(0,560,360,900),scale=1.6)
pair("27","zoom-street","ZOOM street: toy kit vs place kit",
     load("before","street_low_1.0s"),load("after","street_low_1.0s"),crop=(0,60,360,460),scale=1.6)
pair("28","times-square-street","Times Square from 30 m",
     load("before","ts_street_1.0s"),load("after","ts_street_1.0s"))
pair("29","traf-kit","Trafalgar at 26 m, 14 deg",
     load("before","traf_kit_1.0s"),load("after","traf_kit_1.0s"))
pair("30","golden-dusk-day","Presets: Golden (default) | Dusk",
     load("after","traf_fly_1.2s"),load("after","traf_dusk_fly_1.2s"),la="AFTER, Golden (default by day)",lb="AFTER, Dusk (round sunset)")
pair("31","day","Day preset (optional), before vs after",
     load("before","traf_day_fly_1.2s"),load("after","traf_day_fly_1.2s"))
pair("32","street-dusk","The street at Dusk",
     load("before","street_fight_4.0s"),load("after","street_dusk_4.0s"),la="BEFORE (dusk was the only look)",lb="AFTER, Dusk")
pair("33","device-profile","Device profile on the software GPU",
     load("before","traf_fight_dev_4.0s"),load("after","traf_fight_dev_4.0s"))

n=34
for k,title in [("westminster","Westminster: Elizabeth Tower"),("times_hero","Times Square: the screen tower and canyon"),
                ("stanford","Stanford: Hoover Tower"),("lagos","Lagos: the National Arts Theatre")]:
    for shot,what in [("fly_0.3s","fly-in 0.3 s"),("fly_1.8s","fly-in 1.8 s"),("fight_4.0s","fight camera")]:
        pair(str(n),k+"-"+shot.replace("_","-"),title+", "+what,load("before",k+"_"+shot),load("after",k+"_"+shot))
        n+=1
