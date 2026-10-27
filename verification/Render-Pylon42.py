"""Render the native SC2 Pylon and Stand motion into a transparent UI flipbook."""
import bpy,math,json,pathlib,bisect,sys,hashlib,random
from mathutils import Matrix,Vector,Quaternion
root=pathlib.Path(__file__).resolve().parent.parent
native=root/'assets/themes/protoss42/native';out=root/'verification/local45-pylon';out.mkdir(parents=True,exist_ok=True)
data=json.loads((native/'pylon-data.json').read_text());bones=data['bones'];native_duration=data['sequence']['end'];duration=13000;count=312
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES' if '--cycles' in sys.argv else 'BLENDER_EEVEE'
scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.fps=24;scene.frame_start=1;scene.frame_end=count
scene.render.resolution_x=512;scene.render.resolution_y=704;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.image_settings.compression=30
scene.world.color=(.035,.045,.065)
scene.view_settings.view_transform='AgX'
if hasattr(scene,'eevee') and hasattr(scene.eevee,'taa_render_samples'):
    scene.eevee.taa_render_samples=24
images={}
def image(name):
    path=root/'assets/themes/protoss42/textures'/(pathlib.PureWindowsPath(name).stem.lower()+'.png')
    if not path.exists():path=native/name
    if not path.exists():return None
    if name not in images:images[name]=bpy.data.images.load(str(path),check_existing=True)
    return images[name]
def textured_material(index):
    meta=data['materials'][index];mat=bpy.data.materials.new('SC2 '+meta['name']);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
    crystal='crystal' in meta['name'];p.inputs['Metallic'].default_value=.15 if crystal else .68;p.inputs['Roughness'].default_value=.19 if crystal else .35
    p.inputs['IOR'].default_value=1.48
    for layer,target in [('layer_diff','Base Color'),('layer_emis1','Emission Color')]:
        name=pathlib.PureWindowsPath(meta['layers'][layer]['file']).name
        tex=image(name)
        if tex:
            t=n.new('ShaderNodeTexImage');t.image=tex;t.label=name;l.new(t.outputs['Color'],p.inputs[target])
    p.inputs['Emission Strength'].default_value=meta['hdrEmission']*(.95 if crystal else .65)
    # Native specular and sphere-reflection layers were absent in local.42.
    spec=image('pylon_specular.dds')
    if spec:
        spec.colorspace_settings.name='Non-Color';t=n.new('ShaderNodeTexImage');t.image=spec
        rough=n.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1;rough.inputs['To Min'].default_value=.32 if crystal else .5;rough.inputs['To Max'].default_value=.1 if crystal else .2
        l.new(t.outputs['Alpha' if crystal else 'Color'],rough.inputs['Value']);l.new(rough.outputs['Result'],p.inputs['Roughness'])
        l.new(t.outputs['Alpha' if crystal else 'Color'],p.inputs['Specular IOR Level'])
    if crystal:
        p.inputs['Transmission Weight'].default_value=0
        p.inputs['Metallic'].default_value=0;p.inputs['Coat Weight'].default_value=.18;p.inputs['Coat Roughness'].default_value=.24
        mat.surface_render_method='BLENDED'
        if spec:
            alpha=n.new('ShaderNodeMath');alpha.operation='MULTIPLY';alpha.inputs[1].default_value=meta['layers']['layer_alpha1']['multiply'];alpha.use_clamp=True
            alpha_tex=n.new('ShaderNodeTexImage');alpha_tex.image=spec;l.new(alpha_tex.outputs['Alpha'],alpha.inputs[0]);l.new(alpha.outputs[0],p.inputs['Alpha'])
        # Preserve genuine surface reflection from scene lights; do not add an
        # environment photograph to emission or fake physical refraction.
    normal=image('pylon_normal.dds')
    if normal:
        normal.colorspace_settings.name='Non-Color';t=n.new('ShaderNodeTexImage');t.image=normal
        sep=n.new('ShaderNodeSeparateColor');l.new(t.outputs['Color'],sep.inputs['Color'])
        # SC2 DXT5 normal uses alpha for X, green for Y. Recover Z.
        x=n.new('ShaderNodeMath');x.operation='MULTIPLY_ADD';x.inputs[1].default_value=2;x.inputs[2].default_value=-1;l.new(t.outputs['Alpha'],x.inputs[0])
        y=n.new('ShaderNodeMath');y.operation='MULTIPLY_ADD';y.inputs[1].default_value=2;y.inputs[2].default_value=-1;l.new(sep.outputs['Green'],y.inputs[0])
        xx=n.new('ShaderNodeMath');xx.operation='MULTIPLY';l.new(x.outputs[0],xx.inputs[0]);l.new(x.outputs[0],xx.inputs[1])
        yy=n.new('ShaderNodeMath');yy.operation='MULTIPLY';l.new(y.outputs[0],yy.inputs[0]);l.new(y.outputs[0],yy.inputs[1])
        add=n.new('ShaderNodeMath');add.operation='ADD';l.new(xx.outputs[0],add.inputs[0]);l.new(yy.outputs[0],add.inputs[1])
        z=n.new('ShaderNodeMath');z.operation='SUBTRACT';z.inputs[0].default_value=1;l.new(add.outputs[0],z.inputs[1]);z.use_clamp=True
        sqrt=n.new('ShaderNodeMath');sqrt.operation='SQRT';l.new(z.outputs[0],sqrt.inputs[0])
        zs=n.new('ShaderNodeMath');zs.operation='MULTIPLY_ADD';zs.inputs[1].default_value=.5;zs.inputs[2].default_value=.5;l.new(sqrt.outputs[0],zs.inputs[0])
        rgb=n.new('ShaderNodeCombineColor');l.new(t.outputs['Alpha'],rgb.inputs['Red']);l.new(sep.outputs['Green'],rgb.inputs['Green']);l.new(zs.outputs[0],rgb.inputs['Blue'])
        nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.18 if crystal else .65;l.new(rgb.outputs[0],nm.inputs['Color']);l.new(nm.outputs['Normal'],p.inputs['Normal'])
    return mat
