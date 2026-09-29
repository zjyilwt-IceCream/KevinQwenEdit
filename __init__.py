import base64
import io
import json

import numpy as np
from PIL import Image, ImageOps
import torch

import nodes


def fit_canvas(image, width, height):
    frames = []
    for frame in image:
        pixels = np.clip(frame.detach().cpu().numpy() * 255, 0, 255).astype(np.uint8)
        source = Image.fromarray(pixels)
        background = (255, 255, 255, 255) if source.mode == 'RGBA' else (255, 255, 255)
        result = ImageOps.pad(source, (width, height), method=Image.Resampling.LANCZOS, color=background)
        frames.append(torch.from_numpy(np.asarray(result).copy()).float() / 255)
    return torch.stack(frames)


class KevinQwenCanvas:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'image': ('IMAGE',),
            'custom_size': ('BOOLEAN', {'default': False, 'label_on': '自定义宽高', 'label_off': '主图比例＋短边'}),
            'short_side': ('INT', {'default': 1024, 'min': 64, 'max': 8192, 'step': 32}),
            'width': ('INT', {'default': 1024, 'min': 64, 'max': 8192, 'step': 32}),
            'height': ('INT', {'default': 1536, 'min': 64, 'max': 8192, 'step': 32}),
        }}

    RETURN_TYPES = ('IMAGE', 'INT', 'INT', 'STRING')
    RETURN_NAMES = ('统一画布', '实际宽', '实际高', '尺寸说明')
    FUNCTION = 'prepare'
    CATEGORY = 'KEVIN/QwenImage2.1'

    def prepare(self, image, custom_size, short_side, width, height):
        source_height, source_width = image.shape[1:3]
        if not custom_size:
            ratio = short_side / min(source_width, source_height)
            width, height = source_width * ratio, source_height * ratio
        width = max(64, int(width / 32 + 0.5) * 32)
        height = max(64, int(height / 32 + 0.5) * 32)
        text = f'{width} × {height}｜{width * height / 1000000:.2f} MP｜' + ('自定义宽高' if custom_size else f'主图比例，短边 {short_side}')
        return (fit_canvas(image, width, height), width, height, text)


class KevinQwenPoseImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'canvas': ('IMAGE',),
            'pose_json': ('STRING', {'default': '{}', 'multiline': True}),
        }}

    RETURN_TYPES = ('IMAGE',)
    RETURN_NAMES = ('人偶姿态图',)
    FUNCTION = 'render'
    CATEGORY = 'KEVIN/QwenImage2.1'
    DESCRIPTION = '复用已安装的 Fisher 自由姿势编辑器和同一份人偶状态。先编辑，再应用到节点。'

    def render(self, canvas, pose_json):
        state = json.loads(pose_json)
        data = state.get('poseReference', '')
        if not data.startswith('data:image/png;base64,'):
            raise ValueError('请打开自由姿势编辑器，点击“应用到节点”。')
        with Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))) as im:
            image = torch.from_numpy(np.asarray(im.convert('RGB')).copy()).float().unsqueeze(0) / 255
        return (fit_canvas(image, canvas.shape[2], canvas.shape[1]),)


HEAD = ('head_swap: start with <image1> as the base image, keeping its body, clothing, pose, composition, lighting, environment and background. '
        'Replace only the head in <image1> with the head from <image2>, preserving the identity, hair, eye color and facial structure from <image2>. '
        'Copy the eye direction, head rotation and expression from <image1>. Match the head size and lighting to the body. Sharp natural details.')
POSE = ('Draw character from image2\n'
        'Use the mannequin in <image1> only for body pose, framing and camera angle. '
        'Preserve the person, face, hairstyle and clothing from <image2>. '
        'Keep the hands empty unless the user explicitly requests an object. Do not copy the mannequin material.')


class KevinQwenTaskPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'text': ('STRING', {'multiline': True, 'default': '', 'forceInput': True}),
            'stage': (['基础阶段', '换头阶段'],),
            'pose_enabled': ('BOOLEAN', {'default': False}),
            'after_pe': ('BOOLEAN', {'default': False}),
        }}

    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('实际任务提示词',)
    FUNCTION = 'compose'
    CATEGORY = 'KEVIN/QwenImage2.1'

    def compose(self, text, stage, pose_enabled, after_pe):
        if stage == '换头阶段':
            prefix = HEAD
            if pose_enabled and not after_pe:
                text = ''  # Common edits were already applied in the pose stage.
        elif pose_enabled:
            prefix = POSE
        else:
            return (text,)
        return (text if text.startswith(prefix) else prefix + ('\n' + text if text else ''),)


class KevinQwenHeadReference(nodes.LoadImage):
    @classmethod
    def INPUT_TYPES(cls):
        fields = nodes.LoadImage.INPUT_TYPES()
        fields['required']['enabled'] = ('BOOLEAN', {'default': False})
        return fields

    FUNCTION = 'load_optional'
    CATEGORY = 'KEVIN/QwenImage2.1'

    def load_optional(self, image, enabled):
        if not enabled:
            return (None, None)
        return self.load_image(image)

    @classmethod
    def VALIDATE_INPUTS(cls, image, enabled=False):
        return nodes.LoadImage.VALIDATE_INPUTS(image) if enabled is True else True

    @classmethod
    def IS_CHANGED(cls, image, enabled=False):
        return nodes.LoadImage.IS_CHANGED(image) if enabled else False


NODE_CLASS_MAPPINGS = {
    'KevinQwenCanvas': KevinQwenCanvas,
    'KevinQwenPoseImage': KevinQwenPoseImage,
    'KevinQwenTaskPrompt': KevinQwenTaskPrompt,
    'KevinQwenHeadReference': KevinQwenHeadReference,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    'KevinQwenCanvas': 'KEVIN · 统一输出尺寸',
    'KevinQwenPoseImage': 'KEVIN · 自由姿势编辑器',
    'KevinQwenTaskPrompt': 'KEVIN · 任务指令',
    'KevinQwenHeadReference': 'KEVIN · 头部参考图',
}
WEB_DIRECTORY = './web'
