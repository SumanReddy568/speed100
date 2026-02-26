const WORKER_URL = "https://your-worker-url.workers.dev";
const USER_ID = "XXX";
const HASH = "YYY";

async function testDownload(sizeMB = 50) {
  const url = `${WORKER_URL}/download?size=${sizeMB}&userId=${USER_ID}&hash=${HASH}`;

  const start = performance.now();
  const response = await fetch(url, { cache: "no-store" });

  const reader = response.body.getReader();
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
  }

  const end = performance.now();
  const duration = (end - start) / 1000;

  return ((totalBytes * 8) / (duration * 1_000_000)).toFixed(2);
}

async function testUpload(sizeMB = 20) {
  const totalBytes = sizeMB * 1024 * 1024;
  const blob = new Blob([new Uint8Array(totalBytes)]);

  const start = performance.now();

  await fetch(`${WORKER_URL}/upload?userId=${USER_ID}&hash=${HASH}`, {
    method: "POST",
    body: blob,
  });

  const end = performance.now();
  const duration = (end - start) / 1000;

  return ((totalBytes * 8) / (duration * 1_000_000)).toFixed(2);
}

document.getElementById("startTest").addEventListener("click", async () => {
  document.getElementById("status").innerText = "Testing download...";
  const download = await testDownload();

  document.getElementById("status").innerText = "Testing upload...";
  const upload = await testUpload();

  document.getElementById("result").innerHTML = `
        Download: ${download} Mbps<br>
        Upload: ${upload} Mbps
    `;
});
