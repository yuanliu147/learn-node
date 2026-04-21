const { parentPort, workerData } = require('worker_threads');
const { taskHandlers } = require('./tasks');

// Signal that worker is ready
parentPort.postMessage({ type: 'ready' });

parentPort.on('message', async ({ taskId, type, data }) => {
  try {
    const handler = taskHandlers[type];
    
    if (!handler) {
      throw new Error(`Unknown task type: ${type}`);
    }

    const result = await handler(data);
    
    parentPort.postMessage({
      type: 'result',
      taskId,
      result
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'result',
      taskId,
      error: error.message
    });
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  parentPort.postMessage({
    type: 'result',
    taskId: workerData?.taskId || 'unknown',
    error: error.message
  });
});
