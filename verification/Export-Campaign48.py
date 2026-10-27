"""Export selected native campaign architecture, weighted meshes and idle tracks.

--check validates and reports without writing generated data. The original region topology and all native skin influences are preserved.
"""
import argparse
import copy
import bisect
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/campaign48'
DEVICES = {
    'hyperion-table': ('SM_HyperionBridgeStarmap', 'Stand'),
    'hyperion-holomap': ('SM_HyperionBridgeHolomap', 'GLstand'),
    'hyperion-console': ('SM_HyperionBridgeCommConsole', 'Stand'),
    'protoss-core-work': ('SMX2_ShipRoom_01', 'Stand Work'),
    'protoss-core-architecture': ('SMX2_ShipRoom_04', 'Stand'),
    'protoss-corelock': ('SMX2_ShipRoom_CoreLock', 'Stand'),
    'leviathan-egg': ('SMX1_EggRoomZerglingEgg', 'Stand'),
    'leviathan-tentacle': ('SMX1_LeviathanFloorTentacle', 'Stand'),
}
LAYERS = ('layer_diff', 'layer_spec', 'layer_norm', 'layer_emis1',
          'layer_emis2', 'layer_alpha1', 'layer_alpha2', 'layer_envi')


def load_parser():
    spec = importlib.util.spec_from_file_location('native_m3', ROOT / 'verification/vendor/m3studio/io_m3.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def export_device(device, parser):
    model_name, sequence_name = DEVICES[device]
    source = NATIVE / (model_name + '.m3')
    sections = parser.M3SectionList.load(str(source))
    model = sections.model
    text = lambda ref: sections[ref].content_to_string() if ref.index else ''
    vec = lambda v: [v.x, v.y, v.z]
    quat = lambda v: [v.w, v.x, v.y, v.z]
    matrix = lambda value: [[getattr(getattr(value, col), row) for col in 'xyzw'] for row in 'xyzw']
    materials = []
    for material in sections[model.materials_standard]:
        layers = {}
        for key in LAYERS:
            values = sections[getattr(material, key)]
            if not len(values):
                continue
            layer = values[0]
            layers[key] = {'file': text(layer.color_bitmap), 'channels': layer.color_channels,
                           'uvSource': layer.uv_source, 'multiply': layer.color_multiply.default,
                           'brightness': layer.color_brightness.default,
                           'multiplyId': layer.color_multiply.header.id,
                           'brightnessId': layer.color_brightness.header.id,
                           'flags': layer.flags,
                           'constantColor': [getattr(layer.color_value.default, channel) / 255 for channel in ('r', 'g', 'b', 'a')],
                           'flipbook': {'rows': layer.uv_flipbook_rows, 'columns': layer.uv_flipbook_cols,
                                        'frame': layer.uv_flipbook_frame.default, 'frameId': layer.uv_flipbook_frame.header.id},
                           'uvAnimation': {key: {'id': getattr(layer, key).header.id,
                                                'default': [getattr(getattr(layer, key).default, axis) for axis in ('x', 'y', 'z') if hasattr(getattr(layer, key).default, axis)]}
                                           for key in ('uv_offset', 'uv_angle', 'uv_tiling')}}
        materials.append({'name': text(material.name), 'layers': layers,
                          'blend': material.blend_mode, 'hdrEmission': material.hdr_emis,
                          'specularity': material.specularity, 'flags': material.flags})
    desc = parser.M3StructureDescription.get_vertex_description(model.vertex_flags)
    raw = bytes(sections[model.vertices].content)
    vertices = desc.instances(raw, len(raw) // desc.size)
    division = sections[model.divisions][0]
    faces = list(sections[division.faces])
    lookup = list(sections[model.bone_lookup])
    refs = list(sections[model.material_references])
    batches = list(sections[division.batches])
    regions = []
    unsupported = []

    def resolve_material(reference_index, seen=()):
        if reference_index in seen:
            raise ValueError('Cyclic native composite material graph')
        reference = refs[reference_index]
        if reference.type == 1:
            return [{'material': reference.material_index, 'reference': reference_index, 'alpha': 1.0, 'alphaId': None}]
        if reference.type != 3:
            raise ValueError(f'Unsupported material type {reference.type} at reference {reference_index}')
        composite = sections[model.materials_composite][reference.material_index]
        resolved = []
        for part in sections[composite.sections]:
            for entry in resolve_material(part.material_reference_index, seen + (reference_index,)):
                entry = dict(entry)
                entry['compositePath'] = [reference_index] + entry.get('compositePath', [])
                entry['alphaFactors'] = [{'default': part.alpha_factor.default, 'id': part.alpha_factor.header.id}] + entry.get('alphaFactors', [])
                resolved.append(entry)
        return resolved
    for ri, region in enumerate(sections[division.regions]):
        rv = vertices[region.first_vertex_index:region.first_vertex_index + region.vertex_count]
        rf = faces[region.first_face_index:region.first_face_index + region.face_count]
        assert max(rf) < len(rv), 'Expected native region-relative indices'
        rl = lookup[region.first_bone_lookup_index:region.first_bone_lookup_index + region.bone_lookup_count]
        region_batches = [batch for batch in batches if batch.region_index == ri]
        if not region_batches:
            continue
        bindings = [{'reference': batch.material_reference_index,
                     'bone': batch.bone, 'priorityPlane': batch.priority_plane,
                     'layers': resolve_material(batch.material_reference_index)} for batch in region_batches]
        if not bindings[0]['layers']:
            raise ValueError('Empty native material graph')
        primary_material = bindings[0]['layers'][0]['material']
        uv_multiply = getattr(region, 'uv_multiply', 16)
        uv_offset = getattr(region, 'uv_offset', 0)
        skin = []
        normals = []
        for vertex in rv:
            influences = []
            for index in range(4):
                weight = getattr(vertex, 'weight' + str(index), 0)
                if weight:
                    local_bone = getattr(vertex, 'lookup' + str(index))
                    assert local_bone < len(rl), 'Skin lookup outside region palette'
                    influences.append([rl[local_bone], weight])
            if not influences:
                assert not hasattr(vertex, 'weight0'), 'Unweighted skinned vertex'
                influences = [[region.root_bone, 255]]
            assert sum(weight for _, weight in influences) == 255, 'Unexpected native weight sum'
            skin.append(influences)
            normal = vec(vertex.normalf) if hasattr(vertex, 'normalf') else [component / 127.5 - 1 for component in vec(vertex.normal)]
            length = math.sqrt(sum(value * value for value in normal))
            assert length > 0, 'Invalid native normal'
            normals.append([value / length for value in normal])
        uvs = {}
        for channel in ('uv0', 'uv1', 'uv2', 'uv3', 'uv4'):
            if hasattr(rv[0], channel):
                uvs[channel] = [[getattr(vertex, channel).x * uv_multiply / 32768 + uv_offset,
                                 1 - getattr(vertex, channel).y * uv_multiply / 32768 - uv_offset] for vertex in rv]
        regions.append({'name': f'native_region_{ri}', 'sourceRegion': ri,
                        'material': primary_material, 'materialBindings': bindings,
                        'vertices': [vec(vertex.pos) for vertex in rv],
                        'normals': normals, 'uvs': uvs, 'skin': skin,
                        'triangles': [rf[i:i + 3] for i in range(0, len(rf), 3)]})
    bones = []
    for bone, rest in zip(sections[model.bones], sections[model.bone_rests]):
        bones.append({'name': text(bone.name), 'parent': bone.parent,
                      'location': vec(bone.location.default), 'rotation': quat(bone.rotation.default),
                      'scale': vec(bone.scale.default), 'inverseBind': matrix(rest.matrix),
                      'ids': {key: getattr(bone, key).header.id for key in ('location', 'rotation', 'scale')}})
    sequences = list(sections[model.sequences])
    sequence_index = next(i for i, seq in enumerate(sequences) if text(seq.name) == sequence_name)
    seq = sequences[sequence_index]
    group = sections[model.sequence_transformation_groups][sequence_index]
    tracks = {}
    native_tracks = {}
    track_types = ('sdev', 'sd2v', 'sd3v', 'sd4q', 'sdcc', 'sdr3', 'sdu8', 'sds6', 'sdu6', 'sds3', 'sdu3', 'sdfg', 'sdmb')

    def raw_value(value):
        if isinstance(value, (int, float, str)):
            return value if not isinstance(value, float) or math.isfinite(value) else None
        if hasattr(value, '__dict__'):
            return {key: raw_value(item) for key, item in vars(value).items() if key != 'desc'}
        return str(value)
    for ci in sections[group.stc_indices]:
        collection = sections[model.sequence_transformation_collections][ci]
        for anim_id, ref in zip(sections[collection.anim_ids], sections[collection.anim_refs]):
            kind, index = ref >> 16, ref & 65535
            block = sections[getattr(collection, track_types[kind])][index]
            native_tracks[str(anim_id)] = {'type': track_types[kind],
                                          'frames': list(sections[block.frames]),
                                          'keys': [raw_value(value) for value in sections[block.keys]]}
            if kind not in (2, 3):
                continue
            tracks[str(anim_id)] = {'kind': 'vector' if kind == 2 else 'quaternion',
                                   'frames': list(sections[block.frames]),
                                   'values': [(vec(v) if kind == 2 else quat(v)) for v in sections[block.keys]]}
    used_materials = {entry['material'] for region in regions for binding in region['materialBindings'] for entry in binding['layers']}
    requests = sorted({layer['file'] for mi in used_materials for layer in materials[mi]['layers'].values() if layer['file']})
    for mi in sorted(used_materials):
        for key, layer in materials[mi]['layers'].items():
            if layer['file'] and layer['uvSource'] > 4:
                unsupported.append({'case': 'non-mesh UV source requires renderer adaptation', 'material': mi, 'layer': key, 'uvSource': layer['uvSource']})
    composites = [{'reference': i, 'name': text(sections[model.materials_composite][ref.material_index].name),
                   'layers': resolve_material(i)} for i, ref in enumerate(refs) if ref.type == 3]
    bounds = {'min': [min(vertex[axis] for region in regions for vertex in region['vertices']) for axis in range(3)],
              'max': [max(vertex[axis] for region in regions for vertex in region['vertices']) for axis in range(3)]}
    result = {'schema': 1, 'device': device, 'model': model_name,
              'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'sequence': {'name': sequence_name, 'start': seq.anim_ms_start, 'end': seq.anim_ms_end},
              'provenance': {'geometry': 'Unchanged Blizzard campaign architecture mesh, all native skin weights, corner normals, UVs and standard/composite material bindings',
                             'animation': 'Native selected sequence tracks only; no authored deformation or rotation',
                             'presentation': 'Export only; Blender material/composite/UV-source adaptation must be documented by renderer'},
              'materials': materials, 'regions': regions, 'bones': bones, 'tracks': tracks,
              'nativeTracks': native_tracks,
              'textureRequests': requests, 'compositeMaterials': composites,
              'unsupportedCases': unsupported, 'bounds': bounds}
    return result


def combine_native_parts(device, model_name, parts, sequence, geometry_note, animation_note, settings=None):
    """Merge native source data; authored staging stays separate from vertices."""
    settings = settings or {}
    result = {'schema': 2, 'device': device, 'model': model_name,
              'sequence': dict(sequence), 'materials': [], 'regions': [], 'bones': [],
              'tracks': {}, 'nativeTracks': {}, 'sourceParts': [], 'unsupportedCases': [],
              'compositeMaterials': [], 'provenance': {
                  'geometry': geometry_note,
                  'animation': animation_note,
                  'presentation': 'Export only; standard/composite material adaptation is renderer responsibility'}}
    textures = set()
    for part_index, source in enumerate(parts):
        part = copy.deepcopy(source)
        bone_offset, material_offset = len(result['bones']), len(result['materials'])
        id_offset = (part_index + 1) * 0x100000000
        remap_id = lambda value: value + id_offset if value is not None else None
        setting = settings.get(source['device'], {})
        staging = setting.get('staging', {'uniformScale': 1.0, 'translation': [0.0, 0.0, 0.0], 'authored': False})
        scale, translation = staging['uniformScale'], staging['translation']
        stage_matrix = [[scale if row == column else 0.0 for column in range(4)] for row in range(4)]
        for axis in range(3):
            stage_matrix[axis][3] = translation[axis]
        stage_matrix[3][3] = 1.0
        staging['matrix'] = stage_matrix
        timing = setting.get('timing')
        result['sourceParts'].append({'model': source['model'], 'sourceSHA256': source['sourceSHA256'],
                                      'device': source['device'], 'sequence': source['sequence'], 'staging': staging, 'timing': timing})
        for material in part['materials']:
            material['name'] = source['device'] + ':' + material['name']
            for layer in material['layers'].values():
                for key in ('multiplyId', 'brightnessId'):
                    layer[key] = remap_id(layer[key])
                if layer.get('flipbook'):
                    layer['flipbook']['frameId'] = remap_id(layer['flipbook']['frameId'])
                for anim in layer.get('uvAnimation', {}).values():
                    anim['id'] = remap_id(anim['id'])
        for bone in part['bones']:
            bone['name'] = source['device'] + ':' + bone['name']
            bone['partTransform'] = stage_matrix
            if bone['parent'] >= 0:
                bone['parent'] += bone_offset
            bone['ids'] = {key: remap_id(value) for key, value in bone['ids'].items()}
        for region in part['regions']:
            region['name'] = source['device'] + '_' + region['name']
            region['material'] += material_offset
            region['sourceDevice'] = source['device']
            region['partStaging'] = staging
            for influences in region['skin']:
                for influence in influences:
                    influence[0] += bone_offset
            for binding in region['materialBindings']:
                if binding['bone'] >= 0:
                    binding['bone'] += bone_offset
                for entry in binding['layers']:
                    entry['material'] += material_offset
                    entry['alphaId'] = remap_id(entry.get('alphaId'))
                    for factor in entry.get('alphaFactors', []):
                        factor['id'] = remap_id(factor['id'])
        for key, track in part['tracks'].items():
            track['sourceSequence'] = source['sequence']
            if timing is not None:
                track['sourceTiming'] = timing
            result['tracks'][str(remap_id(int(key)))] = track
        for key, track in part['nativeTracks'].items():
            track['sourceSequence'] = source['sequence']
            if timing is not None:
                track['sourceTiming'] = timing
            result['nativeTracks'][str(remap_id(int(key)))] = track
        result['materials'].extend(part['materials'])
        result['bones'].extend(part['bones'])
        result['regions'].extend(part['regions'])
        for case in part['unsupportedCases']:
            case['sourceDevice'] = source['device']
            if 'material' in case:
                case['material'] += material_offset
            result['unsupportedCases'].append(case)
        textures.update(part['textureRequests'])
    result['textureRequests'] = sorted(textures)
    result['sourceSHA256'] = hashlib.sha256(json.dumps(result['sourceParts'], sort_keys=True).encode()).hexdigest()
    staged = [
        [vertex[axis] * region['partStaging']['uniformScale'] + region['partStaging']['translation'][axis] for axis in range(3)]
        for region in result['regions'] for vertex in region['vertices']]
    result['bounds'] = {'min': [min(vertex[axis] for vertex in staged) for axis in range(3)],
                        'max': [max(vertex[axis] for vertex in staged) for axis in range(3)]}
    result['compoundTiming'] = {'outputDuration': sequence['end'] - sequence['start'],
                                 'parts': [{'device': part['device'], 'nativeSequence': part['sequence'], 'timing': part['timing']} for part in result['sourceParts']]}
    return result


def combine_hyperion_station(table, holomap):
    result = combine_native_parts('hyperion-station', 'Hyperion native table and holomap', (table, holomap), holomap['sequence'],
        'Unchanged native Hyperion Starmap table and BridgeHolomap in original campaign world coordinates; no authored offsets or supports',
        'Static native table plus original holomap GLstand ring/MapTwist tracks and native LCD flipbook')
    result['alignmentEvidence'] = {'tableTopZ': table['bounds']['max'][2], 'holomapBaseZ': holomap['bounds']['min'][2],
                                   'nativeVerticalGap': holomap['bounds']['min'][2] - table['bounds']['max'][2], 'authoredOffsets': False}
    return result


def part_timing(source, cycles, output_duration):
    native_duration = source['sequence']['end'] - source['sequence']['start']
    effective_cycle = output_duration / cycles if cycles else None
    return {'mode': 'native cycles' if cycles else 'static native pose', 'nativeDuration': native_duration,
            'cycles': cycles, 'outputDuration': output_duration, 'effectiveCycleDuration': effective_cycle,
            'nativeToEffectiveRate': native_duration / effective_cycle if effective_cycle else 0,
            'durationChangePercent': (effective_cycle / native_duration - 1) * 100 if effective_cycle else 0,
            'authoredRetiming': bool(cycles and abs(effective_cycle - native_duration) > .001)}


def combine_adun_core(architecture, lock):
    duration = lock['sequence']['end'] - lock['sequence']['start']
    return combine_native_parts('adun-core', 'Campaign Adun physical core and optical lock', (architecture, lock),
        {'name': 'CoreLock Stand with static native core architecture', 'start': 0, 'end': duration},
        'Actual campaign physical SMX2_ShipRoom_04 plus holographic CoreLock in unchanged native world coordinates; offline reconstruction, not engine capture',
        'Physical architecture native static pose; original CoreLock material pulses, no authored motion',
        {architecture['device']: {'timing': part_timing(architecture, 0, duration)},
         lock['device']: {'timing': part_timing(lock, 1, duration)}})


def native_pose_bounds(data, phase):
    """Lightweight stdlib native skin evaluation for authored contact metadata."""
    def multiply(a, b):
        return [[sum(a[row][k] * b[k][column] for k in range(4)) for column in range(4)] for row in range(4)]

    def sample(bone, prop):
        track = data['tracks'].get(str(bone['ids'][prop]))
        if not track:
            return bone[prop]
        time = data['sequence']['start'] + phase * (data['sequence']['end'] - data['sequence']['start'])
        sequence, timing = track.get('sourceSequence'), track.get('sourceTiming')
        if sequence:
            if timing is not None:
                time = sequence['start'] + ((phase * timing['cycles']) % 1) * (sequence['end'] - sequence['start'])
            else:
                time = sequence['start'] + (time - data['sequence']['start']) % (sequence['end'] - sequence['start'])
        times, values = track['frames'], track['values']
        i = max(0, bisect.bisect_right(times, time) - 1)
        j = min(i + 1, len(times) - 1)
        u = 0 if times[i] == times[j] else (time - times[i]) / (times[j] - times[i])
        a, b = values[i], values[j]
        if prop != 'rotation':
            return [x + (y - x) * u for x, y in zip(a, b)]
        dot = sum(x * y for x, y in zip(a, b))
        if dot < 0:
            b, dot = [-x for x in b], -dot
        if dot < .9995:
            angle = math.acos(min(1, dot))
            value = [(math.sin((1-u)*angle)*x + math.sin(u*angle)*y) / math.sin(angle) for x, y in zip(a, b)]
        else:
            value = [x + (y-x)*u for x, y in zip(a, b)]
        length = math.sqrt(sum(x*x for x in value))
        return [x / length for x in value]

    globals_ = []
    for bone in data['bones']:
        w, x, y, z = sample(bone, 'rotation')
        scale, loc = sample(bone, 'scale'), sample(bone, 'location')
        matrix = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), loc[0]],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), loc[1]],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), loc[2]], [0, 0, 0, 1]]
        for row in range(3):
            for column in range(3):
                matrix[row][column] *= scale[column]
        globals_.append(multiply(globals_[bone['parent']], matrix) if bone['parent'] >= 0 else matrix)
    identity = [[float(row == column) for column in range(4)] for row in range(4)]
    palette = [multiply(multiply(bone.get('partTransform', identity), global_), bone['inverseBind']) for bone, global_ in zip(data['bones'], globals_)]
    points = {}
    for region in data['regions']:
        target = points.setdefault(region.get('sourceDevice', data['device']), [])
        for vertex, influences in zip(region['vertices'], region['skin']):
            target.append([sum((sum(palette[bone][axis][k] * vertex[k] for k in range(3)) + palette[bone][axis][3]) * weight / 255 for bone, weight in influences) for axis in range(3)])
    return {name: {'min': [min(point[axis] for point in vertices) for axis in range(3)],
                   'max': [max(point[axis] for point in vertices) for axis in range(3)]} for name, vertices in points.items()}


