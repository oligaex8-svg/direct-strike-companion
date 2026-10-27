"""Portable native campaign prop renderer; no geometry generation or turntable.

Exports retain original M3 skin palettes, UVs, normals and native tracks. This
renderer adapts SC2 standard/composite materials to Blender PBR. Native cubic
reflection sampling and runtime video screens are explicitly unsupported.
"""
import argparse
import copy
import bisect
import hashlib
import json
import math
from pathlib import Path, PureWindowsPath
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/campaign48'
PROFILES = {
    'adun-core': {'size': (256, 320), 'a': (2.5, -6, 3.2), 'b': (-3.5, -6, 2.4), 'pilotPhase': .05, 'surface': 'metal'},
    'leviathan-nest': {'size': (256, 256), 'a': (3, -5, 3.3), 'b': (-4, -5, 4.2), 'pilotPhase': .2, 'surface': 'organic'},
    'leviathan-egg': {'size': (256, 320), 'a': (3, -5, 3.5), 'b': (-4, -5, 3.5), 'pilotPhase': .2, 'surface': 'organic'},
    'hyperion-table': {'size': (320, 192), 'a': (3, -5, 4), 'b': (-4, -5, 3), 'pilotPhase': 0, 'surface': 'metal'},
    'hyperion-station': {'size': (320, 256), 'a': (3, -5, 4.6), 'b': (-4, -5, 3.4), 'pilotPhase': .2, 'surface': 'metal'},
    'hyperion-holomap': {'size': (320, 192), 'a': (3, -5, 6), 'b': (-4, -5, 4), 'pilotPhase': .2, 'surface': 'hologram'},
    'hyperion-console': {'size': (256, 256), 'a': (-6, -3, 3), 'b': (6, -3, 3), 'pilotPhase': 0, 'surface': 'metal'},
    'protoss-core-work': {'size': (256, 320), 'a': (2.5, -6, 3.2), 'b': (-3.5, -6, 2.4), 'pilotPhase': .15, 'surface': 'metal'},
    'protoss-core-architecture': {'size': (256, 320), 'a': (2.5, -6, 3.2), 'b': (-3.5, -6, 2.4), 'pilotPhase': 0, 'surface': 'metal'},
    'protoss-corelock': {'size': (256, 320), 'a': (2, -6, 2.8), 'b': (-3, -6, 2), 'pilotPhase': .05, 'surface': 'energy'},
    'leviathan-tentacle': {'size': (320, 192), 'a': (2, -5, 7), 'b': (-3, -5, 3.5), 'pilotPhase': .25, 'surface': 'organic'},
}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', choices=tuple(PROFILES), required=True)
    parser.add_argument('--pilot', action='store_true')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--creep', action=argparse.BooleanOptionalAction, default=True, help='Native-texture grounding footprint for leviathan-nest; --no-creep is for diagnostics')
    parser.add_argument('--angle', choices=('a', 'b', 'both'), default='a')
    parser.add_argument('--phase', type=float, help='Pilot native phase, 0 <= phase < 1')
    parser.add_argument('--supersample', type=int, choices=(1, 2), default=1, help='Render raw frames at this multiple; report target and raw dimensions separately')
    parser.add_argument('--frames', type=int, default=128, help='Native clip samples; static props use one frame')
    parser.add_argument('--duration-ms', type=float, help='Optional explicit retiming; only allowed for closed native visual tracks')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not 2 <= args.frames <= 1024:
        parser.error('--frames must be 2..1024')
    if args.phase is not None and not 0 <= args.phase < 1:
        parser.error('--phase must be in [0, 1)')
    if args.duration_ms is not None and args.duration_ms <= 0:
        parser.error('--duration-ms must be positive')
    if args.angle == 'both' and not args.pilot:
        parser.error('--angle both is only supported with --pilot')
    return args


def texture_path(name):
    return NATIVE / 'textures' / (PureWindowsPath(name).stem.lower() + '.png')


def source_time(data, track, time):
    sequence = track.get('sourceSequence')
    if not sequence:
        return time
    span = sequence['end'] - sequence['start']
    timing = track.get('sourceTiming')
    if timing is not None:
        if not timing['cycles']:
            return sequence['start']
        phase = (time - data['sequence']['start']) / timing['outputDuration']
        return sequence['start'] + ((phase * timing['cycles']) % 1) * span
    return sequence['start'] + (time - data['sequence']['start']) % span


def sample_native(data, anim_id, default, time):
    track = data['nativeTracks'].get(str(anim_id))
    if not track:
        return default
    time = source_time(data, track, time)
    times, values = track['frames'], track['keys']
    i = max(0, bisect.bisect_right(times, time) - 1)
    j = min(i + 1, len(times) - 1)
    u = 0 if times[j] == times[i] else max(0, min(1, (time - times[i]) / (times[j] - times[i])))
    if isinstance(values[i], (int, float)):
        return values[i] + (values[j] - values[i]) * u
    if isinstance(values[i], dict) and all(axis in values[i] for axis in ('x', 'y')):
        axes = ('x', 'y', 'z') if 'z' in values[i] else ('x', 'y')
        return [values[i][axis] + (values[j][axis] - values[i][axis]) * u for axis in axes]
    return default


