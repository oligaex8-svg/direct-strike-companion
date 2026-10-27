"""Export native campaign Zerg egg geometry, blended skin and Stand animation.

--check validates and reports without writing generated data. The original region topology and all native skin influences are preserved.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/native46'
DEVICES = {'egg': ('SMX1_EggRoomZerglingEgg', 'Stand')}
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
                           'brightnessId': layer.color_brightness.header.id}
        materials.append({'name': text(material.name), 'layers': layers,
                          'blend': material.blend_mode, 'hdrEmission': material.hdr_emis,
                          'specularity': material.specularity})
    desc = parser.M3StructureDescription.get_vertex_description(model.vertex_flags)
    raw = bytes(sections[model.vertices].content)
    vertices = desc.instances(raw, len(raw) // desc.size)
    division = sections[model.divisions][0]
    faces = list(sections[division.faces])
    lookup = list(sections[model.bone_lookup])
    refs = list(sections[model.material_references])
    batches = list(sections[division.batches])
    regions = []
    for ri, region in enumerate(sections[division.regions]):
        rv = vertices[region.first_vertex_index:region.first_vertex_index + region.vertex_count]
        rf = faces[region.first_face_index:region.first_face_index + region.face_count]
        assert max(rf) < len(rv), 'Expected native region-relative indices'
        rl = lookup[region.first_bone_lookup_index:region.first_bone_lookup_index + region.bone_lookup_count]
        batch = next(b for b in batches if b.region_index == ri)
        ref = refs[batch.material_reference_index]
        assert ref.type == 1, 'Unsupported non-standard material'
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
                        'material': ref.material_index,
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
    requests = sorted({layer['file'] for mi in {r['material'] for r in regions}
                       for layer in materials[mi]['layers'].values() if layer['file']})
    result = {'schema': 1, 'device': device, 'model': model_name,
              'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'sequence': {'name': sequence_name, 'start': seq.anim_ms_start, 'end': seq.anim_ms_end},
              'provenance': {'geometry': 'Unchanged Blizzard campaign SC2 egg mesh, native four-influence skin weights, corner normals and UVs',
                             'animation': 'Native Stand bone location/quaternion/scale and emissive tracks only; no authored deformation',
                             'presentation': 'Authored fixed camera, lights, organic PBR translation and tint for native emissive alpha mask; no added geometry or particles'},
              'materials': materials, 'regions': regions, 'bones': bones, 'tracks': tracks,
              'nativeTracks': native_tracks,
              'textureRequests': requests}
    return result


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument('--device', choices=tuple(DEVICES) + ('all',), default='all')
    arg.add_argument('--check', action='store_true')
    args = arg.parse_args()
    parser = load_parser()
    for device in DEVICES if args.device == 'all' else (args.device,):
        data = export_device(device, parser)
        if not args.check:
            (NATIVE / (device + '-data.json')).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
        print(json.dumps({'device': device, 'sequence': data['sequence'],
                          'vertices': sum(len(r['vertices']) for r in data['regions']),
                          'triangles': sum(len(r['triangles']) for r in data['regions']),
                          'boneTracks': len(data['tracks']), 'nativeTracks': len(data['nativeTracks']), 'textureRequests': data['textureRequests']}))


if __name__ == '__main__':
    main()

