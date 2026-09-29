import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';

// The editor bridge and ComfyUI temp-image preview approach build on
// Work-Fisher's MIT-licensed integration. See licenses/Work-Fisher-MIT.txt.
const previewRequests = new WeakMap();

async function refreshPosePreview(node) {
    let reference;
    try { reference = JSON.parse(findWidget(node, 'pose_json')?.value || '{}').poseReference; }
    catch { reference = null; }
    const previous = previewRequests.get(node);
    if (previous && previous.reference === reference && previous.pending) return;
    const request = { reference, pending: true };
    previewRequests.set(node, request);
    if (typeof reference !== 'string' || !reference.startsWith('data:image/png;base64,')) {
        request.pending = false;
        if (node.id != null && app.nodeOutputs[node.id]) app.nodeOutputs[node.id] = { images: [] };
        node.imgs = null;
        node.setDirtyCanvas(true, true);
        return;
    }
    try {
        let checksum = 2166136261;
        for (let i = 0; i < reference.length; i++) checksum = Math.imul(checksum ^ reference.charCodeAt(i), 16777619);
        const bytes = Uint8Array.from(atob(reference.split(',')[1]), c => c.charCodeAt(0));
        const form = new FormData();
        form.append('image', new Blob([bytes], { type: 'image/png' }), `kevin_qwen_pose_${(checksum >>> 0).toString(16)}.png`);
        form.append('type', 'temp');
        form.append('overwrite', 'true');
        const response = await api.fetchApi('/upload/image', { method: 'POST', body: form });
        if (!response.ok) throw new Error(`Preview upload returned ${response.status}`);
        const file = await response.json();
        // A slower upload must never replace a newer pose or a different workflow.
        if (previewRequests.get(node) !== request || node.graph !== app.graph) return;
        app.nodeOutputs[node.id] = {
            ...(app.nodeOutputs[node.id] || {}),
            images: [{ filename: file.name, subfolder: file.subfolder || '', type: 'temp' }],
        };
        node.setSize([Math.max(node.size[0], 320), Math.max(node.size[1], 360)]);
        node.setDirtyCanvas(true, true);
    } catch (error) {
        console.warn('KEVIN: 人偶预览加载失败，姿势数据仍已保存。', error);
    } finally {
        request.pending = false;
    }
}

const findWidget = (node, name) => node?.widgets?.find(w => w.name === name);
const role = name => app.graph?._nodes?.find(n => n.properties?.kevin_qwen_role === name);
const value = name => !!findWidget(role(name), 'value')?.value;

function syncModes() {
    if (!role('head') || !role('pose') || !role('pe')) return;
    const head = value('head'), pose = value('pose'), pe = value('pe');
    const basePE = role('base_pe'), headPE = role('head_pe');
    for (const node of app.graph._nodes) {
        if (node.properties?.kevin_qwen_branch === 'head') node.mode = head ? 0 : 2;
    }
    if (basePE) basePE.mode = pe && (pose || !head) ? 0 : 4;
    if (headPE) {
        headPE.mode = head ? (pe ? 0 : 4) : 2;
        for (const w of basePE?.widgets || []) {
            const other = findWidget(headPE, w.name);
            if (other && w.name !== '输入提示词' && typeof w.value !== 'function') other.value = w.value;
        }
    }
    app.graph.setDirtyCanvas(true, true);
}