materials=[textured_material(i) for i in range(2)]
objects=[]
for region in data['regions']:
    mesh=bpy.data.meshes.new(region['name']);mesh.from_pydata(region['vertices'],[],region['triangles']);mesh.update();uv=mesh.uv_layers.new(name='Native UV0')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for loop in poly.loop_indices:uv.data[loop].uv=region['uv'][mesh.loops[loop].vertex_index]
    if region.get('normals'):mesh.normals_split_custom_set_from_vertices([Vector(v).normalized() for v in region['normals']])
    obj=bpy.data.objects.new(region['name'],mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(materials[region['material']]);obj.rotation_mode='QUATERNION';objects.append((obj,region['bone']))
    obj['source']='Blizzard SC2 Pylon.m3, unchanged native mesh/UVs'
def sample(anim_id,default,t,rotation=False):
    track=data['tracks'].get(str(anim_id))
    if not track:return Quaternion(default) if rotation else Vector(default)
    times=track['frames'];vals=track['values'];i=max(0,bisect.bisect_right(times,t)-1);j=(i+1)%len(times);end=times[j] if j else native_duration
    ratio=0 if end==times[i] else max(0,min(1,(t-times[i])/(end-times[i])))
    if rotation:return Quaternion(vals[i]).slerp(Quaternion(vals[j]),ratio)
    return Vector(vals[i]).lerp(Vector(vals[j]),ratio)
def pose(t,phase=0):
    globals=[]
    for b in bones:
        loc=sample(b['ids']['location'],b['location'],t);rot=sample(b['ids']['rotation'],b['rotation'],t,True);scale=sample(b['ids']['scale'],b['scale'],t)
        # SC2 actor turrets add motion beyond the Stand clip. Use closed
        # 13s UI turns (within 1% of the game rates), not a camera orbit.
        controller=next((c for c in data['controllers'].values() if c['bone']==b['name']),None)
        if controller:rot=rot@Quaternion((0,0,1),2*math.pi*controller['loopTurns']*phase)
        local=Matrix.LocRotScale(loc,rot,scale);globals.append(globals[b['parent']]@local if b['parent']>=0 else local)
    return [globals[i]@Matrix(b['inverseBind']) for i,b in enumerate(bones)]
previous={}
for frame in range(1,count+2):
    phase=((frame-1)%count)/count;transforms=pose(phase*native_duration,phase)
    for obj,bi in objects:
        loc,q,scale=transforms[bi].decompose()
        if obj.name in previous and previous[obj.name].dot(q)<0:q.negate()
        previous[obj.name]=q.copy();obj.location=loc;obj.rotation_quaternion=q;obj.scale=scale
        for prop in ('location','rotation_quaternion','scale'):obj.keyframe_insert(data_path=prop,frame=frame)
for obj,bi in objects:
    if obj.animation_data and obj.animation_data.action:
        # Per-frame native samples; no Bezier overshoot.
        try:
            for fc in obj.animation_data.action.fcurves:
                for key in fc.keyframe_points:key.interpolation='LINEAR'
        except AttributeError:pass
# Original SC2 power-field projection, mapped onto actual scene ground.
grid=image('pylonradius1b_512.dds')
bpy.ops.mesh.primitive_plane_add(size=3.05,location=(0,0,-.035));field=bpy.context.object;field.name='Native Pylon power field'
mat=bpy.data.materials.new('SC2 power projection');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=grid;em=n.new('ShaderNodeEmission');l.new(tex.outputs['Color'],em.inputs['Color']);em.inputs['Strength'].default_value=.8
trans=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(tex.outputs['Alpha'],mix.inputs[0]);l.new(trans.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);output=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],output.inputs['Surface']);field.data.materials.append(mat)
if hasattr(mat,'surface_render_method'):mat.surface_render_method='BLENDED'
for frame,value in [(1,.72),(79,1.04),(157,.74),(235,.94),(313,.72)]:em.inputs['Strength'].default_value=value;em.inputs['Strength'].keyframe_insert(data_path='default_value',frame=frame)
# Real power-grid texture remains anchored. A radial energy front changes its
# cell illumination; no grid geometry or reading content travels across the UI.
coord=n.new('ShaderNodeTexCoord');dist=n.new('ShaderNodeVectorMath');dist.operation='DISTANCE';dist.inputs[1].default_value=(.5,.5,0);l.new(coord.outputs['UV'],dist.inputs[0]);rad=n.new('ShaderNodeMath');rad.operation='MULTIPLY';rad.inputs[1].default_value=30;l.new(dist.outputs['Value'],rad.inputs[0]);phase=n.new('ShaderNodeMath');phase.operation='SUBTRACT';l.new(rad.outputs[0],phase.inputs[0]);wave=n.new('ShaderNodeMath');wave.operation='SINE';l.new(phase.outputs[0],wave.inputs[0]);power=n.new('ShaderNodeMath');power.operation='POWER';power.inputs[1].default_value=6;power.use_clamp=True;l.new(wave.outputs[0],power.inputs[0]);gain=n.new('ShaderNodeMath');gain.operation='MULTIPLY_ADD';gain.inputs[1].default_value=2.2;gain.inputs[2].default_value=.55;l.new(power.outputs[0],gain.inputs[0]);l.new(gain.outputs[0],em.inputs['Strength'])
for f in range(1,count+2):phase.inputs[1].default_value=4*math.pi*(f-1)/count;phase.inputs[1].keyframe_insert(data_path='default_value',frame=f)

