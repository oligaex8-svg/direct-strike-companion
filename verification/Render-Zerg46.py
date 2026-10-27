"""Render the original campaign Zerg egg with its native blended breathing rig.

Run with Blender --background --threads 1 --python this_file -- --pilot.
Native hierarchy is evaluated first, then its exact skin palette is baked into
an identity-bind armature; no invented morph or whole-object motion is added.
"""
import argparse
import bisect
import hashlib
import json
import math
from pathlib import Path, PureWindowsPath
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/native46'


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', choices=('egg',), default='egg')
    parser.add_argument('--pilot', action='store_true')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--creep', action=argparse.BooleanOptionalAction, default=True, help='Optional real-texture feathered creep footprint')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def sample(data, anim_id, default, time, rotation=False):
    track = data['tracks'].get(str(anim_id))
    convert = Quaternion if rotation else Vector
    if not track:
        return convert(default)
    times, values = track['frames'], track['values']
    i = max(0, bisect.bisect_right(times, time) - 1)
    j = min(i + 1, len(times) - 1)
    ratio = 0 if times[j] == times[i] else max(0, min(1, (time - times[i]) / (times[j] - times[i])))
    a, b = convert(values[i]), convert(values[j])
    return a.slerp(b, ratio) if rotation else a.lerp(b, ratio)


def pose(data, time):
    transforms = []
    for bone in data['bones']:
        loc = sample(data, bone['ids']['location'], bone['location'], time)
        rot = sample(data, bone['ids']['rotation'], bone['rotation'], time, True)
        scale = sample(data, bone['ids']['scale'], bone['scale'], time)
        local = Matrix.LocRotScale(loc, rot, scale)
        transforms.append(transforms[bone['parent']] @ local if bone['parent'] >= 0 else local)
    return [transform @ Matrix(bone['inverseBind']) for transform, bone in zip(transforms, data['bones'])]


def texture_path(name):
    return NATIVE / 'textures' / (PureWindowsPath(name).stem.lower() + '.png')


