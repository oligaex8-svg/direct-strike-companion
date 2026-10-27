"""Original Armory console with its original native video mapped to native UVs.

No new housing, camera turntable, or invented skeletal animation. The separate
adapter leaves the frozen local48 production renders untouched.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import bpy

spec = importlib.util.spec_from_file_location('campaign48', Path(__file__).with_name('Render-Campaign48.py'))
campaign = importlib.util.module_from_spec(spec)
spec.loader.exec_module(campaign)
campaign.PROFILES['hyperion-armory'] = {'size': (320, 160), 'a': (1.2, -6, 3.5), 'b': (-1.2, -6, 2.5), 'pilotPhase': .25, 'surface': 'metal'}
original_camera_fit = campaign.camera_fit
def camera_fit(scene, bounds, profile, angle):
    result = original_camera_fit(scene, bounds, profile, angle)
    # Blender's landscape ortho_scale spans horizontal width. Keep the whole
    # source machine visible rather than fitting it as a square camera.
    scene.camera.data.ortho_scale *= max(1, profile['size'][0] / profile['size'][1])
    return result
campaign.camera_fit = camera_fit
native_video = campaign.NATIVE / 'Video_ArmoryScreen.ogv'
sequence = campaign.NATIVE / 'armory-video-frames' / 'frame-001.png'
video_meta = json.loads((campaign.NATIVE / 'armory-video-sampling.json').read_text())
original_track_motion = campaign.track_motion
def track_motion(data):
    return (True, True) if data['device'] == 'hyperion-armory' else original_track_motion(data)
campaign.track_motion = track_motion
OriginalMaterials = campaign.Materials
class NativeVideoMaterials(OriginalMaterials):
    def texture(self, nodes, links, layer, role):
        result = super().texture(nodes, links, layer, role)
        if layer['file'].lower().endswith('video_armoryscreen.ogv'):
            for node in nodes:
                if node.type == 'TEX_IMAGE' and node.label == role + ': ' + layer['file']:
                    image = bpy.data.images.load(str(sequence), check_existing=True)
                    image.source = 'SEQUENCE'
                    node.image = image
                    node.image_user.frame_duration = video_meta['frames']
                    node.image_user.frame_start = 1
                    node.image_user.use_auto_refresh = True
                    node.image_user.use_cyclic = True
            self.notes.add('Original Video_ArmoryScreen.ogv sampled over its complete native duration and mapped through original console UVs; console geometry remains static')
        return result
campaign.Materials = NativeVideoMaterials
# The console's skeletal Stand is static. Its real movie supplies the timeline.
data_path = campaign.NATIVE / 'hyperion-armory-data.json'
data = json.loads(data_path.read_text())
data.setdefault('staticHousingSequence', dict(data['sequence']))
data['sequence']['end'] = data['sequence']['start'] + video_meta['duration'] * 1000
data_path.write_text(json.dumps(data, separators=(',', ':')))
campaign.main()
report_path = campaign.ROOT / 'verification/local48-campaign/hyperion-armory/render.json'
report = json.loads(report_path.read_text())
report['provenance']['nativeVideo'] = video_meta
report['provenance']['adapterSHA256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
report['provenance']['staticHousing'] = True
report['nativeSequence'] = data['staticHousingSequence']
report['nativeDurationScope'] = 'Complete original Armory video duration; static skeletal Stand is recorded separately'
report['provenance']['materialAdaptations'] = [note.replace('no runtime video', 'native Armory movie sampled into the screen image sequence') for note in report['provenance']['materialAdaptations']]
report_path.write_text(json.dumps(report, indent=2))