def light(name,location,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,1.1))-obj.location).to_track_quat('-Z','Y').to_euler()
light('Warm gold key',(4,-5,7),650,5,(1,.82,.58));light('Cool crystal fill',(-4,-2,4),480,4,(.22,.53,1));light('Soft rim',(1,4,5),850,3,(.58,.76,1))
bpy.ops.object.camera_add(location=(5,-8,6));camera=bpy.context.object;camera.name='UI orthographic camera';camera.rotation_euler=(Vector((0,0,1.22))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.3;scene.camera=camera
# Reconstruct the native billboard emitter using its own Glow_Blue2 texture,
# lifespan, speed, alpha envelope and source attachment. Seeded for a clean loop.
light_data=bpy.data.lights.new('Crystal energy spill','POINT');light_data.energy=22;light_data.color=(.08,.42,1);light_data.shadow_soft_size=.45
spill=bpy.data.objects.new('Crystal energy spill',light_data);bpy.context.collection.objects.link(spill);spill.location=(0,0,1.3)
pdata=data['particles'][0];rng=random.Random(43);particle_count=round(pdata['emit_rate']*duration/1000)
for i in range(particle_count):
    mesh=bpy.data.meshes.new('Native glow quad');mesh.from_pydata([(-.5,-.5,0),(.5,-.5,0),(.5,.5,0),(-.5,.5,0)],[],[(0,1,2,3)]);mesh.update();uv=mesh.uv_layers.new()
    for j,xy in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[j].uv=xy
    obj=bpy.data.objects.new('SC2 crystal glow '+str(i),mesh);bpy.context.collection.objects.link(obj);obj.rotation_euler=camera.rotation_euler
    mat=bpy.data.materials.new('Native glow '+str(i));mat.use_nodes=True;mat.surface_render_method='BLENDED';n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
    tex=n.new('ShaderNodeTexImage');tex.image=image('glow_blue2.dds');em=n.new('ShaderNodeEmission');l.new(tex.outputs['Color'],em.inputs['Color']);em.inputs['Strength'].default_value=1.5
    alpha=n.new('ShaderNodeMath');alpha.operation='MULTIPLY';l.new(tex.outputs['Alpha'],alpha.inputs[0]);alpha.inputs[1].default_value=0
    tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(alpha.outputs[0],mix.inputs[0]);l.new(tr.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);end=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],end.inputs['Surface']);obj.data.materials.append(mat)
    birth=i/particle_count;life=rng.uniform(pdata['lifespan'],pdata['lifespan_random']);speed=rng.uniform(pdata['emit_speed'],pdata['emit_speed_random']);angle=rng.uniform(0,2*math.pi);rad=rng.uniform(.03,pdata['emit_shape_radius']);z=rng.uniform(-.65,.5);size=rng.uniform(pdata['size'][0],pdata['size2'][0]);peak=rng.uniform(pdata['color_mid'][3],pdata['color2_mid'][3])
    for frame in range(1,count+2):
        phase=((frame-1)%count)/count;age=((phase-birth)%1)*(duration/1000);alive=age<life;u=age/life
        # Parent is the original crystal emitter bone, including actor spin.
        b=data['bones'][pdata['bone']];base=Matrix(b['inverseBind']).inverted().translation
        base=pose(phase*native_duration,phase)[pdata['bone']]@base
        obj.location=base+Vector((rad*math.cos(angle),rad*math.sin(angle),z+age*speed));obj.scale=(size,size,size)
        alpha.inputs[1].default_value=(math.sin(math.pi*u)**2*peak*.45 if alive else 0)
        obj.keyframe_insert(data_path='location',frame=frame);alpha.inputs[1].keyframe_insert(data_path='default_value',frame=frame)
