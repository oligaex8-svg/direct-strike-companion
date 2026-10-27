"""Bounded native console metadata: never renders or mutates game storage."""
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('campaign',Path(__file__).with_name('Export-Campaign48.py'))
campaign=importlib.util.module_from_spec(spec);spec.loader.exec_module(campaign)
source=campaign.ROOT/'assets/themes/native54';parser=campaign.load_parser();results=[]
for file in sorted(source.glob('*.m3')):
    try:
        row=campaign.inspect_model(file,parser);results.append(row)
        print(json.dumps({'file':file.name,'tris':row['triangles'],'materials':row['materialTypes'],'unsupported':row['unsupportedMaterialTypes'],'sequences':[{k:s[k] for k in ('name','start','end','nativeTracks')}|{'varying':len(s['varyingBoneTracks'])} for s in row['sequences']]}))
    except Exception as error:results.append({'file':file.name,'error':str(error)})
(source/'inspection.json').write_text(json.dumps(results,indent=2))

