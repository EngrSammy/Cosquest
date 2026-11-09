# env-fixes-1-4: the env-audit specs (~/cq-work/env-audit/mkspec.py) unchanged, written to OUT, plus the
# audit still 15 (019 cap/place_overhead.json) and a few extra views (device quality, day).
import json, os, sys
OUT=sys.argv[1]; only=sys.argv[2].split(",") if len(sys.argv)>2 else None
W="/home/engineer/cq-work/019-game-depth-scope-and-build"
M="/home/engineer/cq-work/016-game-quality-r3-polish/models/pose"
A="/home/engineer/cq-work/env-audit"
base={"hero_glb":f"{M}/armstrong/lod1.glb","ally_glb":f"{M}/nebulx/lod1.glb","enemy_glb":f"{M}/elvis/lod1.glb",
 "hero_name":"Armstrong","ally_name":"Nebul-X","enemy_name":"Elvis","players_text":"2/2","autoplay":True,"seed":233,
 "load_thread":False,"hero_key":"armstrong","ally_key":"nebulx","enemy_key":"elvis",
 "hero_weapon":{"glb":f"{W}/app/app/assets/weapons/forge_warhammer.glb","class":"hammer"},
 "enemy_weapon":{"glb":f"{W}/app/app/assets/weapons/crown_greatsword.glb","class":"greatsword"},"dyn_res":False}
def place(name,f,at=(0,0)):
    return {"arena":"place","ground_json":f,"place_at":list(at),"point_name":name}
TR=f"{W}/osm/trafalgar_ground.json"
specs={
 "street_fight": ({}, [0.5,4.0,8.0], 9),
 "street_low":   ({"autoplay":False,"bot":"idle","cam_pitch":10,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2),
 "street_ground":({"autoplay":False,"bot":"idle","cam_pitch":60,"cam_dist":5,"cam_ahead":0,"cam_hero_only":True,"fx_visible":False}, [1.0], 2),
 "street_wide":  ({"autoplay":False,"bot":"idle","cam_pitch":22,"cam_dist":45,"cam_ahead":0}, [1.0], 2),
 "street_post":  ({"look":{"glow":True,"grade":True,"fog":True,"shadows":True}}, [4.0], 5),
 "traf_fly":     ({**place("Trafalgar Square",TR,(4.9,-4.0))}, [0.2,1.2,2.4,3.3,6.0,10.0], 11),
 "traf_low":     ({**place("Trafalgar Square",TR,(4.9,-4.0)),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":8,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2),
 "traf_wide":    ({**place("Trafalgar Square",TR,(4.9,-4.0)),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":25,"cam_dist":70,"cam_ahead":0}, [1.0], 2),
 "traf_post":    ({**place("Trafalgar Square",TR,(4.9,-4.0)),"intro":False,"look":{"glow":True,"grade":True,"fog":True,"shadows":True}}, [4.0], 5),
 # audit still 15 (019 cap/place_overhead.json)
 "traf_overhead":({**place("Trafalgar Square",TR,(4.9,-4.0)),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":88.0,"cam_dist":150.0,"cam_yaw":12.0,"cam_ahead":0.0,"render_scale":1.0}, [0.5], 1.5),
 # extras: device quality (render scale 0.75 + MSAA 2x, forced on the software GPU), and the day preset
 "street_fight_dev": ({"quality":"device"}, [4.0], 5),
 "street_low_dev": ({"autoplay":False,"bot":"idle","cam_pitch":10,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True,"quality":"device"}, [1.0], 2),
 "traf_fight_dev":   ({**place("Trafalgar Square",TR,(4.9,-4.0)),"intro":False,"quality":"device"}, [4.0], 5),
 "traf_day_fly":     ({**place("Trafalgar Square",TR,(4.9,-4.0)),"look":{"time":"day"}}, [1.2,6.0], 7),
}
for k in ["times_square","palo_alto","shoreditch"]:
    g=f"{A}/osm/{k}.json"; nm=k.replace("_"," ").title()
    specs[k+"_fly"]=({**place(nm,g)}, [0.3,1.8,6.0], 7)
    specs[k+"_low"]=({**place(nm,g),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":8,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2)
os.makedirs(f"{OUT}/spec",exist_ok=True); os.makedirs(f"{OUT}/shots",exist_ok=True); os.makedirs(f"{OUT}/logs",exist_ok=True)
for n,(ov,times,q) in specs.items():
    if only and n not in only: continue
    cfg={**base,"point_name":"Unity Plaza",**ov}
    json.dump({"config":cfg,"dir":f"{OUT}/shots","prefix":n,"lead":0.0 if n.endswith("_fly") else (0.5 if n=="traf_overhead" else 1.0),"times":times,"quit_after":q},open(f"{OUT}/spec/{n}.json","w"))
print(len(specs))
