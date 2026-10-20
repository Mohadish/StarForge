// tools/art/gen.mjs — make pictures with the LOCAL ComfyUI (E:\ComfyUI\RUN-COMFY.bat, http://127.0.0.1:8188).
// Every model here is a free licence (commercial use fine): Z-Image Turbo (Apache 2.0), Qwen-Image-2512 (Apache 2.0),
// Qwen-Image-2512-Lightning (Apache 2.0), Z-Image-Turbo Fun ControlNet Union (Apache 2.0), BiRefNet (MIT).
//
//   node tools/art/gen.mjs [options] "prompt"
//     --model z | qwen     z = Z-Image Turbo (fast, ~1024 px, default) · qwen = Qwen-Image-2512 (best at words inside the picture)
//     --w 1024 --h 1024    size (qwen's native size is 1328 x 1328)
//     --n 4                how many pictures (seeds seed, seed+1, …)
//     --seed 1             first seed (same prompt + seed + settings = the same picture)
//     --full               qwen only: 50 steps, cfg 4 (slow, best) instead of the 8-step Lightning LoRA
//     --neg "…"            qwen only, with --full: what to avoid
//     --cutout             also save a transparent PNG (BiRefNet background removal)
//     --control pic.png    z only: the picture's EDGES shape the result (a sketch, an outline, a layout); --strength 0..1.5 (1)
//     --out art/gen/<date> folder · --name pic   file names: <name>-<model>-s<seed>.png (+ -cut.png)
// Each run appends its settings to <out>/gen-log.jsonl so a picture can be made again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';

const MODELS = {
  z: { unet: 'z_image_turbo_bf16.safetensors', clip: 'qwen_3_4b.safetensors', clipType: 'lumina2', vae: 'ae.safetensors', shift: 3, w: 1024, h: 1024 },
  qwen: { unet: 'qwen_image_2512_fp8_e4m3fn.safetensors', clip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', clipType: 'qwen_image', vae: 'qwen_image_vae.safetensors', shift: 3.1, w: 1328, h: 1328,
    lora: 'Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors',
    neg: 'low resolution, low quality, deformed, oversaturated, waxy, over-smoothed, AI look, messy composition, blurry or distorted text' },
};

// ---- the workflow (ComfyUI API format: { id: { class_type, inputs } }, a link = [id, output index]) ----
export function workflow(o) {
  const M = MODELS[o.model]; if (!M) throw new Error(`unknown model "${o.model}" (z or qwen)`);
  const w = {}, add = (id, class_type, inputs) => { w[id] = { class_type, inputs }; return [id, 0]; };
  let model = add('unet', 'UNETLoader', { unet_name: M.unet, weight_dtype: 'default' });
  const clip = add('clip', 'CLIPLoader', { clip_name: M.clip, type: M.clipType, device: 'default' });
  const vae = add('vae', 'VAELoader', { vae_name: M.vae });
  let width = o.w ?? M.w, height = o.h ?? M.h;
  if (o.control) {                                    // a sketch / outline: its edges steer the picture (Z-Image only)
    if (o.model !== 'z') throw new Error('--control works with --model z');
    const img = add('ctlImg', 'LoadImage', { image: o.control });
    const scaled = add('ctlScale', 'ImageScaleToMaxDimension', { image: img, upscale_method: 'lanczos', largest_size: Math.max(width, height) });
    const edges = add('ctlEdges', 'Canny', { image: scaled, low_threshold: 0.1, high_threshold: 0.32 });
    const patch = add('ctlPatch', 'ModelPatchLoader', { name: 'Z-Image-Turbo-Fun-Controlnet-Union.safetensors' });
    model = add('ctl', 'QwenImageDiffsynthControlnet', { model, model_patch: patch, vae, image: edges, strength: o.strength ?? 1 });
    add('ctlSize', 'GetImageSize', { image: scaled });
    width = ['ctlSize', 0]; height = ['ctlSize', 1];
    add('ctlSave', 'SaveImage', { images: edges, filename_prefix: 'forge/edges' });
  }
  const full = o.model === 'qwen' && o.full;
  if (o.model === 'qwen' && !full) model = add('lora', 'LoraLoaderModelOnly', { model, lora_name: M.lora, strength_model: 1 });
  model = add('shift', 'ModelSamplingAuraFlow', { model, shift: M.shift });
  const pos = add('pos', 'CLIPTextEncode', { clip, text: o.prompt });
  const neg = full ? add('neg', 'CLIPTextEncode', { clip, text: o.neg ?? M.neg }) : add('neg', 'ConditioningZeroOut', { conditioning: pos });
  const latent = add('latent', 'EmptySD3LatentImage', { width, height, batch_size: 1 });
  const s = o.model === 'z' ? { steps: 8, cfg: 1, sampler_name: 'res_multistep' } : full ? { steps: 50, cfg: 4, sampler_name: 'euler' } : { steps: 8, cfg: 1, sampler_name: 'euler' };
  const samples = add('sample', 'KSampler', { model, seed: o.seed, ...s, scheduler: 'simple', positive: pos, negative: neg, latent_image: latent, denoise: 1 });
  const image = add('decode', 'VAEDecode', { samples, vae });
  add('save', 'SaveImage', { images: image, filename_prefix: 'forge/pic' });
  if (o.cutout) {                                     // transparent background: BiRefNet mask → alpha (the official template's chain)
    const bm = add('bgModel', 'LoadBackgroundRemovalModel', { bg_removal_name: 'birefnet.safetensors' });
    const mask = add('bgMask', 'RemoveBackground', { bg_removal_model: bm, image });
    const inv = add('bgInv', 'InvertMask', { mask });
    const rgba = add('bgJoin', 'JoinImageWithAlpha', { image, alpha: inv });
    add('saveCut', 'SaveImage', { images: rgba, filename_prefix: 'forge/cut' });
  }
  return w;
}

