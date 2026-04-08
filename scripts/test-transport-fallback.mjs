process.env.AGENTISFY_FORCE_DEMO_FALLBACK = "true";

const { fetchManifest, isAutoDemoFallbackEnabled } = await import("../src/lib/api.ts");

if (!isAutoDemoFallbackEnabled()) {
  console.error("Expected auto demo fallback to be enabled for this transport test.");
  process.exit(1);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Failed to fetch");
};

try {
  const manifest = await fetchManifest("inv_transport_test");
  if (!manifest || manifest.schemaVersion !== "1.0") {
    console.error("Fallback manifest did not return expected schemaVersion 1.0.");
    process.exit(1);
  }
  console.log("Transport fallback test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
