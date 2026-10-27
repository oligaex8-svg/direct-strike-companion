"""Render native Terran tech; run with Blender --background --python ... -- [options].

No camera/object turntable. Native rigid bones animate each submesh. The optional
sensor scan rotates only the native Top assembly, and is labelled authored.
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
NATIVE = ROOT / 'assets/themes/native45'


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', choices=('sensor', 'reactor'), default='sensor')
    parser.add_argument('--pilot', action='store_true')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--sensor-scan', action=argparse.BooleanOptionalAction, default=True, help='Authored 8s revolution of native Top sensor assembly; never a native Stand claim')
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


def pose(data, time, scan_phase=None):
    transforms = []
    for bone in data['bones']:
        loc = sample(data, bone['ids']['location'], bone['location'], time)
        rot = sample(data, bone['ids']['rotation'], bone['rotation'], time, True)
        scale = sample(data, bone['ids']['scale'], bone['scale'], time)
        if scan_phase is not None and bone['name'] == 'Top':
            rot = rot @ Quaternion((0, 0, 1), scan_phase * math.tau)
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
    bsdf.inputs['Metallic'].default_value = .58
    bsdf.inputs['Roughness'].default_value = .43
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


def main():
    args = arguments()
    data_path = NATIVE / (args.device + '-data.json')
    if not data_path.exists():
        raise FileNotFoundError('Run verification/Export-Terran45.py first: ' + str(data_path))
    data = json.loads(data_path.read_text(encoding='utf-8'))
    missing = [str(texture_path(name)) for name in data['textureRequests'] if not texture_path(name).exists()]
    if missing:
        raise FileNotFoundError('Missing required native PNG textures; extract/convert before rendering:\n' + '\n'.join(missing))
    source = NATIVE / (data['model'] + '.m3')
    if hashlib.sha256(source.read_bytes()).hexdigest() != data['sourceSHA256']:
        raise ValueError('Native model changed; rerun Export-Terran45.py')
    out = ROOT / 'verification/local45-terran' / args.device
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 1
    scene.render.fps = 24
    count = 192 if args.device == 'sensor' else 160
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
        obj['native_bone'] = data['bones'][region['bone']]['name']
        obj['source'] = data['model'] + '.m3: unchanged native vertices/triangles/UVs; decoded native normals'
        objects.append((obj, region['bone']))
    previous = {}
    bounds = []
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
        # Sensor replays two exact 4s Stand loops; TechLab retimes 6667ms by
        # 0.005% to the nearest 24fps closed loop (160 frames).
        time = (phase * (8000 if args.device == 'sensor' else native_duration)) % native_duration
        for index, mat in materials.items():
            meta = data['materials'][index]
            layer = meta['layers'].get(mat['emission_layer'], {})
            if layer.get('file'):
                strength = scalar(layer['multiplyId'], layer['multiply'], time) * scalar(layer['brightnessId'], layer['brightness'], time)
                socket = mat.node_tree.nodes['NativeEmission'].inputs['Emission Strength']
                socket.default_value = max(1, meta['hdrEmission']) * strength
                socket.keyframe_insert(data_path='default_value', frame=frame)
        transforms = pose(data, data['sequence']['start'] + time,
                          phase if args.device == 'sensor' and args.sensor_scan else None)
        for obj, bone in objects:
            loc, rot, scale = transforms[bone].decompose()
            if obj.name in previous and previous[obj.name].dot(rot) < 0:
                rot.negate()
            previous[obj.name] = rot.copy()
            obj.location, obj.rotation_quaternion, obj.scale = loc, rot, scale
            for prop in ('location', 'rotation_quaternion', 'scale'):
                obj.keyframe_insert(data_path=prop, frame=frame)
            if frame % 8 == 1:
                bounds.extend(transforms[bone] @ vertex.co for vertex in obj.data.vertices)
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
    provenance['animation'] += ('; authored Top assembly 8s scan revolution enabled' if args.sensor_scan and args.device == 'sensor' else '; no additional controller')
    scene['provenance'] = json.dumps(provenance)
    scene.frame_set(1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE / ('terran-' + args.device + '.blend')))
    if args.prepare_only:
        print('Prepared portable blend; no rendering requested')
        return
    if args.pilot:
        scene.render.filepath = str(out / (args.device + '-pilot.png'))
        bpy.ops.render.render(write_still=True)
        return
    fingerprint_source = Path(__file__).read_bytes() + data_path.read_bytes() + str(args.sensor_scan).encode() + bpy.app.version_string.encode()
    for name in data['textureRequests']:
        fingerprint_source += texture_path(name).read_bytes()
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
              'sensorScanAuthored': args.device == 'sensor' and args.sensor_scan}
    (out / 'render.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
