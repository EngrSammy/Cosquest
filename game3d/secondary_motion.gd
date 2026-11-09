extends SkeletonModifier3D
## Secondary motion for robes, coats, skirts, wings and flames (cq 014). The cast rigs from
## app/game3d/tools/rig carry short bone chains (Robe0_0 .. Robe0_2 + Robe0_end, Wing_L_0 ..)
## under the hips or the spine. The clips never animate them; this modifier does, after the
## animation and the procedural pose: each chain springs toward its target (the chain hanging
## from its parent, swung by the thighs for robes and coats), keeps its bone lengths, is
## pushed out of capsules on the thighs and shins and may turn at most max_deg from the
## target. Fixed 1/60 s steps in the skeleton's own space, so the fighter's own movement
## (walking, dodges) never drags it and a hit-stop just lets it settle. Parameters:
## res://data/secondary.json; the numpy twin that the tear gate runs is
## tools/rig/secondary.py (same maths). Nothing is allocated per frame.

const SEC_JSON: String = "res://data/secondary.json"
static var _cfg: Dictionary = {}


class Chain:
	var bones: PackedInt32Array            # chain bones, then the end
	var parent: int
	var rel: Array[Transform3D] = []       # each bone's rest relative to the parent's rest
	var lens: PackedFloat32Array
	var p: PackedVector3Array
	var pp: PackedVector3Array
	var t: PackedVector3Array
	var stiff: float
	var damp: float
	var cosmax: float
	var sinmax: float
	var legs: bool
	var spin: bool                          # cq 016: carried round with the hips' turn, flares out in a spin
	var flare_k: float
	var flare_max: float
	var jr: float
	var wl: float
	var wr: float
	var init: bool = false


var chains: Array[Chain] = []
var step_s: float = 1.0 / 60.0
var _acc: float = 0.0
var _hips: int = -1
var _lul: int = -1
var _rul: int = -1
var _caps: PackedInt32Array             # bone pairs: thigh, shin per side
var _caps_r: PackedFloat32Array
var _rest_h: Basis
var _rest_l: Basis
var _rest_r: Basis
var _ca: PackedVector3Array = PackedVector3Array()
var _cb: PackedVector3Array = PackedVector3Array()
var cost_us: int = 0                    # the last frame's cost, for the budget check
var _yaw: float = 0.0                   # cq 016: the hips' heading last frame (skeleton space)
var _yaw_init: bool = false
var _spin_w: float = 0.0                # the hips' turn rate, rad/s, smoothed
## cq 016: the fighter's materials (char_lit.gdshader) whose cloth vertices are pushed out of the leg
## capsules on the GPU; this node feeds them the capsules (world space) every frame
var cloth_mats: Array[ShaderMaterial] = []
var _push_r: PackedFloat32Array = PackedFloat32Array()
const _LA: Array[StringName] = [&"la0", &"la1", &"la2", &"la3"]
const _LB: Array[StringName] = [&"lb0", &"lb1", &"lb2", &"lb3"]


static func config() -> Dictionary:
	if _cfg.is_empty() and FileAccess.file_exists(SEC_JSON):
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(SEC_JSON))
		if d is Dictionary:
			_cfg = d
	return _cfg


