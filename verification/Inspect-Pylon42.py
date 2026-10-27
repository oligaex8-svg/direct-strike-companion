import importlib.util, pathlib, json
root=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('m3read',root/'verification/vendor/m3studio/io_m3.py')
m3=importlib.util.module_from_spec(spec);spec.loader.exec_module(m3)
sections=m3.M3SectionList.load(str(root/'assets/themes/protoss42/native/Pylon.m3'))
def values(obj):
    return {k:str(v)[:160] for k,v in obj.__dict__.items() if k!='desc'}
print('MODEL',values(sections.model))
for name in ['bones','divisions','material_references','materials_standard','sequences','vertices','bone_lookup','bone_rests']:
    ref=getattr(sections.model,name,None)
    if ref is not None:
        sec=sections[ref];print(name,len(sec))
        if len(sec):print(values(sec[0]) if hasattr(sec[0],'__dict__') else str(sec.content[:24]))
print('SECTIONS',[(s.desc.history.name,s.desc.version,len(s)) for s in sections])
