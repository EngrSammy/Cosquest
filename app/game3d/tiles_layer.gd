extends Node3D
## Optional 3D Tiles ground under the arena, through the Cesium for Godot GDExtension
## (Battle-Road 3D-Tiles-For-Godot, sources in ext/tiles/cesium_godot). Coded defensively:
## nothing here names an extension type statically, and project.godot / .tscn files never
## reference the extension, so the game loads and runs without the plugin present.
##
## Names used (cesium_godot/register_types.cpp, Models/CesiumGlobe.cpp, Models/CesiumGDTileset.cpp):
##   class CesiumGeoreference : Node3D   props latitude, longitude, altitude (deg / deg / m),
##                                        origin_type (0 = Cartographic Origin, 1 = True Origin)
##                                        method get_tx_engine_to_ecef() -> Transform3D
##                                        (forces its own rotation to (-90, 0, 0) in _enter_tree)
##   class Cesium3DTileset : Node3D      props data_source (0 = From Cesium Ion, 1 = From Url),
##                                        url, maximum_screen_space_error,
##                                        maximum_simultaneous_tile_loads
##                                        method update_tileset(camera_transform: Transform3D)
##                                        must be a DIRECT child of the georeference, rotated (90, 0, 0)
##                                        (as the editor helper does); loads lazily on the first
##                                        update_tileset() call, which we make every frame with
##                                        georef.get_tx_engine_to_ecef() * camera.global_transform
##                                        (what the addon's AbstractCesiumCamera.gd does).
## No Cesium ion token is needed for a plain URL source (only the ion branch reads one).
## For Google Photorealistic Tiles, put the key in the URL query string (?key=...).
##
## Config keys: tiles_url (required to enable), tiles_lat, tiles_lon, tiles_alt (ellipsoid
## height in m of the plaza ground, so it lands at y = 0), tiles_y_offset (m), tiles_sse (default 16).

const GEOREF_CLASS: String = "CesiumGeoreference"
const TILESET_CLASS: String = "Cesium3DTileset"
const DATA_SOURCE_FROM_URL: int = 1

var _georef: Node3D
var _tileset: Node3D
var _cam: Camera3D
var _active: bool = false


## Returns true when a tileset was created (the caller may hide its own big ground plane).
func setup(cfg: Dictionary, cam: Camera3D) -> bool:
	_cam = cam
	var url: String = str(cfg.get("tiles_url", "")).strip_edges()
	if url == "":
		print("CQ tiles unavailable reason=no_tiles_url")
		return false
	if not ClassDB.class_exists(GEOREF_CLASS) or not ClassDB.class_exists(TILESET_CLASS):
		print("CQ tiles unavailable reason=extension_not_loaded classes=%s,%s" % [GEOREF_CLASS, TILESET_CLASS])
		return false
	if not ClassDB.can_instantiate(GEOREF_CLASS) or not ClassDB.can_instantiate(TILESET_CLASS):
		print("CQ tiles unavailable reason=cannot_instantiate")
		return false
	var g: Object = ClassDB.instantiate(GEOREF_CLASS)
	var t: Object = ClassDB.instantiate(TILESET_CLASS)
	if not (g is Node3D) or not (t is Node3D):
		print("CQ tiles unavailable reason=unexpected_types")
		if g is Node:
			(g as Node).free()
		if t is Node:
			(t as Node).free()
		return false
	_georef = g as Node3D
	_tileset = t as Node3D
	_georef.name = "CesiumGeoreference"
	_tileset.name = "Cesium3DTileset"
	_georef.set("origin_type", int(cfg.get("tiles_origin_type", 0)))
	_georef.set("latitude", float(cfg.get("tiles_lat", 0.0)))
	_georef.set("longitude", float(cfg.get("tiles_lon", 0.0)))
	_georef.set("altitude", float(cfg.get("tiles_alt", 0.0)))
	_tileset.set("data_source", DATA_SOURCE_FROM_URL)
	_tileset.set("url", url)
	_tileset.set("maximum_screen_space_error", float(cfg.get("tiles_sse", 16.0)))
	_tileset.set("maximum_simultaneous_tile_loads", 8)
	_tileset.rotation_degrees = Vector3(float(cfg.get("tiles_rot_x", 90.0)), 0.0, 0.0)
	position.y = float(cfg.get("tiles_y_offset", 0.0))
	# This node is the georeference's Node3D parent (the credit system attaches there).
	add_child(_georef)
	_georef.add_child(_tileset)
	_active = _georef.has_method("get_tx_engine_to_ecef") and _tileset.has_method("update_tileset")
	print("CQ tiles enabled=%s url=%s lat=%s lon=%s alt=%s" % [_active, url, str(cfg.get("tiles_lat", 0.0)), str(cfg.get("tiles_lon", 0.0)), str(cfg.get("tiles_alt", 0.0))])
	return _active


func _process(_dt: float) -> void:
	if not _active or _cam == null or not is_instance_valid(_tileset):
		return
	var to_ecef: Variant = _georef.call("get_tx_engine_to_ecef")
	if to_ecef is Transform3D:
		_tileset.call("update_tileset", (to_ecef as Transform3D) * _cam.global_transform)


var _dbg_t: float = 0.0


## Every 3 s: how many tile meshes are in the scene and where they sit (placement check).
func _physics_process(dt: float) -> void:
	if not _active or not is_instance_valid(_tileset):
		return
	_dbg_t += dt
	if _dbg_t < 3.0:
		return
	_dbg_t = 0.0
	var n: int = _tileset.get_child_count()
	var shown: int = 0
	var box := AABB()
	var first := true
	for c in _tileset.get_children():
		var mi := c as MeshInstance3D
		if mi == null or mi.mesh == null or not mi.visible:
			continue
		shown += 1
		var b: AABB = mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	var cam_y: float = _cam.global_position.y if _cam != null else 0.0
	print("CQ tiles children=%d shown=%d box_pos=%s box_size=%s cam_y=%.1f" % [n, shown, str(box.position.round()), str(box.size.round()), cam_y])