def sample_bone(data, anim_id, default, time, rotation=False):
    track = data['tracks'].get(str(anim_id))
    convert = Quaternion if rotation else Vector
    if not track:
        return convert(default)
    time = source_time(data, track, time)
    times, values = track['frames'], track['values']
    i = max(0, bisect.bisect_right(times, time) - 1)
    j = min(i + 1, len(times) - 1)
    u = 0 if times[j] == times[i] else max(0, min(1, (time - times[i]) / (times[j] - times[i])))
    a, b = convert(values[i]), convert(values[j])
    return a.slerp(b, u) if rotation else a.lerp(b, u)


def pose(data, time):
    transforms = []
    for bone in data['bones']:
        loc = sample_bone(data, bone['ids']['location'], bone['location'], time)
        rot = sample_bone(data, bone['ids']['rotation'], bone['rotation'], time, True)
        scale = sample_bone(data, bone['ids']['scale'], bone['scale'], time)
        local = Matrix.LocRotScale(loc, rot, scale)
        transforms.append(transforms[bone['parent']] @ local if bone['parent'] >= 0 else local)
    return [Matrix(bone.get('partTransform', Matrix.Identity(4))) @ transform @ Matrix(bone['inverseBind']) for transform, bone in zip(transforms, data['bones'])]


def track_motion(data):
    varying = False
    closed = True
    for track in data['tracks'].values():
        values = track['values']
        varying |= any(max(abs(a - b) for a, b in zip(values[0], value)) > 1e-6 for value in values[1:])
        delta = max(abs(a - b) for a, b in zip(values[0], values[-1]))
        if track['kind'] == 'quaternion':
            delta = min(delta, max(abs(a + b) for a, b in zip(values[0], values[-1])))
        closed &= delta < 1e-4
    for track in data['nativeTracks'].values():
        if track['type'] == 'sdr3':
            values = track['keys']
            varying |= max(values) - min(values) > 1e-6
            closed &= abs(values[-1] - values[0]) < 1e-4
        elif track['type'] == 'sd2v':
            values = track['keys']
            varying |= any(value != values[0] for value in values[1:])
            closed &= all(abs(values[0][axis] - values[-1][axis]) < 1e-4 for axis in ('x', 'y'))
    for material in data['materials']:
        for layer in material['layers'].values():
            flip = layer.get('flipbook', {})
            cells = flip.get('rows', 0) * flip.get('columns', 0)
            track = data['nativeTracks'].get(str(flip.get('frameId')))
            if cells and track:
                values = track['keys']
                varying |= len(set(value % cells for value in values)) > 1
                closed &= values[0] % cells == values[-1] % cells
    return bool(varying), bool(closed)


