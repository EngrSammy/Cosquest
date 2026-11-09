extends Node
## Co-op: two heroes, one Guardian (cq 019, a proof; docs/game3d/MULTIPLAYER.md). Started by fight.gd
## when the config has "coop": {"url": "ws://.../v1/coop3d/ws", "ticket": "<from the signed join>"}.
##
## The game server owns what the squad shares: the Guardian's HP pool, the clock and the end. This
## node sends every hit this phone lands on the Guardian (fight.gd _jhit, the judge log's row) and the
## hero's pose ten times a second; it applies the server's pool to the local Guardian (never above
## what this phone already took off it), follows the server's clock, draws the other hero where the
## other phone has them (placed against this phone's Guardian, so they fight the same one), and ends
## the fight when the server says so. It never decides the shared result itself.

const POSE_EVERY: float = 0.1
const PEER_LAG: float = 0.1     # draw the other hero this far behind its newest pose (smooth)

var fight: Node
var ws := WebSocketPeer.new()
var seat: int = -1
var boss_max: int = 0
var server_hp: int = -1
var server_t_left: float = -1.0
var ended: String = ""
var peer: Node3D                  # the other hero (a FighterScript, set up by fight.gd)
var peer_seat: int = -1
var sent_dealt: int = 0           # damage this phone sent to the pool (less what the server refused)
var acked: int = 0                # of which the server has counted
var _poses: Array = []            # [received ms, pose] of the other hero, newest last
var _pose_t: float = 0.0
var _last_act: String = ""
var stats: Dictionary = {"hits_sent": 0, "refused": 0, "states": 0, "pose_age_ms": []}
var _url: String = ""


func setup(f: Node, c: Dictionary) -> void:
	fight = f
	_url = "%s?ticket=%s" % [str(c.get("url", "")), str(c.get("ticket", ""))]
	var err: int = ws.connect_to_url(_url)
	print("CQ coop connect err=%d" % err)


func connected() -> bool:
	return ws.get_ready_state() == WebSocketPeer.STATE_OPEN


func send_hit(row: Array) -> void:
	if connected() and ended == "":
		ws.send_text(JSON.stringify({"t": "hit", "row": row}))
		sent_dealt += int(row[5])
		stats["hits_sent"] = int(stats["hits_sent"]) + 1


## The local Guardian's HP: the shared pool less this phone's hits still on their way to the server,
## in the local bar's units. Before the first state, the pool is full.
func boss_hp_local(max_hp: int) -> int:
	if boss_max <= 0:
		return max_hp
	var pool: int = server_hp if server_hp >= 0 else boss_max
	var pending: int = maxi(0, sent_dealt - acked)
	return int(ceil(float(maxi(0, pool - pending)) * float(max_hp) / float(boss_max)))


func _process(dt: float) -> void:
	ws.poll()
	var st: int = ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN:
		while ws.get_available_packet_count() > 0:
			var m: Variant = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if m is Dictionary:
				_on_message(m)
		_pose_t -= dt
		if _pose_t <= 0.0:
			_pose_t = POSE_EVERY
			_send_pose()
	elif st == WebSocketPeer.STATE_CLOSED and ended == "" and seat > 0:
		ended = "lost_link"
		print("CQ coop closed code=%d" % ws.get_close_code())
	_drive_peer(dt)


func _send_pose() -> void:
	var hero: Node3D = fight.get("hero")
	var enemy: Node3D = fight.get("enemy")
	if hero == null:
		return
	var anim: Variant = hero.get("anim")   # the CombatAnimator (a RefCounted)
	ws.send_text(JSON.stringify({"t": "pose", "x": snappedf(hero.position.x, 0.01), "z": snappedf(hero.position.z, 0.01),
		"yaw": snappedf(float(hero.get("yaw")), 0.001), "a": str(anim.get("state")) if anim != null else "",
		"bx": snappedf(enemy.position.x, 0.01) if enemy != null else 0.0, "bz": snappedf(enemy.position.z, 0.01) if enemy != null else 0.0,
		"hp": int(hero.get("hp")), "ms": int(Time.get_unix_time_from_system() * 1000.0)}))


