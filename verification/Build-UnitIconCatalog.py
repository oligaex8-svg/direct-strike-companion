"""Resolve exact unit actor/button icon references from installed SC2 catalogs.

No filename similarity guesses. Missing/ambiguous mappings remain unmapped.
Run --pack only after Extract-UnitIcons.ps1 has read the requested textures.
"""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'verification/unit-icon-work'
ORDER = ['mods/core.sc2mod', 'mods/liberty.sc2mod', 'campaigns/liberty.sc2campaign',
         'mods/libertymulti.sc2mod', 'mods/swarm.sc2mod', 'campaigns/swarm.sc2campaign',
         'mods/swarmmulti.sc2mod', 'mods/void.sc2mod', 'campaigns/void.sc2campaign',
         'mods/voidmulti.sc2mod', 'mods/novastoryassets.sc2mod', 'mods/starcoop/starcoop.sc2mod',
         'mods/starcoop/commanders/arcturusmengsk.sc2mod', 'mods/starcoop/commanders/egonstetmann.sc2mod']

def priority(path):
    return next((i for i, prefix in enumerate(ORDER) if path.lower().startswith(prefix + '/')), -1)

def load(name):
    return json.loads((WORK / name).read_text(encoding='utf-8-sig'))

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def resolve():
    actors, buttons, units = {}, {}, set()
    for source in sorted(load('catalog-sources.json'), key=lambda s: priority(s['archivePath'])):
        for node in ET.parse(WORK / source['file']).getroot():
            name = node.get('id')
            if not name:
                continue
            if node.tag == 'CUnit':
                units.add(name)
            if node.tag not in ('CActorUnit', 'CButton'):
                continue
            records = actors if node.tag == 'CActorUnit' else buttons
            record = records.setdefault(name, {})
            for attr in ('parent', 'unitName'):
                if node.get(attr) is not None:
                    record[attr] = node.get(attr)
            icon = node.find('UnitIcon' if node.tag == 'CActorUnit' else 'Icon')
            if icon is not None and icon.get('value') is not None:
                record.update(icon=icon.get('value'), catalog=source['archivePath'])

    def inherited(records, name, visited=None):
        visited = set() if visited is None else visited
        if name in visited or name not in records:
            return None
        visited.add(name)
        record = records[name]
        if record.get('icon'):
            return record
        return inherited(records, record.get('parent'), visited)

    textures = {}
    for path in (WORK / 'texture-paths.txt').read_text(encoding='utf-8-sig').splitlines():
        if priority(path) < 0:
            continue
        relative = path.lower().split('.sc2assets/', 1)[-1]
        if relative not in textures or priority(path) > priority(textures[relative]):
            textures[relative] = path
    resolved, requests = {}, {}
    def usable(record):
        if not record:
            return False
        reference = record['icon'].replace('\\', '/').lower()
        return reference in textures and not any(marker in reference for marker in ('btn-missing', 'lockedicon', 'placeholder'))

    for unit in sorted(units):
        actor = actors.get(unit)
        hit = inherited(actors, unit) if actor and actor.get('unitName', unit) == unit else None
        actor_id, method = unit, 'Actor UnitIcon'
        if not usable(hit):
            candidates = [(name, inherited(actors, name)) for name, record in actors.items() if record.get('unitName') == unit]
            candidates = [(name, value) for name, value in candidates if usable(value)]
            if len({value['icon'].lower() for _, value in candidates}) == 1:
                actor_id, hit = candidates[0]
        if not usable(hit):
            hit, method = inherited(buttons, unit), 'Exact unit-ID button Icon'
        if not usable(hit):
            continue
        reference = hit['icon'].replace('\\', '/').lower()
        archive = textures.get(reference)
        if not archive:
            continue
        filename = hashlib.sha256(archive.encode()).hexdigest()[:16]
        requests[archive] = {'archivePath': archive, 'file': filename}
        resolved[unit] = {'file': filename, 'reference': hit['icon'], 'catalog': hit['catalog'],
                          'actor': actor_id if method.startswith('Actor') else None, 'method': method, 'archivePath': archive}
    # Explicit tracker variants whose artwork is identified by a named SC2 button.
    button_aliases = json.loads((ROOT / 'assets/unit-icons/button-aliases.json').read_text(encoding='utf-8'))
    for unit, button in button_aliases.items():
        hit = inherited(buttons, button)
        if not usable(hit):
            raise ValueError(f'Button has no usable icon: {unit} -> {button}')
        archive = textures[hit['icon'].replace('\\', '/').lower()]
        filename = hashlib.sha256(archive.encode()).hexdigest()[:16]
        requests[archive] = {'archivePath': archive, 'file': filename}
        resolved[unit] = {'file': filename, 'reference': hit['icon'], 'catalog': hit['catalog'],
                          'actor': None, 'button': button, 'method': 'Curated button Icon', 'archivePath': archive}
    # Exact actor bindings from the replay's hash-verified Direct Strike dependency.
    map_icons = json.loads((ROOT / 'assets/unit-icons/map-unit-icons.json').read_text(encoding='utf-8'))
    for unit, reference in map_icons['units'].items():
        archive = textures.get(reference.replace('\\', '/').lower())
        if not archive:
            raise ValueError(f'Map actor texture unavailable: {unit} -> {reference}')
        filename = hashlib.sha256(archive.encode()).hexdigest()[:16]
        requests[archive] = {'archivePath': archive, 'file': filename}
        resolved[unit] = {'file': filename, 'reference': reference, 'catalog': map_icons['actorCatalog'],
                          'actor': unit, 'method': 'Direct Strike actor UnitIcon', 'archivePath': archive,
                          'mapArchiveSHA256': map_icons['archiveSHA256'],
                          'catalogSHA256': map_icons['actorCatalogSHA256']}
    save(WORK / 'unit-icon-map.json', resolved)
    save(WORK / 'unit-icon-requests.json', list(requests.values()))
    print(json.dumps({'mappedUnits': len(resolved), 'textures': len(requests), 'catalogUnits': len(units)}))

