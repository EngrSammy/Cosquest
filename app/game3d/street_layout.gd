extends RefCounted
## look-world: the default street (no real place) as a ground document in the server's /v1/map/ground
## shape, built by place.gd exactly like a real place, so the street and the places share one kit, one
## light and one material set (the art direction's "one material language").
##
## The layout keeps cq 016's composition: a paved shopping street (the fight stands in it, kerb to kerb
## 11.2 m, fight.gd clamps at 4.7 m) with shopfronts close on both sides, the lit cross street with zebra
## crossings up the screen at z -18 to -28, then the street running on into a square with a clock tower,
## which is the landmark at the top of the fight frame. Built in the fight's frame (x right, z towards the
## camera); the document's z is north, so z is flipped on the way out.

const STREET_HALF: float = 6.2      # house front to house front / 2 (the fight's paving)
const CROSS_Z := Vector2(-18.0, -28.0)


static func _h(x: float, y: float) -> float:
	return fposmod(sin(x * 12.9898 + y * 78.233) * 43758.5453, 1.0)


static func _pt(x: float, z: float) -> Array:
	return [snappedf(x, 0.1), snappedf(-z, 0.1)]


static func _rect(x0: float, z0: float, x1: float, z1: float) -> Array:
	return [_pt(x0, z0), _pt(x1, z0), _pt(x1, z1), _pt(x0, z1), _pt(x0, z0)]


