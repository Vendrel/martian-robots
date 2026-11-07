const PROFILE_ORDER = ['high', 'balanced', 'portable'];

function probeWebGl2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function profileForCapabilities({ webgpu, webgl2, hardwareConcurrency }) {
  if (webgpu && hardwareConcurrency >= 8) return 'high';
  if (webgpu || (webgl2 && hardwareConcurrency >= 4)) return 'balanced';
  return 'portable';
}

/**
 * Detect only capabilities that affect rendering policy. Deliberately avoid
 * adapter-info/vendor queries: feature availability is more reliable and does
 * not create a device-fingerprinting dependency.
 */
export async function detectAcceleration() {
  const webgl2 = probeWebGl2();
  const hardwareConcurrency = Math.max(1, Number(navigator.hardwareConcurrency) || 1);
  let webgpu = false;
  let limits = null;

  if (navigator.gpu?.requestAdapter) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        webgpu = true;
        limits = {
          maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        };
      }
    } catch {
      // A WebGPU adapter is optional. The WASM path remains fully functional.
    }
  }

  const profile = profileForCapabilities({ webgpu, webgl2, hardwareConcurrency });
  return Object.freeze({
    profile,
    backend: webgpu ? 'webgpu' : webgl2 ? 'webgl2-wasm' : 'wasm',
    webgpu,
    webgl2,
    wasm: typeof WebAssembly === 'object',
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function' && globalThis.crossOriginIsolated === true,
    hardwareConcurrency,
    limits,
    availableProfiles: PROFILE_ORDER,
  });
}