# Occasional warp transfer: native soft sprites collect from the animated
# power field and spiral up into the crystal. No hard volume or visible cylinder.
rng=random.Random(45)
for i in range(22):
    mesh=bpy.data.meshes.new('Warp mote');mesh.from_pydata([(-.5,-.5,0),(.5,-.5,0),(.5,.5,0),(-.5,.5,0)],[],[(0,1,2,3)]);mesh.update();uv=mesh.uv_layers.new()
    for j,xy in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[j].uv=xy
    obj=bpy.data.objects.new('Warp transfer mote '+str(i),mesh);bpy.context.collection.objects.link(obj);obj.rotation_euler=camera.rotation_euler
    mat=bpy.data.materials.new('Native warp mote '+str(i));mat.use_nodes=True;mat.surface_render_method='BLENDED';n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=image('glow_blue2.dds');alpha=n.new('ShaderNodeMath');alpha.operation='MULTIPLY';l.new(tex.outputs['Alpha'],alpha.inputs[0]);alpha.inputs[1].default_value=0;em=n.new('ShaderNodeEmission');l.new(tex.outputs['Color'],em.inputs['Color']);em.inputs['Strength'].default_value=2.8;tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(alpha.outputs[0],mix.inputs[0]);l.new(tr.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);dest=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],dest.inputs['Surface']);obj.data.materials.append(mat)
    theta=rng.uniform(0,2*math.pi);start=.56+rng.uniform(0,.09);life=rng.uniform(.13,.18);size=rng.uniform(.16,.35)
    for f in range(1,count+2):
        p=(f-1)/count;u=(p-start)/life;visible=0<u<1;v=max(0,min(1,u));angle=theta+v*math.pi*1.7;radius=.95*(1-v)+.09
        obj.location=(radius*math.cos(angle),radius*math.sin(angle),.08+v*2.45);obj.scale=(size*(1+.5*math.sin(v*math.pi)),)*3;obj.keyframe_insert(data_path='location',frame=f);obj.keyframe_insert(data_path='scale',frame=f);alpha.inputs[1].default_value=math.sin(math.pi*v)**2*.6 if visible else 0;alpha.inputs[1].keyframe_insert(data_path='default_value',frame=f)
# Alpha-safe bloom is applied in Pack-Pylon42.cjs after the raw RGBA render.
scene.render.use_compositing=False
scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/themes/protoss42/protoss-pylon.blend'));bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/themes/protoss42/protoss-pylon.blend'))
pilot='--pilot' in sys.argv
if pilot:
    scene.render.resolution_x=512;scene.render.resolution_y=704
    if '--event' in sys.argv:scene.frame_set(218)
    scene.render.filepath=str(out/('pylon-event-pilot.png' if '--event' in sys.argv else 'pylon-pilot.png'));bpy.ops.render.render(write_still=True)
else:
    fingerprint=hashlib.sha256(pathlib.Path(__file__).read_bytes()+(native/'pylon-data.json').read_bytes()).hexdigest()
    frames=out/('frames-'+fingerprint[:10]);frames.mkdir(exist_ok=True)
    for frame in range(1,count+1):
        path=frames/(f'{frame-1:03d}.png')
        if path.exists():continue
        scene.frame_set(frame);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    (out/'render.json').write_text(json.dumps({'sourceModelSHA256':data['sourceSHA256'],'frames':count,'width':256,'height':352,'rawWidth':512,'rawHeight':704,'duration':duration,'nativeSequence':data['sequence']['name'],'blender':bpy.app.version_string,'meshVertices':1153,'triangles':1354,'framesDir':str(frames),'fingerprint':fingerprint,'controllers':data['controllers'],'effectiveRates':{'crystal':360/(duration/1000),'outerArms':720/(duration/1000)},'effects':['native glow billboard emitter','native specular map','alpha-correct crystal with native vertex normals','native vertex normals and alpha mask, stable reflection','radiance bloom with soft alpha','animated native power grid','occasional native-texture warp transfer']},indent=2))
