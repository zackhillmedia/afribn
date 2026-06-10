function enqueueJob(store, queue, type, payload = {}, options = {}) {
  return store.insert("workerJobs", {
    queue,
    type,
    status: "queued",
    payload,
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    runAfter: options.runAfter || new Date().toISOString(),
    lockedAt: null,
    completedAt: null,
    failedAt: null,
    error: null,
    result: null
  });
}

function claimNextJob(store, queue) {
  const now = new Date().toISOString();
  const job = store
    .list("workerJobs", (item) => item.queue === queue && item.status === "queued" && item.runAfter <= now)
    .sort((a, b) => String(a.runAfter).localeCompare(String(b.runAfter)))[0];
  if (!job) return null;
  return store.update("workerJobs", job.id, {
    status: "running",
    attempts: Number(job.attempts || 0) + 1,
    lockedAt: now
  });
}

async function processQueue(store, queue, handlers, options = {}) {
  const results = [];
  const limit = options.limit || 10;
  for (let i = 0; i < limit; i += 1) {
    const job = claimNextJob(store, queue);
    if (!job) break;
    const handler = handlers[job.type];
    if (!handler) {
      results.push(failOrRetry(store, job, new Error(`No handler for ${job.type}`)));
      continue;
    }
    try {
      const result = await handler(job.payload, job);
      results.push(store.update("workerJobs", job.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result
      }));
    } catch (error) {
      results.push(failOrRetry(store, job, error));
    }
  }
  return results;
}

function failOrRetry(store, job, error) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || 3);
  if (attempts >= maxAttempts) {
    return store.update("workerJobs", job.id, {
      status: "failed",
      failedAt: new Date().toISOString(),
      error: error.message
    });
  }
  const delayMs = Math.min(60_000, 1000 * 2 ** attempts);
  return store.update("workerJobs", job.id, {
    status: "queued",
    runAfter: new Date(Date.now() + delayMs).toISOString(),
    error: error.message
  });
}

module.exports = { enqueueJob, processQueue, claimNextJob };