func _on_message(m: Dictionary) -> void:
	match str(m.get("t", "")):
		"hello":
			seat = int(m.get("seat", -1))
			boss_max = int(m.get("boss_max", 0))
			print("CQ coop hello seat=%d squad=%d boss_max=%d" % [seat, int(m.get("squad", 0)), boss_max])
			_on_state(m)
		"state":
			_on_state(m)
		"refused":
			stats["refused"] = int(stats["refused"]) + 1
			sent_dealt -= int(m.get("dealt", 0))
			print("CQ coop refused why=%s" % str(m.get("why", "")))
		"end":
			ended = str(m.get("outcome", ""))
			server_hp = int(m.get("boss_hp", server_hp))
			print("CQ coop end outcome=%s dealt=%s" % [ended, JSON.stringify(m.get("dealt", {}))])
			fight.call("coop_end", ended)


func _on_state(m: Dictionary) -> void:
	stats["states"] = int(stats["states"]) + 1
	server_hp = int(m.get("boss_hp", server_hp))
	boss_max = int(m.get("boss_max", boss_max))
	server_t_left = float(m.get("t_left", server_t_left))
	for p: Variant in m.get("players", []):
		var pd: Dictionary = p
		if int(pd.get("seat", -1)) == seat:
			acked = int(pd.get("dealt", acked))
			continue
		if not pd.has("x"):
			continue
		peer_seat = int(pd["seat"])
		_poses.append([Time.get_ticks_msec(), pd])
		if pd.has("ms") and int(pd["ms"]) > 0:
			(stats["pose_age_ms"] as Array).append(int(Time.get_unix_time_from_system() * 1000.0) - int(pd["ms"]))
		while _poses.size() > 8:
			_poses.pop_front()
		if peer != null:
			peer.set("display_name", str(pd.get("name", "Hero")))
			peer.set("hp", int(pd.get("hp", peer.get("hp"))))
	if int(stats["states"]) % 20 == 1:
		var hero: Node = fight.get("hero")
		print("CQ coop state seat=%d boss_hp=%d/%d t_left=%.1f local_boss=%d peer=%s" % [seat, server_hp, boss_max, server_t_left,
			int((fight.get("enemy") as Node).get("hp")) if fight.get("enemy") != null else -1, str(peer_seat)])


## The other hero: placed where the other phone has them relative to its Guardian, against this
## phone's Guardian; turned and animated as reported, a little behind its newest pose so it glides.
func _drive_peer(dt: float) -> void:
	if peer == null or _poses.is_empty():
		return
	var now: int = Time.get_ticks_msec()
	var target_ms: int = now - int(PEER_LAG * 1000.0)
	var a: Array = _poses[0]
	var b: Array = _poses[_poses.size() - 1]
	for i in range(_poses.size() - 1):
		if int(_poses[i][0]) <= target_ms and int(_poses[i + 1][0]) >= target_ms:
			a = _poses[i]
			b = _poses[i + 1]
			break
	if not peer.visible:
		peer.visible = true   # hidden while its model loaded; shown with its first pose
	var k: float = 1.0 if int(b[0]) == int(a[0]) else clampf(float(target_ms - int(a[0])) / float(int(b[0]) - int(a[0])), 0.0, 1.0)
	var pa: Dictionary = a[1]
	var pb: Dictionary = b[1]
	var enemy: Node3D = fight.get("enemy")
	var boss_here: Vector3 = enemy.position if enemy != null else Vector3.ZERO
	var rel_a := Vector3(float(pa["x"]) - float(pa.get("bx", 0.0)), 0, float(pa["z"]) - float(pa.get("bz", 0.0)))
	var rel_b := Vector3(float(pb["x"]) - float(pb.get("bx", 0.0)), 0, float(pb["z"]) - float(pb.get("bz", 0.0)))
	var want: Vector3 = boss_here + rel_a.lerp(rel_b, k)
	var was: Vector3 = peer.position
	peer.position = was.lerp(want, 1.0 - exp(-dt * 12.0))
	var yaw: float = lerp_angle(float(pa["yaw"]), float(pb["yaw"]), k)
	peer.set("yaw", yaw)
	peer.rotation.y = yaw
	peer.set("speed_now", (peer.position - was).length() / maxf(dt, 0.001))
	var act: String = str(pb.get("a", ""))
	if act != _last_act:
		_last_act = act
		if act != "" and act not in ["idle", "walk", "run", "_"]:
			peer.call("act", act, 0.4)
	peer.call("tick_logic", dt)
	peer.call("tick_visual", dt)
