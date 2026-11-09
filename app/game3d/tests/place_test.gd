extends SceneTree
## The real place round a fight (cq 019, docs/game3d/PLACE.md):
##   godot --headless --path app/game3d -s res://tests/place_test.gd
## Builds Trafalgar Square from tests/fixtures/trafalgar_ground.json (OpenStreetMap, made by
## costquest-backend tools/arena/osm_ground.py) with the fight between the column and the fountains:
## the camera faces Nelson's Column, nothing is built in the fight's area or the camera's way, the
## minimap gets the real footprints, and it builds well under a second.
## Prints "CQTEST PASS <name>" / "CQTEST FAIL <name> <why>", then "CQTEST done failures=N".

const PlaceScript := preload("res://place.gd")
const ArenaScript := preload("res://arena.gd")
const HeroesScript := preload("res://world_heroes.gd")
const LandmarksScript := preload("res://world_landmarks.gd")

var _fails: int = 0


func _check(name: String, ok: bool, why: String = "") -> void:
	if ok:
		print("CQTEST PASS " + name)
	else:
		_fails += 1
		print("CQTEST FAIL %s %s" % [name, why])


func _initialize() -> void:
	var ground: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/trafalgar_ground.json"))
	var p: Node3D = PlaceScript.new()
	root.add_child(p)
	p.call("build", ground, Vector2(4.9, -4.0), 12.0, NAN, ArenaScript.look_opts({}), Callable())
	var info: Dictionary = p.get("info")
	_check("landmark_is_the_column", str(info.get("landmark", "")) == "Nelson's Column", str(info.get("landmark")))
	var at: Vector3 = info.get("landmark_at", Vector3.ZERO)
	# ahead of the camera (its forward is -z turned 12 degrees), 15 to 30 m out
	var fwd: Vector2 = Vector2(-sin(deg_to_rad(12.0)), -cos(deg_to_rad(12.0)))
	var rel: Vector2 = Vector2(at.x, at.z)
	_check("landmark_ahead", rel.normalized().dot(fwd) > 0.99 and rel.length() > 15.0 and rel.length() < 30.0, str(rel))
	_check("built", int(info.get("buildings", 0)) > 100 and int(info.get("trees", 0)) > 50 and int(info.get("roads", 0)) > 50, str(info))
	_check("build_under_1s", float(info.get("ms", 9999.0)) < 1000.0, str(info.get("ms")))
	var clear: Rect2 = PlaceScript.CLEAR
	var hit: int = 0
	for r: Rect2 in p.get("map_blocks"):
		if r.intersects(clear):
			hit += 1
	_check("fight_area_clear", hit == 0, "%d footprints in the fight's area" % hit)
	_check("minimap_blocks", (p.get("map_blocks") as Array).size() == int(info.get("buildings", -1)))
	# the same ground with the point off to the side of the square still faces a landmark
	var p2: Node3D = PlaceScript.new()
	root.add_child(p2)
	p2.call("build", ground, Vector2(40.0, 30.0), 12.0, NAN, ArenaScript.look_opts({}), Callable())
	_check("another_spot_faces_something", str((p2.get("info") as Dictionary).get("landmark_kind", "")) != "")
	_heroes_test()
	print("CQTEST done failures=%d" % _fails)


## day1-world: the threaded build gives the same place; the hero landmarks and the generic pieces.
func _heroes_test() -> void:
	var ground: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/trafalgar_ground.json"))
	var pt: Node3D = PlaceScript.new()
	pt.call("begin", ground, Vector2(4.9, -4.0), 12.0, NAN, ArenaScript.look_opts({}), Callable(), true)
	_check("threaded_not_in_tree_yet", pt.get_parent() == null and not bool(pt.get("built")))
	var done: bool = bool(pt.call("pump", INF))
	root.add_child(pt)
	var ti: Dictionary = pt.get("info")
	_check("threaded_builds_the_same", done and int(ti.get("buildings", 0)) == 199 and str(ti.get("landmark", "")) == "Nelson's Column"
		and pt.get_child_count() > 20, str(ti.get("buildings")))
	var west: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/westminster_ground.json"))
	var pw: Node3D = PlaceScript.new()
	root.add_child(pw)
	pw.call("build", west, Vector2(35.0, 12.0), 12.0, NAN, ArenaScript.look_opts({}), Callable())
	var wi: Dictionary = pw.get("info")
	_check("hero_big_ben_faced", str(wi.get("landmark", "")) == "Elizabeth Tower" and "big_ben" in (wi.get("heroes", []) as Array), str(wi.get("landmark")))
	var at: Vector3 = wi.get("landmark_at", Vector3.ZERO)
	_check("hero_footprint_not_extruded", float(pw.call("building_height_at", Vector2(at.x, at.z))) == 0.0)
	# every hero and generic piece: built, within a triangle budget, nothing near black (bronze, stone, slate)
	for id: String in ["big_ben", "times_square", "hoover_tower", "national_theatre"]:
		_mesh_ok("hero_" + id, HeroesScript.build(id, 50.0), 60000)
	for k: String in ["arch", "dome", "spire"]:
		_mesh_ok("piece_" + k, LandmarksScript.build(k), 30000)
	_mesh_ok("piece_bridge", LandmarksScript.bridge(60.0, 14.0), 10000)


func _mesh_ok(name: String, m: ArrayMesh, max_tris: int) -> void:
	var tris: int = 0
	var darkest: float = 1.0
	for si in m.get_surface_count():
		var arr: Array = m.surface_get_arrays(si)
		tris += (arr[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
		if m.surface_get_name(si) in ["screen", "clock"]:
			continue
		for c: Color in (arr[Mesh.ARRAY_COLOR] as PackedColorArray):
			darkest = minf(darkest, c.get_luminance())
	print("CQTEST INFO %s tris=%d darkest_luma=%.3f" % [name, tris, darkest])
	_check(name, m.get_surface_count() > 0 and tris > 100 and tris <= max_tris and darkest >= 0.05,
		"tris=%d darkest=%.3f" % [tris, darkest])
	quit(0 if _fails == 0 else 1)
