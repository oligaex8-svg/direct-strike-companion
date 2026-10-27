"""Read native M3 geometry, material references and Stand tracks; no invented mesh."""
import importlib.util,pathlib,json,hashlib,math
root=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('m3read',root/'verification/vendor/m3studio/io_m3.py')
m3=importlib.util.module_from_spec(spec);spec.loader.exec_module(m3)
native=root/'assets/themes/protoss42/native';a=m3.M3SectionList.load(str(native/'Pylon.m3'));o=a.model
def text(ref):return a[ref].content_to_string() if ref.index else ''
def vec(v):return [v.x,v.y,v.z]
def quat(v):return [v.w,v.x,v.y,v.z]
def mat(m):return [[getattr(getattr(m,c),r) for c in ('x','y','z','w')] for r in ('x','y','z','w')]
desc=m3.M3StructureDescription.get_vertex_description(o.vertex_flags)
raw=bytes(a[o.vertices].content);verts=desc.instances(raw,len(raw)//desc.size)
division=a[o.divisions][0];lookups=list(a[o.bone_lookup]);all_faces=list(a[division.faces]);batches=list(a[division.batches]);references=list(a[o.material_references])
materials=[]
for material in a[o.materials_standard]:
    layers={}
    for key in ['layer_diff','layer_spec','layer_emis1','layer_emis2','layer_alpha1','layer_alpha2','layer_norm','layer_envi']:
        sec=a[getattr(material,key)]
        if len(sec):
            layer=sec[0];layers[key]={'file':text(layer.color_bitmap),'channels':layer.color_channels,'uvSource':layer.uv_source,'multiply':layer.color_multiply.default,'brightness':layer.color_brightness.default}
    materials.append({'name':text(material.name),'layers':layers,'blend':material.blend_mode,'hdrEmission':material.hdr_emis,'hdrSpecular':material.hdr_spec,'specularity':material.specularity})
regions=[]
for ii,region in enumerate(a[division.regions]):
    rverts=verts[region.first_vertex_index:region.first_vertex_index+region.vertex_count]
    faces=all_faces[region.first_face_index:region.first_face_index+region.face_count]
    if region.first_vertex_index and min(faces)>=region.first_vertex_index:faces=[x-region.first_vertex_index for x in faces]
    lookup=lookups[region.first_bone_lookup_index:region.first_bone_lookup_index+region.bone_lookup_count]
    assert len(lookup)==1,'Expected native Pylon rigid submeshes'
    batch=next(x for x in batches if x.region_index==ii)
    ref=references[batch.material_reference_index]
    regions.append({'name':'native_region_'+str(ii),'bone':lookup[0],'material':ref.material_index,'vertices':[vec(v.pos) for v in rverts],'normals':[[v.normal.x/127.5-1,v.normal.y/127.5-1,v.normal.z/127.5-1] for v in rverts],'uv':[[v.uv0.x/2048,1-v.uv0.y/2048] for v in rverts],'triangles':[faces[j:j+3] for j in range(0,len(faces),3)]})
bones=[]
for bone,rest in zip(a[o.bones],a[o.bone_rests]):
    bones.append({'name':text(bone.name),'parent':bone.parent,'location':vec(bone.location.default),'rotation':quat(bone.rotation.default),'scale':vec(bone.scale.default),'inverseBind':mat(rest.matrix),'ids':{'location':bone.location.header.id,'rotation':bone.rotation.header.id,'scale':bone.scale.header.id}})
stc=a[o.sequence_transformation_collections][0];tracks={}
for anim_id,ref in zip(a[stc.anim_ids],a[stc.anim_refs]):
    kind=ref>>16;index=ref&65535
    if kind not in (2,3):continue
    block=a[getattr(stc,'sd3v' if kind==2 else 'sd4q')][index]
    tracks[str(anim_id)]={'kind':'vector' if kind==2 else 'quaternion','frames':list(a[block.frames]),'values':[(vec(v) if kind==2 else quat(v)) for v in a[block.keys]]}
seq=a[o.sequences][0]
def native_value(v):
    if isinstance(v,float) and not math.isfinite(v):return None
    if isinstance(v,(int,float,str)):return v
    if hasattr(v,'default'):return native_value(v.default)
    if hasattr(v,'r'):return [v.r/255,v.g/255,v.b/255,v.a/255]
    if hasattr(v,'x'):return vec(v)
    return None
particles=[{k:native_value(v) for k,v in vars(p).items() if k!='desc' and native_value(v) is not None} for p in a[o.particle_systems]]
result={'particles':particles,'controllers':{'crystal':{'bone':'Ref_Turret','nativeDegreesPerSecond':27.9492,'loopTurns':1},'outerArms':{'bone':'Ref_TurretZ','nativeDegreesPerSecond':54.8437,'loopTurns':2}},'provenance':'Blizzard native SC2 Pylon.m3 extracted read-only from installed game; M3Studio parser, separate authored presentation only','sourceSHA256':hashlib.sha256((native/'Pylon.m3').read_bytes()).hexdigest(),'sequence':{'name':text(seq.name),'start':seq.anim_ms_start,'end':seq.anim_ms_end},'materials':materials,'regions':regions,'bones':bones,'tracks':tracks}
(native/'pylon-data.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'particleCount':len(particles),'vertices':sum(len(r['vertices']) for r in regions),'triangles':sum(len(r['triangles']) for r in regions),'sequence':result['sequence'],'materials':materials,'tracks':{k:{'kind':v['kind'],'keys':len(v['frames'])} for k,v in tracks.items()}},indent=2))