## Finds the chains on `skel`. Returns how many (0: nothing to do, the caller drops this node).
func setup(skel: Skeleton3D) -> int:
	var cfg: Dictionary = config()
	if cfg.is_empty():
		return 0
	step_s = float(cfg.get("step_s", 1.0 / 60.0))
	var groups: Dictionary = cfg.get("groups", {})
	var prefixes: Dictionary = cfg.get("prefixes", {})
	var re := RegEx.new()
	re.compile("^(Robe|Coat|Skirt|Wing|Flame)(.*)_(\\d+|end)$")
	var found: Dictionary = {}
	for b in skel.get_bone_count():
		var m: RegExMatch = re.search(skel.get_bone_name(b))
		if m == null:
			continue
		var base: String = m.get_string(1) + m.get_string(2)
		if not found.has(base):
			found[base] = {"prefix": m.get_string(1), "k": {}}
		(found[base]["k"] as Dictionary)[m.get_string(3)] = b
	_hips = skel.find_bone("Hips")
	_lul = skel.find_bone("LeftUpLeg")
	_rul = skel.find_bone("RightUpLeg")
	if _hips < 0 or _lul < 0 or _rul < 0:
		return 0
	_rest_h = skel.get_bone_global_rest(_hips).basis
	_rest_l = skel.get_bone_global_rest(_lul).basis
	_rest_r = skel.get_bone_global_rest(_rul).basis
	var legs_r: Dictionary = cfg.get("legs", {})
	_caps = PackedInt32Array()
	_caps_r = PackedFloat32Array()
	_push_r = PackedFloat32Array()
	for pair: Array in [["LeftUpLeg", "LeftLeg", "r_thigh"], ["LeftLeg", "LeftFoot", "r_shin"],
			["RightUpLeg", "RightLeg", "r_thigh"], ["RightLeg", "RightFoot", "r_shin"]]:
		var a: int = skel.find_bone(str(pair[0]))
		var c: int = skel.find_bone(str(pair[1]))
		if a >= 0 and c >= 0:
			_caps.append(a)
			_caps.append(c)
			_caps_r.append(float(legs_r.get(str(pair[2]), 0.08)))
			_push_r.append(float((cfg.get("cloth_push", {}) as Dictionary).get(str(pair[2]), float(legs_r.get(str(pair[2]), 0.08)) + 0.015)))
	_ca.resize(_caps_r.size())
	_cb.resize(_caps_r.size())
	var hips_rest: Vector3 = skel.get_bone_global_rest(_hips).origin
	chains.clear()
	var bases: Array = found.keys()
	bases.sort()
	for base: String in bases:
		var e: Dictionary = found[base]
		var ks: Dictionary = e["k"]
		if not ks.has("end"):
			continue
		var g: Dictionary = groups.get(str(prefixes.get(e["prefix"], "")), {})
		if g.is_empty():
			continue
		var ch := Chain.new()
		var n: int = 0
		while ks.has(str(n)):
			ch.bones.append(int(ks[str(n)]))
			n += 1
		if n == 0:
			continue
		ch.bones.append(int(ks["end"]))
		ch.parent = skel.get_bone_parent(ch.bones[0])
		var prest: Transform3D = skel.get_bone_global_rest(ch.parent)
		for b: int in ch.bones:
			ch.rel.append(prest.affine_inverse() * skel.get_bone_global_rest(b))
		for k in ch.bones.size() - 1:
			ch.lens.append(skel.get_bone_global_rest(ch.bones[k + 1]).origin.distance_to(skel.get_bone_global_rest(ch.bones[k]).origin))
		ch.p.resize(ch.bones.size())
		ch.pp.resize(ch.bones.size())
		ch.t.resize(ch.bones.size())
		ch.stiff = float(g.get("stiffness", 0.3))
		ch.damp = float(g.get("damping", 0.25))
		ch.cosmax = cos(deg_to_rad(float(g.get("max_deg", 35.0))))
		ch.sinmax = sqrt(1.0 - ch.cosmax * ch.cosmax)
		ch.legs = bool(g.get("legs", false))
		ch.spin = bool(g.get("spin_carry", false))
		ch.flare_k = deg_to_rad(float(g.get("flare_deg_per_rad_s", 0.0)))
		ch.flare_max = deg_to_rad(float(g.get("flare_max_deg", 0.0)))
		ch.jr = float(g.get("joint_r", 0.02))
		# which side it hangs on: the thigh on that side swings it
		var tip: Vector3 = skel.get_bone_global_rest(ch.bones[ch.bones.size() - 1]).origin
		var lat: float = clampf((tip.x - hips_rest.x) / 0.12, -1.0, 1.0)
		var f: float = float(g.get("follow", 0.0))
		ch.wl = f * clampf(0.5 + 0.5 * lat, 0.0, 1.0)
		ch.wr = f * clampf(0.5 - 0.5 * lat, 0.0, 1.0)
		chains.append(ch)
	return chains.size()