static func ground() -> Dictionary:
	var b: Array = []
	var roads: Array = []
	var paved: Array = []
	var green: Array = []
	var trees: Array = []
	var marks: Array = []
	# the shopping street's blocks, both sides: near the fight (z 18 to the cross street) and beyond it
	for side: float in [-1.0, 1.0]:
		for span: Vector2 in [Vector2(18.0, CROSS_Z.x - 0.6), Vector2(CROSS_Z.y + 0.6, -60.0)]:
			var z: float = span.x
			var i: int = 0
			while z > span.y + 4.0:
				var w: float = 7.0 + floorf(_h(side * 3.1, z) * 3.0) * 2.0
				var z2: float = maxf(span.y, z - w)
				var depth: float = 11.0 + _h(z, side) * 6.0
				var h: float = 11.0 + floorf(_h(z * 0.7, side * 5.0) * 4.0) * 3.2
				var x0: float = side * STREET_HALF
				var x1: float = side * (STREET_HALF + depth)
				b.append({"h": h, "p": _rect(minf(x0, x1), z, maxf(x0, x1), z2)})
				# a back row behind, taller, for the skyline over the shops
				b.append({"h": h + 6.0 + _h(z, 9.0) * 10.0, "p": _rect(minf(side * (STREET_HALF + depth + 3.0), side * 33.0), z, maxf(side * (STREET_HALF + depth + 3.0), side * 33.0), z2)})
				z = z2 - (0.0 if _h(z, 2.0) < 0.75 else 1.2)
				i += 1
	# the cross street (asphalt, kerbs, markings), a zebra across its mouth either side of the street
	roads.append({"w": 10.0, "k": "major_road", "d": "secondary", "p": [_pt(-260.0, -23.0), _pt(-40.0, -23.2), _pt(40.0, -22.8), _pt(260.0, -23.0)]})
	for x: float in [-3.2, 3.2]:
		roads.append({"w": 3.0, "k": "path", "d": "crossing", "p": [_pt(x, -16.5), _pt(x, -29.5)]})
	# streets behind the blocks and round the square
	for side: float in [-1.0, 1.0]:
		roads.append({"w": 7.0, "k": "minor_road", "d": "residential", "p": [_pt(side * 39.0, 160.0), _pt(side * 39.0, -23.0), _pt(side * 39.0, -150.0)]})
	roads.append({"w": 8.0, "k": "medium_road", "d": "tertiary", "p": [_pt(-260.0, -103.0), _pt(260.0, -103.0)]})
	roads.append({"w": 7.0, "k": "minor_road", "d": "residential", "p": [_pt(-260.0, 40.0), _pt(260.0, 40.0)]})
	# the shopping street's paving, the square at its end
	paved.append({"k": "pedestrian", "p": _rect(-STREET_HALF, 30.0, STREET_HALF, CROSS_Z.x)})
	paved.append({"k": "pedestrian", "p": _rect(-STREET_HALF, CROSS_Z.y, STREET_HALF, -60.0)})
	paved.append({"k": "pedestrian", "p": _rect(-30.0, -60.0, 30.0, -98.0)})
	green.append({"k": "garden", "p": _rect(-27.0, -63.0, -15.0, -73.0)})
	green.append({"k": "garden", "p": _rect(15.0, -63.0, 27.0, -73.0)})
	# the square's buildings (its sides) and a skyline behind
	for side: float in [-1.0, 1.0]:
		b.append({"h": 22.0, "p": _rect(minf(side * 31.0, side * 36.0), -60.5, maxf(side * 31.0, side * 36.0), -97.0)})
	var x: float = -250.0
	while x < 250.0:
		for row: Vector2 in [Vector2(-108.0, -135.0), Vector2(-142.0, -170.0), Vector2(46.0, 70.0)]:
			var w2: float = 14.0 + _h(x, row.x) * 12.0
			var hh: float = 14.0 + _h(row.y, x) * 26.0 + (16.0 if absf(x) < 60.0 and row.x < -100.0 and _h(x, 3.0) > 0.6 else 0.0)
			b.append({"h": hh, "p": _rect(x, row.x, x + w2, row.y)})
		x += 18.0 + _h(x, 1.0) * 8.0
	for side: float in [-1.0, 1.0]:
		var zz: float = 160.0
		while zz > -100.0:
			if zz > 34.0 or zz < -60.0:
				var w3: float = 12.0 + _h(side, zz) * 10.0
				b.append({"h": 12.0 + _h(zz, side * 2.0) * 18.0, "p": _rect(minf(side * 44.0, side * 70.0), zz, maxf(side * 44.0, side * 70.0), zz - w3)})
				zz -= w3 + 4.0
			else:
				zz -= 8.0
		for xx: float in [80.0, 120.0, 165.0]:
			var z3: float = 40.0
			while z3 > -100.0:
				b.append({"h": 14.0 + _h(xx * side, z3) * 30.0, "p": _rect(minf(side * xx, side * (xx + 28.0)), z3, maxf(side * xx, side * (xx + 28.0)), z3 - 26.0)})
				z3 -= 34.0
	# trees: up the street beyond the junction and round the square
	for z4: float in [-34.0, -46.0, -58.0]:
		for side: float in [-1.0, 1.0]:
			trees.append([side * 4.8, -z4, 0.75, 0])
	for xt: float in [-26.0, -18.0, 18.0, 26.0]:
		trees.append([xt, 90.0, 1.0, 0])
		trees.append([xt, 68.0, 0.9, 0])
	# the landmark: a clock tower at the head of the square, two fountains either side of it
	marks.append({"x": 0.0, "z": 80.0, "kind": "clock", "h": 38.0, "r": 0.0, "name": "Unity Plaza Clock"})
	marks.append({"x": -14.0, "z": 86.0, "kind": "fountain", "h": 1.2, "r": 3.4, "name": ""})
	marks.append({"x": 14.0, "z": 86.0, "kind": "fountain", "h": 1.2, "r": 3.4, "name": ""})
	return {"v": 2, "origin": {"lat": 51.51, "lng": -0.13}, "region": "uk", "source": "street_layout",
		"clear": [-STREET_HALF + 0.4, -11.0, (STREET_HALF - 0.4) * 2.0, 37.0],
		"roads": roads, "water": [], "green": green, "buildings": b, "waterways": [], "paved": paved,
		"trees": trees, "landmarks": marks}
