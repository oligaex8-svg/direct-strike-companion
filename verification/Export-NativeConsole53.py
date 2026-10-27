"""Export intact SC2 console sculptures with their original Stand 01 skin tracks.

Uses the proven campaign M3 reader without changing its source. No mesh parts,
poses, UVs, materials or animation keys are generated or restaged.
"""
import argparse
import importlib.util
import json
from pathlib import Path, PureWindowsPath

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'assets/themes/native53'
DEVICES = {
    'abathur-console': ('Abathur_ConsoleZerg_00', 'Stand 01'),
    'dehaka-console': ('Dehaka_ConsoleZerg_00', 'Stand 01'),
}


def load_exporter():
    spec = importlib.util.spec_from_file_location('native53_export_base', ROOT / 'verification/Export-Campaign48.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.NATIVE, module.DEVICES = NATIVE, DEVICES
    return module


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--device', choices=(*DEVICES, 'all'), default='all')
    cli.add_argument('--check', action='store_true', help='Validate and report without writing any files')
    args = cli.parse_args()
    exporter = load_exporter()
    parser = exporter.load_parser()
    plan = {'schema': 1, 'devices': [], 'presentation': 'Complete source model; no added geometry, native coordinates, fixed orthographic framing over sampled native poses'}
    textures = {}
    for device in DEVICES if args.device == 'all' else (args.device,):
        data = exporter.export_device(device, parser)
        if data['unsupportedCases']:
            raise ValueError(f"{device}: unsupported native cases: {data['unsupportedCases']}")
        data['provenance']['geometry'] = 'Intact Blizzard SC2 console sculpture; unchanged source regions, UVs, normals, weights and standard material bindings'
        changing = []
        for bone in data['bones']:
            props = [prop for prop, ident in bone['ids'].items() if len({tuple(v) for v in data['tracks'].get(str(ident), {}).get('values', [])}) > 1]
            if props:
                changing.append({'bone': bone['name'], 'properties': props})
        if not changing:
            raise ValueError(f'{device}: selected sequence has no varying native bone tracks')
        missing = []
        for name in data['textureRequests']:
            png = 'textures/' + PureWindowsPath(name).stem.lower() + '.png'
            textures.setdefault(name, {'source': name, 'png': png, 'devices': []})['devices'].append(device)
            if not (NATIVE / png).is_file():
                missing.append(name)
        summary = {'device': device, 'model': data['model'], 'sourceSHA256': data['sourceSHA256'], 'sequence': data['sequence'], 'bounds': data['bounds'], 'vertices': sum(len(r['vertices']) for r in data['regions']), 'triangles': sum(len(r['triangles']) for r in data['regions']), 'varyingBones': changing, 'missingTextures': missing, 'unsupportedCases': data['unsupportedCases']}
        plan['devices'].append(summary)
        print(json.dumps(summary))
        if not args.check:
            (NATIVE / (device + '-data.json')).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    if not args.check:
        # Preserve other per-device exports when running a bounded single selection.
        for path in NATIVE.glob('*-data.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            for name in data['textureRequests']:
                entry = textures.setdefault(name, {'source': name, 'png': 'textures/' + PureWindowsPath(name).stem.lower() + '.png', 'devices': []})
                if data['device'] not in entry['devices']:
                    entry['devices'].append(data['device'])
        (NATIVE / 'texture-requests.json').write_text(json.dumps(list(textures.values()), indent=2), encoding='utf-8')
        (NATIVE / 'export-plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()