def combine_leviathan_nest(tentacle, egg):
    duration, scale = 13800, 2.7
    egg_center = [(low + high) / 2 for low, high in zip(egg['bounds']['min'], egg['bounds']['max'])]
    floor_center = [(low + high) / 2 for low, high in zip(tentacle['bounds']['min'], tentacle['bounds']['max'])]
    translation = [floor_center[0] - scale * egg_center[0], floor_center[1] - scale * egg_center[1],
                   .02 - scale * egg['bounds']['min'][2]]
    result = combine_native_parts('leviathan-nest', 'Campaign Zerg egg and Leviathan floor tentacle', (tentacle, egg),
        {'name': 'Six egg Stand cycles and one floor tentacle Stand cycle', 'start': 0, 'end': duration},
        'Actual native campaign egg and floor tentacle; original vertices/weights/normals/UVs retained; authored whole-egg uniform staging only, not engine capture',
        'Six original 2300ms egg Stand cycles and one original 13333ms tentacle Stand cycle extended to 13800ms; no invented motion',
        {tentacle['device']: {'timing': part_timing(tentacle, 1, duration)},
         egg['device']: {'timing': part_timing(egg, 6, duration),
                         'staging': {'uniformScale': scale, 'translation': translation, 'authored': True,
                                     'purpose': 'Center original egg over floor-tentacle bounds and settle its native base at z=0.02'}}})
    posed = [native_pose_bounds(result, sample / 120) for sample in range(120)]
    floor_min = min(sample[tentacle['device']]['min'][2] for sample in posed)
    ground = floor_min - .002
    egg_highest_bottom = max(sample[egg['device']]['min'][2] for sample in posed)
    delta_z = ground - egg_highest_bottom
    translation[2] += delta_z
    egg_part = next(part for part in result['sourceParts'] if part['device'] == egg['device'])
    egg_part['staging']['purpose'] = 'Center egg over native floor-tentacle bounds and settle sampled posed world base onto the creep ground'
    egg_part['staging']['translation'][2] = translation[2]
    egg_part['staging']['matrix'][2][3] = translation[2]
    for bone in result['bones']:
        if bone['name'].startswith(egg['device'] + ':'):
            bone['partTransform'][2][3] = translation[2]
    for region in result['regions']:
        if region['sourceDevice'] == egg['device']:
            region['partStaging']['translation'][2] = translation[2]
            region['partStaging']['matrix'][2][3] = translation[2]
    quarter = native_pose_bounds(result, .25)
    result['stagingEvidence'] = {'eggNativeBounds': egg['bounds'], 'tentacleNativeBounds': tentacle['bounds'],
                                  'eggUniformScale': scale, 'eggTranslation': translation,
                                  'nativeMeshDeformationAuthored': False,
                                  'contact': {'method': 'Native weighted world poses at 120 phases; highest sampled egg bottom settled to ground, avoiding an air gap',
                                              'groundZ': ground, 'floorSampledMinZ': floor_min,
                                              'oldEggMinZAtPhase025': posed[30][egg['device']]['min'][2],
                                              'eggMinZAtPhase025': quarter[egg['device']]['min'][2],
                                              'eggSampledMinZRange': [min(sample[egg['device']]['min'][2] for sample in posed) + delta_z, egg_highest_bottom + delta_z],
                                              'uniformTranslationCorrectionZ': delta_z, 'samplePhases': 120}}
    result['bounds']['min'][2] = min(result['bounds']['min'][2], ground)
    result['bounds']['max'][2] += delta_z
    result['sourceSHA256'] = hashlib.sha256(json.dumps(result['sourceParts'], sort_keys=True).encode()).hexdigest()
    return result


