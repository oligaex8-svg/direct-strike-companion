"""Export selected original SC2 native models and full native animation tracks.

Only type-2 screen-space displacement passes are excluded: transparent RGBA
sprites have no surrounding scene to refract. Every exclusion is enumerated.
"""
import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/native54'
DEVICES = {
 'nerazim': ('Dark_Templar_Pylon', 'Stand'),
 'alarak': ('Pylon_Taldarim', 'Stand'),
 'ihanrii': ('Pylon_Ihanrii', 'Stand'),
 'nova': ('SensorTower_CovertOps', 'Stand'),
 'mira': ('TechLab_HornerHan_Coop', 'Stand Attached Work'),
 'machined': ('Factory', 'Stand Work'),
 'tyrador': ('SensorTower_Silver', 'Stand'),
 'abathur': ('EvolutionChamber', 'Stand Work'),
 'dehaka': ('Dehaka_Primal_Barracks_Coop', 'Stand'),
 'cerberus': ('EvolutionChamber_RCZ', 'Stand Work'),
 'mecha': ('EvolutionChamber_Mecha', 'Stand Work'),
 'arcade': ('SM_MarSaraBarJukebox', 'Work'),
 'classic-terran': ('CommandCenter_Remastered', 'Stand Work'),
 'classic-protoss': ('Nexus_Remastered', 'Stand Work'),
 'classic-zerg': ('Hatchery_Remastered', 'Stand Work'),
}


def load_exporter():
    base = ROOT / 'verification/Export-Campaign48.py'
    source = base.read_text(encoding='utf-8')
    def patch(old, new):
        nonlocal source
        assert source.count(old) == 1, 'Frozen exporter contract changed: ' + old[:70]
        source = source.replace(old, new)
    patch('    unsupported = []\n', '''    unsupported = []
    skipped_displacement = []

    def displacement_leaves(index, seen=()):
        if index in seen:
            raise ValueError('Cyclic native composite material graph')
        ref = refs[index]
        if ref.type == 2:
            material = sections[model.materials_displacement][ref.material_index]
            return [{'reference': index, 'materialIndex': ref.material_index, 'name': text(material.name)}]
        if ref.type == 1:
            return []
        if ref.type != 3:
            raise ValueError(f'Unsupported material type {ref.type} at reference {index}')
        composite = sections[model.materials_composite][ref.material_index]
        return [leaf for part in sections[composite.sections]
                for leaf in displacement_leaves(part.material_reference_index, seen + (index,))]
''')
    patch('        if reference.type != 3:\n', '''        if reference.type == 2:
            return []  # Explicitly recorded per source batch below.
        if reference.type != 3:
''')
    patch("        if not bindings[0]['layers']:\n            raise ValueError('Empty native material graph')", '''        retained = [binding for binding in bindings if binding['layers']]
        for batch_index, (batch, binding) in enumerate(zip(region_batches, bindings)):
            leaves = displacement_leaves(batch.material_reference_index)
            if leaves:
                skipped_displacement.append({'sourceRegion': ri,
                    'sourceBatch': next(i for i, value in enumerate(batches) if value is batch),
                    'materialReference': batch.material_reference_index,
                    'materials': leaves, 'triangles': len(rf) // 3,
                    'vertices': len(rv), 'entireBatchOmitted': not bool(binding['layers']),
                    'entireRegionOmitted': not bool(retained)})
            elif not binding['layers']:
                raise ValueError('Empty native material graph unrelated to displacement')
        bindings = retained
        if not bindings:
            continue''')
    patch("              'unsupportedCases': unsupported, 'bounds': bounds}", """              'unsupportedCases': unsupported, 'bounds': bounds,
              'excludedScreenSpaceDisplacement': {
                  'rationale': 'Native type-2 screen-space environmental refraction cannot sample a surrounding game scene in an isolated transparent RGBA sprite; only these optical passes are omitted',
                  'batches': skipped_displacement,
                  'batchCount': len(skipped_displacement),
                  'materialNames': sorted({leaf['name'] for item in skipped_displacement for leaf in item['materials']}),
                  'omittedRegionCount': len({item['sourceRegion'] for item in skipped_displacement if item['entireRegionOmitted']}),
                  'omittedRegionTriangles': sum(next(item['triangles'] for item in skipped_displacement if item['sourceRegion'] == index) for index in {item['sourceRegion'] for item in skipped_displacement if item['entireRegionOmitted']}),
                  'excludedOpticalPassTriangles': sum(item['triangles'] * len(item['materials']) for item in skipped_displacement)}}""")
    namespace = {'__name__': 'character54_export_base', '__file__': str(base)}
    exec(compile(source, str(base), 'exec'), namespace)
    namespace['NATIVE'], namespace['DEVICES'] = NATIVE, DEVICES
    return namespace


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--device', choices=(*DEVICES, 'all'), default='all')
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    exporter = load_exporter()
    parser = exporter['load_parser']()
    textures, failed = {}, []
    for device in DEVICES if args.device == 'all' else (args.device,):
        try:
            data = exporter['export_device'](device, parser)
            data['provenance']['geometry'] = 'Original selected Blizzard SC2 model with all opaque/emissive standard/composite batches, original UVs, corner normals and skin weights; type-2 environmental-refraction exclusions enumerated separately'
            data['provenance']['animation'] = 'Full original selected sequence at native duration; no retiming, authored transforms or fabricated motion'
            data['provenance']['excludedScreenSpaceDisplacement'] = data['excludedScreenSpaceDisplacement']
            data['exportAdapterSHA256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            varying = sum(len({tuple(value) for value in track['values']}) > 1 for track in data['tracks'].values())
            missing = [name for name in data['textureRequests'] if not (NATIVE / 'textures' / (PureWindowsPath(name).stem.lower() + '.png')).exists()]
            print(json.dumps({'device': device, 'model': data['model'], 'sequence': data['sequence'], 'boneTracks': len(data['tracks']), 'varyingBoneTracks': varying, 'nativeTracks': len(data['nativeTracks']), 'vertices': sum(len(r['vertices']) for r in data['regions']), 'triangles': sum(len(r['triangles']) for r in data['regions']), 'excludedDisplacement': data['excludedScreenSpaceDisplacement'], 'unsupportedCases': data['unsupportedCases'], 'missingTextures': missing}))
            if not args.check:
                (NATIVE / (device + '-data.json')).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
            for name in data['textureRequests']:
                textures.setdefault(name, set()).add(device)
        except Exception as error:
            failed.append(device)
            print(json.dumps({'device': device, 'error': str(error)}))
    if not args.check:
        for path in NATIVE.glob('*-data.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            for name in data.get('textureRequests', []):
                textures.setdefault(name, set()).add(data['device'])
        manifest = [{'source': name, 'png': 'textures/' + PureWindowsPath(name).stem.lower() + '.png', 'devices': sorted(devices)} for name, devices in sorted(textures.items())]
        (NATIVE / 'texture-requests.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if failed:
        raise SystemExit('Native export failed: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