def material(meta, images):
    result = bpy.data.materials.new('Native ' + meta['name'])
    result.use_nodes = True
    nodes, links = result.node_tree.nodes, result.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Subsurface Weight'].default_value = .075
    bsdf.inputs['Subsurface Radius'].default_value = (.12, .055, .025)
    bsdf.inputs['Coat Weight'].default_value = .18
    bsdf.inputs['Coat Roughness'].default_value = .26
    bsdf.inputs['Roughness'].default_value = .39
    bsdf.inputs['Emission Strength'].default_value = max(0, meta['hdrEmission'])

    def tex(layer_name, noncolor=False):
        info = meta['layers'].get(layer_name, {})
        name = info.get('file')
        if not name:
            return None
        # A texture may be both native normal and specular: both are non-color.
        key = (name, noncolor)
        if key not in images:
            image = bpy.data.images.load(str(texture_path(name)), check_existing=False)
            image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
            images[key] = image
        node = nodes.new('ShaderNodeTexImage')
        node.image = images[key]
        node.label = layer_name + ': ' + name
        uv = nodes.new('ShaderNodeUVMap')
        source = info.get('uvSource', 0)
        if source not in (0, 1):
            raise ValueError('Unsupported native UV source ' + str(source))
        uv.uv_map = 'Native UV' + str(source)
        links.new(uv.outputs['UV'], node.inputs['Vector'])
        return node

    diffuse = tex('layer_diff')
    if diffuse:
        links.new(diffuse.outputs['Color'], bsdf.inputs['Base Color'])
    emission_layer = 'layer_emis2' if meta['layers'].get('layer_emis2', {}).get('file') else 'layer_emis1'
    emissive = tex(emission_layer)
    bsdf.name = 'NativeEmission'
    result['emission_layer'] = emission_layer
    if emissive:
        # Native egg emissive channel 2 is alpha in its specular texture.
        # Tinting this original mask is a documented material adaptation;
        # it never invents veins or changes their placement.
        if meta['layers'][emission_layer]['channels'] == 2:
            tint = nodes.new('ShaderNodeMixRGB')
            tint.blend_type = 'MULTIPLY'
            tint.inputs[0].default_value = 1
            tint.inputs[2].default_value = (.22, .58, .065, 1)
            links.new(emissive.outputs['Alpha'], tint.inputs[1])
            links.new(tint.outputs[0], bsdf.inputs['Emission Color'])
        else:
            links.new(emissive.outputs['Color'], bsdf.inputs['Emission Color'])
        strength = meta['layers'][emission_layer]['multiply'] * meta['layers'][emission_layer]['brightness']
        bsdf.inputs['Emission Strength'].default_value = max(1, meta['hdrEmission']) * strength
    specular = tex('layer_spec', True)
    if specular:
        # SC2 normal textures double as the native specular source. Use the
        # requested native color channel, never the packed normal alpha as gloss.
        sep = nodes.new('ShaderNodeSeparateColor')
        links.new(specular.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Red'], bsdf.inputs['Specular IOR Level'])
    normal = tex('layer_norm', True)
    if normal:
        # SC2 DXT5nm: X in alpha, Y in green, positive Z reconstructed.
        sep = nodes.new('ShaderNodeSeparateColor')
        links.new(normal.outputs['Color'], sep.inputs['Color'])

        def math_node(operation, a, b=None, c=None):
            node = nodes.new('ShaderNodeMath')
            node.operation = operation
            for i, value in enumerate((a, b, c)):
                if value is None:
                    continue
                if isinstance(value, (float, int)):
                    node.inputs[i].default_value = value
                else:
                    links.new(value, node.inputs[i])
            return node.outputs[0]

        x = math_node('MULTIPLY_ADD', normal.outputs['Alpha'], 2, -1)
        y = math_node('MULTIPLY_ADD', sep.outputs['Green'], 2, -1)
        zz = math_node('SUBTRACT', 1, math_node('ADD', math_node('MULTIPLY', x, x), math_node('MULTIPLY', y, y)))
        z = math_node('MULTIPLY_ADD', math_node('SQRT', math_node('MAXIMUM', zz, 0)), .5, .5)
        rgb = nodes.new('ShaderNodeCombineColor')
        links.new(normal.outputs['Alpha'], rgb.inputs['Red'])
        links.new(sep.outputs['Green'], rgb.inputs['Green'])
        links.new(z, rgb.inputs['Blue'])
        nm = nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'Native UV0'
        links.new(rgb.outputs[0], nm.inputs['Color'])
        links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if meta['blend'] and emissive and not diffuse:
        # Native warning-light quads use additive glow. Alpha-weighted emission
        # approximates additive blending in a portable transparent RGBA frame.
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        emission = nodes.new('ShaderNodeEmission')
        links.new(emissive.outputs['Color'], emission.inputs['Color'])
        emission.inputs['Strength'].default_value = 2
        mix = nodes.new('ShaderNodeMixShader')
        links.new(emissive.outputs['Alpha'], mix.inputs[0])
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(emission.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
        result.surface_render_method = 'BLENDED'
    return result


def add_creep(bounds, count, native_duration, scalar, enabled):
    names = ('creep', 'creepheight', 'creepspecularmask')
    paths = {name: NATIVE / 'textures' / (name + '.png') for name in names}
    missing = [str(path) for path in paths.values() if not path.exists()]
    if not enabled or missing:
        return {'enabled': False, 'reason': 'disabled by option' if not enabled else 'missing optional native creep PNGs', 'missing': missing}
    minimum = Vector(tuple(min(point[i] for point in bounds) for i in range(3)))
    maximum = Vector(tuple(max(point[i] for point in bounds) for i in range(3)))
    center = (minimum + maximum) / 2
    span = maximum - minimum
    # Authored circular footprint: UV feathering hides every polygon boundary.
    # It is sized from the egg, and contributes to the fixed-camera fit.
    rx, ry = span.x * .72, span.y * .72
    ground = minimum.z - max(span) * .006
    vertices = [(center.x, center.y, ground)]
    uv_values = [(.5, .5)]
    for index in range(96):
        angle = math.tau * index / 96
        vertices.append((center.x + rx * math.cos(angle), center.y + ry * math.sin(angle), ground))
        uv_values.append((.5 + .5 * math.cos(angle), .5 + .5 * math.sin(angle)))
    faces = [(0, index + 1, (index + 1) % 96 + 1) for index in range(96)]
    mesh = bpy.data.meshes.new('Authored feathered native creep footprint')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='Creep footprint UV')
    for loop in mesh.loops:
        uv.data[loop.index].uv = uv_values[loop.vertex_index]
    obj = bpy.data.objects.new('Native texture creep ground', mesh)
    bpy.context.collection.objects.link(obj)
    mat = bpy.data.materials.new('Wet native SC2 creep')
    mat.use_nodes = True
    mat.surface_render_method = 'BLENDED'
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Coat Weight'].default_value = .24
    bsdf.inputs['Coat Roughness'].default_value = .23
    bsdf.inputs['Emission Strength'].default_value = 0
    coord = nodes.new('ShaderNodeTexCoord')
    textures = {}
    for name, path in paths.items():
        image = bpy.data.images.load(str(path), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if name == 'creep' else 'Non-Color'
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.extension = 'EXTEND'
        links.new(coord.outputs['UV'], tex.inputs['Vector'])
        textures[name] = tex
    tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(.72,.38,.8,1)
    links.new(textures['creep'].outputs['Color'],tint.inputs[1]);links.new(tint.outputs[0],bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .38
    bump.inputs['Distance'].default_value = max(span) * .018
    links.new(textures['creepheight'].outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['From Min'].default_value = 0
    rough.inputs['From Max'].default_value = 1
    rough.inputs['To Min'].default_value = .56
    rough.inputs['To Max'].default_value = .24
    links.new(textures['creepspecularmask'].outputs['Color'], rough.inputs['Value'])
    links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    links.new(textures['creepspecularmask'].outputs['Color'], bsdf.inputs['Specular IOR Level'])
    distance = nodes.new('ShaderNodeVectorMath')
    distance.operation = 'DISTANCE'
    distance.inputs[1].default_value = (.5, .5, 0)
    links.new(coord.outputs['UV'], distance.inputs[0])
    feather = nodes.new('ShaderNodeMapRange')
    feather.interpolation_type = 'SMOOTHERSTEP'
    feather.clamp = True
    feather.inputs['From Min'].default_value = .29
    feather.inputs['From Max'].default_value = .495
    feather.inputs['To Min'].default_value = 1
    feather.inputs['To Max'].default_value = 0
    ridge=nodes.new('ShaderNodeMath');ridge.operation='MULTIPLY_ADD';ridge.inputs[1].default_value=.14;ridge.inputs[2].default_value=-.07;links.new(textures['creepheight'].outputs['Color'],ridge.inputs[0])
    organic=nodes.new('ShaderNodeMath');organic.operation='ADD';links.new(distance.outputs['Value'],organic.inputs[0]);links.new(ridge.outputs[0],organic.inputs[1]);links.new(organic.outputs[0],feather.inputs['Value'])
    feather.inputs['From Min'].default_value=.22;feather.inputs['From Max'].default_value=.43
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(feather.outputs['Result'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(bsdf.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    obj.data.materials.append(mat)
    for frame in range(1, count + 2):
        phase = ((frame - 1) % count) / count
        # One slow native emissive-envelope cycle across three egg breaths;
        # only wet reflectance changes, never emission or ground geometry.
        feather.inputs['From Max'].default_value=.43+.012*math.sin(math.tau*phase);feather.inputs['From Max'].keyframe_insert(data_path='default_value',frame=frame)
        pulse = scalar(1503494838, .1, phase * native_duration)
        rough.inputs['To Max'].default_value = .24 - .035 * max(0, min(1, (pulse - .1) / .6))
        rough.inputs['To Max'].keyframe_insert(data_path='default_value', frame=frame)
    bounds.extend(Vector(vertex) for vertex in vertices)
    obj['provenance'] = 'Blizzard creep/color/height/specular textures on authored feathered footprint; authored native-envelope reflectance timing'
    return {'enabled': True, 'textures': [str(path) for path in paths.values()],
            'geometry': 'authored ground footprint with native-height irregular feather and subtle growth',
            'surface': 'native grayscale creep with authored purple engine-material tint, native height bump and specular wetness; no emission',
            'animation': 'authored slow reflectance pulse from one native egg emissive-envelope cycle per output loop'}


def main():
    args = arguments()
    data_path = NATIVE / (args.device + '-data.json')
    if not data_path.exists():
        raise FileNotFoundError('Run verification/Export-Zerg46.py first: ' + str(data_path))
    data = json.loads(data_path.read_text(encoding='utf-8'))
    missing = [str(texture_path(name)) for name in data['textureRequests'] if not texture_path(name).exists()]
    if missing:
        raise FileNotFoundError('Missing required native PNG textures; extract/convert before rendering:\n' + '\n'.join(missing))
    source = NATIVE / (data['model'] + '.m3')
    if hashlib.sha256(source.read_bytes()).hexdigest() != data['sourceSHA256']:
        raise ValueError('Native model changed; rerun Export-Zerg46.py')
    out = ROOT / 'verification/local46-zerg' / args.device
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 1
    scene.render.fps = 24
    count = 166
    duration = count * 1000 / 24
    native_duration = data['sequence']['end'] - data['sequence']['start']
    scene.frame_start, scene.frame_end = 1, count
    scene.render.resolution_x, scene.render.resolution_y = 256, 320
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
    scene.render.use_compositing = False
    scene.view_settings.view_transform = 'AgX'
    scene.world.color = (.045, .05, .06)
    images = {}
    used = {region['material'] for region in data['regions']}
    materials = {i: material(data['materials'][i], images) for i in used}
    objects = []
    for region in data['regions']:
        mesh = bpy.data.meshes.new(region['name'])
        mesh.from_pydata(region['vertices'], [], region['triangles'])
        mesh.update()
        for channel, values in region['uvs'].items():
            uv = mesh.uv_layers.new(name='Native UV' + channel[-1])
            for loop in mesh.loops:
                uv.data[loop.index].uv = values[loop.vertex_index]
        for poly in mesh.polygons:
            poly.use_smooth = True
        mesh.normals_split_custom_set_from_vertices(region['normals'])
        obj = bpy.data.objects.new(region['name'], mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(materials[region['material']])
        obj.rotation_mode = 'QUATERNION'
        obj['native_skin'] = json.dumps(region['skin'])
        obj['source'] = data['model'] + '.m3: unchanged native vertices/triangles/UVs; decoded native normals'
        objects.append((obj, region))
    # Identity rest bones make the armature a direct native skin-matrix
    # palette. Original hierarchy/inverse binds stay in data and are evaluated
    # by pose(), avoiding Blender bone-roll/rest-scale reinterpretation.
    armature_data = bpy.data.armatures.new('Native egg skin palette')
    rig = bpy.data.objects.new('Native campaign egg rig', armature_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for index, bone in enumerate(data['bones']):
        edit = armature_data.edit_bones.new(bone['name'])
        edit.head, edit.tail = (0, 0, 0), (0, .1, 0)
        edit.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    for obj, region in objects:
        groups = {index: obj.vertex_groups.new(name=bone['name']) for index, bone in enumerate(data['bones'])}
        for vertex, influences in enumerate(region['skin']):
            for bone, weight in influences:
                groups[bone].add([vertex], weight / 255, 'REPLACE')
        modifier = obj.modifiers.new('Original weighted native rig', 'ARMATURE')
        modifier.object = rig
        modifier.use_deform_preserve_volume = False
    previous = {}
    bounds = []
    max_matrix_error = 0
    def scalar(anim_id, default, time):
        track = data['nativeTracks'].get(str(anim_id))
        if not track or track['type'] != 'sdr3':
            return default
        times, values = track['frames'], track['keys']
        i = max(0, bisect.bisect_right(times, time) - 1)
        j = min(i + 1, len(times) - 1)
        ratio = 0 if times[i] == times[j] else max(0, min(1, (time - times[i]) / (times[j] - times[i])))
        return values[i] + (values[j] - values[i]) * ratio

    for frame in range(1, count + 2):
        phase = ((frame - 1) % count) / count
        # Three original 2300ms Stand cycles. Retimed by 0.24% to a
        # whole 24fps frame count; no authored breathing scale is added.
        time = ((phase * 3) % 1) * native_duration
        for index, mat in materials.items():
            meta = data['materials'][index]
            layer = meta['layers'].get(mat['emission_layer'], {})
            if layer.get('file'):
                strength = scalar(layer['multiplyId'], layer['multiply'], time) * scalar(layer['brightnessId'], layer['brightness'], time)
                socket = mat.node_tree.nodes['NativeEmission'].inputs['Emission Strength']
                socket.default_value = max(1, meta['hdrEmission']) * strength
                socket.keyframe_insert(data_path='default_value', frame=frame)
        transforms = pose(data, data['sequence']['start'] + time)
        for index, transform in enumerate(transforms):
            loc, rot, scale = transform.decompose()
            reconstructed = Matrix.LocRotScale(loc, rot, scale)
            error = max(abs(transform[row][column] - reconstructed[row][column]) for row in range(4) for column in range(4))
            max_matrix_error = max(max_matrix_error, error)
            if error > 1e-4:
                raise ValueError(f'Native skin palette has shear ({error:.6g}) at bone {index}; exact baking required, refusing distorted rig')
            bone = rig.pose.bones[data['bones'][index]['name']]
            if index in previous and previous[index].dot(rot) < 0:
                rot.negate()
            previous[index] = rot.copy()
            bone.location, bone.rotation_quaternion, bone.scale = loc, rot, scale
            for prop in ('location', 'rotation_quaternion', 'scale'):
                bone.keyframe_insert(data_path=prop, frame=frame)
        if frame % 4 == 1:
            for obj, region in objects:
                for vertex, influences in zip(obj.data.vertices, region['skin']):
                    point = Vector((0, 0, 0))
                    for bone, weight in influences:
                        point += (transforms[bone] @ vertex.co) * (weight / 255)
                    bounds.append(point)
    # Verify actual Blender modifier output against the native weighted
    # palette at rest, peak breath and late breath before any rendering.
    max_skin_error = 0
    for check_frame in (1, 28, 55):
        scene.frame_set(check_frame)
        bpy.context.view_layer.update()
        time = ((((check_frame - 1) % count) / count * 3) % 1) * native_duration
        transforms = pose(data, data['sequence']['start'] + time)
        graph = bpy.context.evaluated_depsgraph_get()
        for obj, region in objects:
            evaluated = obj.evaluated_get(graph)
            checked_mesh = evaluated.to_mesh()
            try:
                if len(checked_mesh.vertices) != len(region['vertices']):
                    raise ValueError('Weighted rig changed native vertex count')
                for original, influences, vertex in zip(region['vertices'], region['skin'], checked_mesh.vertices):
                    expected = Vector((0, 0, 0))
                    for bone, weight in influences:
                        expected += (transforms[bone] @ Vector(original)) * (weight / 255)
                    max_skin_error = max(max_skin_error, (expected - vertex.co).length)
            finally:
                evaluated.to_mesh_clear()
    if max_skin_error > 1e-5:
        raise ValueError(f'Blender armature differs from native skin by {max_skin_error:.6g}; refusing inaccurate egg deformation')
    creep = add_creep(bounds, count, native_duration, scalar, args.creep)
    print('Optional creep: ' + json.dumps(creep))
    # Every rendered frame has a baked native pose, so interpolation cannot
    # introduce a Bezier overshoot. The extra final key equals the first pose.
    minimum = Vector(tuple(min(p[i] for p in bounds) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in bounds) for i in range(3)))
    center = (minimum + maximum) / 2
    extent = max(maximum - minimum)
    camera_data = bpy.data.cameras.new('Fixed UI camera')
    camera = bpy.data.objects.new('Fixed UI camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((4, -6, 4.2)).normalized() * extent * 4
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    rotation = camera.rotation_euler.to_matrix().transposed()
    projected = [rotation @ (point - center) for point in bounds]
    width = max(v.x for v in projected) - min(v.x for v in projected)
    height = max(v.y for v in projected) - min(v.y for v in projected)
    camera_data.ortho_scale = max(height, width / .8) * 1.13
    scene.camera = camera
    for name, delta, power, color in [('Key', (3, -4, 5), 650, (1, .87, .72)),
                                       ('Fill', (-4, -2, 3), 430, (.59, .73, 1)),
                                       ('Rim', (2, 4, 4), 800, (.72, .84, 1))]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = power * extent ** 2 / 9
        light_data.shape, light_data.size, light_data.color = 'DISK', extent * 1.4, color
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = center + Vector(delta) * extent / 3
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    provenance = dict(data['provenance'])
    provenance['animation'] += '; original blended skin evaluated by an identity-bind armature palette; three Stand cycles'
    provenance['deformationMethod'] = 'native weighted linear skinning via baked matrix palette'
    provenance['maxPaletteDecompositionError'] = max_matrix_error
    provenance['maxBlenderSkinDeformationError'] = max_skin_error
    provenance['validatedSkinFrames'] = [1, 28, 55]
    provenance['creep'] = creep
    scene['provenance'] = json.dumps(provenance)
    scene.frame_set(1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE / ('zerg-' + args.device + '.blend')))
    if args.prepare_only:
        print('Prepared portable blend; no rendering requested')
        return
    if args.pilot:
        scene.render.filepath = str(out / (args.device + '-pilot.png'))
        bpy.ops.render.render(write_still=True)
        return
    fingerprint_source = Path(__file__).read_bytes() + data_path.read_bytes() + bpy.app.version_string.encode()
    for name in data['textureRequests']:
        fingerprint_source += texture_path(name).read_bytes()
    fingerprint_source += json.dumps(creep, sort_keys=True).encode()
    if creep['enabled']:
        for path in creep['textures']:
            fingerprint_source += Path(path).read_bytes()
    fingerprint = hashlib.sha256(fingerprint_source).hexdigest()
    frames = out / ('frames-' + fingerprint[:12])
    frames.mkdir(exist_ok=True)
    for frame in range(1, count + 1):
        path = frames / f'{frame - 1:03d}.png'
        if path.exists():
            continue
        scene.frame_set(frame)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    report = {'device': args.device, 'frames': count, 'width': 256, 'height': 320,
              'duration': duration, 'sourceSHA256': data['sourceSHA256'],
              'sourceModelSHA256': data['sourceSHA256'],
              'framesDir': str(frames), 'fingerprint': fingerprint,
              'nativeSequence': data['sequence'], 'provenance': provenance,
              'frameCount': count, 'fps': 24,
              'blender': bpy.app.version_string, 'engine': scene.render.engine,
              'meshVertices': sum(len(r['vertices']) for r in data['regions']),
              'triangles': sum(len(r['triangles']) for r in data['regions']),
              'authoredDeformation': False, 'nativeCycles': 3, 'creep': creep,
              'nativeSkinInfluences': max(len(weights) for r in data['regions'] for weights in r['skin'])}
    (out / 'render.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