class Materials:
    """Build one adapted material per native region, retaining composite layers.

    Composite multiply overlays modify base color. Opaque overlays mix base
    color using their native alpha factors. Additive overlays contribute native
    emission (including Leviathan's baked-lighting UV1 layer) without making a
    duplicate surface. Additive-only props use alpha-weighted emission for RGBA.
    """
    def __init__(self, data, profile, regions):
        self.data, self.profile = data, profile
        self.images, self.animation = {}, []
        self.notes = set()
        self.uv_channels = {name for region in regions for name in region['uvs']}

    def scalar(self, nodes, links, layer):
        node = nodes.new('ShaderNodeMath')
        node.operation = 'MULTIPLY'
        for index, (name, id_key) in enumerate((('multiply', 'multiplyId'), ('brightness', 'brightnessId'))):
            node.inputs[index].default_value = layer[name]
            self.animation.append((node.inputs[index], layer[id_key], layer[name], 'scalar'))
        return node.outputs[0]

    def math(self, nodes, links, operation, a, b):
        node = nodes.new('ShaderNodeMath')
        node.operation = operation
        for index, value in enumerate((a, b)):
            if isinstance(value, (int, float)):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    def mix(self, nodes, links, operation, a, b, factor=1):
        node = nodes.new('ShaderNodeMixRGB')
        node.blend_type = operation
        if isinstance(factor, (int, float)):
            node.inputs[0].default_value = factor
        else:
            links.new(factor, node.inputs[0])
        for index, value in ((1, a), (2, b)):
            if isinstance(value, (list, tuple)):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    def texture(self, nodes, links, layer, role):
        name = layer['file']
        noncolor = role in ('normal', 'specular', 'alpha')
        key = (name.lower(), noncolor)
        if key not in self.images:
            image = bpy.data.images.load(str(texture_path(name)), check_existing=False)
            image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
            self.images[key] = image
        image_node = nodes.new('ShaderNodeTexImage')
        image_node.image = self.images[key]
        image_node.extension = 'REPEAT' if layer.get('flags', 0) & 0xC else 'EXTEND'
        image_node.label = role + ': ' + name
        uv_index = layer['uvSource']
        if uv_index > 1:
            self.notes.add(f'UV source {uv_index} for {name} adapted to mesh UV0; campaign projection coordinates unavailable')
            uv_index = 0
        channel = 'uv' + str(uv_index)
        if channel not in self.uv_channels:
            self.notes.add(f'Missing {channel} for {name} adapted to UV0')
            uv_index = 0
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'Native UV' + str(uv_index)
        mapping = nodes.new('ShaderNodeMapping')
        links.new(uv.outputs[0], mapping.inputs['Vector'])
        for field, socket, conversion in (('uv_offset', 'Location', 'uv_offset'), ('uv_tiling', 'Scale', 'uv_tiling'), ('uv_angle', 'Rotation', 'uv_angle')):
            meta = layer.get('uvAnimation', {}).get(field)
            if meta:
                self.animation.append((mapping.inputs[socket], meta['id'], meta['default'], conversion))
        flipbook = layer.get('flipbook', {})
        rows, columns = flipbook.get('rows', 0), flipbook.get('columns', 0)
        if rows and columns:
            scale_uv = nodes.new('ShaderNodeVectorMath')
            scale_uv.operation = 'MULTIPLY'
            scale_uv.inputs[1].default_value = (1 / columns, 1 / rows, 1)
            links.new(mapping.outputs[0], scale_uv.inputs[0])
            offset_uv = nodes.new('ShaderNodeVectorMath')
            offset_uv.operation = 'ADD'
            links.new(scale_uv.outputs[0], offset_uv.inputs[0])
            self.animation.append((offset_uv.inputs[1], flipbook['frameId'], flipbook['frame'], ('flipbook', rows, columns)))
            links.new(offset_uv.outputs[0], image_node.inputs['Vector'])
            self.notes.add('Native flipbook frame tracks sampled as declared atlas cells; UV row orientation uses the native flipped-V mesh convention')
        else:
            links.new(mapping.outputs[0], image_node.inputs['Vector'])
        color = image_node.outputs['Color']
        channels = layer['channels']
        if channels == 2:
            color = image_node.outputs['Alpha']
        elif channels in (3, 4, 5):
            separate = nodes.new('ShaderNodeSeparateColor')
            links.new(image_node.outputs['Color'], separate.inputs[0])
            color = separate.outputs[('Red', 'Green', 'Blue')[channels - 3]]
        if layer.get('flags', 0) & 0x10 and role != 'normal':
            invert = nodes.new('ShaderNodeInvert')
            links.new(color, invert.inputs['Color'])
            color = invert.outputs[0]
        return color, image_node.outputs['Alpha'], image_node

    def layer(self, nodes, links, meta, key, role):
        info = meta['layers'].get(key, {})
        if not info.get('file'):
            if role != 'normal' and info.get('flags', 0) & 0x400:
                constant = nodes.new('ShaderNodeRGB')
                constant.outputs[0].default_value = info.get('constantColor', (0, 0, 0, 1))
                color = self.mix(nodes, links, 'MULTIPLY', constant.outputs[0], self.scalar(nodes, links, info))
                return color, constant.outputs[0], None
            return None
        color, alpha, image = self.texture(nodes, links, info, role)
        if role != 'normal':
            color = self.mix(nodes, links, 'MULTIPLY', color, self.scalar(nodes, links, info))
        return color, alpha, image

    def factor(self, nodes, links, entry):
        value = 1.0
        for meta in entry.get('alphaFactors', []):
            node = nodes.new('ShaderNodeValue')
            node.outputs[0].default_value = meta['default']
            self.animation.append((node.outputs[0], meta['id'], meta['default'], 'scalar'))
            value = self.math(nodes, links, 'MULTIPLY', value, node.outputs[0])
        return value

    def build(self, region):
        mat = bpy.data.materials.new('Native campaign ' + region['name'])
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        organic = self.profile['surface'] == 'organic'
        bsdf.inputs['Metallic'].default_value = 0 if organic else .48
        bsdf.inputs['Roughness'].default_value = .36 if organic else .42
        if organic:
            bsdf.inputs['Coat Weight'].default_value = .18
            bsdf.inputs['Coat Roughness'].default_value = .28
        entries = [entry for binding in region['materialBindings'] for entry in binding['layers']]
        base_meta = self.data['materials'][entries[0]['material']]
        base_color = (0.06, 0.07, 0.08, 1)
        emission = (0, 0, 0, 1)
        alpha = 1.0
        visible_color = None
        for index, entry in enumerate(entries):
            meta = self.data['materials'][entry['material']]
            factor = self.factor(nodes, links, entry)
            diffuse = self.layer(nodes, links, meta, 'layer_diff', 'diffuse')
            if diffuse:
                color = diffuse[0]
                if index == 0:
                    base_color = color
                    alpha = diffuse[1]
                elif meta['blend'] == 4:
                    base_color = self.mix(nodes, links, 'MULTIPLY', base_color, color, factor)
                    self.notes.add('Composite multiply layer adapted as native-mask base-color multiplication')
                elif meta['blend'] == 0:
                    base_color = self.mix(nodes, links, 'MIX', base_color, color, factor)
                    self.notes.add('Composite opaque screen layer mixed using native composite alpha factor; no runtime video')
            for key in ('layer_emis1', 'layer_emis2'):
                texture = self.layer(nodes, links, meta, key, 'emissive')
                if texture:
                    gain = self.math(nodes, links, 'MULTIPLY', factor, meta['hdrEmission'])
                    color = self.mix(nodes, links, 'MULTIPLY', texture[0], gain)
                    emission = self.mix(nodes, links, 'ADD', emission, color)
                    visible_color = color
                    if index == 0 and not diffuse:
                        alpha = texture[1]
                    if 'bakedlighting' in meta['layers'][key]['file'].lower():
                        self.notes.add('Native Leviathan baked-lighting UV1 layer retained additively in emission')
            if index == 0:
                specular = self.layer(nodes, links, meta, 'layer_spec', 'specular')
                if specular:
                    links.new(specular[0], bsdf.inputs['Specular IOR Level'])
                normal = self.layer(nodes, links, meta, 'layer_norm', 'normal')
                if normal:
                    image = normal[2]
                    separate = nodes.new('ShaderNodeSeparateColor')
                    links.new(image.outputs['Color'], separate.inputs[0])
                    x = self.math(nodes, links, 'SUBTRACT', self.math(nodes, links, 'MULTIPLY', image.outputs['Alpha'], 2), 1)
                    y = self.math(nodes, links, 'SUBTRACT', self.math(nodes, links, 'MULTIPLY', separate.outputs['Green'], 2), 1)
                    xx = self.math(nodes, links, 'MULTIPLY', x, x)
                    yy = self.math(nodes, links, 'MULTIPLY', y, y)
                    zz = self.math(nodes, links, 'MAXIMUM', self.math(nodes, links, 'SUBTRACT', 1, self.math(nodes, links, 'ADD', xx, yy)), 0)
                    square_root = nodes.new('ShaderNodeMath')
                    square_root.operation = 'SQRT'
                    links.new(zz, square_root.inputs[0])
                    z = self.math(nodes, links, 'ADD', self.math(nodes, links, 'MULTIPLY', square_root.outputs[0], .5), .5)
                    combine = nodes.new('ShaderNodeCombineColor')
                    links.new(image.outputs['Alpha'], combine.inputs['Red'])
                    links.new(separate.outputs['Green'], combine.inputs['Green'])
                    links.new(z, combine.inputs['Blue'])
                    nm = nodes.new('ShaderNodeNormalMap')
                    nm.uv_map = 'Native UV' + str(meta['layers']['layer_norm']['uvSource'])
                    links.new(combine.outputs[0], nm.inputs['Color'])
                    links.new(nm.outputs[0], bsdf.inputs['Normal'])
            if meta['layers'].get('layer_envi', {}).get('file'):
                self.notes.add('Native cubic reflection layer not sampled; authored area lights provide reflected highlights')
        if isinstance(base_color, tuple):
            bsdf.inputs['Base Color'].default_value = base_color
        else:
            links.new(base_color, bsdf.inputs['Base Color'])
        if isinstance(emission, tuple):
            bsdf.inputs['Emission Color'].default_value = emission
        else:
            links.new(emission, bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1
        if base_meta['blend']:
            # Additive SC2 holograms adapted into RGBA: black contributes no
            # coverage, while the original texture alpha still limits the edge.
            color = visible_color if visible_color is not None else base_color
            if not isinstance(color, tuple):
                luminance = nodes.new('ShaderNodeRGBToBW')
                links.new(color, luminance.inputs[0])
                alpha = self.math(nodes, links, 'MULTIPLY', alpha, self.math(nodes, links, 'MINIMUM', self.math(nodes, links, 'MULTIPLY', luminance.outputs[0], 4), 1))
            for key in ('layer_alpha1', 'layer_alpha2'):
                layer = self.layer(nodes, links, base_meta, key, 'alpha')
                if layer:
                    alpha = self.math(nodes, links, 'MULTIPLY', alpha, layer[0])
            transparent = nodes.new('ShaderNodeBsdfTransparent')
            mix = nodes.new('ShaderNodeMixShader')
            if isinstance(alpha, (int, float)):
                mix.inputs[0].default_value = alpha
            else:
                links.new(alpha, mix.inputs[0])
            links.new(transparent.outputs[0], mix.inputs[1])
            links.new(bsdf.outputs[0], mix.inputs[2])
            links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
            mat.surface_render_method = 'BLENDED'
            self.notes.add('SC2 additive/alpha surfaces adapted to texture-alpha and radiance-weighted transparent PBR for portable RGBA')
        self.calibrate_table_glass(region, mat, bsdf, base_meta, base_color, emission)
        return mat

    def calibrate_table_glass(self, region, mat, bsdf, base_meta, base_color, emission):
        source_device = region.get('sourceDevice', self.data['device'])
        if source_device != 'hyperion-table':
            return
        name = base_meta['name'].rsplit(':', 1)[-1]
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        output = nodes.get('Material Output')
        if name == 'Standard_33s':
            # Actual source: monitorGlass01, blend2, flags0x4034 (unshaded,
            # no shadow cast), reflection-only; no diffuse was ever supplied.
            # The generic opaque gray fallback was inappropriate for this pass.
            bsdf.inputs['Base Color'].default_value = (.006, .011, .018, 1)
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .48
            bsdf.inputs['Specular IOR Level'].default_value = .12
            bsdf.inputs['Coat Weight'].default_value = 0
            bsdf.inputs['Emission Strength'].default_value = 0
            fresnel = nodes.new('ShaderNodeFresnel')
            fresnel.inputs['IOR'].default_value = 1.45
            coverage = self.math(nodes, links, 'MULTIPLY', fresnel.outputs[0], .10)
            transparent = nodes.new('ShaderNodeBsdfTransparent')
            mix = nodes.new('ShaderNodeMixShader')
            links.new(coverage, mix.inputs[0])
            links.new(transparent.outputs[0], mix.inputs[1])
            links.new(bsdf.outputs[0], mix.inputs[2])
            links.new(mix.outputs[0], output.inputs['Surface'])
            mat.surface_render_method = 'BLENDED'
            self.notes.add('Hyperion monitorGlass01 Standard_33s native reflection-only additive pass adapted as weak Fresnel-weighted dark glass; opaque gray/specular fallback removed; no diffuse invented')
        elif name == 'Standard_7' or (name == 'sm_starmapTop' and base_meta.get('flags', 0) & 0x10):
            # Respect the source unshaded monitor passes. Keep their real
            # diffuse/constant colors, with a calibrated screen exposure.
            color = base_color
            if name == 'sm_starmapTop':
                color = self.mix(nodes, links, 'MULTIPLY', color, (.48, .55, .60, 1))
                if not isinstance(emission, tuple):
                    color = self.mix(nodes, links, 'ADD', color, self.mix(nodes, links, 'MULTIPLY', emission, (.06, .15, .10, 1)))
            shader = nodes.new('ShaderNodeEmission')
            if isinstance(color, tuple):
                shader.inputs['Color'].default_value = color
            else:
                links.new(color, shader.inputs['Color'])
            shader.inputs['Strength'].default_value = 1
            links.new(shader.outputs[0], output.inputs['Surface'])
            self.notes.add('Hyperion monitorGlass passes retain native diffuse/constant-black and original emissive-mask placement; sm_starmapTop source-unshaded screen exposure/mask gain calibrated, Standard_7 constant-black pass has no invented specular; physical table materials unchanged')

    def animate(self, time, frame):
        for socket, anim_id, default, kind in self.animation:
            value = sample_native(self.data, anim_id, default, time)
            if isinstance(kind, tuple) and kind[0] == 'flipbook':
                rows, columns = kind[1:]
                cell = math.floor(value) % (rows * columns)
                value = ((cell % columns) / columns, (rows - 1 - cell // columns) / rows, 0)
            elif kind == 'uv_offset':
                value = (value[0], -value[1], 0)
            elif kind == 'uv_tiling':
                value = (value[0], value[1], 1)
            elif kind == 'uv_angle':
                value = (value[0], value[1], -value[2])
            socket.default_value = value
            socket.keyframe_insert(data_path='default_value', frame=frame)


def weighted_points(region, transforms):
    for vertex, influences in zip(region['vertices'], region['skin']):
        point = Vector((0, 0, 0))
        for bone, weight in influences:
            point += (transforms[bone] @ Vector(vertex)) * (weight / 255)
        yield point


def add_nest_creep(data, bounds, enabled):
    if data['device'] != 'leviathan-nest' or not enabled:
        return {'enabled': False, 'reason': 'not a nest device' if data['device'] != 'leviathan-nest' else 'explicit diagnostic --no-creep'}
    paths = {}
    for name in ('creep', 'creepheight', 'creepspecularmask'):
        candidates = (NATIVE / 'textures' / (name + '.png'), ROOT / 'assets/themes/native46/textures' / (name + '.png'))
        path = next((candidate for candidate in candidates if candidate.exists()), None)
        if path is None:
            raise FileNotFoundError('Required native creep ground texture missing: ' + ' or '.join(str(candidate) for candidate in candidates))
        paths[name] = path
    contact = data['stagingEvidence']['contact']
    ground = contact['groundZ']
    transforms = pose(data, data['sequence']['start'] + (data['sequence']['end'] - data['sequence']['start']) * .25)
    egg_points = [point for region in data['regions'] if region.get('sourceDevice') == 'leviathan-egg' for point in weighted_points(region, transforms)]
    egg_min = min(point.z for point in egg_points)
    if not -.003 <= egg_min - ground <= .0002:
        raise ValueError(f'Posed egg ground contact is incorrect at native phase .25: gap={egg_min-ground:.6g}')
    minimum = Vector(tuple(min(point[axis] for point in bounds) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in bounds) for axis in range(3)))
    center, span = (minimum + maximum) / 2, maximum - minimum
    rx, ry = span.x * .62, span.y * .62
    vertices = [(center.x, center.y, ground)]
    uv_values = [(.5, .5)]
    for index in range(96):
        angle = math.tau * index / 96
        vertices.append((center.x + rx * math.cos(angle), center.y + ry * math.sin(angle), ground))
        uv_values.append((.5 + .5 * math.cos(angle), .5 + .5 * math.sin(angle)))
    faces = [(0, index + 1, (index + 1) % 96 + 1) for index in range(96)]
    mesh = bpy.data.meshes.new('Authored native creep grounding footprint')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='Creep footprint UV')
    for loop in mesh.loops:
        uv.data[loop.index].uv = uv_values[loop.vertex_index]
    obj = bpy.data.objects.new('Native creep under campaign nest', mesh)
    bpy.context.collection.objects.link(obj)
    mat = bpy.data.materials.new('Native creep wet ground material adaptation')
    mat.use_nodes = True
    mat.surface_render_method = 'BLENDED'
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Coat Weight'].default_value = .12
    bsdf.inputs['Coat Roughness'].default_value = .28
    bsdf.inputs['Emission Strength'].default_value = 0
    coord = nodes.new('ShaderNodeTexCoord')
    textures = {}
    for name, path in paths.items():
        image = bpy.data.images.load(str(path), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if name == 'creep' else 'Non-Color'
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'EXTEND'
        links.new(coord.outputs['UV'], texture.inputs['Vector'])
        textures[name] = texture
    tint = nodes.new('ShaderNodeMixRGB')
    tint.blend_type = 'MULTIPLY'
    tint.inputs[0].default_value = 1
    tint.inputs[2].default_value = (.72, .38, .8, 1)
    links.new(textures['creep'].outputs['Color'], tint.inputs[1])
    links.new(tint.outputs[0], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .38
    bump.inputs['Distance'].default_value = max(span) * .014
    links.new(textures['creepheight'].outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['From Min'].default_value = 0
    rough.inputs['From Max'].default_value = 1
    rough.inputs['To Min'].default_value = .62
    rough.inputs['To Max'].default_value = .28
    links.new(textures['creepspecularmask'].outputs['Color'], rough.inputs['Value'])
    links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    links.new(textures['creepspecularmask'].outputs['Color'], bsdf.inputs['Specular IOR Level'])
    distance = nodes.new('ShaderNodeVectorMath')
    distance.operation = 'DISTANCE'
    distance.inputs[1].default_value = (.5, .5, 0)
    links.new(coord.outputs['UV'], distance.inputs[0])
    ridge = nodes.new('ShaderNodeMath')
    ridge.operation = 'MULTIPLY_ADD'
    ridge.inputs[1].default_value = .07
    ridge.inputs[2].default_value = -.035
    links.new(textures['creepheight'].outputs['Color'], ridge.inputs[0])
    organic = nodes.new('ShaderNodeMath')
    organic.operation = 'ADD'
    links.new(distance.outputs['Value'], organic.inputs[0])
    links.new(ridge.outputs[0], organic.inputs[1])
    feather = nodes.new('ShaderNodeMapRange')
    feather.interpolation_type = 'SMOOTHERSTEP'
    feather.clamp = True
    feather.inputs['From Min'].default_value = .26
    feather.inputs['From Max'].default_value = .445
    feather.inputs['To Min'].default_value = 1
    feather.inputs['To Max'].default_value = 0
    links.new(organic.outputs[0], feather.inputs['Value'])
    # Even the strongest height perturbation makes the outer polygon boundary
    # fully transparent (.5-.035 > .445), so no rectangular/cropped edge exists.
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(feather.outputs['Result'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(bsdf.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    obj.data.materials.append(mat)
    bounds.extend(Vector(vertex) for vertex in vertices)
    provenance = {'enabled': True, 'textures': {name: str(path) for name, path in paths.items()},
                  'geometry': 'Authored static elliptical grounding footprint, native-height irregular alpha feather; no source mesh changes',
                  'material': 'Real native creep color/height/specular maps, authored purple material tint and wet PBR adaptation; emission zero',
                  'animation': 'No added ground or edge motion; only original egg/tentacle tracks animate',
                  'groundZ': ground, 'eggWorldMinZAtPhase025': egg_min, 'eggGroundGapAtPhase025': egg_min-ground,
                  'contactSource': 'Original weighted native skin, evaluated at phase .25 with authored whole-part staging',
                  'footprintRadii': [rx, ry]}
    obj['provenance'] = json.dumps(provenance)
    return provenance


class Bounds:
    """Retain exact extrema for both fixed views without storing all poses."""
    def __init__(self, profile):
        self.directions = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))]
        for angle in ('a', 'b'):
            rotation = (-Vector(profile[angle])).to_track_quat('-Z', 'Y').to_matrix()
            self.directions.extend((rotation.col[0].copy(), rotation.col[1].copy()))
        self.extrema = [[math.inf, -math.inf, None, None] for _ in self.directions]

    def extend(self, points):
        for point in points:
            for direction, limits in zip(self.directions, self.extrema):
                projection = direction.dot(point)
                if projection < limits[0]:
                    limits[0], limits[2] = projection, point.copy()
                if projection > limits[1]:
                    limits[1], limits[3] = projection, point.copy()

    def __iter__(self):
        return iter([point for limits in self.extrema for point in limits[2:] if point is not None])


def camera_fit(scene, bounds, profile, angle):
    minimum = Vector(tuple(min(point[axis] for point in bounds) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in bounds) for axis in range(3)))
    center = (minimum + maximum) / 2
    extent = max(maximum - minimum)
    camera = scene.camera
    camera.location = center + Vector(profile[angle]).normalized() * extent * 4
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    inverse_rotation = camera.rotation_euler.to_matrix().transposed()
    projected = [inverse_rotation @ (point - center) for point in bounds]
    width = max(point.x for point in projected) - min(point.x for point in projected)
    height = max(point.y for point in projected) - min(point.y for point in projected)
    camera.data.ortho_scale = max(height, width / (profile['size'][0] / profile['size'][1])) * 1.15
    return center, extent


def main():
    args = arguments()
    profile = PROFILES[args.device]
    data_path = NATIVE / (args.device + '-data.json')
    data = json.loads(data_path.read_text(encoding='utf-8'))
    source_parts = data.get('sourceParts', [{'model': data['model'], 'sourceSHA256': data['sourceSHA256']}])
    for part in source_parts:
        source = NATIVE / (part['model'] + '.m3')
        if hashlib.sha256(source.read_bytes()).hexdigest() != part['sourceSHA256']:
            raise ValueError('Native campaign M3 changed; rerun Export-Campaign48.py: ' + part['model'])
    missing = sorted({str(texture_path(name)) for name in data['textureRequests'] if not texture_path(name).exists()})
    if missing:
        raise FileNotFoundError('Missing required native campaign PNGs:\n' + '\n'.join(missing))
    animated, closed = track_motion(data)
    if args.duration_ms is not None and not closed:
        raise ValueError('Explicit retiming requires closed native visual-track endpoints')
    native_duration = data['sequence']['end'] - data['sequence']['start']
    duration = args.duration_ms if args.duration_ms is not None else native_duration
    count = args.frames if animated else 1
    out = ROOT / 'verification/local48-campaign' / args.device
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode, scene.render.threads = 'FIXED', 1
    scene.render.resolution_x, scene.render.resolution_y = (dimension * args.supersample for dimension in profile['size'])
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
    scene.render.use_compositing = False
    scene.render.fps = 24
    scene.render.fps_base = 24 / (count * 1000 / duration)
    scene.frame_start, scene.frame_end = 1, count
    scene.view_settings.view_transform = 'AgX'
    scene.world.color = (.035, .04, .05)
    factory = Materials(data, profile, data['regions'])
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
        obj.data.materials.append(factory.build(region))
        obj['native_skin'] = json.dumps(region['skin'])
        obj['native_material_bindings'] = json.dumps(region['materialBindings'])
        obj['source'] = data['model'] + '.m3: unchanged source geometry, UVs, normals and weights'
        objects.append((obj, region))
    armature_data = bpy.data.armatures.new('Native campaign identity-bind palette')
    rig = bpy.data.objects.new('Original native campaign skin rig', armature_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for meta in data['bones']:
        bone = armature_data.edit_bones.new(meta['name'])
        bone.head, bone.tail = (0, 0, 0), (0, .1, 0)
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    for obj, region in objects:
        groups = {index: obj.vertex_groups.new(name=bone['name']) for index, bone in enumerate(data['bones'])}
        for index, influences in enumerate(region['skin']):
            for bone, weight in influences:
                groups[bone].add([index], weight / 255, 'REPLACE')
        modifier = obj.modifiers.new('Native weighted linear skinning', 'ARMATURE')
        modifier.object = rig
        modifier.use_deform_preserve_volume = False
    previous, bounds = {}, Bounds(profile)
    max_matrix_error = 0
    for frame in range(1, count + 2):
        time = data['sequence']['start'] + ((frame - 1) % count) / count * native_duration
        transforms = pose(data, time)
        factory.animate(time, frame)
        for index, transform in enumerate(transforms):
            loc, rot, scale = transform.decompose()
            rebuilt = Matrix.LocRotScale(loc, rot, scale)
            error = max(abs(transform[row][column] - rebuilt[row][column]) for row in range(4) for column in range(4))
            max_matrix_error = max(max_matrix_error, error)
            if error > 1e-4:
                raise ValueError(f'Native palette shear at bone {index}: {error:.6g}; refusing lossy deformation')
            bone = rig.pose.bones[data['bones'][index]['name']]
            if index in previous and previous[index].dot(rot) < 0:
                rot.negate()
            previous[index] = rot.copy()
            bone.location, bone.rotation_quaternion, bone.scale = loc, rot, scale
            for prop in ('location', 'rotation_quaternion', 'scale'):
                bone.keyframe_insert(data_path=prop, frame=frame)
        for _, region in objects:
            bounds.extend(weighted_points(region, transforms))
    max_skin_error = 0
    check_frames = sorted({1, max(1, count // 3), max(1, count * 2 // 3)})
    for frame in check_frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        transforms = pose(data, data['sequence']['start'] + (frame - 1) / count * native_duration)
        for obj, region in objects:
            evaluated = obj.evaluated_get(graph)
            checked = evaluated.to_mesh()
            try:
                if len(checked.vertices) != len(region['vertices']):
                    raise ValueError('Native campaign vertex count changed')
                for expected, actual in zip(weighted_points(region, transforms), checked.vertices):
                    max_skin_error = max(max_skin_error, (expected - actual.co).length)
            finally:
                evaluated.to_mesh_clear()
    if max_skin_error > 1e-4:
        raise ValueError(f'Blender skin differs from native palette by {max_skin_error:.6g}')
    creep = add_nest_creep(data, bounds, args.creep)
    print('Native creep ground: ' + json.dumps(creep))
    camera_data = bpy.data.cameras.new('Fixed campaign UI camera')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new('Fixed campaign UI camera', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    center, extent = camera_fit(scene, bounds, profile, 'a' if args.angle == 'both' else args.angle)
    for name, offset, energy, color in [('Key', (3, -4, 5), 550, (1, .88, .73)), ('Fill', (-4, -2, 3), 350, (.6, .74, 1)), ('Rim', (2, 4, 4), 700, (.73, .85, 1))]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = energy * extent ** 2 / 9
        light_data.shape, light_data.size, light_data.color = 'DISK', extent * 1.3, color
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = center + Vector(offset) * extent / 3
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    effective_compound = copy.deepcopy(data.get('compoundTiming'))
    if effective_compound and args.duration_ms is not None:
        effective_compound['outputDuration'] = duration
        effective_compound['globalAuthoredRetiming'] = True
        for part in effective_compound['parts']:
            timing = part.get('timing')
            if timing is not None:
                timing['outputDuration'] = duration
                if timing['cycles']:
                    timing['effectiveCycleDuration'] = duration / timing['cycles']
                    timing['nativeToEffectiveRate'] = timing['nativeDuration'] / timing['effectiveCycleDuration']
                    timing['durationChangePercent'] = (timing['effectiveCycleDuration'] / timing['nativeDuration'] - 1) * 100
                    timing['authoredRetiming'] = abs(timing['effectiveCycleDuration'] - timing['nativeDuration']) > .001
    provenance = dict(data['provenance'])
    provenance['presentation'] = 'Authored fixed-camera profiles, lights and Blender PBR translation; no authored geometry or movement'
    provenance['materialAdaptations'] = sorted(factory.notes)
    provenance['skinMethod'] = 'Original native hierarchy evaluated into identity-bind linear-skin palette'
    provenance['maxPaletteDecompositionError'] = max_matrix_error
    provenance['maxBlenderSkinError'] = max_skin_error
    provenance['validatedSkinFrames'] = check_frames
    provenance['timing'] = 'Exact native duration with downsampled poses' if args.duration_ms is None else f'Explicit authored retiming from {native_duration}ms to {duration}ms; native closed motion retained'
    if args.device in ('adun-core', 'leviathan-nest'):
        provenance['timing'] = 'Per-part native/effective timing declared in compoundTiming; no invented movement' + (f'; explicit global retime to {duration}ms' if args.duration_ms is not None else '')
    provenance['capture'] = 'Offline reconstruction from actual native campaign M3s; not an engine capture'
    provenance['compoundTiming'] = effective_compound
    provenance['stagingEvidence'] = data.get('stagingEvidence')
    provenance['creep'] = creep
    scene['provenance'] = json.dumps(provenance)
    phase = args.phase if args.phase is not None else profile['pilotPhase']
    pilot_frame = 1 + min(count - 1, round(phase * count))
    scene.frame_set(pilot_frame if args.pilot else 1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE / (args.device + '.blend')))
    fingerprint_source = Path(__file__).read_bytes() + data_path.read_bytes() + bpy.app.version_string.encode() + json.dumps({'frames': count, 'duration': duration, 'angle': args.angle, 'profile': profile, 'supersample': args.supersample}, sort_keys=True).encode()
    for name in sorted(set(data['textureRequests']), key=str.lower):
        fingerprint_source += texture_path(name).read_bytes()
    fingerprint_source += json.dumps(creep, sort_keys=True).encode()
    if creep['enabled']:
        for path in creep['textures'].values():
            fingerprint_source += Path(path).read_bytes()
    fingerprint = hashlib.sha256(fingerprint_source).hexdigest()
    frames = out / ('frames-' + fingerprint[:12])
    report = {'device': args.device, 'frames': count, 'frameCount': count, 'width': profile['size'][0], 'height': profile['size'][1], 'duration': duration,
              'rawWidth': scene.render.resolution_x, 'rawHeight': scene.render.resolution_y, 'supersample': args.supersample,
              'fps': count * 1000 / duration, 'nativeDuration': native_duration,
              'nativeDurationScope': 'compound master timeline; individual source durations in sourceParts' if len(source_parts) > 1 else 'original native clip', 'nativeSequence': data['sequence'],
              'sourceSHA256': data['sourceSHA256'], 'sourceModelSHA256': data['sourceSHA256'], 'sourceParts': source_parts,
              'framesDir': str(frames), 'fingerprint': fingerprint, 'provenance': provenance,
              'static': not animated, 'closedNativeVisualTracks': closed, 'cameraAngle': args.angle,
              'unsupportedCases': data.get('unsupportedCases', []),
              'sourceRole': {'protoss-corelock': 'holographic lock optical menu accent', 'protoss-core-architecture': 'native physical core architecture', 'protoss-core-work': 'articulating native campaign core prototype only', 'adun-core': 'campaign physical core assembly with native optical lock', 'leviathan-nest': 'native campaign biology with authored whole-part staging'}.get(args.device, 'native campaign prop/station'),
              'compoundTiming': effective_compound, 'stagingEvidence': data.get('stagingEvidence'), 'engineCapture': False, 'creep': creep,
              'blender': bpy.app.version_string, 'engine': scene.render.engine,
              'meshVertices': sum(len(region['vertices']) for region in data['regions']),
              'triangles': sum(len(region['triangles']) for region in data['regions']), 'complete': False}
    if args.prepare_only:
        report['mode'] = 'prepared'
    elif args.pilot:
        report['mode'], report['pilots'] = 'pilot', []
        report['pilotNativePhase'] = phase
        for angle in ('a', 'b') if args.angle == 'both' else (args.angle,):
            camera_fit(scene, bounds, profile, angle)
            path = out / (args.device + '-pilot-' + angle + '.png')
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            report['pilots'].append(str(path))
    else:
        frames.mkdir(exist_ok=True)
        for frame in range(1, count + 1):
            path = frames / f'{frame - 1:03d}.png'
            if path.exists():
                continue
            scene.frame_set(frame)
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
        report['mode'], report['complete'] = 'full', True
    (out / 'render.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