// ---- talking to the server ----
async function call(p, init) {
  let r;
  try { r = await fetch(COMFY + p, init); } catch { throw new Error(`ComfyUI is not running at ${COMFY} — start E:\\ComfyUI\\RUN-COMFY.bat and wait for "To see the GUI go to"`); }
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${(await r.text()).slice(0, 1500)}`);
  return r;
}
export async function upload(file) {                 // put a local picture into ComfyUI's input folder → its name for LoadImage
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(file)]), path.basename(file));
  fd.append('overwrite', 'true');
  const j = await (await call('/upload/image', { method: 'POST', body: fd })).json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}
export async function run(wf) {                      // queue, wait, return { nodeId: [Buffer…] }
  const { prompt_id } = await (await call('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'forge-gen' }) })).json();
  for (;;) {
    await new Promise(r => setTimeout(r, 700));
    const h = (await (await call('/history/' + prompt_id)).json())[prompt_id];
    if (!h) continue;
    if (h.status?.status_str === 'error') throw new Error('ComfyUI: ' + JSON.stringify(h.status.messages?.find(m => m[0] === 'execution_error')?.[1] ?? h.status).slice(0, 1500));
    if (!h.status?.completed) continue;
    const out = {};
    for (const [id, o] of Object.entries(h.outputs)) for (const im of o.images || []) {
      const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder, type: im.type });
      (out[id] ||= []).push(Buffer.from(await (await call('/view?' + q)).arrayBuffer()));
    }
    return out;
  }
}

// ---- command line ----
function args(argv) {
  const o = { model: 'z', n: 1, seed: 1 }, words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { words.push(a); continue; }
    const k = a.slice(2);
    if (['full', 'cutout'].includes(k)) { o[k] = true; continue; }
    const v = argv[++i];
    o[k] = ['w', 'h', 'n', 'seed', 'strength'].includes(k) ? Number(v) : v;
  }
  o.prompt = words.join(' ').trim();
  return o;
}
async function main() {
  const o = args(process.argv.slice(2));
  if (!o.prompt) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 16).join('\n')); process.exit(1); }
  const day = new Date().toISOString().slice(0, 10);
  const out = o.out || path.join('art', 'gen', day), name = o.name || 'pic';
  fs.mkdirSync(out, { recursive: true });
  const controlFile = o.control;
  if (o.control) o.control = await upload(o.control);
  for (let k = 0; k < o.n; k++) {
    const seed = o.seed + k, t0 = Date.now();
    const res = await run(workflow({ ...o, seed }));
    const base = path.join(out, `${name}-${o.model}-s${seed}`);
    fs.writeFileSync(base + '.png', res.save[0]);
    if (res.saveCut) fs.writeFileSync(base + '-cut.png', res.saveCut[0]);
    if (res.ctlSave && k === 0) fs.writeFileSync(path.join(out, `${name}-edges.png`), res.ctlSave[0]);
    const { n, out: _o, control, ...keep } = o;
    fs.appendFileSync(path.join(out, 'gen-log.jsonl'), JSON.stringify({ file: path.basename(base) + '.png', ...keep, control: controlFile, seed, secs: +((Date.now() - t0) / 1000).toFixed(1), at: new Date().toISOString() }) + '\n');
    console.log(`${base}.png${res.saveCut ? '  +cut' : ''}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
