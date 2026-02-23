import { sleep, get_random_int } from './util';
import logger from './logger';

export interface ITask {
	id: string;
	name: string;
	nextRun: number; // timestamp in seconds
	run: () => Promise<number | null>; // returns next delay in seconds or null if finished
}

class Scheduler {
	private tasks: Map<string, ITask> = new Map();
	private isRunning: boolean = false;
	private minDelayBetweenTasks: number = 2; // minimum seconds between any two tasks to avoid bursts

	/**
	 * Schedules or updates a task.
	 * @param task The task to schedule
	 * @param withJitter If true, adds a random jitter to the execution time
	 */
	public scheduleTask(task: ITask, withJitter: boolean = true): void {
		if (withJitter) {
			const jitter = get_random_int(1, 10); // add 1-10 seconds of jitter
			task.nextRun += jitter;
		}

		this.tasks.set(task.id, task);
		logger.debug(`task [${task.name}] scheduled for ${new Date(task.nextRun * 1000).toLocaleTimeString()}`, 'scheduler');
	}

	public removeTask(taskId: string): void {
		if (this.tasks.has(taskId)) {
			this.tasks.delete(taskId);
		}
	}

	public async start(): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		logger.info('task scheduler started', 'scheduler');

		while (this.isRunning) {
			const now = Math.floor(Date.now() / 1000);
			const dueTasks = Array.from(this.tasks.values())
				.filter(t => t.nextRun <= now)
				.sort((a, b) => a.nextRun - b.nextRun);

			if (dueTasks.length > 0) {
				const task = dueTasks[0];

				try {
					logger.debug(`executing task: [${task.name}]`, 'scheduler');
					const nextDelay = await task.run();

					// If the task was removed from the map during execution, don't re-add it
					if (!this.tasks.has(task.id)) {
						logger.debug(`task [${task.name}] was removed during execution, skipping return handling`, 'scheduler');
						continue;
					}

					if (nextDelay !== null) {
						task.nextRun = Math.floor(Date.now() / 1000) + nextDelay;
						this.scheduleTask(task, true);
					} else {
						this.tasks.delete(task.id);
						logger.info(`task [${task.name}] completed and removed`, 'scheduler');
					}
				} catch (error: any) {
					logger.error(`error executing task [${task.name}]: ${error.message}`, 'scheduler');
					if (error.stack) {
						logger.debug(error.stack, 'scheduler');
					}

					// Retry after 1 minute on error
					task.nextRun = Math.floor(Date.now() / 1000) + 60;
					this.scheduleTask(task, false);
				}

				// Enforce minimum delay between tasks to avoid bursts
				await sleep(this.minDelayBetweenTasks);
			} else {
				// No tasks due, wait a bit
				await sleep(1);
			}
		}
	}

	public stop(): void {
		this.isRunning = false;
		logger.info('task scheduler stopped', 'scheduler');
	}
}

export default new Scheduler();