function openPose(node) {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:96vw;max-width:1700px;height:94vh;max-height:1100px;padding:0;border:1px solid #8b9bad;border-radius:12px;background:#f4f6f8;';
    const frame = document.createElement('iframe');
    frame.title = 'Fisher 自由姿势编辑器';
    frame.style.cssText = 'border:0;width:100%;height:100%;display:block';
    frame.src = '/extensions/ComfyUI-Fisher-Pose/editor/freepose.html?embedded=1&v=20260926-2';
    const picker = (multiple, directory, onFiles) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = multiple; input.webkitdirectory = directory; input.hidden = true;
        input.onchange = () => { if (input.files.length) onFiles([...input.files]); input.remove(); };
        dialog.append(input); input.click();
    };
    frame.fisherChooseReference = cb => picker(false, false, files => cb(files[0]));
    frame.fisherChooseFiles = (cb, options = {}) => picker(true, !!options.directory, cb);
    const close = () => { window.removeEventListener('message', receive); dialog.close(); dialog.remove(); };
    function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === 'fisher-ready') {
            let pose = findWidget(node, 'pose_json').value;
            const canvas = role('canvas'), main = role('main');
            const preview = main?.imgs?.[0];
            try {
                const state = JSON.parse(pose);
                let width = findWidget(canvas, 'width').value, height = findWidget(canvas, 'height').value;
                if (!findWidget(canvas, 'custom_size').value && preview?.naturalWidth) {
                    const scale = findWidget(canvas, 'short_side').value / Math.min(preview.naturalWidth, preview.naturalHeight);
                    width = Math.round(preview.naturalWidth * scale / 32) * 32;
                    height = Math.round(preview.naturalHeight * scale / 32) * 32;
                }
                if (findWidget(canvas, 'custom_size').value || preview?.naturalWidth) {
                    state.width = width; state.height = height;
                    pose = JSON.stringify(state);
                }
            } catch (error) { console.warn('KEVIN pose canvas:', error); }
            frame.contentWindow.postMessage({ type: 'fisher-load', payload: { pose_json: pose, extra_prompt: findWidget(role('prompt'), 'value')?.value || '', referencePreview: preview?.src || null } }, location.origin);
        }
        if (event.data?.type === 'fisher-close') close();
        if (event.data?.type === 'fisher-apply' && typeof event.data.payload?.pose_json === 'string') {
            const w = findWidget(node, 'pose_json');
            w.value = event.data.payload.pose_json;
            w.callback?.(w.value);
            const prompt = findWidget(role('prompt'), 'value');
            if (prompt && typeof event.data.payload.extra_prompt === 'string') {
                prompt.value = event.data.payload.extra_prompt;
                prompt.callback?.(prompt.value);
            }
            app.graph.change(); node.setDirtyCanvas(true, true); close();
            void refreshPosePreview(node);
        }
    }
    dialog.append(frame); document.body.append(dialog);
    window.addEventListener('message', receive);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.showModal();
}

app.registerExtension({
    name: 'KEVIN.QwenHeadPose',
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === 'KevinQwenPoseImage') {
            const original = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                original?.apply(this, arguments);
                const state = findWidget(this, 'pose_json');
                if (state) {
                    state.type = 'kevin_hidden';
                    if (state.element) state.element.style.display = 'none';
                    state.computeSize = () => [0, -4];
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = '打开自由姿势编辑器';
                button.style.cssText = 'width:100%;height:30px;border:1px solid var(--border-color,#555);border-radius:5px;color:var(--input-text,#ddd);background:var(--comfy-input-bg,#222);cursor:pointer;font:13px sans-serif;';
                button.addEventListener('click', () => openPose(this));
                this.addDOMWidget('kevin_pose_editor_button', 'kevin_button', button, {
                    serialize: false, hideOnZoom: false,
                    getMinHeight: () => 30, getMaxHeight: () => 30, getHeight: () => 30,
                });
            };
            const configure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = configure?.apply(this, arguments);
                setTimeout(() => {
                    if (this.graph === app.graph) void refreshPosePreview(this);
                }, 400);
                return result;
            };
        }
        if (nodeData.name === 'PrimitiveBoolean') {
            const original = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                original?.apply(this, arguments);
                const w = findWidget(this, 'value'), callback = w.callback;
                w.callback = function () { callback?.apply(this, arguments); syncModes(); };
            };
        }
    },
    async afterConfigureGraph() { syncModes(); },
    async setup() {
        const previous = app.graphToPrompt.bind(app);
        app.graphToPrompt = async function (...args) { syncModes(); return previous(...args); };
    },
});