func _process_modification_with_delta(delta: float) -> void:
	var sk: Skeleton3D = get_skeleton()
	if sk == null or chains.is_empty():
		return
	var t0: int = Time.get_ticks_usec()
	_acc = minf(_acc + delta, step_s * 4.0)    # a long frame (load, hitch) runs at most 4 steps
	var steps: int = int(_acc / step_s)
	_acc -= steps * step_s
	var dh: Quaternion = Quaternion(sk.get_bone_global_pose(_hips).basis.orthonormalized() * _rest_h.inverse())
	var dl: Quaternion = Quaternion(sk.get_bone_global_pose(_lul).basis.orthonormalized() * _rest_l.inverse()) * dh.inverse()
	var dr: Quaternion = Quaternion(sk.get_bone_global_pose(_rul).basis.orthonormalized() * _rest_r.inverse()) * dh.inverse()
	for c in _caps_r.size():
		_ca[c] = sk.get_bone_global_pose(_caps[2 * c]).origin
		_cb[c] = sk.get_bone_global_pose(_caps[2 * c + 1]).origin
	# not in the tree yet (a fight starting): no world transform, the shader keeps last frame's
	if not cloth_mats.is_empty() and _caps_r.size() == 4 and sk.is_inside_tree():
		var xf: Transform3D = sk.global_transform
		var sc: float = xf.basis.get_scale().x
		for c in 4:
			var a: Vector3 = xf * _ca[c]
			var b: Vector3 = xf * _cb[c]
			var r: float = _push_r[c] * sc
			for m: ShaderMaterial in cloth_mats:
				m.set_shader_parameter(_LA[c], Vector4(a.x, a.y, a.z, r))
				m.set_shader_parameter(_LB[c], Vector4(b.x, b.y, b.z, r))
	# cq 016, spin-aware: the hips' turn since last frame (a WHIRL turns them a full circle in
	# half a second). Spring-lagging behind that turn stretched the robes; the chains are carried
	# round with it instead, and flare outwards with the turn rate.
	var hf: Vector3 = dh * Vector3(0, 0, 1)
	var yaw: float = atan2(hf.x, hf.z)
	var dyaw: float = wrapf(yaw - _yaw, -PI, PI) if _yaw_init else 0.0
	_yaw = yaw
	_yaw_init = true
	if delta > 0.0:
		_spin_w = lerpf(_spin_w, absf(dyaw) / delta, 0.5)
	var hips_o: Vector3 = sk.get_bone_global_pose(_hips).origin
	var carry := Basis(Vector3.UP, dyaw)
	for ch: Chain in chains:
		var pg: Transform3D = sk.get_bone_global_pose(ch.parent)
		var qf: Quaternion = Quaternion.IDENTITY.slerp(dl, ch.wl) * Quaternion.IDENTITY.slerp(dr, ch.wr)
		var bf := Basis(qf)
		var n: int = ch.bones.size()
		var root: Vector3 = (pg * ch.rel[0]).origin
		if ch.spin:
			var flare: float = minf(ch.flare_max, ch.flare_k * _spin_w)
			if flare > 0.001:
				var r: Vector3 = Vector3(root.x - hips_o.x, 0.0, root.z - hips_o.z)
				if r.length_squared() > 1e-8:
					bf = Basis(Vector3.DOWN.cross(r.normalized()).normalized(), flare) * bf
			if ch.init and dyaw != 0.0:
				for j in n:
					ch.p[j] = hips_o + carry * (ch.p[j] - hips_o)
					ch.pp[j] = hips_o + carry * (ch.pp[j] - hips_o)
		for j in n:
			ch.t[j] = root + bf * ((pg * ch.rel[j]).origin - root)
			if ch.legs and j > 0:
				# the targets themselves outside the legs: the spring then has a point at rest
				# it can reach (no fight between spring and collision, no jitter)
				ch.t[j] = _push_out(ch.t[j], ch.jr)
		if not ch.init:
			for j in n:
				ch.p[j] = ch.t[j]
				ch.pp[j] = ch.t[j]
			ch.init = true
		for s in steps:
			_step(ch)
		for j in n - 1:
			var rb: Basis = bf * (pg * ch.rel[j]).basis
			var a: Vector3 = ch.t[j + 1] - ch.t[j]
			var b: Vector3 = ch.p[j + 1] - ch.p[j]
			var q := Quaternion.IDENTITY
			if a.length_squared() > 1e-12 and b.length_squared() > 1e-12:
				q = Quaternion(a.normalized(), b.normalized())
			sk.set_bone_global_pose(ch.bones[j], Transform3D(Basis(q) * rb, ch.p[j]))
		var last: Transform3D = sk.get_bone_global_pose(ch.bones[n - 2])
		sk.set_bone_global_pose(ch.bones[n - 1], Transform3D(last.basis, ch.p[n - 1]))
	cost_us = Time.get_ticks_usec() - t0


func _step(ch: Chain) -> void:
	var n: int = ch.p.size()
	var prev0: Vector3 = ch.p[0]
	ch.p[0] = ch.t[0]
	ch.pp[0] = prev0
	for j in range(1, n):
		var cur: Vector3 = ch.p[j]
		var v: Vector3 = (cur - ch.pp[j]) * (1.0 - ch.damp)
		ch.pp[j] = cur
		var q: Vector3 = cur + v + (ch.t[j] - cur) * ch.stiff
		if ch.legs:
			q = _push_out(q, ch.jr)
		var dd: Vector3 = q - ch.p[j - 1]
		var dl: float = maxf(1e-9, dd.length())
		var dir: Vector3 = dd / dl
		var td: Vector3 = ch.t[j] - ch.t[j - 1]
		td = td / maxf(1e-9, td.length())
		var cs: float = dir.dot(td)
		if cs < ch.cosmax:
			var w: Vector3 = dir - td * cs
			w = w / maxf(1e-9, w.length())
			dir = td * ch.cosmax + w * ch.sinmax
		ch.p[j] = ch.p[j - 1] + dir * ch.lens[j - 1]


## `p` moved out of every leg capsule (radius + the joint's radius).
func _push_out(p: Vector3, jr: float) -> Vector3:
	var q: Vector3 = p
	for c in _caps_r.size():
		var a: Vector3 = _ca[c]
		var ab: Vector3 = _cb[c] - a
		var u: float = clampf((q - a).dot(ab) / maxf(1e-12, ab.length_squared()), 0.0, 1.0)
		var cp: Vector3 = a + ab * u
		var d: Vector3 = q - cp
		var dn: float = d.length()
		var r: float = _caps_r[c] + jr
		if dn < r and dn > 1e-9:
			q = cp + d / dn * r
	return q
