extends SceneTree
## look-world: bakes the kit's procedural meshes (world_landmarks.gd, world_props.gd) into
## art/world/kit/<kind>_<variant>.res, so a place loads them instead of building them (~100 ms).
##   godot --headless --path app/game3d -s res://tools/world/bake_kit.gd
## Rerun after changing either kit script.

const Landmarks := preload("res://world_landmarks.gd")
const Props := preload("res://world_props.gd")


func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute("res://art/world/kit")
	var jobs: Array = []
	for k: String in ["column", "obelisk", "lion", "fountain", "memorial", "clock_tower"]:
		jobs.append([Landmarks, k, 0])
	for v in 3:
		jobs.append([Landmarks, "statue", v])
	for k: String in ["lamp_uk", "lamp_us", "lamp_lagos", "bench", "bin", "bollard", "traffic_light_uk", "traffic_light_us",
			"planter", "phone_box_uk", "post_box_uk", "hydrant_us", "belisha", "bus_stop", "bird"]:
		jobs.append([Props, k, 0])
	for k: String in ["ac_unit", "vent", "water_tank_us", "chimney_uk", "dish", "water_tank_lagos", "roof_plant"]:
		for v in 2:
			jobs.append([Props, k, v])
	for c: String in ["temperate_maritime", "humid_continental", "mediterranean", "tropical"]:
		for k: String in Props.species(c):
			for v in 2:
				jobs.append([Props, k, v])
	var n: int = 0
	var tris: int = 0
	for j: Array in jobs:
		var m: ArrayMesh = (j[0] as GDScript).call("build", j[1], j[2])
		if m == null:
			print("BAKEKIT missing %s" % j[1])
			continue
		for s in m.get_surface_count():
			tris += (m.surface_get_arrays(s)[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
		ResourceSaver.save(m, "res://art/world/kit/%s_%d.res" % [j[1], j[2]], ResourceSaver.FLAG_COMPRESS)
		n += 1
	print("BAKEKIT done meshes=%d tris=%d" % [n, tris])
	quit()
