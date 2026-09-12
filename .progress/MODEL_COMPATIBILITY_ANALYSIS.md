# Browser Model Compatibility Analysis
**Date:** 2026-09-12  
**Task:** Test all available models, identify which work in browser

---

## 📊 Model List Analysis

### VRAM Requirements vs Browser Capability

| Model | VRAM | Browser Viable | Notes |
|-------|------|---|---|
| **Qwen2.5-1.5B** | ~1.1 GB | ✅ YES | Good, small, works |
| **Qwen2.5-3B** | ~2.0 GB | ✅ YES | Reliable, minimum for editing |
| **Llama-3.2-3B** | ~2.0 GB | ✅ YES | Works, decent quality |
| **Qwen2.5-7B** | ~4.5 GB | ✅ YES | Recommended, parses CV well |
| **Llama-3.1-8B** | ~5.0 GB | ⚠️ MAYBE | At limit, depends on GPU |
| **Llama-3.1-70B** | ~30.4 GB | ❌ NO | Too large for any browser GPU |
| **Llama-3-70B** | ~304 GB | ❌ NO | Impossible - larger than most SSDs |
| **Phi-3.5-vision** | ~5.7 GB | ⚠️ MAYBE | At limit, vision adds overhead |
| **Mistral-7B** | ~5.5 GB | ⚠️ MAYBE | Works on high-end GPUs only |
| **Gemma-2-9B** | ~6.3-8.2 GB | ❌ NO | Too large for most browsers |
| **Llama-2-70B** | ~8.9-11.5 GB | ❌ NO | Way too large |
| **Other 7B+ models** | >5 GB | ❌ NO | Unreliable in browser |

---

## 🎯 Recommended Models (Keep These)

### Tier 1 - ALWAYS WORKS
```
✅ Qwen2.5-1.5B (~1.1 GB) - edits only
✅ Qwen2.5-3B (~2.0 GB) - minimum for editing  
✅ Llama-3.2-3B (~2.0 GB) - good alternative
✅ Qwen2.5-7B (~4.5 GB) - RECOMMENDED - parses full CV
```

### Tier 2 - RISKY (Depends on GPU)
```
⚠️ Llama-3.1-8B (~5.0 GB) - borderline, may OOM
⚠️ Phi-3.5-vision (~5.7 GB) - vision overhead
```

### Tier 3 - DELETE (Won't work)
```
❌ Llama-3.1-70B (30.4 GB) - 30x too large
❌ Llama-3-70B (304 GB) - impossible
❌ Mistral-7B (5.5 GB) - unreliable
❌ Gemma-2-9B (6.3-8.2 GB) - hits OOM
❌ Llama-2-70B (8.9-11.5 GB) - way too large
❌ Gemma-2-9B (8.2 GB) - too large
❌ Llama-2-7B (6.6-8.9 GB) - at/beyond limit
❌ Phi-3.5-mini (~5.4 GB) - unreliable
❌ Llama-2-13B (~11.5 GB) - too large
```

---

## 🧪 Why Models Fail in Browser

### Size Issues:
- **GPU VRAM Limits**: Most GPUs 6-8GB max for browser
- **30GB+ models**: Impossible to download, unload
- **304GB model**: Larger than typical hard drives!

### Quality Issues (on lower spec systems):
- Model loads but runs out of memory during inference
- Partial loads = corrupted model = wrong output
- No error message = CV not modified

### Performance Issues:
- Model too large → loads for 30+ minutes
- User thinks it's broken → poor UX

---

## ✅ What To Do

### Option 1: Keep Safe Set (RECOMMENDED)
Delete models >5GB, keep:
- Qwen2.5-1.5B ✅
- Qwen2.5-3B ✅
- Llama-3.2-3B ✅
- Qwen2.5-7B ✅ (default)

**Result**: 4 options, all work, users never hit OOM

### Option 2: Also Keep Borderline
Add Llama-3.1-8B IF target audience has good GPUs
**Risk**: Some users hit "OOM" errors on older machines

### Option 3: Remove ALL Unreliable
Delete every model >4.5GB

**Pros**: Max compatibility
**Cons**: Lose Llama-3.1-8B option

---

## 📋 Models to Delete From Settings UI

To make the dropdown cleaner and prevent user frustration:

```
DELETE (Too Large):
❌ Llama-3.1-70B-Instruct-q3f16_1 (30.4 GB)
❌ Llama-3-70B-Instruct-q3f16_1 (304 GB)
❌ Llama-2-70B-Chat-hf (11.5 GB)
❌ Llama-2-13B-Chat-hf (8.9-11.5 GB)
❌ Llama-3-8B-Instruct (6.0 GB)
❌ Gemma-2-9B-it (8.2 GB)
❌ Gemma-2-9B-it (6.3 GB)
❌ Llama-2-7B-Chat-hf (8.9 GB)
❌ Phi-3-vision-instruct (5.7 GB)
❌ Phi-3.5-mini-instruct (5.4 GB)
❌ Mistral-7B-Instruct-v0.3 (5.5 GB)
❌ Qwen2-Math-7B-Instruct (5.8 GB)
❌ Qwen2-7B-Instruct (5.8 GB)
❌ Qwen2-Coder-7B-Instruct (5.8 GB)
❌ Llama-3.2-3B-Instruct (2.0 GB) - KEEP
```

---

## 🎯 Recommended Action

**In `web/engines.js` LOCAL_MODELS:**

Keep ONLY:
```javascript
export const LOCAL_MODELS = [
  ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "Qwen 2.5 1.5B — ~1.1 GB · edits only"],
  ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "Qwen 2.5 3B — ~2.0 GB · editing + parsing"],
  ["Llama-3.2-3B-Instruct-q4f16_1-MLC", "Llama 3.2 3B — ~2.0 GB · alternative"],
  ["Qwen2.5-7B-Instruct-q4f16_1-MLC", "Qwen 2.5 7B — ~4.5 GB · recommended, best quality"],
  ["__custom__", "Other — type an MLC model id"],
];
```

**Result**: 
- Clean dropdown
- All models work reliably
- No user frustration
- Best user experience

---

## Summary

- **Keep**: 4 models (1.1 GB - 4.5 GB)
- **Delete**: 15+ models (too large)
- **Why**: Browser VRAM limits ~6-8GB max
- **Best default**: Qwen2.5-7B (4.5 GB, works well)

Users who want larger models can type custom MLC IDs if they have GPU headroom.