def pack():
    from PIL import Image
    resolved, catalog, sources = load('unit-icon-map.json'), {}, []
    output = ROOT / 'wwwroot/images/units'
    output.mkdir(parents=True, exist_ok=True)
    for item in load('unit-icon-requests.json'):
        source = WORK / 'dds' / (item['file'] + '.dds')
        if not source.exists():
            continue
        target = output / (item['file'] + '.png')
        with Image.open(source) as image:
            image.convert('RGBA').save(target)
        sources.append({**item, 'ddsSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
                        'pngSHA256': hashlib.sha256(target.read_bytes()).hexdigest()})
    available = {item['archivePath'] for item in sources}
    for name, item in resolved.items():
        if item['archivePath'] in available:
            catalog[name] = '/images/units/' + item['file'] + '.png'
    aliases = json.loads((ROOT / 'assets/unit-icons/aliases.json').read_text(encoding='utf-8'))
    for name, canonical in aliases.items():
        if canonical not in catalog:
            raise ValueError(f'Alias target has no extracted icon: {name} -> {canonical}')
        if name in catalog and catalog[name] != catalog[canonical]:
            raise ValueError(f'Alias conflicts with exact catalog mapping: {name}')
        catalog[name] = catalog[canonical]
    (ROOT / 'wwwroot/unit-icon-catalog.js').write_text("'use strict';\n// Generated from exact installed SC2 unit icon references.\nwindow.sc2UnitIcons=Object.freeze(" + json.dumps(catalog, ensure_ascii=True, separators=(',', ':')) + ');\n', encoding='utf-8')
    save(ROOT / 'assets/unit-icons/sources.json', {'source': 'Installed StarCraft II catalogs and textures; read-only extraction',
         'dependencyOrder': ORDER, 'curatedDirectStrikeAliases': aliases,
         'directStrikeMapIcons': json.loads((ROOT / 'assets/unit-icons/map-unit-icons.json').read_text(encoding='utf-8')),
         'curatedButtonAliases': json.loads((ROOT / 'assets/unit-icons/button-aliases.json').read_text(encoding='utf-8')),
         'units': {name: item for name, item in resolved.items() if name in catalog}, 'textures': sources})
    print(json.dumps({'mappedUnits': len(catalog), 'textures': len(sources)}))

if __name__ == '__main__':
    pack() if '--pack' in sys.argv else resolve()
