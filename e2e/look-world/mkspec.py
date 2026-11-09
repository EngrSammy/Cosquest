# look-world: the env-audit capture specs (env-fixes-1-4 mkspec.py: same cameras, seed, times), with the
# inputs (models, weapons, OSM ground) read from one rig folder RIG (default ~/cq-work/look-world-rig),
# plus a few look-world extras (day preset, device profile, close views of the new kit).
#   python3 mkspec.py <out dir> [name,name,...]
import json, os, sys
OUT=sys.argv[1]; only=sys.argv[2].split(",") if len(sys.argv)>2 else None
R=os.environ.get("RIG", os.path.expanduser("~/cq-work/look-world-rig"))
M=f"{R}/models"; WP=f"{R}/weapons"; O=f"{R}/osm"
base={"hero_glb":f"{M}/armstrong/lod1.glb","ally_glb":f"{M}/nebulx/lod1.glb","enemy_glb":f"{M}/elvis/lod1.glb",
 "hero_name":"Armstrong","ally_name":"Nebul-X","enemy_name":"Elvis","players_text":"2/2","autoplay":True,"seed":233,
 "load_thread":False,"hero_key":"armstrong","ally_key":"nebulx","enemy_key":"elvis",
 "hero_weapon":{"glb":f"{WP}/forge_warhammer.glb","class":"hammer"},
 "enemy_weapon":{"glb":f"{WP}/crown_greatsword.glb","class":"greatsword"},"dyn_res":False}
def place(name,f,at=(0,0)):
    return {"arena":"place","ground_json":f,"place_at":list(at),"point_name":name}
TR=f"{O}/trafalgar_ground.json"
T=place("Trafalgar Square",TR,(4.9,-4.0))
specs={
 "street_fight": ({}, [0.5,4.0,8.0], 9),
 "street_low":   ({"autoplay":False,"bot":"idle","cam_pitch":10,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2),
 "street_ground":({"autoplay":False,"bot":"idle","cam_pitch":60,"cam_dist":5,"cam_ahead":0,"cam_hero_only":True,"fx_visible":False}, [1.0], 2),
 "street_wide":  ({"autoplay":False,"bot":"idle","cam_pitch":22,"cam_dist":45,"cam_ahead":0}, [1.0], 2),
 "street_post":  ({"look":{"glow":True,"grade":True,"fog":True,"shadows":True}}, [4.0], 5),
 "traf_fly":     ({**T}, [0.2,1.2,2.4,3.3,6.0,10.0], 11),
 "traf_low":     ({**T,"intro":False,"autoplay":False,"bot":"idle","cam_pitch":8,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2),
 "traf_wide":    ({**T,"intro":False,"autoplay":False,"bot":"idle","cam_pitch":25,"cam_dist":70,"cam_ahead":0}, [1.0], 2),
 "traf_post":    ({**T,"intro":False,"look":{"glow":True,"grade":True,"fog":True,"shadows":True}}, [4.0], 5),
 "traf_overhead":({**T,"intro":False,"autoplay":False,"bot":"idle","cam_pitch":88.0,"cam_dist":150.0,"cam_yaw":12.0,"cam_ahead":0.0,"render_scale":1.0}, [0.5], 1.5),
 "street_fight_dev": ({"quality":"device"}, [4.0], 5),
 "traf_fight_dev":   ({**T,"intro":False,"quality":"device"}, [4.0], 5),
 "traf_day_fly":     ({**T,"look":{"time":"day"}}, [1.2,6.0], 7),
 "traf_dusk_fly":    ({**T,"look":{"time":"dusk"}}, [1.2,6.0], 7),
 "street_dusk":      ({"look":{"time":"dusk"}}, [4.0], 5),
 # look-world extras: closer views of the new ground, kit and props
 "traf_kit":      ({**T,"intro":False,"autoplay":False,"bot":"idle","cam_pitch":14,"cam_dist":26,"cam_ahead":0,"cam_yaw":12.0}, [1.0], 2),
 "ts_street":     ({**place("Times Square",f"{O}/times_square.json"),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":30,"cam_dist":30,"cam_ahead":0}, [1.0], 2),
}
for k in ["times_square","palo_alto","shoreditch"]:
    g=f"{O}/{k}.json"; nm=k.replace("_"," ").title()
    specs[k+"_fly"]=({**place(nm,g)}, [0.3,1.8,6.0], 7)
    specs[k+"_low"]=({**place(nm,g),"intro":False,"autoplay":False,"bot":"idle","cam_pitch":8,"cam_dist":9,"cam_ahead":0,"cam_hero_only":True}, [1.0], 2)
for d in ("spec","shots","logs"): os.makedirs(f"{OUT}/{d}",exist_ok=True)
n=0
for k,(ov,times,q) in specs.items():
    if only and k not in only: continue
    cfg={**base,"point_name":"Unity Plaza",**ov}
    json.dump({"config":cfg,"dir":f"{OUT}/shots","prefix":k,"lead":0.0 if k.endswith("_fly") else (0.5 if k=="traf_overhead" else 1.0),"times":times,"quit_after":q},open(f"{OUT}/spec/{k}.json","w"))
    n+=1
print(n)