def inspect_model(source, parser):
    """Bounded metadata path: count raw vertices; do not instantiate large sets."""
    sections = parser.M3SectionList.load(str(source))
    model = sections.model
    text = lambda ref: sections[ref].content_to_string() if ref.index else ''
    vec = lambda value: [value.x, value.y, value.z]
    description = parser.M3StructureDescription.get_vertex_description(model.vertex_flags)
    division = sections[model.divisions][0]
    references = list(sections[model.material_references])
    used, unsupported = set(), set()

    def walk_reference(index, seen=()):
        if index in seen:
            raise ValueError('Cyclic material graph')
        ref = references[index]
        if ref.type == 1:
            used.add(ref.material_index)
        elif ref.type == 3:
            composite = sections[model.materials_composite][ref.material_index]
            for part in sections[composite.sections]:
                walk_reference(part.material_reference_index, seen + (index,))
        else:
            unsupported.add(ref.type)

    batches = list(sections[division.batches])
    for batch in batches:
        walk_reference(batch.material_reference_index)
    materials = list(sections[model.materials_standard])
    textures = sorted({text(layer.color_bitmap) for index in used for key in LAYERS
                       for layer in sections[getattr(materials[index], key)] if text(layer.color_bitmap)})
    bones = list(sections[model.bones])
    sequences = []
    for index, seq in enumerate(sections[model.sequences]):
        group = sections[model.sequence_transformation_groups][index]
        varying, native_count = [], 0
        for collection_index in sections[group.stc_indices]:
            collection = sections[model.sequence_transformation_collections][collection_index]
            native_count += len(sections[collection.anim_ids])
            for anim_id, reference in zip(sections[collection.anim_ids], sections[collection.anim_refs]):
                kind = reference >> 16
                if kind not in (2, 3):
                    continue
                block = sections[getattr(collection, 'sd3v' if kind == 2 else 'sd4q')][reference & 65535]
                values = [tuple(getattr(value, axis) for axis in 'xyzw' if hasattr(value, axis)) for value in sections[block.keys]]
                if len(set(values)) > 1:
                    owners = [{'bone': text(bone.name), 'property': prop} for bone in bones for prop in ('location', 'rotation', 'scale') if getattr(bone, prop).header.id == anim_id]
                    varying.append({'id': anim_id, 'keys': len(values), 'owners': owners})
        sequences.append({'name': text(seq.name), 'start': seq.anim_ms_start, 'end': seq.anim_ms_end,
                          'nativeTracks': native_count, 'varyingBoneTracks': varying})
    return {'file': source.name, 'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'vertices': len(sections[model.vertices].content) // description.size,
            'triangles': sum(region.face_count // 3 for region in sections[division.regions]),
            'regions': len(sections[division.regions]), 'bones': len(bones),
            'standardMaterials': len(materials), 'usedStandardMaterials': len(used),
            'materialTypes': sorted({references[batch.material_reference_index].type for batch in batches}),
            'unsupportedMaterialTypes': sorted(unsupported),
            'textureCount': len(textures), 'textures': textures,
            'textureCompleteness': 'all supported standard/composite material leaves' if not unsupported else 'partial: unsupported native material types present',
            'nativeBounds': {'min': vec(model.boundings.min), 'max': vec(model.boundings.max), 'radius': model.boundings.radius},
            'sequences': sequences}


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument('--device', choices=tuple(DEVICES) + ('hyperion-station', 'adun-core', 'leviathan-nest', 'all'), default='all')
    arg.add_argument('--check', action='store_true')
    arg.add_argument('--inspect', action='store_true', help='Inspect M3 metadata without instantiating large vertex arrays')
    arg.add_argument('--inspect-model', action='append', help='Model stem to inspect; repeat to bound scope')
    args = arg.parse_args()
    parser = load_parser()
    manifest = {}
    if args.inspect or args.inspect_model:
        sources = [NATIVE / (name + '.m3') for name in args.inspect_model] if args.inspect_model else sorted(NATIVE.glob('*.m3'))
        inspection = []
        for source in sources:
            try:
                meta = inspect_model(source, parser)
            except Exception as error:
                meta = {'file': source.name, 'error': str(error)}
            inspection.append(meta)
            print(json.dumps({key: value for key, value in meta.items() if key not in ('textures', 'sequences')}))
        if not args.check:
            if (NATIVE / 'inspection.json').exists():
                saved = {entry['file']: entry for entry in json.loads((NATIVE / 'inspection.json').read_text(encoding='utf-8-sig'))}
                for entry in inspection:
                    previous_entry = saved.get(entry['file'], {})
                    if entry.get('sourceSHA256') == previous_entry.get('sourceSHA256'):
                        for field in ('selection', 'exportedGeometryBounds', 'compoundDevices', 'workLoopEvidence', 'glassAdaptationEvidence', 'nestContactEvidence'):
                            if field in previous_entry:
                                entry[field] = previous_entry[field]
            if args.inspect_model and (NATIVE / 'inspection.json').exists():
                previous = json.loads((NATIVE / 'inspection.json').read_text(encoding='utf-8-sig'))
                names = {entry['file'] for entry in inspection}
                inspection = [entry for entry in previous if entry['file'] not in names] + inspection
            (NATIVE / 'inspection.json').write_text(json.dumps(inspection, indent=2), encoding='utf-8')
        return
    selections = list(DEVICES) + ['hyperion-station', 'adun-core', 'leviathan-nest'] if args.device == 'all' else [args.device]
    cache = {}
    for device in selections:
        if device in ('adun-core', 'leviathan-nest'):
            components = ('protoss-core-architecture', 'protoss-corelock') if device == 'adun-core' else ('leviathan-tentacle', 'leviathan-egg')
            for component in components:
                if component not in cache:
                    cache[component] = export_device(component, parser)
            data = combine_adun_core(*(cache[c] for c in components)) if device == 'adun-core' else combine_leviathan_nest(*(cache[c] for c in components))
        elif device == 'hyperion-station':
            for component in ('hyperion-table', 'hyperion-holomap'):
                if component not in cache:
                    cache[component] = export_device(component, parser)
            data = combine_hyperion_station(cache['hyperion-table'], cache['hyperion-holomap'])
        else:
            data = cache.setdefault(device, export_device(device, parser))
        for name in data['textureRequests']:
            manifest.setdefault(name, []).append(device)
        if not args.check:
            (NATIVE / (device + '-data.json')).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
        print(json.dumps({'device': device, 'sequence': data['sequence'],
                          'vertices': sum(len(r['vertices']) for r in data['regions']),
                          'triangles': sum(len(r['triangles']) for r in data['regions']),
                          'boneTracks': len(data['tracks']), 'nativeTracks': len(data['nativeTracks']), 'bounds': data['bounds'], 'unsupportedCases': data['unsupportedCases'], 'textureRequests': data['textureRequests']}))

    if not args.check:
        if args.device != 'all':
            for existing in NATIVE.glob('*-data.json'):
                saved = json.loads(existing.read_text(encoding='utf-8-sig'))
                for name in saved.get('textureRequests', []):
                    devices = manifest.setdefault(name, [])
                    if saved['device'] not in devices:
                        devices.append(saved['device'])
        (NATIVE / 'texture-requests.json').write_text(json.dumps([{'source': name, 'png': 'textures/' + Path(name).stem.lower() + '.png', 'devices': devices} for name, devices in sorted(manifest.items())], indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()

