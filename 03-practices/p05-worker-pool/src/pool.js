const { Worker } = require('worker_threads');
const path = require('path');

class WorkerPool {
  constructor(size = 4) {
    this.size = size;
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = 0;
    this.workersReady = 0;
    this.workerMap = new Map();
    this.isShuttingDown = false;

    this.init();
  }

  init() {
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(path.join(__dirname, 'worker.js'));
      this.workers.push(worker);
      this.workerMap.set(worker, { id: i, busy: false });

      worker.on('message', (message) => {
        this.handleMessage(worker, message);
      });

      worker.on('error', (error) => {
        console.error(`Worker error:`, error);
        this.handleWorkerError(worker, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker exited with code ${code}`);
        }
      });
    }
  }

  handleMessage(worker, message) {
    const { type, taskId, result, error } = message;
    const workerInfo = this.workerMap.get(worker);
    
    if (type === 'ready') {
      this.workersReady++;
    } else if (type === 'result') {
      const pending = this.pendingTasks.get(taskId);
      if (pending) {
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
        this.pendingTasks.delete(taskId);
      }
      workerInfo.busy = false;
      this.activeWorkers--;
      this.processNextTask(worker);
    }
  }

  handleWorkerError(worker, error) {
    const workerInfo = this.workerMap.get(worker);
    workerInfo.busy = false;
    this.activeWorkers--;
    
    // Restart the worker
    const index = this.workers.indexOf(worker);
    const newWorker = new Worker(path.join(__dirname, 'worker.js'));
    this.workers[index] = newWorker;
    this.workerMap.set(newWorker, { id: workerInfo.id, busy: false });
  }

  processNextTask(assignToWorker = null) {
    if (this.taskQueue.length === 0) return;

    const worker = assignToWorker || this.workers.find(w => {
      const info = this.workerMap.get(w);
      return !info.busy;
    });

    if (!worker) return;

    const workerInfo = this.workerMap.get(worker);
    const task = this.taskQueue.shift();
    
    workerInfo.busy = true;
    this.activeWorkers++;
    
    worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data
    });
  }

  pendingTasks = new Map();
  taskIdCounter = 0;

  runTask(task) {
    return new Promise((resolve, reject) => {
      if (this.isShuttingDown) {
        reject(new Error('Pool is shutting down'));
        return;
      }

      const taskId = ++this.taskIdCounter;
      this.pendingTasks.set(taskId, { resolve, reject });
      
      this.taskQueue.push({
        id: taskId,
        type: task.type,
        data: task.data
      });

      this.processNextTask();
    });
  }

  async runTasks(tasks) {
    return Promise.all(tasks.map(task => this.runTask(task)));
  }

  async shutdown() {
    this.isShuttingDown = true;
    
    // Wait for pending tasks
    while (this.pendingTasks.size > 0 || this.activeWorkers > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Terminate all workers
    await Promise.all(
      this.workers.map(worker => worker.terminate())
    );
    
    this.workers = [];
    this.workerMap.clear();
  }

  getStats() {
    return {
      total: this.size,
      active: this.activeWorkers,
      queued: this.taskQueue.length,
      ready: this.workersReady
    };
  }
}

module.exports = { WorkerPool };
