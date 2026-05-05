import { sleep, get_random_int } from './util';
import logger from './logger';

export interface Itask {
	id: string;
	name: string;
	nextRun: number; // timestamp in seconds
	priority?: number; // 0 = high priority (runs first, no inter-task delay), 1 = normal (default)
	run: () => Promise<number | null>; // returns next delay in seconds or null if finished
}

class SchedulerService {
	private tasks: Map<string, Itask> = new Map();
	private isRunning: boolean = false;
	private minDelayBetweenTasks: number = 2; // minimum seconds between normal tasks
	private startup_until: number = 0;        // timestamp until which startup stagger is active
	private next_startup_slot: number = 0;    // next available slot for staggered startup tasks

	/**
	 * schedules or updates a task.
	 * @param task the task to schedule
	 * @param withJitter if true, adds a small random jitter to the execution time
	 */
	public schedule_task(task: Itask, withJitter: boolean = true): void {
		const now = Math.floor(Date.now() / 1000);
		const is_high_priority = (task.priority ?? 1) === 0;
		const is_new_task = !this.tasks.has(task.id);
		const is_startup = now < this.startup_until;

		if (withJitter && !is_high_priority) {
			task.nextRun += get_random_int(1, 10);
		}

		// stagger new normal tasks that would run immediately during the startup phase,
		// so all features don't fire in the same few seconds after bot launch.
		// is_new_task prevents this from applying to normal short-delay reschedules.
		if (is_startup && is_new_task && !is_high_priority && task.nextRun <= now + 30) {
			const slot = Math.max(task.nextRun, this.next_startup_slot);
			task.nextRun = slot + get_random_int(15, 30);
			this.next_startup_slot = task.nextRun;
		}

		this.tasks.set(task.id, task);
		logger.debug(`task [${task.name}] scheduled for ${new Date(task.nextRun * 1000).toLocaleTimeString()}`, 'scheduler');
	}

	public remove_task(taskId: string): void {
		if (this.tasks.has(taskId)) {
			this.tasks.delete(taskId);
		}
	}

	public async start(): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		this.startup_until = Math.floor(Date.now() / 1000) + 600; // 10-minute startup window
		this.next_startup_slot = Math.floor(Date.now() / 1000);
		logger.info('task scheduler started', 'scheduler');

		while (this.isRunning) {
			const now = Math.floor(Date.now() / 1000);
			const dueTasks = Array.from(this.tasks.values())
				.filter(t => t.nextRun <= now)
				.sort((a, b) => {
					// high-priority tasks always run first, then sort by scheduled time
					const pa = a.priority ?? 1;
					const pb = b.priority ?? 1;
					if (pa !== pb) return pa - pb;
					return a.nextRun - b.nextRun;
				});

			if (dueTasks.length > 0) {
				const task = dueTasks[0];
				const is_high_priority = (task.priority ?? 1) === 0;

				try {
					logger.debug(`executing task [${task.name}]`, 'scheduler');
					const nextDelay = await task.run();

					// If the task was removed from the map during execution, don't re-add it
					if (!this.tasks.has(task.id)) {
						logger.debug(`task [${task.name}] was removed during execution, skipping return handling`, 'scheduler');
						continue;
					}

					if (nextDelay !== null) {
						task.nextRun = Math.floor(Date.now() / 1000) + nextDelay;
						this.schedule_task(task, true);
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
					this.schedule_task(task, false);
				}

				// high-priority tasks don't add inter-task delay so the next task runs immediately
				if (!is_high_priority) {
					await sleep(this.minDelayBetweenTasks);
				}
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

export default new SchedulerService();
